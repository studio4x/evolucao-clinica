import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useClinicContextStore } from "../store/clinicContextStore";
import { useAuthStore } from "../store/authStore";
import { supabase } from "../supabaseClient";
import { fetchClinicPatient, type ClinicPatientDetail } from "../services/clinicPatients";
import NewEvolution from "./NewEvolution";

export default function ClinicNewEvolution() {
  const { organizationPatientId }=useParams();
  const { activeContext }=useClinicContextStore();
  const user=useAuthStore(state => state.user);
  const organizationId=activeContext.type === "organization" ? activeContext.organizationId : null;
  const [patient,setPatient]=useState<ClinicPatientDetail|null>(null);
  const [error,setError]=useState(false);
  useEffect(() => {
    let cancelled=false;
    setPatient(null); setError(false);
    const load=async () => {
      try {
        const { data:{ session } }=await supabase.auth.getSession();
        if (!organizationPatientId || !session?.access_token) throw new Error();
        const next=await fetchClinicPatient(session.access_token,organizationPatientId);
        if (next.organizationId !== organizationId || !next.canCreateEvolution) throw new Error();
        if (!cancelled) { setPatient(next); setError(false); }
      } catch { if (!cancelled) { setError(true); setPatient(null); } }
    };
    void load(); window.addEventListener("focus",load);
    return () => { cancelled=true; window.removeEventListener("focus",load); };
  },[organizationPatientId,organizationId,user?.id]);
  if (error) return <div className="space-y-4"><p>Você não possui autorização para criar evoluções neste paciente ou o workspace está em somente leitura.</p><Link to="/painel/clinica/pacientes" className="text-brand-primary">Voltar para pacientes</Link></div>;
  if (!patient || !user) return <p>Validando seu acesso clínico...</p>;
  return <NewEvolution key={`${patient.organizationPatientId}:${user.id}`} workflow={{
    context:{ type:"organization",organizationId:patient.organizationId,organizationPatientId:patient.organizationPatientId,patientId:patient.patientId },
    patient:{ id:patient.patientId,full_name:patient.fullName,birth_date:patient.birthDate,google_doc_id:null },
    canWrite:patient.canCreateEvolution,
  }} />;
}
