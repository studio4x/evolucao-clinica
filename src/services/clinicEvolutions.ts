import { supabase } from "../supabaseClient";

export { draftMatchesEvolutionContext, type EvolutionContext } from "./evolutionContext";
export type ClinicEvolutionInput = { sessionDate:string; sessionTime?:string|null; templateId?:string|null; evolutionId?:string };
export type ClinicEvolutionUpdate = Partial<ClinicEvolutionInput> & {
  transcriptionText?:string; originalTranscriptionText?:string; transcriptionStatus?:"processing"|"completed"|"failed";
  status?:"draft"|"completed"|"signed"; errorMessage?:string|null;
};
export async function clinicEvolutionRequest(organizationPatientId:string, method="GET", input?:ClinicEvolutionInput|ClinicEvolutionUpdate, evolutionId?:string) {
  const { data:{ session } }=await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Sua sessão expirou. Faça login novamente.");
  const path=`/api/clinic/patients/${encodeURIComponent(organizationPatientId)}/evolutions${evolutionId ? `/${encodeURIComponent(evolutionId)}` : ""}`;
  const response=await fetch(path,{ method,cache:"no-store",headers:{ Authorization:`Bearer ${session.access_token}`,...(input ? { "Content-Type":"application/json" } : {}) },...(input ? { body:JSON.stringify(input) } : {}) });
  const body=await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(response.status === 403 || response.status === 404 ? "Você não possui acesso a esta evolução ou o workspace não permite escrita." : "Não foi possível salvar ou carregar a evolução.");
  return body;
}
