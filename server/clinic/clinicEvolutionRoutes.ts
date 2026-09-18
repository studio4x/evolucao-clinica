import { createUserScopedClient } from "../supabase/createUserScopedClient.js";
import { readClinicPatientUuid, type ClinicPatientRouteDeps } from "./clinicPatientRoutes.js";

export function validateClinicEvolutionPayload(body: unknown, creating: boolean): body is Record<string, any> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const input = body as Record<string, any>;
  const allowed = creating ? ["sessionDate", "sessionTime", "templateId", "evolutionId"]
    : ["sessionDate", "sessionTime", "templateId", "transcriptionText", "originalTranscriptionText", "transcriptionStatus", "status", "errorMessage"];
  if (!Object.keys(input).length || Object.keys(input).some(key => !allowed.includes(key))) return false;
  if (creating && !input.sessionDate) return false;
  if (input.sessionDate !== undefined && (typeof input.sessionDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.sessionDate) || Number.isNaN(Date.parse(input.sessionDate)) || new Date(input.sessionDate).toISOString().slice(0,10) !== input.sessionDate)) return false;
  if (input.sessionTime !== undefined && input.sessionTime !== null && (typeof input.sessionTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.sessionTime))) return false;
  if (input.templateId !== undefined && input.templateId !== null && !readClinicPatientUuid(input.templateId)) return false;
  if (input.evolutionId !== undefined && !readClinicPatientUuid(input.evolutionId)) return false;
  for (const key of ["transcriptionText", "originalTranscriptionText", "errorMessage"]) {
    if (input[key] !== undefined && input[key] !== null && (typeof input[key] !== "string" || input[key].length > (key === "errorMessage" ? 500 : 60000))) return false;
  }
  if (input.transcriptionStatus !== undefined && !["processing", "completed", "failed"].includes(input.transcriptionStatus)) return false;
  if (input.status !== undefined && !["draft", "completed", "signed"].includes(input.status)) return false;
  return true;
}

export function registerClinicEvolutionRoutes(app: any, deps: ClinicPatientRouteDeps) {
  const base = "/api/clinic/patients/:organizationPatientId/evolutions";
  const headers = (_req:any,res:any,next:any) => {
    res.setHeader("Cache-Control", "private, no-store"); res.setHeader("Vary", "Authorization"); next();
  };
  const prepare = (req: any, res: any) => {
    res.setHeader("Cache-Control", "private, no-store"); res.setHeader("Vary", "Authorization");
    if (!deps.clinicFeatureEnabled) { res.status(503).json({ ok:false, error:"feature_unavailable" }); return null; }
    const patientId = readClinicPatientUuid(req.params.organizationPatientId);
    const evolutionId = req.params.evolutionId === undefined ? undefined : readClinicPatientUuid(req.params.evolutionId);
    const token = String(req.headers.authorization || "").match(/^Bearer\s+(.+)$/i)?.[1];
    if (!patientId || evolutionId === null || !token || !req.user?.id) { res.status(400).json({ ok:false, error:"invalid_evolution_request" }); return null; }
    return { patientId, evolutionId, client:createUserScopedClient({ supabaseUrl:deps.supabaseUrl, supabaseAnonKey:deps.supabaseAnonKey, accessToken:token }) };
  };
  const fail = (res: any, error: any) => {
    const status = error?.code === "42501" ? 403 : ["22023","22007","23514","23503","22P02"].includes(error?.code) ? 400 : 503;
    return res.status(status).json({ ok:false, error:status === 403 ? "not_authorized" : status === 400 ? "invalid_evolution_request" : "evolution_operation_failed" });
  };
  const read = (detail: boolean) => async (req: any, res: any) => {
    const scope=prepare(req,res); if (!scope) return;
    try {
      const access=await scope.client.rpc("get_organization_evolution_access",{ p_organization_patient_id:scope.patientId });
      if (access.error) return fail(res,access.error);
      if (!access.data?.canRead) return res.status(403).json({ ok:false,error:"not_authorized" });
      let query=scope.client.from("evolutions").select("*").eq("professional_id",req.user.id).eq("organization_patient_id",scope.patientId);
      if (detail) query=query.eq("id",scope.evolutionId);
      const result=await query.order("session_date",{ ascending:false }).order("created_at",{ ascending:false });
      if (result.error) return fail(res,result.error);
      if (detail && !result.data?.length) return res.status(404).json({ ok:false,error:"evolution_not_found" });
      return res.json({ ok:true,...(detail ? { evolution:result.data[0] } : { evolutions:result.data }),canWrite:access.data.canCreate });
    } catch(error) { return fail(res,error); }
  };
  app.get(base,headers,deps.requireAuth,read(false)); app.get(`${base}/:evolutionId`,headers,deps.requireAuth,read(true));
  app.post(base,headers,deps.requireAuth,async (req:any,res:any) => {
    const scope=prepare(req,res); if (!scope) return;
    if (!validateClinicEvolutionPayload(req.body,true)) return res.status(400).json({ ok:false,error:"invalid_evolution_request" });
    try {
      const body=req.body;
      const result=await scope.client.rpc("create_organization_evolution",{ p_organization_patient_id:scope.patientId,p_session_date:body.sessionDate,p_session_time:body.sessionTime ?? null,p_template_id:body.templateId ?? null,...(body.evolutionId ? { p_evolution_id:body.evolutionId } : {}) });
      if (result.error) return fail(res,result.error);
      return res.status(201).json({ ok:true,evolution:Array.isArray(result.data) ? result.data[0] : result.data });
    } catch(error) { return fail(res,error); }
  });
  app.patch(`${base}/:evolutionId`,headers,deps.requireAuth,async (req:any,res:any) => {
    const scope=prepare(req,res); if (!scope) return;
    if (!validateClinicEvolutionPayload(req.body,false)) return res.status(400).json({ ok:false,error:"invalid_evolution_request" });
    const fields:Record<string,string>={ sessionDate:"session_date",sessionTime:"session_time",templateId:"template_id",transcriptionText:"transcription_text",originalTranscriptionText:"original_transcription_text",transcriptionStatus:"transcription_status",status:"status",errorMessage:"error_message" };
    const update=Object.fromEntries(Object.entries(req.body).map(([key,value]) => [fields[key],value]));
    try {
      const result=await scope.client.from("evolutions").update({ ...update,updated_at:new Date().toISOString() }).eq("id",scope.evolutionId).eq("professional_id",req.user.id).eq("organization_patient_id",scope.patientId).select("*");
      if (result.error) return fail(res,result.error);
      if (!result.data?.length) return res.status(404).json({ ok:false,error:"evolution_not_found" });
      return res.json({ ok:true,evolution:result.data[0] });
    } catch(error) { return fail(res,error); }
  });
  app.delete(`${base}/:evolutionId`,headers,deps.requireAuth,async (req:any,res:any) => {
    const scope=prepare(req,res); if (!scope) return;
    try {
      const result=await scope.client.from("evolutions").delete().eq("id",scope.evolutionId).eq("professional_id",req.user.id).eq("organization_patient_id",scope.patientId).neq("status","signed").select("id");
      if (result.error) return fail(res,result.error);
      if (!result.data?.length) return res.status(404).json({ ok:false,error:"evolution_not_found" });
      return res.json({ ok:true });
    } catch(error) { return fail(res,error); }
  });
}
