import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuthStore } from '../store/authStore';
import { Link } from 'react-router-dom';
import { Plus, Search, FileText } from 'lucide-react';

export default function Patients() {
  const { user } = useAuthStore();
  const [patients, setPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchPatients = async () => {
      if (!user) return;
      try {
        const { data, error } = await supabase
          .from('patients')
          .select('*')
          .eq('professional_id', user.id)
          .order('full_name');
        
        if (error) throw error;
        setPatients(data || []);
      } catch (error) {
        console.error("Error fetching patients:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchPatients();
  }, [user]);

  const filteredPatients = patients.filter(p => 
    p.full_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-display font-semibold text-brand-primary">Pacientes</h1>
        <Link 
          to="/painel/patients/new" 
          className="btn-primary w-full sm:w-auto"
        >
          <Plus size={20} className="mr-2" />
          <span>Novo Paciente</span>
        </Link>
      </div>

      <div className="card p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-brand-text-muted" size={20} />
          <input 
            type="text"
            placeholder="Buscar paciente por nome..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input-field pl-10 pr-4 py-2"
          />
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="p-8 text-center text-brand-text-muted">Carregando pacientes...</div>
        ) : filteredPatients.length === 0 ? (
          <div className="p-8 text-center text-brand-text-muted">Nenhum paciente encontrado.</div>
        ) : (
          <div className="divide-y divide-brand-border">
            {filteredPatients.map((patient) => (
              <div key={patient.id} className="p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between hover:bg-brand-bg transition-colors gap-4">
                <div>
                  <h3 className="font-semibold text-brand-text text-lg">{patient.full_name}</h3>
                  <div className="flex items-center space-x-2 mt-1">
                    <span className={`px-2 py-1 text-xs rounded-full ${patient.status === 'active' ? 'bg-brand-accent/20 text-brand-primary' : 'bg-gray-100 text-gray-700'}`}>
                      {patient.status === 'active' ? 'Ativo' : 'Inativo'}
                    </span>
                    {patient.google_doc_id && (
                      <span className="flex items-center text-xs text-brand-primary bg-brand-primary/10 px-2 py-1 rounded-full">
                        <FileText size={12} className="mr-1" />
                        Prontuário Vinculado
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <Link 
                    to={`/painel/patients/${patient.id}`}
                    className="btn-outline"
                  >
                    Ver Detalhes
                  </Link>
                  <Link 
                    to={`/painel/patients/${patient.id}/evolutions/new`}
                    className="btn-primary bg-brand-primary/10 text-brand-primary hover:bg-brand-primary hover:text-white border-transparent"
                  >
                    Nova Evolução
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
