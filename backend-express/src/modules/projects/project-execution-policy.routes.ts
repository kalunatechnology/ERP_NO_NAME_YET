import { NextFunction, Request, Response, Router } from 'express';
import prisma from '../../config/database';
import { RoleCode } from '../../types/roles';
import { ForbiddenError, ValidationError } from '../../utils/errors';
import { ProjectsService } from './projects.service';

/**
 * Project execution policy bridge.
 *
 * The canonical Project routes historically built the Main Task assignee list
 * from STAFF/SUPERVISOR roles only and then tried to resolve the user's active
 * role from that reduced role map. A user with the required baseline STAFF
 * role but an active functional role (PM, Finance, Company Admin, etc.) was
 * therefore omitted from the selector even though the mutation layer already
 * permits that user to execute personal project work.
 *
 * This router is mounted before projectsRouter and owns only the selector plus
 * defense-in-depth validation for execution assignees. CRUD remains in the
 * canonical projectsRouter.
 */
export const projectExecutionPolicyRouter = Router();

function activeCompanyId(req: Request): string {
  if (!req.companyId) throw new ForbiddenError('Pilih company sebelum mengakses data proyek.');
  return req.companyId;
}

function activeTenantId(req: Request): string {
  const tenantId = req.user?.tenant_id;
  if (!tenantId) throw new ForbiddenError('Tenant aktif tidak tersedia.');
  return tenantId;
}

async function loadCompanyRoleMap(companyId: string, tenantId: string, userIds: string[]) {
  if (!userIds.length) {
    return {
      rolesById: new Map<string, { id: string; role_code: RoleCode; role_name: string }>(),
      rolesByUser: new Map<string, Array<{ id: string; role_code: RoleCode; role_name: string }>>(),
    };
  }

  const assignments = await prisma.iam_user_role.findMany({
    where: {
      company_id: companyId,
      user_id: { in: userIds },
    },
    select: { user_id: true, role_id: true },
  });

  const roleIds = Array.from(
    new Set(
      assignments
        .map((assignment) => assignment.role_id)
        .filter((roleId): roleId is string => Boolean(roleId)),
    ),
  );

  const roles = roleIds.length
    ? await prisma.iam_role.findMany({
        where: {
          id: { in: roleIds },
          tenant_id: tenantId,
          OR: [{ company_id: companyId }, { company_id: null }],
        },
        select: { id: true, role_code: true, role_name: true },
      })
    : [];

  const rolesById = new Map(roles.map((role) => [role.id, role]));
  const rolesByUser = new Map<string, typeof roles>();

  assignments.forEach((assignment) => {
    if (!assignment.user_id || !assignment.role_id) return;
    const role = rolesById.get(assignment.role_id);
    if (!role) return;
    const current = rolesByUser.get(assignment.user_id) ?? [];
    current.push(role);
    rolesByUser.set(assignment.user_id, current);
  });

  return { rolesById, rolesByUser };
}

function hasExecutionBaseline(roles: Array<{ role_code: RoleCode }>): boolean {
  return roles.some((role) =>
    ([RoleCode.STAFF, RoleCode.SUPERVISOR] as RoleCode[]).includes(role.role_code),
  );
}

function hasExecutiveRole(roles: Array<{ role_code: RoleCode }>): boolean {
  return roles.some((role) => role.role_code === RoleCode.DIRECTOR);
}

/**
 * GET /assignable-users
 *
 * Return every active company user that has the baseline execution capability,
 * regardless of which functional role is currently active. Executive/Director
 * is intentionally excluded because the Executive workspace is read-only.
 */
projectExecutionPolicyRouter.get(
  '/assignable-users',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const companyId = activeCompanyId(req);
      const tenantId = activeTenantId(req);
      const projectId = typeof req.query.project_id === 'string' ? req.query.project_id : '';
      const activeRole = req.user?.active_role_code;
      const isOperationalUser = ([RoleCode.STAFF, RoleCode.SUPERVISOR] as RoleCode[]).includes(
        activeRole as RoleCode,
      );

      if (!projectId && isOperationalUser) {
        throw new ValidationError('project_id wajib diisi untuk Project Supervisor.');
      }

      if (projectId) {
        await ProjectsService.assertCanAssignProjectMembers(req.user, projectId, companyId);
      } else {
        const managedProjects = await ProjectsService.managedProjectIds(req.user, companyId);
        if (!managedProjects.length) {
          throw new ForbiddenError('Anda tidak memiliki kewenangan assignment project.');
        }
      }

      const memberships = await prisma.iam_user_company_membership.findMany({
        where: { company_id: companyId, status: 'ACTIVE' },
        select: { user_id: true },
      });
      const userIds = memberships.map((membership) => membership.user_id);
      const { rolesById, rolesByUser } = await loadCompanyRoleMap(companyId, tenantId, userIds);

      const eligibleUserIds = userIds.filter((userId) => {
        const roles = rolesByUser.get(userId) ?? [];
        return hasExecutionBaseline(roles) && !hasExecutiveRole(roles);
      });

      const users = eligibleUserIds.length
        ? await prisma.iam_user.findMany({
            where: {
              id: { in: eligibleUserIds },
              tenant_id: tenantId,
              is_active: true,
            },
            select: {
              id: true,
              email: true,
              username: true,
              full_name: true,
              active_role_id: true,
            },
            orderBy: { full_name: 'asc' },
          })
        : [];

      const results = users.map((user) => {
        const assignedRoles = rolesByUser.get(user.id) ?? [];
        const activeUserRole = user.active_role_id ? rolesById.get(user.active_role_id) : undefined;
        const displayRole =
          activeUserRole ??
          assignedRoles.find((role) => role.role_code !== RoleCode.STAFF) ??
          assignedRoles[0];

        return {
          ...user,
          role_code: displayRole?.role_code ?? RoleCode.STAFF,
          role_name: displayRole?.role_name ?? 'Staff',
          role_in_project: displayRole?.role_name ?? 'Staff',
        };
      });

      res.json({ count: results.length, results });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * Prevent an Executive identity from becoming an execution assignee even when
 * a caller bypasses the frontend selector. The downstream canonical route still
 * performs company scope, project authority, and baseline execution checks.
 */
projectExecutionPolicyRouter.post(
  '/main-tasks/:id/assign-members',
  async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const companyId = activeCompanyId(req);
      const tenantId = activeTenantId(req);
      const rawUsers = req.body.user_ids ?? req.body.assignee ?? [];
      const requestedUsers = Array.isArray(rawUsers) ? rawUsers : rawUsers == null ? [] : [rawUsers];
      const userIds = Array.from(
        new Set(
          requestedUsers
            .filter((value) => value !== null && value !== undefined)
            .map((value) => String(value).trim())
            .filter(Boolean),
        ),
      );

      if (userIds.length) {
        const memberships = await prisma.iam_user_company_membership.findMany({
          where: { company_id: companyId, user_id: { in: userIds }, status: 'ACTIVE' },
          select: { user_id: true },
        });
        if (memberships.length !== userIds.length) {
          throw new ForbiddenError('Satu atau lebih assignee berada di luar company aktif.');
        }

        const { rolesByUser } = await loadCompanyRoleMap(companyId, tenantId, userIds);
        if (userIds.some((userId) => hasExecutiveRole(rolesByUser.get(userId) ?? []))) {
          throw new ForbiddenError('Executive hanya memiliki akses monitoring dan tidak dapat ditugaskan sebagai eksekutor Main Task.');
        }
      }

      next();
    } catch (error) {
      next(error);
    }
  },
);

/** Defense-in-depth for an existing/legacy Main Task assignment. */
projectExecutionPolicyRouter.post(
  '/weekly-tasks',
  async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const assigneeId = String(req.body.assignee_id ?? req.body.assignee ?? '').trim();
      if (!assigneeId) return next();

      const companyId = activeCompanyId(req);
      const tenantId = activeTenantId(req);
      const { rolesByUser } = await loadCompanyRoleMap(companyId, tenantId, [assigneeId]);
      if (hasExecutiveRole(rolesByUser.get(assigneeId) ?? [])) {
        throw new ForbiddenError('Executive hanya memiliki akses monitoring dan tidak dapat menjadi PIC Weekly Task.');
      }

      return next();
    } catch (error) {
      return next(error);
    }
  },
);
