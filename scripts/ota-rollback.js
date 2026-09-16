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

// 2. Parse arguments
const args = process.argv.slice(2);
function getArg(flag, defaultValue = '') {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1]) {
    return args[idx + 1];
  }
  return defaultValue;
}

const channel = (getArg('--channel') || 'production').toLowerCase();
const targetVersion = getArg('--to') || getArg('-v');

console.log('\n======================================================');
console.log('🚨  ROOMMATE OTA EMERGENCY ROLLBACK MANAGER');
console.log('======================================================');
console.log(`📡 Channel: ${channel.toUpperCase()}\n`);

// 3. Query recent releases
const { data: releases, error: listError } = await supabase
  .from('app_versions')
  .select('*')
  .eq('channel', channel)
  .order('published_at', { ascending: false })
  .limit(10);

if (listError || !releases || releases.length === 0) {
  console.error('\x1b[31m❌ No releases found for channel: ' + channel + '\x1b[0m');
  process.exit(1);
}

console.log('Recent Releases:');
releases.forEach((r, idx) => {
  const status = r.is_active ? '\x1b[32m[ACTIVE]\x1b[0m' : '\x1b[90m[Inactive]\x1b[0m';
  console.log(`  ${idx + 1}. v${r.version.padEnd(8)} ${status} - "${r.changelog || 'No notes'}" (${new Date(r.published_at).toLocaleString()})`);
});
console.log('------------------------------------------------------');

let selectedRelease = null;

if (targetVersion) {
  selectedRelease = releases?.find((r) => r.version === targetVersion) || {
    version: targetVersion,
    checksum: 'Historical Checksum',
  };
} else {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const askQuestion = (query) => new Promise((resolve) => rl.question(query, resolve));
  const answer = await askQuestion('\n👉 Enter release number (e.g. 2) or version to rollback to: ');
  rl.close();

  const num = parseInt(answer.trim(), 10);
  if (!isNaN(num) && releases && num >= 1 && num <= releases.length) {
    selectedRelease = releases[num - 1];
  } else {
    selectedRelease = releases?.find((r) => r.version === answer.trim()) || {
      version: answer.trim(),
      checksum: 'Specified Checksum',
    };
  }

  if (!selectedRelease || !selectedRelease.version) {
    console.error('\x1b[31m❌ Invalid selection. Rollback aborted.\x1b[0m');
    process.exit(1);
  }
}

if (selectedRelease.is_active) {
  console.log(`\nVersion v${selectedRelease.version} is ALREADY the active release. No change needed.\n`);
  process.exit(0);
}

console.log(`\nRolling back channel [${channel}] to v${selectedRelease.version}...`);

// 4. Atomically rollback via RPC
const { data: rpcRes, error: rpcError } = await supabase.rpc('manage_ota_release', {
  p_action: 'rollback',
  p_version: selectedRelease.version,
  p_channel: channel,
});

if (rpcError) {
  console.error(`\x1b[31m❌ Failed to activate release: ${rpcError.message}\x1b[0m`);
  process.exit(1);
}

console.log('\n======================================================');
console.log('✅  ROLLBACK SUCCESSFUL!');
console.log('======================================================');
console.log(`Active Version is now: v${selectedRelease.version}`);
console.log(`Channel:               ${channel.toUpperCase()}`);
console.log(`Bundle Checksum:       ${selectedRelease.checksum}`);
console.log('------------------------------------------------------');
console.log('Clients on their next check will download/revert to this version.\n');
