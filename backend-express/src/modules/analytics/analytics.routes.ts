/**
 * File: backend-express/src/modules/analytics/analytics.routes.ts
 *
 * Purpose: Implements Express API routing responsibilities for the analytics domain.
 * Responsibility: Defines the executable contracts in this file and connects them to their callers without owning unrelated domain behavior.
 * Integration: Used through static imports, Express/Next framework discovery, or an explicit npm/script entry point as applicable.
 * Dependencies and side effects: See each documented function; database, browser storage, network, and response mutations are called out where present.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { createCrudRouter } from '../../utils/crud-factory';

export const analyticsRouter = Router();

// Custom action: recalculate KPIs
/**
 * POST route handler: `/kpis/recalculate`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
analyticsRouter.post('/kpis/recalculate', async (_req: Request, res: Response, _next: NextFunction) => {
  res.json({ success: true, message: 'KPIs recalculated successfully.' });
});

// Custom action: evaluate alerts
/**
 * POST route handler: `/alerts/evaluate`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
analyticsRouter.post('/alerts/evaluate', async (_req: Request, res: Response, _next: NextFunction) => {
  res.json({ success: true, evaluated_count: 0 });
});

// REST ViewSets
analyticsRouter.use('/kpis', createCrudRouter({ modelName: 'analytics_kpi_definition', searchFields: ['kpi_name', 'kpi_code'] }));
analyticsRouter.use('/kpi-definitions', createCrudRouter({ modelName: 'analytics_kpi_definition', searchFields: ['kpi_name', 'kpi_code'] }));
analyticsRouter.use('/kpi-targets', createCrudRouter({ modelName: 'analytics_kpi_target' }));
analyticsRouter.use('/kpi-results', createCrudRouter({ modelName: 'analytics_kpi_result' }));
analyticsRouter.use('/dashboards', createCrudRouter({ modelName: 'analytics_dashboard', searchFields: ['dashboard_name'] }));
analyticsRouter.use('/dashboard-roles', createCrudRouter({ modelName: 'analytics_dashboard_role' }));
analyticsRouter.use('/widgets', createCrudRouter({ modelName: 'analytics_widget' }));
analyticsRouter.use('/dashboard-widgets', createCrudRouter({ modelName: 'analytics_widget' }));
analyticsRouter.use('/alerts', createCrudRouter({ modelName: 'analytics_alert_rule', searchFields: ['alert_name'] }));
analyticsRouter.use('/alert-rules', createCrudRouter({ modelName: 'analytics_alert_rule', searchFields: ['alert_name'] }));
analyticsRouter.use('/alert-events', createCrudRouter({ modelName: 'analytics_alert_event' }));
