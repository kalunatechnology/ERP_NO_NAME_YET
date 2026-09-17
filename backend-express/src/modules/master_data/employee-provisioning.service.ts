import { Prisma } from '@prisma/client';

import prisma from '../../config/database';

import {
  ForbiddenError,
  NotFoundError,
} from '../../utils/errors';

import {
  RoleCode,
} from '../../types/roles';

interface EnsureEmployeeInput {
  userId: string;
  tenantId: string;
  companyId: string;
  actorId?: string | null;
}

export class EmployeeProvisioningService {
  static async ensureForUser(
    input: EnsureEmployeeInput,
    tx?: Prisma.TransactionClient,
  ) {
    if (tx) {
      return this.ensureWithinTransaction(
        input,
        tx,
      );
    }

    return prisma.$transaction(
      async (db) =>
        this.ensureWithinTransaction(
          input,
          db,
        ),
    );
  }

  private static async ensureWithinTransaction(
    input: EnsureEmployeeInput,
    db: Prisma.TransactionClient,
  ) {
    const {
      userId,
      tenantId,
      companyId,
      actorId,
    } = input;

    // =========================================================
    // 1. USER
    // =========================================================

    const user =
      await db.iam_user.findUnique({
        where: {
          id: userId,
        },

        select: {
          id: true,
          tenant_id: true,
          username: true,
          email: true,
          full_name: true,
          is_active: true,
          is_superuser: true,
        },
      });

    if (!user) {
      throw new NotFoundError(
        'User',
      );
    }

    if (!user.is_active) {
      throw new ForbiddenError(
        'User tidak aktif.',
      );
    }

    if (
      user.tenant_id &&
      user.tenant_id !== tenantId
    ) {
      throw new ForbiddenError(
        'User berada pada tenant yang berbeda.',
      );
    }

    // =========================================================
    // 2. SUPER ADMIN = PLATFORM IDENTITY
    // =========================================================

    if (user.is_superuser) {
      return null;
    }

    const superAdminRole =
      await db.iam_role.findFirst({
        where: {
          tenant_id: tenantId,

          role_code:
            RoleCode.SUPER_ADMIN,
        },

        select: {
          id: true,
        },
      });

    if (superAdminRole) {
      const assignment =
        await db.iam_user_role.findFirst({
          where: {
            user_id: userId,

            role_id:
              superAdminRole.id,
          },

          select: {
            id: true,
          },
        });

      if (assignment) {
        return null;
      }
    }

    // =========================================================
    // 3. COMPANY MEMBERSHIP
    // =========================================================

    const membership =
      await db.iam_user_company_membership.findFirst({
        where: {
          user_id: userId,
          tenant_id: tenantId,
          company_id: companyId,
          status: 'ACTIVE',
        },

        select: {
          id: true,
        },
      });

    if (!membership) {
      throw new ForbiddenError(
        'User tidak memiliki membership aktif pada company ini.',
      );
    }

    // =========================================================
    // 4. PERMANENT USER -> EMPLOYEE MAPPING
    // =========================================================

    const existingEmployee =
      await db.master_employee.findFirst({
        where: {
          tenant_id: tenantId,
          company_id: companyId,
          user_id: userId,
        },
      });

    if (existingEmployee) {
      await this.syncProjectMemberships(
        db,
        tenantId,
        companyId,
        userId,
        existingEmployee.id,
      );

      return existingEmployee;
    }

    // =========================================================
    // 5. LEGACY PROJECT_MEMBER MAPPING
    // =========================================================

    const existingProjectMember =
      await db.project_member.findFirst({
        where: {
          tenant_id: tenantId,
          company_id: companyId,
          user_id: userId,

          employee_id: {
            not: null,
          },

          status: 'ACTIVE',
        },

        select: {
          employee_id: true,
        },

        orderBy: {
          assigned_at: 'desc',
        },
      });

    if (
      existingProjectMember?.employee_id
    ) {
      const legacyEmployee =
        await db.master_employee.findFirst({
          where: {
            id:
              existingProjectMember.employee_id,

            tenant_id: tenantId,
            company_id: companyId,
          },
        });

      if (legacyEmployee) {
        if (
          legacyEmployee.user_id ===
          userId
        ) {
          return legacyEmployee;
        }

        if (!legacyEmployee.user_id) {
          const linked =
            await db.master_employee.update({
              where: {
                id:
                  legacyEmployee.id,
              },

              data: {
                user_id:
                  userId,
              },
            });

          await this.syncProjectMemberships(
            db,
            tenantId,
            companyId,
            userId,
            linked.id,
          );

          return linked;
        }

        throw new ForbiddenError(
          'Employee pada project membership sudah terhubung dengan user lain.',
        );
      }
    }

    // =========================================================
    // 6. CREATE EMPLOYEE
    // =========================================================

    const employeeNumber =
      `EMP-${user.id
        .replace(/-/g, '')
        .slice(0, 12)
        .toUpperCase()}`;

    const employee =
      await db.master_employee.upsert({
        where: {
          company_id_user_id: {
            company_id:
              companyId,

            user_id:
              userId,
          },
        },

        update: {},

        create: {
          tenant_id:
            tenantId,

          company_id:
            companyId,

          user_id:
            userId,

          employee_number:
            employeeNumber,

          employment_status:
            'ACTIVE',

          created_by_id:
            actorId ?? userId,
        },
      });

    await this.syncProjectMemberships(
      db,
      tenantId,
      companyId,
      userId,
      employee.id,
    );

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
        tenant_id:
          tenantId,

        company_id:
          companyId,

        user_id:
          userId,

        status:
          'ACTIVE',

        employee_id:
          null,
      },

      data: {
        employee_id:
          employeeId,
      },
    });
  }
}