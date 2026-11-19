import assert from 'node:assert/strict';
import prisma from '../src/config/database';
import {
  DASHBOARD_WIDGET_CATALOG,
  deriveManagedRoleCodes,
  mergeLegacyRoleTranslations,
  syncUserQuickAccess,
} from '../src/modules/accounts/org-policy-sync.service';
import { RoleCode } from '../src/types/roles';

async function runTests() {
  console.log('=== Running Modular Org & Dashboard Access Verification ===');

  // 1. Verify DASHBOARD_WIDGET_CATALOG has exact 6 widgets and NO HR/overtime/meeting widgets
  assert.equal(DASHBOARD_WIDGET_CATALOG.length, 6);
  const codes = DASHBOARD_WIDGET_CATALOG.map((w) => w.code);
  assert.deepEqual(codes, [
    'DASH_PERSONAL',
    'DASH_PROJECTS',
    'DASH_CRM',
    'DASH_FINANCE',
    'DASH_INVENTORY',
    'DASH_EXECUTIVE',
  ]);
  for (const w of DASHBOARD_WIDGET_CATALOG) {
    assert.ok(!/hr|overtime|lembur|meeting|attendance|absensi/i.test(`${w.code} ${w.title} ${w.description}`));
  }
  console.log('✔ 1. DASHBOARD_WIDGET_CATALOG verified (6 modular widgets, 0 HR/overtime/meeting)');

  // 2. Verify Baseline Staff translation (Weekly & Daily Task projection preserved)
  const staffMerged = mergeLegacyRoleTranslations(['ROLE-STAFF']);
  assert.equal(staffMerged.role_level, 'STAFF');
  assert.deepEqual(staffMerged.dashboard_widgets, ['DASH_PERSONAL']);
  const staffProj = staffMerged.modules.find((m) => m.module_code === 'PROJECTS');
  assert.ok(staffProj);
  assert.equal(staffProj.tier_level, 3);
  assert.equal(staffProj.data_scope, 'OWN');
  assert.equal(staffProj.allow_read, true);
  assert.equal(staffProj.allow_write, true);
  console.log('✔ 2. Uniform Staff Baseline verified (PROJECTS Tier 3 OWN + DASH_PERSONAL)');

  // 3. Verify Multi-Role Union + Strongest-Tier Wins (PM + CRM Lead, CRM Lead + Sales, OM + Finance)
  const pmCrmMerged = mergeLegacyRoleTranslations(['PROJECT_MANAGER', 'CRM_LEAD']);
  assert.equal(pmCrmMerged.role_level, 'SPV');
  const pmCrmProj = pmCrmMerged.modules.find((m) => m.module_code === 'PROJECTS')!;
  assert.equal(pmCrmProj.tier_level, 1, 'Strongest tier (1) must win over baseline tier (3)');
  assert.equal(pmCrmProj.data_scope, 'ALL', 'Widest scope (ALL) must win over OWN');
  assert.ok(pmCrmMerged.modules.some((m) => m.module_code === 'CRM' && m.tier_level === 1));
  assert.ok(pmCrmMerged.modules.some((m) => m.module_code === 'SALES' && m.tier_level === 1));
  assert.deepEqual(
    new Set(pmCrmMerged.dashboard_widgets),
    new Set(['DASH_PERSONAL', 'DASH_PROJECTS', 'DASH_CRM'])
  );

  const crmLeadSalesMerged = mergeLegacyRoleTranslations(['SALES', 'CRM_LEAD']);
  const crmMod = crmLeadSalesMerged.modules.find((m) => m.module_code === 'CRM')!;
  assert.equal(crmMod.tier_level, 1);
  assert.equal(crmMod.data_scope, 'ALL');

  const omFinanceMerged = mergeLegacyRoleTranslations(['OPERATIONAL_MANAGER', 'FINANCE']);
  assert.equal(omFinanceMerged.role_level, 'GM');
  assert.deepEqual(
    new Set(omFinanceMerged.dashboard_widgets),
    new Set(['DASH_PERSONAL', 'DASH_INVENTORY', 'DASH_PROJECTS', 'DASH_FINANCE'])
  );
  console.log('✔ 3. Multi-Role Union + Strongest-Tier Wins verified (PM+CRM Lead, OM+Finance, CRM Lead+Sales)');

  // 4. Verify deriveManagedRoleCodes mapping (PROJECTS Tier 3 OWN -> ROLE-STAFF, not ROLE-PM)
  const baselineDerived = deriveManagedRoleCodes({
    modules: staffMerged.modules,
    dashboardWidgets: staffMerged.dashboard_widgets,
    roleLevel: 'STAFF',
  });
  assert.deepEqual(baselineDerived, [RoleCode.STAFF]);

  // 5. Verify syncUserQuickAccess transactional Reconcile & Prune while protecting COMPANY_ADMIN
  const origTransaction = prisma.$transaction;
  const origMembershipFind = prisma.iam_user_company_membership.findFirst;
  const origUserFind = prisma.iam_user.findUnique;
  const origDeptFind = prisma.core_department.findFirst;
  const origOrgMemFind = prisma.core_user_org_membership.findMany;
  const origModAsgFind = prisma.iam_user_module_assignment.findMany;
  const origModAccFind = prisma.iam_user_module_access.findMany;
  const origDashFind = prisma.iam_user_dashboard_access.findMany;
  const origUserRoleFind = prisma.iam_user_role.findMany;
  const origRoleFind = prisma.iam_role.findMany;

  try {
    const companyId = '10000000-0000-0000-0000-000000000001';
    const tenantId = '20000000-0000-0000-0000-000000000001';
    const userId = '30000000-0000-0000-0000-000000000001';

    const roleCatalog = [
      { id: 'r-admin', tenant_id: tenantId, role_code: RoleCode.COMPANY_ADMIN },
      { id: 'r-dir', tenant_id: tenantId, role_code: RoleCode.DIRECTOR },
      { id: 'r-fin', tenant_id: tenantId, role_code: RoleCode.FINANCE },
      { id: 'r-pm', tenant_id: tenantId, role_code: RoleCode.PROJECT_MANAGER },
      { id: 'r-staff', tenant_id: tenantId, role_code: RoleCode.STAFF },
    ];

    let currentUserState: any = {
      id: userId,
      full_name: 'Test User',
      email: 'test@arsalynk.com',
      department_id: null,
      role_level: 'STAFF',
      reports_to_user_id: null,
      job_title: 'Staff',
      active_role_id: 'r-staff',
    };
    let currentUserRoles: Array<{ id: string; user_id: string; role_id: string; company_id: string }> = [
      { id: 'ur-1', user_id: userId, role_id: 'r-admin', company_id: companyId },
      { id: 'ur-2', user_id: userId, role_id: 'r-staff', company_id: companyId },
    ];
    const dashboardState = new Map<string, boolean>();
    const moduleAssignmentsState = new Map<string, any>();
    const moduleAccessState = new Map<string, any>();

    const mockTx: any = {
      iam_user_company_membership: {
        findFirst: async () => ({ id: 'mem-1', company_id: companyId, tenant_id: tenantId, user_id: userId, status: 'ACTIVE' }),
      },
      iam_user: {
        findUnique: async () => ({ ...currentUserState }),
        update: async ({ data }: any) => {
          currentUserState = { ...currentUserState, ...data };
          return currentUserState;
        },
      },
      core_department: {
        findFirst: async () => ({ id: 'dept-fin', company_id: companyId, code: 'FIN', name: 'Finance' }),
      },
      core_user_org_membership: {
        updateMany: async () => ({ count: 0 }),
        upsert: async () => ({}),
        findMany: async () => [],
      },
      master_department: { findFirst: async () => null },
      master_cost_center: { findFirst: async () => null },
      master_employee: { updateMany: async () => ({ count: 0 }) },
      iam_user_dashboard_access: {
        upsert: async ({ where, update, create }: any) => {
          const code = where.company_id_user_id_widget_code.widget_code;
          const enabled = update ? update.is_enabled : create.is_enabled;
          dashboardState.set(code, enabled);
        },
        findMany: async () =>
          Array.from(dashboardState.entries()).map(([widget_code, is_enabled]) => ({
            widget_code,
            is_enabled,
          })),
      },
      iam_user_module_access: {
        upsert: async ({ where, update, create }: any) => {
          const code = where.user_id_module_code.module_code;
          moduleAccessState.set(code, update || create);
        },
        updateMany: async ({ where, data }: any) => {
          if (moduleAccessState.has(where.module_code)) {
            moduleAccessState.set(where.module_code, { ...moduleAccessState.get(where.module_code), ...data });
          }
        },
        findMany: async () =>
          Array.from(moduleAccessState.entries()).map(([module_code, val]) => ({
            module_code,
            allow_read: val.allow_read,
            allow_write: val.allow_write,
          })),
      },
      iam_user_module_assignment: {
        upsert: async ({ where, update, create }: any) => {
          const code = where.company_id_user_id_module_code.module_code;
          moduleAssignmentsState.set(code, { ...(update || create), module_code: code });
        },
        updateMany: async ({ where, data }: any) => {
          if (moduleAssignmentsState.has(where.module_code)) {
            moduleAssignmentsState.set(where.module_code, {
              ...moduleAssignmentsState.get(where.module_code),
              ...data,
            });
          }
        },
        findMany: async () =>
          Array.from(moduleAssignmentsState.values()).filter((m) => m.status === 'ACTIVE'),
      },
      iam_user_role: {
        findMany: async () => [...currentUserRoles],
        deleteMany: async ({ where }: any) => {
          const ids: string[] = where.id.in;
          currentUserRoles = currentUserRoles.filter((r) => !ids.includes(r.id));
        },
        create: async ({ data }: any) => {
          currentUserRoles.push({
            id: data.id,
            user_id: data.user_id,
            role_id: data.role_id,
            company_id: data.company_id,
          });
        },
      },
      iam_role: {
        findMany: async () => roleCatalog,
      },
      iam_assignment_history: {
        create: async () => ({}),
      },
    };

    (prisma as any).$transaction = async (fn: any) => fn(mockTx);
    (prisma.iam_user_company_membership as any).findFirst = mockTx.iam_user_company_membership.findFirst;
    (prisma.iam_user as any).findUnique = mockTx.iam_user.findUnique;
    (prisma.core_user_org_membership as any).findMany = mockTx.core_user_org_membership.findMany;
    (prisma.iam_user_module_assignment as any).findMany = mockTx.iam_user_module_assignment.findMany;
    (prisma.iam_user_module_access as any).findMany = mockTx.iam_user_module_access.findMany;
    (prisma.iam_user_dashboard_access as any).findMany = mockTx.iam_user_dashboard_access.findMany;
    (prisma.iam_user_role as any).findMany = mockTx.iam_user_role.findMany;
    (prisma.iam_role as any).findMany = async ({ where }: any) => {
      if (where?.id?.in) return roleCatalog.filter((r) => where.id.in.includes(r.id));
      return roleCatalog;
    };

    // (a) Upgrade Staff to Finance + Director
    const upgraded = await syncUserQuickAccess({
      companyId,
      tenantId,
      userId,
      presetKey: 'FINANCE',
      dashboardWidgets: ['DASH_PERSONAL', 'DASH_FINANCE', 'DASH_EXECUTIVE'],
    });
    assert.ok(upgraded.roles.includes(RoleCode.FINANCE), 'Must grant FINANCE role');
    assert.ok(upgraded.roles.includes(RoleCode.DIRECTOR), 'Must grant DIRECTOR role from DASH_EXECUTIVE');
    assert.ok(upgraded.roles.includes(RoleCode.COMPANY_ADMIN), 'Must preserve COMPANY_ADMIN role');

    // Force active_role_id to r-fin so we can test active_role_id reconciliation on prune
    currentUserState.active_role_id = 'r-fin';

    // (b) Downgrade back to Baseline Staff -> must prune FINANCE & DIRECTOR while keeping COMPANY_ADMIN & STAFF
    const downgraded = await syncUserQuickAccess({
      companyId,
      tenantId,
      userId,
      presetKey: 'STAFF_BASELINE',
    });
    assert.ok(!downgraded.roles.includes(RoleCode.FINANCE), 'Must prune FINANCE role on downgrade');
    assert.ok(!downgraded.roles.includes(RoleCode.DIRECTOR), 'Must prune DIRECTOR role on downgrade');
    assert.ok(downgraded.roles.includes(RoleCode.STAFF), 'Must retain STAFF baseline role');
    assert.ok(downgraded.roles.includes(RoleCode.COMPANY_ADMIN), 'Must never prune COMPANY_ADMIN');
    assert.notEqual(currentUserState.active_role_id, 'r-fin', 'Must update active_role_id when previous active role is pruned');
    console.log('✔ 4. Quick Access upgrade, role prune, active_role_id reconciliation & COMPANY_ADMIN protection verified');
  } finally {
    (prisma as any).$transaction = origTransaction;
    (prisma.iam_user_company_membership as any).findFirst = origMembershipFind;
    (prisma.iam_user as any).findUnique = origUserFind;
    (prisma.core_department as any).findFirst = origDeptFind;
    (prisma.core_user_org_membership as any).findMany = origOrgMemFind;
    (prisma.iam_user_module_assignment as any).findMany = origModAsgFind;
    (prisma.iam_user_module_access as any).findMany = origModAccFind;
    (prisma.iam_user_dashboard_access as any).findMany = origDashFind;
    (prisma.iam_user_role as any).findMany = origUserRoleFind;
    (prisma.iam_role as any).findMany = origRoleFind;
  }

  console.log('=== ALL MODULAR ORG & DASHBOARD ACCESS TESTS PASSED ===');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
