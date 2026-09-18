import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PATIENT_FILE_TYPES,
  getPatientFileTypeLabel,
} from '../src/utils/patientFileTypes.js';

const patientDetailSource = readFileSync('src/pages/PatientDetail.tsx', 'utf8');
const patientFilesSource = readFileSync('src/components/patients/PatientFilesCard.tsx', 'utf8');
const googleDocsSource = readFileSync('src/services/googleDocs.ts', 'utf8');
const migrationSource = readFileSync('supabase/migrations/20260918180600_create_patient_files.sql', 'utf8');

assert.equal(getPatientFileTypeLabel('anamnesis'), 'Anamnese');
assert.equal(PATIENT_FILE_TYPES.at(-1)?.key, 'other');
assert.equal(PATIENT_FILE_TYPES.at(-1)?.label, 'Outro');

assert.match(patientDetailSource, /type PatientMobileTab = 'overview' \| 'history' \| 'files'/);
assert.match(patientDetailSource, /\{ id: 'files', label: 'Arquivos'/);
assert.match(patientDetailSource, /grid-cols-5/);
assert.match(patientDetailSource, /mobileTabVisibility\('files'\)/);
assert.match(patientDetailSource, /<PatientFilesCard/);
assert.match(patientDetailSource, /Abrir pasta no Google Drive/);
assert.match(patientDetailSource, /drive\.google\.com\/drive\/folders/);
assert.match(patientDetailSource, /patient\.target_folder_id &&/);

assert.match(patientFilesSource, /MAX_FILE_SIZE_BYTES = 25 \* 1024 \* 1024/);
assert.match(patientFilesSource, /type="file"[\s\S]*multiple/);
assert.match(patientFilesSource, /onDrop=/);
assert.match(patientFilesSource, /Selecionar tipo do arquivo/);
assert.match(patientFilesSource, /fileTypeKey === 'other'/);
assert.match(patientFilesSource, /Nome do tipo\. Ex\.: Relatório escolar/);
assert.match(patientFilesSource, /uploadFileToGoogleDrive/);
assert.match(patientFilesSource, /createPatientFile/);
assert.match(patientFilesSource, /deleteGoogleFile/);
assert.match(patientFilesSource, /googleDriveWebViewLink/);
assert.match(patientFilesSource, /Vincular pasta/);
assert.match(patientFilesSource, /card !overflow-visible/);
assert.match(patientFilesSource, /open \? 'z-\\\[70\\\]' : 'z-0'/);
assert.match(patientFilesSource, /absolute z-\\\[80\\\]/);

assert.match(googleDocsSource, /export async function uploadFileToGoogleDrive/);
assert.match(googleDocsSource, /uploadType=multipart&fields=id,name,mimeType,size,webViewLink/);

assert.match(migrationSource, /create table if not exists public\.patient_files/);
assert.match(migrationSource, /patient_id uuid not null references public\.patients\(id\) on delete cascade/);
assert.match(migrationSource, /alter table public\.patient_files enable row level security/);
assert.match(migrationSource, /p\.professional_id = \(select auth\.uid\(\)\)/);
assert.match(migrationSource, /'anamnesis'/);
assert.match(migrationSource, /'other'/);

console.log('Patient files tests passed.');
