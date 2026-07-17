import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuthStore } from '../store/authStore';
import { Link } from 'react-router-dom';
import { Activity, Bell, Calendar, FileText, MessageCircle, Plus, Search } from 'lucide-react';

type PatientEvolution = {
  patient_id: string;
  session_date: string | null;
  session_time: string | null;
  created_at: string | null;
};

type PatientEvolutionSummary = {
  count: number;
  last: PatientEvolution | null;
};

const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const calculateAge = (birthDate: string | null | undefined): number | null => {
  if (!birthDate) return null;

  const [year, month, day] = birthDate.split('-').map(Number);
  if (!year || !month || !day) return null;

  const today = new Date();
  const birth = new Date(year, month - 1, day);
  if (Number.isNaN(birth.getTime()) || birth > today) return null;

  let age = today.getFullYear() - year;
  const hasHadBirthday = today.getMonth() + 1 > month
    || (today.getMonth() + 1 === month && today.getDate() >= day);
  if (!hasHadBirthday) age -= 1;

  return age >= 0 ? age : null;
};

const formatDate = (date: string | null | undefined): string => {
  if (!date) return '';
  const datePart = date.substring(0, 10);
  const [year, month, day] = datePart.split('-');
  if (year && month && day) return `${day}/${month}/${year}`;

  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleDateString('pt-BR');
};

const getEvolutionTimestamp = (evolution: PatientEvolution): number => {
  const dateValue = evolution.session_date
    ? `${evolution.session_date}T${evolution.session_time || '00:00:00'}`
    : evolution.created_at || '';
  const timestamp = new Date(dateValue).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

const getWhatsAppUrl = (phone: string | null | undefined): string | null => {
  const cleanPhone = String(phone || '').replace(/\D/g, '');
  if (!cleanPhone) return null;

  const isMobile = typeof navigator !== 'undefined'
    && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  return isMobile
    ? `https://wa.me/${cleanPhone}`
    : `https://web.whatsapp.com/send?phone=${cleanPhone}`;
};

const getReminderLabel = (patient: any): string | null => {
  if (!patient.evolution_reminder_active) return null;

  const days = Array.isArray(patient.session_days)
    ? patient.session_days
      .filter((day: unknown): day is number => typeof day === 'number' && Number.isInteger(day) && day >= 0 && day <= 6)
      .sort((a: number, b: number) => a - b)
      .map((day: number) => WEEKDAY_LABELS[day])
    : [];
  const time = patient.session_time ? String(patient.session_time).substring(0, 5) : '';

  if (!days.length || !time) return 'Lembrete ativo';
  return `Lembrete: ${days.join(', ')} · ${time}`;
};

export default function Patients() {
  const { user } = useAuthStore();
  const [patients, setPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchPatients = async () => {
      if (!user) return;
      try {
        const [patientsResult, evolutionsResult] = await Promise.all([
          supabase
            .from('patients')
            .select('*')
            .eq('professional_id', user.id)
            .order('full_name'),
          supabase
            .from('evolutions')
            .select('patient_id, session_date, session_time, created_at')
            .eq('professional_id', user.id)
            .eq('transcription_status', 'completed')
        ]);

        if (patientsResult.error) throw patientsResult.error;
        if (evolutionsResult.error) throw evolutionsResult.error;

        const evolutionSummaries = new Map<string, PatientEvolutionSummary>();
        for (const evolution of (evolutionsResult.data || []) as PatientEvolution[]) {
          const current = evolutionSummaries.get(evolution.patient_id) || { count: 0, last: null };
          current.count += 1;
          if (!current.last || getEvolutionTimestamp(evolution) > getEvolutionTimestamp(current.last)) {
            current.last = evolution;
          }
          evolutionSummaries.set(evolution.patient_id, current);
        }

        setPatients((patientsResult.data || []).map((patient) => ({
          ...patient,
          evolutionSummary: evolutionSummaries.get(patient.id) || { count: 0, last: null }
        })));
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
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3 text-xs text-brand-text-muted">
                    {calculateAge(patient.birth_date) !== null && (
                      <span className="inline-flex items-center gap-1 whitespace-nowrap">
                        <Calendar size={13} />
                        {calculateAge(patient.birth_date)} {calculateAge(patient.birth_date) === 1 ? 'ano' : 'anos'}
                      </span>
                    )}
                    {patient.evolutionSummary?.last && (
                      <span className="inline-flex items-center gap-1 whitespace-nowrap">
                        <Calendar size={13} />
                        Último atendimento: {formatDate(patient.evolutionSummary.last.session_date || patient.evolutionSummary.last.created_at)}
                        {patient.evolutionSummary.last.session_time && `, ${patient.evolutionSummary.last.session_time.substring(0, 5)}`}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 whitespace-nowrap">
                      <Activity size={13} />
                      {patient.evolutionSummary?.count || 0} {patient.evolutionSummary?.count === 1 ? 'evolução' : 'evoluções'}
                    </span>
                    {getReminderLabel(patient) && (
                      <span className="inline-flex items-center gap-1 whitespace-nowrap">
                        <Bell size={13} />
                        {getReminderLabel(patient)}
                      </span>
                    )}
                    {getWhatsAppUrl(patient.phone) && (
                      <a
                        href={getWhatsAppUrl(patient.phone) || undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Abrir WhatsApp de ${patient.full_name}`}
                        className="inline-flex items-center gap-1 whitespace-nowrap text-emerald-700 hover:text-emerald-800 hover:underline"
                      >
                        <MessageCircle size={13} />
                        WhatsApp
                      </a>
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
