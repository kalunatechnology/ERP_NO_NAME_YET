/** Q11 regression suite for cross-module safety invariants. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assertNoGenericLifecycleWrite, assertRecordMutable, autoFillRequiredFields } from '../src/utils/crud-factory';
import { requireRole, requireActiveRole, requireCompanyAdmin, enforceSuperAdminReadOnly } from '../src/middlewares/rbac.middleware';
import { requireFinanceRole } from '../src/middleware/sod.middleware';
import { ProjectsService } from '../src/modules/projects/projects.service';
import { RoleCode } from '../src/types/roles';
import { canAccessRoute, canRequestApi, getRouteAccessContract } from '../../frontend-next/lib/access/module-contract';
import { getNavigationEntries } from '../../frontend-next/lib/access/navigation-contract';
import { canPerform } from '../../frontend-next/lib/access/capability-contract';

// This backend build gate deliberately must not import frontend UI utilities.
// Hostinger installs dependencies from backend-express/package.json only, while
// frontend-next owns visual dependencies such as clsx and tailwind-merge.
// Keep the calendar assertions dependency-free and inspect the frontend source
// below, so this gate verifies the contract without requiring a frontend install.
function localDateKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeDateKey(value: string | Date | null | undefined): string {
  if (!value) return '';
  if (typeof value === 'string') {
    const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : localDateKey(date);
}

type Evidence = Record<string, unknown>;

async function scenario(name: string, run: () => Evidence | Promise<Evidence>): Promise<Evidence> {
  const evidence = await run();
  process.stdout.write(`PASS: ${name}\n`);
  return evidence;
}

function invokeMiddleware(middleware: any, user: Record<string, unknown>, moduleAccess?: Record<string, unknown>, path = '/test', method = 'POST'): Promise<unknown> {
  return new Promise((resolve) => {
    middleware(
      { user, moduleAccess, method, originalUrl: path, path },
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
    assert.throws(() => assertNoGenericLifecycleWrite('fin_billing_document', { status: 'APPROVED' }, true), /lifecycle/i);
    assert.throws(() => assertNoGenericLifecycleWrite('fin_payment', { status: 'POSTED' }), /lifecycle/i);
    assert.doesNotThrow(() => assertNoGenericLifecycleWrite('fin_payment', { status: 'DRAFT' }, true));
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
    const [buildSource, seedSource, layoutSource, globalCss, ganttSource] = await Promise.all([
      readFile(`${__dirname}/../scripts/build.js`, 'utf8'),
      readFile(`${__dirname}/../prisma/seed.ts`, 'utf8'),
      readFile(`${__dirname}/../../frontend-next/app/layout.tsx`, 'utf8'),
      readFile(`${__dirname}/../../frontend-next/app/globals.css`, 'utf8'),
      readFile(`${__dirname}/../../frontend-next/components/ui/GanttChart.tsx`, 'utf8'),
    ]);
    assert(buildSource.includes("'tests/q11-system-guardrails.ts'"), 'Q11 is not enforced by the build');
    assert(seedSource.includes("process.env.NODE_ENV === 'production'"), 'Production seed guard is missing');
    assert(!`${layoutSource}${globalCss}${ganttSource}`.includes('fonts.googleapis.com'), 'Build still depends on Google Fonts');
    return { q11_build_gate: true, production_demo_seed: 'blocked', external_font_dependency: false };
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
    assert.deepEqual(await ProjectsService.taskAssignmentAccessWhere(pm, 'company-a', pmDb), {
      main_task_id: { in: ['main-a'] },
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

    const [appSource, routesSource, schemaSource, assignmentMigration] = await Promise.all([
      readFile(`${__dirname}/../src/app.ts`, 'utf8'),
      readFile(`${__dirname}/../src/modules/projects/projects.routes.ts`, 'utf8'),
      readFile(`${__dirname}/../prisma/schema.prisma`, 'utf8'),
      readFile(`${__dirname}/../prisma/migrations/20260916120000_project_assignment_contract/migration.sql`, 'utf8'),
    ]);
    assert(appSource.includes("methods: ['POST']"), 'Staff Daily Task create allow-list is missing');
    assert(appSource.includes("methods: ['PUT', 'PATCH', 'DELETE']"), 'Staff must retain full CRUD for owned Daily Tasks');
    assert(!appSource.includes("{ path: /\\/api\\/v1\\/projects\\/weekly-tasks\\/?$/, methods: ['POST'] }"), 'Staff must not create Weekly Tasks');
    assert(routesSource.includes('accessWhere: async (req) => ProjectsService.dailyTaskAccessWhere'));
    assert(routesSource.includes('accessWhere: async (req) => ProjectsService.taskAssignmentAccessWhere'));
    assert(routesSource.includes('Assignment harus dibuat melalui aksi assign-members'), 'Generic assignment create bypass must remain closed.');
    assert(schemaSource.includes('@@unique([company_id, main_task_id, assignee_id])'));
    assert(assignmentMigration.includes('CREATE UNIQUE INDEX "project_task_assignment_company_id_main_task_id_assignee_id_key"'));
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
    const superAdmin = { id: 'admin', roles: [RoleCode.SUPER_ADMIN], active_role_code: RoleCode.SUPER_ADMIN };
    assert.equal(await invokeMiddleware(enforceSuperAdminReadOnly, superAdmin, undefined, '/core/recent-items/track/'), null);
    assert.equal(await invokeMiddleware(enforceSuperAdminReadOnly, superAdmin, undefined, '/core/sidebar-feed/mark-read/'), null);
    assert.match(String((await invokeMiddleware(enforceSuperAdminReadOnly, superAdmin, undefined, '/projects/projects/') as Error)?.message), /hanya memiliki akses baca/i);
    assert.match(String((await invokeMiddleware(enforceSuperAdminReadOnly, superAdmin, undefined, '/core/recent-items/track/', 'DELETE') as Error)?.message), /hanya memiliki akses baca/i);

    const [requestRoutes, requestService, crmRoutes, projectWbsNode] = await Promise.all([
      readFile(`${__dirname}/../src/modules/core/request.routes.ts`, 'utf8'),
      readFile(`${__dirname}/../src/modules/core/request.service.ts`, 'utf8'),
      readFile(`${__dirname}/../src/modules/crm/crm.routes.ts`, 'utf8'),
      readFile(`${__dirname}/../../frontend-next/components/projects/ProjectWbsNode.tsx`, 'utf8'),
    ]);
    assert(requestRoutes.includes("'/:id/validate-om', requireActiveRole(RoleCode.OPERATIONAL_MANAGER)"));
    assert(requestRoutes.includes("'/:id/disburse', requireActiveRole(RoleCode.FINANCE)"));
    assert(requestRoutes.includes("'/:id/verify-lpj-om', requireActiveRole(RoleCode.OPERATIONAL_MANAGER)"));
    assert(crmRoutes.includes("'/opportunities/:id/executive-override', requireActiveRole(RoleCode.DIRECTOR)"));
    assert(requestService.includes('instance.created_by_id !== requesterUserId'));
    assert(
      projectWbsNode.includes('const canCreateDaily = !isPM && isWeeklyPic;'),
      'Daily Task create UI must be restricted to the Weekly Task owner',
    );
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
    const adminRoles = ['ROLE-SUPER-ADMIN', 'ROLE-COMPANY-ADMIN'];
    const operationalRoles = ['ROLE-DIRECTOR', 'ROLE-OM', 'ROLE-PM', 'ROLE-SUPERVISOR', 'ROLE-CRM-LEAD', 'ROLE-SALES', 'ROLE-FINANCE', 'ROLE-STAFF'];
    assert.equal(getRouteAccessContract('/administration')?.module, null);
    for (const activeRoleCode of adminRoles) {
      assert.equal(canAccessRoute({ pathname: '/administration', activeRoleCode, enabledModules: [] }), true, `${activeRoleCode} must reach administration without an operational module`);
    }
    for (const activeRoleCode of operationalRoles) {
      assert.equal(canAccessRoute({ pathname: '/administration', activeRoleCode, enabledModules: ['ANALYTICS', 'CORE', 'PROJECTS'], delegatedModules: ['ANALYTICS'] }), false, `${activeRoleCode} must not receive an admin page through delegation`);
    }
    const allEnabled = ['ANALYTICS', 'PROJECTS', 'CRM', 'FINANCE', 'REPORTING'];
    const expectedBase: Record<string, string[]> = {
      'ROLE-SUPER-ADMIN': ['/dashboard', '/administration', '/reporting', '/resources'],
      'ROLE-COMPANY-ADMIN': ['/dashboard', '/administration', '/reporting', '/resources'],
      'ROLE-DIRECTOR': ['/dashboard', '/projects', '/finance', '/crm', '/reporting', '/resources'],
      'ROLE-OM': ['/dashboard', '/projects', '/tasks', '/reporting'],
      'ROLE-PM': ['/dashboard', '/projects', '/tasks', '/crm', '/reporting'],
      'ROLE-SUPERVISOR': ['/dashboard', '/projects', '/tasks', '/reporting'],
      'ROLE-STAFF': ['/dashboard', '/projects', '/tasks', '/reporting'],
      'ROLE-FINANCE': ['/dashboard', '/finance', '/reporting'],
      'ROLE-CRM-LEAD': ['/dashboard', '/crm', '/reporting'],
      'ROLE-SALES': ['/dashboard', '/crm', '/reporting'],
    };
    for (const [activeRoleCode, expected] of Object.entries(expectedBase)) {
      const access = { activeRoleCode, enabledModules: allEnabled, isSuperAdmin: activeRoleCode === 'ROLE-SUPER-ADMIN' };
      const actual = getNavigationEntries(access).map((item: any) => item.href);
      assert.deepEqual(actual, expected, `${activeRoleCode}: navigation must match enabled page contracts`);
      actual.forEach((pathname) => assert.equal(canAccessRoute({ pathname, ...access }), true));
    }
    assert.deepEqual(getNavigationEntries({ activeRoleCode: 'ROLE-STAFF', enabledModules: ['REPORTING'] }).map((item: any) => item.href), ['/dashboard', '/reporting']);
    assert.deepEqual(getNavigationEntries({ activeRoleCode: 'ROLE-STAFF', enabledModules: ['FINANCE'], delegatedModules: ['FINANCE'] }).map((item: any) => item.href), ['/dashboard', '/finance']);
    assert(!getNavigationEntries({ activeRoleCode: 'ROLE-PM', enabledModules: ['PROJECTS'], delegatedModules: ['PROJECTS'] }).some((item: any) => item.href === '/administration'));
    assert.equal(canPerform('finance:operate', 'ROLE-SUPER-ADMIN'), false);
    assert.equal(canPerform('finance:operate', 'ROLE-FINANCE'), true);
    assert.equal(canPerform('project:create', 'ROLE-SUPER-ADMIN'), false);
    assert.equal(canPerform('project:create', 'ROLE-PM'), true);
    assert.equal(normalizeDateKey('2026-09-10T00:00:00.000Z'), '2026-09-10');
    assert.equal(normalizeDateKey('2026-09-10'), '2026-09-10');
    assert.equal(localDateKey(new Date(2026, 8, 10, 0, 30)), '2026-09-10');
    const [contract, appShell, sidebar, topbar, commandPalette, axiosSource, crmApi, projectApi, reportingClient, projectClient, tasksClient, dashboardClient, financeClient, taxWorkspace, resourcesClient, feedSource, seedSource, financeRoutes, projectRoutes, profileModal, utilsSource, semanticStyles, errorPage] = await Promise.all([
      readFile(`${__dirname}/../../frontend-next/lib/access/module-contract.ts`, 'utf8'),
      readFile(`${__dirname}/../../frontend-next/components/layout/AppShell.tsx`, 'utf8'),
      readFile(`${__dirname}/../../frontend-next/components/layout/Sidebar.tsx`, 'utf8'),
      readFile(`${__dirname}/../../frontend-next/components/layout/Topbar.tsx`, 'utf8'),
      readFile(`${__dirname}/../../frontend-next/components/layout/GlobalCommandPalette.tsx`, 'utf8'),
      readFile(`${__dirname}/../../frontend-next/lib/api/axios.ts`, 'utf8'),
      readFile(`${__dirname}/../../frontend-next/lib/api/crm.api.ts`, 'utf8'),
      readFile(`${__dirname}/../../frontend-next/lib/api/project.api.ts`, 'utf8'),
      readFile(`${__dirname}/../../frontend-next/app/(app)/reporting/ReportingClient.tsx`, 'utf8'),
      readFile(`${__dirname}/../../frontend-next/app/(app)/projects/ProjectsClient.tsx`, 'utf8'),
      readFile(`${__dirname}/../../frontend-next/app/(app)/tasks/TasksClient.tsx`, 'utf8'),
      readFile(`${__dirname}/../../frontend-next/app/(app)/dashboard/DashboardClient.tsx`, 'utf8'),
      readFile(`${__dirname}/../../frontend-next/app/(app)/finance/FinanceClient.tsx`, 'utf8'),
      readFile(`${__dirname}/../../frontend-next/components/finance/ProjectTaxWorkspace.tsx`, 'utf8'),
      readFile(`${__dirname}/../../frontend-next/app/(app)/resources/ResourcesClient.tsx`, 'utf8'),
      readFile(`${__dirname}/../../frontend-next/lib/api/feed.api.ts`, 'utf8'),
      readFile(`${__dirname}/../prisma/seed.ts`, 'utf8'),
      readFile(`${__dirname}/../src/modules/finance/finance.routes.ts`, 'utf8'),
      readFile(`${__dirname}/../src/modules/projects/projects.routes.ts`, 'utf8'),
      readFile(`${__dirname}/../../frontend-next/components/ui/UserProfileSettingsModal.tsx`, 'utf8'),
      readFile(`${__dirname}/../../frontend-next/lib/utils.ts`, 'utf8'),
      readFile(`${__dirname}/../../frontend-next/lib/ui/semantic-styles.ts`, 'utf8'),
      readFile(`${__dirname}/../../frontend-next/app/error/[code]/page.tsx`, 'utf8'),
    ]);
    const reportTabAccess = await readFile(`${__dirname}/../../frontend-next/lib/access/report-tab-access.ts`, 'utf8');
    const administrationPage = await readFile(`${__dirname}/../../frontend-next/app/(app)/administration/page.tsx`, 'utf8');
    const navigationContract = await readFile(`${__dirname}/../../frontend-next/lib/access/navigation-contract.ts`, 'utf8');
    const administrationClient = await readFile(`${__dirname}/../../frontend-next/components/administration/AccessAdministration.tsx`, 'utf8');
    const authApi = await readFile(`${__dirname}/../../frontend-next/lib/api/auth.api.ts`, 'utf8');
    const serverSource = await readFile(`${__dirname}/../src/server.ts`, 'utf8');
    const coreRoutes = await readFile(`${__dirname}/../src/modules/core/core.routes.ts`, 'utf8');
    const reportingAccessRoutes = await readFile(`${__dirname}/../src/modules/reporting/reporting.routes.ts`, 'utf8');
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
    assert(sidebar.includes('getNavigationEntries({') && navigationContract.includes('{ href: "/administration", label: "Company & Access"') && navigationContract.includes('{ href: "/administration", label: "User & Access"'), 'Admin navigation must open administration, not the repository.');
    assert(administrationPage.includes('<AccessAdministration />') && !resourcesClient.includes('<AccessAdministration />'), 'Administration and repository must be separate pages.');
    assert(administrationClient.includes('"X-Company-ID": "all"') && administrationClient.includes('"X-Company-ID": contextCompany'), 'Super Admin company catalog and module actions must use explicit scopes.');
    assert(axiosSource.includes('const explicitCompany = config.headers?.["X-Company-ID"]'), 'An explicit company scope must not be overwritten by localStorage.');
    assert(authApi.includes('"/api/v1/auth/me/", { headers: { "X-Company-ID": "" } }'), 'Profile refresh must not inherit a stale company header.');
    assert(authApi.includes('timeout: 15_000, headers: { "X-Company-ID": "" }') && authApi.includes('err.code === "ECONNABORTED"'), 'Login must isolate stale company scope and distinguish timeout from invalid credentials.');
    assert(serverSource.includes('await prisma.$connect();') && serverSource.includes('await prisma.$queryRaw`SELECT 1`;'), 'Startup must verify a real database query before listening for login traffic.');
    assert(axiosSource.includes('const publicTokenLogin =') && axiosSource.includes('&& !publicTokenLogin'), 'Public token login must not inherit an old bearer token or mutation idempotency header.');
    assert(coreRoutes.includes('req.user?.active_role_code === RoleCode.COMPANY_ADMIN'), 'Company Admin module mutation must require the active role.');
    assert(reportingAccessRoutes.includes('req.user?.active_role_code === RoleCode.SUPERVISOR') && reportingAccessRoutes.includes('const staffOnly = personalOnly(req);'), 'Supervisor and Staff must share personal reporting scope.');
    assert(reportingAccessRoutes.includes('user_id: userId') && reportingAccessRoutes.includes('employee_id: employeeId'), 'Attendance projection must use an explicit user-to-employee identity.');
    assert(reportingAccessRoutes.includes("'/operational-summary', requireActiveRole(RoleCode.OPERATIONAL_MANAGER)"), 'Company-wide operational report must require OM active role.');
    assert(reportingClient.includes('sectionErrors: { attendance: attendanceResult.error') && reportingClient.includes('if (data.sectionErrors.attendance)'), 'Attendance failure must not masquerade as zero activity or blank the periodic report.');
    assert(commandPalette.includes('canAccessRoute({'), 'Command palette must hide routes that the active context cannot open.');
    assert(topbar.includes('{canOpenReporting && (') && topbar.includes("router.push('/reporting?tab=attendance')"), 'Topbar must hide Reporting shortcuts from unauthorized roles.');
    assert(axiosSource.includes('ERR_FRONTEND_MODULE_ACCESS'));
    assert(axiosSource.includes('canRequestApi(config.url || ""'));
    assert(!crmApi.includes('enabled.size === 0'), 'Empty entitlements must not be interpreted as allow-all.');
    assert(crmApi.includes('{ decision: "ACCEPTED" }') && crmApi.includes('decision: "REJECTED"'), 'CRM customer decision payload must follow the Sales API contract.');
    assert(!projectApi.includes('api.post("/api/v1/projects/tasks/"'), 'WBS create failures must not fall back into the generic task model.');
    assert(projectApi.includes('/assign-members'), 'Main Task assignment must use the registered backend action spelling.');
    assert(projectApi.includes('/api/v1/projects/assignable-users/'), 'Project Assignment must use the PM-scoped assignee catalog, not the admin Accounts API.');
    assert(!projectApi.includes('/api/v1/accounts/users/?page_size=200'), 'PM assignment must not depend on an admin-only Accounts endpoint.');
    assert(projectApi.includes('DAILY_TASK_STATUS_ALIASES'), 'Daily Task write adapter must normalize legacy UI statuses.');
    assert(projectApi.includes('Do not spread a UI object here'), 'Daily Task update payload must be allow-listed.');
    assert(projectApi.includes('assignee: payload.assignee_id || undefined'), 'Weekly Task must send an assignee user ID, not a display name.');
    assert(!projectApi.includes('assignee_name: payload.assignee_name'), 'Weekly Task payload must not send the frontend-only assignee name.');
    assert(reportingClient.includes('canRequestApi(\'/api/v1/finance/project-cost-entries/\''));
    assert(reportingClient.includes('Laporan Aktivitas dan Kehadiran Saya'));
    assert(!projectClient.includes('/api/v1/finance/project-fundings/?project_id='), 'Project workspace must not probe Finance before its PROJECTS funding endpoint.');
    assert(tasksClient.includes('normalizeDateKey(i.task.planned_date) === today'), 'Daily Tasks must compare normalized calendar dates.');
    assert(tasksClient.includes('const creatableProjects = useMemo') && tasksClient.includes('mainTask.assignments'), 'Daily Task create scope must follow Main Task assignment.');
    assert(tasksClient.includes('{canCreateDailyTask && <button'), 'Daily Task create action must be hidden when no valid backend scope exists.');
    assert(tasksClient.includes('{canOpenReporting && <Link'), 'Daily Tasks must not advertise an unauthorized Reporting route.');
    assert(tasksClient.includes('Task Submission') && tasksClient.includes('pendingSubmissionCount'), 'Daily Task submission must be an explicit user-journey section.');
    assert(tasksClient.includes('getApiErrorDetail(error'), 'Daily Task failures must surface the backend validation detail.');
    assert(!tasksClient.includes('new Date().toISOString().split("T")[0]'), 'Daily Tasks must not derive local today from UTC.');
    assert(utilsSource.includes('export function localDateKey') && utilsSource.includes('export function normalizeDateKey'), 'Frontend calendar helpers are missing.');
    assert(financeClient.includes('endpoint: "/api/v1/assets/assets"'), 'Finance Assets tab must be entitlement-aware.');
    assert(financeClient.includes('/project-fundings/${selectedFunding.id}/draw/'), 'Funding draw must use the backend FSM action.');
    assert(financeClient.includes('/billing-documents/${selectedBillForPay.id}/create-payment'), 'AP payment must use the atomic backend command.');
    assert(financeClient.includes('/project-cost-entries/${entry.id}/post-to-wip'), 'WIP posting must use the named backend command.');
    assert(financeClient.includes('/billing-proposals/${proposal.id}/issue-billing-document'), 'Billing issuance must use the named backend command.');
    assert(financeClient.includes('organization_type=DIVISION') && financeClient.includes('division.organization_name'), 'Finance division options must use the Core organization contract.');
    assert(!financeClient.includes('PENDING_MATCH'));
    assert(!financeClient.includes('PO-2026-041'));
    assert(!financeClient.includes('GRN-2026-033'));
    assert(financeRoutes.includes("'/party-options'"));
    assert(financeRoutes.includes("'/payments/:id/execute'"));
    assert(projectRoutes.includes("'/dashboard/financial-summary'"));
    assert(projectRoutes.includes("Status Daily Task tidak valid."), 'Daily Task creation must reject statuses outside the command contract.');
    assert(projectRoutes.includes('existingProjectMember?.employee_id'), 'Timesheet identity must retain the explicit project-member migration fallback.');
    assert(projectRoutes.includes("'Akun user belum terhubung dengan data employee.'"), 'Missing employee identity must fail closed with an actionable message.');
    assert(profileModal.includes('current_password'));
    assert(profileModal.includes('api.patch("/api/v1/auth/profile"'));
    assert(projectClient.includes('"executive", "om", "pm", "finance"'), 'Project financial visibility must use the normalized executive role.');
    assert(
      projectClient.includes('canPerform("project:create", userRole)')
        && projectClient.includes('canPerform("project:update", userRole)')
        && projectClient.includes('{canCreateProject && (')
        && projectClient.includes('{canUpdateProject && ('),
      'Staff Project workspace must gate project-level mutations through the canonical role policy.',
    );
    assert(projectClient.includes('userRole === "staff" ? [') && projectClient.includes('Task Terkait Saya'), 'Staff Project workspace must use its compact assigned-task view.');
    assert(projectClient.includes('mainTask.assignments') && projectClient.includes('activeUserId'), 'Staff Project hierarchy must be assignment scoped.');
    assert(taxWorkspace.includes('/api/v1/finance/tax-transactions/projection?page_size=200'));
    assert(taxWorkspace.includes('const INITIAL_TAX_TRANSACTIONS: TaxTransaction[] = [];'), 'Tax workspace must not ship production-looking local transactions.');
    assert(
      resourcesClient.includes('const accessibleEntities = useMemo')
        && resourcesClient.includes('canRequestApi(entity.endpoint, accessContext)')
        && resourcesClient.includes('visibleEntities.find((entity) => entity.id === selectedEntityId) ?? visibleEntities[0]')
        && !resourcesClient.includes('REPOSITORY_ENTITIES[0]'),
      'Data Explorer must filter API resources before fetching.',
    );
    assert(feedSource.includes('canRequestApi("/api/v1/inventory/stock-balances/"'));
    assert(errorPage.includes('Terlalu Banyak Permintaan') && errorPage.includes('Layanan Sedang Tidak Tersedia'));
    assert(errorPage.includes('text-[#2649B3]') && !errorPage.includes('#059669'), 'Error pages must follow the current blue visual contract.');
    assert(utilsSource.includes('getStatusStyle(status)'), 'Status styling must delegate to the canonical presentation contract.');
    assert(semanticStyles.includes('getCategoryStyle') && semanticStyles.includes('getStatusStyle'), 'Canonical status/category presentation registry is missing.');
    assert(dashboardClient.indexOf('Tugas Operasional Hari Ini') < dashboardClient.indexOf('<CompletionRateCard rates={industryRates}'), 'PM dashboard order must place personal tasks before completion rate.');
    const pmDashboardSource = dashboardClient.slice(dashboardClient.indexOf('function PMDashboard'), dashboardClient.indexOf('function FinanceDashboard'));
    assert(!pmDashboardSource.includes('/dashboard/financial-summary'), 'PM dashboard must not request Finance-style cost projections.');
    assert(!pmDashboardSource.includes('BudgetCheckStatusCard'), 'PM dashboard must not render the Finance budget widget.');
    assert(!pmDashboardSource.includes('TopExpensesBarChart') && !pmDashboardSource.includes('Tren Biaya Bulanan Proyek'), 'PM dashboard must not render Finance analytics.');
    assert(!pmDashboardSource.includes('Daftar Proyek'), 'PM dashboard project list belongs on the Project page only.');
    assert(pmDashboardSource.indexOf('Overview Proyek Saya') < pmDashboardSource.indexOf('ProjectDistributionGauge'), 'Project distribution must follow the PM overview.');
    assert(!projectClient.includes('<TopExpensesBarChart'), 'Project workspace must not duplicate Finance expense analytics.');
    assert(projectClient.includes('if (!selectedId || !canViewFinancials)'), 'Project financial background requests must be suppressed for non-financial roles.');
    assert(dashboardClient.includes('Task Submission') && dashboardClient.includes('pendingSubmissions'), 'Staff dashboard must expose the submission stage explicitly.');
    assert(dashboardClient.includes('label="User & Role"') && !dashboardClient.includes("window.location.assign('/resources')"), 'Company Admin dashboard actions must open Administration, not Data Explorer.');
    for (const legacyGreen of ['#22C55E', '#16A34A', '#166534', '#5f8f35', 'bg-emerald-', 'text-emerald-']) {
      assert(!`${dashboardClient}${projectClient}${tasksClient}${financeClient}${feedSource}`.includes(legacyGreen), `Legacy green visual token remains: ${legacyGreen}`);
    }
    const [timesheetForm, timesheetTable, overtimeWidget, dashboardRoutes, reportingRoutes, budgetCard, employeeMappingMigration] = await Promise.all([
      readFile(`${__dirname}/../../frontend-next/components/staff/StaffTimesheetForm.tsx`, 'utf8'),
      readFile(`${__dirname}/../../frontend-next/components/staff/StaffTimesheetTable.tsx`, 'utf8'),
      readFile(`${__dirname}/../../frontend-next/components/staff/StaffOvertimeSummary.tsx`, 'utf8'),
      readFile(`${__dirname}/../src/modules/dashboard/dashboard.routes.ts`, 'utf8'),
      readFile(`${__dirname}/../src/modules/reporting/reporting.routes.ts`, 'utf8'),
      readFile(`${__dirname}/../../frontend-next/components/ui/BudgetCheckStatusCard.tsx`, 'utf8'),
      readFile(`${__dirname}/../prisma/migrations/20260911090000_backfill_employee_user_mapping/migration.sql`, 'utf8'),
    ]);
    for (const forbiddenField of ['employee_id:', 'hourly_rate:', 'amount:', 'approval_status:']) {
      assert(!timesheetForm.includes(forbiddenField), `Staff timesheet form must not send server-owned field ${forbiddenField}`);
    }
    assert(timesheetForm.includes('createStaffTimesheet({') && timesheetForm.includes('overtime_hours: overtime'));
    assert(timesheetTable.includes('getStaffTimesheets({ page, page_size: PAGE_SIZE })'));
    assert(overtimeWidget.includes('getStaffOvertimeSummary()'));
    assert(tasksClient.includes('<StaffTimesheetForm') && tasksClient.includes('<StaffTimesheetTable'));
    assert(dashboardClient.includes('initialSummary={overtimeSummary}'), 'Staff dashboard must render its BFF overtime summary.');
    assert(dashboardRoutes.includes('FROM master_employee e') && dashboardRoutes.includes('UNION'), 'Dashboard overtime identity must use permanent and explicit transitional mappings.');
    assert(dashboardRoutes.includes('e.user_id::text = ${userId}::text'), 'Dashboard raw SQL must not compare TEXT employee user_id with a UUID parameter.');
    assert(dashboardRoutes.includes('ts.employee_id::text IN'), 'Dashboard overtime employee identity must be normalized across legacy DB column types.');
    const staffDashboardProjection = dashboardRoutes.slice(dashboardRoutes.indexOf('if (isStaff)'), dashboardRoutes.indexOf('NON STAFF'));
    assert(!staffDashboardProjection.includes('= ${userId}::uuid'), 'Staff dashboard projection must not force mixed legacy identity columns to UUID.');
    assert(employeeMappingMigration.includes('SET "employee_id" = employee."id"') && !employeeMappingMigration.includes('SET "employee_id" = employee."id"::text'), 'Employee mapping migration must assign UUID to UUID without a text cast.');
    assert(seedSource.includes("'FINANCE', 'REPORTING'"), 'Ghost test company must enable the Staff self-reporting module.');
    assert(reportingRoutes.includes("'/operational-summary'"), 'OM operational reporting projection is missing.');
    assert(reportTabAccess.includes('om: ["operational", "periodic", "attendance"]')
      && reportingClient.includes('canOpenReportTab(tab.id, userRole, requestAccess)'),
      'OM must not receive executive or Project P&L reporting tabs.');
    assert(reportTabAccess.includes('if (tabId === "executive") return canReadProjects && canReadFinance;'),
      'Executive finance metrics must not be shown when their Finance source is unavailable.');
    assert(reportingClient.includes("includeOperational: userRole === 'om'"), 'Operational projection must only be requested for the OM journey.');
    assert(!projectClient.includes('<TopExpensesBarChart'), 'Project workspace must not render project expense analytics for PM or OM.');
    assert(!tasksClient.includes('<span>+ Buat Task Harian</span>'), 'Daily Task action must not render duplicate plus symbols.');
    assert(budgetCard.includes('Anggaran Proyek') && !budgetCard.includes('Material Budget'), 'Shared Finance budget card must use module-neutral labels.');
    return {
      route_registry: 'centralized',
      tasks_module: 'PROJECTS',
      active_role: 'enforced',
      invalid_entitlement: 'fail-closed',
      cross_module_loaders: 'preflight-gated',
      unauthorized_network_request: 'cancelled',
      payload_contracts: 'aligned',
      false_success_fallbacks: 'blocked',
    };
  }));

  process.stdout.write(`${JSON.stringify({ status: 'PASS', suite: 'Q11 System Guardrails', scenarios: results }, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
