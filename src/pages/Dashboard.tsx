import { useEffect, useState } from 'react';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Link } from 'react-router-dom';
import { Users, FileAudio, AlertCircle, Plus, BookOpen, Mic, FileText, CheckCircle2 } from 'lucide-react';
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
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-display font-semibold text-brand-primary">Dashboard</h1>
        <Link 
          to="/patients" 
          className="btn-primary"
        >
          <Plus size={20} className="mr-2" />
          <span>Nova Evolução</span>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card p-6">
          <div className="flex items-center space-x-4">
            <div className="bg-brand-primary/10 p-3 rounded-xl text-brand-primary">
              <Users size={24} />
            </div>
            <div>
              <p className="text-sm text-brand-text-muted font-medium">Pacientes Ativos</p>
              <p className="text-2xl font-display font-bold text-brand-text">{stats.totalPatients}</p>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center space-x-4">
            <div className="bg-brand-accent/20 p-3 rounded-xl text-brand-primary">
              <FileAudio size={24} />
            </div>
            <div>
              <p className="text-sm text-brand-text-muted font-medium">Evoluções Recentes</p>
              <p className="text-2xl font-display font-bold text-brand-text">{stats.recentEvolutions}</p>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center space-x-4">
            <div className="bg-red-50 p-3 rounded-xl text-red-600">
              <AlertCircle size={24} />
            </div>
            <div>
              <p className="text-sm text-brand-text-muted font-medium">Falhas de Processamento</p>
              <p className="text-2xl font-display font-bold text-brand-text">{stats.errorEvolutions}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="px-6 py-4 border-b border-brand-border flex items-center space-x-2 bg-brand-bg/50">
          <BookOpen className="text-brand-primary" size={20} />
          <h2 className="text-lg font-display font-semibold text-brand-primary">Como utilizar o App</h2>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="space-y-3">
            <div className="w-10 h-10 bg-brand-primary/10 rounded-full flex items-center justify-center text-brand-primary font-bold">1</div>
            <h3 className="font-semibold text-brand-text flex items-center space-x-2">
              <Users size={18} className="text-brand-primary/70" />
              <span>Cadastrar</span>
            </h3>
            <p className="text-sm text-brand-text-muted">
              Cadastre seus pacientes e vincule o <strong>ID do Google Docs</strong> onde as evoluções serão salvas.
            </p>
          </div>

          <div className="space-y-3">
            <div className="w-10 h-10 bg-brand-primary/10 rounded-full flex items-center justify-center text-brand-primary font-bold">2</div>
            <h3 className="font-semibold text-brand-text flex items-center space-x-2">
              <Mic size={18} className="text-brand-primary/70" />
              <span>Gravar Áudio</span>
            </h3>
            <p className="text-sm text-brand-text-muted">
              Na página do paciente, clique em <strong>Nova Evolução</strong> e grave seu relato clínico ou envie um arquivo.
            </p>
          </div>

          <div className="space-y-3">
            <div className="w-10 h-10 bg-brand-primary/10 rounded-full flex items-center justify-center text-brand-primary font-bold">3</div>
            <h3 className="font-semibold text-brand-text flex items-center space-x-2">
              <FileText size={18} className="text-brand-primary/70" />
              <span>Processar</span>
            </h3>
            <p className="text-sm text-brand-text-muted">
              A IA transcreve o áudio, corrige vícios de fala e formata o texto para um padrão profissional.
            </p>
          </div>

          <div className="space-y-3">
            <div className="w-10 h-10 bg-brand-primary/10 rounded-full flex items-center justify-center text-brand-primary font-bold">4</div>
            <h3 className="font-semibold text-brand-text flex items-center space-x-2">
              <CheckCircle2 size={18} className="text-brand-primary/70" />
              <span>Google Docs</span>
            </h3>
            <p className="text-sm text-brand-text-muted">
              O texto é inserido automaticamente no <strong>início do documento</strong> vinculado, empurrando o conteúdo antigo para baixo.
            </p>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="px-6 py-4 border-b border-brand-border bg-brand-bg/50">
          <h2 className="text-lg font-display font-semibold text-brand-primary">Últimas Evoluções</h2>
        </div>
        <div className="divide-y divide-brand-border">
          {recentEvolutionsList.length === 0 ? (
            <div className="p-6 text-center text-brand-text-muted">Nenhuma evolução registrada ainda.</div>
          ) : (
            recentEvolutionsList.map((evo) => (
              <div key={evo.id} className="p-6 flex items-center justify-between hover:bg-brand-bg transition-colors">
                <div>
                  <p className="font-medium text-brand-text">Sessão: {evo.session_date}</p>
                  <p className="text-sm text-brand-text-muted">Status: {evo.transcription_status}</p>
                </div>
                <Link to={`/patients/${evo.patient_id}`} className="text-brand-primary hover:text-brand-primary-hover hover:underline text-sm font-medium">
                  Ver Paciente
                </Link>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
