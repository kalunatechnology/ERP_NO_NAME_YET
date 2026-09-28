/**
 * File: backend-express/src/config/database.ts
 *
 * Purpose: Implements runtime configuration responsibilities for the platform domain.
 * Responsibility: Defines the executable contracts in this file and connects them to their callers without owning unrelated domain behavior.
 * Integration: Used through static imports, Express/Next framework discovery, or an explicit npm/script entry point as applicable.
 * Dependencies and side effects: See each documented function; database, browser storage, network, and response mutations are called out where present.
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from './env';
import { postgresPoolConfig } from './postgres';

const DAILY_TASK_COMPARISON_FIELDS = new Set([
  'output_target',
  'output_similarity_score',
  'output_review_category',
]);

const DAILY_TASK_LEGACY_SELECT = {
  tenant_id: true,
  company_id: true,
  created_by_id: true,
  id: true,
  weekly_task_id: true,
  owner_id: true,
  title: true,
  description: true,
  planned_date: true,
  time_slot: true,
  output_result: true,
  notes: true,
  progress: true,
  status: true,
  is_blocked: true,
  block_reason: true,
  created_at: true,
  updated_at: true,
} as const;

const DAILY_TASK_RECORD_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'create',
  'update',
  'delete',
  'upsert',
  'createManyAndReturn',
  'updateManyAndReturn',
]);

let dailyTaskCompatibilityUntil = 0;
let dailyTaskCompatibilityWarningLogged = false;

function isDailyTaskSchemaLag(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2022') {
    return true;
  }

  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.includes('does not exist in the current database')
    || (message.includes('column') && message.includes('does not exist'));
}

function stripDailyTaskComparisonFields(value: unknown): any {
  if (Array.isArray(value)) {
    return value.map(stripDailyTaskComparisonFields);
  }

  if (!value || typeof value !== 'object' || value instanceof Date) {
    return value;
  }

  const next: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    if (DAILY_TASK_COMPARISON_FIELDS.has(key)) continue;
    next[key] = stripDailyTaskComparisonFields(nestedValue);
  }
  return next;
}

function makeDailyTaskLegacyArgs(operation: string, args: any): any {
  const safeArgs = stripDailyTaskComparisonFields(args ?? {});

  if (DAILY_TASK_RECORD_OPERATIONS.has(operation)) {
    if (safeArgs.include && !safeArgs.select) {
      safeArgs.select = {
        ...DAILY_TASK_LEGACY_SELECT,
        ...safeArgs.include,
      };
      delete safeArgs.include;
    } else if (!safeArgs.select) {
      safeArgs.select = DAILY_TASK_LEGACY_SELECT;
    }
  }

  return safeArgs;
}

function hydrateDailyTaskFallback(result: any): any {
  if (Array.isArray(result)) {
    return result.map(hydrateDailyTaskFallback);
  }

  if (!result || typeof result !== 'object' || result instanceof Date) {
    return result;
  }

  return {
    ...result,
    output_target: result.output_target ?? '',
    output_similarity_score: result.output_similarity_score ?? 0,
    output_review_category: result.output_review_category ?? 'NOT_EVALUATED',
  };
}

function createPrismaClient() {
  const baseClient = new PrismaClient({
    adapter: new PrismaPg(postgresPoolConfig(env.DATABASE_URL)),
    log:
      env.NODE_ENV === 'development'
        ? ['query', 'warn', 'error']
        : ['error'],
  });

  return baseClient.$extends({
    query: {
      project_daily_task: {
        async $allOperations({ operation, args, query }) {
          const executeLegacy = async () => {
            const legacyResult = await query(makeDailyTaskLegacyArgs(operation, args));
            return DAILY_TASK_RECORD_OPERATIONS.has(operation)
              ? hydrateDailyTaskFallback(legacyResult)
              : legacyResult;
          };

          if (Date.now() < dailyTaskCompatibilityUntil) {
            return executeLegacy();
          }

          try {
            return await query(args);
          } catch (error) {
            if (!isDailyTaskSchemaLag(error)) throw error;

            // Keep application deployment and DB migration separate while
            // allowing the API to survive the short transition window where
            // Prisma schema is newer than the physical production table.
            dailyTaskCompatibilityUntil = Date.now() + 30_000;
            if (!dailyTaskCompatibilityWarningLogged) {
              dailyTaskCompatibilityWarningLogged = true;
              console.warn(
                '[database] project_daily_task physical schema is behind Prisma; using temporary legacy-column compatibility until migration is applied.',
              );
            }

            return executeLegacy();
          }
        },
      },
    },
  });
}

/**
 * Query extensions alter Prisma's inferred structural type even though the
 * runtime client still fulfils the normal PrismaClient/TransactionClient
 * contract used throughout this ERP. Keep that extension detail private here
 * so existing service transaction signatures remain stable.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const runtimePrisma = globalForPrisma.prisma ?? createPrismaClient();

export const prisma = runtimePrisma as unknown as PrismaClient;
globalForPrisma.prisma = prisma;

export default prisma;
