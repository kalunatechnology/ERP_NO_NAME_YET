import { Router, Request, Response, NextFunction } from 'express';
import { CoreService } from './core.service';
import { authenticate } from '../../middlewares/auth.middleware';
import { createCrudRouter } from '../../utils/crud-factory';

export const coreRouter = Router();
export const feedShortcutRouter = Router();

// Sidebar Feed endpoints
coreRouter.get('/sidebar-feed', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await CoreService.getSidebarFeed(req.user!.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

coreRouter.post('/sidebar-feed/mark-read', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await CoreService.markNotificationsRead(req.user!.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Recent Items endpoints
coreRouter.get('/recent-items', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await CoreService.getRecentItems(req.user!.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

coreRouter.post('/recent-items/track', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await CoreService.trackRecentItem(req.user!.id, req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

coreRouter.post('/track-recent', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await CoreService.trackRecentItem(req.user!.id, req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Top-level direct shortcuts
feedShortcutRouter.get('/sidebar-feed', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await CoreService.getSidebarFeed(req.user!.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
feedShortcutRouter.post('/sidebar-feed/mark-read', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await CoreService.markNotificationsRead(req.user!.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
feedShortcutRouter.get('/recent-items', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await CoreService.getRecentItems(req.user!.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
feedShortcutRouter.post('/recent-items/track', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await CoreService.trackRecentItem(req.user!.id, req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// REST ViewSets
coreRouter.use('/companies', createCrudRouter({ modelName: 'core_company', searchFields: ['company_code', 'legal_name'] }));
coreRouter.use('/tenants', createCrudRouter({ modelName: 'core_tenant', searchFields: ['code', 'name'] }));
coreRouter.use('/organizations', createCrudRouter({ modelName: 'core_organization', searchFields: ['organization_code', 'organization_name'] }));
coreRouter.use('/documents', createCrudRouter({ modelName: 'core_business_document', searchFields: ['document_number', 'document_type'] }));
coreRouter.use('/document-links', createCrudRouter({ modelName: 'core_document_link' }));
coreRouter.use('/workflow-instances', createCrudRouter({ modelName: 'core_workflow_instance' }));
coreRouter.use('/workflow-approvals', createCrudRouter({ modelName: 'core_workflow_approval' }));
coreRouter.use('/audit-events', createCrudRouter({ modelName: 'core_audit_event', searchFields: ['endpoint', 'method'] }));
coreRouter.use('/notifications', createCrudRouter({ modelName: 'core_notification' }));
coreRouter.use('/notification-recipients', createCrudRouter({ modelName: 'core_notification_recipient' }));
coreRouter.use('/quick-actions', createCrudRouter({ modelName: 'core_quick_action' }));
coreRouter.use('/files', createCrudRouter({ modelName: 'core_file' }));
coreRouter.use('/document-attachments', createCrudRouter({ modelName: 'core_document_attachment' }));
coreRouter.use('/document-templates', createCrudRouter({ modelName: 'core_document_template' }));
coreRouter.use('/document-template-versions', createCrudRouter({ modelName: 'core_document_template_version' }));
coreRouter.use('/document-template-fields', createCrudRouter({ modelName: 'core_document_template_field' }));
coreRouter.use('/generated-documents', createCrudRouter({ modelName: 'core_generated_document' }));
coreRouter.use('/document-signatures', createCrudRouter({ modelName: 'core_document_signature' }));
coreRouter.use('/team-contacts', createCrudRouter({ modelName: 'core_team_contact', searchFields: ['full_name', 'email', 'phone'] }));
