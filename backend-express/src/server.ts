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
async function main() {
  const app = createApp();

  // Supavisor may transiently reject a new session while rotating or waking.
  // Keep readiness closed and retry a bounded number of times before failing.
  const maxConnectAttempts = 5;
  for (let attempt = 1; attempt <= maxConnectAttempts; attempt += 1) {
    try {
      await prisma.$connect();
      console.log('✅ Database connected successfully via Prisma');
      break;
    } catch (err) {
      if (attempt === maxConnectAttempts) {
        console.error('❌ Failed to connect to database after bounded retries:', err);
        process.exit(1);
      }
      const delayMs = Math.min(5000, attempt * 1000);
      console.warn(`⚠️ Database connection attempt ${attempt}/${maxConnectAttempts} failed; retrying in ${delayMs} ms.`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  const server = app.listen(env.PORT, () => {
    console.log(`🚀 ERP Express Backend running on http://localhost:${env.PORT}`);
    console.log(`📡 API Base URL: http://localhost:${env.PORT}/api/v1/`);
    console.log(`🩺 Health Check: http://localhost:${env.PORT}/health`);
  });

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

main().catch((err) => {
  console.error('Fatal error during startup:', err);
  process.exit(1);
});
