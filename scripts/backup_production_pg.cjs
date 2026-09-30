const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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

loadEnvFile(path.resolve('.env.local'));
loadEnvFile(path.resolve('.env'));

const DB_USER = process.env.SUPABASE_DB_USER || 'postgres.pbzaaskftrmnvocczhat';
const DB_HOST = process.env.SUPABASE_DB_HOST || 'aws-0-ap-northeast-1.pooler.supabase.com';
const DB_PORT = process.env.SUPABASE_DB_PORT || '5432';
const DB_NAME = process.env.SUPABASE_DB_NAME || 'postgres';
const DB_PASS = process.env.SUPABASE_DB_PASSWORD || '';

let connectionString = process.env.SUPABASE_DB_URL || '';
if (!connectionString && DB_PASS) {
  connectionString = `postgresql://${DB_USER}:${encodeURIComponent(DB_PASS)}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;
}

if (!connectionString) {
  console.error('❌ ERROR: Supabase database credentials missing in .env.local');
  process.exit(1);
}

const backupDir = path.resolve('backups');
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(backupDir, `supabase_backup_${timestamp}.sql`);

async function runBackup() {
  console.log('====================================================');
  console.log('SUPABASE LOGICAL BACKUP (NODE-PG)');
  console.log('====================================================');
  console.log(`Connecting to: ${DB_HOST} (db: ${DB_NAME})`);
  console.log(`Output target: ${backupPath}\n`);

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  await client.connect();
  console.log('✓ Successfully connected to Supabase PostgreSQL pooler!');

  let sqlDump = `-- Supabase Production Backup\n-- Timestamp: ${new Date().toISOString()}\n-- Host: ${DB_HOST}\n-- Database: ${DB_NAME}\n\n`;

  // 1. Get all public tables
  const tablesRes = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `);

  const tables = tablesRes.rows.map(r => r.table_name);
  console.log(`Discovered ${tables.length} public tables.`);

  for (const table of tables) {
    const countRes = await client.query(`SELECT count(*)::int AS cnt FROM public."${table}"`);
    const count = countRes.rows[0].cnt;
    console.log(`  - Backing up public."${table}" (${count} rows)...`);
    sqlDump += `-- Table: public."${table}" (${count} rows)\n`;

    if (count > 0) {
      const dataRes = await client.query(`SELECT * FROM public."${table}"`);
      for (const row of dataRes.rows) {
        const columns = Object.keys(row).map(c => `"${c}"`).join(', ');
        const values = Object.values(row).map(v => {
          if (v === null) return 'NULL';
          if (typeof v === 'number' || typeof v === 'boolean') return v;
          if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
          return `'${String(v).replace(/'/g, "''")}'`;
        }).join(', ');

        sqlDump += `INSERT INTO public."${table}" (${columns}) VALUES (${values});\n`;
      }
    }
    sqlDump += '\n';
  }

  await client.end();

  fs.writeFileSync(backupPath, sqlDump, 'utf8');
  const stats = fs.statSync(backupPath);
  const sha256 = crypto.createHash('sha256').update(sqlDump).digest('hex');
  fs.writeFileSync(`${backupPath}.sha256`, `${sha256}  ${path.basename(backupPath)}\n`, 'utf8');

  console.log('\n✓ Logical Backup Completed Successfully!');
  console.log(`  File:   ${backupPath}`);
  console.log(`  Size:   ${(stats.size / 1024).toFixed(2)} KB (${stats.size.toLocaleString()} bytes)`);
  console.log(`  SHA256: ${sha256}`);
}

runBackup().catch(err => {
  console.error('❌ Backup Failed:', err);
  process.exit(1);
});
