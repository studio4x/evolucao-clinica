from pathlib import Path

path = Path('src/pages/AdminCampaignDashboard.tsx')
text = path.read_text(encoding='utf-8')


def replace_once(old: str, new: str):
    global text
    if old not in text:
        raise SystemExit(f'pattern not found: {old[:120]}')
    text = text.replace(old, new, 1)


replace_once(
    "const AVAILABLE_ROUNDS: RoundNumber[] = [1, 2, 3, 4];\nconst DEFAULT_ROUND: RoundNumber = 4;",
    "const AVAILABLE_ROUNDS: RoundNumber[] = [1, 2, 3, 4];\nconst GENERAL_ROUNDS = [1, 2, 3, 4, 5] as const;\nconst DEFAULT_ROUND: RoundNumber = 4;"
)

replace_once(
    "const getRoundHref = (round: RoundNumber) => {\n  const url = new URL(window.location.href);\n  url.searchParams.set('round', String(round));\n  return `${url.pathname}${url.search}${url.hash}`;\n};",
    "const getRoundHref = (round: RoundNumber) => {\n  const url = new URL(window.location.href);\n  url.searchParams.delete('view');\n  url.searchParams.set('round', String(round));\n  return `${url.pathname}${url.search}${url.hash}`;\n};\n\nconst getGeneralHref = () => {\n  const url = new URL(window.location.href);\n  url.searchParams.set('view', 'geral');\n  return `${url.pathname}${url.search}${url.hash}`;\n};"
)

replace_once(
    "  round4_data_incomplete: 'Os dados da Rodada 4 ainda não estão completos na fonte.'",
    "  round4_data_incomplete: 'Os dados da Rodada 4 ainda não estão completos na fonte.',\n  round5_data_incomplete: 'Os dados da Rodada 5 ainda não estão completos na fonte.'"
)

marker = "export default function AdminCampaignDashboard() {"
if marker not in text:
    raise SystemExit('component marker not found')

general_component = r'''
function GeneralDashboardSection({ payloads }: { payloads: DashboardPayload[] }) {
  const snapshots = payloads
    .filter(payload => payload?.ok && payload.overall)
    .map(payload => {
      const overall = payload.overall!;
      const processed = Number(overall.processed ?? overall.sent ?? 0);
      const sent = Number(overall.sent ?? overall.delivered ?? 0);
      return {
        round: Number(payload.round || 0),
        status: payload.status || '—',
        updated_at: payload.updated_at,
        processed,
        sent,
        responses: Number(overall.responses || 0),
        interested: Number(overall.interested || 0),
        no_interest: Number(overall.no_interest || 0),
        group_members: Number(overall.group_members || 0),
        failures: Number(overall.failures || 0),
        pending_meta: Number(overall.pending_meta || 0)
      };
    })
    .sort((a, b) => a.round - b.round);

  const total = snapshots.reduce(
    (acc, item) => ({
      processed: acc.processed + item.processed,
      sent: acc.sent + item.sent,
      responses: acc.responses + item.responses,
      interested: acc.interested + item.interested,
      no_interest: acc.no_interest + item.no_interest,
      group_members: acc.group_members + item.group_members,
      failures: acc.failures + item.failures,
      pending_meta: acc.pending_meta + item.pending_meta
    }),
    { processed: 0, sent: 0, responses: 0, interested: 0, no_interest: 0, group_members: 0, failures: 0, pending_meta: 0 }
  );

  const rate = (value: number, base: number) => base > 0 ? (value / base) * 100 : 0;
  const funnel = [
    { key: 'processed', label: 'Processados', value: total.processed },
    { key: 'sent', label: 'Enviados', value: total.sent },
    { key: 'responses', label: 'Respostas', value: total.responses },
    { key: 'interested', label: 'Interessados', value: total.interested },
    { key: 'group_members', label: 'No grupo agora', value: total.group_members }
  ];

  const latestUpdated = snapshots
    .map(item => item.updated_at)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  return (
    <>
      <section className="rounded-3xl border border-brand-border bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-brand-primary"><BarChart3 className="h-5 w-5" /><h2 className="font-display text-lg font-bold">Visão geral da captação</h2></div>
            <p className="mt-1 text-xs text-brand-text-muted">Consolidação das principais métricas das Rodadas 1 a 5. Cada rodada continua sendo calculada individualmente pelo n8n.</p>
          </div>
          <div className="text-left text-xs text-brand-text-muted md:text-right"><p>Última atualização consolidada</p><p className="mt-1 font-bold text-brand-text">{formatDateTime(latestUpdated)}</p><p className="mt-1">{snapshots.length} rodada(s) carregada(s)</p></div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <MetricCard label="Processados" value={total.processed} helper="Todas as rodadas" icon={<Activity className="h-5 w-5" />} />
          <MetricCard label="Enviados" value={total.sent} helper={`${formatPercent(rate(total.sent, total.processed))} dos processados`} icon={<Send className="h-5 w-5" />} />
          <MetricCard label="Respostas" value={total.responses} helper={`${formatPercent(rate(total.responses, total.sent))} dos enviados`} icon={<MessageCircleReply className="h-5 w-5" />} />
          <MetricCard label="Interessados" value={total.interested} helper={`${formatPercent(rate(total.interested, total.sent))} dos enviados`} icon={<UserRoundCheck className="h-5 w-5" />} />
          <MetricCard label="No grupo agora" value={total.group_members} helper="Presença atual, não causal" icon={<Users className="h-5 w-5" />} />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <RateCard label="Envio / processados" value={rate(total.sent, total.processed)} />
          <RateCard label="Resposta / enviados" value={rate(total.responses, total.sent)} />
          <RateCard label="Interesse / enviados" value={rate(total.interested, total.sent)} />
          <RateCard label="Interesse / respostas" value={rate(total.interested, total.responses)} />
          <RateCard label="Grupo / interessados" value={rate(total.group_members, total.interested)} />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4"><p className="text-xs font-semibold text-red-800">Falhas acumuladas</p><p className="mt-1 text-2xl font-bold text-red-900">{total.failures}</p></div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><p className="text-xs font-semibold text-amber-800">Aguardando confirmação Meta</p><p className="mt-1 text-2xl font-bold text-amber-900">{total.pending_meta}</p></div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-semibold text-slate-700">Sem interesse</p><p className="mt-1 text-2xl font-bold text-slate-900">{total.no_interest}</p></div>
        </div>
      </section>

      <FunnelSection title="Funil geral — todas as rodadas" funnel={funnel} base={Math.max(1, total.processed)} />

      <section className="rounded-3xl border border-brand-border bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-brand-primary"><BarChart3 className="h-5 w-5" /><h2 className="font-display text-lg font-bold">Comparativo por rodada</h2></div>
        <p className="mt-1 text-xs text-brand-text-muted">Leitura rápida dos principais estágios para identificar evolução entre as coortes.</p>
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0 text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-brand-text-muted">{['Rodada', 'Processados', 'Enviados', 'Respostas', 'Interessados', 'No grupo', 'Falhas', 'Status'].map(label => <th key={label} className="border-b border-brand-border px-3 py-3 font-bold">{label}</th>)}</tr></thead>
            <tbody>
              {snapshots.map(item => (
                <tr key={item.round} className="text-brand-text">
                  <td className="border-b border-brand-border/70 px-3 py-3 font-bold text-brand-primary">Rodada {item.round}</td>
                  <td className="border-b border-brand-border/70 px-3 py-3">{item.processed}</td>
                  <td className="border-b border-brand-border/70 px-3 py-3">{item.sent}</td>
                  <td className="border-b border-brand-border/70 px-3 py-3">{item.responses}</td>
                  <td className="border-b border-brand-border/70 px-3 py-3 font-semibold">{item.interested}</td>
                  <td className="border-b border-brand-border/70 px-3 py-3">{item.group_members}</td>
                  <td className="border-b border-brand-border/70 px-3 py-3">{item.failures}</td>
                  <td className="border-b border-brand-border/70 px-3 py-3"><span className="rounded-full border border-brand-border bg-brand-bg px-2.5 py-1 text-xs font-bold">{item.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

'''
text = text.replace(marker, general_component + marker, 1)

replace_once(
    "  const [selectedRound, setSelectedRound] = useState<RoundNumber>(() => readRoundFromUrl());\n  const [data, setData] = useState<DashboardPayload | null>(null);",
    "  const [selectedRound, setSelectedRound] = useState<RoundNumber>(() => readRoundFromUrl());\n  const [showGeneral, setShowGeneral] = useState(() => new URLSearchParams(window.location.search).get('view') === 'geral');\n  const [data, setData] = useState<DashboardPayload | null>(null);\n  const [generalData, setGeneralData] = useState<DashboardPayload[]>([]);\n  const [generalLoading, setGeneralLoading] = useState(false);\n  const [generalRefreshing, setGeneralRefreshing] = useState(false);\n  const [generalError, setGeneralError] = useState('');"
)

replace_once(
    "    const syncRoundFromUrl = () => setSelectedRound(readRoundFromUrl());",
    "    const syncRoundFromUrl = () => {\n      setSelectedRound(readRoundFromUrl());\n      setShowGeneral(new URLSearchParams(window.location.search).get('view') === 'geral');\n    };"
)

replace_once(
    "  const handleRoundNavigation = (event: React.MouseEvent<HTMLAnchorElement>, round: RoundNumber) => {",
    "  const handleGeneralNavigation = (event: React.MouseEvent<HTMLAnchorElement>) => {\n    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;\n    event.preventDefault();\n    if (showGeneral) return;\n    window.history.pushState(window.history.state, '', getGeneralHref());\n    setShowGeneral(true);\n    setData(null);\n    setErrorMessage('');\n  };\n\n  const handleRoundNavigation = (event: React.MouseEvent<HTMLAnchorElement>, round: RoundNumber) => {"
)

replace_once(
    "    event.preventDefault();\n    if (round === selectedRound) return;\n\n    window.history.pushState(window.history.state, '', getRoundHref(round));\n    setSelectedRound(round);",
    "    event.preventDefault();\n    if (!showGeneral && round === selectedRound) return;\n\n    window.history.pushState(window.history.state, '', getRoundHref(round));\n    setShowGeneral(false);\n    setSelectedRound(round);"
)

dashboard_loader_marker = "  useEffect(() => {\n    if (!accessToken) return;\n    setData(null);"
if dashboard_loader_marker not in text:
    raise SystemExit('dashboard effect marker not found')

general_loader = r'''  const loadGeneralDashboard = async (silent = false) => {
    if (!accessToken) return;
    if (silent) setGeneralRefreshing(true);
    else setGeneralLoading(true);

    try {
      const results = await Promise.allSettled(
        GENERAL_ROUNDS.map(async round => {
          const nonce = `${Date.now()}-${round}-${Math.random().toString(36).slice(2)}`;
          const response = await fetch(`/api/admin/campaign-dashboard?round=${round}&refresh=${encodeURIComponent(nonce)}`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', 'Cache-Control': 'no-cache, no-store, must-revalidate', Pragma: 'no-cache' },
            cache: 'no-store'
          });
          const body = await response.json().catch(() => ({ ok: false, error: 'invalid_response' })) as DashboardPayload;
          if (!response.ok || !body.ok) throw new Error(String(body.error || `round_${round}_unavailable`));
          return body;
        })
      );

      const successful = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
      const failedCount = results.length - successful.length;
      setGeneralData(successful);
      setGeneralError(failedCount > 0 ? `${failedCount} rodada(s) não puderam ser carregadas agora. O consolidado abaixo usa somente as rodadas disponíveis.` : '');
    } catch (error) {
      console.error('[AdminCampaignDashboard] Falha ao carregar visão geral:', error);
      setGeneralError('Falha de comunicação ao atualizar a visão geral.');
    } finally {
      setGeneralLoading(false);
      setGeneralRefreshing(false);
    }
  };

  useEffect(() => {
    if (!accessToken || !showGeneral) return;
    void loadGeneralDashboard(false);
    const timer = window.setInterval(() => void loadGeneralDashboard(true), 60_000);
    return () => window.clearInterval(timer);
  }, [accessToken, showGeneral]);

'''
text = text.replace(dashboard_loader_marker, general_loader + dashboard_loader_marker, 1)

replace_once(
    "    if (!accessToken) return;\n    setData(null);\n    setErrorMessage('');\n    void loadDashboard(selectedRound, false);",
    "    if (!accessToken || showGeneral) return;\n    setData(null);\n    setErrorMessage('');\n    void loadDashboard(selectedRound, false);"
)
replace_once(
    "  }, [accessToken, selectedRound]);",
    "  }, [accessToken, selectedRound, showGeneral]);"
)

replace_once(
    "  const description = isRound1",
    "  const description = showGeneral\n    ? 'Visão consolidada das principais métricas de todas as rodadas da captação, com foco no funil geral e comparação entre coortes.'\n    : isRound1"
)

replace_once(
    "            <button type=\"button\" onClick={() => void loadDashboard(selectedRound, true)} disabled={refreshing || loading}",
    "            <button type=\"button\" onClick={() => void (showGeneral ? loadGeneralDashboard(true) : loadDashboard(selectedRound, true))} disabled={showGeneral ? (generalRefreshing || generalLoading) : (refreshing || loading)}"
)
replace_once(
    "<RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Atualizar",
    "<RefreshCw className={`h-4 w-4 ${(showGeneral ? generalRefreshing : refreshing) ? 'animate-spin' : ''}`} /> Atualizar"
)

replace_once(
    "        <div className=\"inline-flex rounded-2xl border border-brand-border bg-white p-1 shadow-sm\">\n          {AVAILABLE_ROUNDS.map(round => (",
    "        <div className=\"inline-flex flex-wrap rounded-2xl border border-brand-border bg-white p-1 shadow-sm\">\n          <a href={getGeneralHref()} onClick={handleGeneralNavigation} aria-current={showGeneral ? 'page' : undefined} className={`rounded-xl px-4 py-2 text-sm font-bold transition ${showGeneral ? 'bg-brand-primary text-white shadow-sm' : 'text-brand-text-muted hover:bg-brand-bg'}`}>Geral</a>\n          {AVAILABLE_ROUNDS.map(round => ("
)

replace_once(
    "        {errorMessage ? <div",
    "        {(showGeneral ? generalError : errorMessage) ? <div"
)
replace_once(
    "<p className=\"mt-1\">{errorMessage}</p>",
    "<p className=\"mt-1\">{showGeneral ? generalError : errorMessage}</p>"
)
replace_once(
    "        {loading && !data ? <div",
    "        {!showGeneral && loading && !data ? <div"
)

loading_line = next(
    line for line in text.splitlines()
    if line.strip().startswith('{!showGeneral && loading && !data ?')
)
insert_after = loading_line + '\n'
if insert_after not in text:
    raise SystemExit('loading line not found for insertion')
text = text.replace(
    insert_after,
    insert_after
    + '\n        {showGeneral && generalLoading && generalData.length === 0 ? <div className="flex min-h-64 items-center justify-center rounded-3xl border border-brand-border bg-white shadow-sm"><div className="flex items-center gap-3 text-sm text-brand-text-muted"><Loader2 className="h-5 w-5 animate-spin text-brand-primary" /> Consolidando todas as rodadas...</div></div> : null}\n'
    + '\n        {showGeneral && generalData.length > 0 ? <GeneralDashboardSection payloads={generalData} /> : null}\n'
)

text = text.replace('{data && isRound1', '{!showGeneral && data && isRound1')
text = text.replace('{data && isRound2', '{!showGeneral && data && isRound2')
text = text.replace('{data && isRound3', '{!showGeneral && data && isRound3')
text = text.replace('{data && isRound4', '{!showGeneral && data && isRound4')

required_tokens = [
    'GENERAL_ROUNDS = [1, 2, 3, 4, 5]',
    'Visão geral da captação',
    'Funil geral — todas as rodadas',
    'Comparativo por rodada',
    'getGeneralHref',
    'loadGeneralDashboard',
    '>Geral</a>',
    'round5_data_incomplete'
]
for token in required_tokens:
    if token not in text:
        raise SystemExit(f'missing final token: {token}')

path.write_text(text, encoding='utf-8')
