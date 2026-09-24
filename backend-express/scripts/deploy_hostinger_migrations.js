/**
 * Hostinger/Docker database deployment gate.
 *
 * Historical context
 * ------------------
 * The ERP temporarily had two equivalent migration histories:
 *
 * - master: incremental migrations through 20260921171000...
 * - production: squashed 20260922000000_production_baseline
 *
 * Replaying one history on a database that already contains the other is not
 * safe. This gate converges only the migration *history records* first, then
 * lets Prisma execute migrations created after the convergence point normally.
 * Business/application rows are never copied, seeded, truncated, or merged.
 */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const { createPrismaClient, postgresPoolConfig } = require('./prisma_client');

const PRODUCTION_BASELINE = '20260922000000_production_baseline';
const MASTER_LEGACY_TAIL = '20260921171000_marbot_ai_read_views';
const TEXT_ID_CONVERGENCE = '20260924024500_align_uuid_storage_to_production_text';
const READ_VIEW_REFRESH = '20260924031000_refresh_read_views_after_history_convergence';
const TEXT_ID_REPAIR = '20260924040000_repair_skipped_text_id_convergence';

// These migrations are schema-equivalent to the production baseline at the
// 2026-09-22 convergence point. They remain committed so both branches carry a
// complete historical record, but the deployment gate prevents duplicate DDL.
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
  MASTER_LEGACY_TAIL,
  // Skip this physical conversion only after checking the actual column types.
  TEXT_ID_CONVERGENCE,
];

// Only migrations that are explicitly designed to be deterministic on retry
// may be auto-resolved. Both convergence migrations are transactional. The
// read-view refresh also drops and recreates only repository-owned views, so a
// failed older attempt can be safely marked rolled back and retried.
const SAFE_FAILED_MIGRATIONS = new Set([
  '20260911090000_backfill_employee_user_mapping',
  TEXT_ID_CONVERGENCE,
  READ_VIEW_REFRESH,
  TEXT_ID_REPAIR,
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

async function refreshHistory(client) {
  return latestByName(await readMigrationHistory(client));
}

async function readUuidColumns(client) {
  return client.$queryRawUnsafe(`
    SELECT
      table_name::text AS table_name,
      column_name::text AS column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND data_type = 'uuid'
  `);
}

async function applyTextIdRepair(prismaCli, directUrl, client, history) {
  if (isApplied(history.get(TEXT_ID_REPAIR))) return history;

  const uuidColumns = await readUuidColumns(client);
  if (uuidColumns.length === 0) {
    return recordApplied(
      prismaCli,
      directUrl,
      client,
      history,
      TEXT_ID_REPAIR,
      'Physical schema already uses TEXT IDs; recording forward repair as applied',
    );
  }

  // Prisma's migration runner can mask the first PostgreSQL error in an
  // explicit multi-statement transaction with SQLSTATE 25P02 (transaction
  // aborted). Send this exceptional convergence migration as one pg batch so
  // PostgreSQL preserves atomic rollback and reports the real failing command.
  const migrationSql = fs.readFileSync(
    path.join(__dirname, '..', 'prisma', 'migrations', TEXT_ID_REPAIR, 'migration.sql'),
    'utf8',
  );
  const pool = new Pool({ ...postgresPoolConfig(directUrl), max: 1 });
  try {
    console.log(`Applying transactional repair migration directly: ${TEXT_ID_REPAIR}`);
    await pool.query(migrationSql);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const code = error?.code ? ` [PostgreSQL ${error.code}]` : '';
    throw new Error(`Transactional repair migration failed${code}: ${detail}`);
  } finally {
    await pool.end();
  }

  history = await refreshHistory(client);
  return recordApplied(
    prismaCli,
    directUrl,
    client,
    history,
    TEXT_ID_REPAIR,
    'Transactional repair completed; recording migration as applied',
  );
}

async function resolveSafeFailedMigrations(prismaCli, directUrl, client) {
  let history = await refreshHistory(client);
  for (const migrationName of SAFE_FAILED_MIGRATIONS) {
    const row = history.get(migrationName);
    if (!isUnresolvedFailure(row)) continue;

    const logTail = String(row.logs || '').trim().slice(-1200);
    if (logTail) console.warn(`Previous failure for ${migrationName}:\n${logTail}`);

    console.log(`Resolving retry-safe failed migration as rolled back: ${migrationName}`);
    runPrismaResolve(prismaCli, directUrl, '--rolled-back', migrationName);
    history = await refreshHistory(client);
  }
  return history;
}

async function recordApplied(prismaCli, directUrl, client, history, migrationName, reason) {
  const row = history.get(migrationName);
  if (isApplied(row)) return history;
  if (isUnresolvedFailure(row)) {
    if (!SAFE_FAILED_MIGRATIONS.has(migrationName)) {
      throw new Error(`Cannot auto-resolve failed migration ${migrationName}; manual review is required.`);
    }
    runPrismaResolve(prismaCli, directUrl, '--rolled-back', migrationName);
    history = await refreshHistory(client);
  }
  console.log(`${reason}: ${migrationName}`);
  runPrismaResolve(prismaCli, directUrl, '--applied', migrationName);
  return refreshHistory(client);
}

/**
 * Reconciles the historical split without executing duplicate schema changes.
 *
 * Cases:
 * A. Existing production DB: baseline is applied -> mark legacy master names as
 *    applied; skip UUID->TEXT only when the physical schema has no UUID columns.
 * B. Existing master DB: legacy tail is applied -> mark production baseline as
 *    applied, then allow the corrected UUID->TEXT convergence migration to run.
 * C. Brand-new DB: no history -> choose the production baseline as bootstrap by
 *    marking legacy/equivalent migrations applied before migrate deploy.
 * D. Partial/unknown pre-baseline history -> hard stop rather than guessing.
 */
async function convergeMigrationLineages(prismaCli, directUrl, client, history) {
  if (history.size === 0) {
    console.log('Empty migration history detected. Bootstrapping from the production baseline lineage.');
    for (const migrationName of MASTER_LEGACY_EQUIVALENT_MIGRATIONS) {
      history = await recordApplied(
        prismaCli,
        directUrl,
        client,
        history,
        migrationName,
        'Recording pre-baseline equivalent as applied',
      );
    }
    return history;
  }

  if (isApplied(history.get(PRODUCTION_BASELINE))) {
    console.log(`Production migration lineage detected via ${PRODUCTION_BASELINE}.`);
    // information_schema identifiers are PostgreSQL `name`/sql_identifier values.
    // Prisma's raw-query decoder does not support the wire type `name`, so cast
    // them explicitly to TEXT. This mirrors the proven production deployment
    // pattern used when reading information_schema.tables.
    const uuidColumns = await readUuidColumns(client);
    for (const migrationName of MASTER_LEGACY_EQUIVALENT_MIGRATIONS) {
      if (migrationName === TEXT_ID_CONVERGENCE && uuidColumns.length > 0) {
        console.log('Physical UUID columns remain; preserving conversion history for migrate deploy and the forward repair migration.');
        continue;
      }
      history = await recordApplied(
        prismaCli,
        directUrl,
        client,
        history,
        migrationName,
        'Bridging baseline-equivalent master migration',
      );
    }
    return history;
  }

  if (isApplied(history.get(MASTER_LEGACY_TAIL))) {
    console.log(`Master legacy lineage detected via ${MASTER_LEGACY_TAIL}.`);
    history = await recordApplied(
      prismaCli,
      directUrl,
      client,
      history,
      PRODUCTION_BASELINE,
      'Recording production squash baseline as schema-equivalent',
    );
    return history;
  }

  const knownPreBaselineRows = [...history.keys()].filter((name) =>
    MASTER_LEGACY_EQUIVALENT_MIGRATIONS.includes(name),
  );
  if (knownPreBaselineRows.length) {
    throw new Error(
      `Partial pre-baseline migration history detected (${knownPreBaselineRows.length} known migration(s)). ` +
      'Deployment stopped because neither the production baseline nor the complete master legacy tail is applied.',
    );
  }

  throw new Error(
    'Unknown migration lineage. Refusing to guess whether this database is master, production, or a partial restore.',
  );
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
    history = await convergeMigrationLineages(prismaCli, directUrl, client, history);
    history = await applyTextIdRepair(prismaCli, directUrl, client, history);
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

if (require.main === module) {
  main().catch((error) => {
    console.error(`Database deployment blocked: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}

module.exports = { applyTextIdRepair, convergeMigrationLineages };
