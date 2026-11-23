import assert from 'node:assert/strict';
import { enforceSoD, hasLevel1FinanceBypass } from '../src/middleware/sod.middleware';
import { isLevel1FinanceUser } from '../../frontend-next/lib/access/module-contract';

async function main() {
  const finL1 = {
    id: 'u1',
    roles: ['FINANCE'],
    module_assignments: [
      { module_code: 'FINANCE', tier_level: 1, status: 'ACTIVE', allow_read: true, allow_write: true },
    ],
  };
  const finL2 = {
    id: 'u2',
    roles: ['FINANCE'],
    module_assignments: [
      { module_code: 'FINANCE', tier_level: 2, status: 'ACTIVE', allow_read: true, allow_write: true },
    ],
  };

  assert.equal(hasLevel1FinanceBypass(finL1), true);
  assert.equal(hasLevel1FinanceBypass(finL2), false);
  assert.equal(isLevel1FinanceUser(finL1), true);
  assert.equal(isLevel1FinanceUser(finL2), false);

  const mw = enforceSoD({
    getCreatorId: async () => 'u1',
    getAmountValue: async () => 5000000,
  });
  const headers: Record<string, string> = {};
  let err1: unknown = null;
  await mw(
    { user: finL1 } as any,
    { setHeader: (k: string, v: string) => { headers[k] = v; } } as any,
    (e?: unknown) => { err1 = e ?? null; },
  );
  assert.equal(err1, null);
  assert.equal(headers['X-SoD-Status'], 'BYPASSED_LEVEL_1');

  const mw2 = enforceSoD({
    getCreatorId: async () => 'u2',
    getAmountValue: async () => 5000000,
  });
  let err2: unknown = null;
  await mw2(
    { user: finL2 } as any,
    { setHeader: () => {} } as any,
    (e?: unknown) => { err2 = e ?? null; },
  );
  assert.ok(err2, 'Level 2 must still be blocked by SoD');

  console.log('finance-level1.unit.ts: ALL PASSED');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
