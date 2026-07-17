import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Loader2, Mail, Save } from 'lucide-react';
import { supabase } from '../supabaseClient';

type Preferences = {
  product_education_enabled: boolean;
  lifecycle_enabled: boolean;
  commercial_enabled: boolean;
  preferred_send_time: string | null;
  timezone: string;
  email_enabled: boolean;
  push_enabled: boolean;
  whatsapp_enabled: boolean;
  whatsapp_number: string | null;
};

export default function CommunicationPreferences() {
  const [preferences, setPreferences] = useState<Preferences>({ product_education_enabled: true, lifecycle_enabled: true, commercial_enabled: true, preferred_send_time: '08:30', timezone: 'America/Sao_Paulo', email_enabled: true, push_enabled: true, whatsapp_enabled: true, whatsapp_number: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) { setLoading(false); return; }
      try {
        const response = await fetch('/api/communication/preferences', { headers: { Authorization: 'Bearer ' + token } });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Falha ao carregar preferências.');
        setPreferences((current) => ({ ...current, ...payload.preferences }));
      } catch (err: any) {
        setError(err.message || 'Falha ao carregar preferências.');
      } finally { setLoading(false); }
    })();
  }, []);

  const save = async () => {
    setSaving(true); setSaved(false); setError('');
    try {
      const { data } = await supabase.auth.getSession();
      const response = await fetch('/api/communication/preferences', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (data.session?.access_token || '') }, body: JSON.stringify(preferences) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Falha ao salvar preferências.');
      setPreferences((current) => ({ ...current, ...payload.preferences })); setSaved(true);
    } catch (err: any) { setError(err.message || 'Falha ao salvar preferências.'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-brand-primary" /></div>;

  return <div className="min-h-screen bg-brand-bg px-4 py-10"><div className="max-w-2xl mx-auto bg-white rounded-2xl border border-brand-border shadow-sm p-6 md:p-8">
    <div className="flex items-start gap-3 mb-6"><div className="p-3 rounded-xl bg-brand-primary/10 text-brand-primary"><Mail size={22} /></div><div><h1 className="text-2xl font-bold text-brand-text">Preferências de comunicação</h1><p className="text-sm text-brand-text-muted mt-1">Escolha quais mensagens de relacionamento deseja receber.</p></div></div>
    {error && <p className="mb-4 rounded-lg bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</p>}
    <div className="space-y-4">
      {([['lifecycle_enabled', 'Jornada de Usuários', 'Orientações de ativação e próximos passos.'], ['product_education_enabled', 'Conteúdo educativo', 'Dicas para conhecer os recursos da plataforma.'], ['commercial_enabled', 'Mensagens comerciais', 'Avisos sobre teste, planos e continuidade.']] as const).map(([key, label, description]) => <label key={key} className="flex items-start justify-between gap-4 rounded-xl border border-brand-border p-4 cursor-pointer"><span><span className="font-semibold text-brand-text block">{label}</span><span className="text-sm text-brand-text-muted">{description}</span></span><input type="checkbox" className="mt-1 h-5 w-5 accent-brand-primary" checked={Boolean(preferences[key])} onChange={(event) => setPreferences({ ...preferences, [key]: event.target.checked })} /></label>)}
      <label className="block"><span className="text-sm font-semibold text-brand-text">Horário preferido</span><input type="time" value={preferences.preferred_send_time || ''} onChange={(event) => setPreferences({ ...preferences, preferred_send_time: event.target.value })} className="mt-1 w-full rounded-lg border border-brand-border px-3 py-2" /></label>
      <label className="block"><span className="text-sm font-semibold text-brand-text">Fuso horário</span><input value={preferences.timezone} onChange={(event) => setPreferences({ ...preferences, timezone: event.target.value })} className="mt-1 w-full rounded-lg border border-brand-border px-3 py-2" /></label>
      <div className="pt-4 border-t border-brand-border mt-6">
        <h3 className="text-sm font-bold text-brand-text mb-3">Canais de recebimento</h3>
        <div className="space-y-3">
          {([['email_enabled', 'E-mail', 'Receba as orientações em sua caixa de entrada.'], ['push_enabled', 'Notificação Push', 'Receba notificações diretamente no seu navegador.'], ['whatsapp_enabled', 'WhatsApp', 'Receba mensagens de relacionamento no seu celular.']] as const).map(([key, label, description]) => (
            <div key={key} className="space-y-2">
              <label className="flex items-start justify-between gap-4 rounded-xl border border-brand-border p-4 cursor-pointer">
                <span>
                  <span className="font-semibold text-brand-text block">{label}</span>
                  <span className="text-sm text-brand-text-muted">{description}</span>
                </span>
                <input type="checkbox" className="mt-1 h-5 w-5 accent-brand-primary" checked={Boolean(preferences[key])} onChange={(event) => setPreferences({ ...preferences, [key]: event.target.checked })} />
              </label>
              {key === 'whatsapp_enabled' && preferences.whatsapp_enabled && (
                <div className="pl-4 pr-2 pb-2">
                  <label className="block">
                    <span className="text-xs font-semibold text-brand-text">Número do WhatsApp (DDI + DDD + Número)</span>
                    <input 
                      type="tel"
                      placeholder="Ex: 5511999999999" 
                      value={preferences.whatsapp_number || ''} 
                      onChange={(event) => setPreferences({ ...preferences, whatsapp_number: event.target.value })} 
                      className="mt-1 w-full rounded-lg border border-brand-border px-3 py-1.5 text-sm" 
                    />
                  </label>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
    <div className="flex items-center justify-between mt-8"><Link to="/painel/profile" className="text-sm text-brand-primary hover:underline">Voltar ao perfil</Link><div className="flex items-center gap-3">{saved && <span className="text-sm text-emerald-600 flex items-center gap-1"><Check size={16} /> Salvo</span>}<button onClick={() => void save()} disabled={saving} className="btn-primary inline-flex items-center gap-2"><Save size={16} />{saving ? 'Salvando...' : 'Salvar preferências'}</button></div></div>
  </div></div>;
}
