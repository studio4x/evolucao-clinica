import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read=(file:string) => readFileSync(file,"utf8").replace(/\r\n/g,"\n");
const sql=read("supabase/clinic-migrations/20260917_26_isolated_organization_evolutions.sql");
for (const helper of ["can_read_organization_evolution","can_create_organization_evolution"]) assert.match(sql,new RegExp(`private.${helper}`));
assert.match(sql,/m.clinical_access_enabled IS TRUE/);assert.match(sql,/a.status='active' AND m.status='active'/);
assert.match(sql,/a.can_create_evolution IS TRUE/);assert.match(sql,/organization_entitlement_mode\(p_organization_id\) = 'full'/);
assert.doesNotMatch(sql,/can_expand_organization|user_metadata/);
for (const name of ["evolutions_author_select","evolutions_author_update","evolutions_author_delete"]) {
  const policy=sql.slice(sql.indexOf(`CREATE POLICY ${name}`)).split(";")[0];
  assert.match(policy,/professional_id=\(SELECT auth.uid\(\)\)/);
  assert.doesNotMatch(policy,/owner|manager/);
}
assert.match(sql,/reports_personal_owner[\s\S]*NOT private.is_organization_patient\(patient_id\)/);
assert.match(sql,/extensions.digest\(v_hash_input,'sha256'\)/);
assert.match(sql,/signed evolution is immutable/);
assert.match(sql,/signature fields are server managed/);
const newEvolution=read("src/pages/NewEvolution.tsx");
assert.match(newEvolution,/workflow\?: \{ context: EvolutionContext/);
assert.match(newEvolution,/if \(!isClinic\) await appendToGoogleDoc/);
assert.match(newEvolution,/if \(!isClinic\) await replaceEvolutionInGoogleDoc/);
assert.match(newEvolution,/isClinic \? Boolean\(workflow\?.canWrite\) : hasGoogleSession/);
assert.match(newEvolution,/clinicEvolutionRequest\(organizationPatientId, 'POST'/);
assert.match(newEvolution,/draftMatchesEvolutionContext/);
assert.match(newEvolution,/if \(!isClinic && items.length > 0\) \{\s*trackEvent\('audio_evolution_completed'/);
for (const file of ["History","Dashboard","Patients","PatientDetail","Onboarding"]) {
 const content=read(`src/pages/${file}.tsx`);
 for (const query of content.split(".from('evolutions')").slice(1)) assert.match(query.split(";")[0],/\.is\('organization_id', null\)/,file);
}
assert.match(read("src/services/backupService.ts"),/\.is\('organization_id', null\)/);
assert.match(read("src/services/backupService.ts"),/O backup pessoal não aceita evoluções de clínica/);
assert.match(read("src/components/layout/OfflineQueueMonitor.tsx"),/contextKind !== 'organization'/);
const server=read("server.ts");
for(const endpoint of ["semantic-index","semantic-search","ai-report","send-report-email"]) assert.ok(server.includes(`"/api/patients/:id/${endpoint}", requireAuth, requirePersonalPatient, requireActiveSubscription`));
assert.match(server,/processingClient.from\("evolutions"\)/);
assert.match(read("src/App.tsx"),/clinica\/pacientes\/:organizationPatientId\/evolucoes\/nova/);
assert.match(read("src/components/clinic/ClinicPatientEvolutions.tsx"),/Minhas evoluções/);
assert.match(read("src/pages/ClinicPatientDetail.tsx"),/patient.canReadEvolutions && <ClinicPatientEvolutions/);
console.log("clinic evolutions: PASS");
