import { Request, Response, NextFunction, Router } from 'express';
import prisma from '../config/database';
import { paginateArray, parsePagination, sendDeleteSuccess } from './response';
import { NotFoundError } from './errors';

export interface CrudOptions {
  modelName: keyof typeof prisma;
  searchFields?: string[];
  defaultSort?: { field: string; order: 'asc' | 'desc' };
  select?: Record<string, unknown>;
  include?: Record<string, unknown>;
  beforeCreate?: (req: Request, data: any) => Promise<any> | any;
  beforeUpdate?: (req: Request, data: any, existing: any) => Promise<any> | any;
  afterCreate?: (req: Request, record: any) => Promise<void> | void;
  afterUpdate?: (req: Request, record: any, before: any) => Promise<void> | void;
  afterDelete?: (req: Request, record: any) => Promise<void> | void;
  transform?: (record: any) => any;
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

export function createCrudRouter(options: CrudOptions): Router {
  const router = Router();
  const delegate = (prisma as any)[options.modelName];

  const format = (rec: any) => {
    let out = normalizeRecord(rec, String(options.modelName));
    if (options.transform) out = options.transform(out);
    return out;
  };

  // 1. Metadata endpoint
  router.get('/metadata', (req: Request, res: Response) => {
    res.json({
      model: String(options.modelName),
      table: String(options.modelName),
      searchFields: options.searchFields ?? [],
    });
  });

  // 2. Bulk Create
  router.post('/bulk-create', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!Array.isArray(req.body)) {
        res.status(400).json({ detail: 'Payload harus berupa list.' });
        return;
      }
      const created = await prisma.$transaction(async (tx: any) => {
        const results = [];
        for (const item of req.body) {
          const payload = { ...item };
          if (req.user?.tenant_id && !payload.tenant_id) payload.tenant_id = req.user.tenant_id;
          if (req.companyId && !payload.company_id) payload.company_id = req.companyId;
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
          const { id, ...data } = item;
          const rec = await tx[options.modelName].update({
            where: { id },
            data,
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
  router.post('/bulk-delete', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids : [];
      if (!ids.length) {
        res.status(400).json({ detail: 'ids wajib diisi.' });
        return;
      }
      const result = await delegate.deleteMany({
        where: { id: { in: ids } },
      });
      res.json({ deleted: result.count });
    } catch (err) {
      next(err);
    }
  });

  // 5. List with DRF pagination envelope
  router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, pageSize, skip } = parsePagination(req);
      const where: Record<string, any> = {};

      // Multi-tenant & Company isolation filters
      const andConditions: any[] = [];

      if (req.user?.tenant_id) {
        andConditions.push({
          tenant_id: req.user.tenant_id,
        });
      }

      if (req.companyId && req.companyId !== 'all') {
        andConditions.push({
          company_id: req.companyId,
        });
      }

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

          if (val === 'true') where[resolvedKey] = true;
          else if (val === 'false') where[resolvedKey] = false;
          else if (val === 'null') where[resolvedKey] = null;
          else where[resolvedKey] = val;
        }
      }

      // Search filter
      const search = req.query['search'] as string | undefined;
      if (search && options.searchFields?.length) {
        andConditions.push({
          OR: options.searchFields.map((field) => ({
            [field]: { contains: search, mode: 'insensitive' },
          })),
        });
      }

      if (andConditions.length > 0) {
        where.AND = andConditions;
      }

      // Ordering filter
      const ordering = req.query['ordering'] as string | undefined;
      const orderBy: Record<string, 'asc' | 'desc'> = {};
      if (ordering) {
        const isDesc = ordering.startsWith('-');
        const field = isDesc ? ordering.slice(1) : ordering;
        orderBy[field] = isDesc ? 'desc' : 'asc';
      } else if (options.defaultSort) {
        orderBy[options.defaultSort.field] = options.defaultSort.order;
      } else {
        orderBy['id'] = 'desc';
      }

      const queryArgs: any = {
        where,
        skip,
        take: pageSize,
        orderBy,
      };
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
  router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      let data = { ...req.body };
      if (req.user?.tenant_id && !data.tenant_id) {
        data.tenant_id = req.user.tenant_id;
      }
      if (req.companyId && !data.company_id) {
        data.company_id = req.companyId;
      }
      if (req.user?.id && !data.created_by_id) {
        data.created_by_id = req.user.id;
      }

      if (options.beforeCreate) {
        data = await options.beforeCreate(req, data);
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
  router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const queryArgs: any = { where: { id } };
      if (options.include) queryArgs.include = options.include;

      const record = await delegate.findUnique(queryArgs);
      if (!record) throw new NotFoundError(String(options.modelName));
      res.json(format(record));
    } catch (err) {
      next(err);
    }
  });

  // 8. Update (PUT)
  router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const existing = await delegate.findUnique({ where: { id } });
      if (!existing) throw new NotFoundError(String(options.modelName));

      let data = { ...req.body };
      if (req.user?.id && !data.updated_by_id) {
        data.updated_by_id = req.user.id;
      }
      if (options.beforeUpdate) {
        data = await options.beforeUpdate(req, data, existing);
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
  router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const existing = await delegate.findUnique({ where: { id } });
      if (!existing) throw new NotFoundError(String(options.modelName));

      let data = { ...req.body };
      if (req.user?.id && !data.updated_by_id) {
        data.updated_by_id = req.user.id;
      }
      if (options.beforeUpdate) {
        data = await options.beforeUpdate(req, data, existing);
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
  router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const existing = await delegate.findUnique({ where: { id } });
      if (!existing) throw new NotFoundError(String(options.modelName));

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
