import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("src/pages/ClinicTeam.tsx", "utf8");
const modal = readFileSync("src/components/clinic/ClinicalAccessModal.tsx", "utf8");
const version = readFileSync("src/components/layout/AppVersion.tsx", "utf8");

assert.match(page, /ClinicalAccessModal/);
assert.match(page, /if \(enabled\) \{ setClinicalAccessMember\(member\); return; \}/);
assert.match(page, /setClinicMemberClinicalAccess/);
const activationGate = page.indexOf("if (enabled) { setClinicalAccessMember(member); return; }");
const runAction = page.slice(page.indexOf("const runClinicalAccessChange"), page.indexOf("const visibleMembers"));
assert.ok(activationGate >= 0);
assert.doesNotMatch(runAction, /setClinicMemberClinicalAccess/);
assert.match(page, /Desabilitar o acesso clínico de/);
assert.match(page, /registros já produzidos permanecerão preservados/);
assert.match(page, /role === "owner" \? "Proprietário"/);
assert.match(page, /role === "manager" \? "Gestor"/);
assert.match(page, /: "Profissional"/);
assert.match(page, /Transferir propriedade/);
assert.match(page, /Novo proprietário:/);
assert.match(page, /Você continuará como gestor/);
assert.doesNotMatch(page, /disabled=\{busy \|\| \(!member\.clinical_access_enabled && availableSeats < 1\)\}/);

assert.match(modal, /role="dialog"/);
assert.match(modal, /aria-modal="true"/);
assert.match(modal, /aria-labelledby="clinical-access-modal-title"/);
assert.match(modal, /aria-describedby="clinical-access-modal-description"/);
assert.match(modal, /event\.key === "Escape"/);
assert.match(modal, /previouslyFocused\?\.focus\(\)/);
assert.match(modal, /Com acesso clínico/);
assert.match(modal, /Sem acesso clínico/);
assert.match(modal, /Utiliza 1 licença clínica/);
assert.match(modal, /não libera todos os pacientes/);
assert.match(modal, /Para administradores da clínica/);
assert.match(modal, /consultar os registros dos pacientes mesmo sem acesso clínico/);
assert.match(modal, /somente nos pacientes aos quais estiver atribuído/);
assert.match(modal, /Licenças disponíveis/);
assert.match(modal, /Após ativação/);
assert.match(modal, /safeAvailableSeats < 1/);
assert.match(modal, /Não há licenças disponíveis no momento/);
assert.match(modal, /disabled=\{busy \|\| safeAvailableSeats < 1\}/);
assert.match(modal, /onConfirm/);
assert.doesNotMatch(modal, /showConfirm|setClinicMemberClinicalAccess/);

assert.match(version, /APP_VERSION = "v1\.10\.918"/);
assert.match(version, /PLAY_STORE_VERSION = "1\.0\.87"/);

console.log("clinic clinical access explanation modal: PASS");
