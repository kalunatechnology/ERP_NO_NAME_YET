/**
 * File: backend-express/src/server.ts
 *
 * Purpose: Implements application infrastructure responsibilities for the platform domain.
 * Responsibility: Defines the executable contracts in this file and connects them to their callers without owning unrelated domain behavior.
 * Integration: Used through static imports, Express/Next framework discovery, or an explicit npm/script entry point as applicable.
 * Dependencies and side effects: See each documented function; database, browser storage, network, and response mutations are called out where present.
 */
import { createApp } from './app';
import { env } from './config/env';
import prisma from './config/database';

/**
 * main implements a named function within this file's application infrastructure boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: No database operation is implied unless explicitly present in the implementation.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
const sleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

async function connectDatabaseInBackground(app: ReturnType<typeof createApp>, isStopping: () => boolean) {
  let attempt = 0;
  while (!isStopping()) {
    attempt += 1;
    try {
      await prisma.$connect();
      // A TCP/session handshake alone does not prove the first application SQL
      // request is ready after a pooler wake or a new deployment.
      await prisma.$queryRaw`SELECT 1`;
      app.locals.databaseReady = true;
      console.log('✅ Database connected successfully via Prisma');
      return;
    } catch (err) {
      app.locals.databaseReady = false;
      const delayMs = Math.min(15_000, Math.max(1_000, attempt * 1_000));
      const errorCode = typeof err === 'object' && err !== null && 'code' in err
        ? String((err as { code?: unknown }).code ?? 'UNKNOWN')
        : err instanceof Error ? err.name : 'UNKNOWN';
      // Do not disconnect a global Prisma client while incoming requests may
      // reference it. The binary engine owns reconnecting its failed session.
      console.warn(`⚠️ Database connection attempt ${attempt} failed (${errorCode}); retrying in ${delayMs} ms.`);
      await sleep(delayMs);
    }
  }
}

function main() {
  const app = createApp();
  app.locals.databaseReady = false;
  let stopping = false;

  // Hostinger requires a process to call listen() within a few seconds. Do
  // not block HTTP startup on a remote database handshake: Prisma reconnects
  // in the background while the host can immediately route traffic to us.
  const server = app.listen(env.PORT, () => {
    console.log(`🚀 ERP Express Backend running on http://localhost:${env.PORT}`);
    console.log(`📡 API Base URL: http://localhost:${env.PORT}/api/v1/`);
    console.log(`🩺 Health Check: http://localhost:${env.PORT}/health`);
  });
  void connectDatabaseInBackground(app, () => stopping);

  // Graceful shutdown
/**
 * shutdown implements a named function within this file's application infrastructure boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: No database operation is implied unless explicitly present in the implementation.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
  const shutdown = async (signal: string) => {
    stopping = true;
    console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
    server.close(async () => {
      await prisma.$disconnect();
      console.log('🔒 Database connections closed.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main();
