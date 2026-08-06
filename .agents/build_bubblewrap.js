import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const projectDir = process.cwd();
const artifactDirectory = path.join(projectDir, 'app', 'build', 'outputs');

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: projectDir, shell: process.platform === 'win32', stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} terminou com código ${code ?? 'desconhecido'}.`));
    });
  });
}

function requireEnvironment(name) {
  if (!process.env[name]?.trim()) {
    throw new Error(`Variável obrigatória ausente: ${name}. Configure-a apenas no ambiente de build.`);
  }
}

function readReleaseVersion() {
  const manifest = JSON.parse(fs.readFileSync(path.join(projectDir, 'twa-manifest.json'), 'utf8'));
  const appVersion = fs.readFileSync(path.join(projectDir, 'src', 'components', 'layout', 'AppVersion.tsx'), 'utf8');
  const gradle = fs.readFileSync(path.join(projectDir, 'app', 'build.gradle'), 'utf8');
  const code = Number(manifest.appVersionCode);
  const name = String(manifest.appVersionName ?? '');
  const expectedPlayVersion = `1.0.${code}`;
  const gradleCode = Number(gradle.match(/\bversionCode\s+(\d+)/)?.[1]);
  const gradleName = gradle.match(/\bversionName\s+"([^"]+)"/)?.[1];
  const playVersion = appVersion.match(/PLAY_STORE_VERSION\s*=\s*"([^"]+)"/)?.[1];

  if (!Number.isInteger(code) || code <= 0 || name !== String(code) || String(manifest.appVersion) !== String(code)) {
    throw new Error('twa-manifest.json possui versões inconsistentes.');
  }
  if (gradleCode !== code || gradleName !== String(code) || playVersion !== expectedPlayVersion) {
    throw new Error(`Versões Android inconsistentes. Esperado versionCode ${code}, versionName ${code} e PLAY_STORE_VERSION ${expectedPlayVersion}.`);
  }
  return { code, name };
}

function javaTool(name) {
  const extension = process.platform === 'win32' ? '.exe' : '';
  const fromJavaHome = process.env.JAVA_HOME && path.join(process.env.JAVA_HOME, 'bin', `${name}${extension}`);
  return fromJavaHome && fs.existsSync(fromJavaHome) ? fromJavaHome : name;
}

async function verifyAndPublishArtifact(source, destination) {
  if (!fs.existsSync(source)) throw new Error(`Artefato não encontrado: ${source}`);
  await run(javaTool('jarsigner'), ['-verify', source]);
  fs.copyFileSync(source, destination);
  await run(javaTool('jarsigner'), ['-verify', destination]);
  console.log(`Artefato assinado e verificado: ${path.basename(destination)}`);
}

async function main() {
  requireEnvironment('ANDROID_KEYSTORE_PASSWORD');
  requireEnvironment('ANDROID_KEY_PASSWORD');
  const version = readReleaseVersion();
  const gradle = process.platform === 'win32' ? '.\\gradlew.bat' : './gradlew';
  const gradleArgs = [
    ':app:bundleRelease',
    ':app:assembleRelease',
    '--no-daemon',
    '--max-workers=1',
    '-Dorg.gradle.jvmargs=-Xmx1200m -Xms256m -Xss512k',
    '-Dcom.android.tools.r8.threadCount=1'
  ];

  console.log(`Gerando release Android ${version.name} (versionCode ${version.code})...`);
  await run(gradle, gradleArgs);

  await verifyAndPublishArtifact(
    path.join(artifactDirectory, 'bundle', 'release', 'app-release.aab'),
    path.join(projectDir, 'app-release-bundle.aab')
  );
  await verifyAndPublishArtifact(
    path.join(artifactDirectory, 'apk', 'release', 'app-release.apk'),
    path.join(projectDir, 'app-release-signed.apk')
  );
  console.log('Release concluída. Envie apenas app-release-bundle.aab ao Google Play Console.');
}

main().catch((error) => {
  console.error(`Build Android falhou: ${error.message}`);
  process.exitCode = 1;
});
