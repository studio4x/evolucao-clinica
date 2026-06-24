import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { useAuthStore } from '../store/authStore';
import { Link } from 'react-router-dom';
import { Users, FileAudio, AlertCircle, Plus, BookOpen, Mic, FileText, CheckCircle2, ArrowRight, History as HistoryIcon, Clock, Calendar, RefreshCw, Loader2, Cake, Trash2 } from 'lucide-react';
import { listGoogleCalendarEvents } from '../services/googleCalendar';
import { getDraftEvolutions, removePendingEvolution, PendingEvolution } from '../services/offlineQueue';
import { GOOGLE_SCOPE_SETS, hasGoogleScopes, requestGoogleOAuth } from '../services/googleAuth';
const normalizeText = (text: string): string => {
  if (!text) return '';
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove acentos
    .toLowerCase()
    .trim();
};

const matchPatientWithEvent = (patient: any, summary: string, description: string): boolean => {
  const normSummary = normalizeText(summary);
  const normDesc = normalizeText(description);
  
  const normFullName = normalizeText(patient.full_name || '');


  // 2. Correspondência do nome completo
  if (normFullName && (normSummary.includes(normFullName) || normDesc.includes(normFullName))) {
    return true;
  }
  
  // 3. Correspondência de partes do nome (primeiro nome ou outras partes significativas)
  const ignoreWords = ['de', 'da', 'do', 'das', 'dos', 'com', 'para', 'em'];
  const nameParts = normFullName.split(/\s+/).filter(p => p.length >= 2 && !ignoreWords.includes(p));
  
  if (nameParts.length > 0) {
    // Tenta encontrar o primeiro nome como palavra inteira
    const firstName = nameParts[0];
    const firstRegex = new RegExp(`\\b${firstName}\\b`, 'i');
    if (firstRegex.test(normSummary) || firstRegex.test(normDesc)) {
      return true;
    }
    
    // Tolerância: se o primeiro nome for longo (>= 4 caracteres), permite match como substring direta
    if (firstName.length >= 4 && (normSummary.includes(firstName) || normDesc.includes(firstName))) {
      return true;
    }
    
    // Se o evento contiver qualquer outro nome significativo do paciente
    for (let i = 1; i < nameParts.length; i++) {
      const part = nameParts[i];
      const partRegex = new RegExp(`\\b${part}\\b`, 'i');
      if (partRegex.test(normSummary) || partRegex.test(normDesc)) {
        return true;
      }
      
      // Tolerância para outras partes significativas do nome
      if (part.length >= 4 && (normSummary.includes(part) || normDesc.includes(part))) {
        return true;
      }
    }
  }

  return false;
};

export default function Dashboard() {
  const { user, googleAccessToken, googleGrantedScopes, setGoogleAccessToken } = useAuthStore();
  const hasCalendarAccess = Boolean(googleAccessToken) && hasGoogleScopes(googleGrantedScopes, GOOGLE_SCOPE_SETS.calendarReadOnly);
  const [stats, setStats] = useState({
    totalPatients: 0,
    recentEvolutions: 0,
    errorEvolutions: 0,
    totalMinutes: 0
  });
  const [loading, setLoading] = useState(true);

  // Rascunhos de gravação de evolução pendentes de finalização
  const [drafts, setDrafts] = useState<PendingEvolution[]>([]);

  const fetchDrafts = useCallback(async () => {
    try {
      const items = await getDraftEvolutions();
      setDrafts(items);
    } catch (err) {
      console.error("Erro ao carregar rascunhos de gravação:", err);
    }
  }, []);

  useEffect(() => {
    fetchDrafts();
  }, [fetchDrafts]);

  const handleDeleteDraft = async (id: string) => {
    if (window.confirm("Certeza que deseja excluir permanentemente esta gravação incompleta?")) {
      await removePendingEvolution(id);
      fetchDrafts();
    }
  };

  // Estados da integração com o Google Calendar
  const [patients, setPatients] = useState<any[]>([]);
  const [evolvedPatientIds, setEvolvedPatientIds] = useState<Set<string>>(new Set());
  const [calendarEvents, setCalendarEvents] = useState<any[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [birthdays, setBirthdays] = useState<{ today: any[]; thisWeek: any[] }>({
    today: [],
    thisWeek: []
  });

  const handleWhatsAppClick = (e: React.MouseEvent, fullName: string, phone: string) => {
    e.preventDefault();
    e.stopPropagation();

    // Limpa caracteres não numéricos do telefone
    const cleanPhone = phone.replace(/\D/g, '');
    if (!cleanPhone) {
      alert("Número de telefone inválido.");
      return;
    }

    // Extrai primeiro nome para a mensagem ser personalizada
    const firstName = fullName.split(' ')[0];
    const message = `🎂 Feliz Aniversário, ${firstName}! Que este novo ciclo seja repleto de saúde, conquistas e muita alegria! 🎉`;
    const encodedMsg = encodeURIComponent(message);

    // Detecta se é dispositivo móvel para usar link wa.me ou whatsapp://
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    const url = isMobile
      ? `https://wa.me/${cleanPhone}?text=${encodedMsg}`
      : `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodedMsg}`;

    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleConnectGoogleCalendar = async () => {
    try {
      const { error } = await requestGoogleOAuth({
        requiredScopes: 'calendarReadOnly',
        currentGrantedScopes: googleGrantedScopes,
        redirectTo: window.location.origin + window.location.pathname
      });
      if (error) throw error;
    } catch (error) {
      console.error("Erro ao conectar Google Agenda:", error);
      alert("Erro ao iniciar conexão com o Google.");
    }
  };

  const fetchCalendarAndPatients = useCallback(async () => {
    if (!user) return;
    
    try {
      setCalendarLoading(true);
      setCalendarError(null);

      // 1. Busca pacientes ativos (com birth_date e phone para calcular aniversários e WhatsApp)
      const { data: patientsData, error: patientsError } = await supabase
        .from('patients')
        .select('id, full_name, birth_date, phone')
        .eq('professional_id', user.id)
        .eq('status', 'active');

      if (patientsError) throw patientsError;
      setPatients(patientsData || []);

      // 2. Busca evoluções realizadas nesta semana (de segunda-feira até hoje, no fuso local do terapeuta)
      const now = new Date();
      const currentDay = now.getDay(); // 0 = Domingo, 1 = Segunda, ..., 6 = Sábado
      const distanceToMonday = currentDay === 0 ? 6 : currentDay - 1; // Dias desde a segunda-feira
      
      const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - distanceToMonday, 0, 0, 0);
      
      const tomorrow = new Date();
      tomorrow.setDate(now.getDate() + 1);
      const endOfTomorrow = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 23, 59, 59, 999);
      
      const formatDateStr = (d: Date) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dayOfMonth = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${dayOfMonth}`;
      };

      const startOfWeekStr = formatDateStr(startOfWeek);
      const localTodayStr = formatDateStr(now);
      const localTomorrowStr = formatDateStr(tomorrow);

      const { data: evolutionsThisWeek, error: evolutionsError } = await supabase
        .from('evolutions')
        .select('id, patient_id, session_date')
        .eq('professional_id', user.id)
        .gte('session_date', startOfWeekStr)
        .lte('session_date', localTomorrowStr);

      if (evolutionsError) throw evolutionsError;

      // Mantemos o set apenas para compatibilidade, se necessário em algum lugar
      const evolvedSet = new Set<string>(evolutionsThisWeek?.map(e => e.patient_id) || []);
      setEvolvedPatientIds(evolvedSet);

      // 3. Busca eventos do Google Calendar se estiver conectado
      if (hasCalendarAccess) {
        try {
          const events = await listGoogleCalendarEvents(
            googleAccessToken,
            startOfWeek.toISOString(),
            endOfTomorrow.toISOString()
          );

          // Filtra os eventos comparando inteligentemente com os pacientes ativos
          const matchedEvents = events.filter(event => {
            return (patientsData || []).some(patient => 
              matchPatientWithEvent(patient, event.summary || '', event.description || '')
            );
          });

          // Mapeia eventos adicionando o objeto de paciente e status
          const mappedEvents = matchedEvents.map(event => {
            const matchedPatient = (patientsData || []).find(patient => 
              matchPatientWithEvent(patient, event.summary || '', event.description || '')
            );

            // Determina a data do evento no formato YYYY-MM-DD local
            let eventDateStr = '';
            if (event.start?.dateTime) {
              const d = new Date(event.start.dateTime);
              eventDateStr = formatDateStr(d);
            } else if (event.start?.date) {
              eventDateStr = event.start.date; // Já é YYYY-MM-DD
            }

            // Verifica se este atendimento já foi evoluído na data específica
            const alreadyEvolved = matchedPatient 
              ? (evolutionsThisWeek || []).some(e => e.patient_id === matchedPatient.id && e.session_date === eventDateStr)
              : false;

            return {
              ...event,
              patient: matchedPatient,
              evolved: alreadyEvolved,
              eventDateStr
            };
          });

          setCalendarEvents(mappedEvents);
        } catch (calError: any) {
          console.error("Error fetching Google Calendar events:", calError);
          const errMsg = calError.message || "";
          if (errMsg.includes("UNAUTHENTICATED")) {
            setGoogleAccessToken(null);
          } else if (errMsg.includes("has not been used in project") || errMsg.includes("disabled") || errMsg.includes("403")) {
            setCalendarError(
              "A API do Google Agenda (Google Calendar API) precisa ser ativada no seu console do Google Cloud (projeto 985599226364) para listar os atendimentos da semana."
            );
          } else {
            setCalendarError("Não foi possível carregar os compromissos do Google Agenda.");
          }
        }
      }
    } catch (err) {
      console.error("Error in fetchCalendarAndPatients:", err);
    } finally {
      setCalendarLoading(false);
    }
  }, [user, googleAccessToken, hasCalendarAccess, setGoogleAccessToken]);

  useEffect(() => {
    fetchCalendarAndPatients();
  }, [fetchCalendarAndPatients]);

  useEffect(() => {
    if (!user || !hasCalendarAccess) return;

    // Configura o intervalo de 5 minutos (300.000 ms) para atualização automática
    const intervalId = setInterval(() => {
      fetchCalendarAndPatients();
    }, 5 * 60 * 1000);

    return () => clearInterval(intervalId);
  }, [user, googleAccessToken, fetchCalendarAndPatients]);

  // ─── Aniversariantes: roda INDEPENDENTEMENTE do Google Calendar ───────────
  useEffect(() => {
    if (!user) return;

    const fetchBirthdays = async () => {
      try {
        const { data, error } = await supabase
          .from('patients')
          .select('id, full_name, birth_date, phone')
          .eq('professional_id', user.id)
          .eq('status', 'active')
          .not('birth_date', 'is', null);

        if (error) throw error;

        const now = new Date();
        const todayMM = now.getMonth() + 1;
        const todayDD = now.getDate();

        const birthdaysToday: any[] = [];
        const birthdaysThisWeek: any[] = [];

        ;(data || []).forEach((p: any) => {
          const [, mm, dd] = p.birth_date.split('-').map(Number);
          if (mm === todayMM && dd === todayDD) {
            birthdaysToday.push(p);
            return;
          }
          for (let offset = 1; offset <= 6; offset++) {
            const future = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
            if (mm === future.getMonth() + 1 && dd === future.getDate()) {
              birthdaysThisWeek.push({ ...p, _daysUntil: offset });
              break;
            }
          }
        });

        setBirthdays({ today: birthdaysToday, thisWeek: birthdaysThisWeek });
      } catch (err) {
        console.error('Erro ao buscar aniversariantes:', err);
      }
    };

    fetchBirthdays();
  }, [user]);

  useEffect(() => {
    const fetchDashboardData = async () => {
      if (!user) return;
      const uid = user.id;

      try {
        // Busca total de pacientes
        const { count: patientsCount, error: patientsError } = await supabase
          .from('patients')
          .select('*', { count: 'exact', head: true })
          .eq('professional_id', uid)
          .eq('status', 'active');
          
        if (patientsError) throw patientsError;

        // Busca total de evoluções
        const { count: evolutionsCount, error: evolutionsError } = await supabase
          .from('evolutions')
          .select('*', { count: 'exact', head: true })
          .eq('professional_id', uid);
          
        if (evolutionsError) throw evolutionsError;

        // Busca total de falhas em evoluções
        const { count: errorsCount, error: errorsError } = await supabase
          .from('evolutions')
          .select('*', { count: 'exact', head: true })
          .eq('professional_id', uid)
          .eq('transcription_status', 'failed');
          
        if (errorsError) throw errorsError;

        // Busca logs de uso para calcular total de minutos
        const { data: usageLogs, error: usageError } = await supabase
          .from('usage_logs')
          .select('audio_duration_seconds')
          .eq('professional_id', uid);

        if (usageError) throw usageError;

        let totalSeconds = 0;
        usageLogs?.forEach(log => {
          totalSeconds += Number(log.audio_duration_seconds || 0);
        });
        const totalMinutes = totalSeconds / 60;

        setStats({
          totalPatients: patientsCount || 0,
          recentEvolutions: evolutionsCount || 0,
          errorEvolutions: errorsCount || 0,
          totalMinutes: totalMinutes
        });
        
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [user]);

  if (loading) return <div>Carregando...</div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Welcome Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-brand-primary">
            Olá, {user?.user_metadata?.full_name?.split(' ')[0] || 'Terapeuta'}!
          </h1>
          <p className="text-brand-text-muted mt-1">
            Aqui está o resumo dos seus atendimentos clínicos.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link 
            to="/painel/tutorial" 
            className="btn-outline flex items-center space-x-2 bg-white"
          >
            <BookOpen size={18} />
            <span>Ver Tutorial</span>
          </Link>
          <Link 
            to="/painel/patients/new" 
            className="btn-primary flex items-center shadow-lg shadow-brand-primary/20"
          >
            <Plus size={20} className="mr-2" />
            <span>Novo Paciente</span>
          </Link>
        </div>
      </div>

      {drafts.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 space-y-4 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-center space-x-2 text-amber-800 font-semibold">
            <AlertCircle className="w-5 h-5 text-amber-600" />
            <span className="font-display">Gravações Pendentes de Finalização</span>
          </div>
          <p className="text-sm text-amber-700 leading-relaxed">
            Identificamos gravações que foram interrompidas (por queda de internet ou fechamento do aplicativo). Você pode recuperá-las para continuar e enviar ou descartá-las:
          </p>
          <div className="divide-y divide-amber-100/75 max-h-60 overflow-y-auto pr-2">
            {drafts.map((draft) => (
              <div key={draft.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-4 first:pt-0 last:pb-0">
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold text-amber-900">{draft.patientName}</p>
                  <p className="text-xs text-amber-600 flex items-center gap-1.5 flex-wrap">
                    <span>Sessão: {new Date(draft.sessionDate).toLocaleDateString('pt-BR')}</span>
                    <span>•</span>
                    <span>Duração: {Math.floor((draft.recordingTime || 0) / 60).toString().padStart(2, '0')}:{((draft.recordingTime || 0) % 60).toString().padStart(2, '0')}</span>
                    <span>•</span>
                    <span>Criado em: {new Date(draft.createdAt).toLocaleString('pt-BR')}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-center">
                  <Link
                    to={`/painel/patients/${draft.patientId}/evolutions/new?draftId=${draft.id}`}
                    className="bg-amber-600 hover:bg-amber-700 text-white px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1 shadow-sm"
                  >
                    <span>Recuperar & Finalizar</span>
                    <ArrowRight size={12} />
                  </Link>
                  <button
                    onClick={() => handleDeleteDraft(draft.id)}
                    className="text-amber-700 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-colors border border-amber-200 hover:border-red-200 bg-white shadow-sm"
                    title="Excluir gravação permanentemente"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Link to="/painel/patients" className="group relative overflow-hidden card p-0 border-0 shadow-lg hover:shadow-xl transition-all flex flex-col">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent" />
          <div className="p-6 relative z-10 flex grow justify-between items-center">
            <div className="space-y-1">
              <div className="bg-blue-500 w-12 h-12 rounded-2xl flex items-center justify-center text-white mb-4 shadow-lg group-hover:scale-110 transition-transform">
                <Users size={24} />
              </div>
              <p className="text-sm text-brand-text-muted font-medium uppercase tracking-wider">Pacientes Ativos</p>
              <div className="flex items-center text-blue-600 font-bold text-sm group-hover:underline">
                <span>Visualizar lista</span>
                <ArrowRight size={14} className="ml-1 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
            <div className="text-right">
              <p className="text-5xl font-display font-bold text-brand-text/20 group-hover:text-blue-500/40 transition-colors">{stats.totalPatients}</p>
            </div>
          </div>
        </Link>

        <Link to="/painel/history" className="group relative overflow-hidden card p-0 border-0 shadow-lg hover:shadow-xl transition-all flex flex-col">
          <div className="absolute inset-0 bg-gradient-to-br from-brand-primary/10 to-transparent" />
          <div className="p-6 relative z-10 flex grow justify-between items-center">
            <div className="space-y-1">
              <div className="bg-brand-primary w-12 h-12 rounded-2xl flex items-center justify-center text-white mb-4 shadow-lg group-hover:scale-110 transition-transform">
                <FileAudio size={24} />
              </div>
              <p className="text-sm text-brand-text-muted font-medium uppercase tracking-wider">Evoluções Realizadas</p>
              <div className="flex items-center text-brand-primary font-bold text-sm group-hover:underline">
                <span>Acessar histórico</span>
                <ArrowRight size={14} className="ml-1 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
            <div className="text-right">
              <p className="text-5xl font-display font-bold text-brand-text/20 group-hover:text-brand-primary/40 transition-colors">{stats.recentEvolutions}</p>
            </div>
          </div>
        </Link>

        <Link to="/painel/history" className="group relative overflow-hidden card p-0 border-0 shadow-lg hover:shadow-xl transition-all flex flex-col bg-white">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-transparent" />
          <div className="p-6 relative z-10 flex grow justify-between items-center">
            <div className="space-y-1">
              <div className="bg-purple-500 w-12 h-12 rounded-2xl flex items-center justify-center text-white mb-4 shadow-lg group-hover:scale-110 transition-transform">
                <Clock size={24} />
              </div>
              <p className="text-sm text-brand-text-muted font-medium uppercase tracking-wider">Minutos Transcritos</p>
              <div className="flex items-center text-purple-600 font-bold text-sm group-hover:underline">
                <span>Ver histórico</span>
                <ArrowRight size={14} className="ml-1 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
            <div className="text-right">
              <p className="text-5xl font-display font-bold text-brand-text/20 group-hover:text-purple-500/40 transition-colors">
                {stats.totalMinutes.toFixed(1)}
              </p>
            </div>
          </div>
        </Link>
      </div>

      {/* Widget: Aniversariantes */}
      {(birthdays.today.length > 0 || birthdays.thisWeek.length > 0) && (
        <div className="card p-6 bg-white border border-pink-100 shadow-md relative overflow-hidden">
          {/* Decoração de fundo */}
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-pink-100/40 rounded-full blur-3xl pointer-events-none" />

          <div className="flex items-center space-x-3 border-b border-pink-100 pb-4 mb-4">
            <div className="bg-pink-100 text-pink-500 p-2 rounded-xl">
              <Cake size={22} />
            </div>
            <div>
              <h2 className="text-xl font-display font-bold text-pink-600">Aniversariantes</h2>
              <p className="text-sm text-brand-text-muted">Pacientes fazendo aniversário esta semana</p>
            </div>
          </div>

          <div className="space-y-3">
            {/* Aniversariantes de hoje */}
            {birthdays.today.map((p: any) => (
              <div
                key={p.id}
                className="flex items-center justify-between p-3 bg-pink-50 border border-pink-200 rounded-xl hover:bg-pink-100/70 transition-colors"
              >
                <Link
                  to={`/painel/patients/${p.id}`}
                  className="flex items-center space-x-3 flex-1 min-w-0"
                >
                  <div className="w-9 h-9 rounded-full bg-pink-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow">
                    {(p.full_name || p.name || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="truncate">
                    <p className="font-semibold text-pink-800 text-sm truncate">{p.full_name || p.name}</p>
                    <p className="text-xs text-pink-500 font-medium">🎂 Hoje!</p>
                  </div>
                </Link>
                <div className="flex items-center space-x-2 flex-shrink-0">
                  <span className="text-[10px] font-bold bg-pink-500 text-white px-2 py-0.5 rounded-full">HOJE</span>
                  {p.phone && (
                    <button
                      onClick={(e) => handleWhatsAppClick(e, p.full_name, p.phone)}
                      className="p-2 bg-green-500 text-white rounded-xl hover:bg-green-600 transition-colors flex items-center justify-center cursor-pointer shadow-sm ml-1"
                      title="Enviar mensagem de aniversário"
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.458 5.704 1.459h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                      </svg>
                    </button>
                  )}
                  <Link to={`/painel/patients/${p.id}`} className="p-1 hover:text-pink-600 transition-colors ml-1">
                    <ArrowRight size={14} className="text-pink-400" />
                  </Link>
                </div>
              </div>
            ))}

            {/* Aniversariantes da semana */}
            {birthdays.thisWeek.map((p: any) => (
              <div
                key={p.id}
                className="flex items-center justify-between p-3 bg-brand-bg/50 border border-brand-border rounded-xl hover:bg-pink-50/70 hover:border-pink-200 transition-colors"
              >
                <Link
                  to={`/painel/patients/${p.id}`}
                  className="flex items-center space-x-3 flex-1 min-w-0"
                >
                  <div className="w-9 h-9 rounded-full bg-brand-primary/10 flex items-center justify-center text-brand-primary font-bold text-sm flex-shrink-0">
                    {(p.full_name || p.name || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="truncate">
                    <p className="font-semibold text-brand-text text-sm truncate">{p.full_name || p.name}</p>
                    <p className="text-xs text-brand-text-muted">
                      Em {p._daysUntil} {p._daysUntil === 1 ? 'dia' : 'dias'}
                    </p>
                  </div>
                </Link>
                <div className="flex items-center space-x-2 flex-shrink-0">
                  {p.phone && (
                    <button
                      onClick={(e) => handleWhatsAppClick(e, p.full_name, p.phone)}
                      className="p-2 bg-green-500 text-white rounded-xl hover:bg-green-600 transition-colors flex items-center justify-center cursor-pointer shadow-sm ml-1"
                      title="Enviar mensagem de aniversário"
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.458 5.704 1.459h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                      </svg>
                    </button>
                  )}
                  <Link to={`/painel/patients/${p.id}`} className="p-1 hover:text-pink-600 transition-colors ml-1">
                    <ArrowRight size={14} className="text-brand-text-muted" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Seção Google Agenda: Atendimentos de Hoje */}
      <div className="card p-6 bg-white border border-brand-border shadow-md">
        <div className="flex flex-col gap-4 border-b border-brand-border pb-4 mb-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="bg-brand-primary/10 text-brand-primary p-2 rounded-xl">
              <Calendar size={22} />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-display font-bold text-brand-primary">Atendimentos da Semana</h2>
              <p className="text-xs text-brand-text-muted mt-0.5 break-words">
                Conectado ao Google Agenda: <span className="font-semibold text-brand-primary">{user?.email}</span>
              </p>
            </div>
          </div>
          {hasCalendarAccess && (
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap md:w-auto md:justify-end">
              <button 
                onClick={fetchCalendarAndPatients}
                disabled={calendarLoading}
                className="btn-outline w-full justify-center py-1.5 px-3 text-xs flex items-center space-x-1.5 border-brand-primary/30 text-brand-primary bg-white hover:bg-brand-primary/5 disabled:opacity-50 cursor-pointer sm:w-auto"
              >
                {calendarLoading ? (
                  <>
                    <Loader2 size={12} className="animate-spin text-brand-primary" />
                    <span>Processando calendário...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw size={12} className="text-brand-primary" />
                    <span>Sincronizar Agenda</span>
                  </>
                )}
              </button>
              <button 
                onClick={handleConnectGoogleCalendar}
                className="inline-flex w-full items-center justify-center text-xs text-brand-text-muted hover:text-brand-primary hover:underline font-medium cursor-pointer sm:w-auto sm:justify-start"
                title="Conectar com outra conta ou renovar permissões do Google"
              >
                Reconectar Conta
              </button>
            </div>
          )}
        </div>

        {!hasCalendarAccess ? (
          <div className="py-6 text-center max-w-lg mx-auto flex flex-col items-center">
            <div className="bg-brand-bg text-brand-text-muted p-4 rounded-full mb-4">
              <Calendar size={36} className="text-brand-text-muted/60" />
            </div>
            <h3 className="text-lg font-semibold text-brand-text mb-2">Conecte sua Agenda do Google</h3>
            <p className="text-sm text-brand-text-muted mb-6">
              Visualize seus agendamentos clínicos de hoje diretamente no painel e crie as evoluções clínicas em segundos. Seus compromissos pessoais são ocultados automaticamente.
            </p>
            <button
              onClick={handleConnectGoogleCalendar}
              className="btn-primary flex items-center space-x-2 cursor-pointer"
            >
              <Plus size={18} />
              <span>Conectar Google Agenda</span>
            </button>
          </div>
        ) : calendarLoading ? (
          <div className="py-12 flex flex-col items-center justify-center space-y-3 bg-brand-bg/20 rounded-xl border border-brand-border/50 border-dashed">
            <Loader2 size={36} className="animate-spin text-brand-primary" />
            <span className="text-sm text-brand-primary font-semibold animate-pulse">Processando calendário...</span>
            <span className="text-xs text-brand-text-muted">Aguarde enquanto sincronizamos seus atendimentos</span>
          </div>
        ) : calendarError ? (
          <div className="p-4 bg-red-50 text-red-700 rounded-xl text-sm flex items-center space-x-2">
            <AlertCircle size={18} />
            <span>{calendarError}</span>
          </div>
        ) : calendarEvents.length === 0 ? (
          <div className="py-8 text-center text-brand-text-muted max-w-md mx-auto">
            <p className="text-sm font-medium">Nenhum atendimento clínico agendado para esta semana.</p>
            <p className="text-xs mt-1">Apenas compromissos contendo o nome ou apelido de seus pacientes ativos aparecem aqui.</p>
          </div>
        ) : (
          <div className="divide-y divide-brand-border">
            {calendarEvents.map((event) => {
              let startStr = "";
              let endStr = "";
              if (event.start?.dateTime) {
                const startDate = new Date(event.start.dateTime);
                startStr = startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              } else if (event.start?.date) {
                startStr = "Dia inteiro";
              }

              if (event.end?.dateTime) {
                const endDate = new Date(event.end.dateTime);
                endStr = endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              }

              const timeRange = startStr === "Dia inteiro" ? "Dia inteiro" : `${startStr} - ${endStr}`;

              // Identificar o dia do evento para exibir no label
              let dateLabel = "Hoje";
              if (event.eventDateStr) {
                const now = new Date();
                const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                
                const yesterday = new Date();
                yesterday.setDate(now.getDate() - 1);
                const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

                if (event.eventDateStr === todayStr) {
                  dateLabel = "Hoje";
                } else if (event.eventDateStr === yesterdayStr) {
                  dateLabel = "Ontem";
                } else {
                  const parts = event.eventDateStr.split('-');
                  const eventDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
                  const weekdays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
                  const weekday = weekdays[eventDate.getDay()];
                  dateLabel = `${weekday}, ${parts[2]}/${parts[1]}`;
                }
              }

              return (
                <div key={event.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 first:pt-0 last:pb-0">
                  <div className="flex items-start space-x-3">
                    <div className="mt-1 bg-brand-bg text-brand-text-muted p-2 rounded-lg flex flex-col items-center justify-center min-w-[65px] border border-brand-border">
                      <Clock size={16} className="text-brand-primary mb-1" />
                      <span className="text-[10px] font-semibold text-brand-primary">{startStr}</span>
                    </div>
                    <div>
                      <h4 className="font-semibold text-brand-text">
                        {event.summary}
                      </h4>
                      <div className="flex items-center space-x-2 mt-1">
                        <span className="text-xs text-brand-text-muted">
                          Paciente: <strong className="text-brand-primary">{event.patient?.full_name || 'Não identificado'}</strong>
                        </span>
                        <span className="text-xs text-stone-300">•</span>
                        <span className="text-xs text-brand-text-muted">
                          <span className="font-semibold text-brand-primary mr-1">{dateLabel}</span> {timeRange}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {event.evolved ? (
                      <span className="inline-flex items-center px-2.5 py-1.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm">
                        <CheckCircle2 size={14} className="mr-1 text-emerald-600" />
                        Evoluído
                      </span>
                    ) : event.patient ? (
                      <Link
                        to={`/painel/patients/${event.patient.id}/evolutions/new?date=${event.eventDateStr}`}
                        className="btn-primary py-1.5 px-3 text-xs flex items-center space-x-1.5 shadow-sm"
                      >
                        <Mic size={14} />
                        <span>Evoluir Sessão</span>
                      </Link>
                    ) : (
                      <span className="text-xs text-red-500 font-medium">Paciente inativo ou não encontrado</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick Actions & Navigation Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Full History Card */}
        <Link 
          to="/painel/history" 
          className="group relative overflow-hidden card p-8 bg-white flex flex-col justify-between shadow-lg hover:shadow-xl transition-all border-0"
        >
          <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 group-hover:opacity-10 transition-all text-brand-primary">
            <HistoryIcon size={160} />
          </div>
          <div className="relative z-10">
            <div className="bg-brand-primary/10 w-12 h-12 rounded-xl flex items-center justify-center text-brand-primary mb-6">
              <HistoryIcon size={24} />
            </div>
            <h3 className="text-2xl font-display font-bold text-brand-text mb-2">Histórico Completo</h3>
            <p className="text-brand-text-muted text-sm leading-relaxed mb-6 max-w-xs">
              Acesse todas as suas evoluções passadas, revise transcrições e monitore o status do Google Docs.
            </p>
          </div>
          <div className="flex items-center text-brand-primary font-bold text-sm tracking-wide uppercase relative z-10">
            <span>Explorar Histórico</span>
            <ArrowRight size={18} className="ml-2 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>

        {/* Support/Quick Guide Card */}
        <div className="card p-8 bg-brand-primary text-white flex flex-col justify-between relative overflow-hidden shadow-2xl border-0">
          <div className="absolute -top-12 -right-12 w-48 h-48 bg-white/15 rounded-full blur-3xl" />
          <div className="relative z-10">
            <BookOpen className="text-white mb-4" size={40} />
            <h3 className="text-2xl font-display font-bold mb-2 text-white">Central de Ajuda</h3>
            <p className="text-white/80 text-sm leading-relaxed mb-6">
              Ainda tem dúvidas de como o Evolução Clínica pode agilizar seu dia a dia? Conheça nosso guia completo.
            </p>
          </div>
          <Link 
            to="/painel/tutorial" 
            className="bg-white text-brand-primary py-3 px-6 rounded-xl font-bold text-center hover:bg-gray-100 transition-all flex items-center justify-center space-x-2 relative z-10 group"
          >
            <span>Acessar Tutorial</span>
            <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </div>
    </div>
  );
}
