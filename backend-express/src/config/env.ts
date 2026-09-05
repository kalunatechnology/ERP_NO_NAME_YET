/**
 * File: backend-express/src/config/env.ts
 *
 * Purpose: Implements runtime configuration responsibilities for the platform domain.
 * Responsibility: Defines the executable contracts in this file and connects them to their callers without owning unrelated domain behavior.
 * Integration: Used through static imports, Express/Next framework discovery, or an explicit npm/script entry point as applicable.
 * Dependencies and side effects: See each documented function; database, browser storage, network, and response mutations are called out where present.
 */
import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load the backend environment exactly once. `quiet` prevents dotenv's
// promotional runtime messages from polluting application startup logs.
dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

const envSchema = z.object({
  PORT: z.string().default('8001').transform(Number),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // The target is explicit so a persistent Hostinger process never
  // accidentally inherits Vercel's transaction-pooler behavior.
  DEPLOYMENT_TARGET: z.enum(['local', 'hostinger', 'vercel']).optional(),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DIRECT_URL: z.string().min(1, 'DIRECT_URL is required for schema migrations'),
  SUPABASE_POOLER_URL: z.string().min(1).optional(),
  SUPABASE_DIRECT_URL: z.string().min(1).optional(),

  JWT_ACCESS_SECRET: z.string().default('your-super-secret-access-key-32chars-minimum-prod'),
  JWT_REFRESH_SECRET: z.string().default('your-super-secret-refresh-key-32chars-minimum-prod'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('30m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  CORS_ALLOWED_ORIGINS: z
    .string()
    .default(
      'http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000,http://localhost:5500,http://127.0.0.1:5500,https://marka.arsalynk.com,http://marka.arsalynk.com,https://arsalynk.com,http://arsalynk.com',
    )
    .transform((val) => val.split(',').map((s) => s.trim()).filter(Boolean)),
  CORS_ALLOW_CREDENTIALS: z
    .string()
    .default('true')
    .transform((v) => v.toLowerCase() === 'true'),

  PAGE_SIZE: z.string().default('25').transform(Number),
  MAX_PAGE_SIZE: z.string().default('500').transform(Number),

  ERP_ENFORCE_IAM: z
    .string()
    .default('false')
    .transform((v) => v.toLowerCase() === 'true'),
  ERP_ENFORCE_FIELD_PERMISSIONS: z
    .string()
    .default('false')
    .transform((v) => v.toLowerCase() === 'true'),
});

/**
 * loadEnv implements a named function within this file's runtime configuration boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: No database operation is implied unless explicitly present in the implementation.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
/**
 * Chooses the Prisma runtime URL for the actual deployment topology.
 *
 * Vercel uses Supavisor transaction pooling (`pooler.supabase.com:6543`) to
 * tolerate ephemeral serverless instances. Hostinger runs a persistent
 * Express process and must use the direct PostgreSQL endpoint
 * (`db.<project>.supabase.co:5432`). `DIRECT_URL` remains direct in both
 * environments because Prisma migrations require a non-pooled connection.
 *
 * The validation is intentionally fail-closed: starting against the wrong
 * endpoint creates intermittent connection failures that are difficult to
 * diagnose after deployment.
 */
function resolveDatabaseTopology(config: z.infer<typeof envSchema>) {
  const target = process.env.VERCEL === '1' ? 'vercel' : config.DEPLOYMENT_TARGET ?? 'local';
  const directUrl = config.SUPABASE_DIRECT_URL ?? config.DIRECT_URL;

  if (target === 'vercel') {
    const poolerUrl = config.SUPABASE_POOLER_URL ?? config.DATABASE_URL;
    const pooler = new URL(poolerUrl);
    if (!pooler.hostname.endsWith('.pooler.supabase.com') || pooler.port !== '6543') {
      throw new Error('Vercel requires SUPABASE_POOLER_URL using Supabase transaction pooler port 6543.');
    }
    return { target, databaseUrl: poolerUrl, directUrl };
  }

  if (target === 'hostinger') {
    const direct = new URL(directUrl);
    if (!/^db\.[a-z0-9-]+\.supabase\.co$/i.test(direct.hostname) || direct.port !== '5432') {
      throw new Error('Hostinger requires SUPABASE_DIRECT_URL using db.<project>.supabase.co:5432.');
    }
    return { target, databaseUrl: directUrl, directUrl };
  }

  return { target, databaseUrl: config.DATABASE_URL, directUrl };
}

/**
 * Parses and validates application configuration without exposing secrets.
 *
 * The returned `DATABASE_URL` has already been selected by deployment target,
 * so PrismaClient consumers never need to infer whether they run in Vercel or
 * Hostinger. Invalid production secrets still terminate before the server
 * accepts a request.
 */
function loadEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('❌  Invalid environment variables:');
    console.error(parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  const config = parsed.data;
  let topology: ReturnType<typeof resolveDatabaseTopology>;
  try {
    topology = resolveDatabaseTopology(config);
  } catch (error) {
    console.error(`❌  Invalid database topology: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  if (config.NODE_ENV === 'production') {
    const unsafeSecrets = new Set([
      'your-super-secret-access-key-32chars-minimum-prod',
      'your-super-secret-refresh-key-32chars-minimum-prod',
      'your-super-secret-access-key-change-in-production',
      'your-super-secret-refresh-key-change-in-production',
    ]);
    if (
      unsafeSecrets.has(config.JWT_ACCESS_SECRET) ||
      unsafeSecrets.has(config.JWT_REFRESH_SECRET) ||
      config.JWT_ACCESS_SECRET.length < 32 ||
      config.JWT_REFRESH_SECRET.length < 32 ||
      config.JWT_ACCESS_SECRET === config.JWT_REFRESH_SECRET
    ) {
      console.error('❌  Production JWT secrets must be explicit, distinct, and at least 32 characters.');
      process.exit(1);
    }
  }
  return { ...config, DEPLOYMENT_TARGET: topology.target, DATABASE_URL: topology.databaseUrl, DIRECT_URL: topology.directUrl };
}

export const env = loadEnv();
export type Env = typeof env;
