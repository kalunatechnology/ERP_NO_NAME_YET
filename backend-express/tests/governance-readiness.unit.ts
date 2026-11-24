import assert from 'node:assert/strict';
import prisma from '../src/config/database';
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

async function runTests() {
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

  const origExecute = prisma.$executeRawUnsafe;
  const origQuery = prisma.$queryRawUnsafe;
  const origMfa = process.env.ERP_ENFORCE_ADMIN_MFA;
  const origNodeEnv = process.env.NODE_ENV;
  const origCookieSecure = process.env.COOKIE_SECURE;

  let mockState = {
    id: 'state-1',
    status: 'staging',
    legal_entity_name: 'PT Arsalynk Teknologi Indonesia',
    contact_email: 'privacy@arsalynk.com',
    tdpse_number: '',
    canonical_domain: 'https://marka.arsalynk.com',
  };
  const mockDocs = [
    { doc_type: 'PRIVACY_POLICY', version: '1.0', is_active: true },
    { doc_type: 'TERMS', version: '1.0', is_active: true },
    { doc_type: 'COOKIE_POLICY', version: '1.0', is_active: true },
  ];

  try {
    (prisma as any).$executeRawUnsafe = async () => 0;
    (prisma as any).$queryRawUnsafe = async (sql: string) => {
      if (sql.includes('gov_website_state')) return [mockState];
      if (sql.includes('gov_legal_document_version')) return mockDocs;
      return [];
    };

    // 1. Launch Gate GAGAL: TDPSE kosong + MFA nonaktif + NODE_ENV bukan production
    process.env.ERP_ENFORCE_ADMIN_MFA = 'false';
    process.env.NODE_ENV = 'development';
    delete process.env.COOKIE_SECURE;

    const failedAll = await evaluateLaunchReadiness();
    assert.equal(failedAll.can_publish, false, 'Launch Gate must fail when TDPSE & security controls are missing');
    const failedKeys = failedAll.blockers.map((b) => b.key);
    assert.ok(failedKeys.includes('tdpse'), 'tdpse blocker expected');
    assert.ok(failedKeys.includes('security_controls'), 'security_controls blocker expected');
    const failedSec = failedAll.checks.find((c) => c.key === 'security_controls');
    assert.ok(failedSec, 'security_controls check must exist');
    assert.equal(failedSec.passed, false);
    assert.equal(failedSec.blocker, true);
    assert.ok(failedSec.detail.includes('ERP_ENFORCE_ADMIN_MFA=true'), 'detail must list missing ERP_ENFORCE_ADMIN_MFA');
    assert.ok(failedSec.detail.includes('NODE_ENV=production'), 'detail must list missing NODE_ENV/COOKIE_SECURE');

    // 2. Launch Gate GAGAL: TDPSE terisi & NODE_ENV=production, tapi ERP_ENFORCE_ADMIN_MFA belum aktif
    mockState = { ...mockState, tdpse_number: '001234.01/DJAI.PSE/11/2026' };
    process.env.ERP_ENFORCE_ADMIN_MFA = 'false';
    process.env.NODE_ENV = 'production';

    const failedMfaOnly = await evaluateLaunchReadiness();
    assert.equal(failedMfaOnly.can_publish, false, 'Launch Gate must fail when ERP_ENFORCE_ADMIN_MFA is not true');
    assert.deepEqual(failedMfaOnly.blockers.map((b) => b.key), ['security_controls']);
    const mfaOnlySec = failedMfaOnly.checks.find((c) => c.key === 'security_controls');
    assert.ok(mfaOnlySec && mfaOnlySec.detail.includes('ERP_ENFORCE_ADMIN_MFA=true'));
    assert.ok(mfaOnlySec && !mfaOnlySec.detail.includes('NODE_ENV=production'));

    // 3. Launch Gate LOLOS: TDPSE terisi, ERP_ENFORCE_ADMIN_MFA=true, NODE_ENV=production
    process.env.ERP_ENFORCE_ADMIN_MFA = 'true';
    process.env.NODE_ENV = 'production';

    const passedProd = await evaluateLaunchReadiness();
    assert.equal(passedProd.can_publish, true, 'Launch Gate must pass when all blockers and security controls are satisfied');
    assert.equal(passedProd.blockers.length, 0);
    const passedProdSec = passedProd.checks.find((c) => c.key === 'security_controls');
    assert.equal(passedProdSec?.passed, true);

    // 4. Launch Gate LOLOS via COOKIE_SECURE=true
    process.env.ERP_ENFORCE_ADMIN_MFA = 'true';
    process.env.NODE_ENV = 'development';
    process.env.COOKIE_SECURE = 'true';

    const passedCookieFlag = await evaluateLaunchReadiness();
    assert.equal(passedCookieFlag.can_publish, true, 'Launch Gate must pass when COOKIE_SECURE=true and MFA enforced');
    assert.equal(passedCookieFlag.blockers.length, 0);
  } finally {
    (prisma as any).$executeRawUnsafe = origExecute;
    (prisma as any).$queryRawUnsafe = origQuery;
    if (origMfa === undefined) delete process.env.ERP_ENFORCE_ADMIN_MFA;
    else process.env.ERP_ENFORCE_ADMIN_MFA = origMfa;
    if (origNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = origNodeEnv;
    if (origCookieSecure === undefined) delete process.env.COOKIE_SECURE;
    else process.env.COOKIE_SECURE = origCookieSecure;
  }

  console.log('governance-readiness.unit.ts: ALL PASSED');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
