// One complete synthetic Phase 4 smoke. Staging only. No external integrations.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import dotenv from "dotenv";
import express from "express";
import type { Server } from "node:http";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { registerClinicEvolutionRoutes } from "../server/clinic/clinicEvolutionRoutes.js";
import { createPersonalPatientGuard } from "../server/clinic/personalPatientGuard.js";
import { buildPersonalBackupJson } from "../src/services/personalBackup.js";

assert.ok(process.argv.includes("--confirm-staging-only"),"Explicit staging-only flag required");
const ref="hwkdwinfckmjoriqxbjk";
const url=`https://${ref}.supabase.co`;
const env=dotenv.parse(readFileSync(process.env.SUPABASE_SMOKE_ENV_FILE || ".env.local"));
assert.ok(env.SUPABASE_ACCESS_TOKEN,"Management credential required");
async function management(query:string) {
  const response=await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`,{ method:"POST",headers:{Authorization:`Bearer ${env.SUPABASE_ACCESS_TOKEN}`,"Content-Type":"application/json"},body:JSON.stringify({query}) });
  if (!response.ok) { const failure=await response.json().catch(() => ({})); const code=String(failure?.message || "").match(/ERROR:\s+([0-9A-Z]{5})/)?.[1] || "failed"; throw new Error(`staging_management_${response.status}_${code}`); }
  return response.json();
}
const keyResponse=await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys`,{headers:{Authorization:`Bearer ${env.SUPABASE_ACCESS_TOKEN}`}});
assert.ok(keyResponse.ok);
const keys=await keyResponse.json() as Array<{name:string;api_key:string}>;
const serviceKey=keys.find(key => key.name === "service_role")?.api_key;
const anonKey=keys.find(key => key.name === "anon")?.api_key;
assert.ok(serviceKey && anonKey);
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const admin=createClient(url,serviceKey,options);
const authClient=createClient(url,anonKey,options);
const run=randomUUID().slice(0,8);
const userIds:string[]=[]; const organizationIds:string[]=[]; const patientIds:string[]=[]; const opIds:string[]=[];
const evolutionIds:string[]=[];
const fixtures:Record<string,{id:string;client:SupabaseClient;token:string}>={};
const quoteIds=(ids:string[]) => ids.length ? ids.map(id => { assert.match(id,/^[0-9a-f-]{36}$/); return `'${id}'`; }).join(",") : "NULL";
const checked=(result:any,label:string) => { if (result.error) throw new Error(`${label}_${result.error.code || "failed"}`); return result.data; };
const denied=(result:any) => assert.ok(result.error || result.data?.length === 0,"Expected authorization denial");
const results:Record<string,unknown>={staging:ref,phase:"4",run};
let listener:Server|undefined; let port=0; let externalCalls=0; let baselineProfessionals:string[]=[];
let smokePassed=false;
async function fixture(name:string) {
  const email=`clinic-4-${run}-${name}@example.invalid`; const password=randomBytes(24).toString("base64url");
  const generated=checked(await admin.auth.admin.generateLink({type:"signup",email,password}),"auth_create");
  const id=generated.user?.id as string; assert.ok(id); userIds.push(id);
  const client=createClient(url,anonKey!,options);
  const session=checked(await client.auth.verifyOtp({token_hash:generated.properties?.hashed_token,type:"signup"}),"auth_verify");
  assert.ok(session.session?.access_token); fixtures[name]={id,client,token:session.session.access_token};
}
async function organization(actor:string) {
  const row=checked(await fixtures[actor].client.rpc("create_organization_with_owner",{p_name:`Clínica sintética F4 ${run} ${actor}`}),"create_org");
  const id=row.id as string; assert.ok(id); organizationIds.push(id);
  await management(`insert into private.organization_subscriptions(organization_id,plan_code,billing_interval,currency,base_amount_minor,seat_amount_minor,minimum_contracted_seats,contracted_seats,financial_status) values('${id}','clinic_monthly','monthly','BRL',4990,2990,3,8,'active')`);
  checked(await admin.rpc("set_organization_clinic_rollout_state",{p_organization_id:id,p_enabled:true,p_reason:"Fase 4 synthetic evolution smoke"}),"rollout");
  return id;
}
async function api(actor:string,path:string,method="GET",body?:unknown) {
  const response=await fetch(`http://127.0.0.1:${port}${path}`,{method,headers:{Authorization:`Bearer ${fixtures[actor].token}`,...(body ? {"Content-Type":"application/json"} : {})},...(body ? {body:JSON.stringify(body)} : {})});
  assert.equal(response.headers.get("vary"),"Authorization"); assert.equal(response.headers.get("cache-control"),"private, no-store");
  return {status:response.status,body:await response.json()};
}
const rpc=(actor:string,name:string,args:Record<string,unknown>) => fixtures[actor].client.rpc(name,args);
try {
  const state=(await management("select (select environment_name from private.runtime_environment where id=true) environment,(select allowed_environment from private.clinic_runtime_config where id=true) allowed,(select enabled from private.clinic_runtime_config where id=true) gate"))[0];
  assert.equal(state.environment,"staging");assert.equal(state.allowed,"staging");assert.equal(state.gate,false);
  baselineProfessionals=(await management("select id from public.professionals")).map((row:any) => row.id);
  const acl=await management(`select n.nspname,p.proname,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated,has_function_privilege('anon',p.oid,'EXECUTE') anon,has_function_privilege('service_role',p.oid,'EXECUTE') service_role,exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE') public_execute from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname in ('can_read_organization_evolution','can_create_organization_evolution','can_write_organization_clinical','create_organization_evolution','get_organization_evolution_access','is_organization_patient') and n.nspname in ('private','public')`);
  assert.equal(acl.length,7);
  for(const row of acl) { assert.equal(row.authenticated,true);assert.equal(row.anon,false);assert.equal(row.service_role,false);assert.equal(row.public_execute,false); }
  results.acl="PASS";
  for(const name of ["ownerA","managerA","primaryA","secondaryA","consultantA","unassignedA","ownerB"]) await fixture(name);
  await management("update private.clinic_runtime_config set enabled=true,updated_at=clock_timestamp() where id=true");
  const orgA=await organization("ownerA");const orgB=await organization("ownerB");
  await management(`insert into public.organization_memberships(organization_id,professional_id,membership_role,status,clinical_access_enabled,created_by) values('${orgA}','${fixtures.managerA.id}','manager','active',false,'${fixtures.ownerA.id}'),('${orgA}','${fixtures.primaryA.id}','professional','active',true,'${fixtures.ownerA.id}'),('${orgA}','${fixtures.secondaryA.id}','professional','active',true,'${fixtures.ownerA.id}'),('${orgA}','${fixtures.consultantA.id}','professional','active',true,'${fixtures.ownerA.id}'),('${orgA}','${fixtures.unassignedA.id}','professional','active',true,'${fixtures.ownerA.id}'); update public.organization_memberships set clinical_access_enabled=true where organization_id='${orgB}' and professional_id='${fixtures.ownerB.id}'; update public.professionals set full_name='Autor sintético F4',professional_register='SYNTHETIC-F4' where id='${fixtures.primaryA.id}';`);
  const patientA=checked(await rpc("ownerA","create_organization_patient",{p_organization_id:orgA,p_full_name:"Paciente sintético F4",p_primary_professional_id:fixtures.primaryA.id,p_secondary_professional_ids:[fixtures.secondaryA.id],p_consultant_professional_ids:[fixtures.consultantA.id]}),"patient_a");
  const patientB=checked(await rpc("ownerB","create_organization_patient",{p_organization_id:orgB,p_full_name:"Paciente sintético F4 B",p_primary_professional_id:fixtures.ownerB.id}),"patient_b");
  patientIds.push(patientA.patient_id,patientB.patient_id);opIds.push(patientA.organization_patient_id,patientB.organization_patient_id);
  const opA=patientA.organization_patient_id; const opB=patientB.organization_patient_id;
  const path=`/api/clinic/patients/${opA}/evolutions`;
  const app=express();app.use(express.json());
  const requireAuth=async (req:any,res:any,next:any) => {const token=String(req.headers.authorization || "").replace(/^Bearer\s+/i,"");const result=await authClient.auth.getUser(token);if(result.error || !result.data.user) return res.status(401).json({error:"authentication_required"});req.user=result.data.user;next();};
  registerClinicEvolutionRoutes(app,{requireAuth,supabaseUrl:url,supabaseAnonKey:anonKey,clinicFeatureEnabled:true});
  const guard=createPersonalPatientGuard({supabaseUrl:url,supabaseAnonKey:anonKey});
  for(const endpoint of ["semantic-index","semantic-search","ai-report","send-report-email"]) app.post(`/api/patients/:id/${endpoint}`,requireAuth,guard,(_req:any,res:any) => {externalCalls++;res.json({unexpected:true});});
  listener=app.listen(0,"127.0.0.1");await new Promise<void>(resolve => listener!.once("listening",resolve));port=(listener.address() as {port:number}).port;
  const input={sessionDate:"2026-09-17",sessionTime:"14:30"};
  const concurrent=await Promise.all([api("primaryA",path,"POST",input),api("secondaryA",path,"POST",input)]);
  for(const result of concurrent) assert.equal(result.status,201);
  const consultant=await api("consultantA",path,"POST",input);assert.equal(consultant.status,201);
  const authored=[concurrent[0].body.evolution,concurrent[1].body.evolution,consultant.body.evolution];
  evolutionIds.push(...authored.map(row => row.id));assert.equal(new Set(evolutionIds).size,3);
  for(const [i,actor] of ["primaryA","secondaryA","consultantA"].entries()) {
    const row=authored[i];assert.equal(row.patient_id,patientA.patient_id);assert.equal(row.organization_id,orgA);assert.equal(row.organization_patient_id,opA);assert.equal(row.professional_id,fixtures[actor].id);assert.equal(row.status,"draft");
    assert.equal(row.google_doc_append_status,"not_applicable");
    const update=await api(actor,`${path}/${row.id}`,"PATCH",{transcriptionText:`Conteúdo exclusivamente sintético F4 ${actor}`,originalTranscriptionText:`Fonte sintética ${actor}`,transcriptionStatus:"completed",status:"completed"});assert.equal(update.status,200);
    const list=await api(actor,path);assert.equal(list.status,200);assert.deepEqual(list.body.evolutions.map((e:any) => e.id),[row.id]);
    for(const other of authored.filter(other => other.id !== row.id)) {
      assert.equal((await api(actor,`${path}/${other.id}`)).status,404);
      assert.equal((await api(actor,`${path}/${other.id}`,"PATCH",{transcriptionText:"forged"})).status,404);
      assert.equal((await api(actor,`${path}/${other.id}`,"PATCH",{status:"signed"})).status,404);
      assert.equal((await api(actor,`${path}/${other.id}`,"DELETE")).status,404);
      denied(await fixtures[actor].client.from("evolutions").select("*").eq("id",other.id));
    }
  }
  results.primaryEvolution="PASS";results.secondaryEvolution="PASS";results.consultantEvolution="PASS";results.concurrentCreation="PASS";results.crossAuthorIsolation="PASS";
  for(const actor of ["ownerA","managerA","unassignedA","ownerB"]) {
    assert.equal((await api(actor,path,"POST",input)).status,403);assert.equal((await api(actor,path)).status,403);
    denied(await fixtures[actor].client.from("evolutions").select("*").eq("organization_patient_id",opA));
  }
  // Even an assignment does not turn an administrative membership into clinical access.
  await management(`insert into public.patient_professional_assignments(organization_patient_id,professional_id,assignment_role,assigned_by) values('${opA}','${fixtures.managerA.id}','consultant','${fixtures.ownerA.id}')`);
  assert.equal((await api("managerA",path,"POST",input)).status,403);assert.equal((await api("managerA",path)).status,403);
  assert.equal((await api("primaryA",`/api/clinic/patients/${opB}/evolutions`,"POST",input)).status,403);
  results.managerClinicalContentDeny="PASS";results.unassignedDeny="PASS";results.crossTenant="PASS";
  for(const key of ["organizationId","professionalId","patientId","organization_id","professional_id","patient_id"]) assert.equal((await api("primaryA",path,"POST",{...input,[key]:orgB})).status,400);
  const direct=await fixtures.primaryA.client.from("evolutions").insert({session_date:"2026-09-17",professional_id:fixtures.primaryA.id,patient_id:patientA.patient_id,organization_id:orgA,organization_patient_id:opA});assert.equal(direct.error?.code,"42501");
  const personalForClinic=await fixtures.ownerA.client.from("evolutions").insert({session_date:"2026-09-17",professional_id:fixtures.ownerA.id,patient_id:patientA.patient_id});assert.equal(personalForClinic.error?.code,"42501");
  const primary=authored[0];
  for(const patch of [{organization_id:orgB},{organization_patient_id:opB},{patient_id:patientB.patient_id},{professional_id:fixtures.secondaryA.id},{organization_id:null,organization_patient_id:null}]) assert.ok((await fixtures.primaryA.client.from("evolutions").update(patch).eq("id",primary.id).select("id")).error);
  const mismatched=await admin.from("evolutions").insert({session_date:"2026-09-17",professional_id:fixtures.primaryA.id,patient_id:patientA.patient_id,organization_id:orgB,organization_patient_id:opA,status:"draft",transcription_status:"processing"});assert.equal(mismatched.error?.code,"23503");
  const wrongPatient=await admin.from("evolutions").insert({session_date:"2026-09-17",professional_id:fixtures.primaryA.id,patient_id:patientB.patient_id,organization_id:orgA,organization_patient_id:opA,status:"draft",transcription_status:"processing"});assert.equal(wrongPatient.error?.code,"23503");
  const partial=await admin.from("evolutions").insert({session_date:"2026-09-17",professional_id:fixtures.primaryA.id,patient_id:patientA.patient_id,organization_id:orgA,status:"draft",transcription_status:"processing"});assert.equal(partial.error?.code,"23514");
  results.organizationContext="PASS";results.contextIntegrity="PASS";results.authorImmutability="PASS";
  const personal=checked(await fixtures.primaryA.client.from("patients").insert({professional_id:fixtures.primaryA.id,full_name:"Paciente pessoal sintético F4"}).select("id").single(),"personal_patient");patientIds.push(personal.id);
  const ep=checked(await fixtures.primaryA.client.from("evolutions").insert({professional_id:fixtures.primaryA.id,patient_id:personal.id,session_date:"2026-09-17",transcription_text:"Evolução pessoal sintética F4",transcription_status:"completed"}).select("*").single(),"personal_evolution");evolutionIds.push(ep.id);assert.equal(ep.organization_id,null);assert.equal(ep.organization_patient_id,null);
  checked(await fixtures.primaryA.client.from("evolutions").update({transcription_text:"Evolução pessoal sintética F4 revisada"}).eq("id",ep.id).select("id").single(),"personal_edit");
  assert.ok((await fixtures.primaryA.client.from("evolutions").update({organization_id:orgA,organization_patient_id:opA,patient_id:patientA.patient_id}).eq("id",ep.id)).error);
  const history=checked(await fixtures.primaryA.client.from("evolutions").select("id").eq("professional_id",fixtures.primaryA.id).is("organization_id",null),"personal_history");assert.deepEqual(history.map((row:any) => row.id),[ep.id]);
  denied(await fixtures.ownerA.client.from("patients").select("id").eq("id",patientA.patient_id));
  const directory=checked(await rpc("ownerA","list_organization_patients",{p_organization_id:orgA}),"clinic_directory");assert.ok(directory.every((row:any) => row.patient_id !== personal.id));
  results.personalEvolutionRegression="PASS";results.personalHistoryIsolation="PASS";
  const report={professional_id:fixtures.primaryA.id,patient_id:personal.id,type:"report",period_label:"sintético",content:"Relatório pessoal sintético F4"};
  checked(await fixtures.primaryA.client.from("patient_reports").insert(report).select("id").single(),"personal_report");
  assert.equal((await fixtures.ownerA.client.from("patient_reports").insert({...report,professional_id:fixtures.ownerA.id,patient_id:patientA.patient_id})).error?.code,"42501");
  assert.equal((await fixtures.primaryA.client.from("patient_reports").insert({...report,patient_id:patientA.patient_id})).error?.code,"42501");
  for(const endpoint of ["semantic-index","semantic-search","ai-report","send-report-email"]) assert.equal((await api("ownerA",`/api/patients/${patientA.patient_id}/${endpoint}`,"POST",{query:"synthetic"})).status,404);
  assert.equal(externalCalls,0);
  const backup=JSON.parse(await buildPersonalBackupJson(fixtures.primaryA.client,fixtures.primaryA.id));
  assert.deepEqual(backup.patients.map((row:any) => row.id),[personal.id]);assert.deepEqual(backup.evolutions.map((row:any) => row.id),[ep.id]);assert.equal(backup.reports.length,1);
  assert.ok(backup.evolutions.every((row:any) => row.organization_id === null));
  results.patientReportsHardening="PASS";results.semanticPersonalHardening="PASS";results.backupPersonalIsolation="PASS";
  // Restricted preserves author reads, blocks creation, edit and signing, including direct Data API.
  await management(`update public.organizations set operational_status='restricted' where id='${orgA}'`);
  assert.equal((await api("primaryA",path)).status,200);assert.equal((await api("primaryA",path,"POST",input)).status,403);
  assert.equal((await api("primaryA",`${path}/${primary.id}`,"PATCH",{transcriptionText:"blocked"})).status,404);
  assert.equal((await api("primaryA",`${path}/${primary.id}`,"PATCH",{status:"signed"})).status,404);
  denied(await fixtures.primaryA.client.from("evolutions").update({transcription_text:"blocked"}).eq("id",primary.id).select("id"));
  await management(`update public.organizations set operational_status='active' where id='${orgA}'`);results.restrictedReadWrite="PASS";
  checked(await rpc('ownerA','suspend_organization_member',{p_organization_id:orgA,p_target_professional_id:fixtures.primaryA.id,p_reason:'F4 synthetic membership revocation'}),'suspend_fixture');
  assert.equal((await api("primaryA",path)).status,403);assert.equal((await api("primaryA",path,"POST",input)).status,403);
  checked(await rpc('ownerA','reactivate_organization_member',{p_organization_id:orgA,p_target_professional_id:fixtures.primaryA.id,p_reason:'F4 synthetic membership restoration'}),'reactivate_fixture');
  await management(`update public.organization_memberships set clinical_access_enabled=false where organization_id='${orgA}' and professional_id='${fixtures.primaryA.id}'`);
  assert.equal((await api("primaryA",path)).status,403);
  await management(`update public.organization_memberships set clinical_access_enabled=true where organization_id='${orgA}' and professional_id='${fixtures.primaryA.id}'; update public.patient_professional_assignments set status='revoked',revoked_at=clock_timestamp() where organization_patient_id='${opA}' and professional_id='${fixtures.secondaryA.id}'`);
  assert.equal((await api("secondaryA",path)).status,403);
  await management(`update public.patient_professional_assignments set status='active',revoked_at=null where organization_patient_id='${opA}' and professional_id='${fixtures.secondaryA.id}'; update public.organization_patients set status='archived' where id='${opA}'`);
  assert.equal((await api("primaryA",path)).status,200);assert.equal((await api("primaryA",path,"POST",input)).status,403);
  await management(`update public.organization_patients set status='active' where id='${opA}'`);results.revocation="PASS";
  const unsignedSignature=await fixtures.primaryA.client.from("evolutions").update({signature_hash:"forged"}).eq("id",primary.id);assert.equal(unsignedSignature.error?.code,"23514");
  const signed=await api("primaryA",`${path}/${primary.id}`,"PATCH",{status:"signed"});assert.equal(signed.status,200);
  assert.equal(signed.body.evolution.signed_by_name,"Autor sintético F4");assert.equal(signed.body.evolution.signed_by_register,"SYNTHETIC-F4");assert.match(signed.body.evolution.signature_hash,/^[0-9a-f]{64}$/);
  const hash=(await management(`select signature_hash=encode(extensions.digest(id::text||'|'||coalesce(transcription_text,'')||'|'||signature_date::text||'|'||signature_ip||'|'||signed_by_name||'|'||signed_by_register,'sha256'),'hex') valid from public.evolutions where id='${primary.id}'`))[0];assert.equal(hash.valid,true);
  assert.equal((await api("primaryA",`${path}/${primary.id}`,"PATCH",{transcriptionText:"after sign"})).status,400);
  denied(await fixtures.primaryA.client.from("evolutions").delete().eq("id",primary.id).select("id"));
  assert.equal((await api("primaryA",`${path}/${primary.id}`,"DELETE")).status,404);
  const docRows=checked(await admin.from("patients").select("id,google_doc_id").in("id",[patientA.patient_id,patientB.patient_id]),"clinic_docs");assert.ok(docRows.every((row:any) => row.google_doc_id === null));
  results.signatureHash="PASS";results.googleDocsClinic="DISABLED";results.externalIntegrationsCalled=0;
  // Author deletion of unsigned records remains compatible; another author cannot delete them.
  const deleted=await api("consultantA",`${path}/${authored[2].id}`,"DELETE");assert.equal(deleted.status,200);
  smokePassed=true;results.smoke="PASS";
  console.log(JSON.stringify(results));
} finally {
  if(listener) await new Promise<void>((resolve,reject) => listener!.close(error => error ? reject(error) : resolve()));
  const orgs=quoteIds(organizationIds); const users=quoteIds(userIds);const patients=quoteIds(patientIds);const ops=quoteIds(opIds);
  // Gate shutdown is independent of cleanup success.
  await management("update private.clinic_runtime_config set enabled=false,updated_at=clock_timestamp() where id=true");
  // Management-only transaction removes only this run's synthetic signed rows.
  // replica applies only to the bounded DELETE, then normal FK/constraint triggers are restored.
  await management(`begin; set local session_replication_role='replica'; delete from public.evolutions where professional_id in (${users}); set local session_replication_role='origin'; delete from public.patient_reports where professional_id in (${users}); delete from public.patient_professional_assignments where organization_patient_id in (select id from public.organization_patients where organization_id in (${orgs})); delete from public.organization_patients where organization_id in (${orgs}); select private.purge_organization_admin_events_for_staging_cleanup(id) from public.organizations where id in (${orgs}); delete from private.organization_subscriptions where organization_id in (${orgs}); delete from public.organization_feature_flags where organization_id in (${orgs}); delete from public.organization_memberships where organization_id in (${orgs}); delete from public.organizations where id in (${orgs}); delete from public.patients where professional_id in (${users}); commit;`);
  for(const id of userIds) { const removed=await admin.auth.admin.deleteUser(id);assert.ifError(removed.error); }
  const remaining=(await management(`select (select enabled from private.clinic_runtime_config where id=true) gate,(select count(*) from public.evolutions where professional_id in (${users}) or id in (${quoteIds(evolutionIds)})) evolutions,(select count(*) from public.organization_patients where organization_id in (${orgs}) or id in (${ops})) organization_patients,(select count(*) from public.patients where professional_id in (${users}) or id in (${patients})) patients,(select count(*) from public.patient_professional_assignments where professional_id in (${users}) or organization_patient_id in (${ops})) assignments,(select count(*) from public.organizations where id in (${orgs})) organizations,(select count(*) from public.organization_feature_flags where organization_id in (${orgs})) flags,(select count(*) from private.organization_subscriptions where organization_id in (${orgs})) subscriptions,(select count(*) from auth.users where id in (${users})) auth_users`))[0];
  assert.equal(remaining.gate,false);for(const [key,value] of Object.entries(remaining)) if(key !== "gate") assert.equal(Number(value),0,key);
  const after=(await management("select id from public.professionals")).map((row:any) => row.id);assert.deepEqual(after.sort(),baselineProfessionals.sort());
  if (!smokePassed) results.smoke="FAIL";
  results.cleanup="PASS";results.clinicGateFinal="OFF";results.fixtureCounts=remaining;results.controlledProfessionalsPreserved=true;
  console.log(JSON.stringify({cleanup:"PASS",clinicGate:"OFF",fixtureCounts:remaining,controlledProfessionalsPreserved:true}));
  if(process.env.CLINIC_SMOKE_RESULT_FILE) writeFileSync(process.env.CLINIC_SMOKE_RESULT_FILE,JSON.stringify(results,null,2)+"\n");
  if(!smokePassed) console.log(JSON.stringify({smoke:"FAIL",cleanup:"PASS"}));
}
