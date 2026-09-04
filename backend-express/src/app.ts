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
import { enforceSuperAdminReadOnly, requireRole, restrictActiveRoleMutations } from './middlewares/rbac.middleware';
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
import { commandsRouter } from './modules/commands/commands.routes';

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
      exposedHeaders: ['X-Request-ID', 'X-Idempotent-Replay'],
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
  const apiV1 = express.Router();

  // Public authentication endpoints are explicitly allow-listed.
  apiV1.use('/auth', publicAuthRouter);

  // Every remaining API endpoint requires an authenticated, active user.
  apiV1.use(authenticate);
  apiV1.use(resolveTenant);
  apiV1.use(enforceSuperAdminReadOnly);
  apiV1.use(enforceTransactionIdempotency);
  apiV1.use(auditLog);

  // Top-level direct shortcuts
  apiV1.use('/', feedShortcutRouter);

  // Authenticated auth & account management
  apiV1.use('/auth', authRouter);
  apiV1.use('/accounts', accountsRouter);

  // ERP Domain Modules
  apiV1.use('/core', coreRouter);
  apiV1.use('/requests', requireModuleAccess('REQUESTS'), requestRouter);
  apiV1.use('/master-data', masterDataRouter);
  apiV1.use(
    '/crm',
    requireModuleAccess('CRM'),
    requireRole(RoleCode.CRM_LEAD, RoleCode.SALES, RoleCode.PROJECT_MANAGER, RoleCode.DIRECTOR),
    restrictActiveRoleMutations({
      restrictedRoles: [RoleCode.DIRECTOR],
      allowedMutationPaths: [
        /\/api\/v1\/crm\/opportunities\/[^/]+\/executive-override$/,
        /\/api\/v1\/crm\/executive-approvals\/[^/]+\/(decide|approve|reject)$/,
      ],
      message: 'Role Director memiliki akses preview CRM; hanya aksi governance eksekutif yang dapat dimutasi.',
    }),
    crmRouter,
  );
  apiV1.use('/sales', requireModuleAccess('SALES'), requireRole(RoleCode.CRM_LEAD, RoleCode.SALES, RoleCode.PROJECT_MANAGER, RoleCode.DIRECTOR), salesRouter);
  apiV1.use(
    '/projects',
    requireModuleAccess('PROJECTS'),
    requireRole(RoleCode.PROJECT_MANAGER, RoleCode.OPERATIONAL_MANAGER, RoleCode.DIRECTOR, RoleCode.SUPERVISOR, RoleCode.STAFF),
    restrictActiveRoleMutations({
      restrictedRoles: [RoleCode.DIRECTOR],
      message: 'Role Director memiliki akses preview seluruh proyek.',
    }),
    restrictActiveRoleMutations({
      restrictedRoles: [RoleCode.SUPERVISOR, RoleCode.STAFF],
      allowedMutationPaths: [
        /\/api\/v1\/projects\/daily-tasks\/[^/]+\/(update[-_]progress|report[-_]blocked|request[-_]transfer)$/,
        /\/api\/v1\/projects\/daily-tasks\/[^/]+$/,
        /\/api\/v1\/projects\/timesheets(?:\/[^/]+)?\/?$/,
      ],
      message: 'Staff dan Supervisor hanya dapat memperbarui tugas/timesheet miliknya melalui flow operasional.',
    }),
    projectsRouter,
  );
  apiV1.use(
    '/finance',
    requireModuleAccess('FINANCE'),
    requireRole(RoleCode.FINANCE, RoleCode.DIRECTOR),
    restrictActiveRoleMutations({
      restrictedRoles: [RoleCode.DIRECTOR],
      allowedMutationPaths: [
        /\/api\/v1\/finance\/period-closings\/[^/]+\/execute$/,
        /\/api\/v1\/finance\/journal-entries\/[^/]+\/reverse$/,
        /\/api\/v1\/finance\/(billing-documents|payments|fund-requests)\/[^/]+\/(verify|approve|reject)$/,
      ],
      message: 'Role Director memiliki akses preview Finance; hanya aksi approval/governance Q7 yang dapat dimutasi.',
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
  apiV1.use('/commands', commandsRouter);

  app.use('/api/v1', apiV1);

  // 5. Error & 404 handling
  app.use(notFound);
  app.use(errorHandler);

  return app;
}

export default createApp;
