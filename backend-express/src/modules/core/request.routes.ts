import { Router, Request, Response, NextFunction } from 'express';
import { RequestService } from './request.service';
import { sendSuccess, sendError } from '../../utils/response';

export const requestRouter = Router();

// =============================================================================
// MARKA+ INTERNAL REQUESTS & TICKETING ENDPOINTS
// =============================================================================

// List request cards with filters
requestRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await RequestService.getRequests({
      status:    req.query.status as string | undefined,
      type:      req.query.type   as string | undefined,
      companyId: req.companyId ?? undefined,
      page:      req.query.page      ? Number(req.query.page)      : 1,
      pageSize:  req.query.page_size ? Number(req.query.page_size) : 30,
    });
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

// Create new card request (Meeting, Leave, Fund Request, Other)
requestRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await RequestService.createRequest(
      req.body,
      req.user?.id ?? 'usr-current',
      req.companyId,
    );
    sendSuccess(res, result, 201);
  } catch (err) { next(err); }
});

// List team members for "Who's inside" selector with search
requestRouter.get('/team-members', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const search = req.query.search as string | undefined;
    const members = await RequestService.getTeamMembers(req.companyId ?? undefined, search);
    sendSuccess(res, members);
  } catch (err) { next(err); }
});

// Level 1: OM Validation (APPROVE or RE_CHECK)
requestRouter.post('/:id/validate-om', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { decision, remarks } = req.body;
    if (!decision || !['APPROVE', 'RE_CHECK'].includes(decision)) {
      return sendError(res, 'decision wajib diisi (APPROVE atau RE_CHECK).', 400);
    }
    const result = await RequestService.validateByOM({
      requestId: req.params.id,
      decision,
      remarks,
      omUserId:  req.user?.id ?? 'om-user',
    });
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

// Level 2: Executive/PM Approval (APPROVE or REJECT)
requestRouter.post('/:id/approve-exec', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { decision, remarks } = req.body;
    if (!decision || !['APPROVE', 'REJECT'].includes(decision)) {
      return sendError(res, 'decision wajib diisi (APPROVE atau REJECT).', 400);
    }
    const result = await RequestService.approveByExecutive({
      requestId:  req.params.id,
      decision,
      remarks,
      execUserId: req.user?.id ?? 'exec-user',
    });
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

// Level 3: Finance Disbursement
requestRouter.post('/:id/disburse', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { disburse_account_id, disburse_reference } = req.body;
    const result = await RequestService.disburseRequest({
      requestId:          req.params.id,
      disburseAccountId:  disburse_account_id,
      disburseReference:  disburse_reference,
      disburseUserId:     req.user?.id ?? 'fin-user',
    });
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

// Level 4: Requester Submit LPJ / Nota Belanja
requestRouter.post('/:id/submit-lpj', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { realization_amount, discrepancy_amount, discrepancy_type, notes, invoices } = req.body;
    if (!realization_amount || Number(realization_amount) <= 0) {
      return sendError(res, 'realization_amount (total belanja riil) wajib diisi lebih dari 0.', 400);
    }
    const result = await RequestService.submitLPJ({
      requestId:          req.params.id,
      realizationAmount:  Number(realization_amount),
      discrepancyAmount:  discrepancy_amount ? Number(discrepancy_amount) : 0,
      discrepancyType:    discrepancy_type ?? 'NONE',
      notes,
      invoices,
      requesterUserId:    req.user?.id ?? 'req-user',
    });
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

// Level 5: OM Final Verification of LPJ (Closes Ticket)
requestRouter.post('/:id/verify-lpj-om', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { decision, remarks } = req.body;
    if (!decision || !['APPROVE', 'REVISE'].includes(decision)) {
      return sendError(res, 'decision wajib diisi (APPROVE atau REVISE).', 400);
    }
    const result = await RequestService.verifyLPJByOM({
      requestId: req.params.id,
      decision,
      remarks,
      omUserId:  req.user?.id ?? 'om-user',
    });
    sendSuccess(res, result);
  } catch (err) { next(err); }
});
