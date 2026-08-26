import { Router, Request, Response, NextFunction } from 'express';
import { createCrudRouter } from '../../utils/crud-factory';

export const analyticsRouter = Router();

// Custom action: recalculate KPIs
analyticsRouter.post('/kpis/recalculate', async (_req: Request, res: Response, _next: NextFunction) => {
  res.json({ success: true, message: 'KPIs recalculated successfully.' });
});

// Custom action: evaluate alerts
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
