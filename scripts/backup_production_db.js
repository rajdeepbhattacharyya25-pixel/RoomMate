import { spawnSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

/**
 * Local Supabase Backup Utility for Free Tier
 * Reads credentials strictly from process.env or .env.local / .env file.
 * NEVER hardcodes credentials. Masks sensitive secrets in all outputs.
 */

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        let val = trimmed.slice(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  } catch (e) {
    // Ignore error reading env
  }
}

// 1. Load local env files if present
loadEnvFile(path.resolve('.env.local'));
loadEnvFile(path.resolve('.env'));

const DB_USER = process.env.SUPABASE_DB_USER || 'postgres.pbzaaskftrmnvocczhat';
const DB_HOST = process.env.SUPABASE_DB_HOST || 'aws-0-ap-northeast-1.pooler.supabase.com';
const DB_PORT = process.env.SUPABASE_DB_PORT || '5432';
const DB_NAME = process.env.SUPABASE_DB_NAME || 'postgres';
const DB_PASS = process.env.SUPABASE_DB_PASSWORD || '';

let PROD_URI = process.env.SUPABASE_DB_URL || '';
if (!PROD_URI && DB_PASS) {
  PROD_URI = `postgresql://${DB_USER}:${encodeURIComponent(DB_PASS)}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;
}

if (!PROD_URI) {
  console.error('\n❌ ERROR: Supabase database password is not configured.');
  console.error('Please configure your database credentials via:');
  console.error('  1. Add to .env.local (git-ignored):');
  console.error('     SUPABASE_DB_PASSWORD="your-rotated-password"');
  console.error('     OR');
  console.error('     SUPABASE_DB_URL="postgresql://postgres.pbzaaskftrmnvocczhat:[YOUR-PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres"');
  console.error('  2. OR set in your terminal:');
  console.error('     $env:SUPABASE_DB_PASSWORD="your-rotated-password"\n');
  process.exit(1);
}

// Extract password for log sanitization
let passToSanitize = DB_PASS;
if (!passToSanitize && PROD_URI) {
  const match = PROD_URI.match(/:([^:@]+)@/);
  if (match) {
    passToSanitize = decodeURIComponent(match[1]);
  }
}

function sanitize(str) {
  if (!str) return '';
  if (passToSanitize) {
    return str.replace(new RegExp(passToSanitize.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '********');
  }
  return str;
}

const backupDir = path.resolve('backups');
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(backupDir, `supabase_backup_${timestamp}.sql`);

console.log('====================================================');
console.log('SUPABASE FREE TIER LOCAL BACKUP RUNNER');
console.log('====================================================');
console.log(`Connecting to: ${DB_HOST} (database: ${DB_NAME})`);
console.log(`Output target: ${backupPath}\n`);

const DOCKER_PATH = 'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe';
const DOCKER_IMAGE = 'postgres:17-alpine';

const args = [
  'run',
  '--rm',
  '-i',
  DOCKER_IMAGE,
  'pg_dump',
  PROD_URI,
  '--clean',
  '--if-exists',
  '--no-owner',
  '--no-privileges',
  '--schema=public'
];

console.log('Executing pg_dump in Docker postgres:17-alpine...');
const res = spawnSync(DOCKER_PATH, args, {
  maxBuffer: 100 * 1024 * 1024,
  encoding: 'utf8'
});

if (res.status !== 0) {
  console.error('Backup failed!');
  console.error(sanitize(res.stderr || 'Unknown error'));
  process.exit(1);
}

fs.writeFileSync(backupPath, res.stdout, 'utf8');
const stats = fs.statSync(backupPath);
const sha256 = crypto.createHash('sha256').update(res.stdout).digest('hex');
fs.writeFileSync(`${backupPath}.sha256`, `${sha256}  ${path.basename(backupPath)}\n`, 'utf8');

console.log('✓ Backup completed successfully!');
console.log(`  File:   ${backupPath}`);
console.log(`  Size:   ${(stats.size / (1024 * 1024)).toFixed(2)} MB (${stats.size.toLocaleString()} bytes)`);
console.log(`  SHA256: ${sha256}`);
