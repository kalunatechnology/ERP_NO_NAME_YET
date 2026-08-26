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
}

/**
 * Creates a standard DRF-compatible Router for any Prisma model.
 * Implements:
 *   - GET /               (list with pagination, search, ordering, filters)
 *   - POST /              (create)
 *   - GET /metadata/      (metadata)
 *   - POST /bulk-create/  (bulk create)
 *   - PATCH /bulk-update/ (bulk update)
 *   - POST /bulk-delete/  (bulk delete)
 *   - GET /:id/           (retrieve)
 *   - PUT /:id/           (update)
 *   - PATCH /:id/         (partial update)
 *   - DELETE /:id/        (delete)
 */
export function createCrudRouter(options: CrudOptions): Router {
  const router = Router();
  const delegate = (prisma as any)[options.modelName];

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
          results.push(rec);
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
          results.push(rec);
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

      // Multi-tenant isolation filter
      if (req.user && !req.user.is_superuser) {
        if (req.user.tenant_id) {
          // Check if model has tenant_id column in where filter
          where.OR = [
            { tenant_id: req.user.tenant_id },
            { tenant_id: null },
          ];
        }
      }

      // Query param filters
      for (const [key, val] of Object.entries(req.query)) {
        if (['page', 'page_size', 'search', 'ordering'].includes(key)) continue;
        if (typeof val === 'string' && val !== '') {
          if (val === 'true') where[key] = true;
          else if (val === 'false') where[key] = false;
          else if (val === 'null') where[key] = null;
          else where[key] = val;
        }
      }

      // Search filter
      const search = req.query['search'] as string | undefined;
      if (search && options.searchFields?.length) {
        where.OR = options.searchFields.map((field) => ({
          [field]: { contains: search, mode: 'insensitive' },
        }));
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

      res.json(paginateArray(req, items, totalCount, page, pageSize));
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

      res.status(201).json(record);
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
      res.json(record);
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

      res.json(updated);
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

      res.json(updated);
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
