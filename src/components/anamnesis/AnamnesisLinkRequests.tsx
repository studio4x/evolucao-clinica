import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, ExternalLink, FileText, Link2, Loader2, Mail, MessageCircle, QrCode, RotateCcw, ShieldCheck, X } from 'lucide-react';
import QRCode from 'qrcode';
import { supabase } from '../../supabaseClient';
import { publicEffectFlags } from '../../config/publicFlags';
import type { PatientAnamnesis } from '../../services/anamnesis';
import { buildEmailShareUrl, buildWhatsAppShareUrl, copyText } from '../../utils/anamnesisLinkSharing';

type RequestItem = { id: string; respondent_type: 'patient' | 'responsible'; snapshot: any; expires_at: string; created_at: string; revoked_at: string | null; submitted_at: string | null; status: string; statusLabel: string; target_anamnesis_id: string | null };
type Props = { patientId: string; current: PatientAnamnesis | null; patient?: Record<string, any> | null; onEnsureCurrent?: () => Promise<PatientAnamnesis> };

const statusClasses: Record<string, string> = { awaiting: 'bg-slate-100 text-slate-700', in_progress: 'bg-amber-50 text-amber-800', responded: 'bg-sky-50 text-sky-800', incorporated: 'bg-emerald-50 text-emerald-800', expired: 'bg-slate-100 text-slate-600', revoked: 'bg-red-50 text-red-700' };
const formatDate = (value: string) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));

function ShareOption({ label, icon: Icon, href, onClick, disabled, description }: { label: string; icon: typeof Copy; href?: string | null; onClick?: () => void; disabled?: boolean; description: string }) {
  const className = `flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-center text-xs font-bold transition-colors ${disabled ? 'cursor-not-allowed border-brand-border/70 bg-brand-bg/50 text-brand-text-muted' : 'border-brand-primary/25 bg-white text-brand-primary hover:bg-brand-primary/5'}`;
  const content = <><Icon size={19} aria-hidden="true" /><span>{label}</span><span className="text-[10px] font-medium leading-tight text-brand-text-muted">{description}</span></>;
  if (href && !disabled) return <a href={href} target="_blank" rel="noopener noreferrer" className={className}>{content}</a>;
  return <button type="button" onClick={onClick} disabled={disabled} className={className}>{content}</button>;
}

export function AnamnesisLinkRequests({ patientId, current, patient, onEnsureCurrent }: Props) {
  const [activeCurrent, setActiveCurrent] = useState<PatientAnamnesis | null>(current);
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'selection' | 'link'>('selection');
  const [respondentType, setRespondentType] = useState<'patient' | 'responsible'>('patient');
  const [expiryHours, setExpiryHours] = useState(168);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [link, setLink] = useState('');
  const [qr, setQr] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [review, setReview] = useState<any>(null);
  const copyFeedbackTimerRef = useRef<number | null>(null);

  useEffect(() => { setActiveCurrent(current); }, [current, patientId]);
  useEffect(() => () => { if (copyFeedbackTimerRef.current !== null) window.clearTimeout(copyFeedbackTimerRef.current); }, []);

  const effectiveCurrent = activeCurrent || current;
  const fields = useMemo(() => (effectiveCurrent?.templateSnapshot.sections || []).flatMap((section) => section.fields.map((field) => ({ ...field, sectionId: section.id || section.key, sectionTitle: section.title }))), [effectiveCurrent]);
  const whatsappUrl = link ? buildWhatsAppShareUrl(patient?.phone, link) : null;
  const emailUrl = link ? buildEmailShareUrl(patient?.email, link) : null;
  const authHeaders = async () => { const { data } = await supabase.auth.getSession(); return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}; };
  const load = async () => { if (!publicEffectFlags.patientAnamnesisLinkForms) return; setLoading(true); try { const response = await fetch(`/api/anamnesis-link-forms/requests?patient_id=${encodeURIComponent(patientId)}`, { headers: await authHeaders() }); const data = await response.json(); if (response.ok) setRequests(data.requests || []); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, [patientId, publicEffectFlags.patientAnamnesisLinkForms]);
  useEffect(() => { if (open && step === 'selection' && effectiveCurrent) setSelectedFields(fields.map((field) => field.id || field.key)); }, [open, step, effectiveCurrent, fields]);

  if (!publicEffectFlags.patientAnamnesisLinkForms) return null;

  const openSelection = async () => {
    setNotice('');
    setCopyFeedback(false);
    if (link) { setStep('link'); setOpen(true); return; }
    if (current?.status === 'completed') { setNotice('Reabra a Anamnese como rascunho antes de enviar um formulário.'); return; }
    setBusy(true);
    try {
      const ensured = effectiveCurrent || await onEnsureCurrent?.();
      if (!ensured) throw new Error('Selecione um modelo de Anamnese antes de iniciar o envio.');
      if (ensured.status === 'completed') throw new Error('Reabra a Anamnese como rascunho antes de enviar um formulário.');
      setActiveCurrent(ensured);
      setStep('selection');
      setOpen(true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Não foi possível iniciar o envio.');
    } finally { setBusy(false); }
  };

  const create = async () => {
    if (!effectiveCurrent || selectedFields.length === 0) return;
    setBusy(true); setNotice('');
    try {
      const response = await fetch('/api/anamnesis-link-forms/requests', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify({ patientId, targetAnamnesisId: effectiveCurrent.id, templateId: effectiveCurrent.templateId, templateVersionId: effectiveCurrent.templateVersionId, respondentType, expiryHours, fieldIds: selectedFields }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível gerar o link.');
      setLink(data.link); setQr(await QRCode.toDataURL(data.link, { width: 280, margin: 2, errorCorrectionLevel: 'M' })); setStep('link'); await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Não foi possível gerar o link.'); }
    finally { setBusy(false); }
  };

  const handleCopyLink = async () => {
    if (!link) return;
    try {
      await copyText(link); setNotice(''); setCopyFeedback(true);
      if (copyFeedbackTimerRef.current !== null) window.clearTimeout(copyFeedbackTimerRef.current);
      copyFeedbackTimerRef.current = window.setTimeout(() => setCopyFeedback(false), 2400);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Não foi possível copiar o link.'); }
  };

  const startAnother = () => { setStep('selection'); setLink(''); setQr(''); setNotice(''); setCopyFeedback(false); };
  const revoke = async (id: string) => { if (!window.confirm('Revogar este link? O rascunho será preservado.')) return; setBusy(true); try { await fetch(`/api/anamnesis-link-forms/requests/${id}/revoke`, { method: 'POST', headers: await authHeaders() }); await load(); } finally { setBusy(false); } };
  const openReview = async (id: string) => { setBusy(true); try { const response = await fetch(`/api/anamnesis-link-forms/requests/${id}`, { headers: await authHeaders() }); if (response.ok) setReview(await response.json()); } finally { setBusy(false); } };
  const incorporate = async (fieldIds: string[], action: 'field' | 'section' | 'all') => { if (!review) return; setBusy(true); try { const response = await fetch(`/api/anamnesis-link-forms/requests/${review.request.id}/incorporate`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify({ fieldIds, action }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Não foi possível incorporar.'); setNotice('Resposta incorporada sem concluir a Anamnese.'); await openReview(review.request.id); await load(); } catch (error) { setNotice(error instanceof Error ? error.message : 'Não foi possível incorporar.'); } finally { setBusy(false); } };

  return <section className="card space-y-4 border border-brand-primary/20 bg-gradient-to-br from-brand-primary/[0.04] to-white p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 text-sm font-bold text-brand-text"><Link2 size={17} className="text-brand-primary" />Formulários via link</h2><p className="mt-1 max-w-xl text-xs leading-relaxed text-brand-text-muted">Envie parte desta Anamnese para o paciente ou responsável. A resposta ficará pendente de revisão e não conclui nem atualiza o cadastro automaticamente.</p></div><button type="button" disabled={effectiveCurrent?.status === 'completed' || busy} onClick={() => void openSelection()} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-brand-primary px-3.5 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{busy && !open ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}Enviar para preenchimento</button></div>
    {!effectiveCurrent && <p className="rounded-xl border border-brand-primary/15 bg-brand-primary/5 px-3 py-2 text-xs leading-relaxed text-brand-text-muted">A Anamnese será iniciada como rascunho com o modelo selecionado quando você abrir o envio.</p>}
    {current?.status === 'completed' && <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">Esta Anamnese está concluída. Reabra-a como rascunho para enviar um formulário sem alterar o registro concluído.</p>}
    {notice && !open && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{notice}</p>}
    {loading && <p className="flex items-center gap-2 text-xs text-brand-text-muted"><Loader2 size={14} className="animate-spin" />Carregando solicitações...</p>}
    {requests.length > 0 && <div className="space-y-2">{requests.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-border/70 bg-white p-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${statusClasses[item.status] || statusClasses.awaiting}`}>{item.statusLabel}</span><span className="text-xs font-semibold text-brand-text">{item.respondent_type === 'responsible' ? 'Responsável' : 'Paciente'}</span></div><p className="mt-1 text-[10px] text-brand-text-muted">Criado em {formatDate(item.created_at)} · expira em {formatDate(item.expires_at)}</p></div><div className="flex flex-wrap items-center gap-2">{['responded', 'incorporated'].includes(item.status) && <button type="button" onClick={() => void openReview(item.id)} className="rounded-lg border border-brand-primary/30 px-2.5 py-2 text-[11px] font-bold text-brand-primary">Revisar resposta</button>}{!['expired', 'revoked', 'incorporated'].includes(item.status) && <button type="button" onClick={() => void revoke(item.id)} className="rounded-lg border border-red-200 px-2.5 py-2 text-[11px] font-bold text-red-700">Revogar</button>}</div></div>)}</div>}
    {requests.length === 0 && !loading && <p className="text-xs text-brand-text-muted">Nenhuma solicitação enviada para este paciente.</p>}

    {open && <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true" aria-labelledby="anamnesis-link-share-title"><div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:p-7"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wider text-brand-primary">Formulário via link</p><h3 id="anamnesis-link-share-title" className="mt-1 text-xl font-bold text-brand-text">Enviar Anamnese para preenchimento</h3><p className="mt-2 max-w-xl text-sm leading-relaxed text-brand-text-muted">Escolha como deseja compartilhar o formulário com o paciente ou responsável.</p></div><button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 text-brand-text-muted hover:bg-brand-bg" aria-label="Fechar"><X size={18} /></button></div>{step === 'selection' ? <div className="mt-6 space-y-5"><div><label className="mb-2 block text-xs font-bold text-brand-text">Quem responderá?</label><div className="grid grid-cols-2 gap-2">{[['patient', 'Paciente'], ['responsible', 'Responsável']].map(([value, label]) => <button type="button" key={value} onClick={() => setRespondentType(value as 'patient' | 'responsible')} className={`rounded-xl border px-3 py-3 text-sm font-bold ${respondentType === value ? 'border-brand-primary bg-brand-primary/10 text-brand-primary' : 'border-brand-border text-brand-text'}`}>{label}</button>)}</div></div><div><label className="mb-2 block text-xs font-bold text-brand-text" htmlFor="expiry">Expiração</label><select id="expiry" value={expiryHours} onChange={(event) => setExpiryHours(Number(event.target.value))} className="w-full rounded-xl border border-brand-border px-3 py-3 text-sm"><option value={24}>24 horas</option><option value={72}>3 dias</option><option value={168}>7 dias</option><option value={336}>14 dias</option><option value={720}>30 dias</option></select></div><fieldset><legend className="mb-2 block text-xs font-bold text-brand-text">Seções e campos enviados</legend><div className="max-h-64 space-y-2 overflow-y-auto rounded-2xl border border-brand-border p-3">{fields.map((field) => { const id = field.id || field.key; const checked = selectedFields.includes(id); return <label key={id} className="flex items-start gap-2 rounded-xl px-2 py-2 text-xs hover:bg-brand-bg"><input type="checkbox" checked={checked} onChange={(event) => setSelectedFields((currentFields) => event.target.checked ? [...currentFields, id] : currentFields.filter((item) => item !== id))} className="mt-0.5 h-4 w-4 accent-brand-primary" /><span><strong>{field.sectionTitle}:</strong> {field.label}{field.patientReference && <span className="ml-1 text-brand-text-muted">(pergunta em branco)</span>}</span></label>; })}</div></fieldset>{notice && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700" role="alert">{notice}</p>}<button type="button" disabled={busy || selectedFields.length === 0} onClick={() => void create()} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{busy ? <Loader2 size={17} className="animate-spin" /> : <ShieldCheck size={17} />}Gerar solicitação segura</button></div> : <div className="mt-6 space-y-5"><div className="grid gap-3 sm:grid-cols-3"><ShareOption label="Enviar pelo WhatsApp" icon={MessageCircle} href={whatsappUrl} disabled={!whatsappUrl} description={whatsappUrl ? 'Abrir conversa' : 'Este paciente não possui WhatsApp cadastrado. Adicione o número no perfil do paciente.'} /><ShareOption label="Enviar por e-mail" icon={Mail} href={emailUrl} disabled={!emailUrl} description={emailUrl ? 'Abrir cliente de e-mail' : 'Este paciente não possui e-mail cadastrado. Adicione o endereço no perfil do paciente.'} /><ShareOption label={copyFeedback ? 'Link copiado' : 'Copiar link'} icon={Copy} onClick={() => void handleCopyLink()} description="Disponível sempre que o link for criado" /></div><div className="grid gap-6 md:grid-cols-[1fr_auto]"><div><p className="text-sm leading-relaxed text-brand-text-muted">A solicitação foi criada. WhatsApp e e-mail não incluem informações clínicas; o paciente receberá apenas o link seguro.</p><div className="mt-4 flex gap-2"><input readOnly value={link} aria-label="Link público do formulário" className="min-w-0 flex-1 rounded-xl border border-brand-border bg-brand-bg px-3 py-2 text-xs" /><button type="button" onClick={() => void handleCopyLink()} className="rounded-xl bg-brand-primary px-3 py-2 text-white" aria-label={copyFeedback ? 'Link copiado' : 'Copiar link'}><Copy size={16} /></button></div><button type="button" onClick={startAnother} className="mt-5 inline-flex items-center gap-2 text-xs font-bold text-brand-primary"><RotateCcw size={14} />Criar outro envio</button></div>{qr && <div className="rounded-2xl border border-brand-border bg-white p-3 text-center"><img src={qr} alt="QR Code do link do formulário" className="h-48 w-48" /><p className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-brand-text-muted"><QrCode size={12} />QR Code</p></div>}</div></div>}</div></div>}
    {review && <div className="fixed inset-0 z-[131] flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true" aria-label="Revisar resposta"><div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:p-7"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wider text-brand-primary">Revisão profissional</p><h3 className="mt-1 text-xl font-bold text-brand-text">Resposta recebida</h3><p className="mt-1 text-xs text-brand-text-muted">A incorporação é explícita e não conclui a Anamnese.</p></div><button type="button" onClick={() => setReview(null)} className="rounded-lg p-2 text-brand-text-muted hover:bg-brand-bg" aria-label="Fechar"><X size={18} /></button></div><div className="mt-5 space-y-3">{(review.request.snapshot.sections || []).map((section: any) => <div key={section.id} className="rounded-2xl border border-brand-border/70 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-bold text-brand-text">{section.title}</h4><button type="button" disabled={busy || review.status === 'incorporated'} onClick={() => void incorporate(section.fields.map((field: any) => field.id), 'section')} className="text-[11px] font-bold text-brand-primary disabled:opacity-40">Usar respostas desta seção</button></div>{section.fields.map((field: any) => <div key={field.id} className="mt-3 grid gap-2 border-t border-brand-border/50 pt-3 md:grid-cols-2"><div><p className="text-[10px] font-bold uppercase tracking-wide text-brand-text-muted">Pergunta</p><p className="mt-1 text-xs font-semibold text-brand-text">{field.label}</p><p className="mt-2 text-[10px] text-brand-text-muted">Resposta atual na Anamnese</p><p className="text-xs text-brand-text">{String((effectiveCurrent?.answers || {})[field.id] ?? 'Não informado')}</p></div><div><p className="text-[10px] font-bold uppercase tracking-wide text-brand-text-muted">Resposta recebida</p><p className="mt-1 whitespace-pre-wrap text-xs text-brand-text">{String(review.response?.submitted_answers?.[field.id] ?? 'Não informado')}</p><button type="button" disabled={busy || review.status === 'incorporated'} onClick={() => void incorporate([field.id], 'field')} className="mt-2 rounded-lg border border-brand-primary/30 px-2.5 py-1.5 text-[11px] font-bold text-brand-primary disabled:opacity-40">Usar resposta</button></div></div>)}</div>)}<button type="button" disabled={busy || review.status === 'incorporated'} onClick={() => void incorporate(review.request.snapshot.sections.flatMap((section: any) => section.fields.map((field: any) => field.id)), 'all')} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 py-3 text-sm font-bold text-white disabled:opacity-50"><FileText size={16} />Incorporar respostas</button></div>{notice && <p className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">{notice}</p>}</div></div>}
  </section>;
}
