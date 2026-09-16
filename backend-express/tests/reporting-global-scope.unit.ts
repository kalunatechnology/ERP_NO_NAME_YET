import assert from 'node:assert/strict';
import type { Request } from 'express';
import { reportCompanyWhere } from '../src/modules/reporting/reporting.routes';
import { portfolioReadCompanyId } from '../src/modules/projects/projects.routes';
import { RoleCode } from '../src/types/roles';

function request(roles: RoleCode[], companyId: string | null): Request {
  return { user: { roles }, companyId } as unknown as Request;
}

assert.deepEqual(reportCompanyWhere(request([RoleCode.SUPER_ADMIN], null)), {});
assert.deepEqual(reportCompanyWhere(request([RoleCode.SUPER_ADMIN], 'company-a')), { company_id: 'company-a' });
assert.deepEqual(reportCompanyWhere(request([RoleCode.COMPANY_ADMIN], 'company-a')), { company_id: 'company-a' });
assert.throws(() => reportCompanyWhere(request([RoleCode.COMPANY_ADMIN], null)), /Pilih company/);
assert.throws(() => reportCompanyWhere(request([RoleCode.STAFF], null)), /Pilih company/);

process.stdout.write('PASS: reporting Global is Super Admin-only; selected company and ordinary roles remain scoped.\n');

const globalSuperGet = { ...request([RoleCode.SUPER_ADMIN], null), method: 'GET' } as Request;
const globalSuperPost = { ...request([RoleCode.SUPER_ADMIN], null), method: 'POST' } as Request;
assert.equal(portfolioReadCompanyId(globalSuperGet), '');
assert.throws(() => portfolioReadCompanyId(globalSuperPost), /Pilih company/);
assert.throws(() => portfolioReadCompanyId({ ...request([RoleCode.COMPANY_ADMIN], null), method: 'GET' } as Request), /Pilih company/);
assert.equal(portfolioReadCompanyId({ ...request([RoleCode.COMPANY_ADMIN], 'company-a'), method: 'GET' } as Request), 'company-a');
process.stdout.write('PASS: Global project portfolio GET is Super Admin-only; writes and other roles require a company.\n');
