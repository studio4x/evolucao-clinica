import { createUserScopedClient } from "../supabase/createUserScopedClient.js";
import { readClinicPatientUuid } from "./clinicPatientRoutes.js";

// Phase 3 patient RLS excludes organization patients regardless of their legacy creator.
// Run before privileged patient/evolution queries and before any external provider call.
export function createPersonalPatientGuard(deps: { supabaseUrl:string; supabaseAnonKey:string }) {
  return async (req:any,res:any,next:any) => {
    res.setHeader("Cache-Control","private, no-store"); res.setHeader("Vary","Authorization");
    const id=readClinicPatientUuid(req.params.id);
    const token=String(req.headers.authorization || "").match(/^Bearer\s+(.+)$/i)?.[1];
    if (!id || !token || !req.user?.id) return res.status(404).json({ error:"patient_not_found" });
    try {
      const client=createUserScopedClient({ ...deps,accessToken:token });
      const result=await client.from("patients").select("*").eq("id",id).eq("professional_id",req.user.id).maybeSingle();
      if (result.error || !result.data) return res.status(404).json({ error:"patient_not_found" });
      req.personalPatient=result.data; return next();
    } catch { return res.status(503).json({ error:"patient_authorization_unavailable" }); }
  };
}
