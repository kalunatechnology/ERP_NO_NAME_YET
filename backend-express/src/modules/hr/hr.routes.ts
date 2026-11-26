import { Router } from 'express';
import { requireModuleAccess } from '../../middlewares/entitlement.middleware';
import { requireModuleTier } from '../../middlewares/rbac.middleware';
import { HrService } from './hr.service';
import { PayrollService } from '../finance/payroll.service';

export const hrRouter = Router();
export const hrFinanceRouter = Router();

hrRouter.post('/attachments', async (req, res, next) => {
  try {
    const data = await HrService.saveEvidenceAttachment(req.companyId!, req.user!.id, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

hrRouter.get('/attachments/my/:id', async (req, res, next) => {
  try {
    const id = String(req.params.id || '').replace(/^hr-attachment:/, '');
    const file = await HrService.getEvidenceAttachment(req.companyId!, id, req.user!.id);
    res.setHeader('Content-Type', file.mime_type);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(Buffer.from(file.content));
  } catch (err) { next(err); }
});

hrRouter.get('/attachments/:id', requireModuleTier('HR', 2), async (req, res, next) => {
  try {
    const id = String(req.params.id || '').replace(/^hr-attachment:/, '');
    const file = await HrService.getEvidenceAttachment(req.companyId!, id, req.user!.id, true);
    res.setHeader('Content-Type', file.mime_type);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(Buffer.from(file.content));
  } catch (err) { next(err); }
});

// --- TIER 3 / SELF-SERVICE: Seluruh User Perusahaan (Meeting, Lembur/Request & Slip Gaji Pribadi) ---
hrRouter.post('/overtimes/my', async (req, res, next) => {
  try {
    const data = await HrService.submitOvertime(req.companyId!, req.tenantId ?? null, req.user!.id, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

hrRouter.get('/overtimes/my/rate', async (req, res, next) => {
  try {
    const data = await HrService.getMyOvertimePricing(req.companyId!, req.user!.id);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

hrRouter.get('/overtimes/rate-settings', requireModuleTier('HR', 2), async (req, res, next) => {
  try {
    const data = await HrService.getOvertimeRateSettings(req.companyId!);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

hrRouter.put('/overtimes/rate-settings', requireModuleTier('HR', 1), async (req, res, next) => {
  try {
    const data = await HrService.updateOvertimeRateSettings(req.companyId!, req.tenantId ?? null, req.body);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

hrRouter.get('/overtimes/my', async (req, res, next) => {
  try {
    const results = await HrService.listMyOvertimes(req.companyId!, req.user!.id);
    res.json({ success: true, results });
  } catch (err) {
    next(err);
  }
});

hrRouter.get('/payslips/my', async (req, res, next) => {
  try {
    const results = await HrService.listMyPayslips(req.companyId!, req.user!.id);
    res.json({ success: true, results });
  } catch (err) {
    next(err);
  }
});

hrRouter.get('/meetings/my', async (req, res, next) => {
  try {
    const results = await HrService.listMyMeetings(req.companyId!, req.user!.id);
    res.json({ success: true, results });
  } catch (err) {
    next(err);
  }
});

// --- TIER 2: Anak Buah HR (Operasional & Draft) ---
hrRouter.get('/overtimes', requireModuleTier('HR', 2), async (req, res, next) => {
  try {
    const results = await HrService.listCompanyOvertimes(req.companyId!);
    res.json({ success: true, results });
  } catch (err) {
    next(err);
  }
});

hrRouter.post('/overtimes/:id/verify', requireModuleTier('HR', 2), async (req, res, next) => {
  try {
    const data = await HrService.verifyOvertime(req.companyId!, req.params.id, req.user!.id);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

hrRouter.get('/meetings', requireModuleTier('HR', 2), async (req, res, next) => {
  try {
    const results = await HrService.listCompanyMeetings(req.companyId!);
    res.json({ success: true, results });
  } catch (err) {
    next(err);
  }
});

hrRouter.get('/payroll/runs', requireModuleTier('HR', 2), async (req, res, next) => {
  try {
    const results = await HrService.listPayrollRuns(req.companyId!);
    res.json({ success: true, results });
  } catch (err) {
    next(err);
  }
});

hrRouter.post('/payroll/draft', requireModuleTier('HR', 2), async (req, res, next) => {
  try {
    const run = await HrService.generatePayrollDraft(
      req.companyId!,
      req.tenantId ?? null,
      req.user!.id,
      req.body.period_start,
      req.body.period_end,
    );
    res.status(201).json({ success: true, data: run });
  } catch (err) {
    next(err);
  }
});

// --- TIER 2 & TIER 1: Manajemen Operasional HR & Master Karyawan ---
hrRouter.post('/overtimes/:id/approve', requireModuleTier('HR', 2), async (req, res, next) => {
  try {
    const data = await HrService.approveOvertime(req.companyId!, req.params.id, req.user!.id);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

hrRouter.post('/overtimes/:id/reject', requireModuleTier('HR', 2), async (req, res, next) => {
  try {
    const data = await HrService.rejectOvertime(req.companyId!, req.params.id, req.user!.id, req.body.reason);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// --- TIER 1 EKSKLUSIF: Penyerahan Approval Payroll ke Finance (HR-ACC) ---
hrRouter.post('/payroll/:id/hr-approve', requireModuleTier('HR', 1), async (req, res, next) => {
  try {
    const data = await HrService.hrApprovePayrollRun(req.companyId!, req.params.id, req.user!.id);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

hrRouter.get('/employees', requireModuleTier('HR', 2), async (req, res, next) => {
  try {
    const results = await PayrollService.listEmployees(req.companyId!);
    res.json({ success: true, results });
  } catch (err) {
    next(err);
  }
});

hrRouter.post('/employees', requireModuleTier('HR', 2), async (req, res, next) => {
  try {
    const data = await PayrollService.createEmployee(req.companyId!, req.tenantId ?? null, req.user!.id, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

hrRouter.get('/employee-user-options', requireModuleTier('HR', 2), async (req, res, next) => {
  try {
    const results = await PayrollService.listUnlinkedEmployeeUsers(req.companyId!);
    res.json({ success: true, results });
  } catch (err) {
    next(err);
  }
});

hrRouter.get('/cost-centers', requireModuleTier('HR', 2), async (req, res, next) => {
  try {
    const results = await PayrollService.listEmployeeCostCenters(req.companyId!);
    res.json({ success: true, results });
  } catch (err) {
    next(err);
  }
});

hrRouter.put('/employees/:id', requireModuleTier('HR', 2), async (req, res, next) => {
  try {
    const data = await PayrollService.updateEmployee(req.companyId!, req.params.id, req.body);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

hrRouter.delete('/employees/:id', requireModuleTier('HR', 2), async (req, res, next) => {
  try {
    const data = await PayrollService.deactivateEmployee(req.companyId!, req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// --- FINANCE: Gerbang ACC & Posting ke GL Akuntansi ---
hrFinanceRouter.post('/payroll/:id/finance-review', requireModuleAccess('FINANCE'), requireModuleTier('FINANCE', 1), async (req, res, next) => {
  try {
    const decision = String(req.body.decision || '').toUpperCase() === 'REJECT' ? 'REJECT' : 'APPROVE';
    const data = await HrService.financeReviewPayrollRun(
      req.companyId!,
      req.params.id,
      req.user!.id,
      decision,
      req.body.note,
    );
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

hrFinanceRouter.post('/payroll/:id/post-gl', requireModuleAccess('FINANCE'), requireModuleTier('FINANCE', 1), async (req, res, next) => {
  try {
    const posted = await PayrollService.post(req.companyId!, req.tenantId ?? null, req.params.id, req.user!.id);
    res.json({ success: true, data: posted });
  } catch (err) {
    next(err);
  }
});

hrFinanceRouter.post('/payroll/:id/pay', requireModuleAccess('FINANCE'), requireModuleTier('FINANCE', 1), async (req, res, next) => {
  try {
    const payment = await PayrollService.pay(req.companyId!, req.tenantId ?? null, req.params.id, req.user!.id, req.body);
    res.json({ success: true, data: payment });
  } catch (err) {
    next(err);
  }
});
