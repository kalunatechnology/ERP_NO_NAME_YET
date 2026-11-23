import assert from 'node:assert/strict';
import {
  ROPA_RECORDS,
  ensureGovernanceTables,
  evaluateLaunchReadiness,
  governanceRouter,
  publicGovernanceRouter,
} from '../src/modules/governance/governance.routes';

const REQUIRED_ROPA_KEYS = [
  'activity_name',
  'controller',
  'dpo_contact',
  'purpose',
  'legal_basis',
  'data_subject_categories',
  'personal_data_categories',
  'recipients',
  'cross_border_transfer',
  'retention_period',
  'deletion_method',
  'security_measures',
  'owner_role',
] as const;

function runTests() {
  assert.ok(Array.isArray(ROPA_RECORDS) && ROPA_RECORDS.length >= 2, 'ROPA_RECORDS must contain records');
  for (const record of ROPA_RECORDS) {
    for (const key of REQUIRED_ROPA_KEYS) {
      const value = (record as Record<string, unknown>)[key];
      assert.equal(typeof value, 'string', `ROPA record ${record.id} missing string field ${key}`);
      assert.ok(String(value).trim().length > 0, `ROPA record ${record.id} has empty field ${key}`);
    }
  }

  assert.equal(typeof ensureGovernanceTables, 'function');
  assert.equal(typeof evaluateLaunchReadiness, 'function');
  assert.ok(publicGovernanceRouter && Array.isArray(publicGovernanceRouter.stack), 'publicGovernanceRouter should be an Express Router');
  assert.ok(governanceRouter && Array.isArray(governanceRouter.stack), 'governanceRouter should be an Express Router');

  const publicPaths = publicGovernanceRouter.stack
    .filter((layer: any) => layer.route)
    .map((layer: any) => layer.route.path);
  assert.ok(publicPaths.includes('/public/status'));
  assert.ok(publicPaths.includes('/public/consent'));
  assert.ok(publicPaths.includes('/public/dsr'));

  const adminPaths = governanceRouter.stack
    .filter((layer: any) => layer.route)
    .map((layer: any) => layer.route.path);
  assert.ok(adminPaths.includes('/readiness'));
  assert.ok(adminPaths.includes('/website-state'));
  assert.ok(adminPaths.includes('/ropa'));
  assert.ok(adminPaths.includes('/dsr'));
  assert.ok(adminPaths.includes('/dsr/:id'));
  assert.ok(adminPaths.includes('/consents'));

  console.log('governance-readiness.unit.ts: ALL PASSED');
}

runTests();
