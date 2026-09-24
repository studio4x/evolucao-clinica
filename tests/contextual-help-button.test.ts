import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const cssSource = readFileSync('src/index.css', 'utf8');
const featureButtonSource = readFileSync('src/components/common/FeatureGuideButton.tsx', 'utf8');
const panelHeaderSource = readFileSync('src/components/layout/PanelPageHeader.tsx', 'utf8');

// 1. Validar regra CSS do botão flutuante mobile
assert.match(cssSource, /\.app-floating-help-mobile\s*\{/, 'Regra CSS .app-floating-help-mobile deve existir');
assert.match(cssSource, /position:\s*fixed;/, 'Deve utilizar posicionamento fixed no mobile');
assert.match(cssSource, /left:\s*max\(1rem,\s*var\(--app-safe-area-left\)\);/, 'Deve ter margem à esquerda e respeitar safe area');
assert.match(cssSource, /bottom:\s*calc\(4\.5rem\s*\+\s*var\(--app-safe-area-bottom\)\);/, 'Deve ficar posicionado acima da barra inferior de navegação e respeitar safe area');
assert.match(cssSource, /z-index:\s*40;/, 'z-index deve ser 40 (acima dos cards, abaixo do menu z-100 e modais z-50+)');

// 2. Validar componente FeatureGuideButton
assert.match(featureButtonSource, /app-floating-help-mobile/, 'FeatureGuideButton deve usar a classe flutuante mobile');
assert.match(featureButtonSource, /md:static/, 'FeatureGuideButton deve resetar para posicionamento estático em telas desktop (md)');
assert.match(featureButtonSource, /HelpCircle/, 'Ícone de ajuda ? deve ser preservado');
assert.match(featureButtonSource, /title="Como funciona"/, 'Atributo title deve ser mantido');
assert.match(featureButtonSource, /aria-expanded/, 'Atributos de acessibilidade devem ser mantidos');

// 3. Validar PanelPageHeader breakpoint md:inline-flex
assert.match(panelHeaderSource, /md:inline-flex/, 'PanelPageHeader deve alinhar o breakpoint desktop com md (768px)');

// 4. Validar páginas compartilhadas que usam a ajuda contextual
const pagesToTest = [
  { file: 'src/pages/AboutApp.tsx', name: 'Sobre o app' },
  { file: 'src/pages/BackupExport.tsx', name: 'BackupExport' },
  { file: 'src/pages/CommunicationPreferences.tsx', name: 'CommunicationPreferences' },
  { file: 'src/pages/CustomLogo.tsx', name: 'CustomLogo' },
  { file: 'src/pages/Dashboard.tsx', name: 'Dashboard' },
  { file: 'src/pages/History.tsx', name: 'History' },
  { file: 'src/pages/Migration.tsx', name: 'Migration' },
  { file: 'src/pages/NewEvolution.tsx', name: 'NewEvolution' },
  { file: 'src/pages/Notifications.tsx', name: 'Notifications' },
  { file: 'src/pages/PatientAnamnesis.tsx', name: 'PatientAnamnesis' },
  { file: 'src/pages/PatientDetail.tsx', name: 'PatientDetail' },
  { file: 'src/pages/PatientForm.tsx', name: 'PatientForm' },
  { file: 'src/pages/PatientSessions.tsx', name: 'PatientSessions' },
  { file: 'src/pages/Patients.tsx', name: 'Patients' },
  { file: 'src/pages/Profile.tsx', name: 'Profile' },
  { file: 'src/pages/ShareTarget.tsx', name: 'ShareTarget' },
  { file: 'src/pages/Subscription.tsx', name: 'Subscription' },
];

for (const { file, name } of pagesToTest) {
  const pageSource = readFileSync(file, 'utf8');
  assert.match(
    pageSource,
    /FeatureGuideButton/,
    `Página ${name} deve utilizar o componente compartilhado FeatureGuideButton`
  );
}

console.log('✅ Todos os testes de posicionamento do botão de ajuda contextual passaram!');
