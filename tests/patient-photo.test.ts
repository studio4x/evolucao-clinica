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
assert.match(cropEditorSource, /Arraste para mover/);
assert.match(cropEditorSource, /Aproximação/);
assert.match(customLogoSource, /<ImageCropEditor/);
assert.match(formSource, /<ImageCropEditor/);
assert.match(formSource, /initialAspect=\{1\}/);
assert.match(formSource, /handlePhotoSelection[\s\S]*?createCroppedImageBlob\(\{[\s\S]*?imageUrl: sourceUrl[\s\S]*?setPendingPhotoBlob\(initialCrop\)[\s\S]*?setPhotoPreviewUrl\(previewUrl\)/);
assert.match(formSource, /A prévia é criada automaticamente/);
assert.match(formSource, /uploadPatientPhoto\(/);
assert.match(formSource, /photo_path: nextPhotoPath \|\| null/);

assert.match(patientPhotoServiceSource, /createSignedUrl\(photoPath, 60 \* 60\)/);
assert.match(patientPhotoServiceSource, /upsert: false/);
assert.doesNotMatch(patientPhotoServiceSource, /getPublicUrl/);
assert.match(patientPhotoSource, /createPatientPhotoSignedUrl\(photoPath\)/);
assert.match(patientsSource, /<PatientPhoto photoPath=\{patient\.photo_path\}/);
assert.match(detailSource, /<PatientPhoto photoPath=\{patient\.photo_path\}/);
assert.match(serverSource, /\.from\("patient-photos"\)[\s\S]*?\.remove\(photoPaths\)/);

console.log('Patient private photo tests passed.');
