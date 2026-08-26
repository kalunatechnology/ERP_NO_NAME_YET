import { PrismaClient } from '@prisma/client';
import { env } from './env';

declare global {
  // Allow global `var` declarations — needed for Next.js / Node.js module caching pattern
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

/**
 * Singleton Prisma client to prevent connection pool exhaustion in
 * development (hot-reload creates new instances on every module eval).
 */
function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log:
      env.NODE_ENV === 'development'
        ? ['query', 'warn', 'error']
        : ['warn', 'error'],
    datasources: {
      db: {
        url: env.DATABASE_URL,
      },
    },
  });
}

export const prisma: PrismaClient =
  env.NODE_ENV === 'production'
    ? createPrismaClient()
    : (global.__prisma ?? (global.__prisma = createPrismaClient()));

export default prisma;
