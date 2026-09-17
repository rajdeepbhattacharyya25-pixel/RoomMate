#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { ZipArchive } from 'archiver';
import { createClient } from '@supabase/supabase-js';


// 1. Load environment variables from .env and .env.local
function loadEnv() {
  const env = {};
  for (const file of ['.env', '.env.local']) {
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, 'utf-8');
      content.split('\n').forEach((line) => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const [key, ...vals] = trimmed.split('=');
          if (key && vals.length > 0) {
            env[key.trim()] = vals.join('=').trim().replace(/^["']|["']$/g, '');
          }
        }
      });
    }
  }
  return env;
}

const env = loadEnv();
const supabaseUrl = process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('\x1b[31m[Error] Missing VITE_SUPABASE_URL or Supabase Key in .env\x1b[0m');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// 2. Parse command-line flags
const args = process.argv.slice(2);
function getArg(flag, defaultValue = '') {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1]) {
    return args[idx + 1];
  }
  return defaultValue;
}

const version = getArg('--version') || getArg('-v') || `1.0.${Date.now().toString().slice(-4)}`;
const buildNumber = getArg('--build-number') || getArg('-b') || '4';
const channel = (getArg('--channel') || 'staging').toLowerCase();
const changelog = getArg('--changelog') || getArg('-m') || 'Over-the-air update with feature improvements and bug fixes.';
const minNative = getArg('--min-native') || '1.0.1';

console.log('\n======================================================');
console.log('🚀  ROOMMATE OTA PUBLISHER');
console.log('======================================================');
console.log(`📌 Version:            ${version}`);
console.log(`🔢 Build Number:       ${buildNumber}`);
console.log(`📡 Target Channel:     ${channel.toUpperCase()}`);
console.log(`🛡️  Min Native APK:     ${minNative}`);
console.log(`📝 Changelog:          "${changelog}"`);
console.log('------------------------------------------------------\n');

// 3. Compile web bundle for the specified channel
console.log(`⚙️  Building web assets for [${channel}] (v${version}, build ${buildNumber})...`);
try {
  execSync(`node scripts/generate-build-info.js --channel ${channel} --version ${version} --build-number ${buildNumber}`, { stdio: 'inherit' });
  execSync(`npx tsc -b && npx vite build --mode ${channel}`, { stdio: 'inherit' });
} catch (err) {
  console.error('\x1b[31m❌ Web build failed.\x1b[0m');
  process.exit(1);
}

// 4. Create ZIP archive of dist/
const distDir = path.resolve('dist');
if (!fs.existsSync(distDir)) {
  console.error('\x1b[31m❌ dist directory not found after build.\x1b[0m');
  process.exit(1);
}

const zipFilename = `roommate-${channel}-${version}.zip`;
const zipPath = path.resolve('.agents', 'scratch', zipFilename);
fs.mkdirSync(path.dirname(zipPath), { recursive: true });

console.log(`📦 Compressing bundle into ${zipFilename}...`);

async function createZip() {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = new ZipArchive({ zlib: { level: 9 } });

    output.on('close', resolve);
    archive.on('error', reject);

    archive.pipe(output);
    archive.directory(distDir, false);
    archive.finalize();
  });
}

await createZip();
const zipStats = fs.statSync(zipPath);
const zipSizeMb = (zipStats.size / (1024 * 1024)).toFixed(2);
console.log(`✅ Compressed: ${zipSizeMb} MB`);

// 5. Compute SHA-256 Checksum
const fileBuffer = fs.readFileSync(zipPath);
const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');
console.log(`🔐 SHA-256 Checksum:   ${sha256}`);

// 6. Upload ZIP to Supabase Storage bucket 'app-updates'
const remoteFilePath = `releases/${channel}/${zipFilename}`;
console.log(`☁️  Uploading to Supabase Storage [app-updates/${remoteFilePath}]...`);

const { error: uploadError } = await supabase.storage
  .from('app-updates')
  .upload(remoteFilePath, fileBuffer, {
    contentType: 'application/zip',
    upsert: true,
  });

if (uploadError) {
  console.error(`\x1b[31m❌ Storage upload error: ${uploadError.message}\x1b[0m`);
  process.exit(1);
}

const { data: publicUrlData } = supabase.storage
  .from('app-updates')
  .getPublicUrl(remoteFilePath);

const bundleUrl = publicUrlData.publicUrl;
console.log(`🔗 Public Bundle URL:  ${bundleUrl}`);

// 7. Update database: atomically deactivate older releases and insert new active release
console.log(`📋 Registering release in public.app_versions...`);

let releaseBuildTime = new Date().toISOString();
const metaPath = path.resolve('.agents', 'scratch', 'build-meta.json');
if (fs.existsSync(metaPath)) {
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    if (meta.buildTimestamp) releaseBuildTime = meta.buildTimestamp;
  } catch (e) {}
}

const { data: rpcRes, error: rpcError } = await supabase.rpc('manage_ota_release', {
  p_action: 'publish',
  p_version: version,
  p_channel: channel,
  p_bundle_url: bundleUrl,
  p_checksum: sha256,
  p_changelog: changelog,
  p_min_native_version: minNative,
  p_app_name: 'RoomMate',
  p_build_time: releaseBuildTime,
});

if (rpcError) {
  console.error(`\x1b[31m❌ Database registration failed: ${rpcError.message}\x1b[0m`);
  process.exit(1);
}

const newRecord = rpcRes.record;

// 8. If an APK is provided or detected in root, upload it as latest staging APK for direct sideload downloads
const apkCandidate = getArg('--apk') || (fs.existsSync(`RoomMate-${channel}-v${version}-build${buildNumber}.apk`) ? `RoomMate-${channel}-v${version}-build${buildNumber}.apk` : null);
if (apkCandidate && fs.existsSync(apkCandidate)) {
  console.log(`\n📦 Uploading Native Sideload APK to Supabase Storage [${apkCandidate}]...`);
  const apkBuffer = fs.readFileSync(apkCandidate);
  const remoteApkPath = `releases/${channel}/RoomMate-${channel}-latest.apk`;
  const { error: apkUploadErr } = await supabase.storage
    .from('app-updates')
    .upload(remoteApkPath, apkBuffer, {
      contentType: 'application/vnd.android.package-archive',
      upsert: true,
    });
  if (apkUploadErr) {
    console.warn(`⚠️  Warning: APK upload to storage failed: ${apkUploadErr.message}`);
  } else {
    const { data: apkUrlData } = supabase.storage.from('app-updates').getPublicUrl(remoteApkPath);
    console.log(`✅ Native APK Live URL: ${apkUrlData.publicUrl}`);
  }
}

console.log('\n======================================================');
console.log('🎉  OTA UPDATE PUBLISHED SUCCESSFULLY!');
console.log('======================================================');
console.log(`ID:           ${newRecord.id}`);
console.log(`Version:      ${newRecord.version}`);
console.log(`Channel:      ${newRecord.channel.toUpperCase()}`);
console.log(`Checksum:     ${newRecord.checksum}`);
console.log('------------------------------------------------------');
if (channel === 'staging') {
  console.log('📱 NEXT STEP: Open the Staging APK on your personal phone.');
  console.log('   The app will automatically download and stage this update.');
  console.log('   Once you verify everything works, promote to production with:');
  console.log('   👉  npm run ota:promote\n');
} else {
  console.log('🌐 PRODUCTION LIVE: Users will silently receive this update');
  console.log('   on their next app launch without reinstalling!\n');
}
