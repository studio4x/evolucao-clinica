// Read-only final proof: exact synthetic IDs and the authorized staging alias only.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {loadRuntime,sql,quoteIds,stripe,edgeSecrets} from './clinic-preproduction-runtime.js';
import {assertPilotGateMatrix} from './clinic-pilot-gates.js';
const runtime=loadRuntime();
assert.ok(process.env.F6B_RESULT_FILE && process.env.F6B_SHUTDOWN_FILE);
const result=JSON.parse(readFileSync(process.env.F6B_RESULT_FILE!,'utf8'));
const journal=JSON.parse(readFileSync(`${process.env.F6B_RESULT_FILE}.journal`,'utf8'));
const shutdown=JSON.parse(readFileSync(process.env.F6B_SHUTDOWN_FILE!,'utf8'));
assert.equal(result.interactive,'PASS'); assertPilotGateMatrix(result.pilotGateMatrix.probes);
assert.equal(shutdown.projectId,runtime.projectId);
assert.equal(Object.keys(shutdown.acceptedGateWrites).length,6);
assert.ok(Object.values(shutdown.acceptedGateWrites).every(value=>value==='false'));
async function vercel(path:string) { const response=await fetch(`https://api.vercel.com${path}?teamId=${runtime.teamId}`,{headers:{Authorization:`Bearer ${runtime.vercelToken}`}});assert.ok(response.ok,`final_vercel_${response.status}`);return response.json(); }
const alias=await vercel('/v4/aliases/staging.evolucaoclinica.app.br');
const deployment=await vercel(`/v13/deployments/${alias.deployment?.id||alias.deploymentId}`);
assert.equal(deployment.projectId,runtime.projectId);assert.equal(deployment.readyState,'READY');
assert.equal(deployment.meta.githubCommitRef,'feat/clinicas');assert.equal(deployment.meta.githubCommitSha,shutdown.sha);
const flags: Record<string,string> = {};
for (const key of Object.keys(shutdown.acceptedGateWrites)) {
  const variable=runtime.envIds.find((row:any)=>row.key===key && row.target.includes('production'));assert.ok(variable);
  const readback=await vercel(`/v1/projects/${runtime.projectId}/env/${variable.id}`);
  flags[key]=readback.value??(readback.type==='sensitive'?'SENSITIVE_UNREADABLE':'UNSET');
  if(key.startsWith('VITE_'))assert.equal(flags[key],'false');else assert.ok(flags[key]==='false'||flags[key]==='SENSITIVE_UNREADABLE');
}
const tables=['public.organizations','public.organization_memberships','public.organization_feature_flags','public.organization_invitations','public.organization_patients','public.patient_professional_assignments','private.organization_admin_events','private.organization_subscriptions','private.organization_checkout_attempts','private.clinic_billing_operations','private.clinic_stripe_events','private.clinic_stripe_transactions','private.organization_invitation_handoffs','private.organization_invitation_deliveries'];
const existing=await sql(runtime,`select table_schema||'.'||table_name relation,column_name from information_schema.columns where table_schema in ('public','private') and column_name='organization_id'`);
const queries=tables.map(relation=>existing.some(row=>row.relation===relation)?`select '${relation}' relation,count(*) remaining from ${relation} where organization_id in (${quoteIds(journal.orgs)})`:relation==='public.organizations'?`select '${relation}' relation,count(*) remaining from ${relation} where id in (${quoteIds(journal.orgs)})`:`select '${relation}' relation,count(*) remaining from ${relation}`);
const counts=await sql(runtime,queries.join(' union all '));assert.ok(counts.every(row=>Number(row.remaining)===0));
const baseline=(await sql(runtime,`select (select enabled from private.clinic_runtime_config where id=true) gate,(select count(*) from public.organizations) organizations,(select count(*) from public.professionals) professionals,(select count(*) from auth.users) auth_users,(select count(*) from auth.users where id in (${quoteIds(journal.users)})) fixture_users,(select count(*) from public.evolutions where organization_id in (${quoteIds(journal.orgs)})) fixture_evolutions`))[0];
assert.equal(baseline.gate,false);assert.equal(Number(baseline.organizations),0);assert.equal(Number(baseline.professionals),3);assert.equal(Number(baseline.auth_users),3);assert.equal(Number(baseline.fixture_users),0);assert.equal(Number(baseline.fixture_evolutions),0);
const secrets=await edgeSecrets(runtime);const billing=secrets.find((row:any)=>row.name==='CLINIC_BILLING_ENABLED');assert.equal(billing?.value,createHash('sha256').update('false').digest('hex'));
for(const id of journal.subscriptionIds) {const resource=await stripe(runtime,`subscriptions/${id}`);assert.equal(resource.livemode,false);assert.equal(resource.status,'canceled');}
for(const id of journal.customerIds) {const resource=await stripe(runtime,`customers/${id}`);assert.equal(resource.deleted,true);}
const response=await fetch(`${runtime.origin}/api/health`,{redirect:'manual',headers:runtime.bypass?{'x-vercel-protection-bypass':runtime.bypass}:{}});assert.equal(response.status,200);const health=await response.json();assert.equal(health.status,'ok');
const report={phase:'6B',staging:runtime.ref,origin:runtime.origin,deployment:{id:deployment.id,state:deployment.readyState,sha:deployment.meta.githubCommitSha,branch:deployment.meta.githubCommitRef},health:{status:response.status,json:true,body:health},flags,acceptedGateWrites:shutdown.acceptedGateWrites,serverSensitiveReadback:'SENSITIVE_UNREADABLE',sqlGate:'OFF',edgeBilling:'OFF',cleanup:{status:'PASS',counts,baseline,preexistingIdsPreserved:result.preexistingIdsPreserved,stripeSubscriptionsCanceled:true,stripeCustomersDeleted:true},delivery:'PENDING_EXPLICIT_RECIPIENT_AUTHORIZATION',legal:'PENDING',production:'BLOCKED / UNTOUCHED',main:'UNTOUCHED'};
writeFileSync('docs/clinic-f6-evidence/final-preflight.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
