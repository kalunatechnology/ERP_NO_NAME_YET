import assert from 'node:assert/strict';
import { requireFinanceRole } from '../src/middleware/sod.middleware';
import { requireActiveRole } from '../src/middlewares/rbac.middleware';

function invoke(middleware: any, request: Record<string, any>): Promise<unknown> {
  return new Promise((resolve) => middleware(request, {}, (error?: unknown) => resolve(error ?? null)));
}

async function main() {
  const financeTier1WithoutEnum = {
    id: 'finance-tier1',
    roles: [],
    active_role_code: null,
    module_assignments: [{
      module_code: 'FINANCE', status: 'ACTIVE', tier_level: 1,
      allow_read: true, allow_write: true, allow_delete: true,
    }],
  };
  const deleteRequest = {
    method: 'DELETE',
    originalUrl: '/api/v1/finance/payroll/runs/run-1',
    path: '/payroll/runs/run-1',
    user: financeTier1WithoutEnum,
    moduleAccess: { moduleCode: 'FINANCE', accessMode: 'ASSIGNMENT' },
  };

  assert.equal(await invoke(requireActiveRole('FINANCE', 'DIRECTOR'), deleteRequest), null,
    'module capability must authorize an assigned Finance user without a legacy role enum');
  assert.equal(await invoke(requireFinanceRole(['FINANCE']), deleteRequest), null,
    'Finance route guard must use the Finance assignment capability');

  const assetTier1WithoutEnum = {
    ...financeTier1WithoutEnum,
    module_assignments: [{
      module_code: 'ASSETS', status: 'ACTIVE', tier_level: 1,
      allow_read: true, allow_write: true, allow_delete: true,
    }],
  };
  assert.equal(await invoke(requireFinanceRole(['FINANCE']), {
    ...deleteRequest,
    user: assetTier1WithoutEnum,
    moduleAccess: { moduleCode: 'ASSETS', accessMode: 'ASSIGNMENT' },
  }), null, 'shared route guard must respect the current module assignment');

  const financeTierWithoutDelete = {
    ...financeTier1WithoutEnum,
    module_assignments: [{
      module_code: 'FINANCE', status: 'ACTIVE', tier_level: 1,
      allow_read: true, allow_write: true, allow_delete: false,
    }],
  };
  assert.ok(await invoke(requireActiveRole('FINANCE', 'DIRECTOR'), {
    ...deleteRequest,
    user: financeTierWithoutDelete,
  }), 'a role enum or write grant must not bypass a missing DELETE capability');

  assert.ok(await invoke(requireFinanceRole(['FINANCE']), {
    ...deleteRequest,
    user: {
      ...financeTier1WithoutEnum,
      permission_overrides: [{ module_code: 'FINANCE', action_code: 'DELETE', effect: 'DENY' }],
    },
  }), 'an explicit module DENY must override an assignment grant');

  console.log('module-assignment-router-auth.unit.ts: ALL PASSED');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
