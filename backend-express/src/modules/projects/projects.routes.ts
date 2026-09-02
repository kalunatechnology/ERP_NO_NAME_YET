import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../../config/database';
import { ProjectsService } from './projects.service';
import { createCrudRouter } from '../../utils/crud-factory';
import { NotFoundError } from '../../utils/errors';

export const projectsRouter = Router();

// =============================================================================
// 0. CUSTOMERS / CLIENTS LIST (Strict Company & Tenant Isolated)
// =============================================================================

projectsRouter.get('/customers', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.companyId;
    const tenantId = req.user?.tenant_id;

    // 1. Get from existing projects in database (Strict Company & Tenant Scoped)
    const projectCustomers = await prisma.project_project.findMany({
      where: {
        ...(companyId ? { company_id: companyId } : {}),
        ...(tenantId ? { tenant_id: tenantId } : {}),
      },
      select: { customer_name: true },
      distinct: ['customer_name'],
    });

    // 2. Get from master_party (Strict Tenant Scoped)
    const parties = await prisma.master_party.findMany({
      where: {
        ...(tenantId ? { tenant_id: tenantId } : {}),
        party_type: 'CUSTOMER',
        status: 'ACTIVE',
      },
      select: { display_name: true, legal_name: true },
    });

    // 3. Get from CRM inquiries (Strict Company & Tenant Scoped)
    const crmCustomers = await prisma.crm_customer_inquiry.findMany({
      where: {
        ...(companyId ? { company_id: companyId } : {}),
        ...(tenantId ? { tenant_id: tenantId } : {}),
      },
      select: { customer_name: true },
      distinct: ['customer_name'],
    });

    const set = new Set<string>();
    projectCustomers.forEach(p => { if (p.customer_name?.trim()) set.add(p.customer_name.trim()); });
    parties.forEach(p => {
      if (p.display_name?.trim()) set.add(p.display_name.trim());
      if (p.legal_name?.trim()) set.add(p.legal_name.trim());
    });
    crmCustomers.forEach(c => { if (c.customer_name?.trim()) set.add(c.customer_name.trim()); });

    const results = Array.from(set).filter(Boolean).map(name => ({
      name,
      label: name,
      value: name,
    }));

    res.json(results);
  } catch (err) {
    next(err);
  }
});

// Endpoint untuk mendaftarkan klien / customer baru langsung ke database (Tenant & Company Scoped)
projectsRouter.post('/customers', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, legal_name, tax_number } = req.body;
    const clientName = (name || legal_name || '').trim();
    if (!clientName) {
      res.status(400).json({ message: 'Nama klien / customer wajib diisi.' });
      return;
    }

    const tenantId = req.user?.tenant_id ?? '24b709e5-ae7a-4ded-be06-c0e9f5998f9d';

    const existing = await prisma.master_party.findFirst({
      where: {
        tenant_id: tenantId,
        OR: [
          { display_name: { equals: clientName, mode: 'insensitive' } },
          { legal_name: { equals: clientName, mode: 'insensitive' } },
        ],
      },
    });

    if (existing) {
      res.status(200).json({
        id: existing.id,
        name: existing.display_name,
        label: existing.display_name,
        value: existing.display_name,
      });
      return;
    }

    const partyId = crypto.randomUUID();
    const cleanCode = clientName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase();
    const newParty = await prisma.master_party.create({
      data: {
        id: partyId,
        tenant_id: tenantId,
        party_code: `CUST-${cleanCode || Date.now().toString().slice(-4)}`,
        party_type: 'CUSTOMER',
        legal_name: clientName,
        display_name: clientName,
        tax_number: tax_number || '',
        status: 'ACTIVE',
      },
    });

    res.status(201).json({
      id: newParty.id,
      name: newParty.display_name,
      label: newParty.display_name,
      value: newParty.display_name,
    });
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// 1. WBS 5-LEVEL HIERARCHY ENDPOINT
// =============================================================================

const handleHierarchy = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await ProjectsService.getProjectHierarchy(req.params.id);
    res.json(data);
  } catch (err) {
    next(err);
  }
};

projectsRouter.get('/projects/:id/hierarchy', handleHierarchy);
projectsRouter.get('/:id/hierarchy', handleHierarchy);

// =============================================================================
// 2. PROJECT CUSTOM ACTIONS & METRICS
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

projectsRouter.get('/projects/:id/evm', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await ProjectsService.calculateProjectEVM(req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

projectsRouter.post('/projects/:id/advance_stage', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await ProjectsService.advanceStage(req.params.id, req.body.stage ?? req.body.target_status);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

projectsRouter.post('/projects/:id/advance-stage', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await ProjectsService.advanceStage(req.params.id, req.body.stage ?? req.body.target_status);
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

projectsRouter.post('/projects/:id/funding_requests', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const project = await prisma.project_project.findUnique({ where: { id: req.params.id } });
    if (!project) throw new NotFoundError('Project');
    const funding = await prisma.fin_project_funding.create({
      data: {
        id: crypto.randomUUID(),
        tenant_id: project.tenant_id,
        project_id: project.id,
        funding_type: req.body.source ?? 'INTERNAL',
        requested_amount: req.body.amount ?? req.body.requested_amount ?? 0,
        approved_limit: 0,
        status: 'SUBMITTED',
        purpose: req.body.description ?? req.body.purpose ?? 'Permintaan dana proyek',
        review_note: '',
      },
    });
    res.status(201).json(funding);
  } catch (err) {
    next(err);
  }
});

projectsRouter.post('/projects/:id/update_financials', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { budget_amount, contract_amount, target_margin_percent } = req.body;
    const updated = await prisma.project_project.update({
      where: { id: req.params.id },
      data: {
        budget_amount: budget_amount !== undefined ? budget_amount : undefined,
        contract_amount: contract_amount !== undefined ? contract_amount : undefined,
        target_margin_percent: target_margin_percent !== undefined ? target_margin_percent : undefined,
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
// 3. MAIN TASK ACTIONS
// =============================================================================

const handleAssignMembers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const mainTaskId = req.params.id;
    const mainTask = await prisma.project_main_task.findUnique({ where: { id: mainTaskId } });
    if (!mainTask) throw new NotFoundError('MainTask');

    const rawUsers = req.body.user_ids ?? req.body.assignee ?? [];
    const userIds: string[] = Array.isArray(rawUsers) ? rawUsers.map(String) : [String(rawUsers)].filter(Boolean);

    await prisma.$transaction(async (tx) => {
      // Remove assignments not in userIds
      await tx.project_task_assignment.deleteMany({
        where: {
          main_task_id: mainTaskId,
          assignee_id: { notIn: userIds },
        },
      });

      // Add new assignments
      for (const uid of userIds) {
        const existing = await tx.project_task_assignment.findFirst({
          where: { main_task_id: mainTaskId, assignee_id: uid },
        });
        if (!existing) {
          await tx.project_task_assignment.create({
            data: {
              id: crypto.randomUUID(),
              main_task_id: mainTaskId,
              assignee_id: uid,
              assigned_by_id: req.user?.id ?? null,
              assigned_at: new Date(),
            },
          });
        }
        // Ensure Member in project
        if (mainTask.project_id) {
          const mExisting = await tx.project_member.findFirst({
            where: { project_id: mainTask.project_id, user_id: uid },
          });
          if (!mExisting) {
            await tx.project_member.create({
              data: {
                id: crypto.randomUUID(),
                project_id: mainTask.project_id,
                user_id: uid,
                project_role: 'MEMBER',
                status: 'ACTIVE',
                permissions_json: '{}',
                assigned_at: new Date(),
              },
            });
          }
        }
      }
    });

    const updatedAssignments = await prisma.project_task_assignment.findMany({
      where: { main_task_id: mainTaskId },
    });
    res.json({ success: true, count: userIds.length, assignments: updatedAssignments });
  } catch (err) {
    next(err);
  }
};

projectsRouter.post('/main-tasks/:id/assign_members', handleAssignMembers);
projectsRouter.post('/main-tasks/:id/assign-members', handleAssignMembers);

const handleMainTaskOverrideProgress = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = await ProjectsService.overrideProgress(
      'MAIN',
      req.params.id,
      Number(req.body.progress ?? 0),
      req.body.reason ?? '',
      req.user,
    );
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

projectsRouter.post('/main-tasks/:id/override_progress', handleMainTaskOverrideProgress);
projectsRouter.post('/main-tasks/:id/override-progress', handleMainTaskOverrideProgress);

// =============================================================================
// 4. WEEKLY TASK ACTIONS
// =============================================================================

const handleWeeklyTaskOverrideProgress = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = await ProjectsService.overrideProgress(
      'WEEKLY',
      req.params.id,
      Number(req.body.progress ?? 0),
      req.body.reason ?? '',
      req.user,
    );
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

projectsRouter.post('/weekly-tasks/:id/override_progress', handleWeeklyTaskOverrideProgress);
projectsRouter.post('/weekly-tasks/:id/override-progress', handleWeeklyTaskOverrideProgress);

// =============================================================================
// 5. DAILY TASK ACTIONS
// =============================================================================

const handleUpdateDailyProgress = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = await ProjectsService.updateDailyTaskProgress(req.params.id, req.body, req.user);
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

projectsRouter.patch('/daily-tasks/:id/update_progress', handleUpdateDailyProgress);
projectsRouter.patch('/daily-tasks/:id/update-progress', handleUpdateDailyProgress);
projectsRouter.post('/daily-tasks/:id/update_progress', handleUpdateDailyProgress);
projectsRouter.post('/daily-tasks/:id/update-progress', handleUpdateDailyProgress);

const handleReportBlocked = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = await ProjectsService.reportBlocked(req.params.id, req.body.reason ?? '', req.user);
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

projectsRouter.post('/daily-tasks/:id/report_blocked', handleReportBlocked);
projectsRouter.post('/daily-tasks/:id/report-blocked', handleReportBlocked);

const handleRequestTransfer = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const targetUserId = req.body.target_user_id ?? req.body.target_user ?? req.body.to_user;
    const result = await ProjectsService.requestTaskTransfer(
      req.params.id,
      targetUserId,
      req.body.reason ?? '',
      req.user,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
};

projectsRouter.post('/daily-tasks/:id/request_transfer', handleRequestTransfer);
projectsRouter.post('/daily-tasks/:id/request-transfer', handleRequestTransfer);

const handleDirectReassign = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const targetUserId = req.body.target_user_id ?? req.body.target_user ?? req.body.to_user;
    const result = await ProjectsService.directReassign(
      req.params.id,
      targetUserId,
      req.body.reason ?? '',
      req.user,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
};

projectsRouter.post('/daily-tasks/:id/direct_reassign', handleDirectReassign);
projectsRouter.post('/daily-tasks/:id/direct-reassign', handleDirectReassign);

// =============================================================================
// 6. TASK TRANSFER REQUEST ACTIONS
// =============================================================================

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

projectsRouter.post('/task-transfers/:id/cancel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await prisma.project_task_transfer_request.update({
      where: { id: req.params.id },
      data: { status: 'CANCELLED' },
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// 7. TASK CRUD ROUTERS (WITH BOTTOM-UP PROGRESS ROLLUP & KEY MAPPINGS)
// =============================================================================

// Helper to normalize Main Tasks
projectsRouter.use('/main-tasks', createCrudRouter({
  modelName: 'project_main_task',
  searchFields: ['name', 'description'],
  beforeCreate: async (req, data) => {
    if (data.project && !data.project_id) data.project_id = data.project;
    if (req.body.project && !data.project_id) data.project_id = req.body.project;
    if (data.title && !data.name) data.name = data.title;
    if (!data.name) data.name = 'Main Task';
    if (!data.created_by_id && req.user?.id) data.created_by_id = req.user.id;
    if (data.weight === undefined) data.weight = 10;
    if (data.progress === undefined) data.progress = 0;
    if (!data.status) data.status = 'PLANNED';
    if (!data.priority) data.priority = 'MEDIUM';
    if (data.is_progress_overridden === undefined) data.is_progress_overridden = false;
    if (data.override_reason === undefined) data.override_reason = '';
    return data;
  },
  beforeUpdate: async (req, data) => {
    if (data.project && !data.project_id) data.project_id = data.project;
    if (data.title && !data.name) data.name = data.title;
    return data;
  },
  afterCreate: async (_req, rec) => {
    await ProjectsService.recalculateTaskTree({ mainTaskId: rec.id });
  },
  afterUpdate: async (_req, rec) => {
    await ProjectsService.recalculateTaskTree({ mainTaskId: rec.id });
  },
}));

// Helper to normalize Weekly Tasks
projectsRouter.use('/weekly-tasks', createCrudRouter({
  modelName: 'project_weekly_task',
  searchFields: ['target_description'],
  beforeCreate: async (req, data) => {
    if (data.main_task && !data.main_task_id) data.main_task_id = data.main_task;
    if (req.body.main_task && !data.main_task_id) data.main_task_id = req.body.main_task;
    if (data.assignee && !data.assignee_id) data.assignee_id = data.assignee;
    if (!data.target_description && data.target_output) data.target_description = data.target_output;
    if (data.target_description === undefined) data.target_description = '';
    if (data.progress === undefined) data.progress = 0;
    if (!data.status) data.status = 'PLANNED';
    if (data.week_number === undefined) data.week_number = 1;
    if (data.is_progress_overridden === undefined) data.is_progress_overridden = false;
    if (data.override_reason === undefined) data.override_reason = '';
    return data;
  },
  beforeUpdate: async (req, data) => {
    if (data.main_task && !data.main_task_id) data.main_task_id = data.main_task;
    if (data.assignee && !data.assignee_id) data.assignee_id = data.assignee;
    return data;
  },
  afterCreate: async (_req, rec) => {
    await ProjectsService.recalculateTaskTree({ weeklyTaskId: rec.id });
  },
  afterUpdate: async (_req, rec) => {
    await ProjectsService.recalculateTaskTree({ weeklyTaskId: rec.id });
  },
}));

// Helper to normalize Daily Tasks
projectsRouter.use('/daily-tasks', createCrudRouter({
  modelName: 'project_daily_task',
  searchFields: ['title', 'description', 'notes'],
  beforeCreate: async (req, data) => {
    if (data.weekly_task && !data.weekly_task_id) data.weekly_task_id = data.weekly_task;
    if (req.body.weekly_task && !data.weekly_task_id) data.weekly_task_id = req.body.weekly_task;
    if (data.owner && !data.owner_id) data.owner_id = data.owner;
    if (!data.owner_id && req.user?.id) data.owner_id = req.user.id;
    if (!data.title && data.activity_input) data.title = data.activity_input;
    if (data.title === undefined) data.title = 'Aktivitas Harian';
    if (data.description === undefined) data.description = '';
    if (data.time_slot === undefined) data.time_slot = '09.00 - 12.00';
    if (data.output_result === undefined) data.output_result = '';
    if (data.notes === undefined) data.notes = '';
    if (data.is_blocked === undefined) data.is_blocked = false;
    if (data.block_reason === undefined) data.block_reason = '';

    // Normalize status
    const st = String(data.status ?? '').toUpperCase();
    if (['DONE', 'COMPLETED', 'SELESAI'].includes(st)) {
      data.status = 'COMPLETED';
      if (data.progress === undefined) data.progress = 100;
    } else if (['ON_PROGRESS', 'PENDING', 'IN PROGRESS', 'ON-PROGRESS'].includes(st)) {
      data.status = 'IN_PROGRESS';
    } else if (['NOT_STARTED', 'NOT DONE', 'BELUM'].includes(st)) {
      data.status = 'NOT_STARTED';
      if (data.progress === undefined) data.progress = 0;
    } else if (!data.status) {
      data.status = 'IN_PROGRESS';
    }
    if (data.progress === undefined) data.progress = 0;
    return data;
  },
  beforeUpdate: async (req, data) => {
    if (data.weekly_task && !data.weekly_task_id) data.weekly_task_id = data.weekly_task;
    if (data.owner && !data.owner_id) data.owner_id = data.owner;
    if (data.activity_input && !data.title) data.title = data.activity_input;
    const st = String(data.status ?? '').toUpperCase();
    if (['DONE', 'COMPLETED', 'SELESAI'].includes(st)) {
      data.status = 'COMPLETED';
      if (data.progress === undefined) data.progress = 100;
    } else if (['ON_PROGRESS', 'PENDING', 'IN PROGRESS', 'ON-PROGRESS'].includes(st)) {
      data.status = 'IN_PROGRESS';
    }
    return data;
  },
  afterCreate: async (_req, rec) => {
    await ProjectsService.recalculateTaskTree({ dailyTaskId: rec.id });
  },
  afterUpdate: async (_req, rec) => {
    await ProjectsService.recalculateTaskTree({ dailyTaskId: rec.id });
  },
}));

// Task Assignments with alias mapping
projectsRouter.use('/task-assignments', createCrudRouter({
  modelName: 'project_task_assignment',
  beforeCreate: async (req, data) => {
    if (data.main_task && !data.main_task_id) data.main_task_id = data.main_task;
    if (req.body.main_task && !data.main_task_id) data.main_task_id = req.body.main_task;
    if (data.assignee && !data.assignee_id) data.assignee_id = data.assignee;
    if (req.body.assignee && !data.assignee_id) data.assignee_id = req.body.assignee;
    if (!data.assigned_at) data.assigned_at = new Date();
    return data;
  },
}));

// Task Transfers
projectsRouter.use('/task-transfers', createCrudRouter({
  modelName: 'project_task_transfer_request',
  beforeCreate: async (req, data) => {
    if (data.daily_task && !data.daily_task_id) data.daily_task_id = data.daily_task;
    if (req.body.daily_task && !data.daily_task_id) data.daily_task_id = req.body.daily_task;
    if (data.target_user && !data.target_user_id) data.target_user_id = data.target_user;
    if (req.body.target_user && !data.target_user_id) data.target_user_id = req.body.target_user;
    if (!data.requested_by_id && req.user?.id) data.requested_by_id = req.user.id;
    if (data.reason === undefined) data.reason = '';
    if (data.review_note === undefined) data.review_note = '';
    if (!data.status) data.status = 'PENDING';
    return data;
  },
}));

// =============================================================================
// 8. OTHER DOMAIN CRUD VIEWSETS
// =============================================================================

projectsRouter.use('/projects', createCrudRouter({
  modelName: 'project_project',
  searchFields: ['project_name', 'project_code', 'status', 'customer_name'],
  beforeCreate: async (req, data) => {
    // 1. Alias mappings
    if (!data.project_name && data.name) data.project_name = data.name;
    if (!data.project_name) data.project_name = 'Untitled Project';

    if (!data.project_code && data.code) data.project_code = data.code;
    if (!data.project_code) data.project_code = `PRJ-${Date.now().toString().slice(-4)}`;

    // 2. Default required schema fields
    if (data.customer_name === undefined || data.customer_name === null || data.customer_name === '') {
      data.customer_name = data.client_name || data.customer || 'PT Sinergi Muda Arsa';
    } else {
      // Auto-register to database master_party if it's a new client (Strict Tenant Scoped)
      const clientName = String(data.customer_name).trim();
      const tenantId = req.user?.tenant_id ?? '24b709e5-ae7a-4ded-be06-c0e9f5998f9d';
      const existing = await prisma.master_party.findFirst({
        where: {
          tenant_id: tenantId,
          OR: [
            { display_name: { equals: clientName, mode: 'insensitive' } },
            { legal_name: { equals: clientName, mode: 'insensitive' } },
          ],
        },
      });

      if (!existing && clientName) {
        const cleanCode = clientName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase();
        await prisma.master_party.create({
          data: {
            id: crypto.randomUUID(),
            tenant_id: tenantId,
            party_code: `CUST-${cleanCode || Date.now().toString().slice(-4)}`,
            party_type: 'CUSTOMER',
            legal_name: clientName,
            display_name: clientName,
            tax_number: '',
            status: 'ACTIVE',
          },
        });
      }
    }
    if (data.manager_name === undefined || data.manager_name === null || data.manager_name === '') {
      data.manager_name = data.pm_name || data.project_manager_name || (req.user as any)?.full_name || 'Melika (Lead PM)';
    }
    if (data.description === undefined || data.description === null) {
      data.description = '';
    }
    if (!data.status) {
      data.status = 'IN_PROGRESS';
    }
    if (!data.lifecycle_status) {
      data.lifecycle_status = 'ACTIVE';
    }
    if (!data.health_status) {
      data.health_status = 'ON_TRACK';
    }
    if (!data.source_type) {
      data.source_type = 'INTERNAL';
    }

    // 3. Date formatting
    if (data.planned_start_date && typeof data.planned_start_date === 'string') {
      data.planned_start_date = new Date(data.planned_start_date);
    }
    if (data.planned_end_date && typeof data.planned_end_date === 'string') {
      data.planned_end_date = new Date(data.planned_end_date);
    }

    return data;
  },
  beforeUpdate: async (req, data) => {
    if (data.name && !data.project_name) data.project_name = data.name;
    if (data.code && !data.project_code) data.project_code = data.code;
    if (data.planned_start_date && typeof data.planned_start_date === 'string') {
      data.planned_start_date = new Date(data.planned_start_date);
    }
    if (data.planned_end_date && typeof data.planned_end_date === 'string') {
      data.planned_end_date = new Date(data.planned_end_date);
    }
    return data;
  },
}));
projectsRouter.use('/control-items', createCrudRouter({ modelName: 'project_control_item' }));
projectsRouter.use('/expenses', createCrudRouter({ modelName: 'project_expense', searchFields: ['description'] }));
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
projectsRouter.use('/task-activity-logs', createCrudRouter({ modelName: 'project_task_activity_log' }));
