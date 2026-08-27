import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';

import { env } from './config/env';
import { optionalAuthenticate } from './middlewares/auth.middleware';
import { resolveTenant } from './middlewares/tenant.middleware';
import { auditLog } from './middlewares/audit.middleware';
import { errorHandler } from './middlewares/error.middleware';
import { notFound } from './middlewares/not-found.middleware';

// Domain Routers
import { authRouter, accountsRouter } from './modules/accounts/accounts.routes';
import { coreRouter, feedShortcutRouter } from './modules/core/core.routes';
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

export function createApp(): Express {
  const app = express();

  // 1. Core security & performance middleware
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin: (requestOrigin, callback) => {
        if (!requestOrigin) return callback(null, true);
        if (
          env.CORS_ALLOWED_ORIGINS.includes(requestOrigin) ||
          /^https?:\/\/([a-z0-9-]+\.)*arsalynk\.com(:\d+)?$/i.test(requestOrigin)
        ) {
          return callback(null, true);
        }
        return callback(null, true);
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
      ],
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  if (env.NODE_ENV !== 'test') {
    app.use(morgan('dev'));
  }

  // 2. Tenancy, Auth extraction & Audit Logging
  app.use(optionalAuthenticate);
  app.use(resolveTenant);
  app.use(auditLog);

  // 3. Health check
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'erp-backend-express',
      version: '1.0.0',
    });
  });

  // 4. API v1 Router Pipeline (Matches Django URL structure 100%)
  const apiV1 = express.Router();

  // Top-level direct shortcuts
  apiV1.use('/', feedShortcutRouter);

  // Auth & Accounts
  apiV1.use('/auth', authRouter);
  apiV1.use('/accounts', accountsRouter);

  // ERP Domain Modules
  apiV1.use('/core', coreRouter);
  apiV1.use('/master-data', masterDataRouter);
  apiV1.use('/crm', crmRouter);
  apiV1.use('/sales', salesRouter);
  apiV1.use('/projects', projectsRouter);
  apiV1.use('/finance', financeRouter);
  apiV1.use('/procurement', procurementRouter);
  apiV1.use('/inventory', inventoryRouter);
  apiV1.use('/manufacturing', manufacturingRouter);
  apiV1.use('/quality', qualityRouter);
  apiV1.use('/assets', assetsRouter);
  apiV1.use('/service', serviceRouter);
  apiV1.use('/logistics', logisticsRouter);
  apiV1.use('/analytics', analyticsRouter);
  apiV1.use('/implementation', implementationRouter);
  apiV1.use('/reporting', reportingRouter);
  apiV1.use('/commands', commandsRouter);

  app.use('/api/v1', apiV1);

  // 5. Error & 404 handling
  app.use(notFound);
  app.use(errorHandler);

  return app;
}

export default createApp;
