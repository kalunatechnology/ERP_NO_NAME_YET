/**
 * File: backend-express/src/modules/accounts/accounts.service.ts
 *
 * Purpose: Implements domain service responsibilities for the accounts domain.
 * Responsibility: Defines the executable contracts in this file and connects them to their callers without owning unrelated domain behavior.
 * Integration: Used through static imports, Express/Next framework discovery, or an explicit npm/script entry point as applicable.
 * Dependencies and side effects: See each documented function; database, browser storage, network, and response mutations are called out where present.
 */
import prisma from '../../config/database';
import { signTokenPair, verifyRefreshToken } from '../../utils/jwt';
import { UnauthorizedError, ValidationError, NotFoundError } from '../../utils/errors';
import { hashPassword, isLegacyDjangoPassword, verifyPassword } from '../../utils/password';
import { loadUserAccessContext } from './access-context.service';
import { parseRoleCode, RoleCode, toExternalRoleCode } from '../../types/roles';

export class AccountsService {
/**
 * login implements a named method within this file's domain service boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: Reads or mutates Prisma model(s) `iam_user`, `iam_user_role`, `iam_role`; transaction boundaries are exactly those visible in the body.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
  static async login(identifier: string, password?: string) {
    const cleanId = identifier.trim().toLowerCase();
    const pass = password ?? '';

    if (!cleanId || !pass) {
      throw new UnauthorizedError('Email atau password tidak valid.');
    }

    let user = await prisma.iam_user.findFirst({
      where: {
        OR: [
          { email: { equals: cleanId, mode: 'insensitive' } },
          { username: { equals: cleanId, mode: 'insensitive' } },
        ],
      },
    });

    if (!user) {
      throw new UnauthorizedError('Email atau password tidak valid.');
    }

    if (!user.is_active) {
      throw new UnauthorizedError('Akun pengguna tidak aktif.');
    }

    const passwordMatches = await verifyPassword(pass, user.password_hash);

    if (!passwordMatches) {
      throw new UnauthorizedError('Email atau password tidak valid.');
    }

    const passwordUpdate = isLegacyDjangoPassword(user.password_hash)
      ? { password_hash: await hashPassword(pass) }
      : {};
    user = await prisma.iam_user.update({
      where: { id: user.id },
      data: { ...passwordUpdate, last_login_at: new Date() },
    });

    const userRoles = await prisma.iam_user_role.findMany({
      where: { user_id: user.id },
    });


    const roleIds = userRoles.map((ur) => ur.role_id).filter((id): id is string => Boolean(id));
    const rolesList = await prisma.iam_role.findMany({
      where: { id: { in: roleIds } },
    });
    const rolesMap = new Map(rolesList.map((r) => [r.id, r]));

    const serializedRoles = userRoles.map((ur) => {
      const role = ur.role_id ? rolesMap.get(ur.role_id) : undefined;
      return {
        id: ur.id,
        role_id: ur.role_id,
        role_code: role ? toExternalRoleCode(role.role_code) : null,
        role_name: role?.role_name ?? null,
        company_id: ur.company_id,
        organization_id: ur.organization_id,
      };
    });

    const roleCodes = rolesList.map((role) => role.role_code);
    const access = await loadUserAccessContext(user.id);
    const primaryCompanyId = access.companyId;

    const tokens = signTokenPair({
      userId: user.id,
      email: user.email,
      full_name: user.full_name ?? '',
      tenant_id: user.tenant_id,
      company_id: primaryCompanyId,
      roles: roleCodes,
    });

    const userPayload = {
      id: user.id,
      email: user.email,
      username: user.username,
      full_name: user.full_name,
      status: user.status,
      is_staff: user.is_staff,
      is_superuser: access.isSuperAdmin,
      is_active: user.is_active,
      tenant_id: user.tenant_id,
      company_id: primaryCompanyId,
      active_role_id: access.activeRoleId,
      active_role_code: access.activeRoleCode ? toExternalRoleCode(access.activeRoleCode) : null,
      enabled_modules: access.enabledModules,
      roles: serializedRoles,
      last_login: user.last_login_at,
      date_joined: user.date_joined,
    };

    return {
      refresh: tokens.refresh,
      access: tokens.access,
      user: userPayload,
    };
  }

/**
 * refreshToken implements a named method within this file's domain service boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: Reads or mutates Prisma model(s) `iam_user`; transaction boundaries are exactly those visible in the body.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
  static async refreshToken(refreshTokenString: string) {
    const payload = verifyRefreshToken(refreshTokenString);
    if (!payload) {
      throw new UnauthorizedError('Refresh token tidak valid atau sudah kedaluwarsa.');
    }

    const user = await prisma.iam_user.findUnique({
      where: { id: payload.userId },
    });
    if (!user || !user.is_active) {
      throw new UnauthorizedError('Akun pengguna tidak aktif.');
    }

    const access = await loadUserAccessContext(user.id);
    const requestedCompanyId = payload.company_id ?? null;
    const companyId = access.isSuperAdmin || !requestedCompanyId
      ? requestedCompanyId
      : access.companyIds.includes(requestedCompanyId)
        ? requestedCompanyId
        : access.companyId;

    const tokens = signTokenPair({
      userId: user.id,
      email: user.email,
      full_name: user.full_name ?? '',
      tenant_id: user.tenant_id,
      company_id: companyId,
      roles: access.roles,
    });

    return {
      access: tokens.access,
      refresh: tokens.refresh,
    };
  }

/**
 * getCurrentUser implements a named method within this file's domain service boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: Reads or mutates Prisma model(s) `iam_user`, `iam_user_role`, `iam_role`; transaction boundaries are exactly those visible in the body.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
  static async getCurrentUser(userId: string) {
    const user = await prisma.iam_user.findUnique({
      where: { id: userId },
    });
    if (!user) throw new NotFoundError('User');

    const userRoles = await prisma.iam_user_role.findMany({
      where: { user_id: userId },
    });

    const roleIds = userRoles.map((ur) => ur.role_id).filter((id): id is string => Boolean(id));
    const rolesList = await prisma.iam_role.findMany({
      where: { id: { in: roleIds } },
    });
    const rolesMap = new Map(rolesList.map((r) => [r.id, r]));

    const serializedRoles = userRoles.map((ur) => {
      const role = ur.role_id ? rolesMap.get(ur.role_id) : undefined;
      return {
        id: ur.id,
        role_id: ur.role_id,
        role_code: role ? toExternalRoleCode(role.role_code) : null,
        role_name: role?.role_name ?? null,
        company_id: ur.company_id,
        organization_id: ur.organization_id,
      };
    });

    const access = await loadUserAccessContext(user.id);
    const primaryCompanyId = access.companyId;

    const userPayload = {
      id: user.id,
      email: user.email,
      username: user.username,
      full_name: user.full_name,
      status: user.status,
      is_staff: user.is_staff,
      is_superuser: access.isSuperAdmin,
      is_active: user.is_active,
      tenant_id: user.tenant_id,
      company_id: primaryCompanyId,
      active_role_id: access.activeRoleId,
      active_role_code: access.activeRoleCode ? toExternalRoleCode(access.activeRoleCode) : null,
      enabled_modules: access.enabledModules,
      roles: serializedRoles,
      last_login: user.last_login_at,
      date_joined: user.date_joined,
    };

    return {
      ...userPayload,
      user: userPayload,
      roles: serializedRoles,
    };
  }

/**
 * changeActiveRole implements a named method within this file's domain service boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: Reads or mutates Prisma model(s) `iam_user`, `iam_user_role`, `iam_role`; transaction boundaries are exactly those visible in the body.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
  static async changeActiveRole(userId: string, roleCode: string) {
    // Fetch identity and assignments concurrently. The previous implementation
    // performed these reads sequentially and then rebuilt the entire profile,
    // causing role switching to exceed the remote-pooler response budget.
    const [user, userRoles] = await Promise.all([
      prisma.iam_user.findUnique({ where: { id: userId } }),
      prisma.iam_user_role.findMany({ where: { user_id: userId }, select: { role_id: true } }),
    ]);
    if (!user) throw new NotFoundError('User');

    const roleIds = userRoles.map((ur) => ur.role_id).filter((id): id is string => Boolean(id));
    const parsedRoleCode = parseRoleCode(roleCode);
    const targetRole = await prisma.iam_role.findFirst({
      where: parsedRoleCode
        ? { id: { in: roleIds }, role_code: parsedRoleCode, tenant_id: user.tenant_id }
        : { id: roleCode, tenant_id: user.tenant_id },
      select: { id: true, role_code: true },
    });
    if (!targetRole) {
      throw new ValidationError(`Role ${roleCode} tidak terdaftar pada akun ini.`);
    }

    await prisma.iam_user.update({
      where: { id: userId },
      data: { active_role_id: targetRole.id },
    });

    // The frontend intentionally refreshes `/auth/me` after this mutation.
    // Returning the new role identity keeps legacy callers compatible while
    // avoiding a second, duplicate full access-context reconstruction here.
    return {
      detail: 'Role aktif berhasil diperbarui.',
      active_role_id: targetRole.id,
      active_role_code: toExternalRoleCode(targetRole.role_code),
    };
  }

/**
 * changePassword implements a named method within this file's domain service boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: Reads or mutates Prisma model(s) `iam_user`; transaction boundaries are exactly those visible in the body.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
  static async changePassword(userId: string, currentPass: string, newPass: string) {
    const user = await prisma.iam_user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User');

    if (!currentPass || !newPass || newPass.length < 8) {
      throw new ValidationError('Password baru minimal harus 8 karakter.');
    }

    const isMatch = await verifyPassword(currentPass, user.password_hash);
    if (!isMatch) {
      throw new ValidationError('Password saat ini tidak sesuai.');
    }

    const newHash = await hashPassword(newPass);
    await prisma.iam_user.update({
      where: { id: userId },
      data: { password_hash: newHash },
    });

    return { detail: 'Password berhasil diubah.' };
  }

/**
 * updateProfile implements this operation using the typed arguments declared in its signature.
 *
 * @param input - Parameters declared by the function/method.
 * @returns The synchronous result or Promise produced below.
 * Database/side effects: uses `iam_user`, `iam_user_role`; transaction scope is exactly the coded scope.
 */
  static async updateProfile(userId: string, data: { full_name?: string; email?: string; phone?: string }) {
    const user = await prisma.iam_user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User');

    const updateData: any = {};
    if (data.full_name !== undefined && data.full_name.trim()) {
      updateData.full_name = data.full_name.trim();
    }
    if (data.email !== undefined && data.email.trim()) {
      const cleanEmail = data.email.trim().toLowerCase();
      if (cleanEmail !== user.email?.toLowerCase()) {
        const existing = await prisma.iam_user.findFirst({
          where: { email: cleanEmail, id: { not: userId } },
        });
        if (existing) {
          throw new ValidationError('Email sudah terdaftar oleh pengguna lain.');
        }
        updateData.email = cleanEmail;
        updateData.username = cleanEmail.split('@')[0];
      }
    }

    const updatedUser = await prisma.iam_user.update({
      where: { id: userId },
      data: updateData,
    });
    const access = await loadUserAccessContext(updatedUser.id);

    return {
      message: 'Profil berhasil diperbarui.',
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        username: updatedUser.username,
        full_name: updatedUser.full_name,
        status: updatedUser.status,
        is_staff: updatedUser.is_staff,
        is_superuser: access.isSuperAdmin,
        is_active: updatedUser.is_active,
      },
    };
  }

/**
 * inviteUser implements this operation using the typed arguments declared in its signature.
 *
 * @param input - Parameters declared by the function/method.
 * @returns The synchronous result or Promise produced below.
 * Database/side effects: uses `iam_user`, `iam_user_role`, `core_company`, `iam_role`, `core_organization`; transaction scope is exactly the coded scope.
 */
  static async inviteUser(input: {
    name: string;
    email: string;
    password: string;
    roleCodes: RoleCode[];
    companyId: string;
    tenantId: string;
  }) {
    const { name, email, password, roleCodes, companyId, tenantId } = input;
    const cleanEmail = email.trim().toLowerCase();
    const cleanUsername = cleanEmail.split('@')[0]!;

    if (!cleanEmail || !cleanEmail.includes('@')) {
      throw new ValidationError('Email valid wajib diisi.');
    }
    if (!roleCodes.length) {
      throw new ValidationError('Minimal satu role wajib dipilih.');
    }

    const existing = await prisma.iam_user.findFirst({
      where: {
        OR: [{ email: cleanEmail }, { username: cleanUsername }],
      },
    });

    if (existing && (existing.email.toLowerCase() !== cleanEmail || existing.tenant_id !== tenantId)) {
      throw new ValidationError('Email atau username sudah digunakan oleh akun lain.');
    }
    if (existing) {
      const currentAssignments = await prisma.iam_user_role.count({ where: { user_id: existing.id } });
      if (currentAssignments > 0) {
        throw new ValidationError('User sudah memiliki assignment role/company.');
      }
    } else {
      if (!name?.trim()) throw new ValidationError('Nama wajib diisi untuk user baru.');
      if (!password || password.length < 8) {
        throw new ValidationError('Password sementara minimal harus 8 karakter untuk user baru.');
      }
    }

    const company = await prisma.core_company.findFirst({
      where: { id: companyId, tenant_id: tenantId },
    });
    if (!company) {
      throw new ValidationError('Company invitation tidak valid.');
    }

    if (roleCodes.includes(RoleCode.COMPANY_ADMIN)) {
      const companyAdminRole = await prisma.iam_role.findFirst({
        where: { tenant_id: tenantId, role_code: RoleCode.COMPANY_ADMIN },
      });
      if (companyAdminRole) {
        const existingAdminAssignment = await prisma.iam_user_role.findFirst({
          where: {
            company_id: companyId,
            role_id: companyAdminRole.id,
            ...(existing ? { user_id: { not: existing.id } } : {}),
          },
        });
        if (existingAdminAssignment) {
          throw new ValidationError(
            'Company ini sudah memiliki 1 Company Admin aktif. Hanya diperbolehkan 1 Company Admin per company.',
          );
        }
      }
    }

    const uniqueRoleCodes = [...new Set(roleCodes)];
    const roles = await prisma.iam_role.findMany({
      where: { tenant_id: tenantId, role_code: { in: uniqueRoleCodes } },
    });
    if (roles.length !== uniqueRoleCodes.length) {
      throw new ValidationError('Satu atau lebih role tidak tersedia pada tenant ini.');
    }

    const organization = await prisma.core_organization.findFirst({ where: { company_id: companyId } });
    const passwordHash = existing ? null : await hashPassword(password);
    const user = await prisma.$transaction(async (tx) => {
      const created = existing ?? await tx.iam_user.create({
          data: {
            id: crypto.randomUUID(),
            tenant_id: tenantId,
            email: cleanEmail,
            username: cleanUsername,
            full_name: name.trim(),
            password_hash: passwordHash!,
            is_active: true,
            is_staff: false,
            is_superuser: false,
            status: 'ACTIVE',
            date_joined: new Date(),
          },
        });

      await tx.iam_user_role.createMany({
        data: roles.map((role) => ({
          id: crypto.randomUUID(),
          user_id: created.id,
          role_id: role.id,
          company_id: companyId,
          organization_id: organization?.id ?? null,
        })),
      });

      await tx.iam_user_company_membership.upsert({
        where: { user_id: created.id },
        update: {
          company_id: companyId,
          tenant_id: tenantId,
          status: 'ACTIVE',
        },
        create: {
          id: crypto.randomUUID(),
          user_id: created.id,
          company_id: companyId,
          tenant_id: tenantId,
          status: 'ACTIVE',
        },
      });

      if (!created.active_role_id && roles.length > 0) {
        await tx.iam_user.update({
          where: { id: created.id },
          data: { active_role_id: roles[0].id },
        });
      }

      return created;
    });

    return {
      message: existing
        ? 'User Django yang sudah ada berhasil dihubungkan ke company.'
        : 'Undangan user berhasil dibuat.',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        full_name: user.full_name,
        status: user.status,
        is_staff: user.is_staff,
        is_superuser: false,
        is_active: user.is_active,
        tenant_id: user.tenant_id,
        date_joined: user.date_joined,
        company_id: companyId,
      },
      roles: roles.map((role) => ({
        id: role.id,
        role_code: toExternalRoleCode(role.role_code),
        role_name: role.role_name,
        company_id: companyId,
      })),
    };
  }
}
