/**
 * Hostinger/Docker database deployment gate.
 *
 * The ERP currently has two historical migration lineages that must converge
 * without replaying equivalent DDL against the wrong database:
 *
 * 1. Master legacy lineage: incremental migrations through 2026-09-21.
 * 2. Production lineage: one squashed 20260922000000_production_baseline.
 *
 * Both lineages describe the same application schema at the convergence point,
 * but they are recorded differently in _prisma_migrations. This script bridges
 * the histories by recording equivalent migrations as applied when it detects
 * the production baseline. It never copies/seeds business data and never runs
 * legacy master DDL against a production-baselined database.
 *
 * After the convergence point, all new migrations are normal shared migrations
 * and must execute on both databases.
 */
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { createPrismaClient } = require('./prisma_client');

const PRODUCTION_BASELINE = '20260922000000_production_baseline';
const TEXT_ID_CONVERGENCE = '20260924024500_align_uuid_storage_to_production_text';

// These migrations existed on the master lineage before production was
// squashed into PRODUCTION_BASELINE. When the production baseline is already
// recorded, their structural effects are already present and they must be
// resolved as applied rather than executed again.
const MASTER_LEGACY_EQUIVALENT_MIGRATIONS = [
  '20260903060000_q3_access_and_tenant_scope',
  '20260903063000_q3_role_catalog_invariant',
  '20260903080000_q7_transaction_governance',
  '20260904120000_guideline_access_reporting',
  '20260905160000_q9_user_module_delegation',
  '20260907010000_reporting_views',
  '20260908090000_reconcile_ghost_company_modules',
  '20260910020000_billing_tax_scheme',
  '20260911074500_optimize_request_assignment_feed',
  '20260911080000_secure_staff_timesheet_overtime',
  '20260911090000_backfill_employee_user_mapping',
  '20260914120000_timesheet_overtime_evidence',
  '20260914130000_company_business_category',
  '20260914140000_timesheet_attendance_audit',
  '20260915160000_marbot_request',
  '20260916120000_project_assignment_contract',
  '20260917120000_tenant_company_governance',
  '20260917170000_management_reports',
  '20260921010000_project_acting_manager_scope',
  '20260921020000_main_task_cost_owner_division',
  '20260921030000_marbot_tenant_provisioning',
  '20260921170000_marbot_runtime_v2_permissions',
  '20260921171000_marbot_ai_read_views',
  // Production baseline already stores identifiers as TEXT, so this master-only
  // physical convergence is also equivalent and must not run there.
  TEXT_ID_CONVERGENCE,
];

// These migrations are explicitly known to be transaction-safe to mark as
// rolled back before retry/bridging. Do not add arbitrary migrations here.
const SAFE_FAILED_MIGRATIONS = new Set([
  '20260911090000_backfill_employee_user_mapping',
  TEXT_ID_CONVERGENCE,
]);

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

function migrationEnv(directUrl) {
  return { ...process.env, DATABASE_URL: directUrl, DIRECT_URL: directUrl };
}

function runPrismaResolve(prismaCli, directUrl, mode, migrationName) {
  const result = spawnSync(
    process.execPath,
    [prismaCli, 'migrate', 'resolve', mode, migrationName],
    { stdio: 'inherit', env: migrationEnv(directUrl) },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

async function readMigrationHistory(client) {
  try {
    return await client.$queryRawUnsafe(`
      SELECT migration_name, started_at, finished_at, rolled_back_at, logs
      FROM "_prisma_migrations"
      ORDER BY started_at ASC
    `);
  } catch (error) {
    const databaseCode = error?.meta?.code;
    if (error?.code === 'P2010' && databaseCode === '42P01') return [];
    throw error;
  }
}

function latestByName(rows) {
  const map = new Map();
  for (const row of rows) map.set(String(row.migration_name), row);
  return map;
}

function isApplied(row) {
  return Boolean(row?.finished_at) && !row?.rolled_back_at;
}

function isUnresolvedFailure(row) {
  return Boolean(row) && !row.finished_at && !row.rolled_back_at;
}

async function resolveSafeFailedMigrations(prismaCli, directUrl, client) {
  let history = latestByName(await readMigrationHistory(client));
  for (const migrationName of SAFE_FAILED_MIGRATIONS) {
    const row = history.get(migrationName);
    if (!isUnresolvedFailure(row)) continue;

    const logTail = String(row.logs || '').trim().slice(-1200);
    if (logTail) {
      console.warn(`Previous failure for ${migrationName}:\n${logTail}`);
    }
    console.log(`Resolving transaction-safe failed migration as rolled back: ${migrationName}`);
    runPrismaResolve(prismaCli, directUrl, '--rolled-back', migrationName);
    history = latestByName(await readMigrationHistory(client));
  }
  return history;
}

async function bridgeProductionBaselineHistory(prismaCli, directUrl, client, history) {
  const baseline = history.get(PRODUCTION_BASELINE);
  if (!isApplied(baseline)) return history;

  console.log(`Production migration lineage detected via ${PRODUCTION_BASELINE}.`);
  console.log('Bridging equivalent master history without replaying schema/data migrations.');

  for (const migrationName of MASTER_LEGACY_EQUIVALENT_MIGRATIONS) {
    let row = history.get(migrationName);
    if (isApplied(row)) continue;

    if (isUnresolvedFailure(row)) {
      if (!SAFE_FAILED_MIGRATIONS.has(migrationName)) {
        throw new Error(
          `Migration ${migrationName} is failed and is not approved for automatic history recovery.`,
        );
      }
      runPrismaResolve(prismaCli, directUrl, '--rolled-back', migrationName);
      history = latestByName(await readMigrationHistory(client));
      row = history.get(migrationName);
    }

    // The production baseline is a schema-equivalent squash of these legacy
    // migrations. Resolve them as applied so a later master -> production merge
    // cannot replay CREATE/ALTER/backfill SQL against the live production DB.
    console.log(`Recording baseline-equivalent migration as applied: ${migrationName}`);
    runPrismaResolve(prismaCli, directUrl, '--applied', migrationName);
    history = latestByName(await readMigrationHistory(client));
  }

  return history;
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
  const client = createPrismaClient(directUrl);

  try {
    let history = await resolveSafeFailedMigrations(prismaCli, directUrl, client);
    history = await bridgeProductionBaselineHistory(prismaCli, directUrl, client, history);
  } finally {
    await client.$disconnect();
  }

  const result = spawnSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    stdio: 'inherit',
    env: migrationEnv(directUrl),
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
