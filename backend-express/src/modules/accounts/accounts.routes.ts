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
import { ForbiddenError, NotFoundError, ValidationError } from '../../utils/errors';
import {
  requireAdminForWrite,
  requireCompanyAdmin,
  requireCompanyContextForWrite,
  requireSuperAdminForWrite,
} from '../../middlewares/rbac.middleware';
import { isSuperAdmin, parseRoleCode, RoleCode } from '../../types/roles';
import {
  DASHBOARD_WIDGET_CATALOG,
  QUICK_ACCESS_PRESETS,
  getUserQuickAccess,
  syncUserQuickAccess,
} from './org-policy-sync.service';
import { invalidateDashboardCache } from '../dashboard/dashboard.routes';

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
        : [];
    const parsedRoleCodes = roleCodes.map(parseRoleCode);
    if (parsedRoleCodes.some((code) => code === null)) {
      throw new ValidationError('Role code tidak terdaftar dalam katalog role sistem.');
    }
    const canonicalRoleCodes = parsedRoleCodes as RoleCode[];
    if (canonicalRoleCodes.some((code) => code !== RoleCode.COMPANY_ADMIN && code !== RoleCode.SUPER_ADMIN)) {
      throw new ValidationError('Role operasional tidak lagi diberikan sebagai role global. Tetapkan Role Profile pada modul terkait.');
    }
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
  const parsedRole = parseRoleCode(role.role_code);
  if (parsedRole !== RoleCode.COMPANY_ADMIN && parsedRole !== RoleCode.SUPER_ADMIN) {
    throw new ForbiddenError('Role operasional harus diberikan melalui Role Profile pada modul terkait.');
  }
  if (parsedRole === RoleCode.SUPER_ADMIN) {
    throw new ForbiddenError('SUPER_ADMIN hanya dikelola oleh proses tata kelola platform.');
  }
  if (!isSuperAdmin(req.user?.roles ?? [])) {
    throw new ForbiddenError('Hanya Super Admin yang dapat mengelola role Company Admin.');
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
  void data;
  const superAdmin = isSuperAdmin(req.user?.roles ?? []);
  if (!superAdmin && !req.companyId) throw new ForbiddenError('Pilih company sebelum mengelola role custom.');
  if (existing?.is_system && !superAdmin) throw new ForbiddenError('Role sistem hanya dapat dikelola Super Admin.');
  if (!superAdmin && existing?.company_id !== req.companyId) throw new ForbiddenError('Role berada di luar company aktif.');
  throw new ForbiddenError('Role operasional global sudah dipensiunkan. Buat atau ubah Role Profile pada modul terkait.');
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
  beforeDelete: () => { throw new ForbiddenError('Role global lama disimpan untuk kompatibilitas migrasi dan tidak dapat dihapus dari UI.'); },
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
  void req;
  void data;
  void existing;
  throw new ForbiddenError('Permission role global sudah dipensiunkan. Kelola capability melalui Role Profile per modul.');
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
  beforeDelete: () => { throw new ForbiddenError('Permission role global disimpan untuk kompatibilitas migrasi.'); },
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
    const parsedRole = parseRoleCode(String(roleCode));
    if (parsedRole !== RoleCode.COMPANY_ADMIN) {
      throw new ForbiddenError('Role operasional dikelola melalui Role Profile per modul.');
    }
    if (!isSuperAdmin(req.user?.roles ?? [])) {
      throw new ForbiddenError('Hanya Super Admin yang dapat mengangkat Company Admin.');
    }
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
    const parsedRole = parseRoleCode(String(roleCode));
    if (parsedRole !== RoleCode.COMPANY_ADMIN) {
      throw new ForbiddenError('Role operasional dikelola melalui Role Profile per modul.');
    }
    if (!isSuperAdmin(req.user?.roles ?? [])) {
      throw new ForbiddenError('Hanya Super Admin yang dapat mencabut role Company Admin.');
    }
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
  'FINANCE',
  'PROJECTS',
  'CRM',
  'INVENTORY',
  'HRMS',
  'MARBOT',
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
        "id" TEXT NOT NULL PRIMARY KEY,
        "tenant_id" TEXT,
        "company_id" TEXT NOT NULL,
        "module_code" TEXT NOT NULL,
        "tier_level" INTEGER NOT NULL,
        "custom_title" TEXT NOT NULL,
        "description" TEXT NOT NULL DEFAULT '',
        "is_active" BOOLEAN NOT NULL DEFAULT true,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_iam_module_tier_config"
        ON "iam_module_tier_config" ("company_id", "module_code", "tier_level");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "iam_user_module_assignment" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "tenant_id" TEXT,
        "company_id" TEXT NOT NULL,
        "user_id" TEXT NOT NULL,
        "module_code" TEXT NOT NULL,
        "tier_level" INTEGER NOT NULL DEFAULT 3,
        "tier_config_id" TEXT,
        "position_title" TEXT NOT NULL DEFAULT '',
        "department_id" TEXT,
        "reports_to_user_id" TEXT,
        "data_scope" TEXT NOT NULL DEFAULT 'OWN',
        "permission_profile" TEXT NOT NULL DEFAULT 'STANDARD',
        "is_primary" BOOLEAN NOT NULL DEFAULT false,
        "status" TEXT NOT NULL DEFAULT 'ACTIVE',
        "effective_from" TIMESTAMP(3),
        "effective_until" TIMESTAMP(3),
        "created_by_id" TEXT,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_iam_user_module_assignment"
        ON "iam_user_module_assignment" ("company_id", "user_id", "module_code");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "iam_module_tier_permission" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "tenant_id" TEXT,
        "company_id" TEXT NOT NULL,
        "module_code" TEXT NOT NULL,
        "tier_level" INTEGER NOT NULL,
        "allow_read" BOOLEAN NOT NULL DEFAULT true,
        "allow_write" BOOLEAN NOT NULL DEFAULT true,
        "allow_approve" BOOLEAN NOT NULL DEFAULT false,
        "allow_delete" BOOLEAN NOT NULL DEFAULT false,
        "allow_manage_users" BOOLEAN NOT NULL DEFAULT false,
        "allow_export" BOOLEAN NOT NULL DEFAULT true,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_iam_module_tier_permission"
        ON "iam_module_tier_permission" ("company_id", "module_code", "tier_level");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "iam_user_permission_override" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "tenant_id" TEXT,
        "company_id" TEXT NOT NULL,
        "user_id" TEXT NOT NULL,
        "module_code" TEXT NOT NULL,
        "action_code" TEXT NOT NULL,
        "effect" TEXT NOT NULL DEFAULT 'ALLOW',
        "reason" TEXT NOT NULL DEFAULT '',
        "created_by_id" TEXT,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "iam_approval_delegation" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "tenant_id" TEXT,
        "company_id" TEXT NOT NULL,
        "delegator_user_id" TEXT NOT NULL,
        "delegate_user_id" TEXT NOT NULL,
        "module_code" TEXT NOT NULL,
        "max_amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
        "reason" TEXT NOT NULL DEFAULT '',
        "valid_from" TIMESTAMP(3) NOT NULL,
        "valid_until" TIMESTAMP(3) NOT NULL,
        "revoked_at" TIMESTAMP(3),
        "created_by_id" TEXT,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "iam_assignment_history" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "tenant_id" TEXT,
        "company_id" TEXT NOT NULL,
        "actor_id" TEXT,
        "target_user_id" TEXT NOT NULL,
        "module_code" TEXT NOT NULL DEFAULT '',
        "change_type" TEXT NOT NULL,
        "before_json" TEXT NOT NULL DEFAULT '{}',
        "after_json" TEXT NOT NULL DEFAULT '{}',
        "reason" TEXT NOT NULL DEFAULT '',
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "iam_cross_module_capability" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "tenant_id" TEXT,
        "company_id" TEXT NOT NULL,
        "user_id" TEXT NOT NULL,
        "source_module_code" TEXT NOT NULL,
        "target_module_code" TEXT NOT NULL,
        "capability_code" TEXT NOT NULL,
        "allowed_actions" TEXT NOT NULL DEFAULT '[]',
        "status" TEXT NOT NULL DEFAULT 'ACTIVE',
        "created_by_id" TEXT,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_iam_cross_module_capability"
        ON "iam_cross_module_capability" ("company_id", "user_id", "source_module_code", "target_module_code", "capability_code");
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "core_department"
        ADD COLUMN IF NOT EXISTS "hierarchy_level" INTEGER NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS "materialized_path" TEXT NOT NULL DEFAULT '/';
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "core_department_module_access"
        ADD COLUMN IF NOT EXISTS "default_role_code" TEXT;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "iam_user"
        ADD COLUMN IF NOT EXISTS "reports_to_user_id" TEXT,
        ADD COLUMN IF NOT EXISTS "job_title" TEXT NOT NULL DEFAULT '';
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "core_user_org_membership" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "company_id" TEXT NOT NULL,
        "user_id" TEXT NOT NULL,
        "department_id" TEXT NOT NULL REFERENCES "core_department"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        "unit_role" TEXT NOT NULL DEFAULT 'STAFF',
        "is_primary" BOOLEAN NOT NULL DEFAULT true,
        "allocation_pct" DECIMAL(5,2) NOT NULL DEFAULT 100.00,
        "is_active" BOOLEAN NOT NULL DEFAULT true,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_core_user_org_membership"
        ON "core_user_org_membership" ("company_id", "user_id", "department_id");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "iam_user_dashboard_access" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "tenant_id" TEXT,
        "company_id" TEXT NOT NULL,
        "user_id" TEXT NOT NULL,
        "widget_code" TEXT NOT NULL,
        "is_enabled" BOOLEAN NOT NULL DEFAULT true,
        "granted_by_id" TEXT,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_iam_user_dashboard_access"
        ON "iam_user_dashboard_access" ("company_id", "user_id", "widget_code");
    `);
    moduleHierarchyTablesEnsured = true;
  } catch (err) {
    console.error('[ensureModuleHierarchyTables]', err);
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

    let tierConfigs = await (prisma as any).iam_module_tier_config.findMany({
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
            description: tier.description,
            is_active: true,
          });
          seedPerms.push({
            tenant_id: tenantId,
            company_id: companyId,
            module_code: modCode,
            tier_level: tier.tier_level,
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

    const [tierPermissions, assignments, crossModuleCapabilities, delegations, history, userModuleAccess, roleProfiles] = await Promise.all([
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
        orderBy: [{ source_module_code: 'asc' }, { target_module_code: 'asc' }],
      }),
      (prisma as any).iam_approval_delegation.findMany({
        where: { company_id: companyId },
        orderBy: { created_at: 'desc' },
        take: 50,
      }),
      (prisma as any).iam_assignment_history.findMany({
        where: { company_id: companyId },
        orderBy: { created_at: 'desc' },
        take: 60,
      }),
      prisma.iam_user_module_access.findMany({
        where: { company_id: companyId },
        orderBy: [{ module_code: 'asc' }],
      }),
      (prisma as any).iam_module_role_profile.findMany({
        where: { company_id: companyId },
        include: { capabilities: true },
        orderBy: [{ module_code: 'asc' }, { profile_code: 'asc' }],
      }),
    ]);

    res.json({
      company_id: companyId,
      tier_configs: tierConfigs,
      tier_permissions: tierPermissions,
      assignments,
      role_profiles: roleProfiles,
      module_entitlements: await prisma.iam_company_module_access.findMany({
        where: { company_id: companyId },
        select: { module_code: true, enabled: true, allow_read: true, access_mode: true },
        orderBy: { module_code: 'asc' },
      }),
      cross_module_capabilities: crossModuleCapabilities,
      delegations,
      history,
      user_module_access: userModuleAccess,
    });
  } catch (err) {
    console.error('[getModuleHierarchy]', err);
    next(err);
  }
}

const MODULE_PROFILE_CAPABILITIES = new Set(['READ', 'WRITE', 'APPROVE', 'DELETE', 'MANAGE_USERS', 'EXPORT']);
const MODULE_LEGACY_ROLE_MAP: Record<string, RoleCode[]> = {
  CRM: [RoleCode.SALES, RoleCode.CRM_LEAD, RoleCode.DIRECTOR],
  SALES: [RoleCode.SALES, RoleCode.CRM_LEAD, RoleCode.DIRECTOR],
  PROJECTS: [RoleCode.STAFF, RoleCode.SUPERVISOR, RoleCode.PROJECT_MANAGER, RoleCode.OPERATIONAL_MANAGER, RoleCode.DIRECTOR],
  INVENTORY: [RoleCode.STAFF, RoleCode.SUPERVISOR, RoleCode.OPERATIONAL_MANAGER, RoleCode.DIRECTOR],
  FINANCE: [RoleCode.FINANCE, RoleCode.DIRECTOR],
  PROCUREMENT: [RoleCode.FINANCE, RoleCode.OPERATIONAL_MANAGER, RoleCode.DIRECTOR],
  REPORTING: [RoleCode.STAFF, RoleCode.SUPERVISOR, RoleCode.FINANCE, RoleCode.OPERATIONAL_MANAGER, RoleCode.DIRECTOR],
  REQUESTS: [RoleCode.STAFF, RoleCode.SUPERVISOR, RoleCode.FINANCE, RoleCode.OPERATIONAL_MANAGER, RoleCode.PROJECT_MANAGER, RoleCode.DIRECTOR],
};

async function upsertModuleRoleProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const companyId = req.companyId || String(req.header('X-Company-ID') || req.body.company_id || '').trim();
    const tenantId = req.user?.tenant_id;
    if (!companyId || !tenantId) throw new ForbiddenError('Company dan tenant aktif wajib tersedia.');

    const moduleCode = String(req.body.module_code || '').trim().toUpperCase();
    const rawProfileCode = String(req.body.profile_code || '').trim().toUpperCase();
    const profileSuffix = rawProfileCode.includes(':') ? rawProfileCode.split(':').slice(1).join(':') : rawProfileCode;
    const profileCode = `${moduleCode}:${profileSuffix}`;
    const displayName = String(req.body.display_name || '').trim();
    const description = String(req.body.description || '').trim();
    const capabilityCodes: string[] = Array.isArray(req.body.capabilities)
      ? [...new Set<string>(req.body.capabilities.map((code: unknown) => String(code || '').trim().toUpperCase()))]
      : [];
    const legacyRoleCode = req.body.legacy_role_code ? parseRoleCode(String(req.body.legacy_role_code)) : null;

    if (!moduleCode || !profileSuffix || !/^[A-Z][A-Z0-9_]*$/.test(profileSuffix) || !displayName) {
      throw new ValidationError('module_code, profile_code, dan display_name wajib valid.');
    }
    if (!capabilityCodes.length || capabilityCodes.some((code: string) => !MODULE_PROFILE_CAPABILITIES.has(code))) {
      throw new ValidationError(`Capability profil harus dipilih dari: ${[...MODULE_PROFILE_CAPABILITIES].join(', ')}.`);
    }
    if (legacyRoleCode && !MODULE_LEGACY_ROLE_MAP[moduleCode]?.includes(legacyRoleCode)) {
      throw new ValidationError(`Role kompatibilitas ${legacyRoleCode} tidak sesuai dengan modul ${moduleCode}.`);
    }

    const entitlement = await prisma.iam_company_module_access.findUnique({
      where: { company_id_module_code: { company_id: companyId, module_code: moduleCode } },
    });
    const now = new Date();
    if (!entitlement?.enabled || !entitlement.allow_read
      || (entitlement.effective_from && entitlement.effective_from > now)
      || (entitlement.effective_until && entitlement.effective_until < now)) {
      throw new ForbiddenError(`Aktifkan entitlement ${moduleCode} untuk company sebelum membuat role profile.`);
    }

    const profile = await prisma.$transaction(async (tx) => {
      const saved = await (tx as any).iam_module_role_profile.upsert({
        where: { company_id_module_code_profile_code: { company_id: companyId, module_code: moduleCode, profile_code: profileCode } },
        update: { display_name: displayName, description, legacy_role_code: legacyRoleCode, is_active: req.body.is_active !== false },
        create: {
          tenant_id: tenantId,
          company_id: companyId,
          module_code: moduleCode,
          profile_code: profileCode,
          display_name: displayName,
          description,
          legacy_role_code: legacyRoleCode,
          is_active: true,
          created_by_id: req.user?.id || null,
        },
      });
      await (tx as any).iam_module_role_capability.deleteMany({ where: { profile_id: saved.id } });
      await (tx as any).iam_module_role_capability.createMany({
        data: capabilityCodes.map((capability_code: string) => ({
          tenant_id: tenantId,
          company_id: companyId,
          profile_id: saved.id,
          capability_code,
          effect: 'ALLOW',
        })),
      });
      return (tx as any).iam_module_role_profile.findUnique({
        where: { id: saved.id },
        include: { capabilities: true },
      });
    });
    res.json({ success: true, profile });
  } catch (err) {
    next(err);
  }
}

async function assignModuleRoleProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const companyId = req.companyId || String(req.header('X-Company-ID') || req.body.company_id || '').trim();
    const tenantId = req.user?.tenant_id;
    const userId = String(req.body.user_id || '').trim();
    const profileId = String(req.body.profile_id || '').trim();
    const scope = String(req.body.data_scope || 'OWN').trim().toUpperCase();
    const scopeResourceIds = Array.isArray(req.body.scope_resource_ids)
      ? [...new Set(req.body.scope_resource_ids.map((id: unknown) => String(id || '').trim()).filter(Boolean))]
      : [];
    const allowedScopes = new Set(['OWN', 'TEAM', 'ALL', 'DEPARTMENT', 'DIVISION', 'PROJECT', 'WAREHOUSE']);
    if (!companyId || !tenantId || !userId || !profileId || !allowedScopes.has(scope)) {
      throw new ValidationError('company, user_id, profile_id, dan data_scope harus valid.');
    }

    const profile = await (prisma as any).iam_module_role_profile.findFirst({
      where: { id: profileId, company_id: companyId, tenant_id: tenantId, is_active: true },
      include: { capabilities: true },
    });
    if (!profile) throw new NotFoundError('Role profile aktif tidak ditemukan pada company ini.');
    const entitlement = await prisma.iam_company_module_access.findUnique({
      where: { company_id_module_code: { company_id: companyId, module_code: profile.module_code } },
    });
    const now = new Date();
    if (!entitlement?.enabled || !entitlement.allow_read
      || (entitlement.effective_from && entitlement.effective_from > now)
      || (entitlement.effective_until && entitlement.effective_until < now)) {
      throw new ForbiddenError(`Entitlement ${profile.module_code} tidak aktif; assignment tidak dapat dibuat.`);
    }
    const membership = await prisma.iam_user_company_membership.findFirst({
      where: { company_id: companyId, tenant_id: tenantId, user_id: userId, status: 'ACTIVE' },
    });
    if (!membership) throw new ForbiddenError('User bukan anggota aktif company ini.');

    const effectiveFrom = req.body.effective_from ? new Date(req.body.effective_from) : now;
    const effectiveUntil = req.body.effective_until ? new Date(req.body.effective_until) : null;
    if (Number.isNaN(effectiveFrom.getTime()) || (effectiveUntil && Number.isNaN(effectiveUntil.getTime()))
      || (effectiveUntil && effectiveUntil <= effectiveFrom)) {
      throw new ValidationError('Periode assignment tidak valid.');
    }
    const record = await prisma.$transaction(async (tx) => {
      const assignment = await (tx as any).iam_user_module_assignment.create({
        data: {
          tenant_id: tenantId,
          company_id: companyId,
          user_id: userId,
          module_code: profile.module_code,
          profile_id: profile.id,
          profile_code: profile.profile_code,
          tier_level: Number(req.body.tier_level ?? 3),
          position_title: String(req.body.position_title || profile.display_name).trim(),
          department_id: req.body.department_id || null,
          reports_to_user_id: req.body.reports_to_user_id || null,
          data_scope: scope,
          scope_resource_ids: scopeResourceIds,
          status: 'ACTIVE',
          is_primary: Boolean(req.body.is_primary),
          effective_from: effectiveFrom,
          effective_until: effectiveUntil,
          created_by_id: req.user?.id || null,
        },
      });
      await (tx as any).iam_assignment_history.create({
        data: {
          tenant_id: tenantId,
          company_id: companyId,
          actor_id: req.user?.id || null,
          target_user_id: userId,
          module_code: profile.module_code,
          change_type: 'ASSIGNED',
          before_json: '{}',
          after_json: JSON.stringify({ profile_code: profile.profile_code, data_scope: scope, scope_resource_ids: scopeResourceIds, effective_from: effectiveFrom, effective_until: effectiveUntil }),
          reason: String(req.body.reason || 'Penetapan role profile per modul').trim(),
        },
      });
      return assignment;
    });
    res.json({ success: true, assignment: record });
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
    const description = req.body.description !== undefined ? String(req.body.description || '').trim() : '';

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
            description,
            is_active: true,
          },
        });

    const existingPerm = await (prisma as any).iam_module_tier_permission.findFirst({
      where: {
        company_id: companyId,
        module_code: moduleCode,
        tier_level: tierLevel,
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

    const entitlement = await prisma.iam_company_module_access.findUnique({
      where: { company_id_module_code: { company_id: companyId, module_code: moduleCode } },
    });
    if (!entitlement?.enabled || !entitlement.allow_read) {
      throw new ForbiddenError(`Entitlement ${moduleCode || 'modul'} tidak aktif; assignment tidak dapat dibuat.`);
    }
    if (String((entitlement as any).access_mode || 'LEGACY').toUpperCase() === 'ASSIGNMENT') {
      throw new ValidationError('Gunakan endpoint role profile modul; assignment tier legacy tidak berlaku pada modul ini.');
    }

    if (!userId || !moduleCode || ![0, 1, 2, 3].includes(tierLevel)) {
      throw new ValidationError('user_id, module_code, dan tier_level (0=GM, 1=Head, 2=SPV, 3=Staff) wajib valid.');
    }

    const positionTitle = req.body.position_title ? String(req.body.position_title).trim() : '';
    const departmentId = req.body.department_id ? String(req.body.department_id).trim() : null;
    const reportsToUserId = req.body.reports_to_user_id ? String(req.body.reports_to_user_id).trim() : null;
    const dataScope = String(req.body.data_scope || (tierLevel <= 1 ? 'ALL_MODULE' : tierLevel === 2 ? 'TEAM' : 'OWN')).trim().toUpperCase();
    const status = String(req.body.status || 'ACTIVE').trim().toUpperCase();
    const isPrimary = req.body.is_primary !== undefined
      ? Boolean(req.body.is_primary)
      : Boolean(req.body.is_primary_position);

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
            is_primary: isPrimary,
            effective_until: req.body.effective_until ? new Date(req.body.effective_until) : null,
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
            is_primary: isPrimary,
            effective_from: req.body.effective_from ? new Date(req.body.effective_from) : new Date(),
            effective_until: req.body.effective_until ? new Date(req.body.effective_until) : null,
            created_by_id: req.user?.id || null,
          },
        });

    await (prisma as any).iam_assignment_history.create({
      data: {
        tenant_id: tenantId,
        company_id: companyId,
        actor_id: req.user?.id || null,
        target_user_id: userId,
        module_code: moduleCode,
        change_type: existing ? (existing.tier_level !== tierLevel ? 'TIER_CHANGE' : 'UPDATED') : 'ASSIGNED',
        before_json: existing
          ? JSON.stringify({ tier_level: existing.tier_level, position_title: existing.position_title, data_scope: existing.data_scope })
          : '{}',
        after_json: JSON.stringify({ tier_level: tierLevel, position_title: positionTitle, data_scope: dataScope }),
        reason: req.body.reason ? String(req.body.reason).trim() : 'Penugasan struktur modul 3-tingkat',
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
    if (!companyId) throw new ForbiddenError('Pilih company terlebih dahulu.');

    const { id } = req.params;
    const existing = await (prisma as any).iam_user_module_assignment.findFirst({
      where: { id, company_id: companyId },
    });
    if (!existing) {
      throw new ValidationError('Penugasan modul tidak ditemukan pada company aktif.');
    }

    await (prisma as any).iam_user_module_assignment.delete({ where: { id: existing.id } });
    // Also revoke any direct delegated module override (iam_user_module_access) for this user+module
    if (!existing.profile_id) {
      await prisma.iam_user_module_access.deleteMany({
        where: {
          company_id: existing.company_id,
          user_id: existing.user_id,
          module_code: existing.module_code,
        },
      });
    }
    await (prisma as any).iam_assignment_history.create({
      data: {
        tenant_id: tenantId || existing.tenant_id,
        company_id: existing.company_id,
        actor_id: req.user?.id || null,
        target_user_id: existing.user_id,
        module_code: existing.module_code,
        change_type: 'REVOKED',
        before_json: JSON.stringify({
          tier_level: existing.tier_level,
          position_title: existing.position_title,
          data_scope: existing.data_scope,
        }),
        after_json: '{}',
        reason: 'Penghapusan penugasan modul',
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

    const userId = String(req.body.user_id || req.user?.id || '').trim();
    const sourceModuleCode = String(req.body.source_module_code || req.body.source_module || '').trim().toUpperCase();
    const targetModuleCode = String(req.body.target_module_code || req.body.target_module || '').trim().toUpperCase();
    const capabilityCode = String(req.body.capability_code || '').trim().toUpperCase();

    if (!userId || !sourceModuleCode || !targetModuleCode || !capabilityCode) {
      throw new ValidationError('user_id, source_module_code, target_module_code, dan capability_code wajib diisi.');
    }

    const actionsArray: string[] = Array.isArray(req.body.allowed_actions)
      ? req.body.allowed_actions.map((a: unknown) => String(a).toUpperCase())
      : [
          ...(req.body.allow_read !== false ? ['READ'] : []),
          ...(req.body.allow_action ? ['ACTION'] : []),
        ];
    const allowedActionsJson = JSON.stringify(actionsArray);
    const status = String(req.body.status || 'ACTIVE').trim().toUpperCase();

    const existing = await (prisma as any).iam_cross_module_capability.findFirst({
      where: {
        company_id: companyId,
        user_id: userId,
        source_module_code: sourceModuleCode,
        target_module_code: targetModuleCode,
        capability_code: capabilityCode,
      },
    });

    const record = existing
      ? await (prisma as any).iam_cross_module_capability.update({
          where: { id: existing.id },
          data: {
            allowed_actions: allowedActionsJson,
            status,
          },
        })
      : await (prisma as any).iam_cross_module_capability.create({
          data: {
            tenant_id: tenantId,
            company_id: companyId,
            user_id: userId,
            source_module_code: sourceModuleCode,
            target_module_code: targetModuleCode,
            capability_code: capabilityCode,
            allowed_actions: allowedActionsJson,
            status,
            created_by_id: req.user?.id || null,
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
    const rawMaxAmount = req.body.max_amount ?? req.body.max_approval_amount ?? 0;

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
        max_amount: Number(rawMaxAmount) || 0,
        reason: req.body.reason ? String(req.body.reason).trim() : 'Delegasi persetujuan sementara (DoA)',
        valid_from: req.body.valid_from ? new Date(req.body.valid_from) : new Date(),
        valid_until: validUntil,
        created_by_id: req.user?.id || null,
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
    const companyId = req.companyId || String(req.header('X-Company-ID') || '').trim();
    if (!companyId) throw new ForbiddenError('Pilih company terlebih dahulu.');

    const { id } = req.params;
    const existing = await (prisma as any).iam_approval_delegation.findFirst({
      where: { id, company_id: companyId },
    });
    if (!existing) {
      throw new ValidationError('Delegasi persetujuan tidak ditemukan pada company aktif.');
    }

    const record = await (prisma as any).iam_approval_delegation.update({
      where: { id: existing.id },
      data: {
        revoked_at: new Date(),
      },
    });
    res.json({ success: true, delegation: record });
  } catch (err) {
    next(err);
  }
}

async function getDashboardWidgetCatalogHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    await ensureModuleHierarchyTables();
    res.json({
      success: true,
      widgets: DASHBOARD_WIDGET_CATALOG,
      presets: QUICK_ACCESS_PRESETS,
    });
  } catch (err) {
    next(err);
  }
}

async function getUserQuickAccessHandler(req: Request, res: Response, next: NextFunction) {
  try {
    await ensureModuleHierarchyTables();
    const companyId = req.companyId || String(req.header('X-Company-ID') || '').trim();
    if (!companyId) throw new ForbiddenError('Pilih company terlebih dahulu.');
    const { userId } = req.params;
    const data = await getUserQuickAccess(companyId, userId);
    res.json({ success: true, ...data });
  } catch (err) {
    next(err);
  }
}

async function putUserQuickAccessHandler(req: Request, res: Response, next: NextFunction) {
  try {
    await ensureModuleHierarchyTables();
    const companyId = req.companyId || String(req.header('X-Company-ID') || '').trim();
    if (!companyId) throw new ForbiddenError('Pilih company terlebih dahulu.');
    const { userId } = req.params;

    const result = await syncUserQuickAccess({
      companyId,
      tenantId: req.tenantId || req.user?.tenant_id || null,
      actorId: req.user?.id || null,
      userId,
      departmentId: req.body.department_id,
      roleLevel: req.body.role_level,
      reportsToUserId: req.body.reports_to_user_id,
      jobTitle: req.body.job_title,
      presetKey: req.body.preset_key,
      modules: Array.isArray(req.body.modules) ? req.body.modules : undefined,
      dashboardWidgets: Array.isArray(req.body.dashboard_widgets)
        ? req.body.dashboard_widgets
        : undefined,
      reason: req.body.reason,
    });

    invalidateDashboardCache();
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

function mountAccountResources(router: Router) {
  router.get('/dashboard-widget-catalog', getDashboardWidgetCatalogHandler);
  router.get('/users/:userId/quick-access', requireCompanyAdmin, getUserQuickAccessHandler);
  router.put('/users/:userId/quick-access', requireCompanyAdmin, requireCompanyContextForWrite, putUserQuickAccessHandler);
  router.get('/module-hierarchy', getModuleHierarchy);
  router.post('/module-role-profiles', requireCompanyAdmin, requireCompanyContextForWrite, upsertModuleRoleProfile);
  router.post('/module-role-assignments', requireCompanyAdmin, requireCompanyContextForWrite, assignModuleRoleProfile);
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
