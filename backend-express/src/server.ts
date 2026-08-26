import { createApp } from './app';
import { env } from './config/env';
import prisma from './config/database';

async function main() {
  const app = createApp();

  // Test database connection on startup
  try {
    await prisma.$connect();
    console.log('✅ Database connected successfully via Prisma');
  } catch (err) {
    console.error('❌ Failed to connect to database:', err);
    process.exit(1);
  }

  const server = app.listen(env.PORT, () => {
    console.log(`🚀 ERP Express Backend running on http://localhost:${env.PORT}`);
    console.log(`📡 API Base URL: http://localhost:${env.PORT}/api/v1/`);
    console.log(`🩺 Health Check: http://localhost:${env.PORT}/health`);
  });

  // Graceful shutdown
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
