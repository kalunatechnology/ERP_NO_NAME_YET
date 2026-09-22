import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { postgresPoolConfig } from '../src/config/postgres';

export function createPrismaClient(connectionString = process.env.DATABASE_URL || '') {
  return new PrismaClient({ adapter: new PrismaPg(postgresPoolConfig(connectionString)) });
}
