export type PatientPhotoDiagnosticStage =
  | 'FILE_SELECTED'
  | 'FILE_ARRAY_BUFFER'
  | 'RESPONSE_ARRAY_BUFFER'
  | 'FILE_READER'
  | 'FILE_MATERIALIZED'
  | 'DATA_URL'
  | 'READ_FAILED';

export type PatientPhotoDiagnostic = {
  stage: PatientPhotoDiagnosticStage;
  status: 'PASS' | 'FAIL';
  metadata?: Record<string, unknown>;
  error?: string;
};

export const getPatientPhotoMimeType = (value: Blob & { name?: string }): string => {
  const type = value.type.toLowerCase();
  if (type) return type;
  const name = value.name || '';
  if (/\.jpe?g$/i.test(name)) return 'image/jpeg';
  if (/\.png$/i.test(name)) return 'image/png';
  if (/\.webp$/i.test(name)) return 'image/webp';
  if (/\.(heic|heif)$/i.test(name)) return 'image/heic';
  return 'application/octet-stream';
};

const describeError = (error: unknown) => error instanceof Error ? error.message : String(error);

const report = (diagnostics: ((entry: PatientPhotoDiagnostic) => void) | undefined, entry: PatientPhotoDiagnostic) => {
  diagnostics?.(entry);
};

export const getPatientPhotoMetadata = (file: File): Record<string, unknown> => ({
  name: file.name,
  type: file.type,
  size: file.size,
  lastModified: file.lastModified,
  instanceofFile: file instanceof File,
  instanceofBlob: file instanceof Blob,
  constructor: file.constructor.name,
});

export const readPatientPhotoArrayBuffer = async (
  value: Blob,
  diagnostics?: (entry: PatientPhotoDiagnostic) => void,
): Promise<ArrayBuffer> => {
  if (typeof value.arrayBuffer === 'function') {
    try {
      const result = await value.arrayBuffer();
      report(diagnostics, { stage: 'FILE_ARRAY_BUFFER', status: 'PASS', metadata: { size: result.byteLength, type: value.type } });
      return result;
    } catch (error) {
      report(diagnostics, { stage: 'FILE_ARRAY_BUFFER', status: 'FAIL', error: describeError(error) });
    }
  }

  try {
    const result = await new Response(value).arrayBuffer();
    report(diagnostics, { stage: 'RESPONSE_ARRAY_BUFFER', status: 'PASS', metadata: { size: result.byteLength, type: value.type } });
    return result;
  } catch (error) {
    report(diagnostics, { stage: 'RESPONSE_ARRAY_BUFFER', status: 'FAIL', error: describeError(error) });
  }

  if (typeof FileReader !== 'function') {
    const error = new Error('FileReader indisponível');
    report(diagnostics, { stage: 'FILE_READER', status: 'FAIL', error: error.message });
    throw error;
  }

  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        report(diagnostics, { stage: 'FILE_READER', status: 'PASS', metadata: { size: reader.result.byteLength, type: value.type } });
        resolve(reader.result);
      } else {
        const error = new Error('O navegador não retornou os bytes da foto.');
        report(diagnostics, { stage: 'FILE_READER', status: 'FAIL', error: error.message });
        reject(error);
      }
    };
    reader.onerror = () => {
      const error = reader.error || new Error('Falha ao ler os bytes da foto.');
      report(diagnostics, { stage: 'FILE_READER', status: 'FAIL', error: describeError(error) });
      reject(error);
    };
    reader.onabort = () => {
      const error = new Error('A leitura da foto foi interrompida.');
      report(diagnostics, { stage: 'FILE_READER', status: 'FAIL', error: error.message });
      reject(error);
    };
    reader.readAsArrayBuffer(value);
  });
};

export const materializePatientPhoto = async (
  file: File,
  diagnostics?: (entry: PatientPhotoDiagnostic) => void,
): Promise<File> => {
  report(diagnostics, { stage: 'FILE_SELECTED', status: 'PASS', metadata: getPatientPhotoMetadata(file) });
  try {
    const bytes = await readPatientPhotoArrayBuffer(file, diagnostics);
    if (bytes.byteLength === 0) throw new Error('A imagem selecionada está vazia.');
    const materialized = new File([bytes], file.name, {
      type: getPatientPhotoMimeType(file),
      lastModified: file.lastModified,
    });
    report(diagnostics, { stage: 'FILE_MATERIALIZED', status: 'PASS', metadata: { size: materialized.size, type: materialized.type, constructor: materialized.constructor.name } });
    return materialized;
  } catch (error) {
    report(diagnostics, { stage: 'READ_FAILED', status: 'FAIL', error: describeError(error) });
    throw error;
  }
};

export const patientPhotoBytesToDataUrl = async (
  value: Blob,
  diagnostics?: (entry: PatientPhotoDiagnostic) => void,
): Promise<string> => {
  const bytes = new Uint8Array(await readPatientPhotoArrayBuffer(value, diagnostics));
  if (bytes.byteLength === 0) throw new Error('A imagem selecionada está vazia.');
  let binary = '';
  for (let offset = 0; offset < bytes.byteLength; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  if (typeof window.btoa !== 'function') throw new Error('Base64 indisponível neste navegador.');
  const result = `data:${getPatientPhotoMimeType(value as Blob & { name?: string })};base64,${window.btoa(binary)}`;
  report(diagnostics, { stage: 'DATA_URL', status: 'PASS', metadata: { size: bytes.byteLength, type: value.type } });
  return result;
};
