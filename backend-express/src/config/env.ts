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

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DIRECT_URL: z.string().min(1, 'DIRECT_URL is required for schema migrations'),

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
function loadEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('❌  Invalid environment variables:');
    console.error(parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  const config = parsed.data;
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
  return config;
}

export const env = loadEnv();
export type Env = typeof env;
