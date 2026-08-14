import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { jsPDF } from 'jspdf';
import { downloadPdfFile } from '../src/utils/prontuarioPdf';

const originalWindow = globalThis.window;
const originalNavigator = globalThis.navigator;
const originalFileReader = globalThis.FileReader;

class FakeFileReader {
  result: string | ArrayBuffer | null = null;
  error: DOMException | null = null;
  onload: ((this: FileReader, ev: ProgressEvent<FileReader>) => unknown) | null = null;
  onerror: ((this: FileReader, ev: ProgressEvent<FileReader>) => unknown) | null = null;

  readAsDataURL() {
    this.result = 'data:application/pdf;base64,QUJD';
    this.onload?.call(this as unknown as FileReader, {} as ProgressEvent<FileReader>);
  }
}

const calls: string[] = [];
const fakeDoc = {
  output: (type: string) => {
    assert.equal(type, 'blob');
    return new Blob(['PDF'], { type: 'application/pdf' });
  }
} as unknown as jsPDF;

try {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { userAgent: 'Mozilla/5.0 (Linux; Android 16; wv)' }
  });
  Object.defineProperty(globalThis, 'FileReader', {
    configurable: true,
    value: FakeFileReader
  });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      NativeFileDownload: {
        beginFile: (name: string, mimeType: string) => {
          calls.push(`begin:${name}:${mimeType}`);
          return true;
        },
        appendFileChunk: (chunk: string) => {
          calls.push(`chunk:${chunk}`);
          return true;
        },
        finishFile: () => {
          calls.push('finish');
          return true;
        }
      }
    }
  });

  assert.equal(await downloadPdfFile(fakeDoc, 'Evolucao_Assinada.pdf'), true);
  assert.deepEqual(calls, [
    'begin:Evolucao_Assinada.pdf:application/pdf',
    'chunk:QUJD',
    'finish'
  ]);

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {}
  });
  assert.equal(
    await downloadPdfFile(fakeDoc, 'Sem_Ponte.pdf'),
    false,
    'O WebView não deve informar sucesso quando a ponte nativa estiver ausente.'
  );

  const clinicalPdfCallers = [
    'src/pages/PatientDetail.tsx',
    'src/pages/History.tsx',
    'src/pages/PublicReportView.tsx'
  ];

  for (const file of clinicalPdfCallers) {
    const source = readFileSync(resolve(file), 'utf8');
    assert.equal(source.includes('doc.save('), false, `${file} não pode contornar o download compatível.`);
    assert.equal(source.includes('downloadPdfFile'), true, `${file} deve usar o download compatível.`);
  }

  const launcherSource = readFileSync(
    resolve('app/src/main/java/com/evolucaoclinica/app/LauncherActivity.java'),
    'utf8'
  );
  assert.equal(launcherSource.includes('openDownloadedFile(finalSavedUri'), true);
  assert.equal(launcherSource.includes('new Intent(Intent.ACTION_VIEW)'), true);
  assert.equal(launcherSource.includes('Intent.FLAG_GRANT_READ_URI_PERMISSION'), true);
  assert.equal(launcherSource.includes('showDownloadNotification(safeName)'), false);
  assert.equal(launcherSource.includes('PDF salvo na pasta Downloads'), false);

  const fileProviderPaths = readFileSync(resolve('app/src/main/res/xml/filepaths.xml'), 'utf8');
  assert.equal(fileProviderPaths.includes('<external-files-path path="Download/"'), true);
} finally {
  Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: originalNavigator });
  Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: originalFileReader });
}

console.log('PDF download compatibility tests passed.');
