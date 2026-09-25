import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GOOGLE_ACCESS_TOKEN_REFRESH_AFTER_MS, isGoogleAccessTokenFresh } from '../src/utils/googleAuthSession';

const now = 2_000_000_000_000;

assert.equal(isGoogleAccessTokenFresh('token', now - 1_000, now), true);
assert.equal(
  isGoogleAccessTokenFresh('token', now - GOOGLE_ACCESS_TOKEN_REFRESH_AFTER_MS, now),
  false,
  'O helper deve classificar como antigo um token que atingiu 45 minutos; isso não dispara OAuth no fluxo clínico.'
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
assert.doesNotMatch(shareTargetSource, /hasFreshClinicalAccess|isGoogleAccessTokenFresh/, 'Áudio compartilhado não pode bloquear a tentativa pelo TTL local.');
assert.match(shareTargetSource, /isGoogleAuthenticationError\(error\)[\s\S]*setGoogleAuthorizationStatus\('token_expired'\)[\s\S]*setGoogleAccessToken\(null\)/, 'Falha real no áudio compartilhado deve preparar reconexão explícita.');

const appSource = fs.readFileSync('src/App.tsx', 'utf8');
assert.doesNotMatch(
  appSource,
  /requestGoogleOAuth|prompt:\s*['"]none['"]|shouldSilentlyRefreshGoogle/,
  'A restauração da sessão não pode abrir um novo fluxo OAuth do Google ao iniciar o app.'
);

const googleAuthSource = fs.readFileSync('src/services/googleAuth.ts', 'utf8');
assert.match(googleAuthSource, /googleOAuthLaunch/, 'Chamadas simultâneas devem compartilhar o mesmo lançamento OAuth.');
assert.doesNotMatch(googleAuthSource, /SILENT_GOOGLE_ATTEMPT_KEY|prompt:\s*['"]none['"]/, 'O serviço não deve iniciar OAuth silencioso ou criar um loop de redirects.');
assert.match(googleAuthSource, /if \(accessToken && hasGoogleScopes\(currentGrantedScopes, required\)\) \{[\s\S]*return \{ status: 'ready' \}/, 'Token com escopos corretos deve permitir a operação independentemente do TTL local.');
assert.doesNotMatch(googleAuthSource, /isGoogleAccessTokenFresh/, 'A idade local do token não pode bloquear uma operação clínica.');
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
  /const canUpload = hasYearlyAccess && Boolean\(targetFolderId\) && hasClinicalAccess/,
  'O card de arquivos deve permitir a tentativa com token e escopos conhecidos, sem depender do TTL local.'
);
assert.doesNotMatch(patientFilesSource, /ensureGoogleAccess|canAttemptSilentGoogleOAuth|silentAuthorizationAttemptedRef|isGoogleAccessTokenFresh/, 'Montar o card não pode iniciar nem bloquear OAuth pelo TTL.');
assert.match(
  patientFilesSource,
  /const shouldRequestConsent = googleAuthorizationStatus === 'unknown'[\s\S]*googleAuthorizationStatus === 'missing_scopes'[\s\S]*shouldRequestConsent \? \{ prompt: 'consent' as const \} : \{\}/,
  'A primeira autorização e escopos ausentes podem pedir consentimento explícito.'
);
const consentDecisionStart = patientFilesSource.indexOf('const shouldRequestConsent =');
const consentDecisionEnd = patientFilesSource.indexOf('const { error } = await requestGoogleOAuth', consentDecisionStart);
const consentDecisionSource = patientFilesSource.slice(consentDecisionStart, consentDecisionEnd);
assert.doesNotMatch(
  consentDecisionSource,
  /token_expired/,
  'A reconexão por expiração não deve forçar consentimento.'
);
assert.match(
  patientDetailSource,
  /storeEvolutionEditAuthRecovery\(recovery\)[\s\S]*setGoogleAuthorizationStatus\('token_expired'\)[\s\S]*setGoogleAccessToken\(null\)/,
  'A edição deve ser preservada e marcada para reconexão explícita após falha real.'
);
assert.match(
  patientDetailSource,
  /isGoogleAuthenticationError\(syncError\)[\s\S]*reconnectGoogleAndResumeEvolutionEdit/,
  'Um 401 do Google Docs deve preservar a edição e preparar a reconexão explícita.'
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
const patientDetailOAuthOccurrences = [...patientDetailSource.matchAll(/requestGoogleOAuth\(/g)];
assert.equal(
  patientDetailOAuthOccurrences.length,
  1,
  'PatientDetail deve iniciar OAuth somente no handler explícito de reconexão.'
);
const explicitReconnectStart = patientDetailSource.indexOf('const handleExplicitGoogleReconnect');
const explicitReconnectEnd = patientDetailSource.indexOf('// Estados para as configurações de lembretes', explicitReconnectStart);
assert.ok(
  explicitReconnectStart >= 0 && explicitReconnectEnd > explicitReconnectStart,
  'O handler explícito de reconexão deve permanecer presente.'
);
assert.ok(
  patientDetailOAuthOccurrences[0].index! > explicitReconnectStart
    && patientDetailOAuthOccurrences[0].index! < explicitReconnectEnd,
  'A única chamada OAuth deve estar dentro do handler explícito de reconexão.'
);
assert.match(
  patientDetailSource,
  /GoogleReconnectPrompt[\s\S]*handleExplicitGoogleReconnect\(\)/,
  'O prompt deve iniciar a reconexão somente pela confirmação explícita do usuário.'
);
assert.match(
  patientDetailSource,
  /markGoogleAccessRecoveryNeeded\(\)[\s\S]*return;/,
  'Handlers sem acesso ao Google devem preparar o estado e retornar sem iniciar OAuth.'
);
assert.match(
  patientDetailSource,
  /if \(googleAuthorizationStatus === 'missing_scopes'\) return;[\s\S]*setGoogleAuthorizationStatus\('token_expired'\)/,
  'A expiração deve preparar token_expired sem substituir um estado de escopos ausentes.'
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
assert.match(newEvolutionSource, /googleAuthorizationStatus === 'token_expired'/, 'Token expirado deve usar a UX curta de reconexão.');
assert.match(newEvolutionSource, /GooglePermissionRecoveryModal/, 'Escopos ausentes devem permanecer no fluxo específico de permissões.');
assert.match(appSource, /setGoogleAccessToken\(session\.provider_token\);[\s\S]*setGoogleAccessUserId\(session\.user\.id\);/, 'Um provider token igual também deve atualizar o issuedAt sem iniciar OAuth.');

console.log('Google authentication recovery tests passed.');
