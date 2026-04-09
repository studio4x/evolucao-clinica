import { useEffect, useState } from 'react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Link } from 'react-router-dom';
import { Plus, Search, FileText } from 'lucide-react';

export default function Patients() {
  const [patients, setPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchPatients = async () => {
      if (!auth.currentUser) return;
      try {
        const q = query(
          collection(db, 'patients'),
          where('professional_id', '==', auth.currentUser.uid),
          orderBy('full_name')
        );
        const snap = await getDocs(q);
        setPatients(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (error) {
        console.error("Error fetching patients:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchPatients();
  }, []);

  const filteredPatients = patients.filter(p => 
    p.full_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Pacientes</h1>
        <Link 
          to="/patients/new" 
          className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center space-x-2 hover:bg-blue-700 w-full sm:w-auto justify-center"
        >
          <Plus size={20} />
          <span>Novo Paciente</span>
        </Link>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          <input 
            type="text"
            placeholder="Buscar paciente por nome..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Carregando pacientes...</div>
        ) : filteredPatients.length === 0 ? (
          <div className="p-8 text-center text-gray-500">Nenhum paciente encontrado.</div>
        ) : (
          <div className="divide-y">
            {filteredPatients.map((patient) => (
              <div key={patient.id} className="p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between hover:bg-gray-50 gap-4">
                <div>
                  <h3 className="font-semibold text-gray-900 text-lg">{patient.full_name}</h3>
                  <div className="flex items-center space-x-2 mt-1">
                    <span className={`px-2 py-1 text-xs rounded-full ${patient.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                      {patient.status === 'active' ? 'Ativo' : 'Inativo'}
                    </span>
                    {patient.google_doc_id && (
                      <span className="flex items-center text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-full">
                        <FileText size={12} className="mr-1" />
                        Prontuário Vinculado
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <Link 
                    to={`/patients/${patient.id}`}
                    className="text-blue-600 hover:text-blue-800 font-medium text-sm px-3 py-1.5 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
                  >
                    Ver Detalhes
                  </Link>
                  <Link 
                    to={`/patients/${patient.id}/evolutions/new`}
                    className="bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium text-sm px-3 py-1.5 rounded-lg transition-colors"
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
