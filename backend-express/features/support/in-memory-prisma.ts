/**
 * File: backend-express/features/support/in-memory-prisma.ts
 *
 * Lightweight in-memory Prisma adapter for Cucumber BDD system testing of
 * Universal Inventory Phases 1-4. Patches the singleton `prisma` client in-process
 * so production services execute end-to-end without touching any live database.
 */
import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../../src/config/database';

type Row = Record<string, any>;

function matchesWhere(row: Row, where: any): boolean {
  if (!where || typeof where !== 'object') return true;
  for (const [key, cond] of Object.entries(where)) {
    if (key === 'OR' && Array.isArray(cond)) {
      if (!cond.some((sub) => matchesWhere(row, sub))) return false;
      continue;
    }
    if (key === 'AND' && Array.isArray(cond)) {
      if (!cond.every((sub) => matchesWhere(row, sub))) return false;
      continue;
    }
    const val = row[key];
    if (cond === undefined) continue;
    if (cond === null) {
      if (val !== null && val !== undefined) return false;
      continue;
    }
    if (typeof cond === 'object' && !Array.isArray(cond) && !(cond instanceof Date) && !(cond instanceof Prisma.Decimal)) {
      const c = cond as Record<string, any>;
      if ('in' in c && Array.isArray(c.in)) {
        if (!c.in.includes(val)) return false;
      }
      if ('not' in c) {
        if (c.not === null ? (val === null || val === undefined) : val === c.not) return false;
      }
      if ('gt' in c) {
        const cmp = val instanceof Date || c.gt instanceof Date ? new Date(val).getTime() > new Date(c.gt).getTime() : Number(val ?? 0) > Number(c.gt);
        if (!cmp) return false;
      }
      if ('gte' in c) {
        const cmp = val instanceof Date || c.gte instanceof Date ? new Date(val).getTime() >= new Date(c.gte).getTime() : Number(val ?? 0) >= Number(c.gte);
        if (!cmp) return false;
      }
      if ('lt' in c) {
        const cmp = val instanceof Date || c.lt instanceof Date ? new Date(val).getTime() < new Date(c.lt).getTime() : Number(val ?? 0) < Number(c.lt);
        if (!cmp) return false;
      }
      if ('lte' in c) {
        const cmp = val instanceof Date || c.lte instanceof Date ? new Date(val).getTime() <= new Date(c.lte).getTime() : Number(val ?? 0) <= Number(c.lte);
        if (!cmp) return false;
      }
      continue;
    }
    if (val !== cond) return false;
  }
  return true;
}

function toStored(val: any): any {
  if (val === undefined) return undefined;
  return val;
}

function makeModelDelegate(store: Map<string, Row[]>, modelName: string) {
  if (!store.has(modelName)) store.set(modelName, []);
  const rows = () => store.get(modelName)!;

  return {
    findMany: async ({ where, orderBy, take }: any = {}) => {
      let res = rows().filter((r) => matchesWhere(r, where)).map((r) => ({ ...r }));
      if (orderBy) {
        const entries = Array.isArray(orderBy) ? orderBy : [orderBy];
        res.sort((a, b) => {
          for (const ord of entries) {
            const [f, dir] = Object.entries(ord)[0] as [string, string];
            const av = a[f] instanceof Date ? a[f].getTime() : a[f];
            const bv = b[f] instanceof Date ? b[f].getTime() : b[f];
            if (av !== bv) {
              const cmp = av < bv ? -1 : 1;
              return String(dir).toLowerCase() === 'desc' ? -cmp : cmp;
            }
          }
          return 0;
        });
      }
      if (typeof take === 'number') res = res.slice(0, take);
      return res;
    },
    findFirst: async ({ where, orderBy }: any = {}) => {
      const list = await makeModelDelegate(store, modelName).findMany({ where, orderBy, take: 1 });
      return list[0] ?? null;
    },
    findUnique: async ({ where }: any = {}) => {
      return rows().find((r) => matchesWhere(r, where)) ?? null;
    },
    create: async ({ data }: any) => {
      const now = new Date();
      const rec: Row = {
        id: data.id || crypto.randomUUID(),
        created_at: data.created_at ?? now,
        updated_at: data.updated_at ?? now,
        ...Object.fromEntries(Object.entries(data).map(([k, v]) => [k, toStored(v)])),
      };
      rows().push(rec);
      return { ...rec };
    },
    update: async ({ where, data }: any) => {
      const idx = rows().findIndex((r) => matchesWhere(r, where));
      if (idx < 0) throw new Error(`Record not found in ${modelName}`);
      const updated = { ...rows()[idx], ...data, updated_at: new Date() };
      rows()[idx] = updated;
      return { ...updated };
    },
    updateMany: async ({ where, data }: any) => {
      let count = 0;
      for (let i = 0; i < rows().length; i++) {
        if (matchesWhere(rows()[i], where)) {
          rows()[i] = { ...rows()[i], ...data, updated_at: new Date() };
          count++;
        }
      }
      return { count };
    },
    aggregate: async ({ where, _sum }: any) => {
      const matched = rows().filter((r) => matchesWhere(r, where));
      const sumOut: Record<string, any> = {};
      if (_sum) {
        for (const field of Object.keys(_sum)) {
          sumOut[field] = matched.reduce((acc, r) => acc.plus(new Prisma.Decimal(r[field] ?? 0)), new Prisma.Decimal(0));
        }
      }
      return { _sum: sumOut };
    },
  };
}

export function installInMemoryPrisma(): Map<string, Row[]> {
  const store = new Map<string, Row[]>();
  const db = prisma as any;

  const modelNames = [
    'master_product',
    'master_product_variant',
    'master_warehouse_location',
    'master_uom_conversion',
    'inv_lot',
    'inv_serial_number',
    'inv_inventory_owner',
    'inv_costing_policy',
    'inv_stock_move',
    'inv_stock_move_line',
    'inv_stock_ledger_entry',
    'inv_stock_balance',
    'inv_valuation_layer',
    'inv_stock_reservation',
    'inv_outbox_event',
    'inv_workflow_rule',
    'inv_warehouse_user_scope',
    'inv_intercompany_sto',
    'inv_intercompany_sto_line',
    'inv_company_extension',
    'inv_ddmrp_buffer',
    'inv_webhook_subscription',
    'iam_user_module_assignment',
    'project_project',
    'mfg_production_order',
    'mfg_bom_line',
  ];

  for (const name of modelNames) {
    db[name] = makeModelDelegate(store, name);
  }

  db.$executeRawUnsafe = async () => 0;
  db.$queryRawUnsafe = async () => [];
  db.$transaction = async (fn: any) => fn(db);

  return store;
}

