/**
 * One-time bootstrap for a NEW, EMPTY PostgreSQL deployment database.
 *
 * Safety boundary:
 * - reads DIRECT_URL (preferred) or DATABASE_URL from the deployment .env;
 * - refuses transaction-pooler URLs and databases containing application rows;
 * - applies the committed baseline migration, then runs the production seed;
 * - never prints credentials.
 */
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

function targetUrl() {
  const value = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!value) throw new Error('DIRECT_URL atau DATABASE_URL wajib tersedia pada .env deployment.');
  const parsed = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) throw new Error('DIRECT_URL/DATABASE_URL harus berupa URL PostgreSQL.');
  if (parsed.port === '6543' || /pooler/i.test(parsed.hostname)) {
    throw new Error('Gunakan koneksi PostgreSQL direct/session, bukan transaction pooler port 6543.');
  }
  return value;
}

function runNode(args, url, extraEnv = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv, DATABASE_URL: url, DIRECT_URL: url },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

async function assertEmpty(url) {
  const client = new PrismaClient({ datasources: { db: { url } } });
  try {
    const tables = await client.$queryRawUnsafe(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name <> '_prisma_migrations'
      ORDER BY table_name
    `);

    for (const row of tables) {
      const tableName = String(row.table_name);
      const quotedTableName = `"${tableName.replaceAll('"', '""')}"`;
      const result = await client.$queryRawUnsafe(`SELECT EXISTS (SELECT 1 FROM ${quotedTableName} LIMIT 1) AS has_rows`);
      if (result[0]?.has_rows) {
        throw new Error(`Target ditolak: database tidak kosong (data ditemukan pada tabel ${tableName}). Script ini khusus database deployment baru.`);
      }
    }
  } finally {
    await client.$disconnect();
  }
}

async function main() {
  const url = targetUrl();
  if (!process.env.SEED_DEFAULT_PASSWORD || process.env.SEED_DEFAULT_PASSWORD.length < 12) {
    throw new Error('SEED_DEFAULT_PASSWORD minimal 12 karakter wajib disediakan untuk akun awal production.');
  }
  await assertEmpty(url);

  const root = path.resolve(__dirname, '..');
  const prismaCli = path.join(root, 'node_modules', 'prisma', 'build', 'index.js');
  const tsNodeRegister = 'ts-node/register';
  runNode([prismaCli, 'migrate', 'deploy'], url);
  runNode(['-r', tsNodeRegister, '--enable-source-maps', 'prisma/seed.ts'], url, {
    NODE_ENV: 'production',
    ALLOW_PRODUCTION_SEED_RESET: 'RESET_TO_SINERGI_MUDA_ARSA',
  });
  console.log('Database deployment baru berhasil dimigrasikan dan di-seed untuk PT Sinergi Muda Arsa.');
}

main().catch((error) => {
  console.error(`Bootstrap database baru gagal: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
