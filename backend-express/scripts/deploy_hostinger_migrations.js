/**
 * Hostinger database deployment gate.
 *
 * This script is the only deployment command that invokes `prisma migrate
 * deploy`. It runs exclusively when `DEPLOYMENT_TARGET=hostinger`, connects
 * only to Supabase's direct PostgreSQL endpoint, and refuses to run when
 * Vercel is detected. Prisma migrations therefore never run inside a Vercel
 * serverless build or request lifecycle.
 *
 * Consumers:
 * - Hostinger build command: `npm run deploy:hostinger`
 *
 * Side effects:
 * - Applies committed Prisma migrations to the database named by
 *   SUPABASE_DIRECT_URL. It never creates or drops a database and it never
 *   logs connection strings or credentials.
 */
const { spawnSync } = require('node:child_process');
const path = require('node:path');

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
function requireDirectSupabaseUrl(value) {
  if (!value) throw new Error('SUPABASE_DIRECT_URL is required for a Hostinger database deployment.');
  const url = new URL(value);
  if (!/^db\.[a-z0-9-]+\.supabase\.co$/i.test(url.hostname) || url.port !== '5432') {
    throw new Error('SUPABASE_DIRECT_URL must use db.<project>.supabase.co:5432, not a pooler URL.');
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
function main() {
  if (process.env.VERCEL === '1') {
    console.log('Skipped database migration: Vercel deployment detected.');
    return;
  }
  if (process.env.DEPLOYMENT_TARGET !== 'hostinger') {
    throw new Error('Refusing database migration: DEPLOYMENT_TARGET must be exactly "hostinger".');
  }

  const directUrl = requireDirectSupabaseUrl(process.env.SUPABASE_DIRECT_URL ?? process.env.DIRECT_URL);
  const prismaCli = path.join(__dirname, '..', 'node_modules', 'prisma', 'build', 'index.js');
  const result = spawnSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: directUrl, DIRECT_URL: directUrl },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

try {
  main();
} catch (error) {
  console.error(`Database deployment blocked: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
