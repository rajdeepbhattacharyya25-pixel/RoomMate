const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

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
const supabaseUrl = process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL || 'https://pbzaaskftrmnvocczhat.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function upload() {
  console.log('Uploading RoomMate-v1.0.4-prod.apk to Supabase Storage [app-updates]...');
  const apkPath = path.resolve('RoomMate-v1.0.4-prod.apk');
  if (!fs.existsSync(apkPath)) {
    throw new Error('RoomMate-v1.0.4-prod.apk not found in root!');
  }

  const apkBuffer = fs.readFileSync(apkPath);
  const targets = [
    'releases/production/RoomMate-production-latest.apk',
    'releases/production/RoomMate-v1.0.4-prod.apk',
    'releases/staging/RoomMate-latest.apk'
  ];

  for (const target of targets) {
    console.log(`Uploading to: ${target} (${(apkBuffer.length / (1024 * 1024)).toFixed(2)} MB)...`);
    const { error } = await supabase.storage
      .from('app-updates')
      .upload(target, apkBuffer, {
        contentType: 'application/vnd.android.package-archive',
        upsert: true,
      });

    if (error) {
      console.error(`Error uploading to ${target}:`, error.message);
    } else {
      const { data } = supabase.storage.from('app-updates').getPublicUrl(target);
      console.log(`✓ Uploaded successfully: ${data.publicUrl}`);
    }
  }

  console.log('Done uploading production APK to Supabase Storage!');
}

upload().catch(console.error);
