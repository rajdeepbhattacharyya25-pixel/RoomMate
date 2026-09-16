#!/usr/bin/env node

import fs from 'fs';
import readline from 'readline';
import { createClient } from '@supabase/supabase-js';

// 1. Load environment variables
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

console.log('\n======================================================');
console.log('🌟  ROOMMATE OTA PROMOTION: STAGING ➔ PRODUCTION');
console.log('======================================================');

// 2. Fetch current active staging release
const { data: stagingRelease, error: fetchError } = await supabase
  .from('app_versions')
  .select('*')
  .eq('channel', 'staging')
  .eq('is_active', true)
  .order('published_at', { ascending: false })
  .limit(1)
  .maybeSingle();

if (fetchError || !stagingRelease) {
  console.error('\x1b[31m❌ No active staging release found to promote.\x1b[0m');
  console.log('   Publish a staging release first using: npm run ota:publish\n');
  process.exit(1);
}

console.log(`📦 Found Active Staging Bundle to Promote:`);
console.log(`   Version:            ${stagingRelease.version}`);
console.log(`   Min Native APK:     ${stagingRelease.min_native_version}`);
console.log(`   Checksum:           ${stagingRelease.checksum}`);
console.log(`   Bundle URL:         ${stagingRelease.bundle_url}`);
console.log(`   Changelog:          "${stagingRelease.changelog || 'N/A'}"`);
console.log(`   Staged At:          ${stagingRelease.published_at}`);
console.log('------------------------------------------------------');
console.log('🔒 GUARANTEE: Zero rebuilds. The exact same tested zip file');
console.log('   and cryptographic checksum will be promoted to Production.');
console.log('------------------------------------------------------\n');

// 3. Confirm promotion
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const askQuestion = (query) => new Promise((resolve) => rl.question(query, resolve));

const answer = await askQuestion('👉 Are you sure you want to promote this release to ALL PRODUCTION users? (y/N): ');
rl.close();

if (answer.trim().toLowerCase() !== 'y' && answer.trim().toLowerCase() !== 'yes') {
  console.log('\nPromotion cancelled. Staging release remains active on your test phone only.\n');
  process.exit(0);
}

// 4. Promote exact artifact to Production channel via atomic RPC
console.log('\n🚀 Promoting exact artifact to Production channel...');
const { data: rpcRes, error: rpcError } = await supabase.rpc('manage_ota_release', {
  p_action: 'promote',
  p_version: stagingRelease.version,
  p_channel: 'production',
  p_bundle_url: stagingRelease.bundle_url,
  p_checksum: stagingRelease.checksum,
  p_changelog: stagingRelease.changelog,
  p_min_native_version: stagingRelease.min_native_version,
  p_app_name: stagingRelease.app_name || 'RoomMate',
  p_build_time: stagingRelease.build_time || new Date().toISOString(),
});

if (rpcError) {
  console.error(`\x1b[31m❌ Promotion failed: ${rpcError.message}\x1b[0m`);
  process.exit(1);
}

const prodRecord = rpcRes.record;

console.log('\n======================================================');
console.log('🎉  PROMOTED TO PRODUCTION SUCCESSFULLY!');
console.log('======================================================');
console.log(`Production Release ID: ${prodRecord.id}`);
console.log(`Active Version:        ${prodRecord.version}`);
console.log(`Checksum (SHA-256):    ${prodRecord.checksum}`);
console.log(`Min Native APK:        ${prodRecord.min_native_version}`);
console.log('------------------------------------------------------');
console.log('👥 All student users with the RoomMate Production APK will');
console.log('   now silently download and apply v' + prodRecord.version + ' on next launch.');
console.log('   If an emergency arises, instantly roll back with:');
console.log('   👉  npm run ota:rollback\n');
