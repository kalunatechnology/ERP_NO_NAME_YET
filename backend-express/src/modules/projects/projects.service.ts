/**
 * File: backend-express/src/modules/projects/projects.service.ts
 *
 * Purpose: Implements domain service responsibilities for the projects domain.
 * Responsibility: Defines the executable contracts in this file and connects them to their callers without owning unrelated domain behavior.
 * Integration: Used through static imports, Express/Next framework discovery, or an explicit npm/script entry point as applicable.
 * Dependencies and side effects: See each documented function; database, browser storage, network, and response mutations are called out where present.
 */
import prisma from '../../config/database';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../utils/errors';
import { RoleCode } from '../../types/roles';

export class ProjectsService {
  private static activeRole(user: any): string {
    return user?.active_role_code ?? user?.roles?.[0] ?? '';
  }

  private static isOperationalAssignee(user: any): boolean {
    return ([RoleCode.STAFF, RoleCode.SUPERVISOR] as RoleCode[]).includes(this.activeRole(user) as RoleCode);
  }

  private static isProjectController(user: any): boolean {
    return this.hasPlatformAdmin(user) || ([RoleCode.PROJECT_MANAGER, RoleCode.OPERATIONAL_MANAGER] as RoleCode[]).includes(this.activeRole(user) as RoleCode);
  }

  private static hasPlatformAdmin(user: any): boolean {
    return user?.roles?.includes(RoleCode.SUPER_ADMIN) || this.activeRole(user) === RoleCode.COMPANY_ADMIN;
  }

  private static hasPortfolioRead(user: any): boolean {
    return this.hasPlatformAdmin(user)
      || ([RoleCode.OPERATIONAL_MANAGER, RoleCode.DIRECTOR] as RoleCode[]).includes(this.activeRole(user) as RoleCode);
  }

  static async managedProjectIds(user: any, companyId: string, db: any = prisma): Promise<string[]> {
    if (this.activeRole(user) === RoleCode.OPERATIONAL_MANAGER) {
      const projects = await db.project_project.findMany({
        where: { company_id: companyId },
        select: { id: true },
      });
      return projects.map((project: { id: string }) => project.id);
    }
    if (this.activeRole(user) !== RoleCode.PROJECT_MANAGER || !user?.id) return [];

    const memberships = await db.project_member.findMany({
      where: {
        company_id: companyId,
        user_id: user.id,
        status: 'ACTIVE',
        project_role: { in: ['PROJECT_MANAGER', 'PM', 'LEAD_PROJECT_MANAGER'] },
      },
      select: { project_id: true },
    });
    const memberProjectIds = memberships
      .map((membership: { project_id: string | null }) => membership.project_id)
      .filter((id: string | null): id is string => Boolean(id));
    const projects = await db.project_project.findMany({
      where: {
        company_id: companyId,
        OR: [
          { project_manager_id: user.id },
          ...(memberProjectIds.length ? [{ id: { in: memberProjectIds } }] : []),
        ],
      },
      select: { id: true },
    });
    return projects.map((project: { id: string }) => project.id);
  }

  static async assertCanManageProject(user: any, projectId: string | null | undefined, companyId: string, db: any = prisma): Promise<void> {
    if (!projectId || !this.isProjectController(user)) {
      throw new ForbiddenError('Aksi ini hanya dapat dilakukan PM project terkait atau Operational Manager.');
    }
    if (this.hasPlatformAdmin(user) || this.activeRole(user) === RoleCode.OPERATIONAL_MANAGER) return;
    const managedIds = await this.managedProjectIds(user, companyId, db);
    if (!managedIds.includes(projectId)) {
      throw new ForbiddenError('PM hanya dapat mengelola project yang menjadi tanggung jawabnya.');
    }
  }

  static async projectAccessWhere(user: any, companyId: string, db: any = prisma): Promise<Record<string, unknown>> {
    if (this.hasPortfolioRead(user)) return {};
    if (this.activeRole(user) === RoleCode.PROJECT_MANAGER) {
      return { id: { in: await this.managedProjectIds(user, companyId, db) } };
    }
    if (!this.isOperationalAssignee(user) || !user?.id) return { id: { in: [] } };

    const [memberships, assignments] = await Promise.all([
      db.project_member.findMany({
        where: { company_id: companyId, user_id: user.id, status: 'ACTIVE' },
        select: { project_id: true },
      }),
      db.project_task_assignment.findMany({
        where: { company_id: companyId, assignee_id: user.id },
        select: { main_task_id: true },
      }),
    ]);
    const mainIds = assignments.map((assignment: { main_task_id: string }) => assignment.main_task_id);
    const assignedMainTasks = mainIds.length
      ? await db.project_main_task.findMany({
        where: { company_id: companyId, id: { in: mainIds } },
        select: { project_id: true },
      })
      : [];
    const projectIds = new Set<string>();
    memberships.forEach((membership: { project_id: string | null }) => {
      if (membership.project_id) projectIds.add(membership.project_id);
    });
    assignedMainTasks.forEach((task: { project_id: string }) => projectIds.add(task.project_id));
    return { id: { in: [...projectIds] } };
  }

  static async assertCanViewProject(user: any, projectId: string, companyId: string, db: any = prisma): Promise<void> {
    const accessWhere = await this.projectAccessWhere(user, companyId, db);
    const project = await db.project_project.findFirst({
      where: { company_id: companyId, AND: [{ id: projectId }, accessWhere] },
      select: { id: true },
    });
    if (!project) throw new ForbiddenError('Anda tidak memiliki akses ke project ini.');
  }

  static async dailyTaskAccessWhere(user: any, companyId: string, db: any = prisma): Promise<Record<string, unknown>> {
    if (this.isOperationalAssignee(user)) return { owner_id: user.id };
    if (this.hasPortfolioRead(user)) return {};
    if (this.activeRole(user) !== RoleCode.PROJECT_MANAGER) return { id: { in: [] } };

    const projectIds = await this.managedProjectIds(user, companyId, db);
    if (!projectIds.length) return { id: { in: [] } };
    const mainTasks = await db.project_main_task.findMany({
      where: { company_id: companyId, project_id: { in: projectIds } },
      select: { id: true },
    });
    const mainTaskIds = mainTasks.map((task: { id: string }) => task.id);
    if (!mainTaskIds.length) return { id: { in: [] } };
    const weeklyTasks = await db.project_weekly_task.findMany({
      where: { company_id: companyId, main_task_id: { in: mainTaskIds } },
      select: { id: true },
    });
    return { weekly_task_id: { in: weeklyTasks.map((task: { id: string }) => task.id) } };
  }

  static async mainTaskAccessWhere(user: any, companyId: string, db: any = prisma): Promise<Record<string, unknown>> {
    if (this.isOperationalAssignee(user)) {
      const assignments = await db.project_task_assignment.findMany({
        where: { company_id: companyId, assignee_id: user.id },
        select: { main_task_id: true },
      });
      return { id: { in: assignments.map((assignment: { main_task_id: string }) => assignment.main_task_id) } };
    }
    if (this.hasPortfolioRead(user)) return {};
    if (this.activeRole(user) !== RoleCode.PROJECT_MANAGER) return { id: { in: [] } };
    return { project_id: { in: await this.managedProjectIds(user, companyId, db) } };
  }

  static async weeklyTaskAccessWhere(user: any, companyId: string, db: any = prisma): Promise<Record<string, unknown>> {
    if (this.isOperationalAssignee(user)) return { assignee_id: user.id };
    if (this.hasPortfolioRead(user)) return {};
    if (this.activeRole(user) !== RoleCode.PROJECT_MANAGER) return { id: { in: [] } };
    const mainWhere = await this.mainTaskAccessWhere(user, companyId, db);
    const mainTasks = await db.project_main_task.findMany({
      where: { company_id: companyId, ...mainWhere },
      select: { id: true },
    });
    return { main_task_id: { in: mainTasks.map((task: { id: string }) => task.id) } };
  }

  static async taskTransferAccessWhere(user: any, companyId: string, db: any = prisma): Promise<Record<string, unknown>> {
    if (this.isOperationalAssignee(user)) {
      return { OR: [{ requested_by_id: user.id }, { target_user_id: user.id }] };
    }
    if (this.hasPortfolioRead(user)) return {};
    if (this.activeRole(user) !== RoleCode.PROJECT_MANAGER) return { id: { in: [] } };
    const dailyWhere = await this.dailyTaskAccessWhere(user, companyId, db);
    const dailyTasks = await db.project_daily_task.findMany({
      where: { company_id: companyId, ...dailyWhere },
      select: { id: true },
    });
    return { daily_task_id: { in: dailyTasks.map((task: { id: string }) => task.id) } };
  }

  private static async dailyTaskContext(dailyTaskId: string, companyId: string, db: any = prisma) {
    const task = await db.project_daily_task.findFirst({ where: { id: dailyTaskId, company_id: companyId } });
    if (!task) throw new NotFoundError('DailyTask');
    const weekly = await db.project_weekly_task.findFirst({ where: { id: task.weekly_task_id, company_id: companyId } });
    const mainTask = weekly
      ? await db.project_main_task.findFirst({ where: { id: weekly.main_task_id, company_id: companyId } })
      : null;
    if (!weekly || !mainTask) throw new ValidationError('Hierarchy Daily Task tidak valid.');
    return { task, weekly, mainTask, projectId: mainTask.project_id as string };
  }

  static async assertCanOperateDailyTask(dailyTaskId: string, user: any, companyId: string, db: any = prisma) {
    const context = await this.dailyTaskContext(dailyTaskId, companyId, db);
    if (!user?.id || context.task.owner_id !== user.id) {
      throw new ForbiddenError('Progres, hasil, dan blocker Daily Task hanya dapat diperbarui oleh pemilik task.');
    }
    return context;
  }

  static async assertCanManageDailyTask(dailyTaskId: string, user: any, companyId: string, db: any = prisma) {
    const context = await this.dailyTaskContext(dailyTaskId, companyId, db);
    await this.assertCanManageProject(user, context.projectId, companyId, db);
    return context;
  }

  static async assertActiveCompanyMember(userId: string, companyId: string, db: any = prisma): Promise<void> {
    if (!userId) throw new ValidationError('User tujuan wajib dipilih.');
    const membership = await db.iam_user_company_membership.findFirst({
      where: { company_id: companyId, user_id: userId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!membership) throw new ForbiddenError('User tujuan bukan anggota aktif company ini.');
  }

  /**
   * Log task activity to task_activity_log
   */
  static async logActivity(params: {
    projectId: string;
    tenantId?: string | null;
    companyId?: string | null;
    actorId?: string;
    taskLevel: string;
    taskId: string;
    taskTitle: string;
    action: string;
    fieldName?: string;
    oldValue?: string;
    newValue?: string;
    reason?: string;
  }) {
    try {
      await prisma.project_task_activity_log.create({
        data: {
          id: crypto.randomUUID(),
          tenant_id: params.tenantId ?? null,
          company_id: params.companyId ?? null,
          created_by_id: params.actorId ?? null,
          project_id: params.projectId,
          actor_id: params.actorId ?? null,
          task_level: params.taskLevel,
          task_id: params.taskId,
          task_title: params.taskTitle ?? '',
          action: params.action,
          field_name: params.fieldName ?? '',
          old_value: params.oldValue ?? '',
          new_value: params.newValue ?? '',
          reason: params.reason ?? '',
          created_at: new Date(),
        },
      });
    } catch (e) {
      console.warn('[ProjectsService] Failed to log task activity:', e);
    }
  }

  /**
   * Hierarchical bottom-up rollup engine:
   * Daily Tasks (avg) -> Weekly Task (avg) -> Main Task (weighted) -> Overall Project Progress.
   */
  static async recalculateTaskTree(params: {
    dailyTaskId?: string;
    weeklyTaskId?: string;
    mainTaskId?: string;
    projectId?: string;
    companyId?: string;
  }) {
    return prisma.$transaction(async (tx) => {
      let weeklyId = params.weeklyTaskId;
      let mainId = params.mainTaskId;
      let projId = params.projectId;
      let companyId = params.companyId;

      if (params.dailyTaskId) {
        const dt = await tx.project_daily_task.findFirst({
          where: { id: params.dailyTaskId, ...(companyId ? { company_id: companyId } : {}) },
        });
        companyId ??= dt?.company_id ?? undefined;
        if (dt?.weekly_task_id) {
          weeklyId = dt.weekly_task_id;

          // Daily progress is a derived value. A linked checklist is authoritative;
          // tasks without checklist items fall back to a binary status-derived value.
          const checklist = await tx.project_control_item.findMany({
            where: { daily_task_id: dt.id, ...(companyId ? { company_id: companyId } : {}) },
            select: { status: true },
          });
          const completedStates = new Set(['DONE', 'COMPLETED', 'CHECKED', 'APPROVED']);
          const calculatedProgress = checklist.length > 0
            ? Math.round((checklist.filter((item) => completedStates.has(item.status.toUpperCase())).length / checklist.length) * 10000) / 100
            : completedStates.has(dt.status.toUpperCase()) ? 100 : 0;
          const calculatedStatus = dt.status === 'BLOCKED'
            ? 'BLOCKED'
            : checklist.length === 0
              ? dt.status
              : calculatedProgress >= 100 ? 'COMPLETED' : calculatedProgress > 0 ? 'IN_PROGRESS' : 'NOT_STARTED';

          await tx.project_daily_task.update({
            where: { id: dt.id },
            data: { progress: calculatedProgress, status: calculatedStatus, updated_at: new Date() },
          });
        }
      }

      if (weeklyId) {
        const wt = await tx.project_weekly_task.findFirst({
          where: { id: weeklyId, ...(companyId ? { company_id: companyId } : {}) },
        });
        companyId ??= wt?.company_id ?? undefined;
        if (wt) {
          mainId = wt.main_task_id ?? undefined;
          if (!wt.is_progress_overridden) {
            const dailyTasks = await tx.project_daily_task.findMany({
              where: { weekly_task_id: weeklyId, ...(companyId ? { company_id: companyId } : {}) },
            });
            if (dailyTasks.length > 0) {
              const avg =
                dailyTasks.reduce((sum, d) => sum + Number(d.progress ?? 0), 0) /
                dailyTasks.length;
              const rounded = Math.round(avg * 100) / 100;

              // Status derivation
              let newStatus = 'PLANNED';
              const hasBlocked = dailyTasks.some((d) => d.is_blocked || d.status === 'BLOCKED');
              const allDone = dailyTasks.every((d) => d.status === 'COMPLETED' || d.status === 'DONE');
              const inProg = dailyTasks.some((d) => ['IN_PROGRESS', 'REVIEW', 'ON_PROGRESS'].includes(d.status ?? ''));

              if (hasBlocked) newStatus = 'BLOCKED';
              else if (allDone) newStatus = 'COMPLETED';
              else if (inProg || rounded > 0) newStatus = 'IN_PROGRESS';

              await tx.project_weekly_task.update({
                where: { id: weeklyId },
                data: {
                  progress: rounded,
                  status: newStatus,
                  updated_at: new Date(),
                },
              });
            } else {
              await tx.project_weekly_task.update({
                where: { id: weeklyId },
                data: { progress: 0, status: 'PLANNED', updated_at: new Date() },
              });
            }
          }
        }
      }

      if (mainId) {
        const mt = await tx.project_main_task.findFirst({
          where: { id: mainId, ...(companyId ? { company_id: companyId } : {}) },
        });
        companyId ??= mt?.company_id ?? undefined;
        if (mt) {
          projId = mt.project_id ?? undefined;
          if (!mt.is_progress_overridden) {
            const weeklyTasks = await tx.project_weekly_task.findMany({
              where: { main_task_id: mainId, ...(companyId ? { company_id: companyId } : {}) },
            });
            if (weeklyTasks.length > 0) {
              const avg =
                weeklyTasks.reduce((sum, w) => sum + Number(w.progress ?? 0), 0) /
                weeklyTasks.length;
              const rounded = Math.round(avg * 100) / 100;

              let newStatus = 'PLANNED';
              if (weeklyTasks.some((w) => w.status === 'BLOCKED')) newStatus = 'BLOCKED';
              else if (weeklyTasks.every((w) => w.status === 'COMPLETED' || w.status === 'DONE')) newStatus = 'COMPLETED';
              else if (weeklyTasks.some((w) => w.status === 'IN_PROGRESS' || Number(w.progress ?? 0) > 0)) newStatus = 'IN_PROGRESS';

              await tx.project_main_task.update({
                where: { id: mainId },
                data: {
                  progress: rounded,
                  status: newStatus,
                  updated_at: new Date(),
                },
              });
            } else {
              await tx.project_main_task.update({
                where: { id: mainId },
                data: { progress: 0, status: 'PLANNED', updated_at: new Date() },
              });
            }
          }
        }
      }

      if (projId) {
        const mainTasks = await tx.project_main_task.findMany({
          where: { project_id: projId, ...(companyId ? { company_id: companyId } : {}) },
        });
        let totalWeight = 0;
        let weightedSum = 0;
        for (const m of mainTasks) {
          const w = Number(m.weight ?? 1.0);
          const p = Number(m.progress ?? 0);
          totalWeight += w;
          weightedSum += p * w;
        }
        const overall = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) / 100 : 0;
        await tx.project_project.update({
          where: { id: projId },
          data: {
            progress_percent: overall,
          },
        });
        return overall;
      }

      return 0;
    });
  }

  /**
   * Returns the complete 5-level hierarchical WBS tree matching Django hierarchy action
   */
  static async getProjectHierarchy(projectId: string, companyId: string) {
    const project = await prisma.project_project.findFirst({
      where: { id: projectId, company_id: companyId },
    });
    if (!project) throw new NotFoundError('Project');

    // Fetch members and project manager
    const [members, mainTasks, allUsers] = await Promise.all([
      prisma.project_member.findMany({
        where: { project_id: projectId, company_id: companyId },
      }),
      prisma.project_main_task.findMany({
        where: { project_id: projectId, company_id: companyId },
        orderBy: { created_at: 'asc' },
      }),
      prisma.iam_user.findMany({
        where: {
          is_active: true,
          ...(project.company_id
            ? {
                iam_user_role: {
                  some: {
                    company_id: project.company_id,
                  },
                },
              }
            : {}),
        },
        select: { id: true, username: true, full_name: true, email: true },
      }),
    ]);

    const userMap = new Map(allUsers.map((u) => [u.id, u]));

    // Format members
    const membersData: any[] = [];
    const seenUserIds = new Set<string>();

    if (project.project_manager_id) {
      const pmUser = userMap.get(project.project_manager_id);
      membersData.push({
        id: project.project_manager_id,
        user_id: project.project_manager_id,
        username: pmUser?.username ?? 'pm',
        full_name: pmUser?.full_name ?? project.manager_name ?? 'Project Manager',
        role_in_project: 'PROJECT_MANAGER',
      });
      seenUserIds.add(project.project_manager_id);
    }

    for (const m of members) {
      if (m.user_id && !seenUserIds.has(m.user_id)) {
        const u = userMap.get(m.user_id);
        membersData.push({
          id: m.user_id,
          user_id: m.user_id,
          username: u?.username ?? 'member',
          full_name: u?.full_name ?? u?.username ?? 'Team Member',
          role_in_project: m.project_role ?? 'MEMBER',
        });
        seenUserIds.add(m.user_id);
      }
    }

    // Fetch sub-trees (assignments, weekly_tasks, daily_tasks)
    const mainTaskIds = mainTasks.map((m) => m.id);
    const [assignments, weeklyTasks] = await Promise.all([
      prisma.project_task_assignment.findMany({
        where: { main_task_id: { in: mainTaskIds }, company_id: companyId },
      }),
      prisma.project_weekly_task.findMany({
        where: { main_task_id: { in: mainTaskIds }, company_id: companyId },
        orderBy: { week_number: 'asc' },
      }),
    ]);

    const weeklyTaskIds = weeklyTasks.map((w) => w.id);
    const dailyTasks = await prisma.project_daily_task.findMany({
      where: { weekly_task_id: { in: weeklyTaskIds }, company_id: companyId },
      orderBy: { planned_date: 'asc' },
    });

    // Group daily tasks by weekly_task_id
    const dailyByWeekly = new Map<string, any[]>();
    for (const d of dailyTasks) {
      const list = dailyByWeekly.get(d.weekly_task_id) ?? [];
      const ownerUser = d.owner_id ? userMap.get(d.owner_id) : undefined;
      list.push({
        ...d,
        weekly_task: d.weekly_task_id,
        weekly_plan_id: d.weekly_task_id,
        owner: d.owner_id,
        owner_name: ownerUser?.full_name ?? ownerUser?.username ?? 'Team Member',
        owner_username: ownerUser?.username ?? '',
        activity_input: d.title ?? '',
        progress: Number(d.progress ?? 0),
        is_blocked: Boolean(d.is_blocked),
        block_reason: d.block_reason ?? '',
      });
      dailyByWeekly.set(d.weekly_task_id, list);
    }

    // Group weekly tasks by main_task_id
    const weeklyByMain = new Map<string, any[]>();
    for (const w of weeklyTasks) {
      const list = weeklyByMain.get(w.main_task_id) ?? [];
      const dList = dailyByWeekly.get(w.id) ?? [];
      const assignUser = w.assignee_id ? userMap.get(w.assignee_id) : undefined;
      list.push({
        ...w,
        main_task: w.main_task_id,
        project: project.id,
        target_description: w.target_description ?? '',
        progress: Number(w.progress ?? 0),
        assignee_name: assignUser?.full_name ?? assignUser?.username ?? 'Assignee',
        assignee_username: assignUser?.username ?? '',
        daily_tasks: dList,
      });
      weeklyByMain.set(w.main_task_id, list);
    }

    // Group task assignments by main_task_id
    const assignsByMain = new Map<string, any[]>();
    for (const a of assignments) {
      const list = assignsByMain.get(a.main_task_id) ?? [];
      const u = a.assignee_id ? userMap.get(a.assignee_id) : undefined;
      list.push({
        id: a.id,
        user: a.assignee_id,
        user_id: a.assignee_id,
        role: 'ASSIGNEE',
        assigned_role: 'ASSIGNEE',
        user_name: u?.full_name ?? u?.username ?? 'Team Member',
      });
      assignsByMain.set(a.main_task_id, list);
    }

    // Assemble serialized main tasks
    const serializedMainTasks = mainTasks.map((m) => {
      const wTasks = weeklyByMain.get(m.id) ?? [];
      const aList = assignsByMain.get(m.id) ?? [];
      return {
        ...m,
        project: m.project_id,
        title: m.name,
        name: m.name,
        weight: Number(m.weight ?? 10),
        progress: Number(m.progress ?? 0),
        assignments: aList,
        weekly_tasks: wTasks,
        weekly_plans: wTasks,
      };
    });

    return {
      project_id: project.id,
      id: project.id,
      project_code: project.project_code,
      code: project.project_code,
      project_name: project.project_name,
      name: project.project_name,
      description: project.description ?? '',
      progress_percent: Number(project.progress_percent ?? 0),
      progress: Number(project.progress_percent ?? 0),
      progress_percentage: Number(project.progress_percent ?? 0),
      status: project.status ?? project.lifecycle_status ?? 'DRAFT',
      lifecycle_status: project.lifecycle_status ?? 'DRAFT',
      planned_start_date: project.planned_start_date?.toISOString() ?? '',
      planned_end_date: project.planned_end_date?.toISOString() ?? '',
      budget_amount: Number(project.budget_amount ?? 0),
      budget: Number(project.budget_amount ?? 0),
      project_manager: project.project_manager_id,
      pm: project.project_manager_id,
      project_manager_name: project.manager_name ?? 'Project Manager',
      members: membersData,
      members_detail: membersData,
      available_users: allUsers,
      main_tasks: serializedMainTasks,
    };
  }

  /**
   * EVM calculation
   */
  static async calculateProjectEVM(projectId: string, asOfDate: Date = new Date(), companyId?: string) {
    const project = await prisma.project_project.findFirst({
      where: { id: projectId, ...(companyId ? { company_id: companyId } : {}) },
    });
    if (!project) throw new NotFoundError('Project');

    const bac = Number(project.budget_amount ?? 0);
    const rawProg = Number(project.progress_percent ?? 0);
    const actualProgress = rawProg / 100;

    const start = project.planned_start_date ?? project.started_at;
    const end = project.planned_end_date;
    let plannedProgress = actualProgress;

    if (start && end && new Date(end) > new Date(start)) {
      const totalDays = Math.max(1, (new Date(end).getTime() - new Date(start).getTime()) / (1000 * 3600 * 24));
      const elapsedDays = Math.max(0, Math.min(totalDays, (asOfDate.getTime() - new Date(start).getTime()) / (1000 * 3600 * 24)));
      plannedProgress = elapsedDays / totalDays;
    }

    const pv = Math.round(bac * plannedProgress * 100) / 100;
    const ev = Math.round(bac * actualProgress * 100) / 100;

    const [costEntries, expenses] = await Promise.all([
      prisma.fin_project_cost_entry.findMany({
        where: { project_id: projectId, ...(companyId ? { company_id: companyId } : {}) },
        select: { total_cost: true },
      }),
      prisma.project_expense.findMany({
        where: { project_id: projectId, ...(companyId ? { company_id: companyId } : {}) },
        select: { amount: true },
      }),
    ]);

    const costEntryTotal = costEntries.reduce((sum, c) => sum + Number(c.total_cost ?? 0), 0);
    const expenseTotal = expenses.reduce((sum, e) => sum + Number(e.amount ?? 0), 0);
    const acTotal = Math.max(costEntryTotal, expenseTotal);
    const ac = Math.round(acTotal * 100) / 100;

    const cv = ev - ac;
    const sv = ev - pv;

    const cpi = ac > 0 ? Math.round((ev / ac) * 10000) / 10000 : 1.0;
    const spi = pv > 0 ? Math.round((ev / pv) * 10000) / 10000 : 1.0;

    const eac = cpi > 0 ? Math.round((bac / cpi) * 100) / 100 : bac;
    const vac = bac - eac;

    const healthStatus =
      cpi >= 0.95 && spi >= 0.95
        ? 'GOOD'
        : cpi >= 0.85 || spi >= 0.85
          ? 'WARNING'
          : 'CRITICAL';

    return {
      as_of_date: asOfDate.toISOString().slice(0, 10),
      budget_at_completion: bac,
      planned_progress_pct: Math.round(plannedProgress * 10000) / 100,
      actual_progress_pct: Math.round(actualProgress * 10000) / 100,
      planned_value: pv,
      earned_value: ev,
      actual_cost: ac,
      cost_variance: cv,
      schedule_variance: sv,
      cost_performance_index: cpi,
      schedule_performance_index: spi,
      estimate_at_completion: eac,
      variance_at_completion: vac,
      health_status: healthStatus,
    };
  }

/**
 * advanceStage implements a named method within this file's domain service boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: Reads or mutates Prisma model(s) `project_project`; transaction boundaries are exactly those visible in the body.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
  static async advanceStage(projectId: string, targetStage: string | undefined, companyId: string) {
    const STAGE_ORDER = ['DRAFT', 'VERIFIED', 'RESERVED', 'STARTED', 'COMPLETED'];
    const project = await prisma.project_project.findFirst({ where: { id: projectId, company_id: companyId } });
    if (!project) throw new NotFoundError('Project');

    let nextStage = targetStage;
    if (!nextStage) {
      const currIdx = STAGE_ORDER.indexOf(project.status ?? 'DRAFT');
      nextStage = currIdx >= 0 && currIdx < STAGE_ORDER.length - 1 ? STAGE_ORDER[currIdx + 1] : project.status;
    }

    return prisma.project_project.update({
      where: { id: projectId },
      data: { status: nextStage, lifecycle_status: nextStage },
    });
  }

/**
 * updateDailyTaskProgress implements a named method within this file's domain service boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: No database operation is implied unless explicitly present in the implementation.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
  static async updateDailyTaskProgress(dailyTaskId: string, data: any, user: any, companyId: string) {
    return prisma.$transaction(async (tx) => {
      const { task, projectId } = await this.assertCanOperateDailyTask(dailyTaskId, user, companyId, tx);

      let status = data.status ?? task.status;

      if (data.status === 'COMPLETED' || data.status === 'DONE') {
        status = 'COMPLETED';
      } else if (data.status === 'NOT_STARTED') {
        status = 'NOT_STARTED';
      }

      const checklist = await tx.project_control_item.findMany({
        where: { daily_task_id: dailyTaskId, company_id: companyId },
        select: { status: true },
      });
      const completedStates = new Set(['DONE', 'COMPLETED', 'CHECKED', 'APPROVED']);
      const completedChecklistCount = checklist.filter((item) => completedStates.has(item.status.toUpperCase())).length;
      const progress = checklist.length > 0
        ? Math.round((completedChecklistCount / checklist.length) * 10000) / 100
        : completedStates.has(String(status).toUpperCase()) ? 100 : 0;

      // Once a checklist exists, its completion state is authoritative for both
      // percentage and status. BLOCKED remains an explicit operational override.
      if (checklist.length > 0 && status !== 'BLOCKED') {
        status = completedChecklistCount === checklist.length
          ? 'COMPLETED'
          : completedChecklistCount > 0 ? 'IN_PROGRESS' : 'NOT_STARTED';
      }

      let isBlocked = task.is_blocked;
      let blockReason = task.block_reason;

      if (data.is_blocked !== undefined) {
        isBlocked = Boolean(data.is_blocked);
        if (isBlocked) {
          status = 'BLOCKED';
          blockReason = data.block_reason ?? '';
        } else {
          if (status === 'BLOCKED') status = progress > 0 ? 'IN_PROGRESS' : 'NOT_STARTED';
          blockReason = '';
        }
      }

      const updated = await tx.project_daily_task.update({
        where: { id: dailyTaskId },
        data: {
          title: data.title ?? data.activity_input ?? task.title,
          description: data.description !== undefined ? data.description : task.description,
          time_slot: data.time_slot !== undefined ? data.time_slot : task.time_slot,
          output_result: data.output_result !== undefined ? data.output_result : task.output_result,
          notes: data.notes !== undefined ? data.notes : task.notes,
          progress,
          status,
          is_blocked: isBlocked,
          block_reason: blockReason,
          updated_at: new Date(),
        },
      });

      if (projectId) {
        await this.logActivity({
          projectId,
          tenantId: task.tenant_id,
          companyId,
          actorId: user?.id,
          taskLevel: 'DAILY',
          taskId: dailyTaskId,
          taskTitle: updated.title,
          action: 'PROGRESS_UPDATED',
          fieldName: 'progress/status',
          oldValue: `${task.progress}% (${task.status})`,
          newValue: `${updated.progress}% (${updated.status})`,
          reason: blockReason || 'Regular progress update',
        });
      }

      await this.recalculateTaskTree({ dailyTaskId, companyId });
      return updated;
    });
  }

/**
 * reportBlocked implements a named method within this file's domain service boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: No database operation is implied unless explicitly present in the implementation.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
  static async reportBlocked(dailyTaskId: string, reason: string, user: any, companyId: string) {
    if (!String(reason ?? '').trim()) throw new ValidationError('Alasan blocker wajib diisi.');
    return prisma.$transaction(async (tx) => {
      const { task, projectId } = await this.assertCanOperateDailyTask(dailyTaskId, user, companyId, tx);

      const updated = await tx.project_daily_task.update({
        where: { id: dailyTaskId },
        data: {
          is_blocked: true,
          status: 'BLOCKED',
          block_reason: reason,
          updated_at: new Date(),
        },
      });

      if (projectId) {
        await this.logActivity({
          projectId,
          tenantId: task.tenant_id,
          companyId,
          actorId: user?.id,
          taskLevel: 'DAILY',
          taskId: dailyTaskId,
          taskTitle: task.title,
          action: 'BLOCKED',
          fieldName: 'status',
          oldValue: task.status ?? 'ACTIVE',
          newValue: 'BLOCKED',
          reason,
        });
      }

      await this.recalculateTaskTree({ dailyTaskId, companyId });
      return updated;
    });
  }

/**
 * requestTaskTransfer implements a named method within this file's domain service boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: Reads or mutates Prisma model(s) `project_daily_task`, `project_weekly_task`, `project_main_task`, `project_task_transfer_request`; transaction boundaries are exactly those visible in the body.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
  static async requestTaskTransfer(dailyTaskId: string, targetUserId: string, reason: string, requester: any, companyId: string) {
    if (!String(reason ?? '').trim()) throw new ValidationError('Alasan transfer wajib diisi.');
    const { task, projectId } = await this.dailyTaskContext(dailyTaskId, companyId);
    if (!requester?.id || task.owner_id !== requester.id) {
      throw new ForbiddenError('Hanya pemilik Daily Task yang dapat mengajukan transfer. PM dapat memakai direct reassign untuk kebutuhan manajerial.');
    }
    if (targetUserId === requester.id) throw new ValidationError('User tujuan harus berbeda dari pemilik saat ini.');
    await this.assertActiveCompanyMember(targetUserId, companyId);
    const pending = await prisma.project_task_transfer_request.findFirst({
      where: { daily_task_id: dailyTaskId, company_id: companyId, status: 'PENDING' },
      select: { id: true },
    });
    if (pending) throw new ConflictError('Daily Task ini masih memiliki permintaan transfer aktif.');

    const transferReq = await prisma.project_task_transfer_request.create({
      data: {
        id: crypto.randomUUID(),
        tenant_id: task.tenant_id,
        company_id: companyId,
        created_by_id: requester?.id ?? null,
        daily_task_id: dailyTaskId,
        requested_by_id: requester?.id ?? '',
        target_user_id: targetUserId,
        status: 'PENDING',
        reason: reason ?? '',
        review_note: '',
        created_at: new Date(),
      },
    });

    if (projectId) {
      await this.logActivity({
        projectId,
        tenantId: task.tenant_id,
        companyId,
        actorId: requester?.id,
        taskLevel: 'DAILY',
        taskId: dailyTaskId,
        taskTitle: task.title,
        action: 'TRANSFER_REQUESTED',
        fieldName: 'owner',
        oldValue: requester?.username ?? 'Requester',
        newValue: targetUserId,
        reason,
      });
    }

    return transferReq;
  }

/**
 * directReassign implements a named method within this file's domain service boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: No database operation is implied unless explicitly present in the implementation.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
  static async directReassign(dailyTaskId: string, targetUserId: string, reason: string, pmUser: any, companyId: string) {
    if (!String(reason ?? '').trim()) throw new ValidationError('Alasan reassignment wajib diisi.');
    return prisma.$transaction(async (tx) => {
      const { task, projectId } = await this.dailyTaskContext(dailyTaskId, companyId, tx);
      await this.assertCanManageProject(pmUser, projectId, companyId, tx);
      await this.assertActiveCompanyMember(targetUserId, companyId, tx);
      if (task.owner_id === targetUserId) throw new ValidationError('Daily Task sudah dimiliki user tersebut.');

      const oldOwner = task.owner_id;
      const updated = await tx.project_daily_task.update({
        where: { id: dailyTaskId },
        data: {
          owner_id: targetUserId,
          updated_at: new Date(),
        },
      });

      if (projectId) {
        await this.logActivity({
          projectId,
          tenantId: task.tenant_id,
          companyId,
          actorId: pmUser?.id,
          taskLevel: 'DAILY',
          taskId: dailyTaskId,
          taskTitle: task.title,
          action: 'DIRECT_REASSIGNED',
          fieldName: 'owner',
          oldValue: oldOwner ?? '',
          newValue: targetUserId,
          reason,
        });
      }

      return updated;
    });
  }

/**
 * processTransferApproval implements a named method within this file's domain service boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: No database operation is implied unless explicitly present in the implementation.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
  static async processTransferApproval(transferId: string, approved: boolean, pmUser: any, reviewNote: string, companyId: string) {
    return prisma.$transaction(async (tx) => {
      const transfer = await tx.project_task_transfer_request.findFirst({
        where: { id: transferId, company_id: companyId },
      });
      if (!transfer) throw new NotFoundError('TaskTransferRequest');

      if (transfer.status !== 'PENDING') {
        throw new ConflictError('Permintaan transfer ini sudah diproses.');
      }

      const task = await tx.project_daily_task.findFirst({ where: { id: transfer.daily_task_id, company_id: companyId } });
      const weekly = task ? await tx.project_weekly_task.findFirst({ where: { id: task.weekly_task_id, company_id: companyId } }) : null;
      const mainTask = weekly ? await tx.project_main_task.findFirst({ where: { id: weekly.main_task_id, company_id: companyId } }) : null;
      const projectId = mainTask?.project_id;
      await this.assertCanManageProject(pmUser, projectId, companyId, tx);
      if (approved && transfer.target_user_id) {
        await this.assertActiveCompanyMember(transfer.target_user_id, companyId, tx);
      }

      if (approved) {
        await tx.project_task_transfer_request.update({
          where: { id: transferId },
          data: {
            status: 'APPROVED',
            reviewed_by_id: pmUser?.id,
            reviewed_at: new Date(),
            review_note: reviewNote,
          },
        });
        if (transfer.daily_task_id && transfer.target_user_id) {
          await tx.project_daily_task.update({
            where: { id: transfer.daily_task_id },
            data: { owner_id: transfer.target_user_id, updated_at: new Date() },
          });
        }
        if (projectId && task) {
          await this.logActivity({
            projectId,
            tenantId: task.tenant_id,
            companyId,
            actorId: pmUser?.id,
            taskLevel: 'DAILY',
            taskId: task.id,
            taskTitle: task.title,
            action: 'TRANSFER_APPROVED',
            fieldName: 'owner',
            oldValue: task.owner_id ?? '',
            newValue: transfer.target_user_id ?? '',
            reason: `Transfer approved. Note: ${reviewNote}. Reason: ${transfer.reason}`,
          });
        }
      } else {
        await tx.project_task_transfer_request.update({
          where: { id: transferId },
          data: {
            status: 'REJECTED',
            reviewed_by_id: pmUser?.id,
            reviewed_at: new Date(),
            review_note: reviewNote,
          },
        });
        if (projectId && task) {
          await this.logActivity({
            projectId,
            tenantId: task.tenant_id,
            companyId,
            actorId: pmUser?.id,
            taskLevel: 'DAILY',
            taskId: task.id,
            taskTitle: task.title,
            action: 'TRANSFER_REJECTED',
            fieldName: 'status',
            oldValue: 'PENDING',
            newValue: 'REJECTED',
            reason: reviewNote,
          });
        }
      }

      return tx.project_task_transfer_request.findUnique({ where: { id: transferId } });
    });
  }

/**
 * overrideProgress implements a named method within this file's domain service boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: No database operation is implied unless explicitly present in the implementation.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
  static async overrideProgress(entityType: 'MAIN' | 'WEEKLY', entityId: string, progress: number, reason: string, pmUser: any, companyId: string) {
    if (!Number.isFinite(progress) || progress < 0 || progress > 100) {
      throw new ValidationError('Progress harus berupa angka antara 0 dan 100.');
    }
    if (!String(reason ?? '').trim()) throw new ValidationError('Alasan override progress wajib diisi.');
    return prisma.$transaction(async (tx) => {
      if (entityType === 'MAIN') {
        const mt = await tx.project_main_task.findFirst({ where: { id: entityId, company_id: companyId } });
        if (!mt) throw new NotFoundError('MainTask');
        await this.assertCanManageProject(pmUser, mt.project_id, companyId, tx);
        const oldProgress = mt.progress;

        const updated = await tx.project_main_task.update({
          where: { id: entityId },
          data: {
            progress: Number(progress),
            is_progress_overridden: true,
            override_reason: reason,
            updated_at: new Date(),
          },
        });

        if (mt.project_id) {
          await this.logActivity({
            projectId: mt.project_id,
            tenantId: mt.tenant_id,
            companyId,
            actorId: pmUser?.id,
            taskLevel: 'MAIN',
            taskId: mt.id,
            taskTitle: mt.name,
            action: 'PROGRESS_OVERRIDDEN',
            fieldName: 'progress',
            oldValue: String(oldProgress),
            newValue: String(progress),
            reason,
          });
        }

        await this.recalculateTaskTree({ mainTaskId: entityId, companyId });
        return updated;
      } else {
        const wt = await tx.project_weekly_task.findFirst({ where: { id: entityId, company_id: companyId } });
        if (!wt) throw new NotFoundError('WeeklyTask');
        const oldProgress = wt.progress;

        const mainTask = await tx.project_main_task.findFirst({ where: { id: wt.main_task_id, company_id: companyId } });
        if (!mainTask) throw new ValidationError('Hierarchy Weekly Task tidak valid.');
        await this.assertCanManageProject(pmUser, mainTask.project_id, companyId, tx);

        const updated = await tx.project_weekly_task.update({
          where: { id: entityId },
          data: {
            progress: Number(progress),
            is_progress_overridden: true,
            override_reason: reason,
            updated_at: new Date(),
          },
        });

        if (mainTask?.project_id) {
          await this.logActivity({
            projectId: mainTask.project_id,
            tenantId: wt.tenant_id,
            companyId,
            actorId: pmUser?.id,
            taskLevel: 'WEEKLY',
            taskId: wt.id,
            taskTitle: `Week ${wt.week_number}: ${wt.target_description}`,
            action: 'PROGRESS_OVERRIDDEN',
            fieldName: 'progress',
            oldValue: String(oldProgress),
            newValue: String(progress),
            reason,
          });
        }

        await this.recalculateTaskTree({ weeklyTaskId: entityId, companyId });
        return updated;
      }
    });
  }
}
