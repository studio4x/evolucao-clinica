import assert from "node:assert/strict";
import express from "express";
import { validateClinicEvolutionPayload,registerClinicEvolutionRoutes } from "../server/clinic/clinicEvolutionRoutes.js";
const uuid="16fa4111-52d2-4b8f-866e-2c669ea80a99";
const input={sessionDate:"2026-09-17",sessionTime:"14:30",evolutionId:uuid};
assert.equal(validateClinicEvolutionPayload(input,true),true);
for(const key of ["professionalId","professional_id","patientId","patient_id","organizationId","organization_id","organization_patient_id","signature_hash","signed_by_name","google_doc_append_status"]) assert.equal(validateClinicEvolutionPayload({...input,[key]:uuid},true),false);
for(const bad of [{sessionDate:"2026-02-30"},{sessionDate:"2026-09-17",sessionTime:"25:00"},{sessionDate:"2026-09-17",templateId:"invalid"},[],null]) assert.equal(validateClinicEvolutionPayload(bad,true),false);
assert.equal(validateClinicEvolutionPayload({transcriptionText:"synthetic",status:"completed"},false),true);
assert.equal(validateClinicEvolutionPayload({professionalId:uuid,transcriptionText:"synthetic"},false),false);
assert.equal(validateClinicEvolutionPayload({signature_hash:"forged"},false),false);
assert.equal(validateClinicEvolutionPayload({status:"unknown"},false),false);
const app=express();app.use(express.json());
const deps={requireAuth:(req:any,res:any,next:any) => {if(!req.headers.authorization) return res.status(401).json({error:"authentication_required"});req.user={id:uuid};next();},supabaseUrl:"https://example.supabase.co",supabaseAnonKey:"public-test",clinicFeatureEnabled:true};
registerClinicEvolutionRoutes(app,deps);
const listener=app.listen(0,"127.0.0.1");
await new Promise<void>(resolve => listener.once("listening",resolve));
const address=listener.address() as {port:number};
try {
  const response=await fetch(`http://127.0.0.1:${address.port}/api/clinic/patients/${uuid}/evolutions`,{method:"POST",headers:{Authorization:"Bearer test","Content-Type":"application/json"},body:JSON.stringify({...input,professionalId:uuid})});
  assert.equal(response.status,400); assert.match(response.headers.get("cache-control") || "",/private, no-store/); assert.equal(response.headers.get("vary"),"Authorization");
  const invalid=await fetch(`http://127.0.0.1:${address.port}/api/clinic/patients/invalid/evolutions`,{headers:{Authorization:"Bearer test"}});assert.equal(invalid.status,400);
  const unauthenticated=await fetch(`http://127.0.0.1:${address.port}/api/clinic/patients/${uuid}/evolutions`);
  assert.equal(unauthenticated.status,401);assert.equal(unauthenticated.headers.get("cache-control"),"private, no-store");assert.equal(unauthenticated.headers.get("vary"),"Authorization");
} finally { await new Promise<void>((resolve,reject) => listener.close(error => error ? reject(error) : resolve())); }
console.log("clinic evolution authorization: PASS");
