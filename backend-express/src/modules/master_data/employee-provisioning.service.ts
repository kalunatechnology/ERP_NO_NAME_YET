/**
 * Central user -> employee provisioning boundary.
 *
 * Every active non-Super Admin company user must have exactly one
 * master_employee mapping for the active company. Super Admin remains a
 * platform identity and is intentionally not materialized as an employee.
 */
import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { ForbiddenError, NotFoundError } from '../../utils/errors';
import { RoleCode } from '../../types/roles';

type EnsureEmployeeInput = {
  userId: string;
  tenantId: string;
  companyId: string;
  actorId?: string | null;
};

export class EmployeeProvisioningService {
  static async ensureForUser(
    input: EnsureEmployeeInput,
    tx?: Prisma.TransactionClient,
  ) {
    if (tx) return this.ensureWithinTransaction(input, tx);
    return prisma.$transaction((transaction) =>
      this.ensureWithinTransaction(input, transaction),
    );
  }

  private static async ensureWithinTransaction(
    input: EnsureEmployeeInput,
    db: Prisma.TransactionClient,
  ) {
    const { userId, tenantId, companyId, actorId } = input;

    const user = await db.iam_user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        tenant_id: true,
        is_active: true,
        is_superuser: true,
      },
    });
    if (!user) throw new NotFoundError('User');
    if (!user.is_active) throw new ForbiddenError('User tidak aktif.');
    if (user.tenant_id && user.tenant_id !== tenantId) {
      throw new ForbiddenError('User berada pada tenant yang berbeda.');
    }

    if (user.is_superuser) return null;

    const superAdminRole = await db.iam_role.findFirst({
      where: { tenant_id: tenantId, role_code: RoleCode.SUPER_ADMIN },
      select: { id: true },
    });
    if (superAdminRole) {
      const assignment = await db.iam_user_role.findFirst({
        where: { user_id: userId, role_id: superAdminRole.id },
        select: { id: true },
      });
      if (assignment) return null;
    }

    const membership = await db.iam_user_company_membership.findFirst({
      where: {
        user_id: userId,
        tenant_id: tenantId,
        company_id: companyId,
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    if (!membership) {
      throw new ForbiddenError('User tidak memiliki membership aktif pada company ini.');
    }

    const existing = await db.master_employee.findFirst({
      where: { tenant_id: tenantId, company_id: companyId, user_id: userId },
    });
    if (existing) {
      await this.syncProjectMemberships(db, tenantId, companyId, userId, existing.id);
      return existing;
    }

    // Transitional compatibility: claim only an explicit legacy employee_id
    // already stored on this user's active project membership. Never infer
    // identity from names, usernames, emails, or coincidentally equal IDs.
    const projectMember = await db.project_member.findFirst({
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

    if (projectMember?.employee_id) {
      const legacy = await db.master_employee.findFirst({
        where: {
          id: projectMember.employee_id,
          tenant_id: tenantId,
          company_id: companyId,
        },
      });
      if (legacy?.user_id === userId) return legacy;
      if (legacy && !legacy.user_id) {
        const linked = await db.master_employee.update({
          where: { id: legacy.id },
          data: { user_id: userId },
        });
        await this.syncProjectMemberships(db, tenantId, companyId, userId, linked.id);
        return linked;
      }
      if (legacy?.user_id && legacy.user_id !== userId) {
        throw new ForbiddenError('Employee yang terhubung ke project sudah dimiliki user lain.');
      }
    }

    const employeeNumber = 'EMP-' + userId.replace(/-/g, '').slice(0, 12).toUpperCase();
    const employee = await db.master_employee.upsert({
      where: {
        company_id_user_id: {
          company_id: companyId,
          user_id: userId,
        },
      },
      update: {
        tenant_id: tenantId,
        employment_status: 'ACTIVE',
      },
      create: {
        tenant_id: tenantId,
        company_id: companyId,
        user_id: userId,
        employee_number: employeeNumber,
        employment_status: 'ACTIVE',
        created_by_id: actorId ?? userId,
      },
    });

    await this.syncProjectMemberships(db, tenantId, companyId, userId, employee.id);
    return employee;
  }

  private static async syncProjectMemberships(
    db: Prisma.TransactionClient,
    tenantId: string,
    companyId: string,
    userId: string,
    employeeId: string,
  ) {
    await db.project_member.updateMany({
      where: {
        tenant_id: tenantId,
        company_id: companyId,
        user_id: userId,
        status: 'ACTIVE',
        employee_id: null,
      },
      data: { employee_id: employeeId },
    });
  }
}
