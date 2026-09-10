/** Q11 regression suite for cross-module safety invariants. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assertRecordMutable, autoFillRequiredFields } from '../src/utils/crud-factory';
import { requireRole, requireActiveRole, requireCompanyAdmin } from '../src/middlewares/rbac.middleware';
import { requireFinanceRole } from '../src/middleware/sod.middleware';
import { ProjectsService } from '../src/modules/projects/projects.service';
import { RoleCode } from '../src/types/roles';
import { canAccessRoute, canRequestApi, getRouteAccessContract } from '../../frontend-next/lib/access/module-contract';

type Evidence = Record<string, unknown>;

async function scenario(name: string, run: () => Evidence | Promise<Evidence>): Promise<Evidence> {
  const evidence = await run();
  process.stdout.write(`PASS: ${name}\n`);
  return evidence;
}

function invokeMiddleware(middleware: any, user: Record<string, unknown>, moduleAccess?: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve) => {
    middleware(
      { user, moduleAccess, method: 'POST', originalUrl: '/test', path: '/test' },
      {},
      (error?: unknown) => resolve(error ?? null),
    );
  });
}

async function main(): Promise<void> {
  const feature = await readFile(`${__dirname}/features/q11-system-guardrails.feature`, 'utf8');
  const names = [
    'Missing approval state never becomes approved',
    'Missing business identity is rejected',
    'Terminal finance records remain immutable',
    'Quick login stays isolated from operational data',
    'Production build enforces safety checks',
    'Active role is the authorization context',
    'Project task access follows management and ownership',
    'Sensitive workflow actions require the exact active role',
    'Frontend routes and requests share the backend module contract',
  ];
  names.forEach((name) => assert(feature.includes(`Scenario: ${name}`), `Missing feature scenario: ${name}`));

  const results: Evidence[] = [];

  results.push(await scenario(names[0], () => {
    const normalized = autoFillRequiredFields('sales_order_change_request', {
      change_type: 'SCOPE',
      change_reason: 'Q11 guardrail verification',
    });
    assert.equal(normalized.approval_status, 'PENDING');
    assert.notEqual(normalized.approval_status, 'APPROVED');
    return { default_approval_status: normalized.approval_status };
  }));

  results.push(await scenario(names[1], async () => {
    assert.throws(
      () => autoFillRequiredFields('project_project', {}),
      /Field project_name wajib diisi/,
    );
    assert.throws(
      () => autoFillRequiredFields('project_project', { name: 'Valid project name' }),
      /Field customer_name wajib diisi/,
    );
    assert.throws(() => autoFillRequiredFields('project_main_task', {}), /Field name wajib diisi/);
    assert.throws(() => autoFillRequiredFields('project_weekly_task', {}), /Field target_description wajib diisi/);
    assert.throws(() => autoFillRequiredFields('project_daily_task', {}), /Field title wajib diisi/);
    const projectRoutes = await readFile(`${__dirname}/../src/modules/projects/projects.routes.ts`, 'utf8');
    for (const syntheticValue of ['Untitled Project', "'Main Task'", "'Aktivitas Harian'", "'09.00 - 12.00'", "'Melika (Lead PM)'"]) {
      assert(!projectRoutes.includes(syntheticValue), `Project route still persists synthetic value ${syntheticValue}`);
    }
    return { synthetic_project_name: false, synthetic_customer_name: false, synthetic_task_fields: false };
  }));

  results.push(await scenario(names[2], async () => {
    assert.throws(() => assertRecordMutable('fin_billing_document', { status: 'POSTED' }), /immutable/);
    assert.throws(() => assertRecordMutable('fin_billing_document', { status: 'DRAFT', payment_status: 'PAID' }), /immutable/);
    assert.doesNotThrow(() => assertRecordMutable('fin_billing_document', { status: 'DRAFT' }));
    assert.doesNotThrow(() => assertRecordMutable('project_project', { status: 'CLOSED' }));
    const crudSource = await readFile(`${__dirname}/../src/utils/crud-factory.ts`, 'utf8');
    const bulkDeleteSection = crudSource.split('// 4. Bulk Delete')[1]?.split('// 5. List')[0] ?? '';
    assert(bulkDeleteSection.includes('assertRecordMutable(modelNameStr, existing)'), 'Bulk delete bypasses finance immutability');
    return { posted_finance: 'blocked', paid_finance: 'blocked', draft_finance: 'mutable', bulk_delete_guarded: true };
  }));

  results.push(await scenario(names[3], async () => {
    const [loginSource, projectApiSource] = await Promise.all([
      readFile(`${__dirname}/../../frontend-next/app/login/page.tsx`, 'utf8'),
      readFile(`${__dirname}/../../frontend-next/lib/api/project.api.ts`, 'utf8'),
    ]);
    assert(loginSource.includes('{isLocalDev && ('), 'Quick-login panel must remain local-only');
    assert(loginSource.includes('DummyPass123!'), 'Approved local quick-login fixture is missing');
    assert(!projectApiSource.includes('DEFAULT_TEAM_MEMBERS'), 'Operational project API contains a demo team fallback');
    assert(!projectApiSource.includes('Budi Santoso'));
    assert(!projectApiSource.includes('Ahmad Rizki'));
    assert(!projectApiSource.includes('Rina Sari'));
    return { quick_login: 'local-only', operational_team_fallback: false };
  }));

  results.push(await scenario(names[4], async () => {
    const [buildSource, seedSource] = await Promise.all([
      readFile(`${__dirname}/../scripts/build.js`, 'utf8'),
      readFile(`${__dirname}/../prisma/seed.ts`, 'utf8'),
    ]);
    assert(buildSource.includes("'tests/q11-system-guardrails.ts'"), 'Q11 is not enforced by the build');
    assert(seedSource.includes("process.env.NODE_ENV === 'production'"), 'Production seed guard is missing');
    return { q11_build_gate: true, production_demo_seed: 'blocked' };
  }));

  results.push(await scenario(names[5], async () => {
    const multiRolePm = {
      id: 'user-multi-role',
      roles: [RoleCode.PROJECT_MANAGER, RoleCode.FINANCE],
      active_role_code: RoleCode.PROJECT_MANAGER,
    };
    assert.equal(await invokeMiddleware(requireRole(RoleCode.PROJECT_MANAGER), multiRolePm), null);
    assert.match(String((await invokeMiddleware(requireRole(RoleCode.FINANCE), multiRolePm) as Error)?.message), /role aktif/i);
    assert.match(String((await invokeMiddleware(requireFinanceRole([RoleCode.FINANCE]), multiRolePm) as Error)?.message), /Role aktif/i);

    const assignedAdminInStaffMode = {
      id: 'user-company-admin',
      roles: [RoleCode.COMPANY_ADMIN, RoleCode.STAFF],
      active_role_code: RoleCode.STAFF,
    };
    assert.match(String((await invokeMiddleware(requireCompanyAdmin, assignedAdminInStaffMode) as Error)?.message), /Company Admin/i);

    const delegatedStaff = { id: 'delegated', roles: [RoleCode.STAFF], active_role_code: RoleCode.STAFF };
    assert.equal(await invokeMiddleware(requireRole(RoleCode.PROJECT_MANAGER), delegatedStaff, {
      delegated: true, allowRead: true, allowWrite: true,
    }), null);
    return { assigned_finance_while_pm: 'blocked', assigned_admin_while_staff: 'blocked', explicit_module_delegation: 'preserved' };
  }));

  results.push(await scenario(names[6], async () => {
    const staff = { id: 'staff-a', roles: [RoleCode.STAFF], active_role_code: RoleCode.STAFF };
    assert.deepEqual(await ProjectsService.dailyTaskAccessWhere(staff, 'company-a'), { owner_id: 'staff-a' });

    const pm = { id: 'pm-a', roles: [RoleCode.PROJECT_MANAGER], active_role_code: RoleCode.PROJECT_MANAGER };
    const pmDb = {
      project_member: { findMany: async () => [{ project_id: 'project-a' }] },
      project_project: { findMany: async () => [{ id: 'project-a' }] },
      project_main_task: { findMany: async () => [{ id: 'main-a' }] },
      project_weekly_task: { findMany: async () => [{ id: 'weekly-a' }] },
    };
    assert.deepEqual(await ProjectsService.dailyTaskAccessWhere(pm, 'company-a', pmDb), {
      weekly_task_id: { in: ['weekly-a'] },
    });
    assert.deepEqual(await ProjectsService.projectAccessWhere(pm, 'company-a', pmDb), {
      id: { in: ['project-a'] },
    });

    const superAdmin = { id: 'root', roles: [RoleCode.SUPER_ADMIN], active_role_code: RoleCode.SUPER_ADMIN };
    assert.deepEqual(await ProjectsService.dailyTaskAccessWhere(superAdmin, 'company-a', pmDb), {});

    const foreignOwnerDb = {
      project_daily_task: { findFirst: async () => ({ id: 'daily-a', weekly_task_id: 'weekly-a', owner_id: 'staff-b' }) },
      project_weekly_task: { findFirst: async () => ({ id: 'weekly-a', main_task_id: 'main-a' }) },
      project_main_task: { findFirst: async () => ({ id: 'main-a', project_id: 'project-a' }) },
    };
    await assert.rejects(
      ProjectsService.assertCanOperateDailyTask('daily-a', staff, 'company-a', foreignOwnerDb),
      /hanya dapat diperbarui oleh pemilik/i,
    );

    const [appSource, routesSource] = await Promise.all([
      readFile(`${__dirname}/../src/app.ts`, 'utf8'),
      readFile(`${__dirname}/../src/modules/projects/projects.routes.ts`, 'utf8'),
    ]);
    assert(appSource.includes("methods: ['POST']"), 'Staff Daily Task create allow-list is missing');
    assert(appSource.includes("methods: ['PUT', 'PATCH']"), 'Staff update methods must exclude DELETE');
    assert(routesSource.includes('accessWhere: async (req) => ProjectsService.dailyTaskAccessWhere'));
    assert(routesSource.includes('accessWhere: async (req) => ProjectsService.projectAccessWhere'));
    assert(routesSource.includes("projectsRouter.use('/projects/:id', enforceProjectBoundary)"));
    assert(routesSource.includes("readOnly: true"), 'Generic task-transfer mutation bypass remains enabled');
    return { staff_visibility: 'owner-only', pm_visibility: 'managed-project-only', admin_visibility: 'company-wide', progress: 'owner-only', transfer_crud: 'read-only' };
  }));

  results.push(await scenario(names[7], async () => {
    const delegatedStaff = { id: 'delegated', roles: [RoleCode.STAFF], active_role_code: RoleCode.STAFF };
    const delegatedModule = { delegated: true, allowRead: true, allowWrite: true };
    assert.match(
      String((await invokeMiddleware(requireActiveRole(RoleCode.DIRECTOR), delegatedStaff, delegatedModule) as Error)?.message),
      /role aktif/i,
    );

    const [requestRoutes, requestService, crmRoutes, projectsClient] = await Promise.all([
      readFile(`${__dirname}/../src/modules/core/request.routes.ts`, 'utf8'),
      readFile(`${__dirname}/../src/modules/core/request.service.ts`, 'utf8'),
      readFile(`${__dirname}/../src/modules/crm/crm.routes.ts`, 'utf8'),
      readFile(`${__dirname}/../../frontend-next/app/(app)/projects/ProjectsClient.tsx`, 'utf8'),
    ]);
    assert(requestRoutes.includes("'/:id/validate-om', requireActiveRole(RoleCode.OPERATIONAL_MANAGER)"));
    assert(requestRoutes.includes("'/:id/disburse', requireActiveRole(RoleCode.FINANCE)"));
    assert(requestRoutes.includes("'/:id/verify-lpj-om', requireActiveRole(RoleCode.OPERATIONAL_MANAGER)"));
    assert(crmRoutes.includes("'/opportunities/:id/executive-override', requireActiveRole(RoleCode.DIRECTOR)"));
    assert(requestService.includes('instance.created_by_id !== requesterUserId'));
    assert(projectsClient.includes('const canCreateDaily = isPM || isWeeklyPic;'));
    return {
      delegated_sensitive_action: 'blocked',
      request_approvals: 'active-role-gated',
      executive_override: 'director-only',
      lpj_submitter: 'request-owner-only',
      project_ui: 'aligned-with-backend',
    };
  }));

  results.push(await scenario(names[8], async () => {
    const pmAccess = { enabledModules: ['PROJECTS', 'REPORTING'], activeRoleCode: 'ROLE-PM' };
    assert.equal(getRouteAccessContract('/tasks/weekly')?.module, 'PROJECTS');
    assert.equal(canAccessRoute({ pathname: '/tasks', ...pmAccess }), true);
    assert.equal(canRequestApi('/api/v1/projects/daily-tasks/', pmAccess), true);
    assert.equal(canRequestApi('/api/v1/finance/project-cost-entries/', pmAccess), false);
    assert.equal(canRequestApi('/api/v1/inventory/stock-balances/', pmAccess), false);
    assert.equal(canRequestApi('/api/v1/requests/id/disburse/', { enabledModules: ['REQUESTS'], activeRoleCode: 'ROLE-PM' }), false);
    assert.equal(canRequestApi('/api/v1/requests/id/disburse/', { enabledModules: ['REQUESTS'], activeRoleCode: 'ROLE-FINANCE' }), true);
    const [contract, appShell, sidebar, axiosSource, crmApi, reportingClient, projectClient, financeClient, resourcesClient, feedSource, seedSource] = await Promise.all([
      readFile(`${__dirname}/../../frontend-next/lib/access/module-contract.ts`, 'utf8'),
      readFile(`${__dirname}/../../frontend-next/components/layout/AppShell.tsx`, 'utf8'),
      readFile(`${__dirname}/../../frontend-next/components/layout/Sidebar.tsx`, 'utf8'),
      readFile(`${__dirname}/../../frontend-next/lib/api/axios.ts`, 'utf8'),
      readFile(`${__dirname}/../../frontend-next/lib/api/crm.api.ts`, 'utf8'),
      readFile(`${__dirname}/../../frontend-next/app/(app)/reporting/ReportingClient.tsx`, 'utf8'),
      readFile(`${__dirname}/../../frontend-next/app/(app)/projects/ProjectsClient.tsx`, 'utf8'),
      readFile(`${__dirname}/../../frontend-next/app/(app)/finance/FinanceClient.tsx`, 'utf8'),
      readFile(`${__dirname}/../../frontend-next/app/(app)/resources/ResourcesClient.tsx`, 'utf8'),
      readFile(`${__dirname}/../../frontend-next/lib/api/feed.api.ts`, 'utf8'),
      readFile(`${__dirname}/../prisma/seed.ts`, 'utf8'),
    ]);
    for (const mapping of [
      'prefix: "/tasks", module: "PROJECTS"',
      'prefix: "/reporting", module: "REPORTING"',
      'prefix: "/api/v1/projects", module: "PROJECTS"',
      'prefix: "/api/v1/finance", module: "FINANCE"',
      'prefix: "/api/v1/crm", module: "CRM"',
      'prefix: "/api/v1/assets", module: "ASSETS"',
    ]) assert(contract.includes(mapping), `Canonical frontend contract is missing ${mapping}`);
    assert(contract.includes('activeRoleCode'), 'Canonical contract must evaluate the active role.');
    assert(contract.includes('Dashboard BFF canReadSection deliberately does not accept module delegation'));
    assert(appShell.includes('canAccessRoute({') && !appShell.includes('MODULE_BY_ROUTE'));
    assert(sidebar.includes('canAccessRoute({') && !sidebar.includes('moduleByPath'));
    assert(axiosSource.includes('ERR_FRONTEND_MODULE_ACCESS'));
    assert(axiosSource.includes('canRequestApi(config.url || ""'));
    assert(!crmApi.includes('enabled.size === 0'), 'Empty entitlements must not be interpreted as allow-all.');
    assert(reportingClient.includes('canRequestApi(\'/api/v1/finance/project-cost-entries/\''));
    assert(reportingClient.includes('Laporan Aktivitas dan Kehadiran Saya'));
    assert(!projectClient.includes('/api/v1/finance/project-fundings/?project_id='), 'Project workspace must not probe Finance before its PROJECTS funding endpoint.');
    assert(financeClient.includes('endpoint: "/api/v1/assets/assets"'), 'Finance Assets tab must be entitlement-aware.');
    assert(resourcesClient.includes('visibleResources'), 'Data Explorer must filter API resources before fetching.');
    assert(feedSource.includes('canRequestApi("/api/v1/inventory/stock-balances/"'));
    assert(seedSource.includes("'FINANCE', 'REPORTING'"), 'Ghost test company must enable the Staff self-reporting module.');
    return {
      route_registry: 'centralized',
      tasks_module: 'PROJECTS',
      active_role: 'enforced',
      invalid_entitlement: 'fail-closed',
      cross_module_loaders: 'preflight-gated',
      unauthorized_network_request: 'cancelled',
    };
  }));

  process.stdout.write(`${JSON.stringify({ status: 'PASS', suite: 'Q11 System Guardrails', scenarios: results }, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
