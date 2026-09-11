/**
 * File: backend-express/src/modules/projects/projects.routes.ts
 *
 * Purpose: Implements Express API routing responsibilities for the projects domain.
 * Responsibility: Defines the executable contracts in this file and connects them to their callers without owning unrelated domain behavior.
 * Integration: Used through static imports, Express/Next framework discovery, or an explicit npm/script entry point as applicable.
 * Dependencies and side effects: See each documented function; database, browser storage, network, and response mutations are called out where present.
 */
import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../../config/database';
import { ProjectsService } from './projects.service';
import { createCrudRouter } from '../../utils/crud-factory';
import { ForbiddenError, NotFoundError, ValidationError } from '../../utils/errors';
import { RoleCode } from '../../types/roles';

export const projectsRouter = Router();

function activeCompanyId(req: Request): string {
  if (!req.companyId) throw new ForbiddenError('Pilih company sebelum mengakses data proyek.');
  return req.companyId;
}

function activeTenantId(req: Request): string {
  const tenantId = req.user?.tenant_id;

  if (!tenantId) {
    throw new ForbiddenError(
      'Tenant aktif tidak tersedia.',
    );
  }

  return tenantId;
}

function activeUserId(req: Request): string {
  const userId = req.user?.id;

  if (!userId) {
    throw new ForbiddenError(
      'User aktif tidak tersedia.',
    );
  }

  return userId;
}

function isStaff(req: Request): boolean {
  return (
    req.user?.active_role_code ===
    RoleCode.STAFF
  );
}

/**
 * Identity mapping:
 *
 * iam_user
 *     ↓
 * master_employee.user_id
 *     ↓
 * project_timesheet.employee_id
 */
async function currentEmployee(req: Request) {
  const companyId =
    activeCompanyId(req);

  const tenantId =
    activeTenantId(req);

  const userId =
    activeUserId(req);

  const employee =
    await prisma.master_employee.findFirst({
      where: {
        tenant_id:
          tenantId,

        company_id:
          companyId,

        user_id:
          userId,
      },

      select: {
        id:
          true,

        user_id:
          true,

        employee_number:
          true,

        employment_status:
          true,

        standard_hourly_rate:
          true,
      },
    });

  if (employee) {
    return employee;
  }

  // Backward-compatible transition path. Only use an explicit employee_id
  // already stored on an active project membership; never infer identity from
  // names, usernames, employee numbers, or coincidentally equal IDs.
  const existingProjectMember =
    await prisma.project_member.findFirst({
      where: {
        tenant_id: tenantId,
        company_id: companyId,
        user_id: userId,
        employee_id: { not: null },
        status: 'ACTIVE',
      },
      select: { employee_id: true },
      orderBy: { assigned_at: 'desc' },
    });

  if (existingProjectMember?.employee_id) {
    const mappedEmployee =
      await prisma.master_employee.findFirst({
        where: {
          id: existingProjectMember.employee_id,
          tenant_id: tenantId,
          company_id: companyId,
        },
        select: {
          id: true,
          user_id: true,
          employee_number: true,
          employment_status: true,
          standard_hourly_rate: true,
        },
      });

    if (mappedEmployee) return mappedEmployee;
  }

  throw new ForbiddenError(
    'Akun user belum terhubung dengan data employee.',
  );
}

// =============================================================================
// 0. CUSTOMERS / CLIENTS LIST (Strict Company & Tenant Isolated)
// =============================================================================

/**
 * GET route handler: `/customers`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Uses Prisma model(s) `project_project`, `master_party`, `crm_customer_inquiry` in the handler path.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
projectsRouter.get('/customers', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = activeCompanyId(req);
    const tenantId = req.user?.tenant_id;

    const [projectCustomers, parties, crmCustomers] = await Promise.all([
      prisma.project_project.findMany({
      where: {
        company_id: companyId,
        ...(tenantId ? { tenant_id: tenantId } : {}),
      },
      select: { customer_name: true },
      distinct: ['customer_name'],
      }),
      prisma.master_party.findMany({
      where: {
        ...(tenantId ? { tenant_id: tenantId } : {}),
        company_id: companyId,
        party_type: 'CUSTOMER',
        status: 'ACTIVE',
      },
      select: { display_name: true, legal_name: true },
      }),
      prisma.crm_customer_inquiry.findMany({
      where: {
        company_id: companyId,
        ...(tenantId ? { tenant_id: tenantId } : {}),
      },
      select: { customer_name: true },
      distinct: ['customer_name'],
      }),
    ]);

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
/**
 * POST route handler: `/customers`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
projectsRouter.post('/customers', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, legal_name, tax_number } = req.body;
/**
 * clientName implements a named function within this file's Express API routing boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: Reads or mutates Prisma model(s) `master_party`; transaction boundaries are exactly those visible in the body.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
    const clientName = (name || legal_name || '').trim();
    if (!clientName) {
      res.status(400).json({ message: 'Nama klien / customer wajib diisi.' });
      return;
    }

    const tenantId = req.user?.tenant_id;
    const companyId = activeCompanyId(req);
    if (!tenantId) throw new ForbiddenError('Tenant user tidak tersedia.');

    const existing = await prisma.master_party.findFirst({
      where: {
        tenant_id: tenantId,
        company_id: companyId,
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
        company_id: companyId,
        created_by_id: req.user?.id,
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

/**
 * handleHierarchy implements a named function within this file's Express API routing boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: No database operation is implied unless explicitly present in the implementation.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
const handleHierarchy = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await ProjectsService.getProjectHierarchy(req.params.id, activeCompanyId(req));
    res.json(data);
  } catch (err) {
    next(err);
  }
};

const enforceProjectBoundary = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const companyId = activeCompanyId(req);
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      await ProjectsService.assertCanManageProject(req.user, req.params.id, companyId);
    } else {
      await ProjectsService.assertCanViewProject(req.user, req.params.id, companyId);
    }
    next();
  } catch (err) {
    next(err);
  }
};

projectsRouter.use('/projects/:id', enforceProjectBoundary);

/**
 * GET route handler: `/projects/:id/hierarchy`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
projectsRouter.get('/projects/:id/hierarchy', handleHierarchy);
/**
 * GET route handler: `/:id/hierarchy`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
projectsRouter.get('/:id/hierarchy', enforceProjectBoundary, handleHierarchy);

// =============================================================================
// 2. PROJECT CUSTOM ACTIONS & METRICS
// =============================================================================

/**
 * POST route handler: `/projects/:id/recalculate_health`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
projectsRouter.post('/projects/:id/recalculate_health', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await ProjectsService.calculateProjectEVM(req.params.id, new Date(), activeCompanyId(req));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET route handler: `/projects/:id/health`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
projectsRouter.get('/projects/:id/health', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await ProjectsService.calculateProjectEVM(req.params.id, new Date(), activeCompanyId(req));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET route handler: `/projects/:id/evm-metrics`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
projectsRouter.get('/projects/:id/evm-metrics', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await ProjectsService.calculateProjectEVM(req.params.id, new Date(), activeCompanyId(req));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET route handler: `/projects/:id/evm`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
projectsRouter.get('/projects/:id/evm', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await ProjectsService.calculateProjectEVM(req.params.id, new Date(), activeCompanyId(req));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST route handler: `/projects/:id/advance_stage`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
projectsRouter.post('/projects/:id/advance_stage', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await ProjectsService.advanceStage(req.params.id, req.body.stage ?? req.body.target_status, activeCompanyId(req));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST route handler: `/projects/:id/advance-stage`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
projectsRouter.post('/projects/:id/advance-stage', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await ProjectsService.advanceStage(req.params.id, req.body.stage ?? req.body.target_status, activeCompanyId(req));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET route handler: `/projects/:id/financial-performance`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
projectsRouter.get('/projects/:id/financial-performance', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await ProjectsService.calculateProjectEVM(req.params.id, new Date(), activeCompanyId(req));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET route handler: `/projects/:id/funding_requests`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Uses Prisma model(s) `fin_project_funding` in the handler path.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
projectsRouter.get('/projects/:id/funding_requests', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const fundings = await prisma.fin_project_funding.findMany({
      where: { project_id: req.params.id, company_id: activeCompanyId(req) },
    });
    res.json(fundings);
  } catch (err) {
    next(err);
  }
});

/**
 * POST route handler: `/projects/:id/funding_requests`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Uses Prisma model(s) `project_project`, `fin_project_funding` in the handler path.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
projectsRouter.post('/projects/:id/funding_requests', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const project = await prisma.project_project.findFirst({ where: { id: req.params.id, company_id: activeCompanyId(req) } });
    if (!project) throw new NotFoundError('Project');
    const funding = await prisma.fin_project_funding.create({
      data: {
        id: crypto.randomUUID(),
        tenant_id: project.tenant_id,
        company_id: project.company_id,
        created_by_id: req.user?.id,
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

/**
 * POST route handler: `/projects/:id/update_financials`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Uses Prisma model(s) `project_project` in the handler path.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
projectsRouter.post('/projects/:id/update_financials', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { budget_amount, contract_amount, target_margin_percent } = req.body;
    const project = await prisma.project_project.findFirst({ where: { id: req.params.id, company_id: activeCompanyId(req) }, select: { id: true } });
    if (!project) throw new NotFoundError('Project');
    const updated = await prisma.project_project.update({
      where: { id: project.id },
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

/**
 * GET route handler: `/projects/:id/costs`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Uses Prisma model(s) `fin_project_cost_entry`, `project_expense` in the handler path.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
projectsRouter.get('/projects/:id/costs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = activeCompanyId(req);
    const [entries, expenses] = await Promise.all([
      prisma.fin_project_cost_entry.findMany({ where: { project_id: req.params.id, company_id: companyId } }),
      prisma.project_expense.findMany({ where: { project_id: req.params.id, company_id: companyId } }),
    ]);
    res.json({ entries, expenses });
  } catch (err) {
    next(err);
  }
});

/**
 * GET route handler: `/projects/:id/milestones`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Uses Prisma model(s) `project_milestone` in the handler path.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
projectsRouter.get('/projects/:id/milestones', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const milestones = await prisma.project_milestone.findMany({
      where: { project_id: req.params.id, company_id: activeCompanyId(req) },
    });
    res.json(milestones);
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// 3. MAIN TASK ACTIONS
// =============================================================================

/**
 * handleAssignMembers implements a named function within this file's Express API routing boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: Reads or mutates Prisma model(s) `project_main_task`, `project_task_assignment`; transaction boundaries are exactly those visible in the body.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
const handleAssignMembers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const mainTaskId = req.params.id;
    const companyId = activeCompanyId(req);
    const mainTask = await prisma.project_main_task.findFirst({ where: { id: mainTaskId, company_id: companyId } });
    if (!mainTask) throw new NotFoundError('MainTask');
    await ProjectsService.assertCanManageProject(req.user, mainTask.project_id, companyId);

    const rawUsers = req.body.user_ids ?? req.body.assignee ?? [];
    const userIds: string[] = [...new Set(Array.isArray(rawUsers) ? rawUsers.map(String) : [String(rawUsers)].filter(Boolean))];
    const memberships = userIds.length ? await prisma.iam_user_company_membership.findMany({
      where: { company_id: companyId, user_id: { in: userIds }, status: 'ACTIVE' },
      select: { user_id: true },
    }) : [];
    if (memberships.length !== userIds.length) throw new ForbiddenError('Satu atau lebih assignee berada di luar company aktif.');

    await prisma.$transaction(async (tx) => {
      // Remove assignments not in userIds
      await tx.project_task_assignment.deleteMany({
        where: {
          main_task_id: mainTaskId,
          company_id: companyId,
          assignee_id: { notIn: userIds },
        },
      });

      const [existingAssignments, existingMembers] = await Promise.all([
        tx.project_task_assignment.findMany({
          where: { main_task_id: mainTaskId, company_id: companyId, assignee_id: { in: userIds } },
          select: { assignee_id: true },
        }),
        mainTask.project_id ? tx.project_member.findMany({
          where: { project_id: mainTask.project_id, company_id: companyId, user_id: { in: userIds } },
          select: { user_id: true },
        }) : Promise.resolve([]),
      ]);
      const assignedIds = new Set(existingAssignments.map((item) => item.assignee_id));
      const memberIds = new Set(existingMembers.map((item) => item.user_id).filter(Boolean));
      const newAssignments = userIds.filter((uid) => !assignedIds.has(uid)).map((uid) => ({
              id: crypto.randomUUID(),
              tenant_id: mainTask.tenant_id,
              company_id: companyId,
              created_by_id: req.user?.id,
              main_task_id: mainTaskId,
              assignee_id: uid,
              assigned_by_id: req.user?.id ?? null,
              assigned_at: new Date(),
      }));
      if (newAssignments.length) await tx.project_task_assignment.createMany({ data: newAssignments });
      if (mainTask.project_id) {
        const newMembers = userIds.filter((uid) => !memberIds.has(uid)).map((uid) => ({
                id: crypto.randomUUID(),
                tenant_id: mainTask.tenant_id,
                company_id: companyId,
                created_by_id: req.user?.id,
                project_id: mainTask.project_id,
                user_id: uid,
                project_role: 'MEMBER',
                status: 'ACTIVE',
                permissions_json: '{}',
                assigned_at: new Date(),
        }));
        if (newMembers.length) await tx.project_member.createMany({ data: newMembers });
      }
    });

    const updatedAssignments = await prisma.project_task_assignment.findMany({
      where: { main_task_id: mainTaskId, company_id: companyId },
    });
    res.json({ success: true, count: userIds.length, assignments: updatedAssignments });
  } catch (err) {
    next(err);
  }
};

/**
 * POST route handler: `/main-tasks/:id/assign_members`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
projectsRouter.post('/main-tasks/:id/assign_members', handleAssignMembers);
/**
 * POST route handler: `/main-tasks/:id/assign-members`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
projectsRouter.post('/main-tasks/:id/assign-members', handleAssignMembers);

/**
 * handleMainTaskOverrideProgress implements a named function within this file's Express API routing boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: No database operation is implied unless explicitly present in the implementation.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
const handleMainTaskOverrideProgress = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = await ProjectsService.overrideProgress(
      'MAIN',
      req.params.id,
      Number(req.body.progress ?? 0),
      req.body.reason ?? '',
      req.user,
      activeCompanyId(req),
    );
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

/**
 * POST route handler: `/main-tasks/:id/override_progress`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
/**
 * POST route handler: `/main-tasks/:id/override-progress`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */

// =============================================================================
// 4. WEEKLY TASK ACTIONS
// =============================================================================

/**
 * handleWeeklyTaskOverrideProgress implements a named function within this file's Express API routing boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: No database operation is implied unless explicitly present in the implementation.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
const handleWeeklyTaskOverrideProgress = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = await ProjectsService.overrideProgress(
      'WEEKLY',
      req.params.id,
      Number(req.body.progress ?? 0),
      req.body.reason ?? '',
      req.user,
      activeCompanyId(req),
    );
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

/**
 * POST route handler: `/weekly-tasks/:id/override_progress`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
/**
 * POST route handler: `/weekly-tasks/:id/override-progress`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */

// =============================================================================
// 5. DAILY TASK ACTIONS
// =============================================================================

/**
 * handleUpdateDailyProgress implements a named function within this file's Express API routing boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: No database operation is implied unless explicitly present in the implementation.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
const handleUpdateDailyProgress = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = await ProjectsService.updateDailyTaskProgress(req.params.id, req.body, req.user, activeCompanyId(req));
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH route handler: `/daily-tasks/:id/update_progress`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
projectsRouter.patch('/daily-tasks/:id/update_progress', handleUpdateDailyProgress);
/**
 * PATCH route handler: `/daily-tasks/:id/update-progress`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
projectsRouter.patch('/daily-tasks/:id/update-progress', handleUpdateDailyProgress);
/**
 * POST route handler: `/daily-tasks/:id/update_progress`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
projectsRouter.post('/daily-tasks/:id/update_progress', handleUpdateDailyProgress);
/**
 * POST route handler: `/daily-tasks/:id/update-progress`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
projectsRouter.post('/daily-tasks/:id/update-progress', handleUpdateDailyProgress);

/**
 * handleReportBlocked implements a named function within this file's Express API routing boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: No database operation is implied unless explicitly present in the implementation.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
const handleReportBlocked = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = await ProjectsService.reportBlocked(req.params.id, req.body.reason ?? '', req.user, activeCompanyId(req));
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

/**
 * POST route handler: `/daily-tasks/:id/report_blocked`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
projectsRouter.post('/daily-tasks/:id/report_blocked', handleReportBlocked);
/**
 * POST route handler: `/daily-tasks/:id/report-blocked`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
projectsRouter.post('/daily-tasks/:id/report-blocked', handleReportBlocked);

/**
 * handleRequestTransfer implements a named function within this file's Express API routing boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: No database operation is implied unless explicitly present in the implementation.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
const handleRequestTransfer = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const targetUserId = req.body.target_user_id ?? req.body.target_user ?? req.body.to_user;
    const result = await ProjectsService.requestTaskTransfer(
      req.params.id,
      targetUserId,
      req.body.reason ?? '',
      req.user,
      activeCompanyId(req),
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
};

/**
 * POST route handler: `/daily-tasks/:id/request_transfer`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
projectsRouter.post('/daily-tasks/:id/request_transfer', handleRequestTransfer);
/**
 * POST route handler: `/daily-tasks/:id/request-transfer`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
projectsRouter.post('/daily-tasks/:id/request-transfer', handleRequestTransfer);

/**
 * handleDirectReassign implements a named function within this file's Express API routing boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: No database operation is implied unless explicitly present in the implementation.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
const handleDirectReassign = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const targetUserId = req.body.target_user_id ?? req.body.target_user ?? req.body.to_user;
    const result = await ProjectsService.directReassign(
      req.params.id,
      targetUserId,
      req.body.reason ?? '',
      req.user,
      activeCompanyId(req),
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
};

/**
 * POST route handler: `/daily-tasks/:id/direct_reassign`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
projectsRouter.post('/daily-tasks/:id/direct_reassign', handleDirectReassign);
/**
 * POST route handler: `/daily-tasks/:id/direct-reassign`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
projectsRouter.post('/daily-tasks/:id/direct-reassign', handleDirectReassign);

// =============================================================================
// 6. TASK TRANSFER REQUEST ACTIONS
// =============================================================================

/**
 * POST route handler: `/task-transfers/:id/approve`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
projectsRouter.post('/task-transfers/:id/approve', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await ProjectsService.processTransferApproval(
      req.params.id,
      true,
      req.user,
      req.body.review_note ?? '',
      activeCompanyId(req),
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST route handler: `/task-transfers/:id/reject`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
projectsRouter.post('/task-transfers/:id/reject', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await ProjectsService.processTransferApproval(
      req.params.id,
      false,
      req.user,
      req.body.review_note ?? '',
      activeCompanyId(req),
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST route handler: `/task-transfers/:id/cancel`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Uses Prisma model(s) `project_task_transfer_request` in the handler path.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
projectsRouter.post('/task-transfers/:id/cancel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = activeCompanyId(req);
    const transfer = await prisma.project_task_transfer_request.findFirst({
      where: { id: req.params.id, company_id: companyId, requested_by_id: req.user?.id, status: 'PENDING' },
      select: { id: true },
    });
    if (!transfer) throw new NotFoundError('TaskTransferRequest');
    const result = await prisma.project_task_transfer_request.update({
      where: { id: transfer.id },
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
  accessWhere: async (req) => ProjectsService.mainTaskAccessWhere(req.user, activeCompanyId(req)),
  beforeCreate: async (req, data) => {
    if (data.project && !data.project_id) data.project_id = data.project;
    if (req.body.project && !data.project_id) data.project_id = req.body.project;
    if (data.title && !data.name) data.name = data.title;
    if (!String(data.name ?? '').trim()) throw new ValidationError('Nama Main Task wajib diisi.');
    const projectId = String(data.project_id ?? '');
    const project = projectId
      ? await prisma.project_project.findFirst({ where: { id: projectId, company_id: activeCompanyId(req) }, select: { id: true } })
      : null;
    if (!project) throw new ValidationError('Project induk tidak valid atau berada di luar company aktif.');
    await ProjectsService.assertCanManageProject(req.user, project.id, activeCompanyId(req));
    if (!data.created_by_id && req.user?.id) data.created_by_id = req.user.id;
    if (data.weight === undefined) data.weight = 10;
    // Progress is derived from Weekly Tasks; API payloads cannot seed it.
    data.progress = 0;
    if (!data.status) data.status = 'PLANNED';
    if (!data.priority) data.priority = 'MEDIUM';
    // Manual progress overrides are no longer part of the public contract.
    // New Main Tasks must always participate in the automatic WBS roll-up.
    data.is_progress_overridden = false;
    data.override_reason = '';
    return data;
  },
  beforeUpdate: async (req, data, existing) => {
    await ProjectsService.assertCanManageProject(req.user, existing.project_id, activeCompanyId(req));
    if (data.project && !data.project_id) data.project_id = data.project;
    delete data.project;
    delete data.project_id;
    if (data.title && !data.name) data.name = data.title;
    delete data.progress;
    delete data.is_progress_overridden;
    delete data.override_reason;
    return data;
  },
  beforeDelete: async (req, existing) => {
    await ProjectsService.assertCanManageProject(req.user, existing.project_id, activeCompanyId(req));
  },
  afterCreate: async (req, rec) => {
    await ProjectsService.recalculateTaskTree({ mainTaskId: rec.id, companyId: activeCompanyId(req) });
  },
  afterUpdate: async (req, rec) => {
    await ProjectsService.recalculateTaskTree({ mainTaskId: rec.id, companyId: activeCompanyId(req) });
  },
}));

// Helper to normalize Weekly Tasks
projectsRouter.use('/weekly-tasks', createCrudRouter({
  modelName: 'project_weekly_task',
  searchFields: ['target_description'],
  accessWhere: async (req) => ProjectsService.weeklyTaskAccessWhere(req.user, activeCompanyId(req)),
  beforeCreate: async (req, data) => {
    if (data.main_task && !data.main_task_id) data.main_task_id = data.main_task;
    if (req.body.main_task && !data.main_task_id) data.main_task_id = req.body.main_task;
    const mainTaskId = String(data.main_task_id ?? '');
    const mainTask = mainTaskId
      ? await prisma.project_main_task.findFirst({ where: { id: mainTaskId, company_id: activeCompanyId(req) }, select: { id: true, project_id: true } })
      : null;
    if (!mainTask) throw new ValidationError('Main Task tidak valid atau berada di luar company aktif.');
    const isOperationalAssignee = ([RoleCode.STAFF, RoleCode.SUPERVISOR] as RoleCode[]).includes(
      req.user?.active_role_code as RoleCode,
    );
    if (isOperationalAssignee) {
      if (!mainTaskId || !req.user?.id) {
        throw new ForbiddenError('Main Task dan assignee aktif wajib tersedia untuk membuat target mingguan.');
      }
      const assignment = await prisma.project_task_assignment.findFirst({
        where: {
          main_task_id: mainTaskId,
          assignee_id: req.user.id,
          company_id: activeCompanyId(req),
          ...(req.user.tenant_id ? { tenant_id: req.user.tenant_id } : {}),
        },
        select: { id: true },
      });
      if (!assignment) {
        throw new ForbiddenError('Anda hanya dapat membuat target mingguan pada Main Task yang ditugaskan kepada Anda.');
      }
      // An operational assignee can plan their own work, not reassign it.
      data.assignee_id = req.user.id;
    } else {
      await ProjectsService.assertCanManageProject(req.user, mainTask.project_id, activeCompanyId(req));
    }
    if (data.assignee && !data.assignee_id) data.assignee_id = data.assignee;
    if (data.assignee_id) await ProjectsService.assertActiveCompanyMember(String(data.assignee_id), activeCompanyId(req));
    if (!data.target_description && data.target_output) data.target_description = data.target_output;
    if (!String(data.target_description ?? '').trim()) throw new ValidationError('Target mingguan wajib diisi.');
    // Progress is derived from Daily Tasks; API payloads cannot seed it.
    data.progress = 0;
    if (!data.status) data.status = 'PLANNED';
    if (data.week_number === undefined) data.week_number = 1;
    // Weekly progress is controlled by Daily Task completion only. Ignoring
    // caller-supplied override flags prevents a hidden manual-progress path.
    data.is_progress_overridden = false;
    data.override_reason = '';
    return data;
  },
  beforeUpdate: async (req, data, existing) => {
    const mainTask = await prisma.project_main_task.findFirst({
      where: { id: existing.main_task_id, company_id: activeCompanyId(req) },
      select: { id: true, project_id: true },
    });
    if (!mainTask) throw new ValidationError('Hierarchy Weekly Task tidak valid.');
    const isOperationalAssignee = ([RoleCode.STAFF, RoleCode.SUPERVISOR] as RoleCode[]).includes(
      req.user?.active_role_code as RoleCode,
    );
    if (isOperationalAssignee) {
      if (existing.assignee_id !== req.user?.id) throw new ForbiddenError('Anda hanya dapat memperbarui Weekly Task milik Anda.');
    } else {
      await ProjectsService.assertCanManageProject(req.user, mainTask.project_id, activeCompanyId(req));
    }
    if (data.main_task && !data.main_task_id) data.main_task_id = data.main_task;
    if (data.assignee && !data.assignee_id) data.assignee_id = data.assignee;
    delete data.main_task;
    delete data.main_task_id;
    delete data.assignee;
    delete data.assignee_id;
    delete data.progress;
    delete data.is_progress_overridden;
    delete data.override_reason;
    return data;
  },
  beforeDelete: async (req, existing) => {
    const mainTask = await prisma.project_main_task.findFirst({
      where: { id: existing.main_task_id, company_id: activeCompanyId(req) },
      select: { project_id: true },
    });
    await ProjectsService.assertCanManageProject(req.user, mainTask?.project_id, activeCompanyId(req));
  },
  afterCreate: async (req, rec) => {
    await ProjectsService.recalculateTaskTree({ weeklyTaskId: rec.id, companyId: activeCompanyId(req) });
  },
  afterUpdate: async (req, rec) => {
    await ProjectsService.recalculateTaskTree({ weeklyTaskId: rec.id, companyId: activeCompanyId(req) });
  },
}));

// Helper to normalize Daily Tasks
projectsRouter.use('/daily-tasks', createCrudRouter({
  modelName: 'project_daily_task',
  searchFields: ['title', 'description', 'notes'],
  accessWhere: async (req) => ProjectsService.dailyTaskAccessWhere(req.user, activeCompanyId(req)),
  beforeCreate: async (req, data) => {
    if (data.weekly_task && !data.weekly_task_id) data.weekly_task_id = data.weekly_task;
    if (req.body.weekly_task && !data.weekly_task_id) data.weekly_task_id = req.body.weekly_task;
    const companyId = activeCompanyId(req);
    const weeklyTaskId = String(data.weekly_task_id ?? '');
    const weeklyTask = weeklyTaskId
      ? await prisma.project_weekly_task.findFirst({ where: { id: weeklyTaskId, company_id: companyId } })
      : null;
    if (!weeklyTask) throw new ValidationError('Weekly Task tidak valid atau berada di luar company aktif.');
    const mainTask = await prisma.project_main_task.findFirst({
      where: { id: weeklyTask.main_task_id, company_id: companyId },
      select: { id: true, project_id: true },
    });
    if (!mainTask) throw new ValidationError('Main Task induk tidak valid.');

    const activeRole = req.user?.active_role_code;
    const isOperationalAssignee = ([RoleCode.STAFF, RoleCode.SUPERVISOR] as RoleCode[]).includes(activeRole as RoleCode);
    if (isOperationalAssignee) {
      const assignment = await prisma.project_task_assignment.findFirst({
        where: { main_task_id: mainTask.id, assignee_id: req.user?.id, company_id: companyId },
        select: { id: true },
      });
      if (!assignment || weeklyTask.assignee_id !== req.user?.id) {
        throw new ForbiddenError('Anda hanya dapat membuat Daily Task pada Weekly Task milik Anda dari Main Task yang ditugaskan.');
      }
      data.owner_id = req.user?.id;
    } else {
      await ProjectsService.assertCanManageProject(req.user, mainTask.project_id, companyId);
      if (data.owner && !data.owner_id) data.owner_id = data.owner;
      if (!data.owner_id) data.owner_id = weeklyTask.assignee_id ?? req.user?.id;
    }
    await ProjectsService.assertActiveCompanyMember(String(data.owner_id ?? ''), companyId);
    if (!data.title && data.activity_input) data.title = data.activity_input;
    if (!String(data.title ?? '').trim()) throw new ValidationError('Aktivitas harian wajib diisi.');
    if (data.description === undefined) data.description = '';
    if (!String(data.time_slot ?? '').trim()) throw new ValidationError('Slot waktu aktivitas wajib diisi.');
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
    if (!['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED'].includes(String(data.status))) {
      throw new ValidationError('Status Daily Task tidak valid.');
    }
    if (data.progress === undefined) data.progress = 0;
    return data;
  },
  beforeUpdate: async (req, data, existing) => {
    await ProjectsService.assertCanOperateDailyTask(existing.id, req.user, activeCompanyId(req));
    // Hierarchy and ownership changes must use the audited assignment/transfer actions.
    delete data.weekly_task;
    delete data.weekly_task_id;
    delete data.owner;
    delete data.owner_id;
    // Progress and operational status are derived by the dedicated action/checklist path.
    delete data.progress;
    delete data.status;
    delete data.is_blocked;
    delete data.block_reason;
    if (data.activity_input && !data.title) data.title = data.activity_input;
    return data;
  },
  beforeDelete: async (req, existing) => {
    await ProjectsService.assertCanManageDailyTask(existing.id, req.user, activeCompanyId(req));
  },
  afterCreate: async (req, rec) => {
    await ProjectsService.recalculateTaskTree({ dailyTaskId: rec.id, companyId: activeCompanyId(req) });
  },
  afterUpdate: async (req, rec) => {
    await ProjectsService.recalculateTaskTree({ dailyTaskId: rec.id, companyId: activeCompanyId(req) });
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
  readOnly: true,
  accessWhere: async (req) => ProjectsService.taskTransferAccessWhere(req.user, activeCompanyId(req)),
}));

// =============================================================================
// 8. OTHER DOMAIN CRUD VIEWSETS
// =============================================================================

projectsRouter.get('/dashboard/financial-summary', async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await ProjectsService.getFinancialSummary(req.user, activeCompanyId(req))); }
  catch (err) { next(err); }
});

projectsRouter.get('/:id/financial-summary', async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await ProjectsService.getFinancialSummary(req.user, activeCompanyId(req), req.params.id)); }
  catch (err) { next(err); }
});

// =============================================================================
// STAFF PROJECT OVERVIEW
// =============================================================================

projectsRouter.get(
  '/staff/project-overview',

  async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      if (
        req.user?.active_role_code !==
        RoleCode.STAFF
      ) {
        throw new ForbiddenError(
          'Endpoint ini hanya tersedia untuk Staff.',
        );
      }

      const companyId =
        activeCompanyId(req);

      const tenantId =
        activeTenantId(req);

      const userId =
        activeUserId(req);

      /**
       * Gunakan resource scope project yang sudah
       * dimiliki ProjectsService.
       */
      const projectWhere =
        await ProjectsService.projectAccessWhere(
          req.user,
          companyId,
        );

      /**
       * SAFE STAFF PROJECT PROJECTION.
       *
       * Tidak ada:
       * - customer_name
       * - description internal
       * - budget_amount
       * - contract_amount
       * - margin
       * - PM financial fields
       */
      const projects =
        await prisma.project_project.findMany({
          where:
            projectWhere,

          select: {
            id:
              true,

            project_code:
              true,

            project_name:
              true,

            planned_start_date:
              true,

            planned_end_date:
              true,

            actual_start_date:
              true,

            actual_end_date:
              true,

            progress_percent:
              true,

            status:
              true,

            lifecycle_status:
              true,

            health_status:
              true,
          },

          orderBy: [
            {
              planned_end_date:
                'asc',
            },

            {
              id:
                'asc',
            },
          ],
        });

      const projectIds =
        projects.map(
          (project) =>
            project.id,
        );

      if (
        projectIds.length === 0
      ) {
        return res.json({
          projects:
            [],

          mainTasks:
            [],

          weeklyTasks:
            [],

          dailyTasks:
            [],

          milestones:
            [],
        });
      }

      /**
       * Main Task assignment Staff.
       */
      const assignments =
        await prisma.project_task_assignment.findMany({
          where: {
            tenant_id:
              tenantId,

            company_id:
              companyId,

            assignee_id:
              userId,
          },

          select: {
            main_task_id:
              true,
          },
        });

      const mainTaskIds = Array.from(
        new Set(
          assignments
            .map(
              (assignment) =>
                assignment.main_task_id,
            )
            .filter(
              (
                id,
              ): id is string =>
                Boolean(id),
            ),
        ),
      );

      const [
        mainTasks,
        weeklyTasks,
        dailyTasks,
        milestones,
      ] =
        await Promise.all([
          /**
           * Only assigned Main Tasks.
           */
          mainTaskIds.length
            ? prisma.project_main_task.findMany({
                where: {
                  tenant_id:
                    tenantId,

                  company_id:
                    companyId,

                  project_id: {
                    in:
                      projectIds,
                  },

                  id: {
                    in:
                      mainTaskIds,
                  },
                },

                select: {
                  id:
                    true,

                  project_id:
                    true,

                  name:
                    true,

                  description:
                    true,

                  priority:
                    true,

                  start_date:
                    true,

                  due_date:
                    true,

                  progress:
                    true,

                  status:
                    true,
                },

                orderBy: {
                  due_date:
                    'asc',
                },
              })
            : Promise.resolve(
                [],
              ),

          /**
           * Only weekly tasks assigned to Staff.
           */
          prisma.project_weekly_task.findMany({
            where: {
              tenant_id:
                tenantId,

              company_id:
                companyId,

              assignee_id:
                userId,

              ...(mainTaskIds.length
                ? {
                    main_task_id: {
                      in:
                        mainTaskIds,
                    },
                  }
                : {}),
            },

            select: {
              id:
                true,

              main_task_id:
                true,

              assignee_id:
                true,

              week_number:
                true,

              start_date:
                true,

              end_date:
                true,

              target_description:
                true,

              progress:
                true,

              status:
                true,
            },

            orderBy: {
              start_date:
                'asc',
            },
          }),

          /**
           * Only Daily Tasks owned by Staff.
           */
          prisma.project_daily_task.findMany({
            where: {
              tenant_id:
                tenantId,

              company_id:
                companyId,

              owner_id:
                userId,
            },

            select: {
              id:
                true,

              weekly_task_id:
                true,

              owner_id:
                true,

              title:
                true,

              description:
                true,

              planned_date:
                true,

              time_slot:
                true,

              output_result:
                true,

              notes:
                true,

              progress:
                true,

              status:
                true,

              is_blocked:
                true,

              block_reason:
                true,
            },

            orderBy: {
              planned_date:
                'asc',
            },
          }),

          /**
           * Timeline project yang memang bisa dilihat Staff.
           */
          prisma.project_milestone.findMany({
            where: {
              tenant_id:
                tenantId,

              company_id:
                companyId,

              project_id: {
                in:
                  projectIds,
              },
            },

            select: {
              id:
                true,

              project_id:
                true,

              milestone_name:
                true,

              planned_date:
                true,

              actual_date:
                true,

              weight_percent:
                true,

              status:
                true,
            },

            orderBy: {
              planned_date:
                'asc',
            },
          }),
        ]);

      return res.json({
        projects,

        mainTasks,

        weeklyTasks,

        dailyTasks,

        milestones,
      });
    } catch (err) {
      return next(err);
    }
  },
);

projectsRouter.use('/projects', createCrudRouter({
  modelName: 'project_project',
  searchFields: ['project_name', 'project_code', 'status', 'customer_name'],
  accessWhere: async (req) => ProjectsService.projectAccessWhere(req.user, activeCompanyId(req)),
  beforeCreate: async (req, data) => {
    // 1. Alias mappings
    if (!data.project_name && data.name) data.project_name = data.name;
    data.project_name = String(data.project_name ?? '').trim();
    if (!data.project_name) throw new ValidationError('Nama proyek wajib diisi.');

    if (!data.project_code && data.code) data.project_code = data.code;
    if (!data.project_code) data.project_code = `PRJ-${Date.now().toString().slice(-4)}`;

    // 2. Default required schema fields
    if (data.customer_name === undefined || data.customer_name === null || data.customer_name === '') {
      data.customer_name = String(data.client_name ?? '').trim();
      if (!data.customer_name) throw new ValidationError('Nama customer wajib diisi.');
    } else {
      // Auto-register to database master_party if it's a new client (Strict Tenant Scoped)
      const clientName = String(data.customer_name).trim();
      const tenantId = req.user?.tenant_id;
      if (!tenantId) throw new ForbiddenError('Tenant aktif diperlukan.');
      const companyId = activeCompanyId(req);
      const existing = await prisma.master_party.findFirst({
        where: {
          tenant_id: tenantId,
          company_id: companyId,
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
            company_id: companyId,
            created_by_id: req.user?.id,
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
      data.manager_name = data.pm_name || data.project_manager_name || (req.user as any)?.full_name;
      if (!String(data.manager_name ?? '').trim()) throw new ValidationError('Nama Project Manager wajib diisi.');
    }
    if (!data.project_manager_id && req.user?.active_role_code === RoleCode.PROJECT_MANAGER) {
      data.project_manager_id = req.user.id;
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
    // Project progress is a WBS roll-up and is never accepted from create.
    data.progress_percent = 0;
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
    delete data.progress_percent;
    delete data.progress;
    delete data.progress_percentage;
    return data;
  },
}));
projectsRouter.use('/control-items', createCrudRouter({
  modelName: 'project_control_item',
  beforeCreate: async (req, data) => {
    if (req.body.daily_task && !data.daily_task_id) data.daily_task_id = req.body.daily_task;
    if (data.daily_task_id && !data.item_type) data.item_type = 'TASK_CHECKLIST';
    return data;
  },
  afterCreate: async (req, record) => {
    if (record.daily_task_id) await ProjectsService.recalculateTaskTree({ dailyTaskId: record.daily_task_id, companyId: activeCompanyId(req) });
  },
  afterUpdate: async (req, record, before) => {
    const dailyTaskIds = new Set([record.daily_task_id, before.daily_task_id].filter(Boolean));
    for (const dailyTaskId of dailyTaskIds) {
      await ProjectsService.recalculateTaskTree({ dailyTaskId, companyId: activeCompanyId(req) });
    }
  },
  afterDelete: async (req, record) => {
    if (record.daily_task_id) await ProjectsService.recalculateTaskTree({ dailyTaskId: record.daily_task_id, companyId: activeCompanyId(req) });
  },
}));
projectsRouter.use('/expenses', createCrudRouter({ modelName: 'project_expense', searchFields: ['description'] }));
projectsRouter.use('/lifecycle-events', createCrudRouter({ modelName: 'project_lifecycle_event' }));
projectsRouter.use('/readiness-checks', createCrudRouter({ modelName: 'project_readiness_check' }));
projectsRouter.use('/members', createCrudRouter({ modelName: 'project_member' }));
projectsRouter.use('/tasks', createCrudRouter({ modelName: 'project_task', searchFields: ['task_name', 'task_code'] }));
projectsRouter.use('/task-dependencies', createCrudRouter({ modelName: 'project_task_dependency' }));
projectsRouter.use('/milestones', createCrudRouter({ modelName: 'project_milestone', searchFields: ['milestone_name'] }));
projectsRouter.use('/material-requirements', createCrudRouter({ modelName: 'project_material_requirement' }));
projectsRouter.use('/budget-lines', createCrudRouter({ modelName: 'project_budget_line' }));
// =============================================================================
// PERSONAL OVERTIME SUMMARY
// =============================================================================

projectsRouter.get(
  '/timesheets/me/overtime-summary',

  async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const companyId =
        activeCompanyId(req);

      const tenantId =
        activeTenantId(req);

      const employee =
        await currentEmployee(
          req,
        );

      const now =
        new Date();

      const monthStart =
        new Date(
          now.getFullYear(),
          now.getMonth(),
          1,
        );

      const weekStart =
        new Date(now);

      const day =
        weekStart.getDay();

      const diff =
        day === 0
          ? 6
          : day - 1;

      weekStart.setDate(
        weekStart.getDate() -
          diff,
      );

      weekStart.setHours(
        0,
        0,
        0,
        0,
      );

      const [
        week,
        month,
        pending,
        approved,
        last,
      ] =
        await Promise.all([
          prisma.project_timesheet.aggregate({
            where: {
              tenant_id:
                tenantId,

              company_id:
                companyId,

              employee_id:
                employee.id,

              work_date: {
                gte:
                  weekStart,
              },
            },

            _sum: {
              overtime_hours:
                true,
            },
          }),

          prisma.project_timesheet.aggregate({
            where: {
              tenant_id:
                tenantId,

              company_id:
                companyId,

              employee_id:
                employee.id,

              work_date: {
                gte:
                  monthStart,
              },
            },

            _sum: {
              overtime_hours:
                true,
            },
          }),

          prisma.project_timesheet.aggregate({
            where: {
              tenant_id:
                tenantId,

              company_id:
                companyId,

              employee_id:
                employee.id,

              approval_status: {
                in: [
                  'PENDING',
                  'SUBMITTED',
                  'WAITING_APPROVAL',
                ],
              },
            },

            _sum: {
              overtime_hours:
                true,
            },
          }),

          prisma.project_timesheet.aggregate({
            where: {
              tenant_id:
                tenantId,

              company_id:
                companyId,

              employee_id:
                employee.id,

              approval_status:
                'APPROVED',
            },

            _sum: {
              overtime_hours:
                true,
            },
          }),

          prisma.project_timesheet.findFirst({
            where: {
              tenant_id:
                tenantId,

              company_id:
                companyId,

              employee_id:
                employee.id,

              overtime_hours: {
                gt: 0,
              },
            },

            orderBy: {
              work_date:
                'desc',
            },

            select: {
              work_date:
                true,
            },
          }),
        ]);

      return res.json({
        thisWeekHours:
          Number(
            week._sum
              .overtime_hours ??
              0,
          ),

        thisMonthHours:
          Number(
            month._sum
              .overtime_hours ??
              0,
          ),

        pendingHours:
          Number(
            pending._sum
              .overtime_hours ??
              0,
          ),

        approvedHours:
          Number(
            approved._sum
              .overtime_hours ??
              0,
          ),

        lastOvertimeDate:
          last?.work_date ??
          null,
      });
    } catch (err) {
      return next(err);
    }
  },
);

// =============================================================================
// SECURED PROJECT TIMESHEETS / OVERTIME
// =============================================================================

projectsRouter.use(
  '/timesheets',

  createCrudRouter({
    modelName:
      'project_timesheet',

    searchFields: [
      'approval_status',
      'overtime_reason',
    ],

    /**
     * READ SCOPE
     *
     * Staff:
     * hanya timesheet dirinya sendiri.
     *
     * Role managerial:
     * hanya project yang memang dapat mereka akses.
     */
    accessWhere: async (
      req,
    ) => {
      const companyId =
        activeCompanyId(req);

      const tenantId =
        activeTenantId(req);

      if (isStaff(req)) {
        const employee =
          await currentEmployee(
            req,
          );

        return {
          tenant_id:
            tenantId,

          company_id:
            companyId,

          employee_id:
            employee.id,
        };
      }

      /**
       * Non-Staff juga tidak otomatis menerima
       * seluruh timesheet company.
       *
       * Scope mengikuti project access.
       */
      const projectWhere =
        await ProjectsService.projectAccessWhere(
          req.user,
          companyId,
        );

      const accessibleProjects =
        await prisma.project_project.findMany({
          where:
            projectWhere,

          select: {
            id:
              true,
          },
        });

      return {
        tenant_id:
          tenantId,

        company_id:
          companyId,

        project_id: {
          in:
            accessibleProjects.map(
              (project) =>
                project.id,
            ),
        },
      };
    },

    /**
     * CREATE
     */
    beforeCreate: async (
      req,
      data,
    ) => {
      const companyId =
        activeCompanyId(req);

      const tenantId =
        activeTenantId(req);

      const userId =
        activeUserId(req);

      const projectId =
        String(
          data.project_id ??
            req.body.project_id ??
            '',
        );

      if (!projectId) {
        throw new ValidationError(
          'Project wajib dipilih untuk membuat timesheet.',
        );
      }

      const project =
        await prisma.project_project.findFirst({
          where: {
            id:
              projectId,

            tenant_id:
              tenantId,

            company_id:
              companyId,
          },

          select: {
            id:
              true,
          },
        });

      if (!project) {
        throw new ValidationError(
          'Project tidak valid atau berada di luar company aktif.',
        );
      }

      /**
       * Staff boleh submit jam kerja,
       * bukan mengelola project.
       */
      if (isStaff(req)) {
        await ProjectsService.assertCanViewProject(
          req.user,
          projectId,
          companyId,
        );

        const employee =
          await currentEmployee(
            req,
          );

        /**
         * employee_id tidak pernah dipercaya dari FE.
         */
        data.employee_id =
          employee.id;

        /**
         * Staff tidak boleh mengirim financial rate/cost.
         */
        delete data.hourly_rate;
        delete data.amount;

        /**
         * Approval selalu mulai dari PENDING.
         */
        data.approval_status =
          'PENDING';
      } else {
        await ProjectsService.assertCanManageProject(
          req.user,
          projectId,
          companyId,
        );

        if (!data.employee_id) {
          throw new ValidationError(
            'Employee wajib dipilih.',
          );
        }

        const employee =
          await prisma.master_employee.findFirst({
            where: {
              id:
                String(
                  data.employee_id,
                ),

              tenant_id:
                tenantId,

              company_id:
                companyId,
            },

            select: {
              id:
                true,
            },
          });

        if (!employee) {
          throw new ValidationError(
            'Employee tidak valid atau berada di luar company aktif.',
          );
        }

        if (
          !data.approval_status
        ) {
          data.approval_status =
            'PENDING';
        }
      }

      /**
       * Optional project_task validation.
       */
      if (data.task_id) {
        const task =
          await prisma.project_task.findFirst({
            where: {
              id:
                String(
                  data.task_id,
                ),

              tenant_id:
                tenantId,

              company_id:
                companyId,

              project_id:
                projectId,
            },

            select: {
              id:
                true,

              assigned_to_id:
                true,
            },
          });

        if (!task) {
          throw new ValidationError(
            'Task timesheet tidak valid.',
          );
        }

        /**
         * Staff tidak boleh mencatat waktu
         * atas task Staff lain.
         */
        if (
          isStaff(req) &&
          task.assigned_to_id !==
            userId
        ) {
          throw new ForbiddenError(
            'Anda hanya dapat mencatat timesheet pada task yang ditugaskan kepada Anda.',
          );
        }
      }

      /**
       * Work date.
       */
      if (!data.work_date) {
        data.work_date =
          new Date();
      } else if (
        typeof data.work_date ===
        'string'
      ) {
        data.work_date =
          new Date(
            data.work_date,
          );
      }

      const hours =
        Number(
          data.hours ?? 0,
        );

      const overtimeHours =
        Number(
          data.overtime_hours ??
            0,
        );

      if (
        !Number.isFinite(hours) ||
        hours <= 0 ||
        hours > 24
      ) {
        throw new ValidationError(
          'Total jam kerja harus lebih dari 0 dan maksimal 24 jam.',
        );
      }

      if (
        !Number.isFinite(
          overtimeHours,
        ) ||
        overtimeHours < 0
      ) {
        throw new ValidationError(
          'Jam lembur tidak valid.',
        );
      }

      if (
        overtimeHours >
        hours
      ) {
        throw new ValidationError(
          'Jam lembur tidak boleh lebih besar dari total jam kerja.',
        );
      }

      data.hours =
        hours;

      data.overtime_hours =
        overtimeHours;

      data.project_id =
        projectId;

      data.tenant_id =
        tenantId;

      data.company_id =
        companyId;

      data.created_by_id =
        userId;

      if (
        data.overtime_reason ===
        undefined
      ) {
        data.overtime_reason =
          '';
      }

      return data;
    },

    /**
     * UPDATE
     */
    beforeUpdate: async (
      req,
      data,
      existing,
    ) => {
      const companyId =
        activeCompanyId(req);

      if (
        isStaff(req)
      ) {
        const employee =
          await currentEmployee(
            req,
          );

        if (
          existing.employee_id !==
          employee.id
        ) {
          throw new ForbiddenError(
            'Anda tidak dapat memperbarui timesheet milik user lain.',
          );
        }

        /**
         * Setelah approval Staff tidak boleh edit.
         */
        if (
          String(
            existing.approval_status ??
              '',
          ).toUpperCase() ===
          'APPROVED'
        ) {
          throw new ForbiddenError(
            'Timesheet yang sudah disetujui tidak dapat diubah.',
          );
        }

        /**
         * Immutable / server-owned fields.
         */
        delete data.employee_id;

        delete data.project_id;

        delete data.task_id;

        delete data.approval_status;

        delete data.hourly_rate;

        delete data.amount;

        delete data.tenant_id;

        delete data.company_id;

        delete data.created_by_id;
      } else {
        await ProjectsService.assertCanManageProject(
          req.user,
          existing.project_id,
          companyId,
        );

        /**
         * Hierarchy/ownership tidak boleh diganti
         * melalui PATCH timesheet biasa.
         */
        delete data.employee_id;
        delete data.project_id;
        delete data.task_id;

        delete data.tenant_id;
        delete data.company_id;
        delete data.created_by_id;
      }

      if (
        data.work_date &&
        typeof data.work_date ===
          'string'
      ) {
        data.work_date =
          new Date(
            data.work_date,
          );
      }

      const nextHours =
        data.hours !==
        undefined
          ? Number(
              data.hours,
            )
          : Number(
              existing.hours ??
                0,
            );

      const nextOvertime =
        data.overtime_hours !==
        undefined
          ? Number(
              data.overtime_hours,
            )
          : Number(
              existing.overtime_hours ??
                0,
            );

      if (
        nextHours <= 0 ||
        nextHours > 24
      ) {
        throw new ValidationError(
          'Total jam kerja harus lebih dari 0 dan maksimal 24 jam.',
        );
      }

      if (
        nextOvertime < 0 ||
        nextOvertime >
          nextHours
      ) {
        throw new ValidationError(
          'Jam lembur harus berada antara 0 dan total jam kerja.',
        );
      }

      if (
        data.hours !==
        undefined
      ) {
        data.hours =
          nextHours;
      }

      if (
        data.overtime_hours !==
        undefined
      ) {
        data.overtime_hours =
          nextOvertime;
      }

      return data;
    },

    /**
     * DELETE
     */
    beforeDelete: async (
      req,
      existing,
    ) => {
      const companyId =
        activeCompanyId(req);

      if (
        isStaff(req)
      ) {
        const employee =
          await currentEmployee(
            req,
          );

        if (
          existing.employee_id !==
          employee.id
        ) {
          throw new ForbiddenError(
            'Anda tidak dapat menghapus timesheet milik user lain.',
          );
        }

        if (
          String(
            existing.approval_status ??
              '',
          ).toUpperCase() !==
          'PENDING'
        ) {
          throw new ForbiddenError(
            'Hanya timesheet berstatus PENDING yang dapat dihapus.',
          );
        }

        return;
      }

      await ProjectsService.assertCanManageProject(
        req.user,
        existing.project_id,
        companyId,
      );
    },
  }),
);
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
