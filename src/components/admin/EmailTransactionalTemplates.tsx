import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ExternalLink, Loader2, Mail, RefreshCw } from 'lucide-react';
import { supabase } from '../../supabaseClient';

type EmailTemplate = {
  id: string;
  name: string;
  source: string;
  subject: string;
  preheader?: string;
  body: string;
  cta?: string;
  status: 'Fixo' | 'Ativo';
};

const FIXED_EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: 'welcome-pending',
    name: 'Boas-vindas — cadastro em análise',
    source: 'Cadastro de profissional',
    subject: 'Bem-vindo(a) à Evolução Clínica',
    preheader: 'Seu cadastro está em análise',
    body: 'Olá, {{nome}}. Você já faz parte da plataforma. O próximo passo é a liberação do seu acesso por um administrador.',
    cta: 'Acessar a plataforma',
    status: 'Fixo',
  },
  {
    id: 'welcome-active',
    name: 'Boas-vindas — conta liberada',
    source: 'Cadastro de profissional',
    subject: 'Sua conta foi criada com sucesso',
    preheader: 'Sua conta já está liberada',
    body: 'Olá, {{nome}}. Sua conta foi criada com sucesso e você já pode entrar na plataforma para começar a usar os recursos.',
    cta: 'Acessar a plataforma',
    status: 'Fixo',
  },
  {
    id: 'platform-notification',
    name: 'Notificação administrativa',
    source: 'Central de notificações',
    subject: '{{ícone}} {{título}}',
    preheader: 'Notificação do Sistema',
    body: 'Olá, {{nome}}. {{conteúdo}}',
    cta: 'Ver no Aplicativo',
    status: 'Fixo',
  },
  {
    id: 'trial-expiration',
    name: 'Término do período gratuito',
    source: 'Expiração do trial',
    subject: 'Seu teste gratuito de 7 dias terminou',
    preheader: 'Expirou em {{data_de_término}}',
    body: 'Olá, {{nome}}. Seu período de teste gratuito terminou e o acesso completo à plataforma foi encerrado até a contratação de um plano.',
    cta: 'Assinar um plano agora',
    status: 'Fixo',
  },
  {
    id: 'subscription-success',
    name: 'Assinatura confirmada',
    source: 'Pagamento aprovado',
    subject: '[Evolução Clínica] Assinatura confirmada - {{plano}}',
    preheader: 'Processada com {{forma_de_pagamento}}',
    body: 'Olá, {{nome}}. Seu pedido foi processado com sucesso. O modelo apresenta o plano, os benefícios e o resumo da transação.',
    cta: 'Ver fatura / Baixar PDF, quando disponíveis',
    status: 'Fixo',
  },
  {
    id: 'subscription-failure',
    name: 'Falha no processamento da assinatura',
    source: 'Pagamento não aprovado',
    subject: '[Evolução Clínica] Falha ao processar sua assinatura - {{plano}}',
    preheader: 'Tentativa via {{forma_de_pagamento}}',
    body: 'Olá, {{nome}}. Não foi possível concluir a cobrança. O modelo informa os detalhes da tentativa e as orientações para regularizar a assinatura.',
    status: 'Fixo',
  },
  {
    id: 'report-delivery',
    name: 'Envio de relatório ou PDI',
    source: 'Relatórios do paciente',
    subject: '{{assunto_definido_no_envio}}',
    preheader: 'Paciente: {{paciente}}',
    body: '{{conteúdo_do_relatorio}}. O e-mail inclui o arquivo PDF e, quando disponível, o link para o documento assinado.',
    cta: 'Visualizar PDF Assinado',
    status: 'Fixo',
  },
  {
    id: 'lifecycle-failure-alert',
    name: 'Alerta de falhas na fila de e-mails',
    source: 'Monitoramento da jornada',
    subject: '[Evolução Clínica] Alerta: falhas consecutivas na fila de e-mails',
    preheader: 'O Onboarding dos Usuários precisa de atenção.',
    body: 'Alerta enviado aos administradores com o número de falhas, motivo, dispatch afetado e link para o monitoramento.',
    cta: 'Abrir monitoramento',
    status: 'Fixo',
  },
];

async function adminApi(path: string) {
  const { data } = await supabase.auth.getSession();
  const response = await fetch(path, {
    headers: {
      Authorization: `Bearer ${data.session?.access_token || ''}`,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar os modelos configurados.');
  return payload;
}

export default function EmailTransactionalTemplates() {
  const [templates, setTemplates] = useState<EmailTemplate[]>(FIXED_EMAIL_TEMPLATES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [campaignsPayload, rulesPayload] = await Promise.all([
        adminApi('/api/admin/lifecycle/campaigns'),
        adminApi('/api/admin/lifecycle/rules'),
      ]);
      const activeCampaigns = (campaignsPayload.campaigns || []).filter((campaign: any) => campaign.status === 'active');
      const campaignSteps = await Promise.all(activeCampaigns.map(async (campaign: any) => ({
        campaign,
        steps: (await adminApi(`/api/admin/lifecycle/campaigns/${campaign.id}/steps`)).steps || [],
      })));
      const activeSteps = campaignSteps.flatMap(({ campaign, steps }: any) => steps
        .filter((step: any) => step.status === 'active' && step.enabled)
        .map((step: any) => ({ ...step, campaignName: campaign.name })));

      const sequenceTemplates: EmailTemplate[] = activeSteps
        .filter((step: any) => !step.eligibility_rule_key)
        .map((step: any) => ({
          id: `step-${step.id}`,
          name: `Jornada · ${step.campaignName} · Passo ${step.position}`,
          source: step.category || 'Jornada automática',
          subject: step.subject_template || 'Sem assunto configurado',
          preheader: step.preheader_template || undefined,
          body: step.body_markdown || 'Sem corpo configurado.',
          cta: step.cta_label_template || undefined,
          status: 'Ativo',
        }));

      const conditionalTemplates: EmailTemplate[] = (rulesPayload.rules || [])
        .filter((rule: any) => rule.enabled)
        .map((rule: any) => {
          const step = activeSteps.find((item: any) => item.eligibility_rule_key === rule.rule_key);
          const config = step || rule.message_config || {};
          return {
            id: `rule-${rule.id}`,
            name: `Automação · ${rule.name || rule.rule_key}`,
            source: step?.campaignName || rule.description || 'Regra automática',
            subject: config.subject_template || config.subject || rule.name || 'Sem assunto configurado',
            preheader: config.preheader_template || config.preheader || undefined,
            body: config.body_markdown || config.body || rule.description || 'Sem corpo configurado.',
            cta: config.cta_label_template || config.cta_label || undefined,
            status: 'Ativo',
          };
        });

      setTemplates([...FIXED_EMAIL_TEMPLATES, ...sequenceTemplates, ...conditionalTemplates]);
    } catch (loadError: any) {
      setTemplates(FIXED_EMAIL_TEMPLATES);
      setError(loadError.message || 'Não foi possível carregar os modelos configuráveis da jornada.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  return (
    <section className="card overflow-hidden border border-brand-border/60 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-brand-border/40 p-5">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-brand-primary/10 p-2 text-brand-primary"><Mail size={20} /></span>
          <div>
            <h3 className="text-lg font-semibold text-brand-text">Modelos de E-mails Transacionais</h3>
            <p className="mt-0.5 text-xs text-brand-text-muted">Modelos fixos e modelos ativos da jornada usados nos disparos automáticos da plataforma.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-brand-text-muted">{templates.length} modelo{templates.length !== 1 ? 's' : ''}</span>
          <button type="button" onClick={() => void loadTemplates()} disabled={loading} className="btn-outline inline-flex items-center gap-1.5 px-3 py-2 text-xs disabled:opacity-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />Atualizar
          </button>
        </div>
      </div>

      {error && (
        <div className="m-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{error} Os modelos fixos continuam visíveis.</span>
        </div>
      )}

      {loading && templates.length === FIXED_EMAIL_TEMPLATES.length ? (
        <div className="flex items-center justify-center gap-2 p-10 text-sm text-brand-text-muted"><Loader2 className="h-5 w-5 animate-spin" />Carregando modelos configurados...</div>
      ) : (
        <div className="divide-y divide-brand-border/30">
          {templates.map((template) => (
            <details key={template.id} className="group px-5 py-4">
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <strong className="text-sm text-brand-text">{template.name}</strong>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${template.status === 'Ativo' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{template.status}</span>
                  </div>
                  <p className="mt-1 text-xs text-brand-text-muted">{template.source}</p>
                </div>
                <span className="max-w-full truncate text-xs text-brand-text-muted sm:max-w-[42%]">{template.subject}</span>
              </summary>
              <div className="mt-4 grid gap-3 rounded-xl bg-brand-bg/30 p-4 text-xs sm:grid-cols-2">
                <div><span className="font-bold uppercase tracking-wide text-brand-text-muted">Assunto</span><p className="mt-1 text-brand-text">{template.subject}</p></div>
                {template.preheader && <div><span className="font-bold uppercase tracking-wide text-brand-text-muted">Prévia</span><p className="mt-1 text-brand-text">{template.preheader}</p></div>}
                <div className="sm:col-span-2"><span className="font-bold uppercase tracking-wide text-brand-text-muted">Corpo</span><p className="mt-1 whitespace-pre-wrap leading-relaxed text-brand-text">{template.body}</p></div>
                {template.cta && <div className="sm:col-span-2"><span className="font-bold uppercase tracking-wide text-brand-text-muted">CTA</span><p className="mt-1 text-brand-text">{template.cta}</p></div>}
              </div>
            </details>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-brand-border/30 bg-brand-bg/10 px-5 py-3 text-xs text-brand-text-muted">
        <span>Os modelos ativos da jornada são carregados da configuração atual.</span>
        <a href="/admin/lifecycle/campanhas-e-passos/fluxos-e-passos" className="inline-flex items-center gap-1 text-brand-primary hover:underline">
          Gerenciar jornada <ExternalLink size={13} />
        </a>
      </div>
    </section>
  );
}
