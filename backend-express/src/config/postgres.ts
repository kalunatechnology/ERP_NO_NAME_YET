import type { PoolConfig } from 'pg';

/** Converts Prisma-style URL pool hints into node-postgres pool options. */
export function postgresPoolConfig(connectionString: string): PoolConfig {
  const url = new URL(connectionString);
  const connectionLimit = Number(url.searchParams.get('connection_limit') ?? '3');
  const connectTimeoutSeconds = Number(url.searchParams.get('connect_timeout') ?? '30');
  const sslMode = url.searchParams.get('sslmode')?.toLowerCase();

  // These two parameters belong to Prisma's Rust connector. node-postgres
  // receives their equivalents as typed PoolConfig options instead.
  url.searchParams.delete('connection_limit');
  url.searchParams.delete('connect_timeout');
  // PostgreSQL sslmode=require means encryption without CA/hostname
  // verification. Configure that explicitly because recent node-postgres
  // versions otherwise inherit Node's CA verification and reject Supabase's
  // certificate chain on some shared-hosting images.
  if (sslMode === 'require' || sslMode === 'no-verify') url.searchParams.delete('sslmode');

  return {
    connectionString: url.toString(),
    max: Number.isFinite(connectionLimit) ? Math.min(10, Math.max(1, connectionLimit)) : 3,
    connectionTimeoutMillis: Number.isFinite(connectTimeoutSeconds)
      ? Math.min(60, Math.max(1, connectTimeoutSeconds)) * 1000
      : 30_000,
    ...(sslMode === 'require' || sslMode === 'no-verify'
      ? { ssl: { rejectUnauthorized: false } }
      : {}),
  };
}
