from pathlib import Path

path = Path('src/pages/AdminCampaignDashboard.tsx')
text = path.read_text(encoding='utf-8')


def replace_once(old: str, new: str):
    global text
    if old not in text:
        raise SystemExit(f'pattern not found: {old[:160]}')
    text = text.replace(old, new, 1)


# Icone financeiro.
replace_once(
    '  CheckCircle2,\n  ExternalLink,',
    '  CheckCircle2,\n  DollarSign,\n  ExternalLink,'
)

# Configuracao financeira retornada pelo backend.
replace_once(
    '  workflow?: string;\n  updated_at?: string;',
    "  workflow?: string;\n  financial_config?: {\n    currency?: string;\n    category?: string;\n    unit_cost_brl?: number;\n    billing_basis?: string;\n    effective_from?: string;\n    configurable_by?: string;\n  };\n  updated_at?: string;",
)

# Helpers monetarios.
replace_once(
    "const formatPercent = (value?: number) =>\n  `${Number(value || 0).toLocaleString('pt-BR', {\n    minimumFractionDigits: 1,\n    maximumFractionDigits: 1\n  })}%`;",
    "const DEFAULT_META_MARKETING_UNIT_COST_BRL = 0.3217;\n\nconst formatPercent = (value?: number) =>\n  `${Number(value || 0).toLocaleString('pt-BR', {\n    minimumFractionDigits: 1,\n    maximumFractionDigits: 1\n  })}%`;\n\nconst formatCurrency = (value?: number, maximumFractionDigits = 2) =>\n  new Intl.NumberFormat('pt-BR', {\n    style: 'currency',\n    currency: 'BRL',\n    minimumFractionDigits: maximumFractionDigits,\n    maximumFractionDigits\n  }).format(Number(value || 0));",
)

# Secao financeira reutilizavel em qualquer rodada.
marker = 'function GeneralDashboardSection({ payloads }: { payloads: DashboardPayload[] }) {'
if marker not in text:
    raise SystemExit('general dashboard component marker not found')

financial_component = r'''
function FinancialSection({
  title,
  overall,
  financialConfig,
  helper
}: {
  title: string;
  overall: NonNullable<DashboardPayload['overall']>;
  financialConfig?: DashboardPayload['financial_config'];
  helper?: string;
}) {
  const unitCost = Number(financialConfig?.unit_cost_brl || DEFAULT_META_MARKETING_UNIT_COST_BRL);
  const hasDeliveredMetric = typeof overall.delivered === 'number';
  const billableMessages = Number(hasDeliveredMetric ? overall.delivered : overall.sent || 0);
  const estimatedSpend = billableMessages * unitCost;
  const responses = Number(overall.responses || 0);
  const interested = Number(overall.interested || 0);
  const groupMembers = Number(overall.group_members || 0);
  const costPerResponse = responses > 0 ? estimatedSpend / responses : 0;
  const costPerInterested = interested > 0 ? estimatedSpend / interested : 0;
  const costPerGroupMember = groupMembers > 0 ? estimatedSpend / groupMembers : 0;

  return (
    <section className="rounded-3xl border border-emerald-200 bg-emerald-50/60 p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-emerald-800"><DollarSign className="h-5 w-5" /><h2 className="font-display text-lg font-bold">{title}</h2></div>
          <p className="mt-1 text-xs text-emerald-800/80">{helper || 'Estimativa da tarifa Meta para mensagens de template Marketing entregues.'}</p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-white/80 px-4 py-3 text-xs text-emerald-900">
          <p className="font-semibold">Tarifa unitária de referência</p>
          <p className="mt-1 text-lg font-black">{formatCurrency(unitCost, 4)}</p>
          <p className="mt-1 text-[11px] text-emerald-800/70">Marketing • Brasil • vigente desde 01/07/2026</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-2xl border border-emerald-200 bg-white p-4"><p className="text-xs font-semibold text-emerald-800">Custo Meta estimado</p><p className="mt-1 text-2xl font-bold text-emerald-950">{formatCurrency(estimatedSpend)}</p><p className="mt-1 text-xs text-emerald-800/70">{billableMessages} mensagem(ns) faturável(is)</p></div>
        <div className="rounded-2xl border border-emerald-200 bg-white p-4"><p className="text-xs font-semibold text-emerald-800">Custo por resposta</p><p className="mt-1 text-2xl font-bold text-emerald-950">{responses > 0 ? formatCurrency(costPerResponse) : '—'}</p><p className="mt-1 text-xs text-emerald-800/70">{responses} resposta(s)</p></div>
        <div className="rounded-2xl border border-emerald-200 bg-white p-4"><p className="text-xs font-semibold text-emerald-800">Custo por interessado</p><p className="mt-1 text-2xl font-bold text-emerald-950">{interested > 0 ? formatCurrency(costPerInterested) : '—'}</p><p className="mt-1 text-xs text-emerald-800/70">{interested} interessado(s)</p></div>
        <div className="rounded-2xl border border-emerald-200 bg-white p-4"><p className="text-xs font-semibold text-emerald-800">Custo por membro atual</p><p className="mt-1 text-2xl font-bold text-emerald-950">{groupMembers > 0 ? formatCurrency(costPerGroupMember) : '—'}</p><p className="mt-1 text-xs text-emerald-800/70">{groupMembers} no grupo agora</p></div>
        <div className="rounded-2xl border border-emerald-200 bg-white p-4"><p className="text-xs font-semibold text-emerald-800">Base de cobrança</p><p className="mt-1 text-2xl font-bold text-emerald-950">{billableMessages}</p><p className="mt-1 text-xs text-emerald-800/70">{hasDeliveredMetric ? 'Entregues' : 'Envios registrados*'}</p></div>
      </div>

      <p className="mt-3 text-[11px] text-emerald-900/65">* A Meta cobra template Marketing por mensagem entregue. Nas fontes históricas que não possuem uma métrica separada de entrega, o dashboard usa os envios registrados como aproximação. Valores são estimativas da tarifa Meta e podem divergir do faturamento final por ajustes da conta.</p>
    </section>
  );
}

'''
text = text.replace(marker, financial_component + marker, 1)

# Geral: guardar a quantidade faturavel por rodada.
replace_once(
    "        sent,\n        responses: Number(overall.responses || 0),",
    "        sent,\n        billable: Number(overall.delivered ?? overall.sent ?? 0),\n        responses: Number(overall.responses || 0),",
)

replace_once(
    "      sent: acc.sent + item.sent,\n      responses: acc.responses + item.responses,",
    "      sent: acc.sent + item.sent,\n      billable: acc.billable + item.billable,\n      responses: acc.responses + item.responses,",
)

replace_once(
    "    { processed: 0, sent: 0, responses: 0, interested: 0, no_interest: 0, group_members: 0, failures: 0, pending_meta: 0 }",
    "    { processed: 0, sent: 0, billable: 0, responses: 0, interested: 0, no_interest: 0, group_members: 0, failures: 0, pending_meta: 0 }",
)

# Geral: tarifa consolidada e overall sintetico para secao financeira.
replace_once(
    "  const rate = (value: number, base: number) => base > 0 ? (value / base) * 100 : 0;\n  const funnel = [",
    "  const rate = (value: number, base: number) => base > 0 ? (value / base) * 100 : 0;\n  const financialConfig = payloads.find(payload => Number(payload.financial_config?.unit_cost_brl || 0) > 0)?.financial_config;\n  const generalOverall: NonNullable<DashboardPayload['overall']> = {\n    delivered: total.billable,\n    sent: total.sent,\n    responses: total.responses,\n    interested: total.interested,\n    no_interest: total.no_interest,\n    group_members: total.group_members,\n    failures: total.failures,\n    pending_meta: total.pending_meta,\n    response_rate: rate(total.responses, total.billable),\n    interest_rate: rate(total.interested, total.billable),\n    response_to_interest_rate: rate(total.interested, total.responses)\n  };\n  const funnel = [",
)

# Geral: secao financeira antes do funil.
replace_once(
    '      <FunnelSection title="Funil geral — todas as rodadas" funnel={funnel} base={Math.max(1, total.processed)} />',
    '      <FinancialSection title="Financeiro geral — todas as rodadas" overall={generalOverall} financialConfig={financialConfig} helper="Consolidação financeira das mensagens iniciais das Rodadas 1 a 5." />\n\n      <FunnelSection title="Funil geral — todas as rodadas" funnel={funnel} base={Math.max(1, total.processed)} />',
)

# Geral: custo estimado por rodada no comparativo.
replace_once(
    "{['Rodada', 'Processados', 'Enviados', 'Respostas', 'Interessados', 'No grupo', 'Falhas', 'Status'].map(label =>",
    "{['Rodada', 'Processados', 'Enviados', 'Respostas', 'Interessados', 'No grupo', 'Custo Meta', 'Falhas', 'Status'].map(label =>",
)

replace_once(
    "                  <td className=\"border-b border-brand-border/70 px-3 py-3\">{item.group_members}</td>\n                  <td className=\"border-b border-brand-border/70 px-3 py-3\">{item.failures}</td>",
    "                  <td className=\"border-b border-brand-border/70 px-3 py-3\">{item.group_members}</td>\n                  <td className=\"border-b border-brand-border/70 px-3 py-3 font-semibold text-emerald-800\">{formatCurrency(item.billable * Number(financialConfig?.unit_cost_brl || DEFAULT_META_MARKETING_UNIT_COST_BRL))}</td>\n                  <td className=\"border-b border-brand-border/70 px-3 py-3\">{item.failures}</td>",
)

# Todas as abas individuais recebem a mesma secao financeira antes do conteudo especifico.
individual_anchor = '        {!showGeneral && data && isRound1 && overall ? ('
if individual_anchor not in text:
    raise SystemExit('individual round anchor not found')
text = text.replace(
    individual_anchor,
    "        {!showGeneral && data && overall ? (\n          <FinancialSection\n            title={`Financeiro — Rodada ${selectedRound}`}\n            overall={overall}\n            financialConfig={data.financial_config}\n            helper={`Estimativa financeira do convite inicial da Rodada ${selectedRound}.`}\n          />\n        ) : null}\n\n" + individual_anchor,
    1,
)

# Garantias basicas do patch.
checks = [
    'financial_config?: {',
    'DEFAULT_META_MARKETING_UNIT_COST_BRL',
    'function FinancialSection',
    'Financeiro geral — todas as rodadas',
    'Financeiro — Rodada ${selectedRound}',
    'Custo por resposta',
    'Custo por interessado',
    'Custo por membro atual',
    'Custo Meta',
]
for token in checks:
    if token not in text:
        raise SystemExit(f'financial assertion failed: {token}')

path.write_text(text, encoding='utf-8')
