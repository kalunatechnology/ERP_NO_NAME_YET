import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const migrationName = '20260924031000_refresh_read_views_after_history_convergence';
const migration = readFileSync(
  path.join(root, 'prisma', 'migrations', migrationName, 'migration.sql'),
  'utf8',
);
const deployGate = readFileSync(path.join(root, 'scripts', 'deploy_hostinger_migrations.js'), 'utf8');

assert.match(migration, /^-- Shared post-convergence read-view migration\./);
assert(migration.includes('BEGIN;'), 'Read-view convergence migration must be transactional.');
assert(migration.trimEnd().endsWith('COMMIT;'), 'Read-view convergence migration must commit explicitly.');

for (const view of [
  'view_finance_main_dashboard',
  'view_project_dashboard',
  'view_project_timeline_cost',
  'view_crm_sales_dashboard',
  'ai_projects',
  'ai_project_tasks',
  'ai_project_finance_summary',
  'ai_finance_summary',
  'ai_crm_deals',
]) {
  assert(
    migration.includes(`DROP VIEW IF EXISTS ${view};`),
    `${view} must be dropped before recreation so legacy UUID/TEXT output types cannot block retry.`,
  );
  assert(migration.includes(`CREATE VIEW ${view} AS`), `${view} must be recreated canonically.`);
}

assert(!migration.includes('CREATE OR REPLACE VIEW'), 'Retry migration must not rely on incompatible CREATE OR REPLACE VIEW type changes.');
for (const forbidden of ['TRUNCATE ', 'DELETE FROM ', 'UPDATE ', 'INSERT INTO ']) {
  assert(!migration.toUpperCase().includes(forbidden), `Schema convergence migration must not mutate business rows: ${forbidden}`);
}

assert(
  deployGate.includes(`const READ_VIEW_REFRESH = '${migrationName}'`),
  'Deployment gate must name the shared read-view migration explicitly.',
);
assert(
  /SAFE_FAILED_MIGRATIONS[\s\S]*READ_VIEW_REFRESH/.test(deployGate),
  'Failed read-view migration must be retry-safe in the deployment gate.',
);
assert(
  deployGate.includes("runPrismaResolve(prismaCli, directUrl, '--rolled-back', migrationName)"),
  'Retry-safe failures must be resolved as rolled back before migrate deploy.',
);

console.log(JSON.stringify({
  status: 'PASS',
  migration: migrationName,
  transaction: true,
  retrySafe: true,
  businessDataMutation: false,
}, null, 2));
