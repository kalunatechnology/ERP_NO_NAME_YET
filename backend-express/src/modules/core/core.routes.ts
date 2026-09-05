/**
 * File: backend-express/src/modules/core/core.routes.ts
 *
 * Purpose: Implements Express API routing responsibilities for the core domain.
 * Responsibility: Defines the executable contracts in this file and connects them to their callers without owning unrelated domain behavior.
 * Integration: Used through static imports, Express/Next framework discovery, or an explicit npm/script entry point as applicable.
 * Dependencies and side effects: See each documented function; database, browser storage, network, and response mutations are called out where present.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { CoreService } from './core.service';
import { authenticate } from '../../middlewares/auth.middleware';
import { createCrudRouter } from '../../utils/crud-factory';
import { requireAdminForWrite, requireSuperAdminForWrite, requireSuperuser } from '../../middlewares/rbac.middleware';
import { isCompanyAdmin, isSuperAdmin } from '../../types/roles';
import { ForbiddenError, ValidationError } from '../../utils/errors';

export const coreRouter = Router();
export const feedShortcutRouter = Router();

// Sidebar Feed endpoints
/**
 * GET route handler: `/sidebar-feed`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
coreRouter.get('/sidebar-feed', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await CoreService.getSidebarFeed(req.user!.id, req.companyId ?? null);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST route handler: `/sidebar-feed/mark-read`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
coreRouter.post('/sidebar-feed/mark-read', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await CoreService.markNotificationsRead(req.user!.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Recent Items endpoints
/**
 * GET route handler: `/recent-items`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
coreRouter.get('/recent-items', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await CoreService.getRecentItems(req.user!.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST route handler: `/recent-items/track`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
coreRouter.post('/recent-items/track', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await CoreService.trackRecentItem(req.user!.id, req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST route handler: `/track-recent`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
coreRouter.post('/track-recent', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await CoreService.trackRecentItem(req.user!.id, req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Top-level direct shortcuts
/**
 * GET route handler: `/sidebar-feed`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
feedShortcutRouter.get('/sidebar-feed', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await CoreService.getSidebarFeed(req.user!.id, req.companyId ?? null);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
/**
 * POST route handler: `/sidebar-feed/mark-read`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
feedShortcutRouter.post('/sidebar-feed/mark-read', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await CoreService.markNotificationsRead(req.user!.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
/**
 * GET route handler: `/recent-items`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
feedShortcutRouter.get('/recent-items', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await CoreService.getRecentItems(req.user!.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
/**
 * POST route handler: `/recent-items/track`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
feedShortcutRouter.post('/recent-items/track', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await CoreService.trackRecentItem(req.user!.id, req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Company Module Entitlement Endpoints
/**
 * GET route handler: `/company-modules/my-modules`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
coreRouter.get('/company-modules/my-modules', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.companyId) {
      res.json({ results: CoreService.ALL_MODULE_CODES.map((code) => ({ module_code: code, enabled: false })) });
      return;
    }
    const modules = await CoreService.getCompanyModules(req.companyId);
    res.json({ results: modules });
  } catch (err) {
    next(err);
  }
});

/**
 * GET route handler: `/companies/:id/modules`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
coreRouter.get('/companies/:id/modules', authenticate, requireSuperuser, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const modules = await CoreService.getCompanyModules(req.params.id);
    res.json({ results: modules });
  } catch (err) {
    next(err);
  }
});

/**
 * handleSetCompanyModule implements a named function within this file's Express API routing boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: No database operation is implied unless explicitly present in the implementation.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
const handleSetCompanyModule = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const roles = req.user?.roles ?? [];
    const superAdmin = isSuperAdmin(roles);
    const companyAdmin = isCompanyAdmin(roles);
    if (!superAdmin && !companyAdmin) {
      throw new ForbiddenError('Hanya Super Admin atau Company Admin yang dapat mengatur akses modul.');
    }
    if (!superAdmin && req.companyId !== req.params.id) {
      throw new ForbiddenError('Company Admin hanya dapat mengatur akses company aktifnya sendiri.');
    }

    // Module activation represents the commercial entitlement boundary and
    // remains exclusive to Super Admin. Company Admin may tune read/write for
    // its own company, but cannot activate a module that was not provisioned.
    const current = await CoreService.getCompanyModules(req.params.id);
    const currentModule = current.find((item) => item.module_code === req.params.moduleCode.trim().toUpperCase());
    if (!currentModule) throw new ValidationError('Module tidak ditemukan dalam katalog sistem.');
    if (!superAdmin && typeof req.body.enabled === 'boolean' && req.body.enabled !== currentModule.enabled) {
      throw new ForbiddenError('Aktivasi modul hanya dapat dilakukan oleh Super Admin.');
    }
    if (!superAdmin && !currentModule.enabled) {
      throw new ForbiddenError('Module belum diaktifkan oleh Super Admin.');
    }

    const result = await CoreService.setCompanyModuleAccess(
      req.params.id,
      req.params.moduleCode,
      {
        enabled: req.body.enabled,
        allow_read: req.body.allow_read,
        allow_write: req.body.allow_write,
        enabledById: req.user?.id,
      },
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH route handler: `/companies/:id/modules/:moduleCode`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
coreRouter.patch('/companies/:id/modules/:moduleCode', authenticate, handleSetCompanyModule);
/**
 * PUT route handler: `/companies/:id/modules/:moduleCode`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
coreRouter.put('/companies/:id/modules/:moduleCode', authenticate, handleSetCompanyModule);

// REST ViewSets
coreRouter.use('/companies', requireSuperAdminForWrite, createCrudRouter({ modelName: 'core_company', searchFields: ['company_code', 'legal_name'] }));
coreRouter.use('/tenants', requireSuperAdminForWrite, createCrudRouter({ modelName: 'core_tenant', searchFields: ['code', 'name'] }));
coreRouter.use('/organizations', requireAdminForWrite, createCrudRouter({ modelName: 'core_organization', searchFields: ['organization_code', 'organization_name'] }));
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
