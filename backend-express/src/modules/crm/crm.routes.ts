import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../../config/database';
import { CRMService } from './crm.service';
import { createCrudRouter } from '../../utils/crud-factory';
import { NotFoundError, ValidationError } from '../../utils/errors';

export const crmRouter = Router();

// =============================================================================
// CUSTOM ACTIONS ON INQUIRIES
// =============================================================================

crmRouter.post('/customer-inquiries/:id/qualify', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await CRMService.qualifyInquiry(req.params.id, req.user?.id ?? 'system');
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// CUSTOM ACTIONS ON COST ESTIMATES
// =============================================================================

crmRouter.post('/cost-estimates/:id/calculate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await CRMService.calculateEstimate(req.params.id, req.user?.id ?? 'system');
    res.json(result);
  } catch (err) {
    next(err);
  }
});

crmRouter.post('/cost-estimates/:id/create-quotation', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await CRMService.createQuotationFromEstimate(req.params.id, req.user?.id ?? 'system');
    res.status(result.created ? 201 : 200).json(result);
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// CUSTOM ACTIONS ON CREDIT SNAPSHOTS
// =============================================================================

crmRouter.post('/credit-status-snapshots/calculate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const customerPartyId = req.body.customer_party ?? req.body.customer_party_id;
    if (!customerPartyId) throw new ValidationError('customer_party_id is required');
    const result = await CRMService.calculateCreditSnapshot(customerPartyId, req.companyId);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// CUSTOM ACTIONS ON OPPORTUNITIES
// =============================================================================

crmRouter.post('/opportunities/:id/process-deal-won', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await CRMService.processDealWon(req.params.id, req.user, req.companyId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

crmRouter.post('/opportunities/:id/executive-override', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await CRMService.executiveOverride(req.params.id, req.user, req.companyId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

crmRouter.get('/opportunities/:id/customer-360', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const opp = await prisma.crm_opportunity.findUnique({ where: { id: req.params.id } });
    if (!opp) throw new NotFoundError('Opportunity');

    const customer = opp.customer_party_id
      ? await prisma.master_party.findUnique({ where: { id: opp.customer_party_id } })
      : null;

    const [quotationsCount, ordersCount, projectsCount] = await Promise.all([
      customer ? prisma.sales_quotation.count({ where: { customer_party_id: customer.id } }) : 0,
      customer ? prisma.sales_order.count({ where: { customer_party_id: customer.id } }) : 0,
      customer ? prisma.project_project.count({ where: { customer_party_id: customer.id } }) : 0,
    ]);

    res.json({
      customer: {
        id: customer?.id ?? null,
        name: customer?.display_name ?? customer?.legal_name ?? 'No Customer',
        party_code: customer?.party_code ?? '-',
      },
      quotations: quotationsCount,
      orders: ordersCount,
      projects: projectsCount,
      contracts: 0,
      deliveries: 0,
      outstanding_ar: '0',
      feedback_count: 0,
    });
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// CUSTOM ACTIONS ON EXECUTIVE APPROVALS
// =============================================================================

crmRouter.post('/executive-approvals/:id/decide', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const decision = String(req.body.decision ?? '').toUpperCase();
    if (!['APPROVED', 'REJECTED'].includes(decision)) {
      throw new ValidationError('Gunakan APPROVED atau REJECTED.');
    }
    const updated = await prisma.crm_executive_approval.update({
      where: { id: req.params.id },
      data: {
        decision,
        remarks: req.body.remarks ?? '',
        approver_user_id: req.user?.id,
        decided_at: new Date(),
      },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

crmRouter.post('/executive-approvals/:id/approve', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = await prisma.crm_executive_approval.update({
      where: { id: req.params.id },
      data: {
        decision: 'APPROVED',
        remarks: req.body.remarks ?? '',
        approver_user_id: req.user?.id,
        decided_at: new Date(),
      },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

crmRouter.post('/executive-approvals/:id/reject', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = await prisma.crm_executive_approval.update({
      where: { id: req.params.id },
      data: {
        decision: 'REJECTED',
        remarks: req.body.remarks ?? '',
        approver_user_id: req.user?.id,
        decided_at: new Date(),
      },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// CRUD VIEWSETS
// =============================================================================

crmRouter.use('/customer-inquiries', createCrudRouter({ modelName: 'crm_customer_inquiry', searchFields: ['inquiry_number', 'subject', 'customer_name'] }));
crmRouter.use('/inquiry-requirements', createCrudRouter({ modelName: 'crm_inquiry_requirement', searchFields: ['description'] }));
crmRouter.use('/cost-estimates', createCrudRouter({ modelName: 'crm_cost_estimate', searchFields: ['estimate_number'] }));
crmRouter.use('/cost-estimate-lines', createCrudRouter({ modelName: 'crm_cost_estimate_line', searchFields: ['description', 'cost_element'] }));
crmRouter.use('/opportunities', createCrudRouter({ modelName: 'crm_opportunity', searchFields: ['opportunity_name', 'pipeline_stage'] }));
crmRouter.use('/opportunity-products', createCrudRouter({ modelName: 'crm_opportunity_product' }));
crmRouter.use('/activities', createCrudRouter({ modelName: 'crm_activity', searchFields: ['subject', 'activity_type'] }));
crmRouter.use('/pipelines', createCrudRouter({ modelName: 'crm_pipeline', searchFields: ['pipeline_name', 'pipeline_code'] }));
crmRouter.use('/pipeline-stages', createCrudRouter({ modelName: 'crm_pipeline_stage', searchFields: ['stage_name', 'stage_code'] }));
crmRouter.use('/opportunity-stage-histories', createCrudRouter({ modelName: 'crm_opportunity_stage_history' }));
crmRouter.use('/executive-approvals', createCrudRouter({ modelName: 'crm_executive_approval' }));
crmRouter.use('/credit-status-snapshots', createCrudRouter({ modelName: 'crm_credit_status_snapshot' }));
crmRouter.use('/channel-accounts', createCrudRouter({ modelName: 'crm_channel_account' }));
crmRouter.use('/conversations', createCrudRouter({ modelName: 'crm_conversation' }));
crmRouter.use('/conversation-participants', createCrudRouter({ modelName: 'crm_conversation_participant' }));
crmRouter.use('/messages', createCrudRouter({ modelName: 'crm_message' }));
crmRouter.use('/message-attachments', createCrudRouter({ modelName: 'crm_message_attachment' }));
crmRouter.use('/message-delivery-statuses', createCrudRouter({ modelName: 'crm_message_delivery_status' }));
crmRouter.use('/feedbacks', createCrudRouter({ modelName: 'crm_feedback', searchFields: ['subject', 'feedback_text'] }));
crmRouter.use('/surveys', createCrudRouter({ modelName: 'crm_survey', searchFields: ['title'] }));
crmRouter.use('/survey-questions', createCrudRouter({ modelName: 'crm_survey_question' }));
crmRouter.use('/survey-responses', createCrudRouter({ modelName: 'crm_survey_response' }));
crmRouter.use('/survey-answers', createCrudRouter({ modelName: 'crm_survey_answer' }));
crmRouter.use('/quotation-versions', createCrudRouter({ modelName: 'crm_quotation_version' }));
crmRouter.use('/quotation-deliveries', createCrudRouter({ modelName: 'crm_quotation_delivery' }));
crmRouter.use('/workflow-events', createCrudRouter({ modelName: 'crm_workflow_event' }));
crmRouter.use('/customer-feedbacks', createCrudRouter({ modelName: 'crm_customer_feedback' }));
