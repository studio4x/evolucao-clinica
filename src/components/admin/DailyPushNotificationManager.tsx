import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { showAlert } from '../../store/modalStore';
import { 
  Bell, Save, Play, Loader2, Check, AlertTriangle, 
  HelpCircle, Calendar, Clock, Upload, Trash2, Smartphone, 
  ChevronRight, AlignLeft, Link as LinkIcon, Image as ImageIcon,
  History, RefreshCw
} from 'lucide-react';

interface DailyPushConfig {
  enabled: boolean;
  days: number[];
  time: string;
  title: string;
  body: string;
  image_url: string;
  icon_url: string;
  destination_url: string;
  last_sent_date?: string;
  server_time_utc?: string;
  server_time_br?: string;
}

interface PushLog {
  id: string;
  sent_at: string;
  status: 'success' | 'error';
  recipients_count: number;
  error_message?: string;
  payload: {
    title?: string;
    body?: string;
    link?: string;
    image?: string;
    icon?: string;
  };
}

const WEEKDAYS = [
  { val: 1, label: 'Segunda-feira', short: 'Seg' },
  { val: 2, label: 'Terça-feira', short: 'Ter' },
  { val: 3, label: 'Quarta-feira', short: 'Qua' },
  { val: 4, label: 'Quinta-feira', short: 'Qui' },
  { val: 5, label: 'Sexta-feira', short: 'Sex' },
  { val: 6, label: 'Sábado', short: 'Sáb' },
  { val: 0, label: 'Domingo', short: 'Dom' }
];

export default function DailyPushNotificationManager() {
  const [config, setConfig] = useState<DailyPushConfig>({
    enabled: false,
    days: [1, 2, 3, 4, 5],
    time: '08:00',
    title: '⏰ Hora das Evoluções!',
    body: 'Não esqueça de registrar as evoluções clínicas de hoje.',
    image_url: '',
    icon_url: '',
    destination_url: '/painel/patients'
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingIcon, setUploadingIcon] = useState(false);

  const [history, setHistory] = useState<PushLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    fetchConfig();
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) return;

      const res = await fetch(`/api/admin/daily-push-history?t=${Date.now()}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setHistory(data);
        } else {
          setHistory([]);
        }
      } else {
        setHistory([]);
      }
    } catch (err) {
      console.error('Erro ao carregar histórico de push:', err);
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) return;

      const res = await fetch(`/api/admin/daily-push-config?t=${Date.now()}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
      }
    } catch (err) {
      console.error('Erro ao carregar configurações de push diário:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error('Não autenticado.');

      const res = await fetch('/api/admin/daily-push-config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(config)
      });

      if (res.ok) {
        setMessage({ type: 'success', text: 'Configuração salva com sucesso!' });
      } else {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Erro ao salvar configuração.');
      }
    } catch (err: any) {
      console.error('Erro ao salvar:', err);
      setMessage({ type: 'error', text: err.message || 'Erro ao salvar configuração.' });
    } finally {
      setSaving(false);
    }
  };

  const handleTestPush = async () => {
    setTesting(true);
    setMessage(null);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error('Não autenticado.');

      const res = await fetch('/api/admin/daily-push-test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(config)
      });

      const resData = await res.json().catch(() => ({}));

      if (res.ok) {
        setMessage({ type: 'success', text: resData.message || 'Push de teste disparado com sucesso!' });
      } else {
        throw new Error(resData.error || 'Erro ao disparar push de teste.');
      }
    } catch (err: any) {
      console.error('Erro no teste:', err);
      setMessage({ type: 'error', text: err.message || 'Erro ao testar push.' });
    } finally {
      setTesting(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: 'image' | 'icon') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (field === 'image') setUploadingImage(true);
    else setUploadingIcon(true);
    
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `daily-push/${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error } = await supabase.storage
        .from('notifications')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) throw error;

      const { data: publicUrlData } = supabase.storage
        .from('notifications')
        .getPublicUrl(filePath);

      if (publicUrlData?.publicUrl) {
        if (field === 'image') {
          setConfig(prev => ({ ...prev, image_url: publicUrlData.publicUrl }));
        } else {
          setConfig(prev => ({ ...prev, icon_url: publicUrlData.publicUrl }));
        }
      }
    } catch (err: any) {
      console.error('Erro ao fazer upload da imagem:', err);
      await showAlert('Erro ao fazer upload da imagem: ' + (err.message || 'Erro desconhecido'), {
        title: "Erro de Upload",
        variant: "danger",
        icon: "warning"
      });
    } finally {
      if (field === 'image') setUploadingImage(false);
      else setUploadingIcon(false);
      e.target.value = '';
    }
  };

  const toggleDay = (dayVal: number) => {
    const currentDays = config.days || [];
    const isSelected = currentDays.includes(dayVal);
    const newDays = isSelected
      ? currentDays.filter(d => d !== dayVal)
      : [...currentDays, dayVal].sort();
    setConfig({ ...config, days: newDays });
  };

  if (loading) {
    return (
      <div className="p-12 flex flex-col items-center justify-center text-brand-text-muted">
        <Loader2 className="w-8 h-8 text-brand-primary animate-spin mb-3" />
        <span className="text-sm">Carregando configurações da notificação diária...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Banner Principal */}
      <div className="card p-6 bg-white shadow-sm border border-brand-border/60">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-brand-primary/10 rounded-xl text-brand-primary">
            <Bell className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-display font-bold text-brand-primary border-none p-0 pb-0">
              Lembrete de Evoluções Clínicas (Push Diário)
            </h2>
            <p className="text-xs text-brand-text-muted mt-0.5">
              Programe um lembrete fixo diário que será enviado a todos os profissionais ativos da plataforma lembrando-os de evoluir seus pacientes.
            </p>
          </div>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-xl border text-sm flex gap-2.5 items-start ${
          message.type === 'success' 
            ? 'bg-emerald-50 border-emerald-100 text-emerald-800' 
            : 'bg-red-50 border-red-100 text-red-800'
        }`}>
          {message.type === 'success' ? (
            <Check className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          )}
          <div>{message.text}</div>
        </div>
      )}

      {/* Grid Duas Colunas: Config + Mockup Mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Coluna Configuração (Left) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="card p-6 bg-white shadow-sm border border-brand-border/60 space-y-6">
            
            {/* Status (Ativo / Inativo) */}
            <div className="flex items-center justify-between p-4 bg-brand-bg rounded-xl border border-brand-border/50">
              <div>
                <p className="text-sm font-bold text-brand-text">Status do Envio Automático</p>
                <p className="text-xs text-brand-text-muted mt-0.5">Ativar ou desativar o lembrete diário programado</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={config.enabled}
                  onChange={e => setConfig({ ...config, enabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-stone-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-primary"></div>
              </label>
            </div>

            {/* Dias da Semana */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-brand-text uppercase tracking-wider flex items-center gap-1.5">
                <Calendar size={14} className="text-brand-primary" />
                Dias de Envio
              </label>
              <p className="text-xs text-brand-text-muted">Selecione os dias em que a notificação diária será disparada.</p>
              <div className="flex flex-wrap gap-2 pt-1">
                {WEEKDAYS.map(day => {
                  const isSelected = (config.days || []).includes(day.val);
                  return (
                    <button
                      key={day.val}
                      type="button"
                      onClick={() => toggleDay(day.val)}
                      className={`px-3 py-2 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
                        isSelected 
                          ? 'bg-brand-primary text-white border-brand-primary shadow-sm'
                          : 'bg-white text-brand-text border-brand-border hover:border-brand-primary/30'
                      }`}
                    >
                      {day.short}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Horário */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-brand-text uppercase tracking-wider flex items-center gap-1.5">
                <Clock size={14} className="text-brand-primary" />
                Horário do Envio
              </label>
              <p className="text-xs text-brand-text-muted">A que horas a notificação deve começar a ser disparada (fuso Brasília).</p>
              <input
                type="time"
                value={config.time}
                onChange={e => setConfig({ ...config, time: e.target.value })}
                className="input-field p-2.5 max-w-[200px]"
              />
              {config.server_time_br && (
                <div className="text-[11px] text-brand-text-muted mt-2 space-y-1.5 bg-stone-50 p-2.5 rounded-xl border border-brand-border/40 max-w-[400px]">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse flex-shrink-0"></span>
                    <span>
                      Hora do Servidor (Brasília): <strong>{
                        new Date(config.server_time_br).toLocaleString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                          timeZone: 'UTC'
                        })
                      }</strong>
                    </span>
                  </div>
                  {config.server_time_utc && (
                    <div className="text-[9px] text-brand-text-muted/70 pl-3.5">
                      Server UTC: {new Date(config.server_time_utc).toISOString()}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 pt-1.5 border-t border-brand-border/40 mt-1 pl-3.5">
                    <span className="text-[10px] text-brand-text-muted">Status de hoje:</span>
                    {config.last_sent_date === config.server_time_br.split('T')[0] ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-100 font-bold text-[9px] uppercase tracking-wide">
                        <Check size={10} /> Já disparada hoje ({config.last_sent_date})
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-100 font-bold text-[9px] uppercase tracking-wide">
                        <Clock size={10} /> Pendente / Não disparada hoje
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            <hr className="border-brand-border/40" />

            {/* Conteúdo da Notificação */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-brand-text uppercase tracking-wider flex items-center gap-1.5 border-none p-0 pb-0">
                <AlignLeft size={16} className="text-brand-primary" />
                Conteúdo da Notificação
              </h3>

              {/* Título */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-brand-text-muted">Título da Notificação</label>
                <input
                  type="text"
                  value={config.title}
                  onChange={e => setConfig({ ...config, title: e.target.value })}
                  placeholder="Ex: ⏰ Hora das Evoluções!"
                  className="input-field p-2.5"
                  maxLength={60}
                />
              </div>

              {/* Mensagem */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-brand-text-muted">Mensagem / Corpo</label>
                <textarea
                  rows={3}
                  value={config.body}
                  onChange={e => setConfig({ ...config, body: e.target.value })}
                  placeholder="Ex: Não se esqueça de preencher as evoluções clínicas dos seus atendimentos de hoje..."
                  className="input-field p-2.5 text-sm"
                  maxLength={150}
                />
              </div>

              {/* Rota de Destino */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-brand-text-muted flex items-center gap-1">
                  <LinkIcon size={12} />
                  URL de Destino
                </label>
                <input
                  type="text"
                  value={config.destination_url}
                  onChange={e => setConfig({ ...config, destination_url: e.target.value })}
                  placeholder="Ex: /painel/patients ou link completo"
                  className="input-field p-2.5"
                />
                <p className="text-[10px] text-brand-text-muted">Caminho interno do aplicativo que abrirá quando o profissional clicar na notificação.</p>
              </div>

              {/* Uploads e URLs de Mídia */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                {/* Ícone */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-brand-text-muted flex items-center gap-1">
                    <ImageIcon size={12} />
                    Ícone Personalizado (1:1)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={config.icon_url}
                      onChange={e => setConfig({ ...config, icon_url: e.target.value })}
                      placeholder="Ex: https://.../icon.png"
                      className="input-field p-2 text-xs flex-1"
                    />
                    <label className="p-2.5 bg-brand-bg border border-brand-border rounded-xl hover:bg-brand-primary/5 cursor-pointer flex items-center justify-center text-brand-text-muted hover:text-brand-primary transition-colors flex-shrink-0">
                      {uploadingIcon ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={e => handleFileUpload(e, 'icon')} 
                        className="sr-only" 
                        disabled={uploadingIcon}
                      />
                    </label>
                  </div>
                  {config.icon_url && (
                    <div className="flex items-center gap-2 mt-1">
                      <img src={config.icon_url} alt="Ícone" className="w-8 h-8 rounded-lg object-cover border border-brand-border/40" />
                      <button 
                        type="button" 
                        onClick={() => setConfig({ ...config, icon_url: '' })}
                        className="text-[10px] text-red-500 hover:underline flex items-center gap-0.5 bg-transparent border-0 cursor-pointer"
                      >
                        <Trash2 size={10} /> Remover
                      </button>
                    </div>
                  )}
                </div>

                {/* Imagem de Capa */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-brand-text-muted flex items-center gap-1">
                    <ImageIcon size={12} />
                    Imagem de Capa (Opcional - Grande)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={config.image_url}
                      onChange={e => setConfig({ ...config, image_url: e.target.value })}
                      placeholder="Ex: https://.../banner.jpg"
                      className="input-field p-2 text-xs flex-1"
                    />
                    <label className="p-2.5 bg-brand-bg border border-brand-border rounded-xl hover:bg-brand-primary/5 cursor-pointer flex items-center justify-center text-brand-text-muted hover:text-brand-primary transition-colors flex-shrink-0">
                      {uploadingImage ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={e => handleFileUpload(e, 'image')} 
                        className="sr-only" 
                        disabled={uploadingImage}
                      />
                    </label>
                  </div>
                  {config.image_url && (
                    <div className="flex items-center gap-2 mt-1">
                      <img src={config.image_url} alt="Capa" className="w-12 h-8 rounded object-cover border border-brand-border/40" />
                      <button 
                        type="button" 
                        onClick={() => setConfig({ ...config, image_url: '' })}
                        className="text-[10px] text-red-500 hover:underline flex items-center gap-0.5 bg-transparent border-0 cursor-pointer"
                      >
                        <Trash2 size={10} /> Remover
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Ações */}
            <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t border-brand-border/50">
              <button
                type="button"
                onClick={handleTestPush}
                disabled={testing}
                className="flex items-center justify-center gap-2 px-4 py-2.5 border border-brand-primary/30 text-brand-primary hover:bg-brand-primary/5 rounded-xl font-semibold text-sm transition-all cursor-pointer disabled:opacity-50"
              >
                {testing ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                <span>Enviar Teste no meu Dispositivo</span>
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex items-center justify-center gap-2 px-6 py-2.5 bg-brand-primary hover:bg-brand-primary-hover text-white rounded-xl font-bold text-sm shadow-sm transition-all cursor-pointer disabled:opacity-50"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                <span>Salvar Configuração</span>
              </button>
            </div>

          </div>

          {/* Histórico de Disparos */}
          <div className="card p-6 bg-white shadow-sm border border-brand-border/60 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-brand-text uppercase tracking-wider flex items-center gap-1.5 border-none p-0 pb-0">
                <History size={16} className="text-brand-primary" />
                Histórico de Disparos (Últimas 7 execuções)
              </h3>
              <button
                type="button"
                onClick={fetchHistory}
                disabled={historyLoading}
                className="p-1.5 text-brand-text-muted hover:text-brand-primary hover:bg-brand-primary/5 rounded-lg border border-transparent hover:border-brand-border transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center"
                title="Atualizar histórico"
              >
                <RefreshCw size={14} className={historyLoading ? 'animate-spin' : ''} />
              </button>
            </div>

            {historyLoading ? (
              <div className="py-8 flex items-center justify-center text-xs text-brand-text-muted">
                <Loader2 size={16} className="animate-spin mr-2" /> Carregando histórico...
              </div>
            ) : history.length === 0 ? (
              <div className="py-8 text-center text-xs text-brand-text-muted border border-dashed border-brand-border rounded-xl">
                Nenhuma notificação enviada recentemente.
              </div>
            ) : (
              <div className="space-y-3">
                {history.map((log) => {
                  if (!log) return null;
                  let formattedDate = 'Data desconhecida';
                  try {
                    if (log.sent_at) {
                      const date = new Date(log.sent_at);
                      if (!isNaN(date.getTime())) {
                        formattedDate = date.toLocaleString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        });
                      }
                    }
                  } catch (e) {
                    console.error("Erro ao formatar data do log:", e);
                  }

                  const status = log.status || 'error';
                  const recipientsCount = log.recipients_count || 0;
                  const errorMessage = log.error_message || '';
                  const payload = log.payload || {};

                  return (
                    <div 
                      key={log.id || Math.random().toString()} 
                      className={`p-3.5 rounded-xl border text-xs transition-all ${
                        status === 'success' 
                          ? 'bg-emerald-50/20 border-emerald-100/50 hover:bg-emerald-50/30' 
                          : 'bg-red-50/20 border-red-100/50 hover:bg-red-50/30'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div className="w-full">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] tracking-wide uppercase ${
                              status === 'success' 
                                ? 'bg-emerald-100 text-emerald-800' 
                                : 'bg-red-100 text-red-805'
                            }`}>
                              {status === 'success' ? 'Sucesso' : 'Falha'}
                            </span>
                            <span className="font-semibold text-brand-text-muted">{formattedDate}</span>
                          </div>
                          
                          {status === 'success' ? (
                            <p className="text-brand-text font-medium mt-2">
                              Enviada com sucesso para <strong className="text-brand-primary">{recipientsCount}</strong> profissionais ativos.
                            </p>
                          ) : (
                            <div className="mt-2 space-y-1">
                              <p className="text-red-800 font-bold">Erro no processamento do disparo:</p>
                              <p className="text-red-750 bg-red-100/10 p-2 rounded-lg font-mono text-[10px] select-all border border-red-100 leading-normal whitespace-pre-wrap">
                                {errorMessage || 'Erro desconhecido.'}
                              </p>
                            </div>
                          )}

                          {payload && payload.title && (
                            <div className="mt-2 text-stone-500 bg-stone-50 p-2 rounded-lg leading-relaxed border border-stone-100">
                              <span className="font-bold text-[10px] text-stone-400 block mb-0.5 uppercase tracking-wider">Conteúdo enviado:</span>
                              <strong>{payload.title}</strong> - {payload.body || ''}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Coluna Preview Mobile (Right) */}
        <div className="lg:col-span-5 flex flex-col items-center">
          <div className="sticky top-6 w-full max-w-[340px] space-y-3">
            <p className="text-xs font-bold text-brand-text-muted uppercase tracking-wider text-center flex items-center justify-center gap-1">
              <Smartphone size={14} className="text-brand-primary" />
              Visualização no Dispositivo
            </p>

            {/* Smartphone Mockup */}
            <div className="relative w-full h-[580px] bg-stone-900 rounded-[40px] p-3 shadow-2xl border-4 border-stone-850 overflow-hidden flex flex-col justify-start">
              
              {/* Speaker / Camera Notch */}
              <div className="absolute top-4 left-1/2 -translate-x-1/2 w-28 h-4 bg-stone-950 rounded-full z-20 flex items-center justify-between px-3">
                <div className="w-1.5 h-1.5 rounded-full bg-stone-800"></div>
                <div className="w-8 h-1 bg-stone-800 rounded-full"></div>
                <div className="w-1.5 h-1.5 rounded-full bg-stone-800"></div>
              </div>

              {/* Wallpaper / Background */}
              <div className="absolute inset-0 bg-gradient-to-tr from-brand-primary/80 via-purple-900 to-indigo-950 z-0"></div>

              {/* Status Bar */}
              <div className="relative z-10 flex justify-between items-center text-[10px] text-white px-5 pt-2 select-none opacity-80">
                <span className="font-semibold">{config.time || '08:00'}</span>
                <div className="flex items-center gap-1">
                  <span>📶</span>
                  <span>🔋</span>
                </div>
              </div>

              {/* Push Notification Card (Animated/Mockup) */}
              <div className="relative z-10 mt-6 mx-2 bg-white/90 backdrop-blur-md rounded-2xl p-3 shadow-lg border border-white/20 select-none animate-in slide-in-from-top-6 duration-300">
                <div className="flex gap-2.5 items-start">
                  
                  {/* Icon */}
                  <div className="w-9 h-9 rounded-lg bg-brand-primary/10 flex-shrink-0 flex items-center justify-center overflow-hidden border border-brand-primary/10">
                    {config.icon_url ? (
                      <img src={config.icon_url} alt="Ícone notif" className="w-full h-full object-cover" />
                    ) : (
                      <Bell size={18} className="text-brand-primary" />
                    )}
                  </div>

                  {/* Text Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center">
                      <p className="text-xs font-bold text-stone-900 truncate">
                        {config.title || 'Hora das Evoluções!'}
                      </p>
                      <span className="text-[9px] text-stone-500">agora</span>
                    </div>
                    <p className="text-[11px] text-stone-700 leading-normal mt-0.5 break-words">
                      {config.body || 'Não se esqueça de registrar as evoluções clínicas hoje.'}
                    </p>
                  </div>
                </div>

                {/* Big Capa Image */}
                {config.image_url && (
                  <div className="mt-2.5 rounded-lg overflow-hidden border border-stone-200/50 bg-stone-100 max-h-[120px] flex items-center justify-center">
                    <img src={config.image_url} alt="Capa notif" className="w-full h-full object-cover" />
                  </div>
                )}

                {/* Action button */}
                <div className="mt-2.5 pt-2 border-t border-stone-200/40 flex justify-between items-center text-[10px] text-brand-primary font-bold">
                  <span>Ver Detalhes</span>
                  <ChevronRight size={12} />
                </div>
              </div>

              {/* Screen Mockup Bottom Decorator (Indicator Bar) */}
              <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 w-32 h-1 bg-white/60 rounded-full z-10"></div>
            </div>

            {/* Dica de Instalação / Uso */}
            <div className="p-3.5 bg-brand-primary/5 rounded-xl border border-brand-primary/10 text-xs text-brand-text-muted leading-relaxed">
              💡 <strong>Instruções do Sistema:</strong> Este lembrete é enviado para todos os navegadores e celulares (Android/PWA) que aceitaram receber notificações. O tempo de entrega real pode variar ligeiramente de acordo com a fila de processamento do Google/Apple Push Service.
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
