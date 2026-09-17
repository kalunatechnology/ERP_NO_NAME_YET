/**
 * File: backend-express/src/app.ts
 *
 * Purpose: Implements application infrastructure responsibilities for the platform domain.
 * Responsibility: Defines the executable contracts in this file and connects them to their callers without owning unrelated domain behavior.
 * Integration: Used through static imports, Express/Next framework discovery, or an explicit npm/script entry point as applicable.
 * Dependencies and side effects: See each documented function; database, browser storage, network, and response mutations are called out where present.
 */
import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import crypto from 'crypto';

import { env } from './config/env';
import { authenticate } from './middlewares/auth.middleware';
import { resolveTenant } from './middlewares/tenant.middleware';
import { auditLog } from './middlewares/audit.middleware';
import { enforceSuperAdminReadOnly, requireActiveRole, requireRole, restrictActiveRoleMutations } from './middlewares/rbac.middleware';
import { RoleCode } from './types/roles';
import { requireModuleAccess } from './middlewares/entitlement.middleware';
import { errorHandler } from './middlewares/error.middleware';
import { enforceTransactionIdempotency } from './middlewares/idempotency.middleware';
import { notFound } from './middlewares/not-found.middleware';

// Domain Routers
import { authRouter, publicAuthRouter, accountsRouter } from './modules/accounts/accounts.routes';
import { coreRouter, feedShortcutRouter } from './modules/core/core.routes';
import { requestRouter } from './modules/core/request.routes';
import { masterDataRouter } from './modules/master_data/master_data.routes';
import { crmRouter } from './modules/crm/crm.routes';
import { salesRouter } from './modules/sales/sales.routes';
import { projectsRouter } from './modules/projects/projects.routes';
import { financeRouter } from './modules/finance/finance.routes';
import { procurementRouter } from './modules/procurement/procurement.routes';
import { inventoryRouter } from './modules/inventory/inventory.routes';
import { manufacturingRouter } from './modules/manufacturing/manufacturing.routes';
import { qualityRouter } from './modules/quality/quality.routes';
import { assetsRouter } from './modules/assets/assets.routes';
import { serviceRouter } from './modules/service/service.routes';
import { logisticsRouter } from './modules/logistics/logistics.routes';
import { analyticsRouter } from './modules/analytics/analytics.routes';
import { implementationRouter } from './modules/implementation/implementation.routes';
import { reportingRouter } from './modules/reporting/reporting.routes';
import { managementReportsRouter } from './modules/management_reports/management_reports.routes';
import { commandsRouter } from './modules/commands/commands.routes';
import { dashboardRouter, invalidateDashboardCache } from './modules/dashboard/dashboard.routes';
import { marbotInternalRouter, marbotUserRouter } from './modules/marbot/marbot.routes';

// Initialize Workflows
import './workflows';

/**
 * createApp implements a named function within this file's application infrastructure boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: No database operation is implied unless explicitly present in the implementation.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
export function createApp(): Express {
  const app = express();

  // 1. Core security & performance middleware
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
/**
 * cors implements a named method within this file's application infrastructure boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: No database operation is implied unless explicitly present in the implementation.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
    cors({
      origin: (requestOrigin, callback) => {
        if (!requestOrigin) return callback(null, true);
        if (
          env.CORS_ALLOWED_ORIGINS.includes(requestOrigin) ||
          /^https?:\/\/([a-z0-9-]+\.)*arsalynk\.com(:\d+)?$/i.test(requestOrigin)
        ) {
          return callback(null, true);
        }
        return callback(null, false);
      },
      credentials: env.CORS_ALLOW_CREDENTIALS,
      allowedHeaders: [
        'Accept',
        'Authorization',
        'Content-Type',
        'Origin',
        'User-Agent',
        'X-Company-ID',
        'x-company-id',
        'X-CSRFToken',
        'X-Requested-With',
        'Idempotency-Key',
      ],
      exposedHeaders: ['X-Request-ID', 'X-Idempotent-Replay', 'X-Dashboard-Cache', 'X-Request-Cache', 'Server-Timing'],
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use((req: Request, res: Response, next) => {
    req.requestId = String(req.header('X-Request-ID') || crypto.randomUUID()).slice(0, 128);
    res.setHeader('X-Request-ID', req.requestId);
    next();
  });

  if (env.NODE_ENV !== 'test') {
    app.use(morgan('dev'));
  }

  // 2. Public health check
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'erp-backend-express',
      version: '1.0.0',
    });
  });

  // 3. API v1 Router Pipeline
  // The chatbot has no ERP JWT. Its internal tools use request-bound HMAC;
  // the browser chat proxy uses the ordinary ERP JWT and company membership.
  app.use('/internal/marbot', marbotInternalRouter);
  app.use('/api/v1/marbot', marbotUserRouter);
  const apiV1 = express.Router();

  // Public authentication endpoints are explicitly allow-listed.
  apiV1.use('/auth', publicAuthRouter);

  // Every remaining API endpoint requires an authenticated, active user.
  apiV1.use(authenticate);
  apiV1.use(resolveTenant);
  apiV1.use(enforceSuperAdminReadOnly);
  apiV1.use(enforceTransactionIdempotency);
  apiV1.use(auditLog);

  // Dashboard/bootstrap aggregates data from multiple ERP domains. Invalidate
  // its read-through snapshot after every successful authenticated mutation,
  // rather than only after Project mutations. This keeps cross-page totals and
  // shared records coherent after Finance, CRM, Request, Core, and other writes.
  apiV1.use((req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase())) {
      res.on('finish', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) invalidateDashboardCache();
      });
    }
    next();
  });

  // Top-level direct shortcuts
  apiV1.use('/', feedShortcutRouter);

  // Authenticated auth & account management
  apiV1.use('/auth', authRouter);
  apiV1.use('/accounts', accountsRouter);

  // ERP Domain Modules
  apiV1.use('/core', coreRouter);
  apiV1.use('/requests', requireModuleAccess('REQUESTS'), requestRouter);
  apiV1.use('/request', requireModuleAccess('REQUESTS'), requestRouter);
  apiV1.use('/master-data', masterDataRouter);
  apiV1.use(
    '/crm',
    requireModuleAccess('CRM'),
    requireActiveRole(RoleCode.CRM_LEAD, RoleCode.SALES, RoleCode.PROJECT_MANAGER, RoleCode.DIRECTOR),
    restrictActiveRoleMutations({
      restrictedRoles: [RoleCode.DIRECTOR],
      message: 'Role Director memiliki akses preview CRM; seluruh mutasi operasional dinonaktifkan.',
    }),
    crmRouter,
  );
  apiV1.use('/sales', requireModuleAccess('SALES'), requireActiveRole(RoleCode.CRM_LEAD, RoleCode.SALES, RoleCode.PROJECT_MANAGER, RoleCode.DIRECTOR), salesRouter);
  apiV1.use(
    '/projects',
    requireModuleAccess('PROJECTS'),
    requireActiveRole(RoleCode.PROJECT_MANAGER, RoleCode.OPERATIONAL_MANAGER, RoleCode.DIRECTOR, RoleCode.SUPERVISOR, RoleCode.STAFF),
    restrictActiveRoleMutations({
      restrictedRoles: [RoleCode.DIRECTOR],
      message: 'Role Director memiliki akses preview seluruh proyek.',
    }),
    restrictActiveRoleMutations({
      restrictedRoles: [RoleCode.SUPERVISOR, RoleCode.STAFF],
      allowedMutationPaths: [
        /\/api\/v1\/projects\/daily-tasks\/[^/]+\/(update[-_]progress|report[-_]blocked|request[-_]transfer)$/,
        { path: /\/api\/v1\/projects\/daily-tasks\/?$/, methods: ['POST'] },
        { path: /\/api\/v1\/projects\/daily-tasks\/[^/]+\/?$/, methods: ['PUT', 'PATCH', 'DELETE'] },
        { path: /\/api\/v1\/projects\/task-transfers\/[^/]+\/cancel\/?$/, methods: ['POST'] },
        /\/api\/v1\/projects\/timesheets(?:\/[^/]+)?\/?$/,
      ],
      message: 'Staff dan Supervisor hanya dapat mengelola Daily Task serta timesheet miliknya. Weekly Task dan assignment merupakan kewenangan PM/OM.',
    }),
    projectsRouter,
  );
  apiV1.use(
    '/finance',
    requireModuleAccess('FINANCE'),
    requireActiveRole(RoleCode.FINANCE, RoleCode.DIRECTOR),
    restrictActiveRoleMutations({
      restrictedRoles: [RoleCode.DIRECTOR],
      message: 'Role Director memiliki akses preview Finance; seluruh mutasi operasional dinonaktifkan.',
    }),
    financeRouter,
  );
  apiV1.use('/procurement', requireModuleAccess('PROCUREMENT'), procurementRouter);
  apiV1.use('/inventory', requireModuleAccess('INVENTORY'), inventoryRouter);
  apiV1.use('/manufacturing', requireModuleAccess('MANUFACTURING'), manufacturingRouter);
  apiV1.use('/quality', requireModuleAccess('QUALITY'), qualityRouter);
  apiV1.use('/assets', requireModuleAccess('ASSETS'), assetsRouter);
  apiV1.use('/service', requireModuleAccess('SERVICE'), serviceRouter);
  apiV1.use('/logistics', requireModuleAccess('LOGISTICS'), logisticsRouter);
  apiV1.use('/analytics', requireModuleAccess('ANALYTICS'), analyticsRouter);
  apiV1.use('/implementation', requireModuleAccess('IMPLEMENTATION'), implementationRouter);
  apiV1.use('/reporting', requireModuleAccess('REPORTING'), reportingRouter);
  apiV1.use(
    '/management-reports',
    requireModuleAccess('REPORTING'),
    requireActiveRole(RoleCode.OPERATIONAL_MANAGER, RoleCode.DIRECTOR),
    managementReportsRouter,
  );
  apiV1.use('/commands', commandsRouter);
  apiV1.use('/dashboard', dashboardRouter);

  app.use('/api/v1', apiV1);

  // 5. Error & 404 handling
  app.use(notFound);
  app.use(errorHandler);

  return app;
}

export default createApp;
