import assert from 'node:assert/strict';
import prisma from '../src/config/database';
import { HrService } from '../src/modules/hr/hr.service';
import { hrFinanceRouter, hrRouter } from '../src/modules/hr/hr.routes';

async function runTests() {
  // 1. Overtime calculation: explicit standard_hourly_rate
  const explicitOt = HrService.computeOvertimeAmount(
    { monthly_salary: 5190000, standard_hourly_rate: 40000 },
    3,
  );
  assert.equal(explicitOt.rate, 60000);
  assert.equal(explicitOt.amount, 180000);

  // 2. Overtime calculation: fallback Kepmenaker monthly_salary / 173 * 1.5
  const fallbackOt = HrService.computeOvertimeAmount(
    { monthly_salary: 5190000, standard_hourly_rate: null },
    2,
  );
  assert.equal(fallbackOt.rate, 45000);
  assert.equal(fallbackOt.amount, 90000);

  // 3. Router path verification
  const hrPaths = hrRouter.stack.filter((l: any) => l.route).map((l: any) => l.route.path);
  for (const expected of [
    '/overtimes/my',
    '/payslips/my',
    '/meetings/my',
    '/overtimes',
    '/overtimes/:id/verify',
    '/payroll/draft',
    '/overtimes/:id/approve',
    '/overtimes/:id/reject',
    '/payroll/:id/hr-approve',
    '/employees',
    '/employees/:id',
  ]) {
    assert.ok(hrPaths.includes(expected), `hrRouter missing ${expected}`);
  }

  const finPaths = hrFinanceRouter.stack.filter((l: any) => l.route).map((l: any) => l.route.path);
  assert.ok(finPaths.includes('/payroll/:id/finance-review'));
  assert.ok(finPaths.includes('/payroll/:id/post-gl'));

  // 4. SoD & workflow transition checks for HR-ACC & Finance review (mocked prisma)
  const origExecute = prisma.$executeRawUnsafe;
  const origFindFirst = prisma.fin_payroll_run.findFirst;
  const origUpdate = prisma.fin_payroll_run.update;

  let mockRun: any = {
    id: 'run-1',
    company_id: 'comp-1',
    status: 'DRAFT',
    created_by_id: 'hr-staff-1',
  };

  try {
    (prisma as any).$executeRawUnsafe = async () => 0;
    (prisma.fin_payroll_run as any).findFirst = async () => mockRun;
    (prisma.fin_payroll_run as any).update = async ({ data }: any) => {
      mockRun = { ...mockRun, ...data };
      return mockRun;
    };

    // Self HR-ACC must be rejected (SoD)
    await assert.rejects(
      () => HrService.hrApprovePayrollRun('comp-1', 'run-1', 'hr-staff-1'),
      /tidak boleh melakukan HR-ACC/i,
    );

    // Different HR Tier 1 succeeds -> HR_APPROVED
    const hrApproved = await HrService.hrApprovePayrollRun('comp-1', 'run-1', 'hr-lead-1');
    assert.equal(hrApproved.status, 'HR_APPROVED');

    // Finance REJECT returns run to DRAFT with note
    const rejected = await HrService.financeReviewPayrollRun('comp-1', 'run-1', 'fin-1', 'REJECT', 'Over-budget lembur');
    assert.equal(rejected.status, 'DRAFT');
    assert.equal(rejected.finance_decision_note, 'Over-budget lembur');

    // Re-approve HR then Finance APPROVE -> APPROVED
    await HrService.hrApprovePayrollRun('comp-1', 'run-1', 'hr-lead-1');
    const finApproved = await HrService.financeReviewPayrollRun('comp-1', 'run-1', 'fin-1', 'APPROVE', 'Budget 6100 OK');
    assert.equal(finApproved.status, 'APPROVED');
  } finally {
    (prisma as any).$executeRawUnsafe = origExecute;
    (prisma.fin_payroll_run as any).findFirst = origFindFirst;
    (prisma.fin_payroll_run as any).update = origUpdate;
  }

  console.log('hr-module.unit.ts: ALL PASSED');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
