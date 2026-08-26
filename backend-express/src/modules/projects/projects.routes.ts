import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../../config/database';
import { ProjectsService } from './projects.service';
import { createCrudRouter } from '../../utils/crud-factory';

export const projectsRouter = Router();

// =============================================================================
// PROJECT CUSTOM ACTIONS
// =============================================================================

projectsRouter.post('/projects/:id/recalculate_health', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await ProjectsService.calculateProjectEVM(req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

projectsRouter.get('/projects/:id/health', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await ProjectsService.calculateProjectEVM(req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

projectsRouter.get('/projects/:id/evm-metrics', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await ProjectsService.calculateProjectEVM(req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

projectsRouter.post('/projects/:id/advance_stage', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await ProjectsService.advanceStage(req.params.id, req.body.stage);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

projectsRouter.post('/projects/:id/advance-stage', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await ProjectsService.advanceStage(req.params.id, req.body.stage);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

projectsRouter.get('/projects/:id/financial-performance', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await ProjectsService.calculateProjectEVM(req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

projectsRouter.get('/projects/:id/funding_requests', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const fundings = await prisma.fin_project_funding.findMany({
      where: { project_id: req.params.id },
    });
    res.json(fundings);
  } catch (err) {
    next(err);
  }
});

projectsRouter.post('/projects/:id/update_financials', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { budget_amount } = req.body;
    const updated = await prisma.project_project.update({
      where: { id: req.params.id },
      data: {
        budget_amount: budget_amount !== undefined ? budget_amount : undefined,
      },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

projectsRouter.get('/projects/:id/costs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [entries, expenses] = await Promise.all([
      prisma.fin_project_cost_entry.findMany({ where: { project_id: req.params.id } }),
      prisma.project_expense.findMany({ where: { project_id: req.params.id } }),
    ]);
    res.json({ entries, expenses });
  } catch (err) {
    next(err);
  }
});

projectsRouter.get('/projects/:id/milestones', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const milestones = await prisma.project_milestone.findMany({
      where: { project_id: req.params.id },
    });
    res.json(milestones);
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// MAIN TASKS & TASK TRANSFERS ACTIONS
// =============================================================================

projectsRouter.post('/main-tasks/:id/assign_members', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userIds: string[] = req.body.user_ids ?? [];
    for (const uid of userIds) {
      await prisma.project_task_assignment.create({
        data: {
          id: crypto.randomUUID(),
          main_task_id: req.params.id,
          assignee_id: uid,
          assigned_at: new Date(),
        },
      });
    }
    res.json({ success: true, count: userIds.length });
  } catch (err) {
    next(err);
  }
});

projectsRouter.post('/task-transfers/:id/approve', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await ProjectsService.processTransferApproval(
      req.params.id,
      true,
      req.user,
      req.body.review_note ?? '',
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

projectsRouter.post('/task-transfers/:id/reject', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await ProjectsService.processTransferApproval(
      req.params.id,
      false,
      req.user,
      req.body.review_note ?? '',
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// CRUD VIEWSETS
// =============================================================================

projectsRouter.use('/projects', createCrudRouter({ modelName: 'project_project', searchFields: ['project_name', 'project_code', 'status'] }));
projectsRouter.use('/control-items', createCrudRouter({ modelName: 'project_control_item' }));
projectsRouter.use('/expenses', createCrudRouter({ modelName: 'project_expense', searchFields: ['title', 'description'] }));
projectsRouter.use('/lifecycle-events', createCrudRouter({ modelName: 'project_lifecycle_event' }));
projectsRouter.use('/readiness-checks', createCrudRouter({ modelName: 'project_readiness_check' }));
projectsRouter.use('/members', createCrudRouter({ modelName: 'project_member' }));
projectsRouter.use('/tasks', createCrudRouter({ modelName: 'project_task', searchFields: ['task_name', 'task_code'] }));
projectsRouter.use('/task-dependencies', createCrudRouter({ modelName: 'project_task_dependency' }));
projectsRouter.use('/milestones', createCrudRouter({ modelName: 'project_milestone', searchFields: ['milestone_name'] }));
projectsRouter.use('/material-requirements', createCrudRouter({ modelName: 'project_material_requirement' }));
projectsRouter.use('/budget-lines', createCrudRouter({ modelName: 'project_budget_line' }));
projectsRouter.use('/timesheets', createCrudRouter({ modelName: 'project_timesheet' }));
projectsRouter.use('/change-requests', createCrudRouter({ modelName: 'project_change_request' }));
projectsRouter.use('/change-request-materials', createCrudRouter({ modelName: 'project_change_request_material' }));
projectsRouter.use('/boards', createCrudRouter({ modelName: 'project_board' }));
projectsRouter.use('/board-columns', createCrudRouter({ modelName: 'project_board_column' }));
projectsRouter.use('/task-board-positions', createCrudRouter({ modelName: 'project_task_board_position' }));
projectsRouter.use('/health-rules', createCrudRouter({ modelName: 'project_health_rule' }));
projectsRouter.use('/health-snapshots', createCrudRouter({ modelName: 'project_health_snapshot' }));
projectsRouter.use('/risks', createCrudRouter({ modelName: 'project_risk', searchFields: ['risk_title'] }));
projectsRouter.use('/issues', createCrudRouter({ modelName: 'project_issue', searchFields: ['issue_title'] }));
projectsRouter.use('/issue-actions', createCrudRouter({ modelName: 'project_issue_action' }));
projectsRouter.use('/dispatches', createCrudRouter({ modelName: 'project_dispatch' }));
projectsRouter.use('/technical-briefs', createCrudRouter({ modelName: 'project_technical_brief', searchFields: ['title'] }));
projectsRouter.use('/technical-brief-versions', createCrudRouter({ modelName: 'project_technical_brief_version' }));
projectsRouter.use('/requirements', createCrudRouter({ modelName: 'project_requirement' }));
projectsRouter.use('/acceptance-criterias', createCrudRouter({ modelName: 'project_acceptance_criteria' }));
projectsRouter.use('/resource-requests', createCrudRouter({ modelName: 'project_resource_request' }));
projectsRouter.use('/resource-request-lines', createCrudRouter({ modelName: 'project_resource_request_line' }));
projectsRouter.use('/resource-allocations', createCrudRouter({ modelName: 'project_resource_allocation' }));
projectsRouter.use('/progress-snapshots', createCrudRouter({ modelName: 'project_progress_snapshot' }));
projectsRouter.use('/weekly-progress', createCrudRouter({ modelName: 'project_weekly_progress' }));
projectsRouter.use('/equipment-usages', createCrudRouter({ modelName: 'project_equipment_usage' }));
projectsRouter.use('/weight-indicators', createCrudRouter({ modelName: 'project_weight_indicator' }));
projectsRouter.use('/weight-components', createCrudRouter({ modelName: 'project_weight_component' }));
projectsRouter.use('/main-tasks', createCrudRouter({
  modelName: 'project_main_task',
  searchFields: ['title', 'name'],
  afterUpdate: async (_req, _rec) => {
    await ProjectsService.recalculateTaskTree({ mainTaskId: _rec.id });
  },
}));
projectsRouter.use('/task-assignments', createCrudRouter({ modelName: 'project_task_assignment' }));
projectsRouter.use('/weekly-tasks', createCrudRouter({
  modelName: 'project_weekly_task',
  searchFields: ['title', 'name'],
  afterUpdate: async (_req, _rec) => {
    await ProjectsService.recalculateTaskTree({ weeklyTaskId: _rec.id });
  },
}));
projectsRouter.use('/daily-tasks', createCrudRouter({
  modelName: 'project_daily_task',
  searchFields: ['title', 'name'],
  afterUpdate: async (_req, _rec) => {
    await ProjectsService.recalculateTaskTree({ dailyTaskId: _rec.id });
  },
}));
projectsRouter.use('/task-transfers', createCrudRouter({ modelName: 'project_task_transfer_request' }));
projectsRouter.use('/task-activity-logs', createCrudRouter({ modelName: 'project_task_activity_log' }));
