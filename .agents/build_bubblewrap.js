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

function applyFixes() {
  console.log('\nApplying custom gradle fixes to ensure compilation succeeds under SDK 36...');

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
  
  fs.writeFileSync(buildGradlePath, buildGradleContent);
  console.log('- app/build.gradle configured.');

  // 5. Ensure RECORD_AUDIO and MODIFY_AUDIO_SETTINGS permissions are in AndroidManifest.xml
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
    
    if (modified) {
      fs.writeFileSync(manifestPath, manifestContent, 'utf8');
    }
  } else {
    console.log('WARNING: AndroidManifest.xml not found at ' + manifestPath);
  }

  console.log('All fixes applied successfully!\n');
}

async function main() {
  try {
    // Step 1: Run update to apply manifest changes (and download new icons)
    console.log('=== STEP 1: RUNNING BUBBLEWRAP UPDATE ===');
    await runCommand('npx', ['@bubblewrap/cli', 'update'], [
      { pattern: /Accept\?\s*\(y\/N\)/i, response: 'y\n', allowMultiple: true }
    ], 30000);

    // Step 2: Apply gradle configuration overrides
    console.log('=== STEP 2: APPLYING OVERRIDES ===');
    applyFixes();

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
