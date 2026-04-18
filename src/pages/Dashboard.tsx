import { useEffect, useState } from 'react';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Link } from 'react-router-dom';
import { Users, FileAudio, AlertCircle, Plus, BookOpen, Mic, FileText, CheckCircle2, ArrowRight, History as HistoryIcon } from 'lucide-react';
import { format } from 'date-fns';

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalPatients: 0,
    recentEvolutions: 0,
    errorEvolutions: 0
  });
  const [recentEvolutionsList, setRecentEvolutionsList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      if (!auth.currentUser) return;
      const uid = auth.currentUser.uid;

      try {
        // Fetch total patients
        const patientsQ = query(collection(db, 'patients'), where('professional_id', '==', uid), where('status', '==', 'active'));
        const patientsSnap = await getDocs(patientsQ);
        
        // Fetch recent evolutions
        const evolutionsQ = query(
          collection(db, 'evolutions'), 
          where('professional_id', '==', uid),
          orderBy('created_at', 'desc'),
          limit(5)
        );
        const evolutionsSnap = await getDocs(evolutionsQ);
        
        // Fetch error evolutions
        const errorsQ = query(
          collection(db, 'evolutions'), 
          where('professional_id', '==', uid),
          where('transcription_status', '==', 'failed')
        );
        const errorsSnap = await getDocs(errorsQ);

        const evolutions = evolutionsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        setStats({
          totalPatients: patientsSnap.size,
          recentEvolutions: evolutionsSnap.size, // Just showing count of recent 5 for now, or total? Let's just show total patients
          errorEvolutions: errorsSnap.size
        });
        
        setRecentEvolutionsList(evolutions);
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  if (loading) return <div>Carregando...</div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Welcome Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-brand-primary">
            Olá, {auth.currentUser?.displayName?.split(' ')[0] || 'Terapeuta'}!
          </h1>
          <p className="text-brand-text-muted mt-1">
            Aqui está o resumo dos seus atendimentos clínicos.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link 
            to="/tutorial" 
            className="btn-outline flex items-center space-x-2 bg-white"
          >
            <BookOpen size={18} />
            <span>Ver Tutorial</span>
          </Link>
          <Link 
            to="/patients/new" 
            className="btn-primary flex items-center shadow-lg shadow-brand-primary/20"
          >
            <Plus size={20} className="mr-2" />
            <span>Novo Paciente</span>
          </Link>
        </div>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link to="/patients" className="group relative overflow-hidden card p-0 border-0 shadow-lg hover:shadow-xl transition-all">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent" />
          <div className="p-6 relative z-10">
            <div className="bg-blue-500 w-12 h-12 rounded-2xl flex items-center justify-center text-white mb-4 shadow-lg group-hover:scale-110 transition-transform">
              <Users size={24} />
            </div>
            <p className="text-sm text-brand-text-muted font-medium uppercase tracking-wider">Pacientes Ativos</p>
            <p className="text-4xl font-display font-bold text-brand-text mt-1">{stats.totalPatients}</p>
          </div>
        </Link>

        <Link to="/history" className="group relative overflow-hidden card p-0 border-0 shadow-lg hover:shadow-xl transition-all">
          <div className="absolute inset-0 bg-gradient-to-br from-brand-primary/10 to-transparent" />
          <div className="p-6 relative z-10">
            <div className="bg-brand-primary w-12 h-12 rounded-2xl flex items-center justify-center text-white mb-4 shadow-lg group-hover:scale-110 transition-transform">
              <FileAudio size={24} />
            </div>
            <p className="text-sm text-brand-text-muted font-medium uppercase tracking-wider">Evoluções Realizadas</p>
            <p className="text-4xl font-display font-bold text-brand-text mt-1">{stats.recentEvolutions}</p>
          </div>
        </Link>
      </div>

      {/* Quick Actions & Navigation Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Full History Card */}
        <Link 
          to="/history" 
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
        <div className="card p-8 bg-slate-900 text-white flex flex-col justify-between relative overflow-hidden shadow-2xl border-0">
          <div className="absolute -top-12 -right-12 w-48 h-48 bg-brand-primary/20 rounded-full blur-3xl" />
          <div className="relative z-10">
            <BookOpen className="text-brand-primary mb-4" size={40} />
            <h3 className="text-2xl font-display font-bold mb-2">Central de Ajuda</h3>
            <p className="text-slate-400 text-sm leading-relaxed mb-6">
              Ainda tem dúvidas de como o Evolução Clínica pode agilizar seu dia a dia? Conheça nosso guia completo.
            </p>
          </div>
          <Link 
            to="/tutorial" 
            className="bg-brand-primary text-white py-3 px-6 rounded-xl font-bold text-center hover:bg-brand-primary-hover transition-all flex items-center justify-center space-x-2 relative z-10 group"
          >
            <span>Acessar Tutorial</span>
            <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </div>
    </div>
  );
}
