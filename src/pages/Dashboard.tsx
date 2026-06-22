import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuthStore } from '../store/authStore';
import { Link } from 'react-router-dom';
import { Users, FileAudio, AlertCircle, Plus, BookOpen, Mic, FileText, CheckCircle2, ArrowRight, History as HistoryIcon, Clock, Calendar } from 'lucide-react';
import { listGoogleCalendarEvents } from '../services/googleCalendar';

export default function Dashboard() {
  const { user, googleAccessToken, setGoogleAccessToken } = useAuthStore();
  const [stats, setStats] = useState({
    totalPatients: 0,
    recentEvolutions: 0,
    errorEvolutions: 0,
    totalMinutes: 0
  });
  const [loading, setLoading] = useState(true);

  // Estados da integração com o Google Calendar
  const [patients, setPatients] = useState<any[]>([]);
  const [evolvedPatientIds, setEvolvedPatientIds] = useState<Set<string>>(new Set());
  const [calendarEvents, setCalendarEvents] = useState<any[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);

  const handleConnectGoogleCalendar = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          scopes: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.metadata.readonly https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/calendar.events.readonly',
          redirectTo: window.location.origin + window.location.pathname
        }
      });
      if (error) throw error;
    } catch (error) {
      console.error("Erro ao conectar Google Agenda:", error);
      alert("Erro ao iniciar conexão com o Google.");
    }
  };

  useEffect(() => {
    const fetchCalendarAndPatients = async () => {
      if (!user) return;
      
      try {
        setCalendarLoading(true);
        setCalendarError(null);

        // 1. Busca pacientes ativos
        const { data: patientsData, error: patientsError } = await supabase
          .from('patients')
          .select('id, name, nickname')
          .eq('professional_id', user.id)
          .eq('status', 'active');

        if (patientsError) throw patientsError;
        setPatients(patientsData || []);

        // 2. Busca evoluções realizadas hoje (no fuso local do terapeuta)
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const localTodayStr = `${year}-${month}-${day}`;

        const { data: evolutionsToday, error: evolutionsError } = await supabase
          .from('evolutions')
          .select('id, patient_id')
          .eq('professional_id', user.id)
          .eq('session_date', localTodayStr);

        if (evolutionsError) throw evolutionsError;

        const evolvedSet = new Set<string>(evolutionsToday?.map(e => e.patient_id) || []);
        setEvolvedPatientIds(evolvedSet);

        // 3. Busca eventos do Google Calendar se estiver conectado
        if (googleAccessToken) {
          const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
          const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
          
          try {
            const events = await listGoogleCalendarEvents(
              googleAccessToken,
              startOfDay.toISOString(),
              endOfDay.toISOString()
            );

            // Filtra os eventos comparando inteligentemente com os pacientes ativos
            const matchedEvents = events.filter(event => {
              return (patientsData || []).some(patient => {
                const summary = (event.summary || '').toLowerCase();
                const description = (event.description || '').toLowerCase();
                const name = patient.name.toLowerCase();
                const nickname = (patient.nickname || '').toLowerCase();

                // Correspondência exata do nome completo ou apelido
                if (summary.includes(name) || description.includes(name)) return true;
                if (nickname && nickname.length > 2 && (summary.includes(nickname) || description.includes(nickname))) return true;

                // Correspondência do primeiro nome com limite de palavra
                const nameParts = name.split(/\s+/).filter(p => p.length > 2);
                if (nameParts.length > 0) {
                  const firstName = nameParts[0];
                  const regex = new RegExp(`\\b${firstName}\\b`, 'i');
                  if (regex.test(summary) || regex.test(description)) {
                    return true;
                  }
                }

                return false;
              });
            });

            // Mapeia eventos adicionando o objeto de paciente e status
            const mappedEvents = matchedEvents.map(event => {
              const matchedPatient = (patientsData || []).find(patient => {
                const summary = (event.summary || '').toLowerCase();
                const description = (event.description || '').toLowerCase();
                const name = patient.name.toLowerCase();
                const nickname = (patient.nickname || '').toLowerCase();

                if (summary.includes(name) || description.includes(name)) return true;
                if (nickname && nickname.length > 2 && (summary.includes(nickname) || description.includes(nickname))) return true;

                const nameParts = name.split(/\s+/).filter(p => p.length > 2);
                if (nameParts.length > 0) {
                  const firstName = nameParts[0];
                  const regex = new RegExp(`\\b${firstName}\\b`, 'i');
                  if (regex.test(summary) || regex.test(description)) {
                    return true;
                  }
                }
                return false;
              });

              return {
                ...event,
                patient: matchedPatient,
                evolved: matchedPatient ? evolvedSet.has(matchedPatient.id) : false
              };
            });

            setCalendarEvents(mappedEvents);
          } catch (calError: any) {
            console.error("Error fetching Google Calendar events:", calError);
            if (calError.message && calError.message.includes("UNAUTHENTICATED")) {
              setGoogleAccessToken(null);
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
    };

    fetchCalendarAndPatients();
  }, [user, googleAccessToken, setGoogleAccessToken]);

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

      {/* Seção Google Agenda: Atendimentos de Hoje */}
      <div className="card p-6 bg-white border border-brand-border shadow-md">
        <div className="flex items-center justify-between border-b border-brand-border pb-4 mb-4">
          <div className="flex items-center space-x-3">
            <div className="bg-brand-primary/10 text-brand-primary p-2 rounded-xl">
              <Calendar size={22} />
            </div>
            <div>
              <h2 className="text-xl font-display font-bold text-brand-primary">Atendimentos de Hoje</h2>
              <p className="text-sm text-brand-text-muted">Sincronizado com o seu Google Agenda</p>
            </div>
          </div>
          {googleAccessToken && (
            <button 
              onClick={handleConnectGoogleCalendar}
              className="text-xs text-brand-primary hover:underline font-medium cursor-pointer"
            >
              Reconectar/Sincronizar Agenda
            </button>
          )}
        </div>

        {!googleAccessToken ? (
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
          <div className="py-8 flex flex-col items-center justify-center space-y-2">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary"></div>
            <span className="text-sm text-brand-text-muted">Sincronizando atendimentos de hoje...</span>
          </div>
        ) : calendarError ? (
          <div className="p-4 bg-red-50 text-red-700 rounded-xl text-sm flex items-center space-x-2">
            <AlertCircle size={18} />
            <span>{calendarError}</span>
          </div>
        ) : calendarEvents.length === 0 ? (
          <div className="py-8 text-center text-brand-text-muted max-w-md mx-auto">
            <p className="text-sm font-medium">Nenhum atendimento clínico agendado para hoje.</p>
            <p className="text-xs mt-1">Apenas eventos com o nome ou apelido de seus pacientes ativos aparecem aqui.</p>
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
                          Paciente: <strong className="text-brand-primary">{event.patient?.nickname || event.patient?.name || 'Não identificado'}</strong>
                        </span>
                        <span className="text-xs text-stone-300">•</span>
                        <span className="text-xs text-brand-text-muted">
                          {timeRange}
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
                        to={`/painel/patients/${event.patient.id}/evolutions/new`}
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
