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
import { ForbiddenError, UnauthorizedError, ValidationError, NotFoundError } from '../../utils/errors';
import { hashPassword, isLegacyDjangoPassword, verifyPassword } from '../../utils/password';
import { loadUserAccessContext } from './access-context.service';
import { isSuperAdmin, parseRoleCode, RoleCode, toExternalRoleCode } from '../../types/roles';
import { Prisma } from '@prisma/client';
import {
  EmployeeProvisioningService,
} from '../master_data/employee-provisioning.service';
import { ROLE_BUNDLES } from './role-bundle.config';

type LoginAccessSnapshot = {
  user_roles: Array<{
    id: string;
    role_id: string | null;
    company_id: string | null;
    organization_id: string | null;
  }>;
  membership: {
    tenant_id: string;
    company_id: string;
    status: string;
    legal_name?: string;
    company_code?: string;
  } | null;
  roles: Array<{
    id: string;
    role_code: string;
    role_name: string;
  }>;
  company_modules: Array<{ module_code: string }>;
  user_modules: Array<{ module_code: string; allow_read: boolean; allow_write: boolean }>;
  project_delegated: boolean;
};

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

    const lookupStartedAt = performance.now();
    // Normal signup/profile flows store normalized lowercase identifiers. Keep
    // that common login path index-friendly; case-insensitive comparison wraps
    // both columns in LOWER() and can force a full user-table scan.
    let user = await prisma.iam_user.findFirst({
      where: {
        OR: [
          { email: cleanId },
          { username: cleanId },
        ],
      },
    });
    // Compatibility fallback for legacy rows created before identifier
    // normalization was enforced.
    if (!user) {
      user = await prisma.iam_user.findFirst({
        where: {
          OR: [
            { email: { equals: cleanId, mode: 'insensitive' } },
            { username: { equals: cleanId, mode: 'insensitive' } },
          ],
        },
      });
    }
    const lookupMs = performance.now() - lookupStartedAt;
    if (lookupMs > 5000) console.warn(`[auth-latency] stage=user-lookup duration_ms=${lookupMs.toFixed(0)}`);

    if (!user) {
      throw new UnauthorizedError('Email atau password tidak valid.');
    }

    if (!user.is_active) {
      throw new UnauthorizedError('Akun pengguna tidak aktif.');
    }

    const passwordStartedAt = performance.now();
    const passwordMatches = await verifyPassword(pass, user.password_hash);
    const passwordMs = performance.now() - passwordStartedAt;
    if (passwordMs > 2000) console.warn(`[auth-latency] stage=password-verify duration_ms=${passwordMs.toFixed(0)}`);

    if (!passwordMatches) {
      throw new UnauthorizedError('Email atau password tidak valid.');
    }

    const loginAt = new Date();
    const passwordHash = isLegacyDjangoPassword(user.password_hash)
      ? await hashPassword(pass)
      : undefined;

    const now = new Date();
    const snapshotStartedAt = performance.now();
    const snapshots = await prisma.$queryRaw<Array<{ snapshot: LoginAccessSnapshot }>>(Prisma.sql`
      WITH updated_user AS (
        UPDATE iam_user
        SET last_login_at = ${loginAt},
            password_hash = COALESCE(${passwordHash ?? null}, password_hash)
        WHERE id = ${user.id}::text
        RETURNING id, tenant_id
      ), membership AS (
        SELECT m.tenant_id, m.company_id, m.status, c.legal_name, c.company_code
        FROM iam_user_company_membership m
        JOIN core_company c ON c.id = m.company_id AND c.tenant_id IS NOT DISTINCT FROM m.tenant_id
        WHERE m.user_id = ${user.id}::text
        LIMIT 1
      )
      SELECT jsonb_build_object(
        'user_roles', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', ur.id, 'role_id', ur.role_id, 'company_id', ur.company_id,
            'organization_id', ur.organization_id
          )) FROM iam_user_role ur WHERE ur.user_id = ${user.id}::text
        ), '[]'::jsonb),
        'membership', (SELECT to_jsonb(m) FROM membership m),
        'roles', COALESCE((
          SELECT jsonb_agg(jsonb_build_object('id', r.id, 'role_code', r.role_code, 'role_name', r.role_name))
          FROM iam_role r
          JOIN iam_user_role ur ON ur.role_id = r.id
          WHERE ur.user_id = ${user.id}::text AND r.tenant_id = ${user.tenant_id}::text
        ), '[]'::jsonb),
        'company_modules', COALESCE((
          SELECT jsonb_agg(jsonb_build_object('module_code', cma.module_code))
          FROM iam_company_module_access cma JOIN membership m ON m.company_id = cma.company_id AND m.tenant_id = cma.tenant_id
          WHERE cma.enabled = true AND cma.allow_read = true
            AND (cma.effective_from IS NULL OR cma.effective_from <= ${now})
            AND (cma.effective_until IS NULL OR cma.effective_until >= ${now})
        ), '[]'::jsonb),
        'user_modules', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'module_code', uma.module_code, 'allow_read', uma.allow_read, 'allow_write', uma.allow_write
          )) FROM iam_user_module_access uma
          JOIN membership m ON m.company_id = uma.company_id AND m.tenant_id = uma.tenant_id
          WHERE uma.user_id = ${user.id}::text
        ), '[]'::jsonb),
        'project_delegated', EXISTS (
          SELECT 1 FROM project_member pm
          JOIN membership m ON m.company_id=pm.company_id AND m.tenant_id=pm.tenant_id
          WHERE pm.user_id=${user.id}::text
            AND pm.project_role='ACTING_PROJECT_MANAGER'
            AND UPPER(pm.status)='ACTIVE'
        )
      ) AS snapshot
      FROM updated_user
    `);
    const snapshotMs = performance.now() - snapshotStartedAt;
    if (snapshotMs > 5000) console.warn(`[auth-latency] stage=access-snapshot duration_ms=${snapshotMs.toFixed(0)}`);
    const snapshot = snapshots[0]?.snapshot;
    if (!snapshot) throw new UnauthorizedError('Email atau password tidak valid.');
    const userRoles = snapshot.user_roles;
    const membership = snapshot.membership;
    const rolesList = snapshot.roles
      .map((role) => ({ ...role, role_code: parseRoleCode(role.role_code) }))
      .filter((role): role is typeof role & { role_code: RoleCode } => role.role_code !== null);
    const companyModules = snapshot.company_modules;
    const userModules = snapshot.user_modules;
    user = { ...user, last_login_at: loginAt, ...(passwordHash ? { password_hash: passwordHash } : {}) };

    const roleIds = userRoles.map((ur) => ur.role_id).filter((id): id is string => Boolean(id));

    if (rolesList.length !== new Set(roleIds).size) {
      throw new ForbiddenError('Konfigurasi akses user tidak valid: role berada di luar tenant user.');
    }
    const roleCodes = [...new Set(rolesList.map((role) => role.role_code))];
    const superAdmin = isSuperAdmin(roleCodes);
    if (superAdmin && membership) {
      throw new ForbiddenError('Konfigurasi akses tidak valid: Super Admin tidak boleh memiliki membership company.');
    }
    if (!superAdmin && (!membership || membership.status !== 'ACTIVE')) {
      throw new ForbiddenError('Konfigurasi akses tidak valid: user wajib memiliki satu membership company aktif.');
    }
    if (membership && membership.tenant_id !== user.tenant_id) {
      throw new ForbiddenError('Konfigurasi akses tidak valid: membership berada di luar tenant user.');
    }
    if (!superAdmin && userRoles.some((item) => item.company_id !== membership?.company_id)) {
      throw new ForbiddenError('Konfigurasi akses tidak valid: assignment role tidak sesuai membership company.');
    }
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

    const activeRole = rolesList.find((role) => role.id === user.active_role_id) ?? rolesList[0] ?? null;
    const overrideByModule = new Map(userModules.map((item) => [item.module_code.toUpperCase(), item]));
    const enabledModules = companyModules
      .map((item) => item.module_code.toUpperCase())
      .filter((moduleCode) => overrideByModule.get(moduleCode)?.allow_read ?? true);
    const delegatedModules = userModules
      .filter((item) => item.allow_read)
      .map((item) => item.module_code.toUpperCase());
    if (snapshot.project_delegated && enabledModules.includes('PROJECTS') && !delegatedModules.includes('PROJECTS')) {
      delegatedModules.push('PROJECTS');
    }
    const primaryCompanyId = superAdmin ? null : membership?.company_id ?? null;

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
      is_superuser: superAdmin,
      is_active: user.is_active,
      tenant_id: user.tenant_id,
      company_id: primaryCompanyId,
      company: membership ? { id: membership.company_id, name: membership.legal_name, code: membership.company_code } : null,
      active_role_id: activeRole?.id ?? null,
      active_role_code: activeRole ? toExternalRoleCode(activeRole.role_code) : null,
      enabled_modules: enabledModules,
      delegated_modules: delegatedModules,
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
    const [user, userRoles, membership, companyRows] = await Promise.all([
      prisma.iam_user.findUnique({ where: { id: userId } }),
      prisma.iam_user_role.findMany({ where: { user_id: userId } }),
      prisma.iam_user_company_membership.findUnique({ where: { user_id: userId } }),
      prisma.$queryRaw<Array<{ id: string; legal_name: string; company_code: string }>>(Prisma.sql`
        SELECT c.id, c.legal_name, c.company_code
        FROM core_company c JOIN iam_user_company_membership m ON m.company_id=c.id
        WHERE m.user_id=${userId}::text AND c.tenant_id IS NOT DISTINCT FROM m.tenant_id LIMIT 1
      `),
    ]);
    if (!user) throw new NotFoundError('User');

    const roleIds = userRoles.map((ur) => ur.role_id).filter((id): id is string => Boolean(id));
    const rolesList = roleIds.length
      ? await prisma.iam_role.findMany({ where: { id: { in: roleIds }, tenant_id: user.tenant_id } })
      : [];
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

    const access = await loadUserAccessContext(
      user.id,
      { tenant_id: user.tenant_id, active_role_id: user.active_role_id },
      { assignments: userRoles, membership, roleRecords: rolesList },
    );
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
      company: companyRows[0] ? { id: companyRows[0].id, name: companyRows[0].legal_name, code: companyRows[0].company_code } : null,
      active_role_id: access.activeRoleId,
      active_role_code: access.activeRoleCode ? toExternalRoleCode(access.activeRoleCode) : null,
      enabled_modules: access.enabledModules,
      delegated_modules: access.delegatedModules,
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
    actorId?: string;
  }) {
    const { name, email, password, roleCodes, companyId, tenantId, actorId } = input;
    const cleanEmail = email.trim().toLowerCase();
    const cleanUsername = cleanEmail.split('@')[0]!;

    if (!cleanEmail || !cleanEmail.includes('@')) {
      throw new ValidationError('Email valid wajib diisi.');
    }
    if (!roleCodes.length) {
      throw new ValidationError('Minimal satu role wajib dipilih.');
    }

    const existing = await prisma.iam_user.findFirst({
      where: { OR: [{ email: cleanEmail }, { username: cleanUsername }] },
    });

    if (existing && existing.tenant_id !== tenantId) {
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
            // The creator's privilege must never be copied to the invited user.
            // SUPER_ADMIN is intentionally rejected by the route above.
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
          tenant_id: tenantId,
          company_id: companyId,
          organization_id: organization?.id ?? null,
          created_by_id: actorId ?? null,
        })),
      });

      const existingMembership = await tx.iam_user_company_membership.findUnique({
        where: { user_id: created.id },
      });
      if (existingMembership) {
        if (existingMembership.tenant_id !== tenantId || existingMembership.company_id !== companyId) {
          throw new ValidationError('User sudah memiliki membership pada company/tenant lain.');
        }
      } else {
        await tx.iam_user_company_membership.create({
          data: {
            id: crypto.randomUUID(),
            user_id: created.id,
            company_id: companyId,
            tenant_id: tenantId,
            status: 'ACTIVE',
            created_by_id: actorId ?? null,
          },
        });
      }

    if (!created.active_role_id && roles.length > 0) {
      await tx.iam_user.update({
        where: {
          id: created.id,
        },
        data: {
          active_role_id:
            roles[0].id,
        },
      });
    }

    /**
     * NEW:
     * Setiap user company non-Super Admin
     * otomatis mempunyai Employee.
     */
    await EmployeeProvisioningService.ensureForUser(
      {
        userId:
          created.id,

        tenantId,

        companyId,

        actorId:
          actorId ?? null,
      },
      tx,
    );

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
        is_superuser: user.is_superuser,
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

  static async getUserRoles(companyId: string, targetUserId: string) {
    const user = await prisma.iam_user.findUnique({
      where: { id: targetUserId },
      select: { id: true, active_role_id: true },
    });
    if (!user) throw new NotFoundError('User tidak ditemukan.');

    const userRoles = await prisma.iam_user_role.findMany({
      where: {
        user_id: targetUserId,
        company_id: companyId,
      },
      orderBy: { created_at: 'asc' },
    });

    const roleIds = userRoles.map((ur) => ur.role_id).filter((id): id is string => Boolean(id));
    const roles = await prisma.iam_role.findMany({
      where: { id: { in: roleIds } },
    });
    const roleMap = new Map(roles.map((r) => [r.id, r]));

    return {
      active_role_id: user.active_role_id,
      roles: userRoles
        .map((ur) => {
          const role = ur.role_id ? roleMap.get(ur.role_id) : null;
          if (!role) return null;
          return {
            user_role_id: ur.id,
            role_id: role.id,
            role_code: toExternalRoleCode(role.role_code),
            raw_role_code: role.role_code,
            role_name: role.role_name,
            is_active: ur.role_id === user.active_role_id,
          };
        })
        .filter(Boolean),
    };
  }

  static async assignRoleToUser(params: {
    companyId: string;
    tenantId: string;
    targetUserId: string;
    rawRoleCode: string;
    actorId?: string | null;
  }) {
    const { companyId, tenantId, targetUserId, rawRoleCode, actorId } = params;
    const parsedRole = parseRoleCode(rawRoleCode);

    if (!parsedRole) {
      throw new ValidationError(`Role code '${rawRoleCode}' tidak valid.`);
    }

    if (parsedRole === RoleCode.SUPER_ADMIN) {
      throw new ForbiddenError('Super Admin role tidak dapat diberikan pada level company.');
    }

    return prisma.$transaction(async (tx) => {
      // 1. Target user check
      const user = await tx.iam_user.findUnique({
        where: { id: targetUserId },
        select: { id: true, is_active: true, tenant_id: true, active_role_id: true },
      });
      if (!user) throw new NotFoundError('User tidak ditemukan.');
      if (!user.is_active) throw new ForbiddenError('User tidak aktif.');
      if (user.tenant_id && user.tenant_id !== tenantId) {
        throw new ForbiddenError('User berada pada tenant yang berbeda.');
      }

      // 2. Cek membership company ACTIVE
      const membership = await tx.iam_user_company_membership.findFirst({
        where: {
          user_id: targetUserId,
          company_id: companyId,
          tenant_id: tenantId,
          status: 'ACTIVE',
        },
      });
      if (!membership) {
        throw new ForbiddenError('User tidak memiliki membership aktif pada company ini.');
      }

      // 3. Cek role berada pada tenant/company benar
      let role = await tx.iam_role.findFirst({
        where: {
          tenant_id: tenantId,
          role_code: parsedRole,
        },
      });
      if (!role) {
        // Cek jika ada role sistem global untuk tenant ini atau buat jika belum ada
        const existingRoles = await tx.iam_role.findMany({
          where: { tenant_id: tenantId },
        });
        role = existingRoles.find((r) => r.role_code === parsedRole) ?? null;
      }
      if (!role) {
        throw new NotFoundError(`Role ${rawRoleCode} tidak ditemukan pada tenant ini.`);
      }

      // 4. Cek module requirement tersedia di company (ROLE_BUNDLES)
      const bundle = ROLE_BUNDLES[parsedRole];
      if (bundle && bundle.requiredModules.length > 0) {
        const companyModules = await tx.iam_company_module_access.findMany({
          where: {
            company_id: companyId,
            enabled: true,
            module_code: { in: bundle.requiredModules },
          },
          select: { module_code: true },
        });
        const enabledSet = new Set(companyModules.map((m) => m.module_code.toUpperCase()));
        const missingModules = bundle.requiredModules.filter((m: string) => !enabledSet.has(m.toUpperCase()));
        if (missingModules.length > 0) {
          throw new ForbiddenError(
            `Company belum mengaktifkan modul yang dibutuhkan oleh role ${bundle.label}: ${missingModules.join(', ')}.`,
          );
        }
      }

      // 5. Buat iam_user_role jika belum ada
      const existingAssignment = await tx.iam_user_role.findFirst({
        where: {
          user_id: targetUserId,
          role_id: role.id,
          company_id: companyId,
        },
      });

      let assignment = existingAssignment;
      if (!existingAssignment) {
        assignment = await tx.iam_user_role.create({
          data: {
            id: crypto.randomUUID(),
            user_id: targetUserId,
            role_id: role.id,
            company_id: companyId,
            created_by_id: actorId ?? targetUserId,
          },
        });
      }

      // Jangan ubah active_role_id jika user sudah punya active_role_id
      if (!user.active_role_id) {
        await tx.iam_user.update({
          where: { id: targetUserId },
          data: { active_role_id: role.id },
        });
      }

      // Pastikan employee record sudah ada
      await EmployeeProvisioningService.ensureForUser(
        {
          userId: targetUserId,
          tenantId,
          companyId,
          actorId: actorId ?? null,
        },
        tx,
      );

      return {
        assigned: true,
        user_role_id: assignment?.id,
        role_code: toExternalRoleCode(role.role_code),
        role_name: role.role_name,
      };
    });
  }

  static async removeRoleFromUser(params: {
    companyId: string;
    tenantId: string;
    targetUserId: string;
    rawRoleCode: string;
    actorId?: string | null;
  }) {
    const { companyId, tenantId, targetUserId, rawRoleCode, actorId } = params;
    const parsedRole = parseRoleCode(rawRoleCode);

    if (!parsedRole) {
      throw new ValidationError(`Role code '${rawRoleCode}' tidak valid.`);
    }

    return prisma.$transaction(async (tx) => {
      // 1. Target user
      const user = await tx.iam_user.findUnique({
        where: { id: targetUserId },
        select: { id: true, active_role_id: true, tenant_id: true },
      });
      if (!user) throw new NotFoundError('User tidak ditemukan.');

      // 2. Role lookup
      const role = await tx.iam_role.findFirst({
        where: {
          tenant_id: tenantId,
          role_code: parsedRole,
        },
      });
      if (!role) throw new NotFoundError(`Role ${rawRoleCode} tidak ditemukan.`);

      // 3. Proteksi: Company Admin tidak boleh menghapus/mengubah role administratif miliknya sendiri
      if (actorId && actorId === targetUserId && parsedRole === RoleCode.COMPANY_ADMIN) {
        throw new ForbiddenError('Company Admin tidak dapat menghapus role administratif miliknya sendiri.');
      }

      // 4. Cek semua role yang dimiliki user di company ini
      const existingUserRoles = await tx.iam_user_role.findMany({
        where: {
          user_id: targetUserId,
          company_id: companyId,
        },
      });

      const targetRoleAssignment = existingUserRoles.find((ur) => ur.role_id === role.id);
      if (!targetRoleAssignment) {
        return { removed: false, message: 'User tidak memiliki role tersebut.' };
      }

      // Proteksi: tidak boleh menghapus role terakhir
      if (existingUserRoles.length <= 1) {
        throw new ValidationError('User harus memiliki setidaknya satu role pada company.');
      }

      // Hapus role assignment
      await tx.iam_user_role.delete({
        where: { id: targetRoleAssignment.id },
      });

      // Jika role yang dihapus merupakan active_role_id, pindahkan ke role lain yang tersisa
      if (user.active_role_id === role.id) {
        const remainingRole = existingUserRoles.find((ur) => ur.role_id !== role.id);
        if (remainingRole && remainingRole.role_id) {
          await tx.iam_user.update({
            where: { id: targetUserId },
            data: { active_role_id: remainingRole.role_id },
          });
        }
      }

      return {
        removed: true,
        role_code: toExternalRoleCode(role.role_code),
      };
    });
  }
}
