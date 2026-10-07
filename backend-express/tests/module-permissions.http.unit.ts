import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Request, Response, NextFunction } from 'express';
import prisma from '../src/config/database';
import { env } from '../src/config/env';
import * as auth from '../src/middlewares/auth.middleware';
import { RoleCode } from '../src/types/roles';
import { FinanceHardeningService } from '../src/modules/finance/finance-hardening.service';
import { effectiveModuleOverrides } from '../src/utils/module-permissions';
import { loadUserAccessContext } from '../src/modules/accounts/access-context.service';
import { canPerform } from '../../frontend-next/lib/access/capability-contract';
import { canAccessRoute, canRequestApi } from '../../frontend-next/lib/access/module-contract';
import { getNavigationEntries } from '../../frontend-next/lib/access/navigation-contract';
import { ProjectsService } from '../src/modules/projects/projects.service';

async function main() {
  // All persistence is mocked. Run the real app routing, tenant, entitlement,
  // role, SoD, idempotency and error pipeline without touching any live data.
  const db = prisma as any;
  const companyId = 'company-a', tenantId = 'tenant-a';
  let activeRole: RoleCode = RoleCode.DIRECTOR;
  let override: any = null;
  let companyWrite = true, companyEnabled = true;
  let makerId = 'maker-a';
  let proposalStatus = 'SUBMITTED';
  let costStatus = 'VALIDATED';
  let approvals = 0, postings = 0;
  const companyModules = () => companyEnabled ? [{ module_code: 'FINANCE', allow_write: companyWrite }] : [];
  const permissions = () => effectiveModuleOverrides(companyModules(), override ? [override] : []);
  const grant = (read: boolean, write: boolean) => {
    override = { module_code: 'FINANCE', company_id: companyId, tenant_id: tenantId, allow_read: read, allow_write: write };
  };
  db.$connect = async () => { throw new Error('This test must not connect to a database'); };
  db.$queryRaw = async () => { throw new Error('Unexpected database query'); };
  db.iam_company_module_access.findUnique = async () => ({
    company_id: companyId, tenant_id: tenantId, module_code: 'FINANCE',
    enabled: companyEnabled, allow_read: true, allow_write: companyWrite,
    effective_from: null, effective_until: null,
  });
  db.iam_user_module_access.findUnique = async () => override;
  db.core_idempotency_key.create = async ({ data }: any) => ({ id: crypto.randomUUID(), ...data });
  db.core_idempotency_key.update = async () => ({});
  db.core_audit_event.create = async () => ({});
  db.fin_billing_proposal.count = async () => 1;
  db.fin_billing_proposal.findMany = async () => [{ id: 'proposal-a', status: proposalStatus }];
  db.fin_billing_proposal.findFirst = async ({ where }: any) => {
    assert.equal(where.company_id, companyId);
    return { id: 'proposal-a', created_by_id: makerId, status: proposalStatus };
  };
  db.fin_billing_proposal.update = async ({ data }: any) => {
    approvals++;
    assert.equal(data.approved_by_id, 'checker-a');
    return { id: 'proposal-a', ...data };
  };
  db.fin_project_cost_entry.findFirst = async ({ where }: any) => {
    assert.equal(where.company_id, companyId);
    return { id: 'cost-a', created_by_id: makerId, status: costStatus };
  };
  FinanceHardeningService.postProjectCostEntryToWip = async (_id, _credit, user, company) => {
    assert.equal(user, 'checker-a'); assert.equal(company, companyId);
    postings++;
    return { id: 'cost-a', status: 'POSTED_TO_WIP' } as any;
  };
  (auth as any).authenticate = (req: Request, _res: Response, next: NextFunction) => {
    req.user = {
      id: 'checker-a', email: 'fixture@example.test', full_name: 'Fixture',
      roles: [activeRole], active_role_code: activeRole, is_superuser: false,
      is_staff: false, status: 'ACTIVE', tenant_id: tenantId, company_id: companyId,
      accessible_company_ids: [companyId], enabled_modules: ['FINANCE'],
      module_access: permissions(),
    };
    next();
  };
  (env as any).NODE_ENV = 'test';
  const app = require('../src/app').createApp();
  app.locals.databaseReady = true;
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const send = (path: string, method = 'POST', headers = {}) => fetch(base + path, {
    method, headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID(), ...headers },
    ...(method === 'GET' ? {} : { body: JSON.stringify({ credit_account_id: 'credit-a' }) }),
  });
  const approve = () => send('/finance/billing-proposals/proposal-a/approve');
  const post = () => send('/finance/project-cost-entries/cost-a/post-to-wip');
  try {
    // Default Director preview still applies when Admin has not delegated writes.
    assert.equal((await approve()).status, 403);
    grant(true, true);
    assert.equal((await approve()).status, 200, 'Director full access must approve Billing');
    assert.equal((await post()).status, 200, 'Director full access must pass Finance-only posting guard');
    assert.equal(approvals, 1); assert.equal(postings, 1);

    grant(true, false);
    assert.equal((await send('/finance/billing-proposals', 'GET')).status, 200);
    assert.equal((await approve()).status, 403, 'Read-only must reject writes');
    activeRole = RoleCode.FINANCE;
    assert.equal((await post()).status, 403, 'Read-only override must restrict a Finance role too');

    grant(false, false);
    assert.equal((await send('/finance/billing-proposals', 'GET')).status, 403);
    activeRole = RoleCode.DIRECTOR;
    grant(true, true);
    makerId = 'checker-a';
    assert.equal((await approve()).status, 403, 'Full module access must retain Maker–Checker');
    assert.equal((await post()).status, 403);
    makerId = 'maker-a';
    proposalStatus = 'DRAFT';
    assert.equal((await approve()).status, 400, 'Full access must retain workflow status validation');
    proposalStatus = 'SUBMITTED'; costStatus = 'DRAFT';
    assert.equal((await post()).status, 409);
    costStatus = 'VALIDATED';

    companyWrite = false;
    assert.equal((await approve()).status, 403, 'Company module boundary remains authoritative');
    assert.equal(permissions()[0].allow_write, false);
    companyWrite = true;
    override.company_id = 'company-b';
    assert.equal((await approve()).status, 403, 'Foreign-company override must fail');
    grant(true, true);
    assert.equal((await send('/finance/billing-proposals/proposal-a/approve', 'POST', { 'X-Company-ID': 'company-b' })).status, 403);
    override = null;
    assert.equal((await approve()).status, 403, 'Revocation must restore Director preview on the next request');
    assert.equal(approvals, 1); assert.equal(postings, 1, 'Denied requests must never reach mutations');
    activeRole = RoleCode.STAFF;
    grant(true, true);
    assert.equal((await post()).status, 200, 'Full Admin grant must authorize Staff too');
    activeRole = RoleCode.DIRECTOR;

    // Auth/profile projection and UI follow exactly the same effective grant.
    const companyRow = { module_code: 'FINANCE', allow_write: true };
    grant(true, true);
    const context = await loadUserAccessContext('checker-a', { tenant_id: tenantId, active_role_id: 'director-role' }, {
      assignments: [{ role_id: 'director-role', company_id: companyId }] as any,
      membership: { tenant_id: tenantId, company_id: companyId, status: 'ACTIVE' } as any,
      roleRecords: [{ id: 'director-role', role_code: RoleCode.DIRECTOR }] as any,
      moduleAccess: [companyRow], userModuleAccess: [override], projectDelegated: false,
    });
    assert.deepEqual(context.moduleAccess, [{ module_code: 'FINANCE', allow_read: true, allow_write: true }]);
    for (const role of ['ROLE-DIRECTOR', 'ROLE-FINANCE', 'ROLE-STAFF']) {
      const access = { activeRoleCode: role, enabledModules: ['FINANCE'], moduleAccess: context.moduleAccess, delegatedModules: ['FINANCE'] };
      assert.equal(canPerform('finance:operate', role, access), true);
      assert.equal(canAccessRoute({ pathname: '/finance', ...access }), true);
      assert.equal(canRequestApi('/api/v1/finance/billing-proposals', access), true);
      assert(getNavigationEntries(access).some(item => item.href === '/finance' && !item.label.includes('Preview')));
      const readOnly = { ...access, moduleAccess: [{ module_code: 'FINANCE', allow_read: true, allow_write: false }] };
      assert.equal(canPerform('finance:operate', role, readOnly), false);
      assert.equal(canAccessRoute({ pathname: '/finance', ...readOnly }), true);
      const blocked = { ...access, moduleAccess: [{ module_code: 'FINANCE', allow_read: false, allow_write: false }] };
      assert.equal(canPerform('finance:operate', role, blocked), false);
      assert.equal(canAccessRoute({ pathname: '/finance', ...blocked }), false);
      assert.equal(canAccessRoute({ pathname: '/administration', ...access }), false, 'Finance access must not grant user administration');
    }
    assert.equal(canPerform('finance:operate', 'ROLE-DIRECTOR'), false);
    assert.equal(canPerform('finance:operate', 'ROLE-FINANCE'), true);
    const projectUser = { id: 'director', roles: [RoleCode.DIRECTOR], active_role_code: RoleCode.DIRECTOR,
      module_access: [{ module_code: 'PROJECTS', allow_read: true, allow_write: true }] };
    await ProjectsService.assertCanManageProject(projectUser, 'project-a', companyId, {
      project_project: { findFirst: async ({ where }: any) => { assert.equal(where.company_id, companyId); return { id: 'project-a' }; } },
    });
    await assert.rejects(() => ProjectsService.assertCanManageProject(projectUser, 'project-b', companyId, {
      project_project: { findFirst: async () => null },
    }), /akses ke project/i);
    await ProjectsService.assertCanDelegateProjectAuthority(projectUser, 'project-a', companyId, {
      project_project: { findFirst: async () => ({ id: 'project-a' }) },
    });
    const readOnlyPm = { id: 'pm-a', roles: [RoleCode.PROJECT_MANAGER], active_role_code: RoleCode.PROJECT_MANAGER,
      module_access: [{ module_code: 'PROJECTS', allow_read: true, allow_write: false }] };
    const pmProjectDb = { project_project: { findFirst: async () => ({ id: 'project-a', created_by_id: 'pm-a' }) } };
    await assert.rejects(() => ProjectsService.assertCanManageProject(readOnlyPm, 'project-a', companyId, pmProjectDb), /Admin/);
    const readOnlyAuthority = await ProjectsService.getProjectAuthority(readOnlyPm, 'project-a', companyId, pmProjectDb);
    assert.equal(readOnlyAuthority.can_manage_project, false);
    assert.equal(readOnlyAuthority.can_delete_project, false);
    assert.equal(readOnlyAuthority.can_delegate_supervisor, false);
    assert.deepEqual(effectiveModuleOverrides([], [override]), [{ module_code: 'FINANCE', allow_read: false, allow_write: false }]);
    console.log('PASS: Admin module permissions override roles consistently; read-only, revocation, company scope, workflow and Maker–Checker verified.');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error: Error | undefined) => error ? reject(error) : resolve()));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
