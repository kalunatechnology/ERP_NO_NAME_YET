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
import type { Prisma } from '@prisma/client';

export const PROJECT_MANAGEMENT_ROLES = [
  'PROJECT_MANAGER',
  'PM',
  'LEAD_PROJECT_MANAGER',
] as const;
export const ACTING_PROJECT_MANAGER_ROLE = 'ACTING_PROJECT_MANAGER' as const;
const PROJECT_TRANSACTION_OPTIONS = { maxWait: 5_000, timeout: 30_000 } as const;

export interface ProjectAuthority {
  project_id: string;
  effective_role: string | null;
  is_project_manager: boolean;
  is_acting_project_manager: boolean;
  can_manage_project: boolean;
  can_manage_wbs: boolean;
  can_assign_team: boolean;
  can_manage_weekly_tasks: boolean;
  can_direct_reassign: boolean;
  can_review_task_transfer: boolean;
  can_override_progress: boolean;
  can_manage_milestones: boolean;
  can_delegate_supervisor: boolean;
  can_create_project: boolean;
  can_delete_project: boolean;
}

export class ProjectsService {
  private static activeRole(user: any): string {
    return user?.active_role_code ?? user?.roles?.[0] ?? '';
  }

  private static isOperationalAssignee(user: any): boolean {
    return ([RoleCode.STAFF, RoleCode.SUPERVISOR] as RoleCode[]).includes(this.activeRole(user) as RoleCode);
  }

  private static isCompanyAdmin(user: any): boolean {
    return this.activeRole(user) === RoleCode.COMPANY_ADMIN;
  }

  private static hasPlatformAdmin(user: any): boolean {
    return user?.roles?.includes(RoleCode.SUPER_ADMIN) || this.activeRole(user) === RoleCode.COMPANY_ADMIN;
  }

  private static hasPortfolioRead(user: any): boolean {
    return this.hasPlatformAdmin(user)
      || ([RoleCode.OPERATIONAL_MANAGER, RoleCode.DIRECTOR, RoleCode.PROJECT_MANAGER] as RoleCode[]).includes(this.activeRole(user) as RoleCode);
  }

  static async managedProjectIds(user: any, companyId: string, db: any = prisma): Promise<string[]> {
    if (!user?.id || !companyId) return [];
    const activeRole = this.activeRole(user);
    if (
      this.isCompanyAdmin(user) ||
      activeRole === RoleCode.OPERATIONAL_MANAGER ||
      activeRole === RoleCode.PROJECT_MANAGER
    ) {
      const projects = await db.project_project.findMany({
        where: { company_id: companyId },
        select: { id: true },
      });
      return projects.map((project: { id: string }) => project.id);
    }
    if (
      db === prisma
      && (!this.UUID_REGEX.test(String(user.id)) || !this.UUID_REGEX.test(String(companyId)))
    ) return [];

    if (this.isOperationalAssignee(user)) {
      const memberships = await db.project_member.findMany({
        where: {
          company_id: companyId,
          user_id: user.id,
          status: 'ACTIVE',
          project_role: ACTING_PROJECT_MANAGER_ROLE,
        },
        select: { project_id: true },
      });
      return memberships
        .map((membership: { project_id: string | null }) => membership.project_id)
        .filter((id: string | null): id is string => Boolean(id));
    }
    return [];
  }

  static async assertCanManageProject(user: any, projectId: string | null | undefined, companyId: string, db: any = prisma): Promise<void> {
    if (!projectId || !companyId || !user?.id || user?.roles?.includes(RoleCode.SUPER_ADMIN)) {
      throw new ForbiddenError('Anda tidak memiliki kewenangan pengelolaan pada project ini.');
    }
    const activeRole = this.activeRole(user);
    if (
      this.isCompanyAdmin(user) ||
      activeRole === RoleCode.OPERATIONAL_MANAGER ||
      activeRole === RoleCode.PROJECT_MANAGER
    ) {
      const project = await db.project_project.findFirst({
        where: { id: projectId, company_id: companyId },
        select: { id: true },
      });
      if (project) return;
      throw new ForbiddenError('Anda tidak memiliki kewenangan pengelolaan pada project ini.');
    }
    if (this.isOperationalAssignee(user)) {
      const membership = await db.project_member.findFirst({
        where: {
          project_id: projectId,
          company_id: companyId,
          user_id: user.id,
          status: 'ACTIVE',
          project_role: ACTING_PROJECT_MANAGER_ROLE,
        },
        select: { id: true },
      });
      if (membership) return;
      throw new ForbiddenError('Anda tidak memiliki kewenangan pengelolaan pada project ini.');
    }
    throw new ForbiddenError('Anda tidak memiliki kewenangan pengelolaan pada project ini.');
  }

  static async hasProjectManagementAuthority(user: any, projectId: string, companyId: string, db: any = prisma): Promise<boolean> {
    try {
      await this.assertCanManageProject(user, projectId, companyId, db);
      return true;
    } catch (error) {
      if (error instanceof ForbiddenError) return false;
      throw error;
    }
  }

  static async assertCanAssignProjectMembers(user: any, projectId: string, companyId: string, db: any = prisma): Promise<void> {
    await this.assertCanManageProject(user, projectId, companyId, db);
  }

  static async projectAccessWhere(user: any, companyId: string, db: any = prisma): Promise<Record<string, unknown>> {
    if (this.hasPortfolioRead(user) || this.activeRole(user) === RoleCode.PROJECT_MANAGER) return {};
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

  private static readonly UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  private static async operationalTaskReadScope(
    user: any,
    companyId: string,
    db: any = prisma,
  ): Promise<{
    mainTaskIds: string[];
    weeklyTaskIds: string[];
  }> {
    if (
      !this.isOperationalAssignee(user) ||
      !user?.id ||
      !companyId
    ) {
      return {
        mainTaskIds: [],
        weeklyTaskIds: [],
      };
    }

    if (
      db === prisma &&
      (!this.UUID_REGEX.test(String(user.id)) || !this.UUID_REGEX.test(String(companyId)))
    ) {
      return {
        mainTaskIds: [],
        weeklyTaskIds: [],
      };
    }

    try {

    const [
      memberships,
      mainAssignments,
      ownWeeklyTasks,
    ] = await Promise.all([
      db.project_member.findMany({
        where: {
          company_id:
            companyId,

          user_id:
            user.id,

          status:
            'ACTIVE',
        },

        select: {
          project_id:
            true,
        },
      }),

      db.project_task_assignment.findMany({
        where: {
          company_id:
            companyId,

          assignee_id:
            user.id,
        },

        select: {
          main_task_id:
            true,
        },
      }),

      db.project_weekly_task.findMany({
        where: {
          company_id:
            companyId,

          assignee_id:
            user.id,
        },

        select: {
          id:
            true,

          main_task_id:
            true,
        },
      }),
    ]);

    const memberProjectIds =
      memberships
        .map(
          (item: {
            project_id:
              string | null;
          }) =>
            item.project_id,
        )
        .filter(
          (
            id: string | null,
          ): id is string =>
            Boolean(id),
        );

    /**
     * Jika user merupakan active project member,
     * ia boleh membaca hierarchy task project tersebut.
     */
    const projectMainTasks =
      memberProjectIds.length
        ? await db.project_main_task.findMany({
            where: {
              company_id:
                companyId,

              project_id: {
                in:
                  memberProjectIds,
              },
            },

            select: {
              id:
                true,
            },
          })
        : [];

    const projectMainIds =
      projectMainTasks.map(
        (task: { id: string }) =>
          task.id,
      );

    const directlyAssignedMainIds =
      mainAssignments.map(
        (assignment: {
          main_task_id: string;
        }) =>
          assignment.main_task_id,
      );

    /**
     * Parent Main Task tetap perlu terlihat
     * jika user ditugaskan ke Weekly Task.
     */
    const weeklyParentMainIds =
      ownWeeklyTasks.map(
        (task: {
          main_task_id: string;
        }) =>
          task.main_task_id,
      );

    const mainTaskIds =
      Array.from(
        new Set([
          ...projectMainIds,
          ...directlyAssignedMainIds,
          ...weeklyParentMainIds,
        ]),
      );

    /**
     * Seluruh weekly task boleh dibaca jika:
     *
     * - user member project; atau
     * - user assigned langsung pada Main Task.
     *
     * Assignment Weekly saja tidak otomatis
     * membuka sibling Weekly Task.
     */
    const hierarchyMainIds =
      Array.from(
        new Set([
          ...projectMainIds,
          ...directlyAssignedMainIds,
        ]),
      );

    const hierarchyWeeklyTasks =
      hierarchyMainIds.length
        ? await db.project_weekly_task.findMany({
            where: {
              company_id:
                companyId,

              main_task_id: {
                in:
                  hierarchyMainIds,
              },
            },

            select: {
              id:
                true,
            },
          })
        : [];

    const weeklyTaskIds =
      Array.from(
        new Set([
          ...ownWeeklyTasks.map(
            (task: {
              id: string;
            }) =>
              task.id,
          ),

          ...hierarchyWeeklyTasks.map(
            (task: {
              id: string;
            }) =>
              task.id,
          ),
        ]),
      );

      return {
        mainTaskIds,
        weeklyTaskIds,
      };
    } catch {
      return {
        mainTaskIds: [],
        weeklyTaskIds: [],
      };
    }
  }

  static async dailyTaskAccessWhere(
    user: any,
    companyId: string,
    db: any = prisma,
  ): Promise<Record<string, unknown>> {
    if (
      this.isOperationalAssignee(
        user,
      )
    ) {
      const scope =
        await this.operationalTaskReadScope(
          user,
          companyId,
          db,
        );

      const managedProjectIds = await this.managedProjectIds(user, companyId, db);
      let managedWeeklyTaskIds: string[] = [];
      if (managedProjectIds.length) {
        const managedMainTasks = await db.project_main_task.findMany({
          where: { company_id: companyId, project_id: { in: managedProjectIds } },
          select: { id: true },
        });
        const managedWeeklyTasks = await db.project_weekly_task.findMany({
          where: { company_id: companyId, main_task_id: { in: managedMainTasks.map((task: { id: string }) => task.id) } },
          select: { id: true },
        });
        managedWeeklyTaskIds = managedWeeklyTasks.map((task: { id: string }) => task.id);
      }

      /**
       * Tidak mempunyai relasi team/project?
       *
       * Tetap pertahankan behavior lama:
       * hanya task miliknya sendiri.
       */
      if (
        !scope.weeklyTaskIds.length && !managedWeeklyTaskIds.length
      ) {
        return {
          owner_id:
            user.id,
        };
      }

      return {
        OR: [
          {
            owner_id:
              user.id,
          },

          {
            weekly_task_id: {
              in:
                [...new Set([...scope.weeklyTaskIds, ...managedWeeklyTaskIds])],
            },
          },
        ],
      };
    }

    if (
      this.hasPortfolioRead(user) ||
      this.activeRole(user) === RoleCode.PROJECT_MANAGER
    ) {
      return {};
    }

    return {
      id: {
        in: [],
      },
    };
  }

  static async mainTaskAccessWhere(user: any, companyId: string, db: any = prisma): Promise<Record<string, unknown>> {
    if (
      this.isOperationalAssignee(
        user,
      )
    ) {
      const scope =
        await this.operationalTaskReadScope(
          user,
          companyId,
          db,
        );

      const managedProjectIds = await this.managedProjectIds(user, companyId, db);
      return managedProjectIds.length
        ? { OR: [{ id: { in: scope.mainTaskIds } }, { project_id: { in: managedProjectIds } }] }
        : { id: { in: scope.mainTaskIds } };
    }
    if (this.hasPortfolioRead(user) || this.activeRole(user) === RoleCode.PROJECT_MANAGER) return {};
    return { id: { in: [] } };
  }

  static async weeklyTaskAccessWhere(user: any, companyId: string, db: any = prisma): Promise<Record<string, unknown>> {
    if (
      this.isOperationalAssignee(
        user,
      )
    ) {
      const scope =
        await this.operationalTaskReadScope(
          user,
          companyId,
          db,
        );

      const managedProjectIds = await this.managedProjectIds(user, companyId, db);
      if (!managedProjectIds.length) {
        return scope.weeklyTaskIds.length
          ? { id: { in: scope.weeklyTaskIds } }
          : { assignee_id: user.id };
      }
      const managedMainTasks = await db.project_main_task.findMany({
        where: { company_id: companyId, project_id: { in: managedProjectIds } },
        select: { id: true },
      });
      return {
        OR: [
          { id: { in: scope.weeklyTaskIds } },
          { main_task_id: { in: managedMainTasks.map((task: { id: string }) => task.id) } },
        ],
      };
    }
    if (this.hasPortfolioRead(user) || this.activeRole(user) === RoleCode.PROJECT_MANAGER) return {};
    return { id: { in: [] } };
  }

  static async taskAssignmentAccessWhere(user: any, companyId: string, db: any = prisma): Promise<Record<string, unknown>> {
    if (this.isOperationalAssignee(user)) {
      const managedProjectIds = await this.managedProjectIds(user, companyId, db);
      if (!managedProjectIds.length) return { assignee_id: user.id };
      const managedMainTasks = await db.project_main_task.findMany({
        where: { company_id: companyId, project_id: { in: managedProjectIds } },
        select: { id: true },
      });
      return {
        OR: [
          { assignee_id: user.id },
          { main_task_id: { in: managedMainTasks.map((task: { id: string }) => task.id) } },
        ],
      };
    }
    if (this.hasPortfolioRead(user) || this.activeRole(user) === RoleCode.PROJECT_MANAGER) return {};
    return { id: { in: [] } };
  }

  static async taskTransferAccessWhere(user: any, companyId: string, db: any = prisma): Promise<Record<string, unknown>> {
    if (this.isOperationalAssignee(user)) {
      const managedProjectIds = await this.managedProjectIds(user, companyId, db);
      if (!managedProjectIds.length) return { OR: [{ requested_by_id: user.id }, { target_user_id: user.id }] };
      const managedMainTasks = await db.project_main_task.findMany({
        where: { company_id: companyId, project_id: { in: managedProjectIds } },
        select: { id: true },
      });
      const managedWeeklyTasks = await db.project_weekly_task.findMany({
        where: { company_id: companyId, main_task_id: { in: managedMainTasks.map((task: { id: string }) => task.id) } },
        select: { id: true },
      });
      const managedDailyTasks = await db.project_daily_task.findMany({
        where: { company_id: companyId, weekly_task_id: { in: managedWeeklyTasks.map((task: { id: string }) => task.id) } },
        select: { id: true },
      });
      return {
        OR: [
          { requested_by_id: user.id },
          { target_user_id: user.id },
          { daily_task_id: { in: managedDailyTasks.map((task: { id: string }) => task.id) } },
        ],
      };
    }
    if (this.hasPortfolioRead(user) || this.activeRole(user) === RoleCode.PROJECT_MANAGER) return {};
    return { id: { in: [] } };
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

  static async assertActiveCompanyMember(
    userId: string,
    companyId: string,
    db: any = prisma,
  ): Promise<{ id: string; tenant_id: string }> {
    if (!userId) throw new ValidationError('User tujuan wajib dipilih.');
    const membership = await db.iam_user_company_membership.findFirst({
      where: { company_id: companyId, user_id: userId, status: 'ACTIVE' },
      select: { id: true, tenant_id: true },
    });
    if (!membership) throw new ForbiddenError('User tujuan bukan anggota aktif company ini.');
    return membership;
  }

  static async assertOperationalCompanyMember(userId: string, companyId: string, db: any = prisma): Promise<void> {
    const membership = await this.assertActiveCompanyMember(userId, companyId, db);
    const assignments = await db.iam_user_role.findMany({
      where: { user_id: userId, company_id: companyId },
      select: { role_id: true },
    });
    const roleIds = assignments
      .map((assignment: { role_id: string | null }) => assignment.role_id)
      .filter((roleId: string | null): roleId is string => Boolean(roleId));
    const operationalRole = roleIds.length
      ? await db.iam_role.findFirst({
          where: {
            id: { in: roleIds },
            tenant_id: membership.tenant_id,
            OR: [
              { company_id: companyId },
              { company_id: null },
            ],
            role_code: { in: [RoleCode.STAFF, RoleCode.SUPERVISOR] },
          },
          select: { id: true },
        })
      : null;
    if (!operationalRole) {
      throw new ValidationError('User yang dipilih harus memiliki role Staff atau Supervisor pada company aktif.');
    }
  }

  static async assertCanDelegateProjectAuthority(
    user: any,
    projectId: string,
    companyId: string,
    db: any = prisma,
  ): Promise<void> {
    if (!user?.id || user?.roles?.includes(RoleCode.SUPER_ADMIN)) {
      throw new ForbiddenError('Anda tidak memiliki kewenangan untuk menunjuk atau mencabut Project Supervisor.');
    }
    const project = await db.project_project.findFirst({
      where: { id: projectId, company_id: companyId },
      select: { id: true, project_manager_id: true },
    });
    if (!project) throw new NotFoundError('Project');
    const allowed = this.isCompanyAdmin(user)
      || this.activeRole(user) === RoleCode.OPERATIONAL_MANAGER
      || this.activeRole(user) === RoleCode.PROJECT_MANAGER;
    if (!allowed) {
      throw new ForbiddenError('Anda tidak memiliki kewenangan untuk menunjuk atau mencabut Project Supervisor.');
    }
  }

  static async getProjectSupervisor(projectId: string, companyId: string, db: any = prisma) {
    const project = await db.project_project.findFirst({
      where: { id: projectId, company_id: companyId },
      select: { id: true },
    });
    if (!project) throw new NotFoundError('Project');
    const membership = await db.project_member.findFirst({
      where: {
        project_id: projectId,
        company_id: companyId,
        project_role: ACTING_PROJECT_MANAGER_ROLE,
        status: 'ACTIVE',
      },
      orderBy: { assigned_at: 'desc' },
    });
    if (!membership?.user_id) return null;
    const [member, creator] = await Promise.all([
      db.iam_user.findFirst({
        where: { id: membership.user_id, is_active: true },
        select: { id: true, full_name: true, email: true },
      }),
      membership.created_by_id
        ? db.iam_user.findFirst({
            where: { id: membership.created_by_id },
            select: { id: true, full_name: true, email: true },
          })
        : Promise.resolve(null),
    ]);
    return {
      project_id: projectId,
      user_id: membership.user_id,
      full_name: member?.full_name ?? '',
      email: member?.email ?? '',
      project_role: membership.project_role,
      status: membership.status,
      assigned_at: membership.assigned_at,
      assigned_by: creator,
    };
  }

  private static async writeSupervisorAudit(
    db: any,
    params: {
      projectId: string;
      tenantId: string | null;
      companyId: string;
      actorId: string;
      eventType: string;
      beforeData: Record<string, unknown>;
      afterData: Record<string, unknown>;
    },
  ) {
    await db.core_audit_event.create({
      data: {
        id: crypto.randomUUID(),
        tenant_id: params.tenantId,
        company_id: params.companyId,
        created_by_id: params.actorId,
        user_id: params.actorId,
        entity_name: 'project_member',
        entity_id: params.projectId,
        event_type: params.eventType,
        before_data: params.beforeData,
        after_data: params.afterData,
        occurred_at: new Date(),
      },
    });
  }

  static async assignProjectSupervisor(
    projectId: string,
    userId: string,
    reason: string,
    actor: any,
    companyId: string,
  ) {
    if (!userId) throw new ValidationError('user_id wajib diisi.');
    await this.assertCanDelegateProjectAuthority(actor, projectId, companyId);
    const project = await prisma.project_project.findFirst({
      where: { id: projectId, company_id: companyId },
      select: { id: true, tenant_id: true },
    });
    if (!project) throw new NotFoundError('Project');
    await prisma.$transaction(async (tx) => {
      await this.assertCanDelegateProjectAuthority(actor, projectId, companyId, tx);
      const candidate = await tx.iam_user.findFirst({
        where: { id: userId, tenant_id: project.tenant_id, is_active: true, status: 'ACTIVE' },
        select: { id: true, active_role_id: true },
      });
      if (!candidate) throw new ValidationError('Calon Project Supervisor harus merupakan user aktif pada tenant yang sama.');
      await this.assertOperationalCompanyMember(userId, companyId, tx);
      const activeOperationalRole = candidate.active_role_id
        ? await tx.iam_role.findFirst({
            where: {
              id: candidate.active_role_id,
              tenant_id: project.tenant_id,
              OR: [{ company_id: companyId }, { company_id: null }],
              role_code: { in: [RoleCode.STAFF, RoleCode.SUPERVISOR] },
            },
            select: { id: true },
          })
        : null;
      if (!activeOperationalRole) {
        throw new ValidationError('Role aktif calon Project Supervisor harus Staff atau Supervisor.');
      }
      const current = await tx.project_member.findFirst({
        where: { project_id: projectId, company_id: companyId, project_role: ACTING_PROJECT_MANAGER_ROLE, status: 'ACTIVE' },
        orderBy: { assigned_at: 'desc' },
      });
      if (current?.user_id === userId) return;
      const now = new Date();
      if (current) {
        await tx.project_member.updateMany({
          where: { project_id: projectId, company_id: companyId, project_role: ACTING_PROJECT_MANAGER_ROLE, status: 'ACTIVE' },
          data: { status: 'INACTIVE', left_at: now },
        });
      }
      const historical = await tx.project_member.findFirst({
        where: { project_id: projectId, company_id: companyId, user_id: userId, project_role: ACTING_PROJECT_MANAGER_ROLE },
        orderBy: { created_at: 'desc' },
      });
      if (historical) {
        await tx.project_member.update({
          where: { id: historical.id },
          data: {
            status: 'ACTIVE',
            assigned_at: now,
            left_at: null,
            created_by_id: actor.id,
            permissions_json: { source: 'PROJECT_SUPERVISOR', reason: reason ?? '' },
          },
        });
      } else {
        await tx.project_member.create({
          data: {
            id: crypto.randomUUID(),
            tenant_id: project.tenant_id,
            company_id: companyId,
            created_by_id: actor.id,
            project_id: projectId,
            user_id: userId,
            project_role: ACTING_PROJECT_MANAGER_ROLE,
            status: 'ACTIVE',
            permissions_json: { source: 'PROJECT_SUPERVISOR', reason: reason ?? '' },
            assigned_at: now,
          },
        });
      }
      await this.writeSupervisorAudit(tx, {
        projectId,
        tenantId: project.tenant_id,
        companyId,
        actorId: actor.id,
        eventType: current ? 'PROJECT_SUPERVISOR_REPLACED' : 'PROJECT_SUPERVISOR_ASSIGNED',
        beforeData: { user_id: current?.user_id ?? null, reason: reason ?? '' },
        afterData: { user_id: userId, project_role: ACTING_PROJECT_MANAGER_ROLE, status: 'ACTIVE', reason: reason ?? '' },
      });
    }, PROJECT_TRANSACTION_OPTIONS);
    return this.getProjectSupervisor(projectId, companyId);
  }

  static async revokeProjectSupervisor(projectId: string, reason: string, actor: any, companyId: string) {
    await this.assertCanDelegateProjectAuthority(actor, projectId, companyId);
    await prisma.$transaction(async (tx) => {
      await this.assertCanDelegateProjectAuthority(actor, projectId, companyId, tx);
      const current = await tx.project_member.findFirst({
        where: { project_id: projectId, company_id: companyId, project_role: ACTING_PROJECT_MANAGER_ROLE, status: 'ACTIVE' },
      });
      if (!current) throw new NotFoundError('ProjectSupervisor');
      await tx.project_member.update({
        where: { id: current.id },
        data: { status: 'INACTIVE', left_at: new Date() },
      });
      await this.writeSupervisorAudit(tx, {
        projectId,
        tenantId: current.tenant_id,
        companyId,
        actorId: actor.id,
        eventType: 'PROJECT_SUPERVISOR_REVOKED',
        beforeData: { user_id: current.user_id, project_role: current.project_role, status: 'ACTIVE' },
        afterData: { user_id: current.user_id, project_role: current.project_role, status: 'INACTIVE', reason: reason ?? '' },
      });
    }, PROJECT_TRANSACTION_OPTIONS);
  }

  static async getProjectAuthority(user: any, projectId: string, companyId: string, db: any = prisma): Promise<ProjectAuthority> {
    const project = await db.project_project.findFirst({
      where: { id: projectId, company_id: companyId },
      select: { id: true, project_manager_id: true },
    });
    if (!project) throw new NotFoundError('Project');
    await this.assertCanViewProject(user, projectId, companyId, db);
    const activeRole = this.activeRole(user);
    const isGlobalPm = activeRole === RoleCode.PROJECT_MANAGER;
    const isOm = activeRole === RoleCode.OPERATIONAL_MANAGER;
    const isAdmin = this.isCompanyAdmin(user);

    let isActing = false;
    if (this.isOperationalAssignee(user) && user?.id) {
      const membership = await db.project_member.findFirst({
        where: {
          project_id: projectId,
          company_id: companyId,
          user_id: user.id,
          status: 'ACTIVE',
          project_role: ACTING_PROJECT_MANAGER_ROLE,
        },
        select: { project_role: true },
      });
      isActing = Boolean(membership);
    }

    const isPm = isGlobalPm;
    const canManage = !user?.roles?.includes(RoleCode.SUPER_ADMIN) && (isAdmin || isOm || isPm || isActing);
    const canDelegate = canManage && (isAdmin || isOm || isPm);
    const effectiveRole = isActing
      ? ACTING_PROJECT_MANAGER_ROLE
      : isPm
        ? 'PROJECT_MANAGER'
        : isOm
          ? 'OPERATIONAL_MANAGER'
          : isAdmin
            ? 'COMPANY_ADMIN'
            : null;

    return {
      project_id: projectId,
      effective_role: effectiveRole,
      is_project_manager: isPm,
      is_acting_project_manager: isActing,
      can_manage_project: canManage,
      can_manage_wbs: canManage,
      can_assign_team: canManage,
      can_manage_weekly_tasks: canManage,
      can_direct_reassign: canManage,
      can_review_task_transfer: canManage,
      can_override_progress: canManage,
      can_manage_milestones: canManage,
      can_delegate_supervisor: canDelegate,
      can_create_project: isAdmin || isOm || isPm,
      can_delete_project: isAdmin || isOm || isPm,
    };
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
  }, db: any = prisma) {
    try {
      await db.project_task_activity_log.create({
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
      // A failed query inside an interactive transaction makes that transaction
      // unusable. Propagate it so the caller rolls back instead of continuing
      // with a partially applied task update.
      if (db !== prisma) throw e;
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
  }, db?: Prisma.TransactionClient) {
    const recalculate = async (tx: Prisma.TransactionClient) => {
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
    };

    // Reuse the caller's transaction when a mutation already owns one. Starting
    // a second transaction here can wait on locks held by the outer transaction
    // until Prisma's five-second interactive timeout expires.
    return db
      ? recalculate(db)
      : prisma.$transaction(recalculate, PROJECT_TRANSACTION_OPTIONS);
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

    const [costEntries, expenses, billingDocuments] = await Promise.all([
      prisma.fin_project_cost_entry.findMany({
        where: { project_id: projectId, ...(companyId ? { company_id: companyId } : {}) },
        select: { total_cost: true },
      }),
      prisma.project_expense.findMany({
        where: { project_id: projectId, ...(companyId ? { company_id: companyId } : {}) },
        select: { amount: true },
      }),
      prisma.fin_billing_document.findMany({
        where: { project_id: projectId, ...(companyId ? { company_id: companyId } : {}), status: 'POSTED' },
        select: { total_amount: true },
      }),
    ]);

    const costEntryTotal = costEntries.reduce((sum, c) => sum + Number(c.total_cost ?? 0), 0);
    const expenseTotal = expenses.reduce((sum, e) => sum + Number(e.amount ?? 0), 0);
    const acTotal = Math.max(costEntryTotal, expenseTotal);
    const ac = Math.round(acTotal * 100) / 100;
    const expectedRevenue = Number(project.contract_amount ?? 0);
    const targetMarginPercent = Number(project.target_margin_percent ?? 0);
    const invoicedRevenue = Math.round(
      billingDocuments.reduce((sum, document) => sum + Number(document.total_amount ?? 0), 0) * 100,
    ) / 100;
    const earnedRevenue = Math.round(expectedRevenue * actualProgress * 100) / 100;
    const actualGrossProfit = Math.round((earnedRevenue - ac) * 100) / 100;
    const actualMarginPercent = earnedRevenue > 0
      ? Math.round((actualGrossProfit / earnedRevenue) * 10000) / 100
      : 0;
    const budgetUtilizationPercent = bac > 0
      ? Math.round((ac / bac) * 10000) / 100
      : 0;

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
    const financialHealthStatus = actualGrossProfit < 0
      ? 'UNPROFITABLE'
      : actualMarginPercent >= targetMarginPercent
        ? 'PROFITABLE'
        : 'AT_RISK';

    return {
      as_of_date: asOfDate.toISOString().slice(0, 10),
      budget_at_completion: bac,
      planned_budget: bac,
      expected_revenue: expectedRevenue,
      invoiced_revenue: invoicedRevenue,
      target_margin_percent: targetMarginPercent,
      budget_utilization_percent: budgetUtilizationPercent,
      actual_gross_profit: actualGrossProfit,
      actual_margin_percent: actualMarginPercent,
      financial_health_status: financialHealthStatus,
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

      const requestedStatus = data.status === undefined ? undefined : String(data.status).trim().toUpperCase();
      const statusAliases: Record<string, string> = {
        PENDING: 'IN_PROGRESS',
        ON_PROGRESS: 'IN_PROGRESS',
        'IN PROGRESS': 'IN_PROGRESS',
        IN_PROGRESS: 'IN_PROGRESS',
        DONE: 'COMPLETED',
        COMPLETED: 'COMPLETED',
        NOT_STARTED: 'NOT_STARTED',
        BLOCKED: 'BLOCKED',
      };
      if (requestedStatus && !statusAliases[requestedStatus]) {
        throw new ValidationError('Status Daily Task tidak valid.');
      }
      let status = requestedStatus ? statusAliases[requestedStatus] : task.status;

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

      // A BLOCKED status is a single operational state, never merely a label.
      // Accept legacy callers that send status=BLOCKED, but require a reason so
      // the task remains actionable and the resulting record is consistent.
      let isBlocked = data.is_blocked !== undefined
        ? Boolean(data.is_blocked)
        : status === 'BLOCKED' ? true : task.is_blocked;
      let blockReason = task.block_reason;

      if (data.is_blocked !== undefined) {
        if (isBlocked) {
          status = 'BLOCKED';
          blockReason = data.block_reason ?? '';
        } else {
          if (status === 'BLOCKED') status = progress > 0 ? 'IN_PROGRESS' : 'NOT_STARTED';
          blockReason = '';
        }
      }
      if (isBlocked) {
        blockReason = String(data.block_reason ?? blockReason ?? '').trim();
        if (!blockReason) throw new ValidationError('Alasan kendala wajib diisi saat Daily Task diblokir.');
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
        }, tx);
      }

      await this.recalculateTaskTree({ dailyTaskId, companyId }, tx);
      return updated;
    }, PROJECT_TRANSACTION_OPTIONS);
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
        }, tx);
      }

      await this.recalculateTaskTree({ dailyTaskId, companyId }, tx);
      return updated;
    }, PROJECT_TRANSACTION_OPTIONS);
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
        }, tx);
      }

      return updated;
    }, PROJECT_TRANSACTION_OPTIONS);
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
          }, tx);
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
          }, tx);
        }
      }

      return tx.project_task_transfer_request.findUnique({ where: { id: transferId } });
    }, PROJECT_TRANSACTION_OPTIONS);
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
          }, tx);
        }

        await this.recalculateTaskTree({ mainTaskId: entityId, companyId }, tx);
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
          }, tx);
        }

        await this.recalculateTaskTree({ weeklyTaskId: entityId, companyId }, tx);
        return updated;
      }
    }, PROJECT_TRANSACTION_OPTIONS);
  }

  static async getFinancialSummary(user: any, companyId: string, projectId?: string) {
    const role = this.activeRole(user);
    const allowedRoles: string[] = [RoleCode.PROJECT_MANAGER, RoleCode.OPERATIONAL_MANAGER, RoleCode.DIRECTOR];
    const hasScopedProjectRead = projectId
      ? await this.hasProjectManagementAuthority(user, projectId, companyId)
      : false;
    if (!allowedRoles.includes(role) && !this.hasPlatformAdmin(user) && !hasScopedProjectRead) {
      throw new ForbiddenError('Ringkasan keuangan proyek hanya tersedia untuk PM, OM, Director, atau administrator company.');
    }
    const accessWhere = await this.projectAccessWhere(user, companyId);
    const projects = await prisma.project_project.findMany({
      where: { company_id: companyId, ...accessWhere, ...(projectId ? { id: projectId } : {}) },
      select: { id: true, project_code: true, project_name: true, budget_amount: true, progress_percent: true },
    });
    if (projectId && !projects.length) throw new NotFoundError('Project');
    const ids = projects.map((project) => project.id);
    if (!ids.length) return { as_of: new Date(), projects: [], totals: { budget: 0, actual_cost: 0, billing_total: 0, funded_amount: 0 }, cash_trend: [], top_expenses: [] };

    const [costs, billings, fundings, wipSnapshots] = await Promise.all([
      prisma.fin_project_cost_entry.findMany({ where: { company_id: companyId, project_id: { in: ids }, status: { in: ['VALIDATED', 'APPROVED', 'POSTED_TO_WIP'] } }, select: { project_id: true, total_cost: true, cost_element: true, transaction_date: true } }),
      prisma.fin_billing_document.findMany({ where: { company_id: companyId, project_id: { in: ids }, status: 'POSTED' }, select: { project_id: true, total_amount: true } }),
      prisma.fin_project_funding.findMany({ where: { company_id: companyId, project_id: { in: ids }, status: 'DRAWN' }, select: { project_id: true, approved_limit: true, requested_amount: true } }),
      prisma.fin_project_wip_snapshot.findMany({ where: { company_id: companyId, project_id: { in: ids } }, orderBy: { snapshot_date: 'desc' } }),
    ]);
    const latestWip = new Map<string, number>();
    wipSnapshots.forEach((snapshot) => {
      if (snapshot.project_id && !latestWip.has(snapshot.project_id)) latestWip.set(snapshot.project_id, Number(snapshot.wip_asset_amount ?? 0));
    });
    const projectRows = projects.map((project) => {
      const actualCost = costs.filter((row) => row.project_id === project.id).reduce((sum, row) => sum + Number(row.total_cost), 0);
      const billingTotal = billings.filter((row) => row.project_id === project.id).reduce((sum, row) => sum + Number(row.total_amount ?? 0), 0);
      const fundedAmount = fundings.filter((row) => row.project_id === project.id).reduce((sum, row) => sum + Number(row.approved_limit ?? row.requested_amount ?? 0), 0);
      const budget = Number(project.budget_amount ?? 0);
      return { project_id: project.id, project_code: project.project_code, project_name: project.project_name, budget, actual_cost: actualCost, budget_variance: budget - actualCost, wip_balance: latestWip.get(project.id) ?? null, billing_total: billingTotal, funded_amount: fundedAmount, completion_pct: Number(project.progress_percent ?? 0) };
    });
    const monthMap = new Map<string, number>();
    const categoryMap = new Map<string, number>();
    costs.forEach((row) => {
      const month = row.transaction_date.toISOString().slice(0, 7);
      monthMap.set(month, (monthMap.get(month) ?? 0) + Number(row.total_cost));
      const category = row.cost_element || 'UNSPECIFIED';
      categoryMap.set(category, (categoryMap.get(category) ?? 0) + Number(row.total_cost));
    });
    return {
      as_of: new Date(), projects: projectRows,
      totals: { budget: projectRows.reduce((sum, row) => sum + row.budget, 0), actual_cost: projectRows.reduce((sum, row) => sum + row.actual_cost, 0), billing_total: projectRows.reduce((sum, row) => sum + row.billing_total, 0), funded_amount: projectRows.reduce((sum, row) => sum + row.funded_amount, 0) },
      cash_trend: [...monthMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, expense]) => ({ month, expense })),
      top_expenses: [...categoryMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([category, amount]) => ({ category, amount })),
    };
  }
}
