import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load .env from backend-express root explicitly
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('8001').transform(Number),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 chars'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 chars'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('30m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  CORS_ALLOWED_ORIGINS: z
    .string()
    .default(
      'http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000,http://localhost:5500,http://127.0.0.1:5500',
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

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('❌  Invalid environment variables:');
    console.error(parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();
export type Env = typeof env;
