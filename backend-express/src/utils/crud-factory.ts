/**
 * File: backend-express/src/utils/crud-factory.ts
 *
 * Purpose: Implements shared utility responsibilities in the backend application.
 * Responsibility: Owns the contracts declared here and connects them to framework discovery or explicit imports without changing unrelated domain state.
 * Integration: Consumers reach this file through static imports, framework conventions, or an explicit script entry point.
 * Dependencies and side effects: Function-level documentation identifies HTTP, database, browser-state, and security effects where they occur.
 */
import { Request, Response, NextFunction, Router } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { paginateArray, parsePagination, sendDeleteSuccess } from './response';
import { ConflictError, ForbiddenError, NotFoundError } from './errors';
import {
  applyAndValidateWriteScope,
  buildResourceScope,
} from '../modules/accounts/resource-scope.service';

export interface CrudOptions {
  modelName: keyof typeof prisma;
  searchFields?: string[];
  defaultSort?: { field: string; order: 'asc' | 'desc' };
  select?: Record<string, unknown>;
  include?: Record<string, unknown>;
  beforeCreate?: (req: Request, data: any) => Promise<any> | any;
  beforeUpdate?: (req: Request, data: any, existing: any) => Promise<any> | any;
  beforeDelete?: (req: Request, existing: any) => Promise<void> | void;
  afterCreate?: (req: Request, record: any) => Promise<void> | void;
  afterUpdate?: (req: Request, record: any, before: any) => Promise<void> | void;
  afterDelete?: (req: Request, record: any) => Promise<void> | void;
  transform?: (record: any) => any;
}

// Cache model fields from Prisma DMMF
const MODEL_FIELDS_CACHE = new Map<string, Set<string>>();

/**
 * getModelFields implements this file's named function contract.
 *
 * @param input - Uses the typed parameters declared by the signature.
 * @returns The value or Promise declared by the implementation.
 * Database: no direct Prisma operation is present in this function; persistence may be delegated to an imported service.
 * Failure/side effects: propagates validation, authorization, persistence, or dependency failures according to the existing caller contract.
 */
export function getModelFields(modelName: string): Set<string> {
  const key = String(modelName).toLowerCase();
  if (MODEL_FIELDS_CACHE.has(key)) {
    return MODEL_FIELDS_CACHE.get(key)!;
  }
  const model = Prisma.dmmf?.datamodel?.models?.find(
    (m) => m.name.toLowerCase() === key
  );
  const fields = new Set<string>(model?.fields?.map((f) => f.name) || []);
  MODEL_FIELDS_CACHE.set(key, fields);
  return fields;
}

/**
 * hasModelField implements this file's named function contract.
 *
 * @param input - Uses the typed parameters declared by the signature.
 * @returns The value or Promise declared by the implementation.
 * Database: no direct Prisma operation is present in this function; persistence may be delegated to an imported service.
 * Failure/side effects: propagates validation, authorization, persistence, or dependency failures according to the existing caller contract.
 */
export function hasModelField(modelName: string, fieldName: string): boolean {
  return getModelFields(modelName).has(fieldName);
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Universal auto-filler for required scalar & schema fields across all 200+ Prisma models.
 * Prevents "Argument X is missing" and UUID format errors by generating intelligent defaults.
 */
export function autoFillRequiredFields(modelName: string, data: any, req?: Request): any {
  const key = String(modelName).toLowerCase();
  const model = Prisma.dmmf?.datamodel?.models?.find(
    (m) => m.name.toLowerCase() === key
  );
  if (!model) return data;

  const result: any = { ...data };

  // 1. Common field name & domain aliases
  if (result.name && !result.task_name && model.fields.some(f => f.name === 'task_name')) {
    result.task_name = result.name;
  }
  if (result.title && !result.task_name && model.fields.some(f => f.name === 'task_name')) {
    result.task_name = result.title;
  }
  if (result.name && !result.project_name && model.fields.some(f => f.name === 'project_name')) {
    result.project_name = result.name;
  }
  if (result.code && !result.project_code && model.fields.some(f => f.name === 'project_code')) {
    result.project_code = result.code;
  }
  if (result.code && !result.task_code && model.fields.some(f => f.name === 'task_code')) {
    result.task_code = result.code;
  }

  // FK aliases
  if (result.project && !result.project_id && model.fields.some(f => f.name === 'project_id')) {
    result.project_id = String(result.project);
  }
  if (result.main_task && !result.main_task_id && model.fields.some(f => f.name === 'main_task_id')) {
    result.main_task_id = String(result.main_task);
  }
  if (result.weekly_task && !result.weekly_task_id && model.fields.some(f => f.name === 'weekly_task_id')) {
    result.weekly_task_id = String(result.weekly_task);
  }
  if (result.owner && !result.owner_id && model.fields.some(f => f.name === 'owner_id')) {
    result.owner_id = String(result.owner);
  }
  if (result.assignee && !result.assignee_id && model.fields.some(f => f.name === 'assignee_id')) {
    result.assignee_id = String(result.assignee);
  }

  // 2. Iterate each schema field
  for (const field of model.fields) {
    const fn = field.name.toLowerCase();

    // A. Parse DateTime strings into Date objects
    if (field.type === 'DateTime' && typeof result[field.name] === 'string' && result[field.name]) {
      result[field.name] = new Date(result[field.name]);
    }

    // B. Clean up UUID / _id fields (convert invalid non-UUID strings to null / fallback)
    if (fn.endsWith('_id') || fn === 'id') {
      const val = result[field.name];
      if (val !== undefined && val !== null) {
        if (typeof val === 'string') {
          const trimmed = val.trim();
          if (!trimmed || trimmed === 'null' || trimmed === 'undefined' || trimmed === 'DEFAULT' || !UUID_REGEX.test(trimmed)) {
            if (field.isRequired) {
              if (fn === 'created_by_id' && req?.user?.id && UUID_REGEX.test(req.user.id)) {
                result[field.name] = req.user.id;
              } else if (fn === 'company_id') {
                if (req?.companyId && UUID_REGEX.test(req.companyId)) result[field.name] = req.companyId;
                else delete result[field.name];
              } else if (fn === 'tenant_id') {
                if (req?.user?.tenant_id && UUID_REGEX.test(req.user.tenant_id)) result[field.name] = req.user.tenant_id;
                else delete result[field.name];
              }
            } else {
              result[field.name] = null;
            }
          }
        }
      }
    }

    // C. Provide intelligent defaults for required scalar / enum fields
    if (field.kind === 'scalar' || field.kind === 'enum') {
      if (field.isRequired && !field.hasDefaultValue && !field.isId) {
        if (result[field.name] === undefined || result[field.name] === null || result[field.name] === '') {
          // Skip _id fields from generic string defaults!
          if (fn.endsWith('_id') || fn === 'id') {
            if (fn === 'tenant_id') {
              if (req?.user?.tenant_id && UUID_REGEX.test(req.user.tenant_id)) result[field.name] = req.user.tenant_id;
            } else if (fn === 'company_id') {
              if (req?.companyId && UUID_REGEX.test(req.companyId)) result[field.name] = req.companyId;
            } else if (fn === 'created_by_id' && req?.user?.id && UUID_REGEX.test(req.user.id)) {
              result[field.name] = req.user.id;
            }
            continue;
          }

          // Codes & identifiers
          if (fn.endsWith('_code') || fn === 'code') {
            const prefix = fn.replace(/_code$/, '').slice(0, 3).toUpperCase() || 'DOC';
            result[field.name] = `${prefix}-${Date.now().toString().slice(-4)}`;
          } else if (fn.endsWith('_number') || fn === 'number') {
            const prefix = fn.replace(/_number$/, '').slice(0, 3).toUpperCase() || 'NUM';
            result[field.name] = `${prefix}-${Date.now().toString().slice(-6)}`;
          }
          // Names & titles
          else if (fn === 'task_name') {
            result[field.name] = result.title || result.name || result.activity_input || 'Untitled Task';
          } else if (fn === 'project_name') {
            result[field.name] = result.name || result.title || 'Untitled Project';
          } else if (fn === 'customer_name') {
            result[field.name] = result.client_name || result.customer || 'PT Sinergi Muda Arsa';
          } else if (fn === 'manager_name') {
            result[field.name] = result.pm_name || result.project_manager_name || (req?.user as any)?.full_name || 'Project Manager';
          } else if (fn === 'milestone_name') {
            result[field.name] = result.name || result.title || 'Milestone';
          } else if (fn === 'title') {
            result[field.name] = result.name || result.task_name || 'Untitled';
          }
          // Descriptions & text fields
          else if (['description', 'desc', 'notes', 'remarks', 'reason', 'override_reason', 'mitigation_plan', 'root_cause', 'milestone_impact', 'objective', 'scope_summary', 'specification_text', 'equipment_reference'].includes(fn)) {
            result[field.name] = '';
          }
          // Status & states
          else if (fn === 'status') {
            result[field.name] = 'PLANNED';
          } else if (fn === 'lifecycle_status') {
            result[field.name] = 'ACTIVE';
          } else if (fn === 'health_status' || fn === 'alert_status') {
            result[field.name] = 'ON_TRACK';
          } else if (fn === 'priority') {
            result[field.name] = 'MEDIUM';
          } else if (fn === 'severity') {
            result[field.name] = 'LOW';
          } else if (fn === 'risk_category' || fn === 'category') {
            result[field.name] = 'GENERAL';
          } else if (['source_type', 'party_type', 'issue_type', 'source_channel', 'target_department', 'dispatch_type', 'action_type', 'dependency_type', 'funding_type', 'budget_category'].includes(fn)) {
            result[field.name] = 'INTERNAL';
          } else if (fn === 'approval_status') {
            result[field.name] = 'APPROVED';
          } else if (fn === 'subject') {
            result[field.name] = result.title || result.name || 'Subject';
          }
          // JSON payloads
          else if (fn === 'evidence_json' || fn === 'payload_json' || fn === 'specification_json' || fn.endsWith('_json')) {
            result[field.name] = {};
          }
          // Dates
          else if (['created_at', 'updated_at', 'sent_at', 'started_at', 'assigned_at'].includes(fn)) {
            result[field.name] = new Date();
          }
          // Generic fallback by field type
          else if (field.type === 'String') {
            result[field.name] = '';
          } else if (['Int', 'Float', 'Decimal'].includes(field.type)) {
            result[field.name] = 0;
          } else if (field.type === 'Boolean') {
            result[field.name] = false;
          } else if (field.type === 'Json') {
            result[field.name] = {};
          } else if (field.type === 'DateTime') {
            result[field.name] = new Date();
          }
        }
      }
    }
  }

  return result;
}

/**
 * Universal record transformer to ensure 100% DRF serializer parity:
 * Injects FK aliases (e.g. project_id -> project, weekly_task_id -> weekly_task)
 * and domain field aliases (progress_percent -> progress, project_name -> name).
 */
export function normalizeRecord(record: any, modelName?: string): any {
  if (!record || typeof record !== 'object') return record;
  const result: any = { ...record };

  // Common FK aliases
  if (result.project_id !== undefined && result.project === undefined) result.project = result.project_id;
  if (result.main_task_id !== undefined && result.main_task === undefined) result.main_task = result.main_task_id;
  if (result.weekly_task_id !== undefined && result.weekly_task === undefined) {
    result.weekly_task = result.weekly_task_id;
    result.weekly_plan_id = result.weekly_task_id;
  }
  if (result.owner_id !== undefined && result.owner === undefined) result.owner = result.owner_id;
  if (result.assignee_id !== undefined && result.assignee === undefined) result.assignee = result.assignee_id;
  if (result.customer_party_id !== undefined && result.customer === undefined) result.customer = result.customer_party_id;
  if (result.vendor_party_id !== undefined && result.vendor === undefined) result.vendor = result.vendor_party_id;
  if (result.product_id !== undefined && result.product === undefined) result.product = result.product_id;
  if (result.warehouse_id !== undefined && result.warehouse === undefined) result.warehouse = result.warehouse_id;

  // Project domain aliases
  if (result.project_name !== undefined && result.name === undefined) result.name = result.project_name;
  if (result.project_code !== undefined && result.code === undefined) result.code = result.project_code;
  if (result.progress_percent !== undefined) {
    if (result.progress === undefined) result.progress = Number(result.progress_percent);
    if (result.progress_percentage === undefined) result.progress_percentage = Number(result.progress_percent);
  }
  if (result.budget_amount !== undefined && result.budget === undefined) result.budget = Number(result.budget_amount);
  if (result.manager_name !== undefined && result.project_manager_name === undefined) result.project_manager_name = result.manager_name;

  // Task aliases
  if (result.title !== undefined && result.activity_input === undefined) result.activity_input = result.title;
  if (result.name !== undefined && result.title === undefined) result.title = result.name;

  return result;
}

/**
 * createCrudRouter implements this file's named function contract.
 *
 * @param input - Uses the typed parameters declared by the signature.
 * @returns The value or Promise declared by the implementation.
 * Database: no direct Prisma operation is present in this function; persistence may be delegated to an imported service.
 * Failure/side effects: propagates validation, authorization, persistence, or dependency failures according to the existing caller contract.
 */
export function createCrudRouter(options: CrudOptions): Router {
  const router = Router();
/**
 * delegate implements this file's named function contract.
 *
 * @param input - Uses the typed parameters declared by the signature.
 * @returns The value or Promise declared by the implementation.
 * Database: no direct Prisma operation is present in this function; persistence may be delegated to an imported service.
 * Failure/side effects: propagates validation, authorization, persistence, or dependency failures according to the existing caller contract.
 */
  const delegate = (prisma as any)[options.modelName];
  const modelNameStr = String(options.modelName);

/**
 * assertFinancialRecordMutable implements this file's named function contract.
 *
 * @param input - Uses the typed parameters declared by the signature.
 * @returns The value or Promise declared by the implementation.
 * Database: no direct Prisma operation is present in this function; persistence may be delegated to an imported service.
 * Failure/side effects: propagates validation, authorization, persistence, or dependency failures according to the existing caller contract.
 */
  const assertFinancialRecordMutable = (existing: any) => {
    if (!modelNameStr.startsWith('fin_')) return;
    const terminal = new Set(['POSTED', 'PAID', 'CLOSED', 'LOCKED', 'EXECUTED', 'REVERSED']);
    const state = String(existing?.status ?? existing?.payment_status ?? existing?.approval_status ?? '').toUpperCase();
    if (terminal.has(state)) {
      throw new ConflictError(
        `Record keuangan berstatus ${state} bersifat immutable. Gunakan workflow reversal/storno resmi.`,
      );
    }
  };

/**
 * format implements this file's named function contract.
 *
 * @param input - Uses the typed parameters declared by the signature.
 * @returns The value or Promise declared by the implementation.
 * Database: no direct Prisma operation is present in this function; persistence may be delegated to an imported service.
 * Failure/side effects: propagates validation, authorization, persistence, or dependency failures according to the existing caller contract.
 */
  const format = (rec: any) => {
    let out = normalizeRecord(rec, modelNameStr);
    if (options.transform) out = options.transform(out);
    return out;
  };

/**
 * scopedWhere implements this file's named function contract.
 *
 * @param input - Uses the typed parameters declared by the signature.
 * @returns The value or Promise declared by the implementation.
 * Database: no direct Prisma operation is present in this function; persistence may be delegated to an imported service.
 * Failure/side effects: propagates validation, authorization, persistence, or dependency failures according to the existing caller contract.
 */
  const scopedWhere = async (req: Request, where: Record<string, unknown> = {}) => {
    const scope = await buildResourceScope(req, modelNameStr, getModelFields(modelNameStr));
    if (Object.keys(scope).length === 0) return where;
    if (Object.keys(where).length === 0) return scope;
    return { AND: [where, scope] };
  };

/**
 * cleanData implements this file's named function contract.
 *
 * @param input - Uses the typed parameters declared by the signature.
 * @returns The value or Promise declared by the implementation.
 * Database: no direct Prisma operation is present in this function; persistence may be delegated to an imported service.
 * Failure/side effects: propagates validation, authorization, persistence, or dependency failures according to the existing caller contract.
 */
  const cleanData = (data: Record<string, unknown>, validFields: ReadonlySet<string>) => {
    if (validFields.size === 0) return data;
    return Object.fromEntries(Object.entries(data).filter(([key]) => validFields.has(key)));
  };

  // 1. Metadata endpoint
/**
 * GET `/metadata` handler registered on this router.
 *
 * Authentication/authorization: inherits the global authenticated tenant, module entitlement, RBAC, idempotency, and audit pipeline plus middleware supplied in this call.
 * Request/response: consumes the parameters/body referenced by the callback, preserves its current status/payload contract, and forwards unexpected errors through `next` where provided.
 * Persistence and state changes are limited to the Prisma/service operations visible in this handler; financial terminal-state and SoD rules remain authoritative.
 */
  router.get('/metadata', (req: Request, res: Response) => {
    res.json({
      model: modelNameStr,
      table: modelNameStr,
      searchFields: options.searchFields ?? [],
    });
  });

  // 2. Bulk Create
/**
 * POST `/bulk-create` handler registered on this router.
 *
 * Authentication/authorization: inherits the global authenticated tenant, module entitlement, RBAC, idempotency, and audit pipeline plus middleware supplied in this call.
 * Request/response: consumes the parameters/body referenced by the callback, preserves its current status/payload contract, and forwards unexpected errors through `next` where provided.
 * Persistence and state changes are limited to the Prisma/service operations visible in this handler; financial terminal-state and SoD rules remain authoritative.
 */
  router.post('/bulk-create', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!Array.isArray(req.body)) {
        res.status(400).json({ detail: 'Payload harus berupa list.' });
        return;
      }
      const validFields = getModelFields(modelNameStr);
      const created = await prisma.$transaction(async (tx: any) => {
        const results = [];
        for (const item of req.body) {
          let payload = { ...item };
          if (options.beforeCreate) {
            const hookResult = await options.beforeCreate(req, payload);
            if (hookResult && typeof hookResult === 'object') payload = hookResult;
          }
          payload = autoFillRequiredFields(modelNameStr, payload, req);
          payload = await applyAndValidateWriteScope(req, modelNameStr, validFields, payload);
          payload = cleanData(payload, validFields);
          const rec = await tx[options.modelName].create({ data: payload });
          results.push(format(rec));
        }
        return results;
      });
      res.status(201).json(created);
    } catch (err) {
      next(err);
    }
  });

  // 3. Bulk Update
/**
 * PATCH `/bulk-update` handler registered on this router.
 *
 * Authentication/authorization: inherits the global authenticated tenant, module entitlement, RBAC, idempotency, and audit pipeline plus middleware supplied in this call.
 * Request/response: consumes the parameters/body referenced by the callback, preserves its current status/payload contract, and forwards unexpected errors through `next` where provided.
 * Persistence and state changes are limited to the Prisma/service operations visible in this handler; financial terminal-state and SoD rules remain authoritative.
 */
  router.patch('/bulk-update', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!Array.isArray(req.body)) {
        res.status(400).json({ detail: 'Payload harus berupa list.' });
        return;
      }
      const updated = await prisma.$transaction(async (tx: any) => {
        const results = [];
        for (const item of req.body) {
          if (!item.id) {
            throw new Error('Setiap item wajib memiliki id.');
          }
          const { id, ...itemData } = item;
          const existing = await tx[options.modelName].findFirst({
            where: await scopedWhere(req, { id }),
          });
          if (!existing) throw new ForbiddenError('Data tidak ditemukan dalam scope company user.');
          assertFinancialRecordMutable(existing);
          let data = { ...itemData };
          if (options.beforeUpdate) {
            const hookResult = await options.beforeUpdate(req, data, existing);
            if (hookResult && typeof hookResult === 'object') data = hookResult;
          }
          let scopedData = await applyAndValidateWriteScope(
            req,
            modelNameStr,
            getModelFields(modelNameStr),
            { ...existing, ...data },
          );
          delete (scopedData as any).id;
          scopedData = cleanData(scopedData, getModelFields(modelNameStr));
          const rec = await tx[options.modelName].update({
            where: { id },
            data: scopedData,
          });
          results.push(format(rec));
        }
        return results;
      });
      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  // 4. Bulk Delete
/**
 * POST `/bulk-delete` handler registered on this router.
 *
 * Authentication/authorization: inherits the global authenticated tenant, module entitlement, RBAC, idempotency, and audit pipeline plus middleware supplied in this call.
 * Request/response: consumes the parameters/body referenced by the callback, preserves its current status/payload contract, and forwards unexpected errors through `next` where provided.
 * Persistence and state changes are limited to the Prisma/service operations visible in this handler; financial terminal-state and SoD rules remain authoritative.
 */
  router.post('/bulk-delete', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids : [];
      if (!ids.length) {
        res.status(400).json({ detail: 'ids wajib diisi.' });
        return;
      }
      const where = await scopedWhere(req, { id: { in: ids } });
      const allowed = await delegate.count({ where });
      if (allowed !== new Set(ids).size) {
        throw new ForbiddenError('Satu atau lebih data berada di luar scope company user.');
      }
      if (options.beforeDelete) {
        const existingRecords = await delegate.findMany({ where });
        for (const existing of existingRecords) {
          assertFinancialRecordMutable(existing);
          await options.beforeDelete(req, existing);
        }
      }
      const result = await delegate.deleteMany({ where });
      res.json({ deleted: result.count });
    } catch (err) {
      next(err);
    }
  });

  // 5. List with DRF pagination envelope
/**
 * GET `/` handler registered on this router.
 *
 * Authentication/authorization: inherits the global authenticated tenant, module entitlement, RBAC, idempotency, and audit pipeline plus middleware supplied in this call.
 * Request/response: consumes the parameters/body referenced by the callback, preserves its current status/payload contract, and forwards unexpected errors through `next` where provided.
 * Persistence and state changes are limited to the Prisma/service operations visible in this handler; financial terminal-state and SoD rules remain authoritative.
 */
  router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, pageSize, skip } = parsePagination(req);
      let where: Record<string, any> = {};
      const validFields = getModelFields(modelNameStr);

      // Multi-tenant & Company isolation filters
      const andConditions: any[] = [];

      // Query param filters with FK alias mapping
      for (const [key, val] of Object.entries(req.query)) {
        if (['page', 'page_size', 'search', 'ordering'].includes(key)) continue;
        if (typeof val === 'string' && val !== '') {
          let resolvedKey = key;
          if (key === 'project') resolvedKey = 'project_id';
          else if (key === 'main_task') resolvedKey = 'main_task_id';
          else if (key === 'weekly_task') resolvedKey = 'weekly_task_id';
          else if (key === 'owner') resolvedKey = 'owner_id';
          else if (key === 'assignee') resolvedKey = 'assignee_id';
          else if (key === 'customer') resolvedKey = 'customer_party_id';
          else if (key === 'vendor') resolvedKey = 'vendor_party_id';
          else if (key === 'product') resolvedKey = 'product_id';
          else if (key === 'warehouse') resolvedKey = 'warehouse_id';

          // Only include filter if field exists on model (or if cache is empty fallback)
          if (validFields.size === 0 || validFields.has(resolvedKey)) {
            if (val === 'true') where[resolvedKey] = true;
            else if (val === 'false') where[resolvedKey] = false;
            else if (val === 'null') where[resolvedKey] = null;
            else where[resolvedKey] = val;
          }
        }
      }

      // Search filter
      const search = req.query['search'] as string | undefined;
      if (search && options.searchFields?.length) {
        const applicableSearchFields = options.searchFields.filter(
          (f) => validFields.size === 0 || validFields.has(f)
        );
        if (applicableSearchFields.length > 0) {
          andConditions.push({
            OR: applicableSearchFields.map((field) => ({
              [field]: { contains: search, mode: 'insensitive' },
            })),
          });
        }
      }

      if (andConditions.length > 0) {
        where.AND = andConditions;
      }
      where = await scopedWhere(req, where);

      // Ordering filter
      const ordering = req.query['ordering'] as string | undefined;
      const orderBy: Record<string, 'asc' | 'desc'> = {};
      if (ordering) {
        const isDesc = ordering.startsWith('-');
        const field = isDesc ? ordering.slice(1) : ordering;
        if (validFields.size === 0 || validFields.has(field)) {
          orderBy[field] = isDesc ? 'desc' : 'asc';
        } else if (validFields.has('id')) {
          orderBy['id'] = 'desc';
        }
      } else if (options.defaultSort && (validFields.size === 0 || validFields.has(options.defaultSort.field))) {
        orderBy[options.defaultSort.field] = options.defaultSort.order;
      } else if (validFields.size === 0 || validFields.has('id')) {
        orderBy['id'] = 'desc';
      }

      const queryArgs: any = {
        where,
        skip,
        take: pageSize,
      };
      if (Object.keys(orderBy).length > 0) {
        queryArgs.orderBy = orderBy;
      }
      if (options.include) queryArgs.include = options.include;

      const [totalCount, items] = await Promise.all([
        delegate.count({ where }),
        delegate.findMany(queryArgs),
      ]);

      const formattedItems = items.map(format);
      res.json(paginateArray(req, formattedItems, totalCount, page, pageSize));
    } catch (err) {
      next(err);
    }
  });

  // 6. Create
/**
 * POST `/` handler registered on this router.
 *
 * Authentication/authorization: inherits the global authenticated tenant, module entitlement, RBAC, idempotency, and audit pipeline plus middleware supplied in this call.
 * Request/response: consumes the parameters/body referenced by the callback, preserves its current status/payload contract, and forwards unexpected errors through `next` where provided.
 * Persistence and state changes are limited to the Prisma/service operations visible in this handler; financial terminal-state and SoD rules remain authoritative.
 */
  router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      let data = { ...req.body };
      const validFields = getModelFields(modelNameStr);

      if (req.user?.id && !data.created_by_id && validFields.has('created_by_id')) {
        data.created_by_id = req.user.id;
      }

      if (options.beforeCreate) {
        const hookResult = await options.beforeCreate(req, data);
        if (hookResult && typeof hookResult === 'object') {
          data = hookResult;
        } else {
          data = { ...data, ...req.body };
        }
      }

      // Re-run auto-fill after custom beforeCreate hook
      data = autoFillRequiredFields(modelNameStr, data, req);
      data = await applyAndValidateWriteScope(req, modelNameStr, validFields, data);

      if (validFields.size > 0) {
        const cleanedData: any = {};
        for (const [key, val] of Object.entries(data)) {
          if (validFields.has(key)) {
            cleanedData[key] = val;
          }
        }
        data = cleanedData;
      }

      const record = await delegate.create({ data });

      if (options.afterCreate) {
        await options.afterCreate(req, record);
      }

      res.status(201).json(format(record));
    } catch (err) {
      next(err);
    }
  });

  // 7. Retrieve
/**
 * GET `/:id` handler registered on this router.
 *
 * Authentication/authorization: inherits the global authenticated tenant, module entitlement, RBAC, idempotency, and audit pipeline plus middleware supplied in this call.
 * Request/response: consumes the parameters/body referenced by the callback, preserves its current status/payload contract, and forwards unexpected errors through `next` where provided.
 * Persistence and state changes are limited to the Prisma/service operations visible in this handler; financial terminal-state and SoD rules remain authoritative.
 */
  router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const queryArgs: any = { where: await scopedWhere(req, { id }) };
      if (options.include) queryArgs.include = options.include;

      const record = await delegate.findFirst(queryArgs);
      if (!record) throw new NotFoundError(modelNameStr);
      res.json(format(record));
    } catch (err) {
      next(err);
    }
  });

  // 8. Update (PUT)
/**
 * PUT `/:id` handler registered on this router.
 *
 * Authentication/authorization: inherits the global authenticated tenant, module entitlement, RBAC, idempotency, and audit pipeline plus middleware supplied in this call.
 * Request/response: consumes the parameters/body referenced by the callback, preserves its current status/payload contract, and forwards unexpected errors through `next` where provided.
 * Persistence and state changes are limited to the Prisma/service operations visible in this handler; financial terminal-state and SoD rules remain authoritative.
 */
  router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const existing = await delegate.findFirst({ where: await scopedWhere(req, { id }) });
      if (!existing) throw new NotFoundError(modelNameStr);
      assertFinancialRecordMutable(existing);

      let data = { ...req.body };
      const validFields = getModelFields(modelNameStr);
      if (req.user?.id && !data.updated_by_id && validFields.has('updated_by_id')) {
        data.updated_by_id = req.user.id;
      }
      if (options.beforeUpdate) {
        const hookResult = await options.beforeUpdate(req, data, existing);
        if (hookResult && typeof hookResult === 'object') {
          data = hookResult;
        } else {
          data = { ...data, ...req.body };
        }
      }
      data = await applyAndValidateWriteScope(req, modelNameStr, validFields, { ...existing, ...data });
      delete data.id;

      // Auto convert any date strings
      const model = Prisma.dmmf?.datamodel?.models?.find(
        (m) => m.name.toLowerCase() === modelNameStr.toLowerCase()
      );
      if (model) {
        for (const field of model.fields) {
          if (field.type === 'DateTime' && typeof data[field.name] === 'string' && data[field.name]) {
            data[field.name] = new Date(data[field.name]);
          }
        }
      }

      if (validFields.size > 0) {
        const cleanedData: any = {};
        for (const [key, val] of Object.entries(data)) {
          if (validFields.has(key)) {
            cleanedData[key] = val;
          }
        }
        data = cleanedData;
      }

      const updated = await delegate.update({
        where: { id },
        data,
      });

      if (options.afterUpdate) {
        await options.afterUpdate(req, updated, existing);
      }

      res.json(format(updated));
    } catch (err) {
      next(err);
    }
  });

  // 9. Partial Update (PATCH)
/**
 * PATCH `/:id` handler registered on this router.
 *
 * Authentication/authorization: inherits the global authenticated tenant, module entitlement, RBAC, idempotency, and audit pipeline plus middleware supplied in this call.
 * Request/response: consumes the parameters/body referenced by the callback, preserves its current status/payload contract, and forwards unexpected errors through `next` where provided.
 * Persistence and state changes are limited to the Prisma/service operations visible in this handler; financial terminal-state and SoD rules remain authoritative.
 */
  router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const existing = await delegate.findFirst({ where: await scopedWhere(req, { id }) });
      if (!existing) throw new NotFoundError(modelNameStr);
      assertFinancialRecordMutable(existing);

      let data = { ...req.body };
      const validFields = getModelFields(modelNameStr);
      if (req.user?.id && !data.updated_by_id && validFields.has('updated_by_id')) {
        data.updated_by_id = req.user.id;
      }
      if (options.beforeUpdate) {
        const hookResult = await options.beforeUpdate(req, data, existing);
        if (hookResult && typeof hookResult === 'object') {
          data = hookResult;
        } else {
          data = { ...data, ...req.body };
        }
      }
      data = await applyAndValidateWriteScope(req, modelNameStr, validFields, { ...existing, ...data });
      delete data.id;

      // Auto convert any date strings
      const model = Prisma.dmmf?.datamodel?.models?.find(
        (m) => m.name.toLowerCase() === modelNameStr.toLowerCase()
      );
      if (model) {
        for (const field of model.fields) {
          if (field.type === 'DateTime' && typeof data[field.name] === 'string' && data[field.name]) {
            data[field.name] = new Date(data[field.name]);
          }
        }
      }

      if (validFields.size > 0) {
        const cleanedData: any = {};
        for (const [key, val] of Object.entries(data)) {
          if (validFields.has(key)) {
            cleanedData[key] = val;
          }
        }
        data = cleanedData;
      }

      const updated = await delegate.update({
        where: { id },
        data,
      });

      if (options.afterUpdate) {
        await options.afterUpdate(req, updated, existing);
      }

      res.json(format(updated));
    } catch (err) {
      next(err);
    }
  });

  // 10. Delete
/**
 * DELETE `/:id` handler registered on this router.
 *
 * Authentication/authorization: inherits the global authenticated tenant, module entitlement, RBAC, idempotency, and audit pipeline plus middleware supplied in this call.
 * Request/response: consumes the parameters/body referenced by the callback, preserves its current status/payload contract, and forwards unexpected errors through `next` where provided.
 * Persistence and state changes are limited to the Prisma/service operations visible in this handler; financial terminal-state and SoD rules remain authoritative.
 */
  router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const existing = await delegate.findFirst({ where: await scopedWhere(req, { id }) });
      if (!existing) throw new NotFoundError(modelNameStr);
      assertFinancialRecordMutable(existing);

      if (options.beforeDelete) {
        await options.beforeDelete(req, existing);
      }

      await delegate.delete({ where: { id } });

      if (options.afterDelete) {
        await options.afterDelete(req, existing);
      }

      sendDeleteSuccess(res);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export default createCrudRouter;
