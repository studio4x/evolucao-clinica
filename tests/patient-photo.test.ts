import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const formSource = readFileSync('src/pages/PatientForm.tsx', 'utf8');
const cropEditorSource = readFileSync('src/components/common/ImageCropEditor.tsx', 'utf8');
const customLogoSource = readFileSync('src/pages/CustomLogo.tsx', 'utf8');
const patientPhotoSource = readFileSync('src/components/patients/PatientPhoto.tsx', 'utf8');
const patientPhotoServiceSource = readFileSync('src/services/patientPhoto.ts', 'utf8');
const patientsSource = readFileSync('src/pages/Patients.tsx', 'utf8');
const detailSource = readFileSync('src/pages/PatientDetail.tsx', 'utf8');
const serverSource = readFileSync('server.ts', 'utf8');
const migrationSource = readFileSync('supabase/migrations/20260920131514_add_private_patient_photos.sql', 'utf8');

assert.match(migrationSource, /add column if not exists photo_path text/i);
assert.match(migrationSource, /'patient-photos',[\s\S]*?false,[\s\S]*?2097152/);
assert.match(migrationSource, /patient_photos_select_own[\s\S]*?to authenticated[\s\S]*?auth\.uid\(\)/);
assert.match(migrationSource, /patient_photos_insert_own[\s\S]*?to authenticated[\s\S]*?auth\.uid\(\)/);
assert.match(migrationSource, /patient_photos_delete_own[\s\S]*?to authenticated[\s\S]*?auth\.uid\(\)/);

assert.match(cropEditorSource, /createCroppedImageBlob/);
assert.ok(
  cropEditorSource.includes("if (/^https?:\\/\\//i.test(imageUrl))"),
  'editor deve aplicar CORS somente a imagens HTTP(S)'
);
assert.match(cropEditorSource, /Arraste para mover/);
assert.match(cropEditorSource, /Aproximação/);
assert.match(cropEditorSource, /transformOrigin: 'center center'/, 'O zoom do recorte deve permanecer centralizado na pré-visualização.');
assert.match(cropEditorSource, /const DEFAULT_CROP_ZOOM = 1\.15/, 'O editor deve manter margem para deslocamento horizontal mesmo em fotos quadradas.');
assert.match(cropEditorSource, /min="1\.05"/, 'O zoom mínimo deve preservar espaço para movimentar o recorte.');
assert.match(customLogoSource, /<ImageCropEditor/);
assert.match(formSource, /<ImageCropEditor/);
assert.match(formSource, /initialAspect=\{1\}/);
assert.match(formSource, /readPatientPhotoAsDataUrl[\s\S]*?value\.arrayBuffer\(\)[\s\S]*?window\.btoa\(binary\)/);
assert.doesNotMatch(formSource, /new FileReader\(\)/);
assert.match(formSource, /handlePhotoSelection[\s\S]*?const input = event\.currentTarget[\s\S]*?readPatientPhotoAsDataUrl\(file\)[\s\S]*?createCroppedImageBlob\(\{[\s\S]*?imageUrl: sourceUrl[\s\S]*?readPatientPhotoAsDataUrl\(initialCrop\)[\s\S]*?setPendingPhotoBlob\(initialCrop\)[\s\S]*?setPhotoPreviewUrl\(previewUrl\)[\s\S]*?finally[\s\S]*?input\.value = ''/);
assert.doesNotMatch(formSource, /URL\.createObjectURL\(value\)/);
assert.match(formSource, /A prévia é criada automaticamente/);
assert.match(formSource, /uploadPatientPhoto\(/);
assert.match(formSource, /photo_path: nextPhotoPath \|\| null/);

assert.match(patientPhotoServiceSource, /createSignedUrl\(photoPath, 60 \* 60\)/);
assert.match(patientPhotoServiceSource, /upsert: false/);
assert.doesNotMatch(patientPhotoServiceSource, /getPublicUrl/);
assert.match(patientPhotoSource, /createPatientPhotoSignedUrl\(photoPath\)/);
assert.match(patientsSource, /<PatientPhoto photoPath=\{patient\.photo_path\}/);
assert.match(patientsSource, /shape="rounded" className="h-20 w-20"/, 'A lista deve usar foto quadrada maior com cantos suaves.');
assert.match(patientsSource, /PATIENTS_GUIDE_STEPS/);
assert.match(patientsSource, /PATIENTS_SUPPORT_HREF/);
assert.match(patientsSource, /Como funciona a lista de pacientes/);
assert.match(detailSource, /<PatientPhoto photoPath=\{patient\.photo_path\}/);
assert.match(patientPhotoSource, /object-cover object-center/, 'A foto exibida deve usar o centro do recorte aplicado.');
assert.match(patientPhotoSource, /shape === 'rounded' \? 'rounded-xl' : 'rounded-full'/, 'O formato quadrado deve ser opcional para preservar outros contextos.');
assert.match(detailSource, /className="h-16 w-16 shrink-0 sm:h-20 sm:w-20 xl:h-16 xl:w-16"/, 'A foto do cabeçalho deve crescer sem perder o limite responsivo.');
assert.match(serverSource, /\.from\("patient-photos"\)[\s\S]*?\.remove\(photoPaths\)/);

console.log('Patient private photo tests passed.');
