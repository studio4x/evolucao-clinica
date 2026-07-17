import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Loader2, Mail, Save, Bell, BellOff, AlertTriangle } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAuthStore } from '../store/authStore';

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
  unsubscribed_at: string | null;
  unsubscribe_reason: string | null;
};

export default function CommunicationPreferences() {
  const { user } = useAuthStore();
  const [preferences, setPreferences] = useState<Preferences>({ 
    product_education_enabled: true, 
    lifecycle_enabled: true, 
    commercial_enabled: true, 
    preferred_send_time: '08:30', 
    timezone: 'America/Sao_Paulo', 
    email_enabled: true, 
    push_enabled: true, 
    whatsapp_enabled: true, 
    whatsapp_number: '',
    unsubscribed_at: null,
    unsubscribe_reason: null
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  // Push states
  const [isPushSupported, setIsPushSupported] = useState(false);
  const [isPushSubscribed, setIsPushSubscribed] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission>('default');
  const [pushLoading, setPushLoading] = useState(false);

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

  // Checar suporte e estado de Push
  const checkPushSubscription = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setIsPushSupported(false);
      return;
    }
    setIsPushSupported(true);
    setPushPermission(Notification.permission);
    
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setIsPushSubscribed(!!sub);
    } catch (err) {
      console.error('Erro ao verificar inscricao de push:', err);
    }
  };

  useEffect(() => {
    checkPushSubscription();
  }, []);

  // Converter string VAPID para Uint8Array
  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  // Habilitar Notificações Push
  const subscribePush = async () => {
    if (!user) return;
    setPushLoading(true);
    try {
      // Solicitar permissao
      const permission = await Notification.requestPermission();
      setPushPermission(permission);
      
      if (permission !== 'granted') {
        throw new Error('Permissao de notificacao nao concedida.');
      }

      // Buscar VAPID public key da API do Express
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      
      const keyRes = await fetch('/api/notifications/vapid-public-key', {
        cache: 'no-store'
      });
      const { publicKey } = await keyRes.json();
      if (!publicKey) throw new Error('Falha ao obter chave publica VAPID do servidor.');

      const reg = await navigator.serviceWorker.ready;
      let applicationServerKey: Uint8Array;
      try {
        applicationServerKey = urlBase64ToUint8Array(String(publicKey).trim());
      } catch {
        throw new Error('Chave VAPID inválida recebida do servidor. Regrave as chaves Web Push no painel administrativo.');
      }
      
      // Inscrever no push manager
      let subscription;
      try {
        subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey
        });
      } catch (subscribeErr: any) {
        if (subscribeErr?.name === 'AbortError') {
          throw new Error('Falha ao registrar no serviço push do navegador. Verifique as chaves Web Push/VAPID configuradas no painel administrativo.');
        }
        throw subscribeErr;
      }

      // Salvar inscricao no backend Express
      const res = await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ subscription })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Erro ao registrar inscricao no servidor.');
      }

      setIsPushSubscribed(true);
    } catch (err: any) {
      console.error('Erro ao ativar push:', err);
      alert(err.message || 'Erro ao ativar notificações push.');
    } finally {
      setPushLoading(false);
    }
  };

  // Desativar Notificações Push
  const unsubscribePush = async () => {
    if (!user) return;
    setPushLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      
      if (sub) {
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;

        // Remover no servidor Express
        await fetch('/api/notifications/unsubscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ endpoint: sub.endpoint })
        });

        // Cancelar inscricao no navegador
        await sub.unsubscribe();
      }
      
      setIsPushSubscribed(false);
    } catch (err: any) {
      console.error('Erro ao desativar push:', err);
      alert('Erro ao desativar notificações push.');
    } finally {
      setPushLoading(false);
    }
  };

  const save = async () => {
    setSaving(true); setSaved(false); setError('');
    try {
      const { data } = await supabase.auth.getSession();
      const response = await fetch('/api/communication/preferences', { 
        method: 'PUT', 
        headers: { 
          'Content-Type': 'application/json', 
          Authorization: 'Bearer ' + (data.session?.access_token || '') 
        }, 
        body: JSON.stringify(preferences) 
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Falha ao salvar preferências.');
      setPreferences((current) => ({ ...current, ...payload.preferences })); setSaved(true);
    } catch (err: any) { 
      setError(err.message || 'Falha ao salvar preferências.'); 
    } finally { 
      setSaving(false); 
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-brand-primary" /></div>;

  return (
    <div className="min-h-screen bg-brand-bg px-4 py-10">
      <div className="max-w-2xl mx-auto space-y-6">
        
        {/* Card 1: Preferências de comunicação */}
        <div className="bg-white rounded-2xl border border-brand-border shadow-sm p-6 md:p-8">
          <div className="flex items-start gap-3 mb-6">
            <div className="p-3 rounded-xl bg-brand-primary/10 text-brand-primary">
              <Mail size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-brand-text">Preferências de comunicação</h1>
              <p className="text-sm text-brand-text-muted mt-1">Escolha quais mensagens de relacionamento deseja receber.</p>
            </div>
          </div>

          {preferences.unsubscribed_at ? (
            <div className="bg-amber-50 border border-amber-200/80 p-4 rounded-xl flex gap-3 text-amber-800 mb-6 animate-fade-in">
              <AlertTriangle className="flex-shrink-0 mt-0.5 text-amber-600" size={18} />
              <div className="text-sm space-y-1">
                <p className="font-semibold text-amber-900">E-mails de Relacionamento Desativados</p>
                <p>
                  Você solicitou o descadastro em{' '}
                  <span className="font-medium">
                    {new Date(preferences.unsubscribed_at).toLocaleDateString('pt-BR')}
                  </span>.
                </p>
                <p className="text-xs text-amber-700/80 mt-1">
                  Para voltar a receber novidades e orientações de ativação, basta marcar os canais desejados abaixo e salvar as preferências.
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl flex gap-3 text-emerald-800 mb-6">
              <Check className="flex-shrink-0 mt-0.5 text-emerald-600" size={18} />
              <div className="text-sm space-y-1">
                <p className="font-semibold text-emerald-900">Cadastro de E-mail Ativo</p>
                <p className="text-xs text-emerald-700">Seu e-mail está habilitado para receber mensagens de relacionamento e novidades.</p>
              </div>
            </div>
          )}
          
          {error && <p className="mb-4 rounded-lg bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</p>}
          
          <div className="space-y-4">
            {([
              ['lifecycle_enabled', 'Jornada de Usuários', 'Orientações de ativação e próximos passos.'], 
              ['product_education_enabled', 'Conteúdo educativo', 'Dicas para conhecer os recursos da plataforma.'], 
              ['commercial_enabled', 'Mensagens comerciais', 'Avisos sobre teste, planos e continuidade.']
            ] as const).map(([key, label, description]) => (
              <label key={key} className="flex items-start justify-between gap-4 rounded-xl border border-brand-border p-4 cursor-pointer">
                <span>
                  <span className="font-semibold text-brand-text block">{label}</span>
                  <span className="text-sm text-brand-text-muted">{description}</span>
                </span>
                <input 
                  type="checkbox" 
                  className="mt-1 h-5 w-5 accent-brand-primary" 
                  checked={Boolean(preferences[key])} 
                  onChange={(event) => setPreferences({ ...preferences, [key]: event.target.checked })} 
                />
              </label>
            ))}
            
            <label className="block">
              <span className="text-sm font-semibold text-brand-text">Horário preferido</span>
              <input 
                type="time" 
                value={preferences.preferred_send_time || ''} 
                onChange={(event) => setPreferences({ ...preferences, preferred_send_time: event.target.value })} 
                className="mt-1 w-full rounded-lg border border-brand-border px-3 py-2" 
              />
            </label>
            
            <label className="block">
              <span className="text-sm font-semibold text-brand-text">Fuso horário</span>
              <input 
                value={preferences.timezone} 
                onChange={(event) => setPreferences({ ...preferences, timezone: event.target.value })} 
                className="mt-1 w-full rounded-lg border border-brand-border px-3 py-2" 
              />
            </label>
            
            <div className="pt-4 border-t border-brand-border mt-6">
              <h3 className="text-sm font-bold text-brand-text mb-3">Canais de recebimento</h3>
              <div className="space-y-3">
                {([
                  ['email_enabled', 'E-mail', 'Receba as orientações em sua caixa de entrada.'], 
                  ['push_enabled', 'Notificação Push', 'Receba notificações diretamente no seu navegador.'], 
                  ['whatsapp_enabled', 'WhatsApp', 'Receba mensagens de relacionamento no seu celular.']
                ] as const).map(([key, label, description]) => (
                  <div key={key} className="space-y-2">
                    <label className="flex items-start justify-between gap-4 rounded-xl border border-brand-border p-4 cursor-pointer">
                      <span>
                        <span className="font-semibold text-brand-text block">{label}</span>
                        <span className="text-sm text-brand-text-muted">{description}</span>
                      </span>
                      <input 
                        type="checkbox" 
                        className="mt-1 h-5 w-5 accent-brand-primary" 
                        checked={Boolean(preferences[key])} 
                        onChange={(event) => setPreferences({ ...preferences, [key]: event.target.checked })} 
                      />
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
          
          <div className="flex items-center justify-between mt-8">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-sm">
              <Link to="/painel/notifications" className="text-brand-primary hover:underline font-medium">Voltar às Notificações</Link>
              <span className="hidden sm:inline text-brand-text-muted/40">|</span>
              <Link to="/painel/profile" className="text-brand-text-muted hover:underline text-xs">Voltar ao perfil</Link>
            </div>
            <div className="flex items-center gap-3">
              {saved && <span className="text-sm text-emerald-600 flex items-center gap-1"><Check size={16} /> Salvo</span>}
              <button 
                onClick={() => void save()} 
                disabled={saving} 
                className="btn-primary inline-flex items-center gap-2"
              >
                <Save size={16} />
                {saving ? 'Salvando...' : 'Salvar preferências'}
              </button>
            </div>
          </div>
        </div>

        {/* Card 2: Notificações no Navegador */}
        <div className="bg-white rounded-2xl border border-brand-border shadow-sm p-6 md:p-8 space-y-5">
          <h3 className="text-lg font-semibold text-brand-text flex items-center space-x-2">
            <Bell className="text-brand-primary w-5 h-5" />
            <span>Notificações no Navegador</span>
          </h3>
          
          {!isPushSupported ? (
            <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl flex gap-3 text-amber-800">
              <AlertTriangle className="flex-shrink-0 mt-0.5" size={18} />
              <div className="text-xs space-y-1">
                <p className="font-semibold">Navegador não suportado</p>
                <p>Seu navegador atual ou modo de navegação privada não possui suporte a notificações push nativas.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-brand-bg/50 p-4 rounded-xl border border-brand-border/40">
                <div>
                  <p className="text-xs font-semibold text-brand-text">Status do Browser</p>
                  <p className="text-xs text-brand-text-muted mt-0.5">
                    {pushPermission === 'granted' ? 'Permitido ✅' :
                     pushPermission === 'denied' ? 'Bloqueado ❌' : 'Não Solicitado 🔔'}
                  </p>
                </div>
                
                {pushPermission === 'denied' && (
                  <span className="text-[10px] text-red-600 bg-red-50 px-2 py-1 rounded font-medium border border-red-100">Desbloqueie no cadeado</span>
                )}
              </div>

              <div className="space-y-3">
                {isPushSubscribed ? (
                  <button
                    onClick={unsubscribePush}
                    disabled={pushLoading}
                    className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 font-medium transition-colors text-sm disabled:opacity-50"
                  >
                    {pushLoading ? <Loader2 className="animate-spin" size={18} /> : <BellOff size={18} />}
                    <span>Desativar Notificações Push</span>
                  </button>
                ) : (
                  <button
                    onClick={subscribePush}
                    disabled={pushLoading || pushPermission === 'denied'}
                    className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-brand-primary text-white hover:bg-brand-primary-dark font-medium transition-colors text-sm disabled:opacity-50"
                  >
                    {pushLoading ? <Loader2 className="animate-spin" size={18} /> : <Bell size={18} />}
                    <span>Ativar Notificações Push</span>
                  </button>
                )}
                
                <p className="text-[10px] text-brand-text-muted leading-relaxed text-center">
                  Permite receber notificações do app diretamente na área de trabalho ou tela de bloqueio do celular, mesmo que o navegador esteja fechado.
                </p>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
