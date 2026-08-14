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
assert.match(
  appSource,
  /const hasNewProviderToken = Boolean\(/,
  'Um token recém-retornado pelo OAuth deve ser distinguido do token antigo persistido.'
);
assert.match(
  appSource,
  /!hasNewProviderToken\s*&&\s*!isGoogleAccessTokenFresh/,
  'A presença de um provider_token antigo não pode impedir a renovação silenciosa.'
);

const patientDetailSource = fs.readFileSync('src/pages/PatientDetail.tsx', 'utf8');
assert.match(
  patientDetailSource,
  /storeEvolutionEditAuthRecovery\(recovery\)[\s\S]*setGoogleAccessToken\(null\)[\s\S]*requestGoogleOAuth\(/,
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

console.log('Google authentication recovery tests passed.');
