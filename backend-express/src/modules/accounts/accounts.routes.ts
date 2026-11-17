/**
 * File: backend-express/src/modules/accounts/accounts.routes.ts
 *
 * Purpose: Implements Express API routing responsibilities for the accounts domain.
 * Responsibility: Defines the executable contracts in this file and connects them to their callers without owning unrelated domain behavior.
 * Integration: Used through static imports, Express/Next framework discovery, or an explicit npm/script entry point as applicable.
 * Dependencies and side effects: See each documented function; database, browser storage, network, and response mutations are called out where present.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { AccountsService } from './accounts.service';
import { authenticate } from '../../middlewares/auth.middleware';
import { createCrudRouter } from '../../utils/crud-factory';
import prisma from '../../config/database';
import { ForbiddenError, ValidationError } from '../../utils/errors';
import {
  requireAdminForWrite,
  requireCompanyAdmin,
  requireCompanyContextForWrite,
  requireSuperAdminForWrite,
} from '../../middlewares/rbac.middleware';
import { ADMIN_ROLE_CODES, isSuperAdmin, parseRoleCode, RoleCode } from '../../types/roles';

export const authRouter = Router();
export const publicAuthRouter = Router();
export const accountsRouter = Router();

// =============================================================================
// AUTH ROUTES (/api/v1/auth/*)
// =============================================================================

// Token login
/**
 * POST route handler: `/token`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
publicAuthRouter.post('/token', async (req: Request, res: Response, next: NextFunction) => {
  const startedAt = performance.now();
  try {
    const identifier = req.body.email || req.body.username || '';
    const password = req.body.password || '';
    const result = await AccountsService.login(identifier, password);
    res.setHeader('Server-Timing', `auth;dur=${(performance.now() - startedAt).toFixed(1)}`);
    res.json(result);
  } catch (err) {
    if (!res.headersSent) res.setHeader('Server-Timing', `auth;dur=${(performance.now() - startedAt).toFixed(1)}`);
    next(err);
  } finally {
    const totalMs = performance.now() - startedAt;
    if (totalMs > 10000) console.warn(`[auth-latency] stage=login-total duration_ms=${totalMs.toFixed(0)}`);
  }
});

// Token refresh
/**
 * POST route handler: `/token/refresh`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
publicAuthRouter.post('/token/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const refresh = req.body.refresh || '';
    const result = await AccountsService.refreshToken(refresh);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Token verify
/**
 * POST route handler: `/token/verify`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
authRouter.post('/token/verify', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.body.token || req.body.access || '';
    await AccountsService.refreshToken(token);
    res.json({});
  } catch (err) {
    next(err);
  }
});

// Me
/**
 * GET route handler: `/me`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
authRouter.get('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await AccountsService.getCurrentUser(req.user!.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Logout
/**
 * POST route handler: `/logout`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
authRouter.post('/logout', authenticate, (_req: Request, res: Response) => {
  res.status(204).send();
});

// Change Password
/**
 * POST route handler: `/change-password`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
authRouter.post('/change-password', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { current_password, new_password } = req.body;
    const result = await AccountsService.changePassword(req.user!.id, current_password, new_password);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Update Profile (Full Name, Email)
/**
 * POST route handler: `/update-profile`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
authRouter.post('/update-profile', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { full_name, email, phone } = req.body;
    const result = await AccountsService.updateProfile(req.user!.id, { full_name, email, phone });
    res.json(result);
  } catch (err) {
    next(err);
  }
});
/**
 * PATCH route handler: `/profile`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
authRouter.patch('/profile', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { full_name, email, phone } = req.body;
    const result = await AccountsService.updateProfile(req.user!.id, { full_name, email, phone });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Active Role Switch (No Relogin Required)
/**
 * handleActiveRole implements a named function within this file's Express API routing boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: No database operation is implied unless explicitly present in the implementation.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
const handleActiveRole = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const roleCode = req.body.role_code || req.body.role || req.body.roleCode || '';
    if (!roleCode) {
      throw new ValidationError('role_code wajib diisi.');
    }
    const result = await AccountsService.changeActiveRole(req.user!.id, roleCode);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH route handler: `/active-role`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
authRouter.patch('/active-role', authenticate, handleActiveRole);
/**
 * POST route handler: `/active-role`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
authRouter.post('/active-role', authenticate, handleActiveRole);
/**
 * PATCH route handler: `/active-role`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
accountsRouter.patch('/active-role', authenticate, handleActiveRole);
/**
 * POST route handler: `/active-role`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
accountsRouter.post('/active-role', authenticate, handleActiveRole);
/**
 * PATCH route handler: `/auth/active-role`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
accountsRouter.patch('/auth/active-role', authenticate, handleActiveRole);
/**
 * POST route handler: `/auth/active-role`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
accountsRouter.post('/auth/active-role', authenticate, handleActiveRole);

// =============================================================================
// ACCOUNTS ROUTES (/api/v1/accounts/*)
// =============================================================================

// Auth aliases under accounts
/**
 * POST route handler: `/auth/login`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
accountsRouter.post('/auth/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const identifier = req.body.email || req.body.username || '';
    const password = req.body.password || '';
    const result = await AccountsService.login(identifier, password);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST route handler: `/auth/refresh`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
accountsRouter.post('/auth/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const refresh = req.body.refresh || '';
    const result = await AccountsService.refreshToken(refresh);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET route handler: `/auth/me`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
accountsRouter.get('/auth/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await AccountsService.getCurrentUser(req.user!.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET route handler: `/me`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
accountsRouter.get('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await AccountsService.getCurrentUser(req.user!.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST route handler: `/change-password`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
accountsRouter.post('/change-password', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { current_password, new_password } = req.body;
    const result = await AccountsService.changePassword(req.user!.id, current_password, new_password);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST route handler: `/update-profile`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
accountsRouter.post('/update-profile', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { full_name, email, phone } = req.body;
    const result = await AccountsService.updateProfile(req.user!.id, { full_name, email, phone });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * sanitizeUser implements a named function within this file's Express API routing boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: No database operation is implied unless explicitly present in the implementation.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
const sanitizeUser = (record: any) => {
  const { password_hash: _passwordHash, ...safe } = record;
  return safe;
};

/**
 * usersCrud implements a named function within this file's Express API routing boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: No database operation is implied unless explicitly present in the implementation.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
const usersCrud = () => createCrudRouter({
  modelName: 'iam_user',
  searchFields: ['email', 'username', 'full_name'],
  beforeCreate: () => {
    throw new ValidationError('Gunakan workflow invitation untuk membuat user baru.');
  },
  beforeUpdate: (_req, data) => {
    const allowed = ['full_name', 'email', 'username', 'status', 'is_active', 'department_id', 'role_level'];
    return Object.fromEntries(Object.entries(data).filter(([key]) => allowed.includes(key)));
  },
  beforeDelete: (req, existing) => {
    if (existing.id === req.user?.id) {
      throw new ForbiddenError('Admin tidak dapat menghapus akun yang sedang digunakan.');
    }
  },
  transform: sanitizeUser,
});

/**
 * inviteUser implements a named function within this file's Express API routing boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: No database operation is implied unless explicitly present in the implementation.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
async function inviteUser(req: Request, res: Response, next: NextFunction) {
  try {
    const callerIsSuperAdmin = isSuperAdmin(req.user?.roles ?? []);

    // Super Admin may provide company_id and tenant_id explicitly in the body.
    // Company Admin is always scoped to their own company via req.companyId.
    const companyId: string | undefined = callerIsSuperAdmin
      ? (req.body.company_id ?? req.companyId)
      : req.companyId;
    const tenantId: string | undefined = callerIsSuperAdmin
      ? (req.body.tenant_id ?? req.user?.tenant_id)
      : req.user?.tenant_id;

    if (!companyId || !tenantId) {
      throw new ForbiddenError(
        callerIsSuperAdmin
          ? 'Super Admin wajib menyertakan company_id dan tenant_id pada body request.'
          : 'Pilih satu company eksplisit untuk mengundang user.',
      );
    }

    const roleCodes: string[] = Array.isArray(req.body.role_codes)
      ? req.body.role_codes.filter((value: unknown): value is string => typeof value === 'string')
      : typeof req.body.role_code === 'string'
        ? [req.body.role_code]
        : [RoleCode.STAFF];
    const parsedRoleCodes = roleCodes.map(parseRoleCode);
    if (parsedRoleCodes.some((code) => code === null)) {
      throw new ValidationError('Role code tidak terdaftar dalam katalog role sistem.');
    }
    const canonicalRoleCodes = parsedRoleCodes as RoleCode[];
    if (canonicalRoleCodes.includes(RoleCode.SUPER_ADMIN)) {
      throw new ForbiddenError('Super Admin bersifat global dan tidak dapat dibuat melalui invitation company.');
    }
    if (!callerIsSuperAdmin && canonicalRoleCodes.includes(RoleCode.COMPANY_ADMIN)) {
      throw new ForbiddenError('Company Admin tidak dapat mengangkat Company Admin lain.');
    }

    const result = await AccountsService.inviteUser({
      name: req.body.name ?? req.body.full_name ?? '',
      email: req.body.email ?? '',
      password: req.body.password ?? '',
      roleCodes: canonicalRoleCodes,
      companyId,
      tenantId,
      departmentId: req.body.department_id ?? req.body.departmentId ?? null,
      roleLevel: req.body.role_level ?? req.body.roleLevel ?? 'STAFF',
      actorId: req.user?.id,
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/accounts/user-module-access
 *
 * Returns only the explicit per-user module overrides for the caller's active
 * company. Company modules remain the ceiling; this endpoint never exposes
 * users or grants from another company.
 */
async function listUserModuleAccess(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.companyId) throw new ForbiddenError('Pilih company sebelum melihat akses personal.');
    const rows = await prisma.iam_user_module_access.findMany({
      where: { company_id: req.companyId },
      orderBy: [{ user_id: 'asc' }, { module_code: 'asc' }],
    });
    res.json({ results: rows });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/v1/accounts/users/:userId/module-access/:moduleCode
 *
 * Delegates a company-approved module to exactly one user. The Company Admin
 * cannot self-grant, and cannot grant any module that Super Admin has not
 * enabled for this company. `allow_write` always implies `allow_read`.
 */
async function setUserModuleAccess(req: Request, res: Response, next: NextFunction) {
  try {
    const companyId = req.companyId;
    const userId = req.params.userId;
    const moduleCode = String(req.params.moduleCode || '').trim().toUpperCase();
    if (!companyId || !moduleCode) throw new ValidationError('Company dan module code wajib valid.');
    if (!isSuperAdmin(req.user?.roles ?? []) && userId === req.user?.id) {
      throw new ForbiddenError('Company Admin tidak dapat memberikan eskalasi modul kepada dirinya sendiri.');
    }
    const membership = await prisma.iam_user_company_membership.findUnique({ where: { user_id: userId } });
    if (!membership || membership.company_id !== companyId || membership.status !== 'ACTIVE') {
      throw new ForbiddenError('User target tidak terdaftar aktif pada company Anda.');
    }
    const companyModule = await prisma.iam_company_module_access.findUnique({
      where: { company_id_module_code: { company_id: companyId, module_code: moduleCode } },
    });
    const now = new Date();
    if (!companyModule?.enabled || (companyModule.effective_from && companyModule.effective_from > now) || (companyModule.effective_until && companyModule.effective_until < now)) {
      throw new ForbiddenError(`Modul ${moduleCode} belum disetujui aktif oleh Super Admin untuk company ini.`);
    }
    const allowWrite = Boolean(req.body.allow_write);
    if (moduleCode === 'MARBOT' && allowWrite) throw new ValidationError('Marka Plus saat ini hanya mendukung akses baca.');
    const allowRead = allowWrite || Boolean(req.body.allow_read);
    const result = await prisma.iam_user_module_access.upsert({
      where: { user_id_module_code: { user_id: userId, module_code: moduleCode } },
      create: { tenant_id: membership.tenant_id, company_id: companyId, user_id: userId, module_code: moduleCode, allow_read: allowRead, allow_write: allowWrite, granted_by_id: req.user?.id },
      update: { allow_read: allowRead, allow_write: allowWrite, granted_by_id: req.user?.id },
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/v1/accounts/users/:userId/module-access/:moduleCode
 *
 * Removes only the explicit personal override so authorization falls back to
 * the user's role and the Super-Admin-approved company entitlement. This is
 * distinct from PUT `{allow_read:false, allow_write:false}`, which explicitly
 * blocks the module for that user.
 */
async function resetUserModuleAccess(req: Request, res: Response, next: NextFunction) {
  try {
    const companyId = req.companyId;
    const userId = req.params.userId;
    const moduleCode = String(req.params.moduleCode || '').trim().toUpperCase();
    if (!companyId || !moduleCode) throw new ValidationError('Company dan module code wajib valid.');
    if (!isSuperAdmin(req.user?.roles ?? []) && userId === req.user?.id) {
      throw new ForbiddenError('Company Admin tidak dapat mengubah akses modul miliknya sendiri.');
    }
    const membership = await prisma.iam_user_company_membership.findUnique({ where: { user_id: userId } });
    if (!membership || membership.company_id !== companyId || membership.status !== 'ACTIVE') {
      throw new ForbiddenError('User target tidak terdaftar aktif pada company Anda.');
    }
    await prisma.iam_user_module_access.deleteMany({
      where: { user_id: userId, company_id: companyId, module_code: moduleCode },
    });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

/**
 * validateUserRoleAssignment implements a named function within this file's Express API routing boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: Reads or mutates Prisma model(s) `iam_user_role`, `iam_role`; transaction boundaries are exactly those visible in the body.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
async function validateUserRoleAssignment(req: Request, data: any) {
  const companyId = req.companyId;
  if (!companyId) throw new ForbiddenError('Pilih company sebelum mengubah role user.');

  const targetUserId = data.user_id ?? data.user;
  const roleId = data.role_id ?? data.role;
  if (!targetUserId || !roleId) throw new ValidationError('user_id dan role_id wajib diisi.');
  if (!isSuperAdmin(req.user?.roles ?? []) && targetUserId === req.user?.id) {
    throw new ForbiddenError('Company Admin tidak dapat mengubah assignment role miliknya sendiri.');
  }

  const targetMembership = await prisma.iam_user_role.findFirst({
    where: { user_id: targetUserId, company_id: companyId },
  });
  if (!targetMembership) {
    throw new ForbiddenError('User target tidak terdaftar pada company aktif.');
  }

  const role = await prisma.iam_role.findUnique({ where: { id: roleId } });
  if (!role || role.tenant_id !== req.user?.tenant_id) {
    throw new ForbiddenError('Role tidak tersedia dalam tenant user.');
  }
  if (!isSuperAdmin(req.user?.roles ?? []) && (ADMIN_ROLE_CODES as readonly string[]).includes(role.role_code)) {
    throw new ForbiddenError('Company Admin tidak dapat memberikan role administratif.');
  }

  return {
    ...data,
    user_id: targetUserId,
    role_id: roleId,
    company_id: companyId,
  };
}

/**
 * userRolesCrud implements a named function within this file's Express API routing boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: No database operation is implied unless explicitly present in the implementation.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
const userRolesCrud = () => createCrudRouter({
  modelName: 'iam_user_role',
  beforeCreate: validateUserRoleAssignment,
  beforeUpdate: async (req, data, existing) => validateUserRoleAssignment(req, { ...existing, ...data }),
  beforeDelete: (req, existing) => {
    if (existing.user_id === req.user?.id) {
      throw new ForbiddenError('Admin tidak dapat menghapus assignment role miliknya sendiri.');
    }
  },
});

/**
 * validateCompanyRole implements a named function within this file's Express API routing boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: No database operation is implied unless explicitly present in the implementation.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
async function validateCompanyRole(req: Request, data: any, existing?: any) {
  const superAdmin = isSuperAdmin(req.user?.roles ?? []);
  if (!superAdmin && !req.companyId) throw new ForbiddenError('Pilih company sebelum mengelola role custom.');
  if (existing?.is_system && !superAdmin) throw new ForbiddenError('Role sistem hanya dapat dikelola Super Admin.');
  if (!superAdmin && existing?.company_id !== req.companyId) throw new ForbiddenError('Role berada di luar company aktif.');

  const roleCode = parseRoleCode(data.role_code ?? existing?.role_code ?? RoleCode.STAFF);
  if (!roleCode) throw new ValidationError('role_code dasar tidak valid.');
  if (!superAdmin && (ADMIN_ROLE_CODES as readonly string[]).includes(roleCode)) {
    throw new ForbiddenError('Company Admin tidak dapat membuat role dengan kewenangan administratif.');
  }
  const customCode = String(data.custom_code ?? existing?.custom_code ?? '').trim().toUpperCase();
  if (!superAdmin && !customCode) throw new ValidationError('custom_code wajib untuk role company.');
  return {
    ...data,
    role_code: roleCode,
    company_id: superAdmin ? (data.company_id ?? existing?.company_id ?? null) : req.companyId,
    tenant_id: req.user?.tenant_id,
    custom_code: customCode || null,
    is_system: superAdmin ? Boolean(data.is_system ?? existing?.is_system ?? false) : false,
  };
}

/**
 * rolesCrud implements a named function within this file's Express API routing boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: No database operation is implied unless explicitly present in the implementation.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
const rolesCrud = () => createCrudRouter({
  modelName: 'iam_role',
  searchFields: ['role_code', 'role_name', 'custom_code'],
  beforeCreate: (req, data) => validateCompanyRole(req, data),
  beforeUpdate: (req, data, existing) => validateCompanyRole(req, data, existing),
  beforeDelete: (req, existing) => {
    if (existing.is_system && !isSuperAdmin(req.user?.roles ?? [])) {
      throw new ForbiddenError('Role sistem tidak dapat dihapus Company Admin.');
    }
  },
});

/**
 * validateRolePermission implements a named function within this file's Express API routing boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: Reads or mutates Prisma model(s) `iam_role`, `iam_user_role`, `iam_permission`, `iam_company_module_access`; transaction boundaries are exactly those visible in the body.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
async function validateRolePermission(req: Request, data: any, existing?: any) {
  if (!req.companyId) throw new ForbiddenError('Pilih company sebelum mengubah permission role.');
  const roleId = data.role_id ?? existing?.role_id;
  const permissionId = data.permission_id ?? existing?.permission_id;
  const role = await prisma.iam_role.findUnique({ where: { id: roleId } });
  if (!role || (role.company_id && role.company_id !== req.companyId)) {
    throw new ForbiddenError('Role tidak tersedia untuk company aktif.');
  }
  if (!isSuperAdmin(req.user?.roles ?? [])) {
    const selfAssignment = await prisma.iam_user_role.findFirst({
      where: { user_id: req.user?.id, role_id: roleId, company_id: req.companyId },
    });
    if (selfAssignment) throw new ForbiddenError('Company Admin tidak dapat menaikkan permission role yang dipakainya sendiri.');
  }
  const permission = await prisma.iam_permission.findUnique({ where: { id: permissionId } });
  if (!permission) throw new ValidationError('Permission tidak ditemukan.');
  const moduleAccess = await prisma.iam_company_module_access.findFirst({
    where: { company_id: req.companyId, module_code: permission.module_code, enabled: true },
  });
  if (!moduleAccess) throw new ForbiddenError('Permission hanya dapat diberikan untuk modul company yang aktif.');
  return { ...data, role_id: roleId, permission_id: permissionId, company_id: req.companyId, tenant_id: req.user?.tenant_id };
}

/**
 * rolePermissionsCrud implements a named function within this file's Express API routing boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: No database operation is implied unless explicitly present in the implementation.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
const rolePermissionsCrud = () => createCrudRouter({
  modelName: 'iam_role_permission',
  beforeCreate: validateRolePermission,
  beforeUpdate: (req, data, existing) => validateRolePermission(req, data, existing),
});

/**
 * mountAccountResources implements a named function within this file's Express API routing boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: No database operation is implied unless explicitly present in the implementation.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
async function listUserRoles(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = req.params;
    const companyId = req.companyId || String(req.header('X-Company-ID') || '');
    if (!companyId) throw new ForbiddenError('Pilih company terlebih dahulu.');
    const result = await AccountsService.getUserRoles(companyId, userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function assignUserRole(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = req.params;
    const roleCode = req.params.roleCode || req.body?.role_code || req.body?.roleCode;
    if (!roleCode) throw new ValidationError('role_code wajib diisi.');
    const companyId = req.companyId;
    if (!companyId) throw new ForbiddenError('Pilih company terlebih dahulu.');
    const tenantId = req.user?.tenant_id;
    if (!tenantId) throw new ForbiddenError('Tenant ID tidak ditemukan.');
    const result = await AccountsService.assignRoleToUser({
      companyId,
      tenantId,
      targetUserId: userId,
      rawRoleCode: roleCode,
      actorId: req.user?.id,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function removeUserRole(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = req.params;
    const roleCode = req.params.roleCode || req.body?.role_code || req.body?.roleCode;
    if (!roleCode) throw new ValidationError('role_code wajib diisi.');
    const companyId = req.companyId;
    if (!companyId) throw new ForbiddenError('Pilih company terlebih dahulu.');
    const tenantId = req.user?.tenant_id;
    if (!tenantId) throw new ForbiddenError('Tenant ID tidak ditemukan.');
    const result = await AccountsService.removeRoleFromUser({
      companyId,
      tenantId,
      targetUserId: userId,
      rawRoleCode: roleCode,
      actorId: req.user?.id,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function updateUserDepartmentAndRoleLevel(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = req.params;
    const companyId = req.companyId || String(req.header('X-Company-ID') || '');
    if (!companyId) throw new ForbiddenError('Pilih company terlebih dahulu.');

    const membership = await prisma.iam_user_company_membership.findUnique({ where: { user_id: userId } });
    if (!membership || membership.company_id !== companyId) {
      throw new ForbiddenError('User target tidak terdaftar pada company aktif.');
    }

    const departmentId =
      req.body.department_id !== undefined
        ? (req.body.department_id ? String(req.body.department_id).trim() : null)
        : undefined;
    const rawRoleLevel =
      req.body.role_level !== undefined
        ? String(req.body.role_level || 'STAFF').trim().toUpperCase()
        : undefined;

    if (rawRoleLevel !== undefined && !['GM', 'SPV', 'STAFF'].includes(rawRoleLevel)) {
      throw new ValidationError('role_level harus bernilai GM, SPV, atau STAFF.');
    }

    if (departmentId) {
      const dept = await (prisma as any).core_department.findFirst({
        where: { id: departmentId, company_id: companyId },
        select: { id: true, code: true, name: true },
      });
      if (!dept) {
        throw new ValidationError('Departemen / Divisi tidak ditemukan pada company aktif.');
      }
    }

    const updatedUser = await prisma.$transaction(async (tx) => {
      const row = await (tx.iam_user as any).update({
        where: { id: userId },
        data: {
          ...(departmentId !== undefined ? { department_id: departmentId } : {}),
          ...(rawRoleLevel !== undefined ? { role_level: rawRoleLevel } : {}),
        },
        include: {
          department: {
            select: { id: true, code: true, name: true, unit_type: true },
          },
        },
      });

      if (departmentId !== undefined) {
        await tx.master_employee.updateMany({
          where: { user_id: userId, company_id: companyId },
          data: {
            department_id: departmentId,
          },
        });
      }

      if (departmentId && (rawRoleLevel === 'GM' || rawRoleLevel === 'SPV')) {
        await (tx as any).core_department.updateMany({
          where: { id: departmentId, company_id: companyId, manager_user_id: null },
          data: { manager_user_id: userId },
        });
      }

      return row;
    });

    res.json({
      success: true,
      user: sanitizeUser(updatedUser),
      department_id: updatedUser.department_id ?? null,
      department_code: updatedUser.department?.code ?? null,
      department_name: updatedUser.department?.name ?? null,
      role_level: updatedUser.role_level ?? 'STAFF',
    });
  } catch (err) {
    next(err);
  }
}

const DEFAULT_HIERARCHY_MODULES = [
  'PROJECTS',
  'FINANCE',
  'CRM',
  'SALES',
  'INVENTORY',
  'REQUESTS',
  'REPORTING',
];

const DEFAULT_TIER_CONFIGS = [
  {
    tier_level: 1,
    default_title: 'Module Head / Manager',
    description: 'Penanggung jawab utama modul, mengelola tim, distribusi kerja, dan persetujuan akhir tingkat modul.',
    allow_read: true,
    allow_write: true,
    allow_approve: true,
    allow_delete: false,
    allow_manage_users: true,
    allow_export: true,
  },
  {
    tier_level: 2,
    default_title: 'Supervisor / Team Lead',
    description: 'Pengawas operasional harian modul, review pekerjaan tim, dan persetujuan tahap pertama.',
    allow_read: true,
    allow_write: true,
    allow_approve: true,
    allow_delete: false,
    allow_manage_users: false,
    allow_export: true,
  },
  {
    tier_level: 3,
    default_title: 'Staff / Executor',
    description: 'Pelaksana tugas harian, input data transaksi/progres, dan pelaporan hasil kerja mandiri.',
    allow_read: true,
    allow_write: true,
    allow_approve: false,
    allow_delete: false,
    allow_manage_users: false,
    allow_export: false,
  },
];

let moduleHierarchyTablesEnsured = false;

async function ensureModuleHierarchyTables() {
  if (moduleHierarchyTablesEnsured) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "iam_module_tier_config" (
        "id" TEXT NOT NULL,
        "tenant_id" TEXT,
        "company_id" TEXT NOT NULL,
        "module_code" VARCHAR(50) NOT NULL,
        "tier_level" INTEGER NOT NULL,
        "custom_title" VARCHAR(120) NOT NULL,
        "default_title" VARCHAR(120) NOT NULL,
        "description" TEXT,
        "is_active" BOOLEAN NOT NULL DEFAULT true,
        "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "iam_module_tier_config_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "iam_user_module_assignment" (
        "id" TEXT NOT NULL,
        "tenant_id" TEXT,
        "company_id" TEXT NOT NULL,
        "user_id" TEXT NOT NULL,
        "module_code" VARCHAR(50) NOT NULL,
        "tier_level" INTEGER NOT NULL,
        "position_title" VARCHAR(120),
        "department_id" TEXT,
        "reports_to_user_id" TEXT,
        "data_scope" VARCHAR(40) NOT NULL DEFAULT 'OWN',
        "is_primary_position" BOOLEAN NOT NULL DEFAULT false,
        "status" VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
        "effective_from" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "effective_until" TIMESTAMPTZ(6),
        "assigned_by_id" TEXT,
        "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "iam_user_module_assignment_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "iam_module_tier_permission" (
        "id" TEXT NOT NULL,
        "tenant_id" TEXT,
        "company_id" TEXT NOT NULL,
        "module_code" VARCHAR(50) NOT NULL,
        "tier_level" INTEGER NOT NULL,
        "permission_code" VARCHAR(120) NOT NULL,
        "allow_read" BOOLEAN NOT NULL DEFAULT true,
        "allow_write" BOOLEAN NOT NULL DEFAULT false,
        "allow_approve" BOOLEAN NOT NULL DEFAULT false,
        "allow_delete" BOOLEAN NOT NULL DEFAULT false,
        "allow_manage_users" BOOLEAN NOT NULL DEFAULT false,
        "allow_export" BOOLEAN NOT NULL DEFAULT false,
        "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "iam_module_tier_permission_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "iam_user_permission_override" (
        "id" TEXT NOT NULL,
        "tenant_id" TEXT,
        "company_id" TEXT NOT NULL,
        "user_id" TEXT NOT NULL,
        "module_code" VARCHAR(50) NOT NULL,
        "permission_code" VARCHAR(120) NOT NULL,
        "effect" VARCHAR(20) NOT NULL DEFAULT 'ALLOW',
        "reason" TEXT,
        "granted_by_id" TEXT,
        "expires_at" TIMESTAMPTZ(6),
        "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "iam_user_permission_override_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "iam_approval_delegation" (
        "id" TEXT NOT NULL,
        "tenant_id" TEXT,
        "company_id" TEXT NOT NULL,
        "delegator_user_id" TEXT NOT NULL,
        "delegate_user_id" TEXT NOT NULL,
        "module_code" VARCHAR(50) NOT NULL,
        "permission_scope" VARCHAR(120) NOT NULL DEFAULT 'APPROVE_ONLY',
        "max_approval_amount" DECIMAL(18,2),
        "status" VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
        "reason" TEXT,
        "valid_from" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "valid_until" TIMESTAMPTZ(6) NOT NULL,
        "revoked_by_id" TEXT,
        "revoked_at" TIMESTAMPTZ(6),
        "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "iam_approval_delegation_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "iam_assignment_history" (
        "id" TEXT NOT NULL,
        "tenant_id" TEXT,
        "company_id" TEXT NOT NULL,
        "user_id" TEXT NOT NULL,
        "module_code" VARCHAR(50) NOT NULL,
        "action_type" VARCHAR(40) NOT NULL,
        "previous_tier_level" INTEGER,
        "new_tier_level" INTEGER,
        "previous_title" VARCHAR(120),
        "new_title" VARCHAR(120),
        "previous_scope" VARCHAR(40),
        "new_scope" VARCHAR(40),
        "reason" TEXT,
        "changed_by_id" TEXT,
        "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "iam_assignment_history_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "iam_cross_module_capability" (
        "id" TEXT NOT NULL,
        "tenant_id" TEXT,
        "company_id" TEXT NOT NULL,
        "source_module" VARCHAR(50) NOT NULL,
        "source_tier_level" INTEGER NOT NULL,
        "target_module" VARCHAR(50) NOT NULL,
        "capability_code" VARCHAR(120) NOT NULL,
        "allow_read" BOOLEAN NOT NULL DEFAULT true,
        "allow_action" BOOLEAN NOT NULL DEFAULT false,
        "is_enabled" BOOLEAN NOT NULL DEFAULT true,
        "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "iam_cross_module_capability_pkey" PRIMARY KEY ("id")
      );
    `);
    moduleHierarchyTablesEnsured = true;
  } catch {
    // Non-fatal fallback
  }
}

async function getModuleHierarchy(req: Request, res: Response, next: NextFunction) {
  try {
    await ensureModuleHierarchyTables();
    const companyId = req.companyId || String(req.header('X-Company-ID') || req.query.company_id || '').trim();
    const tenantId = req.user?.tenant_id || null;
    if (!companyId) {
      throw new ForbiddenError('Pilih company terlebih dahulu untuk melihat konfigurasi hirarki modul.');
    }

    let tierConfigs: any[] = [];
    let tierPermissions: any[] = [];
    let assignments: any[] = [];
    let crossModuleCapabilities: any[] = [];
    let delegations: any[] = [];
    let history: any[] = [];

    try {
      tierConfigs = await (prisma as any).iam_module_tier_config.findMany({
        where: { company_id: companyId },
        orderBy: [{ module_code: 'asc' }, { tier_level: 'asc' }],
      });

      if (tierConfigs.length === 0) {
        const seedConfigs: any[] = [];
        const seedPerms: any[] = [];
        for (const modCode of DEFAULT_HIERARCHY_MODULES) {
          for (const tier of DEFAULT_TIER_CONFIGS) {
            seedConfigs.push({
              tenant_id: tenantId,
              company_id: companyId,
              module_code: modCode,
              tier_level: tier.tier_level,
              custom_title: `${modCode} ${tier.default_title.split(' / ')[0]}`,
              default_title: tier.default_title,
              description: tier.description,
              is_active: true,
            });
            seedPerms.push({
              tenant_id: tenantId,
              company_id: companyId,
              module_code: modCode,
              tier_level: tier.tier_level,
              permission_code: `${modCode}.TIER_${tier.tier_level}.DEFAULT`,
              allow_read: tier.allow_read,
              allow_write: tier.allow_write,
              allow_approve: tier.allow_approve,
              allow_delete: tier.allow_delete,
              allow_manage_users: tier.allow_manage_users,
              allow_export: tier.allow_export,
            });
          }
        }
        await (prisma as any).iam_module_tier_config.createMany({
          data: seedConfigs,
          skipDuplicates: true,
        });
        await (prisma as any).iam_module_tier_permission.createMany({
          data: seedPerms,
          skipDuplicates: true,
        });
        tierConfigs = await (prisma as any).iam_module_tier_config.findMany({
          where: { company_id: companyId },
          orderBy: [{ module_code: 'asc' }, { tier_level: 'asc' }],
        });
      }

      [tierPermissions, assignments, crossModuleCapabilities, delegations, history] = await Promise.all([
        (prisma as any).iam_module_tier_permission.findMany({
          where: { company_id: companyId },
          orderBy: [{ module_code: 'asc' }, { tier_level: 'asc' }],
        }),
        (prisma as any).iam_user_module_assignment.findMany({
          where: { company_id: companyId },
          orderBy: [{ module_code: 'asc' }, { tier_level: 'asc' }, { updated_at: 'desc' }],
        }),
        (prisma as any).iam_cross_module_capability.findMany({
          where: { company_id: companyId },
          orderBy: [{ source_module: 'asc' }, { target_module: 'asc' }],
        }),
        (prisma as any).iam_approval_delegation.findMany({
          where: { company_id: companyId },
          orderBy: { created_at: 'desc' },
          take: 50,
        }),
        (prisma as any).iam_assignment_history.findMany({
          where: { company_id: companyId },
          orderBy: { changed_at: 'desc' },
          take: 60,
        }),
      ]);
    } catch {
      // Graceful fallback if tables are not yet migrated in DB
    }

    res.json({
      company_id: companyId,
      tier_configs: tierConfigs,
      tier_permissions: tierPermissions,
      assignments,
      cross_module_capabilities: crossModuleCapabilities,
      delegations,
      history,
    });
  } catch (err) {
    next(err);
  }
}

async function upsertModuleTier(req: Request, res: Response, next: NextFunction) {
  try {
    await ensureModuleHierarchyTables();
    const companyId = req.companyId || String(req.header('X-Company-ID') || req.body.company_id || '').trim();
    const tenantId = req.user?.tenant_id || null;
    if (!companyId) throw new ForbiddenError('Pilih company terlebih dahulu.');

    const moduleCode = String(req.body.module_code || '').trim().toUpperCase();
    const tierLevel = Number(req.body.tier_level);
    if (!moduleCode || ![1, 2, 3].includes(tierLevel)) {
      throw new ValidationError('module_code dan tier_level (1, 2, atau 3) wajib valid.');
    }

    const customTitle = String(req.body.custom_title || '').trim() || `Level ${tierLevel}`;
    const description = req.body.description !== undefined ? String(req.body.description || '').trim() : null;

    const existingConfig = await (prisma as any).iam_module_tier_config.findFirst({
      where: { company_id: companyId, module_code: moduleCode, tier_level: tierLevel },
    });

    const configRecord = existingConfig
      ? await (prisma as any).iam_module_tier_config.update({
          where: { id: existingConfig.id },
          data: {
            custom_title: customTitle,
            description,
            is_active: req.body.is_active !== undefined ? Boolean(req.body.is_active) : existingConfig.is_active,
          },
        })
      : await (prisma as any).iam_module_tier_config.create({
          data: {
            tenant_id: tenantId,
            company_id: companyId,
            module_code: moduleCode,
            tier_level: tierLevel,
            custom_title: customTitle,
            default_title: `Level ${tierLevel}`,
            description,
            is_active: true,
          },
        });

    const permCode = `${moduleCode}.TIER_${tierLevel}.DEFAULT`;
    const existingPerm = await (prisma as any).iam_module_tier_permission.findFirst({
      where: {
        company_id: companyId,
        module_code: moduleCode,
        tier_level: tierLevel,
        permission_code: permCode,
      },
    });

    const permData = {
      allow_read: req.body.allow_read !== undefined ? Boolean(req.body.allow_read) : existingPerm?.allow_read ?? true,
      allow_write: req.body.allow_write !== undefined ? Boolean(req.body.allow_write) : existingPerm?.allow_write ?? (tierLevel <= 2),
      allow_approve: req.body.allow_approve !== undefined ? Boolean(req.body.allow_approve) : existingPerm?.allow_approve ?? (tierLevel <= 2),
      allow_delete: req.body.allow_delete !== undefined ? Boolean(req.body.allow_delete) : existingPerm?.allow_delete ?? false,
      allow_manage_users: req.body.allow_manage_users !== undefined ? Boolean(req.body.allow_manage_users) : existingPerm?.allow_manage_users ?? (tierLevel === 1),
      allow_export: req.body.allow_export !== undefined ? Boolean(req.body.allow_export) : existingPerm?.allow_export ?? (tierLevel <= 2),
    };

    const permRecord = existingPerm
      ? await (prisma as any).iam_module_tier_permission.update({
          where: { id: existingPerm.id },
          data: permData,
        })
      : await (prisma as any).iam_module_tier_permission.create({
          data: {
            tenant_id: tenantId,
            company_id: companyId,
            module_code: moduleCode,
            tier_level: tierLevel,
            permission_code: permCode,
            ...permData,
          },
        });

    res.json({
      success: true,
      tier_config: configRecord,
      tier_permission: permRecord,
    });
  } catch (err) {
    next(err);
  }
}

async function upsertModuleAssignment(req: Request, res: Response, next: NextFunction) {
  try {
    await ensureModuleHierarchyTables();
    const companyId = req.companyId || String(req.header('X-Company-ID') || req.body.company_id || '').trim();
    const tenantId = req.user?.tenant_id || null;
    if (!companyId) throw new ForbiddenError('Pilih company terlebih dahulu.');

    const userId = String(req.body.user_id || '').trim();
    const moduleCode = String(req.body.module_code || '').trim().toUpperCase();
    const tierLevel = Number(req.body.tier_level);

    if (!userId || !moduleCode || ![0, 1, 2, 3].includes(tierLevel)) {
      throw new ValidationError('user_id, module_code, dan tier_level (0=GM, 1=Head, 2=SPV, 3=Staff) wajib valid.');
    }

    const positionTitle = req.body.position_title ? String(req.body.position_title).trim() : null;
    const departmentId = req.body.department_id ? String(req.body.department_id).trim() : null;
    const reportsToUserId = req.body.reports_to_user_id ? String(req.body.reports_to_user_id).trim() : null;
    const dataScope = String(req.body.data_scope || (tierLevel <= 1 ? 'ALL_MODULE' : tierLevel === 2 ? 'TEAM' : 'OWN')).trim().toUpperCase();
    const status = String(req.body.status || 'ACTIVE').trim().toUpperCase();

    const existing = await (prisma as any).iam_user_module_assignment.findFirst({
      where: { company_id: companyId, user_id: userId, module_code: moduleCode },
    });

    const record = existing
      ? await (prisma as any).iam_user_module_assignment.update({
          where: { id: existing.id },
          data: {
            tier_level: tierLevel,
            position_title: positionTitle,
            department_id: departmentId,
            reports_to_user_id: reportsToUserId,
            data_scope: dataScope,
            status,
            is_primary_position: req.body.is_primary_position !== undefined ? Boolean(req.body.is_primary_position) : existing.is_primary_position,
            effective_until: req.body.effective_until ? new Date(req.body.effective_until) : null,
            assigned_by_id: req.user?.id || null,
          },
        })
      : await (prisma as any).iam_user_module_assignment.create({
          data: {
            tenant_id: tenantId,
            company_id: companyId,
            user_id: userId,
            module_code: moduleCode,
            tier_level: tierLevel,
            position_title: positionTitle,
            department_id: departmentId,
            reports_to_user_id: reportsToUserId,
            data_scope: dataScope,
            status,
            is_primary_position: Boolean(req.body.is_primary_position),
            effective_from: req.body.effective_from ? new Date(req.body.effective_from) : new Date(),
            effective_until: req.body.effective_until ? new Date(req.body.effective_until) : null,
            assigned_by_id: req.user?.id || null,
          },
        });

    await (prisma as any).iam_assignment_history.create({
      data: {
        tenant_id: tenantId,
        company_id: companyId,
        user_id: userId,
        module_code: moduleCode,
        action_type: existing ? (existing.tier_level !== tierLevel ? 'TIER_CHANGE' : 'UPDATED') : 'ASSIGNED',
        previous_tier_level: existing ? existing.tier_level : null,
        new_tier_level: tierLevel,
        previous_title: existing ? existing.position_title : null,
        new_title: positionTitle,
        previous_scope: existing ? existing.data_scope : null,
        new_scope: dataScope,
        reason: req.body.reason ? String(req.body.reason).trim() : 'Penugasan struktur modul 3-tingkat',
        changed_by_id: req.user?.id || null,
      },
    });

    res.json({
      success: true,
      assignment: record,
    });
  } catch (err) {
    next(err);
  }
}

async function deleteModuleAssignment(req: Request, res: Response, next: NextFunction) {
  try {
    await ensureModuleHierarchyTables();
    const companyId = req.companyId || String(req.header('X-Company-ID') || '').trim();
    const tenantId = req.user?.tenant_id || null;
    const { id } = req.params;
    const existing = await (prisma as any).iam_user_module_assignment.findUnique({ where: { id } });
    if (!existing || (companyId && existing.company_id !== companyId)) {
      throw new ValidationError('Penugasan modul tidak ditemukan.');
    }

    await (prisma as any).iam_user_module_assignment.delete({ where: { id } });
    await (prisma as any).iam_assignment_history.create({
      data: {
        tenant_id: tenantId || existing.tenant_id,
        company_id: existing.company_id,
        user_id: existing.user_id,
        module_code: existing.module_code,
        action_type: 'REVOKED',
        previous_tier_level: existing.tier_level,
        new_tier_level: null,
        previous_title: existing.position_title,
        new_title: null,
        previous_scope: existing.data_scope,
        new_scope: null,
        reason: 'Penghapusan penugasan modul',
        changed_by_id: req.user?.id || null,
      },
    });

    res.json({ success: true, id });
  } catch (err) {
    next(err);
  }
}

async function upsertCrossModuleCapability(req: Request, res: Response, next: NextFunction) {
  try {
    await ensureModuleHierarchyTables();
    const companyId = req.companyId || String(req.header('X-Company-ID') || req.body.company_id || '').trim();
    const tenantId = req.user?.tenant_id || null;
    if (!companyId) throw new ForbiddenError('Pilih company terlebih dahulu.');

    const sourceModule = String(req.body.source_module || '').trim().toUpperCase();
    const sourceTierLevel = Number(req.body.source_tier_level);
    const targetModule = String(req.body.target_module || '').trim().toUpperCase();
    const capabilityCode = String(req.body.capability_code || '').trim().toUpperCase();

    if (!sourceModule || !targetModule || !capabilityCode || ![0, 1, 2, 3].includes(sourceTierLevel)) {
      throw new ValidationError('source_module, source_tier_level, target_module, dan capability_code wajib diisi.');
    }

    const existing = await (prisma as any).iam_cross_module_capability.findFirst({
      where: {
        company_id: companyId,
        source_module: sourceModule,
        source_tier_level: sourceTierLevel,
        target_module: targetModule,
        capability_code: capabilityCode,
      },
    });

    const record = existing
      ? await (prisma as any).iam_cross_module_capability.update({
          where: { id: existing.id },
          data: {
            allow_read: req.body.allow_read !== undefined ? Boolean(req.body.allow_read) : existing.allow_read,
            allow_action: req.body.allow_action !== undefined ? Boolean(req.body.allow_action) : existing.allow_action,
            is_enabled: req.body.is_enabled !== undefined ? Boolean(req.body.is_enabled) : existing.is_enabled,
          },
        })
      : await (prisma as any).iam_cross_module_capability.create({
          data: {
            tenant_id: tenantId,
            company_id: companyId,
            source_module: sourceModule,
            source_tier_level: sourceTierLevel,
            target_module: targetModule,
            capability_code: capabilityCode,
            allow_read: req.body.allow_read !== undefined ? Boolean(req.body.allow_read) : true,
            allow_action: req.body.allow_action !== undefined ? Boolean(req.body.allow_action) : false,
            is_enabled: true,
          },
        });

    res.json({ success: true, capability: record });
  } catch (err) {
    next(err);
  }
}

async function createApprovalDelegation(req: Request, res: Response, next: NextFunction) {
  try {
    await ensureModuleHierarchyTables();
    const companyId = req.companyId || String(req.header('X-Company-ID') || req.body.company_id || '').trim();
    const tenantId = req.user?.tenant_id || null;
    if (!companyId) throw new ForbiddenError('Pilih company terlebih dahulu.');

    const delegatorUserId = String(req.body.delegator_user_id || req.user?.id || '').trim();
    const delegateUserId = String(req.body.delegate_user_id || '').trim();
    const moduleCode = String(req.body.module_code || 'FINANCE').trim().toUpperCase();
    const validUntil = req.body.valid_until ? new Date(req.body.valid_until) : new Date(Date.now() + 7 * 86400000);

    if (!delegatorUserId || !delegateUserId || delegatorUserId === delegateUserId) {
      throw new ValidationError('Delegator dan penerima delegasi (delegate) harus berbeda dan valid.');
    }

    const record = await (prisma as any).iam_approval_delegation.create({
      data: {
        tenant_id: tenantId,
        company_id: companyId,
        delegator_user_id: delegatorUserId,
        delegate_user_id: delegateUserId,
        module_code: moduleCode,
        permission_scope: String(req.body.permission_scope || 'APPROVE_ONLY').trim().toUpperCase(),
        max_approval_amount: req.body.max_approval_amount ? Number(req.body.max_approval_amount) : null,
        status: 'ACTIVE',
        reason: req.body.reason ? String(req.body.reason).trim() : 'Delegasi persetujuan sementara (DoA)',
        valid_from: req.body.valid_from ? new Date(req.body.valid_from) : new Date(),
        valid_until: validUntil,
      },
    });

    res.json({ success: true, delegation: record });
  } catch (err) {
    next(err);
  }
}

async function revokeApprovalDelegation(req: Request, res: Response, next: NextFunction) {
  try {
    await ensureModuleHierarchyTables();
    const { id } = req.params;
    const record = await (prisma as any).iam_approval_delegation.update({
      where: { id },
      data: {
        status: 'REVOKED',
        revoked_by_id: req.user?.id || null,
        revoked_at: new Date(),
      },
    });
    res.json({ success: true, delegation: record });
  } catch (err) {
    next(err);
  }
}

function mountAccountResources(router: Router) {
  router.get('/module-hierarchy', getModuleHierarchy);
  router.post('/module-tiers', requireCompanyAdmin, requireCompanyContextForWrite, upsertModuleTier);
  router.post('/module-assignments', requireCompanyAdmin, requireCompanyContextForWrite, upsertModuleAssignment);
  router.delete('/module-assignments/:id', requireCompanyAdmin, requireCompanyContextForWrite, deleteModuleAssignment);
  router.post('/cross-module-capabilities', requireCompanyAdmin, requireCompanyContextForWrite, upsertCrossModuleCapability);
  router.post('/approval-delegations', requireCompanyAdmin, requireCompanyContextForWrite, createApprovalDelegation);
  router.post('/approval-delegations/:id/revoke', requireCompanyAdmin, requireCompanyContextForWrite, revokeApprovalDelegation);
  router.get('/users/:userId/roles', listUserRoles);
  router.put('/users/:userId/roles', requireCompanyAdmin, requireCompanyContextForWrite, assignUserRole);
  router.put('/users/:userId/roles/:roleCode', requireCompanyAdmin, requireCompanyContextForWrite, assignUserRole);
  router.delete('/users/:userId/roles/:roleCode', requireCompanyAdmin, requireCompanyContextForWrite, removeUserRole);
  router.delete('/users/:userId/roles', requireCompanyAdmin, requireCompanyContextForWrite, removeUserRole);
  router.put('/users/:userId/department-role', requireCompanyAdmin, requireCompanyContextForWrite, updateUserDepartmentAndRoleLevel);
  router.patch('/users/:userId/department-role', requireCompanyAdmin, requireCompanyContextForWrite, updateUserDepartmentAndRoleLevel);
  router.post('/users/invite', requireCompanyAdmin, inviteUser);
  router.get('/user-module-access', requireCompanyAdmin, listUserModuleAccess);
  router.put('/users/:userId/module-access/:moduleCode', requireCompanyAdmin, requireCompanyContextForWrite, setUserModuleAccess);
  router.delete('/users/:userId/module-access/:moduleCode', requireCompanyAdmin, requireCompanyContextForWrite, resetUserModuleAccess);
  router.use('/users', requireAdminForWrite, requireCompanyContextForWrite, usersCrud());
  router.use('/roles', requireAdminForWrite, rolesCrud());
  router.use('/permissions', requireSuperAdminForWrite, createCrudRouter({ modelName: 'iam_permission', searchFields: ['permission_code', 'module_code', 'resource_name'] }));
  router.use('/user-roles', requireAdminForWrite, requireCompanyContextForWrite, userRolesCrud());
  router.use('/role-permissions', requireAdminForWrite, requireCompanyContextForWrite, rolePermissionsCrud());
  router.use('/role-hierarchies', requireSuperAdminForWrite, createCrudRouter({ modelName: 'iam_role_hierarchy' }));
  router.use('/data-scope-policies', requireSuperAdminForWrite, createCrudRouter({ modelName: 'iam_data_scope_policy', searchFields: ['policy_code', 'module_code'] }));
  router.use('/role-data-scopes', requireSuperAdminForWrite, createCrudRouter({ modelName: 'iam_role_data_scope' }));
  router.use('/field-permissions', requireSuperAdminForWrite, createCrudRouter({ modelName: 'iam_field_permission', searchFields: ['module_code', 'field_name'] }));
  router.use('/information-share-rules', requireSuperAdminForWrite, createCrudRouter({ modelName: 'iam_information_share_rule' }));
  router.use('/approval-limits', requireSuperAdminForWrite, createCrudRouter({ modelName: 'iam_approval_limit' }));
  router.use('/user-project-accesses', requireAdminForWrite, requireCompanyContextForWrite, createCrudRouter({ modelName: 'iam_user_project_access' }));
}

mountAccountResources(accountsRouter);
mountAccountResources(authRouter);
