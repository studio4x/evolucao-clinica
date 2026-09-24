import assert from 'node:assert/strict';
import { getPatientPhotoMimeType, materializePatientPhoto, readPatientPhotoArrayBuffer } from '../src/services/patientPhotoPipeline';

const jpegBytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
const original = new File([jpegBytes], '100025661.jpg', { type: '', lastModified: 123 });
const diagnostics: Array<{ stage: string; status: string }> = [];
const materialized = await materializePatientPhoto(original, ({ stage, status }) => diagnostics.push({ stage, status }));

assert.equal(materialized.name, '100025661.jpg');
assert.equal(materialized.type, 'image/jpeg');
assert.equal(materialized.size, jpegBytes.byteLength);
assert.deepEqual(Array.from(new Uint8Array(await materialized.arrayBuffer())), Array.from(jpegBytes));
assert.equal(getPatientPhotoMimeType(original), 'image/jpeg');
assert.ok(diagnostics.some((entry) => entry.stage === 'FILE_SELECTED' && entry.status === 'PASS'));
assert.ok(diagnostics.some((entry) => entry.stage === 'FILE_ARRAY_BUFFER' && entry.status === 'PASS'));
assert.ok(diagnostics.some((entry) => entry.stage === 'FILE_MATERIALIZED' && entry.status === 'PASS'));

const fallbackBlob = new Blob([jpegBytes], { type: 'image/jpeg' });
Object.defineProperty(fallbackBlob, 'arrayBuffer', { value: () => Promise.reject(new Error('simulated primary read failure')) });
const fallbackDiagnostics: Array<{ stage: string; status: string }> = [];
assert.equal((await readPatientPhotoArrayBuffer(fallbackBlob, ({ stage, status }) => fallbackDiagnostics.push({ stage, status }))).byteLength, 4);
assert.ok(fallbackDiagnostics.some((entry) => entry.stage === 'FILE_ARRAY_BUFFER' && entry.status === 'FAIL'));
assert.ok(fallbackDiagnostics.some((entry) => entry.stage === 'RESPONSE_ARRAY_BUFFER' && entry.status === 'PASS'));
console.log('Patient photo pipeline tests passed.');
