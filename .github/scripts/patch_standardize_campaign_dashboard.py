from pathlib import Path

path = Path('src/pages/AdminCampaignDashboard.tsx')
text = path.read_text(encoding='utf-8')


def replace_once(old: str, new: str):
    global text
    if old not in text:
        raise SystemExit(f'pattern not found: {old[:180]}')
    text = text.replace(old, new, 1)


replace_once('type RoundNumber = 1 | 2 | 3 | 4;', 'type RoundNumber = 1 | 2 | 3 | 4 | 5;')
replace_once('const AVAILABLE_ROUNDS: RoundNumber[] = [1, 2, 3, 4];', 'const AVAILABLE_ROUNDS: RoundNumber[] = [1, 2, 3, 4, 5];')
replace_once('const DEFAULT_ROUND: RoundNumber = 4;', 'const DEFAULT_ROUND: RoundNumber = 5;')
replace_once('  contacts_sheet_url?: string;\n  overall?: {', '  contacts_sheet_url?: string;\n  data_warning?: string;\n  overall?: {')
replace_once('  value: number;\n  helper?: string;', '  value: number | string;\n  helper?: string;')

marker = 'function GeneralDashboardSection({ payloads }: { payloads: DashboardPayload[] }) {'
if marker not in text:
    raise SystemExit('GeneralDashboardSection marker not found')

standard_component = r'''
function StandardRoundDashboard({ round, data }: { round: RoundNumber; data: DashboardPayload }) {
  const overall = data.overall!;
  const members = data.group_members || [];
  const followups = data.followups;
  const variants = data.variants;
  const decision = data.decision;
  const contactsSheetUrl = data.contacts_sheet_url || 'https://docs.google.com/spreadsheets/d/1PwouSDq1gi0588hlfzo2jCeoCwZ79z4IAxEm3w2thJg/edit';

  const planned = typeof overall.planned === 'number' ? overall.planned : Number(overall.processed ?? overall.sent ?? 0);
  const released: number | string = typeof overall.released === 'number' ? overall.released : '—';
  const processed = typeof overall.processed === 'number' ? overall.processed : Number(overall.sent || 0);
  const sent = Number(overall.sent ?? overall.delivered ?? 0);
  const failures: number | string = typeof overall.failures === 'number' ? overall.failures : '—';
  const pendingMeta: number | string = typeof overall.pending_meta === 'number' ? overall.pending_meta : '—';

  const percent = (value: number, base: number) => base > 0 ? (value / base) * 100 : 0;
  const responseRate = Number.isFinite(Number(overall.response_rate)) ? Number(overall.response_rate) : percent(Number(overall.responses || 0), sent);
  const interestRate = Number.isFinite(Number(overall.interest_rate)) ? Number(overall.interest_rate) : percent(Number(overall.interested || 0), sent);
  const responseToInterestRate = Number.isFinite(Number(overall.response_to_interest_rate)) ? Number(overall.response_to_interest_rate) : percent(Number(overall.interested || 0), Number(overall.responses || 0));
  const deliveryRate = typeof overall.delivery_rate === 'number' ? overall.delivery_rate : percent(sent, processed);
  const groupRate = percent(Number(overall.group_members || 0), Number(overall.interested || 0));

  const funnel = data.funnel?.length ? data.funnel : [
    { key: 'processed', label: 'Processados', value: processed },
    { key: 'sent', label: 'Enviados', value: sent },
    { key: 'responses', label: 'Respostas', value: Number(overall.responses || 0) },
    { key: 'interested', label: 'Interessados', value: Number(overall.interested || 0) },
    { key: 'group_members', label: 'No grupo agora', value: Number(overall.group_members || 0) }
  ];

  const followupEnabled = Boolean(followups?.available);
  const followupText = followupEnabled
    ? 'Esta rodada possui histórico de follow-ups. Os dados abaixo são históricos e não alteram as métricas do convite inicial.'
    : (followups?.reason || 'Os follow-ups da captação estão desativados por decisão operacional.');

  return (
    <>
      {data.data_warning ? (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div><p className="font-bold">Aviso de qualidade dos dados</p><p className="mt-1">{data.data_warning}</p></div>
        </div>
      ) : null}

      <section className="rounded-3xl border border-brand-border bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-brand-primary"><BarChart3 className="h-5 w-5" /><h2 className="font-display text-lg font-bold">Rodada {round} — visão geral</h2></div>
            <p className="mt-1 text-xs text-brand-text-muted">{data.scope || `Rodada ${round}`} • estrutura padronizada do Dashboard de Captação.</p>
          </div>
          <div className="text-left text-xs text-brand-text-muted md:text-right"><p>Última atualização</p><p className="mt-1 font-bold text-brand-text">{formatDateTime(data.updated_at)}</p><p className="mt-1">Workflow {data.workflow || 'n8n'}</p></div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <MetricCard label="Planejados" value={planned} helper={typeof overall.planned === 'number' ? 'Coorte da rodada' : 'Estimado pelo histórico'} icon={<Users className="h-5 w-5" />} />
          <MetricCard label="Liberados" value={released} helper={typeof overall.released === 'number' ? 'SIM na origem' : 'Não disponível no histórico'} icon={<ShieldCheck className="h-5 w-5" />} />
          <MetricCard label="Processados" value={processed} helper="Com tentativa/status registrado" icon={<Activity className="h-5 w-5" />} />
          <MetricCard label="Enviados" value={sent} helper="Convites iniciais registrados" icon={<Send className="h-5 w-5" />} />
          <MetricCard label="Respostas" value={Number(overall.responses || 0)} helper={`${formatPercent(responseRate)} dos enviados`} icon={<MessageCircleReply className="h-5 w-5" />} />
          <MetricCard label="Interessados" value={Number(overall.interested || 0)} helper={`${formatPercent(interestRate)} dos enviados`} icon={<UserRoundCheck className="h-5 w-5" />} />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4"><p className="text-xs font-semibold text-red-800">Erros</p><p className="mt-1 text-2xl font-bold text-red-900">{failures}</p></div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><p className="text-xs font-semibold text-amber-800">Aguardando Meta</p><p className="mt-1 text-2xl font-bold text-amber-900">{pendingMeta}</p></div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-semibold text-slate-700">Sem interesse</p><p className="mt-1 text-2xl font-bold text-slate-900">{Number(overall.no_interest || 0)}</p></div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><p className="text-xs font-semibold text-emerald-800">No grupo agora</p><p className="mt-1 text-2xl font-bold text-emerald-900">{Number(overall.group_members || 0)}</p></div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <RateCard label="Envio / processados" value={deliveryRate} />
          <RateCard label="Resposta / enviados" value={responseRate} />
          <RateCard label="Interesse / enviados" value={interestRate} />
          <RateCard label="Interesse / respostas" value={responseToInterestRate} />
          <RateCard label="Grupo / interessados" value={groupRate} />
        </div>
      </section>

      <FinancialSection title={`Financeiro — Rodada ${round}`} overall={overall} financialConfig={data.financial_config} helper={`Estimativa financeira do convite inicial da Rodada ${round}.`} />

      <section className="rounded-3xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-3"><Trophy className="mt-0.5 h-6 w-6 shrink-0 text-blue-700" /><div><h2 className="font-display text-lg font-bold text-blue-900">Estratégia da Rodada {round}</h2><p className="mt-1 text-sm font-semibold text-blue-800">{templateLabels[data.template || ''] || data.template || 'Template histórico/múltiplo'}</p><p className="mt-2 text-sm text-blue-800">{data.origin_decision || 'Estratégia preservada conforme os registros históricos da rodada.'}</p></div></div>
          <div className="min-w-64 rounded-2xl bg-white/80 px-4 py-3 text-xs shadow-sm"><p className="text-brand-text-muted">Status operacional</p><p className="mt-1 font-bold text-brand-text">{data.status || '—'}</p><p className="mt-3 text-brand-text-muted">Fase</p><p className="mt-1 font-bold text-brand-text">{data.phase || '—'}</p></div>
        </div>
      </section>

      <FunnelSection title={`Funil da Rodada ${round}`} funnel={funnel} base={Math.max(1, processed || planned)} />

      <section className="rounded-3xl border border-brand-border bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3"><MessageCircleReply className="mt-0.5 h-6 w-6 text-brand-primary" /><div className="min-w-0 flex-1"><h2 className="font-display text-lg font-bold text-brand-primary">Política e histórico de follow-up — Rodada {round}</h2><p className="mt-1 text-sm text-brand-text-muted">{followupText}</p></div></div>
        {followupEnabled ? <FollowupQueueCards followups={followups!} /> : null}
        {followupEnabled ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Follow-up sem resposta" value={Number(followups?.sent?.no_response || 0)} helper="Histórico enviado" icon={<Send className="h-5 w-5" />} />
            <MetricCard label="Lembrete de grupo" value={Number(followups?.sent?.group_reminder || 0)} helper="Histórico enviado" icon={<Users className="h-5 w-5" />} />
            <MetricCard label="Sem cadastro" value={Number(followups?.sent?.no_registration || 0)} helper="Histórico enviado" icon={<UserRoundCheck className="h-5 w-5" />} />
            <MetricCard label="Entraram após follow-up" value={Number(followups?.conversion?.entered_after_any || 0)} helper={`${formatPercent(followups?.conversion?.conversion_rate)} dos pré-grupo`} icon={<CheckCircle2 className="h-5 w-5" />} />
          </div>
        ) : null}
      </section>

      <MembersSection round={round} members={members} total={Number(overall.group_members || 0)} />

      <section className="rounded-3xl border border-brand-border bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><FileSpreadsheet className="mt-0.5 h-6 w-6 text-brand-primary" /><div><h2 className="font-display text-lg font-bold text-brand-primary">Fonte de dados — Rodada {round}</h2><p className="mt-1 text-sm text-brand-text-muted">Consulte a coorte e os registros operacionais desta rodada no Google Sheets.</p></div></div><a href={contactsSheetUrl} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:opacity-90"><ExternalLink className="h-4 w-4" /> Abrir no Google Sheets</a></div>
      </section>

      {round === 1 && (data.areas || []).length > 0 ? (
        <section>
          <div className="mb-3 flex items-center gap-2 text-brand-primary"><BarChart3 className="h-5 w-5" /><h2 className="font-display text-lg font-bold">Detalhes específicos — desempenho por área</h2></div>
          <div className="grid gap-4 lg:grid-cols-2">{(data.areas || []).map(area => <div key={area.name} className="rounded-3xl border border-brand-border bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h3 className="font-display text-lg font-bold text-brand-text">{area.name}</h3><p className="mt-1 text-xs text-brand-text-muted">Detalhe histórico da Rodada 1</p></div><span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">{area.current_group_members} no grupo</span></div><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">{[['Envios', area.sent], ['Respostas', area.responses], ['Interessados', area.interested], ['Sem interesse', area.no_interest]].map(([label, value]) => <div key={String(label)} className="rounded-2xl bg-brand-bg p-3"><p className="text-xs text-brand-text-muted">{label}</p><p className="mt-1 text-xl font-bold text-brand-text">{value}</p></div>)}</div><div className="mt-4 grid grid-cols-3 gap-3"><RateCard label="Resposta" value={area.response_rate} /><RateCard label="Interesse" value={area.interest_rate} /><RateCard label="Interesse / respostas" value={area.response_to_interest_rate} /></div></div>)}</div>
        </section>
      ) : null}

      {round === 2 && variants ? (
        <section>
          <div className="mb-3 flex items-center gap-2 text-brand-primary"><Trophy className="h-5 w-5" /><h2 className="font-display text-lg font-bold">Detalhes específicos — teste A/B</h2></div>
          <div className="grid gap-4 lg:grid-cols-2"><VariantCard metric={variants.A} winner={decision?.winner} /><VariantCard metric={variants.B} winner={decision?.winner} /></div>
          {decision ? <div className="mt-4 rounded-2xl border border-brand-border bg-white p-4 text-sm text-brand-text-muted"><span className="font-bold text-brand-text">Decisão:</span> {decision.winner ? `Variante ${decision.winner}` : decision.status || '—'}{decision.criterion ? ` • ${decision.criterion}` : ''}</div> : null}
          {followups?.ab ? <div className="mt-4 grid gap-4 lg:grid-cols-2"><FollowupABCard title="Follow-up sem resposta" A={followups.ab.no_response.A} B={followups.ab.no_response.B} /><FollowupABCard title="Lembrete de grupo" A={followups.ab.group_reminder.A} B={followups.ab.group_reminder.B} /></div> : null}
        </section>
      ) : null}
    </>
  );
}

'''
text = text.replace(marker, standard_component + marker, 1)

# Remove variáveis/descrições específicas de layout por rodada.
start = text.find('  const isRound1 = selectedRound === 1;')
ret = text.find('\n  return (', start)
if start == -1 or ret == -1:
    raise SystemExit('parent description block not found')
new_description = """  const description = showGeneral
    ? 'Visão consolidada das principais métricas de todas as rodadas da captação, com foco no funil geral e comparação entre coortes.'
    : `Rodada ${selectedRound} • ${data?.scope || 'Captação Evolução Clínica'}. Todas as rodadas seguem o mesmo padrão de métricas e layout.`;
"""
text = text[:start] + new_description + text[ret:]

# Substitui todo o JSX específico de R1-R4 pelo componente padrão único.
render_start = text.find('        {!showGeneral && data && overall ? (')
render_end = text.rfind('      </div>\n    </main>')
if render_start == -1 or render_end == -1 or render_end <= render_start:
    raise SystemExit('round render block not found')
replacement = """        {!showGeneral && data?.overall ? (
          <StandardRoundDashboard round={selectedRound} data={data} />
        ) : null}

"""
text = text[:render_start] + replacement + text[render_end:]

checks = [
    'type RoundNumber = 1 | 2 | 3 | 4 | 5;',
    'const AVAILABLE_ROUNDS: RoundNumber[] = [1, 2, 3, 4, 5];',
    'function StandardRoundDashboard',
    'Política e histórico de follow-up',
    'Detalhes específicos — teste A/B',
    'Detalhes específicos — desempenho por área',
    '<StandardRoundDashboard round={selectedRound} data={data} />',
]
for token in checks:
    if token not in text:
        raise SystemExit(f'assertion failed: {token}')

if 'isRound1' in text or 'isRound2' in text or 'isRound3' in text or 'isRound4' in text:
    raise SystemExit('legacy per-round flags still present')

path.write_text(text, encoding='utf-8')
