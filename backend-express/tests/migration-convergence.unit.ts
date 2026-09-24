import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const migrationName = '20260924031000_refresh_read_views_after_history_convergence';
const repairName = '20260924040000_repair_skipped_text_id_convergence';
const migration = readFileSync(
  path.join(root, 'prisma', 'migrations', migrationName, 'migration.sql'),
  'utf8',
);
const productionBaseline = readFileSync(
  path.join(root, 'prisma', 'migrations', '20260922000000_production_baseline', 'migration.sql'),
  'utf8',
);
const deployGate = readFileSync(path.join(root, 'scripts', 'deploy_hostinger_migrations.js'), 'utf8');
const buildScript = readFileSync(path.join(root, 'scripts', 'build.js'), 'utf8');

assert.match(migration, /^-- Shared post-convergence read-view migration\./);
assert(migration.includes('BEGIN;'), 'Historical read-view migration must remain transactional.');
assert(migration.trimEnd().endsWith('COMMIT;'), 'Historical read-view migration must commit explicitly.');

// The production baseline intentionally stores the reporting projections as
// physical tables. This is the exact shape that made blindly replaying
// `DROP VIEW IF EXISTS view_*` unsafe: PostgreSQL errors when that relation is a
// table, and an explicit transaction then surfaces only SQLSTATE 25P02.
for (const reportingRelation of [
  'view_finance_main_dashboard',
  'view_project_dashboard',
  'view_project_timeline_cost',
  'view_crm_sales_dashboard',
]) {
  assert(
    productionBaseline.includes(`CREATE TABLE \"${reportingRelation}\"`),
    `Production baseline must preserve the known physical-table shape for ${reportingRelation}.`,
  );
}

for (const forbidden of ['TRUNCATE ', 'DELETE FROM ', 'UPDATE ', 'INSERT INTO ']) {
  assert(!migration.toUpperCase().includes(forbidden), `Schema convergence migration must not mutate business rows: ${forbidden}`);
}

assert(
  deployGate.includes(`const READ_VIEW_REFRESH = '${migrationName}'`),
  'Deployment gate must name the historical read-view migration explicitly.',
);
assert(
  deployGate.includes(`const TEXT_ID_REPAIR = '${repairName}'`),
  'Deployment gate must name the forward repair migration explicitly.',
);
assert(
  /SAFE_FAILED_MIGRATIONS[\s\S]*READ_VIEW_REFRESH/.test(deployGate),
  'Failed read-view migration must be recoverable as rolled back.',
);
assert(
  deployGate.includes("runPrismaResolve(prismaCli, directUrl, '--rolled-back', migrationName)"),
  'Retry-safe failures must be resolved as rolled back before reconciliation.',
);

// PostgreSQL information_schema identifier columns can be exposed as wire type
// `name`. Prisma raw queries cannot deserialize that type. Keep explicit TEXT
// casts here, matching the proven production deployment pattern.
assert(
  deployGate.includes('table_name::text AS table_name'),
  'Deployment gate must cast information_schema table_name to TEXT before Prisma decoding.',
);
assert(
  deployGate.includes('column_name::text AS column_name'),
  'Deployment gate must cast information_schema column_name to TEXT before Prisma decoding.',
);
assert(
  !deployGate.includes('SELECT table_name, column_name FROM information_schema.columns'),
  'Deployment gate must not return PostgreSQL name/sql_identifier values directly through Prisma raw queries.',
);

assert(
  deployGate.includes('await repairTextIdSchema(directUrl)'),
  'Deployment must perform the lock-bounded TEXT-ID repair explicitly.',
);
assert(
  deployGate.includes('history = await reconcileReadViewRefreshAfterRepair(prismaCli, directUrl, client, history)'),
  'Deployment must reconcile the historical read-view migration after the forward repair.',
);
assert(
  deployGate.includes("SELECT c.relname::text AS relation_name, c.relkind::text AS relation_kind"),
  'Read-view reconciliation must inspect the real PostgreSQL relation kind instead of assuming every view_* name is a view.',
);
assert(
  deployGate.includes('Forward repair ${TEXT_ID_REPAIR} already established compatible read projections'),
  'The historical refresh must be recorded as superseded only after physical projection verification.',
);
assert(
  deployGate.includes("!['v', 'm'].includes(byName.get(name))"),
  'MarBot AI projections must still be verified as actual views/materialized views before reconciliation.',
);

// Application builds must never force database migration. This is what keeps a
// database-history problem from blocking an unrelated frontend/backend release.
assert(
  !buildScript.includes("path.join(__dirname, 'deploy_hostinger_migrations.js')"),
  'npm run build must not invoke database migrations.',
);
assert(
  !buildScript.includes("path.join(__dirname, 'audit_database_architecture.js')"),
  'npm run build must not require a live database architecture audit.',
);
assert(
  buildScript.includes('Database migration is explicit via npm run deploy:hostinger:db'),
  'Hostinger build output must state that database migration is an explicit release operation.',
);

console.log(JSON.stringify({
  status: 'PASS',
  migration: migrationName,
  productionReportingShape: 'physical-tables-preserved',
  readViewRefreshRecovery: 'verified-then-marked-applied',
  informationSchemaIdentifiers: 'cast-to-text',
  applicationBuildDatabaseMutation: false,
  businessDataMutation: false,
}, null, 2));
