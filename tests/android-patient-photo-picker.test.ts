import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const launcher = readFileSync('app/src/main/java/com/evolucaoclinica/app/LauncherActivity.java', 'utf8');
const paths = readFileSync('app/src/main/res/xml/filepaths.xml', 'utf8');

assert.match(launcher, /acceptsImageFiles\(params\.getAcceptTypes\(\)\)/, 'o seletor nativo deve identificar inputs de imagem');
assert.match(launcher, /getContentResolver\(\)\.openInputStream\(sourceUri\)/, 'a URI selecionada deve ser lida imediatamente pelo ContentResolver');
assert.match(launcher, /patientPhotoCacheDirectory\(\)/, 'a cópia deve usar cache privado do aplicativo');
assert.match(launcher, /FileProvider\.getUriForFile/, 'o WebView deve receber uma URI controlada pelo app');
assert.match(launcher, /MAX_PATIENT_PHOTO_BYTES/, 'a cópia nativa deve possuir limite de tamanho');
assert.match(launcher, /patient_photo_native_picker/, 'o diagnóstico nativo deve ser registrado sem conteúdo clínico');
const pickerLog = launcher.match(/Log\.i\(LOG_TAG, "PatientPhotoPicker[^;]+/)?.[0] || '';
assert.ok(pickerLog && !/(sourceUri|fileName|displayName|lastPathSegment)/.test(pickerLog), 'logs do seletor não podem expor URI ou nome do arquivo');
assert.match(paths, /<cache-path path="patient-photo\/" name="patient_photo" \/>/, 'FileProvider deve expor somente o subdiretório temporário da foto');

console.log('Android patient photo picker test passed');
