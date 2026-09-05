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
  try {
    const identifier = req.body.email || req.body.username || '';
    const password = req.body.password || '';
    const result = await AccountsService.login(identifier, password);
    res.json(result);
  } catch (err) {
    next(err);
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
    const allowed = ['full_name', 'email', 'username', 'status', 'is_active'];
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
    if (!req.companyId || !req.user?.tenant_id) {
      throw new ForbiddenError('Pilih satu company eksplisit untuk mengundang user.');
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
    if (!isSuperAdmin(req.user.roles) && canonicalRoleCodes.includes(RoleCode.COMPANY_ADMIN)) {
      throw new ForbiddenError('Company Admin tidak dapat mengangkat Company Admin lain.');
    }

    const result = await AccountsService.inviteUser({
      name: req.body.name ?? req.body.full_name ?? '',
      email: req.body.email ?? '',
      password: req.body.password ?? '',
      roleCodes: canonicalRoleCodes,
      companyId: req.companyId,
      tenantId: req.user.tenant_id,
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
function mountAccountResources(router: Router) {
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
