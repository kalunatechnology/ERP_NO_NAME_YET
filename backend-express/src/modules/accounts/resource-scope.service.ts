/**
 * File: backend-express/src/modules/accounts/resource-scope.service.ts
 *
 * Purpose: Implements domain service responsibilities for the accounts domain.
 * Responsibility: Defines the executable contracts in this file and connects them to their callers without owning unrelated domain behavior.
 * Integration: Used through static imports, Express/Next framework discovery, or an explicit npm/script entry point as applicable.
 * Dependencies and side effects: See each documented function; database, browser storage, network, and response mutations are called out where present.
 */
import { Request } from 'express';
import prisma from '../../config/database';
import { ForbiddenError } from '../../utils/errors';
import { isSuperAdmin } from '../../types/roles';

type ScopeWhere = Record<string, unknown>;

const GLOBAL_REFERENCE_MODELS = new Set([
  'iam_permission',
  'master_currency',
]);

/**
 * denyAll implements a named function within this file's domain service boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: No database operation is implied unless explicitly present in the implementation.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
function denyAll(fields: ReadonlySet<string>): ScopeWhere {
  return fields.has('id') ? { id: { in: [] } } : { AND: [{ OR: [] }] };
}

/**
 * accessibleProjectIds implements a named function within this file's domain service boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: Reads or mutates Prisma model(s) `project_project`; transaction boundaries are exactly those visible in the body.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
async function accessibleProjectIds(req: Request): Promise<string[]> {
  const superAdmin = isSuperAdmin(req.user?.roles ?? []);
  const rows = await prisma.project_project.findMany({
    where: {
      ...(!superAdmin && req.user?.tenant_id ? { tenant_id: req.user.tenant_id } : {}),
      ...(req.companyId ? { company_id: req.companyId } : {}),
    },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

/**
 * idsForProjectHierarchy implements a named function within this file's domain service boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: Reads or mutates Prisma model(s) `project_main_task`, `project_weekly_task`, `project_daily_task`; transaction boundaries are exactly those visible in the body.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
async function idsForProjectHierarchy(
  req: Request,
  field: 'main_task_id' | 'weekly_task_id' | 'daily_task_id',
): Promise<string[]> {
  const projectIds = await accessibleProjectIds(req);
  const mainTasks = await prisma.project_main_task.findMany({
    where: { project_id: { in: projectIds } },
    select: { id: true },
  });
  if (field === 'main_task_id') return mainTasks.map((row) => row.id);

  const weeklyTasks = await prisma.project_weekly_task.findMany({
    where: { main_task_id: { in: mainTasks.map((row) => row.id) } },
    select: { id: true },
  });
  if (field === 'weekly_task_id') return weeklyTasks.map((row) => row.id);

  const dailyTasks = await prisma.project_daily_task.findMany({
    where: { weekly_task_id: { in: weeklyTasks.map((row) => row.id) } },
    select: { id: true },
  });
  return dailyTasks.map((row) => row.id);
}

/**
 * buildResourceScope implements a named function within this file's domain service boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: Reads or mutates Prisma model(s) `iam_user_role`; transaction boundaries are exactly those visible in the body.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
export async function buildResourceScope(
  req: Request,
  modelName: string,
  fields: ReadonlySet<string>,
): Promise<ScopeWhere> {
  const user = req.user!;
  const scope: ScopeWhere = {};

  if (modelName === 'core_tenant') {
    if (isSuperAdmin(user.roles)) return {};
    return user.tenant_id ? { id: user.tenant_id } : { id: { in: [] } };
  }

  if (modelName === 'core_company') {
    if (isSuperAdmin(user.roles)) return {};
    if (user.tenant_id) scope['tenant_id'] = user.tenant_id;
    if (req.companyId) scope['id'] = req.companyId;
    return scope;
  }

  if (modelName === 'iam_role') {
    if (isSuperAdmin(user.roles)) return {};
    return user.tenant_id
      ? { tenant_id: user.tenant_id, OR: [{ company_id: null }, { company_id: req.companyId }] }
      : denyAll(fields);
  }

  if (modelName === 'iam_user' && req.companyId) {
    const memberships = await prisma.iam_user_role.findMany({
      where: { company_id: req.companyId },
      select: { user_id: true },
    });
    scope['id'] = {
      in: [...new Set(memberships.map((row) => row.user_id).filter((id): id is string => Boolean(id)))],
    };
    if (user.tenant_id) scope['tenant_id'] = user.tenant_id;
    return scope;
  }

  if (GLOBAL_REFERENCE_MODELS.has(modelName)) {
    return scope;
  }

  if (isSuperAdmin(user.roles) && !req.companyId) return {};

  if (fields.has('tenant_id') && user.tenant_id && !isSuperAdmin(user.roles)) scope['tenant_id'] = user.tenant_id;
  if (fields.has('company_id') && req.companyId) scope['company_id'] = req.companyId;

  if (!fields.has('company_id')) {
    if (fields.has('project_id')) {
      scope['project_id'] = { in: await accessibleProjectIds(req) };
    } else if (fields.has('main_task_id')) {
      scope['main_task_id'] = { in: await idsForProjectHierarchy(req, 'main_task_id') };
    } else if (fields.has('weekly_task_id')) {
      scope['weekly_task_id'] = { in: await idsForProjectHierarchy(req, 'weekly_task_id') };
    } else if (fields.has('daily_task_id')) {
      scope['daily_task_id'] = { in: await idsForProjectHierarchy(req, 'daily_task_id') };
    }
  }

  const hasCompanyPath = fields.has('company_id') || [
    'project_id',
    'main_task_id',
    'weekly_task_id',
    'daily_task_id',
  ].some((field) => fields.has(field));

  if (!hasCompanyPath) {
    if (isSuperAdmin(user.roles) && !req.companyId) return scope;
    return denyAll(fields);
  }

  return scope;
}

/**
 * valueAllowed implements a named function within this file's domain service boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: No database operation is implied unless explicitly present in the implementation.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
function valueAllowed(rule: unknown, value: unknown): boolean {
  if (rule && typeof rule === 'object' && 'in' in rule) {
    return Array.isArray((rule as { in: unknown[] }).in) && (rule as { in: unknown[] }).in.includes(value);
  }
  return rule === value;
}

/**
 * applyAndValidateWriteScope implements a named function within this file's domain service boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: No database operation is implied unless explicitly present in the implementation.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
export async function applyAndValidateWriteScope(
  req: Request,
  modelName: string,
  fields: ReadonlySet<string>,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const data = { ...input };
  const user = req.user!;
  const hasCompanyPath = fields.has('company_id') || [
    'project_id',
    'main_task_id',
    'weekly_task_id',
    'daily_task_id',
  ].some((field) => fields.has(field));

  if (
    !isSuperAdmin(user.roles) &&
    !hasCompanyPath &&
    !['core_tenant', 'core_company', 'iam_user', 'iam_role'].includes(modelName)
  ) {
    throw new ForbiddenError(`Model ${modelName} belum memiliki jalur scope company yang tervalidasi.`);
  }

  if (fields.has('tenant_id') && user.tenant_id) data['tenant_id'] = user.tenant_id;
  if (fields.has('company_id')) {
    if (!req.companyId && modelName !== 'core_company') {
      throw new ForbiddenError('Pilih satu company sebelum melakukan perubahan data.');
    }
    if (req.companyId) data['company_id'] = req.companyId;
  }

  const scope = await buildResourceScope(req, modelName, fields);
  for (const [field, rule] of Object.entries(scope)) {
    if (field === 'id' || data[field] === undefined) continue;
    if (!valueAllowed(rule, data[field])) {
      throw new ForbiddenError(`Relasi ${field} berada di luar scope company user.`);
    }
  }

  if (!isSuperAdmin(user.roles) && !req.companyId) {
    throw new ForbiddenError('User belum memiliki company aktif.');
  }
  return data;
}
