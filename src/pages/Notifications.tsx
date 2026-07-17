import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuthStore } from '../store/authStore';
import { 
  Bell, BellOff, CheckCheck, Trash2, Mail, Settings, Shield, 
  Info, AlertTriangle, CheckCircle2, XCircle, Loader2 
} from 'lucide-react';

interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  read_at: string | null;
  link: string | null;
  image_url: string | null;
  created_at: string;
}

export default function Notifications() {
  const { user, profileRole } = useAuthStore();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  
  // SMTP settings states (for admin)
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpFrom, setSmtpFrom] = useState('');
  const [vapidPublic, setVapidPublic] = useState('');
  const [vapidPrivate, setVapidPrivate] = useState('');
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [smtpSuccess, setSmtpSuccess] = useState(false);
 
  // Test email states
  const [testEmailTarget, setTestEmailTarget] = useState('');
  const [testEmailSending, setTestEmailSending] = useState(false);
  const [testEmailStatus, setTestEmailStatus] = useState<'success' | 'error' | null>(null);
  const [testEmailMessage, setTestEmailMessage] = useState('');
 
  const handleSendTestEmail = async () => {
    if (!testEmailTarget) return;
    setTestEmailSending(true);
    setTestEmailStatus(null);
    setTestEmailMessage('');
 
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
 
      const res = await fetch('/api/notifications/test-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          toEmail: testEmailTarget,
          smtpHost: smtpHost,
          smtpPort: smtpPort,
          smtpUser: smtpUser,
          smtpPass: smtpPass,
          smtpFrom: smtpFrom
        })
      });
 
      const data = await res.json().catch(() => ({}));
 
      if (res.ok) {
        setTestEmailStatus('success');
        setTestEmailMessage('E-mail de teste enviado com sucesso!');
      } else {
        setTestEmailStatus('error');
        setTestEmailMessage(data.error || 'Erro ao enviar e-mail de teste.');
      }
    } catch (err: any) {
      setTestEmailStatus('error');
      setTestEmailMessage(err.message || 'Falha na conexão.');
    } finally {
      setTestEmailSending(false);
    }
  };

  // 1. Carregar Notificações do Banco
  const fetchNotifications = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      setNotifications(data || []);
    } catch (err) {
      console.error('Erro ao buscar notificacoes:', err);
    } finally {
      setLoading(false);
    }
  };

  // 2. Carregar Configurações SMTP (Apenas Admin)
  const fetchSmtpSettings = async () => {
    if (profileRole !== 'admin') return;
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('api_key')
        .eq('id', 'notification_settings')
        .single();
        
      if (!error && data && data.api_key) {
        const parsed = JSON.parse(data.api_key);
        setSmtpHost(parsed.smtp_host || '');
        setSmtpPort(parsed.smtp_port || '587');
        setSmtpUser(parsed.smtp_user || '');
        setSmtpPass(parsed.smtp_pass || '');
        setSmtpFrom(parsed.smtp_from || '');
        setVapidPublic(parsed.vapid_public_key || '');
        setVapidPrivate(parsed.vapid_private_key || '');
      }
    } catch (err) {
      console.error('Erro ao buscar configuracoes SMTP:', err);
    }
  };

  useEffect(() => {
    if (user) {
      fetchNotifications();
      fetchSmtpSettings();

      // Realtime subscription para receber novas notificacoes instantaneamente
      const channel = supabase
        .channel('realtime:notifications')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
          () => {
            fetchNotifications();
          }
        )
        .subscribe();

      return () => {
        void supabase.removeChannel(channel);
      };
    }
  }, [user, profileRole]);

  // A lógica de Notificações Push foi migrada para a página de preferências.

  // 6. Marcar Notificação específica como lida
  const markAsRead = async (id: string) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', id);
        
      if (error) throw error;
      setNotifications(prev => 
        prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n)
      );
    } catch (err) {
      console.error('Erro ao marcar como lida:', err);
    }
  };

  // 7. Marcar todas como lidas
  const markAllAsRead = async () => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', user?.id)
        .is('read_at', null);
        
      if (error) throw error;
      setNotifications(prev => prev.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
    } catch (err) {
      console.error('Erro ao marcar todas como lidas:', err);
    }
  };

  // 8. Limpar todas as notificações
  const clearAllNotifications = async () => {
    if (!confirm('Deseja realmente excluir todas as suas notificações?')) return;
    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('user_id', user?.id);
        
      if (error) throw error;
      setNotifications([]);
    } catch (err) {
      console.error('Erro ao excluir notificações:', err);
    }
  };

  // 9. Salvar Configurações SMTP (Admin)
  const saveSmtpSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSmtpSaving(true);
    setSmtpSuccess(false);

    try {
      const settings = {
        smtp_host: smtpHost,
        smtp_port: smtpPort,
        smtp_user: smtpUser,
        smtp_pass: smtpPass,
        smtp_from: smtpFrom,
        vapid_public_key: vapidPublic,
        vapid_private_key: vapidPrivate,
        vapid_subject: `mailto:${smtpUser || 'contato@evolucaoclinica.app.br'}`
      };

      const { error } = await supabase
        .from('settings')
        .upsert({
          id: 'notification_settings',
          api_key: JSON.stringify(settings),
          updated_at: new Date().toISOString(),
          updated_by: user?.email || 'admin'
        });

      if (error) throw error;
      setSmtpSuccess(true);
      setTimeout(() => setSmtpSuccess(false), 3000);
    } catch (err) {
      console.error('Erro ao salvar configuracoes SMTP:', err);
      alert('Erro ao salvar configurações do servidor.');
    } finally {
      setSmtpSaving(false);
    }
  };

  // A função de enviar notificação de teste geral foi removida (o SMTP ainda possui teste de e-mail SMTP individual no formulário do administrador).

  // Formatar data
  const formatDate = (dateString: string) => {
    const d = new Date(dateString);
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Unread count
  const unreadCount = notifications.filter(n => !n.read_at).length;

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-display font-bold text-brand-primary">Central de Notificações</h1>
        <p className="text-brand-text-muted mt-1">Gerencie seus alertas na plataforma, notificações push e configurações de e-mail.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Lado Esquerdo: Lista de Notificações In-App (2/3 de largura no desktop) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl border border-brand-border/60 shadow-sm p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-brand-border/40 pb-4 mb-6">
              <div className="flex items-center space-x-2">
                <Bell className="text-brand-primary w-5 h-5" />
                <h2 className="text-lg font-semibold text-brand-text">Notificações Recentes</h2>
                {unreadCount > 0 && (
                  <span className="bg-brand-primary text-white text-xs font-semibold px-2 py-0.5 rounded-full">
                    {unreadCount} não {unreadCount === 1 ? 'lida' : 'lidas'}
                  </span>
                )}
              </div>
              
              {notifications.length > 0 && (
                <div className="flex items-center gap-3">
                  <button 
                    onClick={markAllAsRead}
                    disabled={unreadCount === 0}
                    className="flex items-center space-x-1.5 text-sm text-brand-primary hover:text-brand-primary-dark font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <CheckCheck size={16} />
                    <span>Ler todas</span>
                  </button>
                  <span className="text-brand-border/40">|</span>
                  <button 
                    onClick={clearAllNotifications}
                    className="flex items-center space-x-1.5 text-sm text-red-600 hover:text-red-700 font-medium transition-colors"
                  >
                    <Trash2 size={16} />
                    <span>Limpar histórico</span>
                  </button>
                </div>
              )}
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 space-y-3">
                <Loader2 className="w-8 h-8 text-brand-primary animate-spin" />
                <p className="text-brand-text-muted text-sm">Carregando notificações...</p>
              </div>
            ) : notifications.length === 0 ? (
              <div className="text-center py-16 space-y-4">
                <div className="w-16 h-16 bg-brand-bg rounded-full flex items-center justify-center mx-auto text-brand-text-muted">
                  <BellOff size={28} />
                </div>
                <div className="max-w-xs mx-auto">
                  <h3 className="font-semibold text-brand-text">Nenhuma notificação por aqui</h3>
                  <p className="text-sm text-brand-text-muted mt-1">Você está em dia com seus prontuários e alertas do sistema!</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3.5 max-h-[550px] overflow-y-auto pr-1">
                {notifications.map((item) => {
                  const Icon = 
                    item.type === 'success' ? CheckCircle2 :
                    item.type === 'error' ? XCircle :
                    item.type === 'warning' ? AlertTriangle : Info;
                    
                  const colorClass = 
                    item.type === 'success' ? 'text-emerald-500 bg-emerald-50 border-emerald-100' :
                    item.type === 'error' ? 'text-red-500 bg-red-50 border-red-100' :
                    item.type === 'warning' ? 'text-amber-500 bg-amber-50 border-amber-100' :
                    'text-brand-primary bg-brand-bg border-brand-border';

                  return (
                    <div 
                      key={item.id} 
                      onClick={() => !item.read_at && markAsRead(item.id)}
                      className={`py-4 px-4 flex gap-4 items-start transition-all rounded-xl hover:bg-brand-bg/30 cursor-pointer border shadow-sm ${!item.read_at ? 'bg-brand-primary/5 border-brand-primary/20 border-l-4 border-l-brand-primary' : 'bg-white border-brand-border/50'}`}
                    >
                      <div className={`p-2 rounded-lg border flex-shrink-0 ${colorClass}`}>
                        <Icon size={18} />
                      </div>
                      
                      <div className="min-w-0 flex-1 space-y-3">
                        {item.image_url && (
                          <div className="w-full overflow-hidden rounded-xl border border-brand-border/40 shadow-sm bg-brand-bg/20">
                            <img
                              src={item.image_url}
                              alt="Capa da notificação"
                              className="block w-full h-auto max-h-64 object-cover md:max-h-72"
                            />
                          </div>
                        )}

                        <div className="flex items-start justify-between gap-2">
                          <p className={`min-w-0 flex-1 text-sm font-semibold leading-snug break-words ${!item.read_at ? 'text-brand-primary font-bold' : 'text-brand-text'}`}>
                            {item.title}
                          </p>
                          <span className="text-[10px] text-brand-text-muted flex-shrink-0 whitespace-nowrap pt-0.5">{formatDate(item.created_at)}</span>
                        </div>
                        <p className="text-sm text-brand-text-muted leading-relaxed break-words whitespace-pre-line md:line-clamp-2">
                          {item.message}
                        </p>

                        {item.link && (
                          <a 
                            href={item.link} 
                            onClick={(e) => e.stopPropagation()} 
                            className="inline-block text-xs font-semibold text-brand-primary hover:underline mt-2.5"
                          >
                            Ver detalhes &rarr;
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Lado Direito: Controles Push & SMTP Admin (1/3 de largura) */}
        <div className="space-y-6">
          
          {/* Caixa de Preferências de Comunicação */}
          <div className="bg-white rounded-2xl border border-brand-border/60 shadow-sm p-6 space-y-4">
            <h3 className="text-lg font-semibold text-brand-text flex items-center space-x-2">
              <Mail className="text-brand-primary w-5 h-5" />
              <span>Preferências de Comunicação</span>
            </h3>
            <p className="text-xs text-brand-text-muted leading-relaxed">
              Gerencie quais e-mails, alertas e mensagens de WhatsApp você deseja receber da plataforma, além de configurar notificações push nativas no seu navegador.
            </p>
            <Link
              to="/painel/preferencias-de-comunicacao"
              className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-brand-primary text-white hover:bg-brand-primary-dark font-semibold text-sm transition-all"
            >
              <span>Gerenciar Preferências</span>
            </Link>
          </div>

          {/* Configurações de SMTP para Administrador */}
          {profileRole === 'admin' && (
            <form onSubmit={saveSmtpSettings} className="bg-white rounded-2xl border border-brand-border/60 shadow-sm p-6 space-y-4">
              <h3 className="text-lg font-semibold text-brand-text flex items-center space-x-2">
                <Settings className="text-brand-primary w-5 h-5" />
                <span>Configurar Servidor SMTP</span>
              </h3>
              
              <p className="text-xs text-brand-text-muted">
                (Apenas Administradores) Defina os dados de conexão SMTP para que a plataforma envie e-mails de notificação aos profissionais.
              </p>

              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-bold text-brand-text block mb-1">HOST SMTP</label>
                  <input
                    type="text"
                    value={smtpHost}
                    onChange={e => setSmtpHost(e.target.value)}
                    placeholder="ex: smtp.gmail.com"
                    required
                    className="w-full text-sm border border-brand-border/80 rounded-xl px-3 py-2 bg-brand-bg/30 focus:outline-none focus:border-brand-primary focus:bg-white transition-all"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <label className="text-[10px] font-bold text-brand-text block mb-1">USUÁRIO SMTP</label>
                    <input
                      type="text"
                      value={smtpUser}
                      onChange={e => setSmtpUser(e.target.value)}
                      placeholder="seu-email@dominio.com"
                      required
                      className="w-full text-sm border border-brand-border/80 rounded-xl px-3 py-2 bg-brand-bg/30 focus:outline-none focus:border-brand-primary focus:bg-white transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-brand-text block mb-1">PORTA</label>
                    <input
                      type="text"
                      value={smtpPort}
                      onChange={e => setSmtpPort(e.target.value)}
                      placeholder="587"
                      required
                      className="w-full text-sm border border-brand-border/80 rounded-xl px-3 py-2 bg-brand-bg/30 focus:outline-none focus:border-brand-primary focus:bg-white transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-brand-text block mb-1">SENHA SMTP</label>
                  <input
                    type="password"
                    value={smtpPass}
                    onChange={e => setSmtpPass(e.target.value)}
                    placeholder="Sua senha do servidor"
                    required
                    className="w-full text-sm border border-brand-border/80 rounded-xl px-3 py-2 bg-brand-bg/30 focus:outline-none focus:border-brand-primary focus:bg-white transition-all"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-brand-text block mb-1">E-MAIL REMETENTE (FROM)</label>
                  <input
                    type="text"
                    value={smtpFrom}
                    onChange={e => setSmtpFrom(e.target.value)}
                    placeholder='"Suporte Ser" <email@dominio.com>'
                    className="w-full text-sm border border-brand-border/80 rounded-xl px-3 py-2 bg-brand-bg/30 focus:outline-none focus:border-brand-primary focus:bg-white transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={smtpSaving}
                className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-brand-primary text-white hover:bg-brand-primary-dark font-medium transition-colors text-sm disabled:opacity-50"
              >
                {smtpSaving ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
                <span>Salvar Servidor SMTP</span>
              </button>

              {smtpSuccess && (
                <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-xl text-xs flex gap-2 text-emerald-800">
                  <CheckCircle2 className="flex-shrink-0" size={16} />
                  <span>Configurações SMTP salvas com sucesso!</span>
                </div>
              )}

              {/* Seção de Teste de E-mail SMTP */}
              <div className="border-t border-brand-border/40 pt-4 mt-4 space-y-3">
                <label className="text-[10px] font-bold text-brand-text block uppercase tracking-wider">Testar Configuração SMTP</label>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={testEmailTarget}
                    onChange={e => setTestEmailTarget(e.target.value)}
                    placeholder="Digite o e-mail de destino..."
                    className="flex-1 text-sm border border-brand-border/80 rounded-xl px-3 py-2 bg-brand-bg/30 focus:outline-none focus:border-brand-primary focus:bg-white transition-all"
                  />
                  <button
                    type="button"
                    onClick={handleSendTestEmail}
                    disabled={testEmailSending || !testEmailTarget}
                    className="px-4 py-2.5 bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/20 font-semibold text-sm rounded-xl border border-brand-primary/20 flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
                  >
                    {testEmailSending ? <Loader2 className="animate-spin" size={16} /> : <Mail size={16} />}
                    <span>Testar</span>
                  </button>
                </div>
                {testEmailStatus && (
                  <div className={`p-2.5 rounded-xl border text-[11px] flex gap-2 ${testEmailStatus === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-red-50 border-red-100 text-red-800'}`}>
                    <CheckCircle2 className="flex-shrink-0 mt-0.5" size={14} />
                    <span>{testEmailMessage}</span>
                  </div>
                )}
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
  );
}
