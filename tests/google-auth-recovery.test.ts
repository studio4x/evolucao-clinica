import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GOOGLE_ACCESS_TOKEN_REFRESH_AFTER_MS, isGoogleAccessTokenFresh } from '../src/utils/googleAuthSession';

const now = 2_000_000_000_000;

assert.equal(isGoogleAccessTokenFresh('token', now - 1_000, now), true);
assert.equal(
  isGoogleAccessTokenFresh('token', now - GOOGLE_ACCESS_TOKEN_REFRESH_AFTER_MS, now),
  false,
  'O token deve ser renovado preventivamente ao atingir 45 minutos.'
);
assert.equal(isGoogleAccessTokenFresh(null, now, now), false);
assert.equal(isGoogleAccessTokenFresh('token', null, now), false);

const launcherSource = fs.readFileSync(
  'app/src/main/java/com/evolucaoclinica/app/LauncherActivity.java',
  'utf8'
);
const resolverStart = launcherSource.indexOf('private String resolveLaunchUrl(Intent intent)');
const resolverEnd = launcherSource.indexOf('private boolean isNativeOAuthCallback', resolverStart);
const resolverSource = launcherSource.slice(resolverStart, resolverEnd);

assert.ok(resolverStart >= 0, 'O Android deve centralizar a resolução da URL de abertura.');
assert.ok(
  resolverSource.indexOf('isNativeOAuthCallback(uri)') < resolverSource.indexOf('hasSharedFile()'),
  'O callback OAuth deve ter prioridade sobre a reabertura do áudio compartilhado.'
);
assert.doesNotMatch(
  launcherSource,
  /hasSharedFile\(\) \? shareTargetUrl\(\) : notificationUrl/,
  'Nenhuma abertura pode voltar a descartar o callback OAuth por causa do áudio compartilhado.'
);

const shareTargetSource = fs.readFileSync('src/pages/ShareTarget.tsx', 'utf8');
assert.match(
  shareTargetSource,
  /status === 'error' && !needsGoogleReconnect/,
  'A tela não pode renderizar o erro genérico junto com o aviso único de reconexão.'
);
assert.match(
  shareTargetSource,
  /validateGoogleDocAccess\(googleAccessToken, patient\.google_doc_id\)/,
  'O acesso ao Google Docs deve ser validado antes do processamento clínico.'
);

const appSource = fs.readFileSync('src/App.tsx', 'utf8');
assert.doesNotMatch(
  appSource,
  /requestGoogleOAuth|prompt:\s*['"]none['"]|shouldSilentlyRefreshGoogle/,
  'A restauração da sessão não pode abrir um novo fluxo OAuth do Google ao iniciar o app.'
);

const googleAuthSource = fs.readFileSync('src/services/googleAuth.ts', 'utf8');
assert.match(googleAuthSource, /googleOAuthLaunch/, 'Chamadas simultâneas devem compartilhar o mesmo lançamento OAuth.');
assert.match(googleAuthSource, /SILENT_GOOGLE_ATTEMPT_KEY/, 'A tentativa silenciosa deve ter proteção contra loops.');
assert.match(googleAuthSource, /isGoogleAccessTokenFresh[\s\S]*return \{ status: 'ready' \}/, 'Token recente com escopos corretos deve continuar sem OAuth.');
assert.doesNotMatch(
  googleAuthSource,
  /isExpandingScopes[\s\S]*resolvedPrompt = prompt \?\? .*consent/,
  'Escopo novo não deve forçar consentimento em toda reconexão clínica.'
);

const supabaseClientSource = fs.readFileSync('src/supabaseClient.ts', 'utf8');
assert.match(
  supabaseClientSource,
  /persistSession:\s*true[\s\S]*autoRefreshToken:\s*true/,
  'A sessão principal deve continuar persistida e renovada entre aberturas do aplicativo.'
);

const patientDetailSource = fs.readFileSync('src/pages/PatientDetail.tsx', 'utf8');
const newEvolutionSource = fs.readFileSync('src/pages/NewEvolution.tsx', 'utf8');
const patientFilesSource = fs.readFileSync('src/components/patients/PatientFilesCard.tsx', 'utf8');
assert.match(
  patientFilesSource,
  /hasClinicalAccess[\s\S]*hasFreshClinicalAccess[\s\S]*ensureGoogleAccess[\s\S]*requiredScopes:\s*'clinicalDocs'/,
  'O card de arquivos deve tentar renovar silenciosamente o acesso Google expirado.'
);
assert.match(
  patientDetailSource,
  /storeEvolutionEditAuthRecovery\(recovery\)[\s\S]*ensureGoogleAccess\([\s\S]*requiredScopes:\s*'clinicalDocs'/,
  'A edição deve ser preservada antes de renovar o token Google expirado.'
);
assert.match(
  patientDetailSource,
  /hasFreshClinicalAccess[\s\S]*reconnectGoogleAndResumeEvolutionEdit/,
  'O salvamento deve renovar preventivamente um token Google antigo.'
);
assert.match(
  patientDetailSource,
  /isGoogleAuthenticationError\(syncError\)[\s\S]*reconnectGoogleAndResumeEvolutionEdit/,
  'Um 401 do Google Docs deve iniciar a reconexão automática.'
);
assert.match(
  patientDetailSource,
  /handleSaveEditedEvolution\(recovery\.evolutionId, recovery\)/,
  'O retorno do OAuth deve retomar automaticamente o salvamento preservado.'
);
assert.match(
  patientDetailSource,
  /setActiveMobileTab\(recovery\.activeMobileTab\)/,
  'A reconexão deve restaurar a aba móvel em que o usuário estava.'
);
assert.doesNotMatch(
  patientDetailSource,
  /alert\("Erro ao salvar alterações: " \+ \(error\.message \|\| error\)\);\s*}\s*finally/,
  'O erro de autenticação do Google não deve cair diretamente no alerta técnico bruto.'
);
assert.match(
  newEvolutionSource,
  /supabase\.auth\.getSession\(\)[\s\S]*providerToken = data\.session\?\.provider_token[\s\S]*setGoogleAccessToken/,
  'A nova evolução deve reutilizar o provider token já disponível na sessão antes de pedir nova autorização.'
);
assert.match(
  newEvolutionSource,
  /if \(!isAuthReady \|\| embedded \|\| isOnboardingMode/,
  'A evolução embutida no Controle de Sessões não deve abrir reconexão automaticamente ao ser acessada.'
);

console.log('Google authentication recovery tests passed.');
