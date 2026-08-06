import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Mail, Pencil, RefreshCw, Save, X } from 'lucide-react';
import { supabase } from '../../supabaseClient';

type EmailTemplate = {
  key: string;
  label: string;
  source: string;
  subject_template: string;
  preheader_template: string | null;
  body_template: string;
  cta_label_template: string | null;
  sort_order: number;
};

type TemplateDraft = Pick<EmailTemplate, 'subject_template' | 'preheader_template' | 'body_template' | 'cta_label_template'>;

const TOKEN_HELP = 'Use variáveis entre chaves, por exemplo {{nome}}. Elas são substituídas automaticamente no envio.';

export default function EmailTransactionalTemplates() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<TemplateDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: loadError } = await supabase
        .from('email_templates')
        .select('key, label, source, subject_template, preheader_template, body_template, cta_label_template, sort_order')
        .order('sort_order');
      if (loadError) throw loadError;
      setTemplates((data || []) as EmailTemplate[]);
    } catch (loadError: any) {
      setError(loadError.message || 'Não foi possível carregar os modelos de e-mail.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  const startEditing = (template: EmailTemplate) => {
    setEditingKey(template.key);
    setDraft({
      subject_template: template.subject_template,
      preheader_template: template.preheader_template,
      body_template: template.body_template,
      cta_label_template: template.cta_label_template,
    });
  };

  const cancelEditing = () => {
    setEditingKey(null);
    setDraft(null);
  };

  const saveTemplate = async (template: EmailTemplate) => {
    if (!draft) return;
    setSaving(true);
    setError('');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const { error: saveError } = await supabase
        .from('email_templates')
        .update({
          subject_template: draft.subject_template.trim(),
          preheader_template: draft.preheader_template?.trim() || null,
          body_template: draft.body_template.trim(),
          cta_label_template: draft.cta_label_template?.trim() || null,
          updated_by: sessionData.session?.user.id || null,
        })
        .eq('key', template.key);
      if (saveError) throw saveError;
      await loadTemplates();
      cancelEditing();
    } catch (saveError: any) {
      setError(saveError.message || 'Não foi possível salvar o modelo de e-mail.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card overflow-hidden border border-brand-border/60 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-brand-border/40 p-5">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-brand-primary/10 p-2 text-brand-primary"><Mail size={20} /></span>
          <div>
            <h3 className="text-lg font-semibold text-brand-text">Modelos de E-mails Transacionais</h3>
            <p className="mt-0.5 text-xs text-brand-text-muted">Edite os modelos fixos usados nos disparos automáticos da plataforma.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-brand-text-muted">{templates.length} modelo{templates.length !== 1 ? 's' : ''}</span>
          <button type="button" onClick={() => void loadTemplates()} disabled={loading || saving} className="btn-outline inline-flex items-center gap-1.5 px-3 py-2 text-xs disabled:opacity-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />Atualizar
          </button>
        </div>
      </div>

      {error && (
        <div className="m-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 p-10 text-sm text-brand-text-muted"><Loader2 className="h-5 w-5 animate-spin" />Carregando modelos configurados...</div>
      ) : templates.length === 0 ? (
        <div className="p-10 text-center text-sm text-brand-text-muted">Nenhum modelo configurado.</div>
      ) : (
        <div className="divide-y divide-brand-border/30">
          {templates.map((template) => {
            const isEditing = editingKey === template.key;
            return (
              <div key={template.key} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <strong className="text-sm text-brand-text">{template.label}</strong>
                    <p className="mt-1 text-xs text-brand-text-muted">{template.source}</p>
                  </div>
                  {!isEditing && (
                    <button type="button" onClick={() => startEditing(template)} className="btn-outline inline-flex items-center gap-1.5 px-3 py-2 text-xs">
                      <Pencil size={14} />Editar conteúdo
                    </button>
                  )}
                </div>

                {isEditing && draft ? (
                  <div className="mt-4 space-y-3 rounded-xl bg-brand-bg/30 p-4">
                    <p className="text-xs text-brand-text-muted">{TOKEN_HELP}</p>
                    <label className="block text-xs font-semibold text-brand-text">Assunto
                      <input value={draft.subject_template} onChange={(event) => setDraft({ ...draft, subject_template: event.target.value })} className="mt-1.5 w-full rounded-xl border border-brand-border bg-white px-3 py-2 text-sm font-normal focus:border-brand-primary focus:outline-none" />
                    </label>
                    <label className="block text-xs font-semibold text-brand-text">Prévia
                      <input value={draft.preheader_template || ''} onChange={(event) => setDraft({ ...draft, preheader_template: event.target.value })} className="mt-1.5 w-full rounded-xl border border-brand-border bg-white px-3 py-2 text-sm font-normal focus:border-brand-primary focus:outline-none" />
                    </label>
                    <label className="block text-xs font-semibold text-brand-text">Conteúdo
                      <textarea value={draft.body_template} onChange={(event) => setDraft({ ...draft, body_template: event.target.value })} rows={5} className="mt-1.5 w-full resize-y rounded-xl border border-brand-border bg-white px-3 py-2 text-sm font-normal leading-relaxed focus:border-brand-primary focus:outline-none" />
                    </label>
                    <label className="block text-xs font-semibold text-brand-text">Texto do botão (opcional)
                      <input value={draft.cta_label_template || ''} onChange={(event) => setDraft({ ...draft, cta_label_template: event.target.value })} className="mt-1.5 w-full rounded-xl border border-brand-border bg-white px-3 py-2 text-sm font-normal focus:border-brand-primary focus:outline-none" />
                    </label>
                    <div className="flex flex-wrap justify-end gap-2">
                      <button type="button" onClick={cancelEditing} disabled={saving} className="btn-outline inline-flex items-center gap-1.5 px-3 py-2 text-xs disabled:opacity-50"><X size={14} />Cancelar</button>
                      <button type="button" onClick={() => void saveTemplate(template)} disabled={saving || !draft.subject_template.trim() || !draft.body_template.trim()} className="btn-primary inline-flex items-center gap-1.5 px-3 py-2 text-xs disabled:opacity-50">
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Salvar modelo
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 grid gap-3 rounded-xl bg-brand-bg/30 p-4 text-xs sm:grid-cols-2">
                    <div><span className="font-bold uppercase tracking-wide text-brand-text-muted">Assunto</span><p className="mt-1 text-brand-text">{template.subject_template}</p></div>
                    {template.preheader_template && <div><span className="font-bold uppercase tracking-wide text-brand-text-muted">Prévia</span><p className="mt-1 text-brand-text">{template.preheader_template}</p></div>}
                    <div className="sm:col-span-2"><span className="font-bold uppercase tracking-wide text-brand-text-muted">Conteúdo</span><p className="mt-1 whitespace-pre-wrap leading-relaxed text-brand-text">{template.body_template}</p></div>
                    {template.cta_label_template && <div className="sm:col-span-2"><span className="font-bold uppercase tracking-wide text-brand-text-muted">Botão</span><p className="mt-1 text-brand-text">{template.cta_label_template}</p></div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
