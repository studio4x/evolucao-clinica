import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const projectDir = process.cwd();

function runCommand(command, args, promptHandlers, timeoutDuration = 0) {
  return new Promise((resolve, reject) => {
    console.log(`Running: ${command} ${args.join(' ')}`);
    const child = spawn(command, args, { shell: true, cwd: projectDir });
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    let buffer = '';
    let timeoutId = null;

    if (timeoutDuration > 0) {
      timeoutId = setTimeout(() => {
        console.log(`\n[TIMEOUT] Command exceeded ${timeoutDuration}ms. Terminating process.`);
        child.kill();
        resolve(); // Resolve anyway to proceed
      }, timeoutDuration);
    }

    child.stdout.on('data', (data) => {
      process.stdout.write(data);
      buffer += data;
      
      // If we see the success indicator for update, we can resolve early to avoid hanging
      if (args.includes('update') && buffer.includes('Project updated successfully.')) {
        console.log('\n[AUTOMATION] Update successful. Terminating early to avoid hang.');
        if (timeoutId) clearTimeout(timeoutId);
        child.kill();
        resolve();
        return;
      }

      // Check for prompts
      for (let i = 0; i < promptHandlers.length; i++) {
        const handler = promptHandlers[i];
        if (handler.pattern.test(buffer)) {
          console.log(`\n[AUTOMATION] Matched prompt: ${handler.pattern}. Sending response.`);
          child.stdin.write(handler.response);
          buffer = '';
          if (!handler.allowMultiple) {
            promptHandlers.splice(i, 1);
            i--;
          }
          break;
        }
      }
    });

    child.stderr.on('data', (data) => {
      process.stderr.write(data);
    });

    child.on('close', (code) => {
      if (timeoutId) clearTimeout(timeoutId);
      if (code === null || code === 0) {
        resolve();
      } else {
        reject(new Error(`Command exited with code ${code}`));
      }
    });
  });
}

function ensureOpaqueWebViewTheme() {
  const valuesDir = path.join(projectDir, 'app', 'src', 'main', 'res', 'values');
  const stylesPath = path.join(valuesDir, 'styles.xml');
  const stylesContent = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <!--
        O projeto foi originalmente gerado pelo Bubblewrap para TWA, cujo tema
        translúcido serve apenas como ponte para o Chrome. O LauncherActivity
        atual mantém um WebView dentro da própria Activity, portanto precisa de
        uma janela opaca e acelerada para compor corretamente overlays e modais.
    -->
    <style name="EvolucaoClinicaWebViewTheme" parent="@android:style/Theme.Material.Light.NoActionBar">
        <item name="android:windowIsTranslucent">false</item>
        <item name="android:windowBackground">@color/backgroundColor</item>
        <item name="android:windowNoTitle">true</item>
        <item name="android:windowActionModeOverlay">true</item>
        <item name="android:windowDisablePreview">false</item>
        <item name="android:windowContentTransitions">false</item>
        <item name="android:colorAccent">@color/colorPrimary</item>
        <item name="android:statusBarColor">@color/colorPrimary</item>
        <item name="android:navigationBarColor">@color/navigationColor</item>
    </style>
</resources>
`;

  fs.mkdirSync(valuesDir, { recursive: true });
  if (!fs.existsSync(stylesPath) || fs.readFileSync(stylesPath, 'utf8') !== stylesContent) {
    fs.writeFileSync(stylesPath, stylesContent, 'utf8');
    console.log('- Opaque WebView activity theme written to app/src/main/res/values/styles.xml.');
  }
}

function applyFixes() {
  console.log('\nApplying custom gradle and WebView fixes to ensure compilation succeeds under SDK 36...');

  // 1. Write local.properties (find user home dir dynamically)
  const userHome = process.env.USERPROFILE || process.env.HOME || 'C:\\Users\\medei';
  const sdkDir = path.join(userHome, '.bubblewrap', 'android_sdk');
  const localPropPath = path.join(projectDir, 'local.properties');
  fs.writeFileSync(localPropPath, `sdk.dir=${sdkDir.replace(/\\/g, '\\\\')}\n`);
  console.log(`- local.properties configured with SDK path: ${sdkDir}`);

  // 2. Write app/gradle.properties
  const appGradlePropPath = path.join(projectDir, 'app', 'gradle.properties');
  fs.writeFileSync(appGradlePropPath, 'android.overridePathCheck=true\n');
  console.log('- app/gradle.properties configured.');

  // 3. Update root gradle.properties
  const rootGradlePropPath = path.join(projectDir, 'gradle.properties');
  let rootGradleContent = fs.readFileSync(rootGradlePropPath, 'utf8');
  if (!rootGradleContent.includes('android.overridePathCheck=true')) {
    rootGradleContent += '\nandroid.overridePathCheck=true\n';
    fs.writeFileSync(rootGradlePropPath, rootGradleContent);
    console.log('- root gradle.properties configured.');
  }

  // 4. Update app/build.gradle
  const buildGradlePath = path.join(projectDir, 'app', 'build.gradle');
  let buildGradleContent = fs.readFileSync(buildGradlePath, 'utf8');
  
  // Set compileSdkVersion to 36
  buildGradleContent = buildGradleContent.replace(/compileSdkVersion\s+\d+/, 'compileSdkVersion 36');
  
  // Garante a inclusão da dependência SwipeRefreshLayout que o LauncherActivity customizado utiliza
  if (!buildGradleContent.includes('androidx.swiperefreshlayout:swiperefreshlayout')) {
    buildGradleContent = buildGradleContent.replace(
      'dependencies {',
      "dependencies {\n    implementation 'androidx.swiperefreshlayout:swiperefreshlayout:1.1.0'"
    );
  }
  
  fs.writeFileSync(buildGradlePath, buildGradleContent);
  console.log('- app/build.gradle configured.');

  // 5. Restore permissions and the opaque/hardware-accelerated theme after Bubblewrap update.
  const manifestPath = path.join(projectDir, 'app', 'src', 'main', 'AndroidManifest.xml');
  if (fs.existsSync(manifestPath)) {
    let manifestContent = fs.readFileSync(manifestPath, 'utf8');
    let modified = false;
    
    if (!manifestContent.includes('android.permission.RECORD_AUDIO')) {
      manifestContent = manifestContent.replace(
        '<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>',
        '<uses-permission android:name="android.permission.INTERNET" />\n        <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />\n        <uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>\n        <uses-permission android:name="android.permission.RECORD_AUDIO" />\n        <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />'
      );
      modified = true;
      console.log('- RECORD_AUDIO, MODIFY_AUDIO_SETTINGS, INTERNET & ACCESS_NETWORK_STATE permissions added to AndroidManifest.xml');
    }

    const launcherActivityMatch = manifestContent.match(/<activity android:name="LauncherActivity"[\s\S]*?android:exported="true">/);
    if (launcherActivityMatch) {
      const originalActivityTag = launcherActivityMatch[0];
      let activityTag = originalActivityTag
        .replace(/\s+android:theme="[^"]*"/g, '')
        .replace(/\s+android:hardwareAccelerated="[^"]*"/g, '')
        .replace(/\s+android:windowSoftInputMode="[^"]*"/g, '');

      activityTag = activityTag.replace(
        'android:exported="true">',
        'android:theme="@style/EvolucaoClinicaWebViewTheme"\n            android:hardwareAccelerated="true"\n            android:windowSoftInputMode="adjustResize"\n            android:exported="true">'
      );

      if (activityTag !== originalActivityTag) {
        manifestContent = manifestContent.replace(originalActivityTag, activityTag);
        modified = true;
        console.log('- LauncherActivity configured with opaque theme and hardware acceleration.');
      }
    } else {
      console.log('WARNING: LauncherActivity declaration not found in AndroidManifest.xml.');
    }
    
    if (modified) {
      fs.writeFileSync(manifestPath, manifestContent, 'utf8');
    }
  } else {
    console.log('WARNING: AndroidManifest.xml not found at ' + manifestPath);
  }

  ensureOpaqueWebViewTheme();
  console.log('All fixes applied successfully!\n');
}

async function main() {
  try {
    // Realiza backup do LauncherActivity.java customizado para evitar que o Bubblewrap o sobrescreva com o template padrão de TWA
    const launcherActivityPath = path.join(projectDir, 'app', 'src', 'main', 'java', 'com', 'evolucaoclinica', 'app', 'LauncherActivity.java');
    let launcherActivityBackup = null;
    if (fs.existsSync(launcherActivityPath)) {
      launcherActivityBackup = fs.readFileSync(launcherActivityPath, 'utf8');
      console.log('- Custom LauncherActivity.java backed up.');
    }

    // Step 1: Run update to apply manifest changes (and download new icons)
    console.log('=== STEP 1: RUNNING BUBBLEWRAP UPDATE ===');
    await runCommand('npx', ['@bubblewrap/cli', 'update'], [
      { pattern: /Accept\?\s*\(y\/N\)/i, response: 'y\n', allowMultiple: true }
    ], 30000);

    // Step 2: Apply gradle configuration overrides
    console.log('=== STEP 2: APPLYING OVERRIDES ===');
    applyFixes();

    // Restaura o LauncherActivity.java customizado mesmo que o Bubblewrap tenha removido o arquivo.
    if (launcherActivityBackup) {
      fs.mkdirSync(path.dirname(launcherActivityPath), { recursive: true });
      fs.writeFileSync(launcherActivityPath, launcherActivityBackup, 'utf8');
      console.log('- LauncherActivity.java restored from backup (preventing Bubblewrap overwrite).');
    }

    // Step 3: Run build and sign
    console.log('=== STEP 3: RUNNING BUBBLEWRAP BUILD ===');
    await runCommand('npx', ['@bubblewrap/cli', 'build'], [
      { pattern: /changes in twa-manifest\.json/i, response: 'y\n' },
      { pattern: /Password for the Key Store:/i, response: 'evolucao123\n' },
      { pattern: /Password for the Key\b(?! Store):/i, response: 'evolucao123\n' }
    ]);

    console.log('\n=== BUILD COMPLETE AND SIGNED! ===');
  } catch (error) {
    console.error('\nBuild failed:', error.message);
    process.exit(1);
  }
}

main();