/**
 * Hostinger database deployment gate.
 *
 * This script is the only deployment command that invokes `prisma migrate
 * deploy`. It runs only when `DEPLOYMENT_TARGET` is `hostinger` or `docker`, connects
 * only to Supabase's direct PostgreSQL endpoint, and refuses to run when
 * Vercel is detected. Prisma migrations therefore never run inside a Vercel
 * serverless build or request lifecycle.
 *
 * Consumers:
 * - Hostinger build/start command: `npm run deploy:hostinger` / `npm start`
 * - Docker container start: `node server.js`
 *
 * Side effects:
 * - Applies committed Prisma migrations to the database named by
 *   SUPABASE_DIRECT_URL. It never creates or drops a database and it never
 *   logs connection strings or credentials.
 */
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { createPrismaClient } = require('./prisma_client');

const RECOVERABLE_MIGRATION = '20260911090000_backfill_employee_user_mapping';

/**
 * Validates that the supplied URL is the direct Supabase PostgreSQL endpoint.
 *
 * Migration commands need session-level PostgreSQL behavior and must not use
 * the shared transaction pooler. Rejecting a pooler URL here prevents a
 * deployment from partially applying migrations through port 6543.
 *
 * @param {string} value - Secret-bearing URL supplied only by environment.
 * @returns {string} The validated URL; it is never printed.
 * @throws {Error} When the target is missing or points at a pooler/non-direct host.
 */
function requireMigrationSupabaseUrl(value) {
  if (!value) throw new Error('SUPABASE_DIRECT_URL is required for a Hostinger database deployment.');
  const url = new URL(value);
  const isDirect = /^db\.[a-z0-9-]+\.supabase\.co$/i.test(url.hostname) && url.port === '5432';
  const isSessionPooler = url.hostname.endsWith('.pooler.supabase.com') && url.port === '5432';
  if (!isDirect && !isSessionPooler) {
    throw new Error('Migration URL must use Supabase direct or session pooler port 5432, never transaction pooler port 6543.');
  }
  return value;
}

/**
 * Applies only pending committed Prisma migrations for a Hostinger release.
 *
 * The child process inherits no pooler runtime URL: both DATABASE_URL and
 * DIRECT_URL deliberately point to the same direct endpoint. `migrate deploy`
 * is idempotent for already-applied migration records, but a failed migration
 * stops the deployment with a non-zero exit code rather than starting Express
 * against an unknown schema version.
 */
async function recoverKnownFailedMigration(prismaCli, directUrl) {
  const client = createPrismaClient(directUrl);
  try {
    let rows;
    try {
      rows = await client.$queryRawUnsafe(
        'SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" WHERE migration_name = $1 ORDER BY started_at DESC LIMIT 1',
        RECOVERABLE_MIGRATION,
      );
    } catch (error) {
      // A genuinely empty deployment database has no Prisma history table yet.
      // `migrate deploy` below owns creating it together with the baseline.
      const databaseCode = error?.meta?.code;
      if (error?.code === 'P2010' && databaseCode === '42P01') return;
      throw error;
    }
    const failed = rows[0];
    if (!failed || failed.finished_at || failed.rolled_back_at) return;

    console.log(`Recovering known failed migration: ${RECOVERABLE_MIGRATION}`);
    const recovery = spawnSync(
      process.execPath,
      [prismaCli, 'migrate', 'resolve', '--rolled-back', RECOVERABLE_MIGRATION],
      { stdio: 'inherit', env: { ...process.env, DATABASE_URL: directUrl, DIRECT_URL: directUrl } },
    );
    if (recovery.error) throw recovery.error;
    if (recovery.status !== 0) process.exit(recovery.status ?? 1);
  } finally {
    await client.$disconnect();
  }
}

async function main() {
  if (process.env.VERCEL === '1') {
    console.log('Skipped database migration: Vercel deployment detected.');
    return;
  }
  if (!['hostinger', 'docker'].includes(process.env.DEPLOYMENT_TARGET)) {
    throw new Error('Refusing database migration: DEPLOYMENT_TARGET must be "hostinger" or "docker".');
  }

  const directUrl = requireMigrationSupabaseUrl(process.env.SUPABASE_DIRECT_URL ?? process.env.DIRECT_URL);
  const prismaCli = path.join(__dirname, '..', 'node_modules', 'prisma', 'build', 'index.js');
  await recoverKnownFailedMigration(prismaCli, directUrl);
  const result = spawnSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: directUrl, DIRECT_URL: directUrl },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

try {
  main().catch((error) => {
    console.error(`Database deployment blocked: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
} catch (error) {
  console.error(`Database deployment blocked: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
