const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

function postgresPoolConfig(connectionString) {
  if (!connectionString) throw new Error('Database connection URL is required.');
  const url = new URL(connectionString);
  const connectionLimit = Number(url.searchParams.get('connection_limit') ?? '3');
  const connectTimeoutSeconds = Number(url.searchParams.get('connect_timeout') ?? '30');
  url.searchParams.delete('connection_limit');
  url.searchParams.delete('connect_timeout');
  return {
    connectionString: url.toString(),
    max: Number.isFinite(connectionLimit) ? Math.min(10, Math.max(1, connectionLimit)) : 3,
    connectionTimeoutMillis: Number.isFinite(connectTimeoutSeconds)
      ? Math.min(60, Math.max(1, connectTimeoutSeconds)) * 1000
      : 30_000,
  };
}

function createPrismaClient(connectionString = process.env.DATABASE_URL) {
  return new PrismaClient({ adapter: new PrismaPg(postgresPoolConfig(connectionString)) });
}

module.exports = { createPrismaClient, postgresPoolConfig };
