from pathlib import Path
import base64
import zlib


def decode(payload: str) -> str:
    return zlib.decompress(base64.b64decode(payload)).decode('utf-8')


def read_payload(*names: str) -> str:
    base = Path('.github/payloads')
    return ''.join((base / name).read_text(encoding='utf-8').strip() for name in names)


tsx_payload = read_payload(
    'campaign_dashboard_tsx_01.z64',
    'campaign_dashboard_tsx_02.z64',
    'campaign_dashboard_tsx_03.z64',
    'campaign_dashboard_tsx_04.z64',
)
api_payload = read_payload('campaign_dashboard_api.z64')

Path('src/pages/AdminCampaignDashboard.tsx').write_text(decode(tsx_payload), encoding='utf-8')
Path('api/campaign-dashboard.ts').write_text(decode(api_payload), encoding='utf-8')

agents_path = Path('AGENTS.md')
agents = agents_path.read_text(encoding='utf-8')
rule = "- O dashboard de captação por rodada deve seguir obrigatoriamente [`archicteture/CAPTACAO_DASHBOARD_PADRAO.md`](archicteture/CAPTACAO_DASHBOARD_PADRAO.md); novas rodadas adicionam dados ao componente padronizado e não criam layouts próprios.\n"
if rule not in agents:
    marker = "## Execução\n"
    if marker not in agents:
        raise SystemExit('AGENTS marker not found')
    agents = agents.replace(marker, rule + "\n" + marker, 1)
    agents_path.write_text(agents, encoding='utf-8')

version_path = Path('src/components/layout/AppVersion.tsx')
version = version_path.read_text(encoding='utf-8')
if 'APP_VERSION = "v1.10.844"' in version:
    version = version.replace('APP_VERSION = "v1.10.844"', 'APP_VERSION = "v1.10.845"', 1)
elif 'APP_VERSION = "v1.10.845"' not in version:
    raise SystemExit('Unexpected APP_VERSION')
version_path.write_text(version, encoding='utf-8')

checks = {
    'src/pages/AdminCampaignDashboard.tsx': [
        'type RoundNumber = 1 | 2 | 3 | 4 | 5;',
        'function StandardRoundDashboard',
        'Financeiro — Rodada',
        'Rodada 5',
        'Métricas padronizadas',
    ],
    'api/campaign-dashboard.ts': [
        'recoverableLegacyRound1',
        'normalizeDashboardBody',
        'MULTIPLOS_TEMPLATES_HISTORICOS',
        'data_warning',
    ],
    'archicteture/CAPTACAO_DASHBOARD_PADRAO.md': [
        'Uma nova rodada adiciona dados; não adiciona um novo layout.',
        'Contrato de dados obrigatório',
    ],
    'AGENTS.md': [
        'CAPTACAO_DASHBOARD_PADRAO.md',
    ],
    'src/components/layout/AppVersion.tsx': [
        'APP_VERSION = "v1.10.845"',
    ],
}

for path, tokens in checks.items():
    text = Path(path).read_text(encoding='utf-8')
    for token in tokens:
        if token not in text:
            raise SystemExit(f'assertion failed: {path} -> {token}')

print('Dashboard padronizado, compatibilidade R1 aplicada, documentação e build atualizadas.')
