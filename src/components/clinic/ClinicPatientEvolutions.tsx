import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { clinicEvolutionRequest } from "../../services/clinicEvolutions";
import { getDraftEvolutions, type PendingEvolution } from "../../services/offlineQueue";
import { draftMatchesEvolutionContext } from "../../services/clinicEvolutions";
import { useAuthStore } from "../../store/authStore";
import { type ClinicPatientDetail } from "../../services/clinicPatients";
import { RichTextEditor, RichTextPreview } from "../common/RichTextEditor";
import { showConfirm } from "../../store/modalStore";
import { downloadPdfFile, generateProntuarioPDF } from "../../utils/prontuarioPdf";

export function ClinicPatientEvolutions({ patient }: { patient:ClinicPatientDetail }) {
  const user=useAuthStore(state => state.user);
  const [rows,setRows]=useState<any[]>([]);
  const [drafts,setDrafts]=useState<PendingEvolution[]>([]);
  const [canWrite,setCanWrite]=useState(false);
  const [readScope,setReadScope]=useState<"own"|"administrative">("own");
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [editing,setEditing]=useState<string|null>(null);
  const [text,setText]=useState("");
  const newPath=`/painel/clinica/pacientes/${patient.organizationPatientId}/evolucoes/nova`;
  const load=useCallback(async () => {
    setError(""); setLoading(true); setRows([]); setDrafts([]); setCanWrite(false); setReadScope("own");
    try {
      const result=await clinicEvolutionRequest(patient.organizationPatientId);
      setRows(result.evolutions || []); setCanWrite(Boolean(result.canWrite)); setReadScope(result.readScope === "administrative" ? "administrative" : "own");
      const local=await getDraftEvolutions();
      setDrafts(local.filter(item => user && draftMatchesEvolutionContext(item,{ type:"organization",organizationId:patient.organizationId,organizationPatientId:patient.organizationPatientId,patientId:patient.patientId },user.id)));
    } catch { setError("Não foi possível carregar suas evoluções. Seu acesso pode ter mudado."); }
    finally { setLoading(false); }
  },[patient.organizationPatientId,patient.organizationId,patient.patientId,user?.id]);
  useEffect(() => { void load(); window.addEventListener("focus",load); return () => window.removeEventListener("focus",load); },[load]);
  async function change(row:any,action:"save"|"sign"|"delete") {
    if (action !== "save" && !await showConfirm(action === "sign" ? "A assinatura confirma sua autoria e fecha esta evolução. Depois de assinar, o conteúdo não poderá ser alterado ou excluído." : "Deseja excluir esta evolução não assinada?",{ title:action === "sign" ? "Assinar e fechar evolução" : "Excluir evolução",confirmLabel:action === "sign" ? "Assinar e fechar" : "Excluir",cancelLabel:"Voltar",variant:"danger",icon:"question" })) return;
    setBusy(true); setError("");
    try {
      await clinicEvolutionRequest(patient.organizationPatientId,action === "delete" ? "DELETE" : "PATCH",action === "delete" ? undefined : action === "sign" ? { status:"signed" } : { transcriptionText:text,transcriptionStatus:"completed",status:"completed" },row.id);
      setEditing(null); await load();
    } catch { setError("Não foi possível concluir a ação. Verifique seu acesso e se a evolução já foi assinada."); }
    finally { setBusy(false); }
  }
  async function download(row:any) {
    setBusy(true); setError("");
    try {
      // Re-read with RLS to honor revocation before exporting.
      const result=await clinicEvolutionRequest(patient.organizationPatientId,"GET",undefined,row.id,"export");
      const evo=result.evolution;
      const professional={ full_name:evo.authorName,professional_title:evo.authorProfessionalTitle,professional_register:evo.authorProfessionalRegister };
      const signature=evo.status === "signed" ? `\n\nAssinado por: ${evo.signed_by_name} (${evo.signed_by_register})\nData: ${evo.signature_date}\nMétodo: ${evo.signature_method}\nIP: ${evo.signature_ip}\nHash SHA-256: ${evo.signature_hash}` : "";
      const pdf=generateProntuarioPDF({ content:(evo.transcription_text || "")+signature,patient:{ full_name:patient.fullName,birth_date:patient.birthDate },professional,documentType:"Evolução Clínica",periodLabel:`${evo.session_date || ""} ${evo.session_time || ""}` });
      await downloadPdfFile(pdf,`Evolucao_${evo.id}.pdf`);
    } catch { setError("Não foi possível exportar esta evolução."); }
    finally { setBusy(false); }
  }
  return <section className="rounded-2xl border border-brand-border bg-white p-6 shadow-sm space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold text-brand-text">{readScope === "administrative" ? "Evoluções da clínica" : "Minhas evoluções"}</h2>{canWrite && <Link to={newPath} className="btn-primary">Nova evolução</Link>}</div>
    <p className="text-sm text-brand-text-muted">{readScope === "administrative" ? "Registros realizados pelos profissionais responsáveis por este paciente." : "Compartilhar o paciente não compartilha as evoluções. Apenas suas próprias anotações aparecem aqui."}</p>
    {!loading && !canWrite && !error && <p className="text-sm text-amber-800">Seu acesso clínico permite somente leitura neste momento.</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {loading ? <p>Carregando suas evoluções...</p> : <>
      {canWrite && drafts.map(draft => <Link key={draft.id} to={`${newPath}?draftId=${draft.id}`} className="block rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Recuperar rascunho de {draft.sessionDate}</Link>)}
      {!rows.length && !error && <p className="text-sm text-brand-text-muted">Você ainda não possui evoluções para este paciente.</p>}
      {rows.map(row => <article key={row.id} className="rounded-xl border border-brand-border p-4 space-y-3">
        <p className="text-sm text-brand-text-muted"><span className="font-semibold text-brand-text">Profissional:</span> {row.authorName || "Profissional"}{row.authorProfessionalTitle ? ` · ${row.authorProfessionalTitle}` : ""}{row.authorProfessionalRegister ? ` · ${row.authorProfessionalRegister}` : ""}</p>
        <div className="flex flex-wrap justify-between gap-2"><p className="font-semibold">Sessão: {row.session_date?.split("-").reverse().join("/")} {row.session_time || ""}</p><span className="text-xs text-brand-text-muted">{row.status === "signed" ? "Assinada" : row.transcription_status === "completed" ? "Concluída" : row.transcription_status === "failed" ? "Falha no processamento" : "Rascunho"}</span></div>
        {editing === row.id ? <><RichTextEditor value={text} onChange={setText} disabled={busy} label="Conteúdo da evolução" /><button disabled={busy} onClick={() => void change(row,"save")} className="btn-primary">Salvar</button><button disabled={busy} onClick={() => setEditing(null)} className="btn-outline ml-2">Cancelar</button></> : <RichTextPreview value={row.transcription_text || ""} />}
        {row.status === "signed" && <p className="break-all text-xs text-brand-text-muted">Assinada por {row.signed_by_name} ({row.signed_by_register}) em {new Date(row.signature_date).toLocaleString("pt-BR")}. Hash SHA-256: {row.signature_hash}</p>}
        <div className="flex flex-wrap gap-3 text-sm">
          {row.transcription_text && <button disabled={busy} onClick={() => void download(row)} className="btn-outline">PDF</button>}
          {canWrite && row.isOwn === true && row.status !== "signed" && <>
            <button disabled={busy} onClick={() => { setEditing(row.id); setText(row.transcription_text || row.original_transcription_text || ""); }} className="btn-outline">Editar</button>
            {row.transcription_status === "completed" && <button disabled={busy} onClick={() => void change(row,"sign")} className="btn-outline">Assinar e fechar</button>}
            <button disabled={busy} onClick={() => void change(row,"delete")} className="text-red-700">Excluir</button>
          </>}
        </div>
      </article>)}
    </>}
  </section>;
}
