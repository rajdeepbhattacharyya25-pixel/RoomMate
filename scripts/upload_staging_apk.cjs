const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envMain = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const url = envMain.match(/VITE_SUPABASE_URL=([^\r\n]+)/)[1];
const anonKey = envMain.match(/VITE_SUPABASE_ANON_KEY=([^\r\n]+)/)[1];

const supabase = createClient(url, anonKey);

async function uploadApk() {
  const apkPath = path.join(__dirname, '..', 'RoomMate-staging-v1.0.4-build10.apk');
  if (!fs.existsSync(apkPath)) {
    console.error('APK file not found at:', apkPath);
    process.exit(1);
  }

  const apkBuffer = fs.readFileSync(apkPath);
  const sizeMb = (apkBuffer.length / (1024 * 1024)).toFixed(2);
  console.log(`Uploading ${sizeMb} MB APK to Supabase Storage [app-updates]...`);

  // 1. Upload as RoomMate-staging-latest.apk (Used by DesktopLandingPage)
  const targetLatest = 'releases/staging/RoomMate-staging-latest.apk';
  console.log(`Uploading to ${targetLatest}...`);
  const { data: d1, error: e1 } = await supabase.storage
    .from('app-updates')
    .upload(targetLatest, apkBuffer, {
      contentType: 'application/vnd.android.package-archive',
      upsert: true,
    });
  if (e1) {
    console.error(`Error uploading to ${targetLatest}:`, e1);
    process.exit(1);
  }
  console.log(`Uploaded successfully to ${targetLatest}!`, d1);

  // 2. Upload as versioned RoomMate-staging-v1.0.4-build10.apk
  const targetVersioned = 'releases/staging/RoomMate-staging-v1.0.4-build10.apk';
  console.log(`Uploading to ${targetVersioned}...`);
  const { data: d2, error: e2 } = await supabase.storage
    .from('app-updates')
    .upload(targetVersioned, apkBuffer, {
      contentType: 'application/vnd.android.package-archive',
      upsert: true,
    });
  if (e2) {
    console.error(`Error uploading to ${targetVersioned}:`, e2);
  } else {
    console.log(`Uploaded successfully to ${targetVersioned}!`, d2);
  }

  const { data: pubData } = supabase.storage.from('app-updates').getPublicUrl(targetLatest);
  console.log(`\nDirect Public Download URL:\n${pubData.publicUrl}`);
}

uploadApk().catch(console.error);
