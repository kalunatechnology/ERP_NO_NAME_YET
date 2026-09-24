/**
 * Read-only physical database architecture audit.
 *
 * The production ERP baseline stores Prisma String identifiers as PostgreSQL
 * TEXT. This script verifies that a deployed database follows that contract and
 * emits a stable SHA-256 fingerprint of the public schema so two environments
 * can be compared without comparing their data.
 *
 * Usage:
 *   npm run audit:db-architecture
 *
 * Optional:
 *   EXPECTED_DB_ARCHITECTURE_FINGERPRINT=<sha256> npm run audit:db-architecture
 */
const crypto = require('node:crypto');
const { Pool } = require('pg');

function runtimeDatabaseUrl() {
  const target = process.env.DEPLOYMENT_TARGET;
  if (target === 'hostinger') {
    return process.env.SUPABASE_DIRECT_URL || process.env.DIRECT_URL || process.env.DATABASE_URL;
  }
  return process.env.DATABASE_URL || process.env.DIRECT_URL;
}

function poolConfig(connectionString) {
  if (!connectionString) throw new Error('Database URL is required for architecture audit.');
  const url = new URL(connectionString);
  const sslMode = url.searchParams.get('sslmode')?.toLowerCase();
  url.searchParams.delete('connection_limit');
  url.searchParams.delete('connect_timeout');
  if (sslMode === 'require' || sslMode === 'no-verify') url.searchParams.delete('sslmode');
  return {
    connectionString: url.toString(),
    max: 1,
    connectionTimeoutMillis: 30_000,
    ...(sslMode === 'require' || sslMode === 'no-verify'
      ? { ssl: { rejectUnauthorized: false } }
      : {}),
  };
}

async function main() {
  const pool = new Pool(poolConfig(runtimeDatabaseUrl()));
  try {
    const columns = await pool.query(`
      SELECT
        c.table_name,
        c.ordinal_position,
        c.column_name,
        c.data_type,
        c.udt_name,
        c.is_nullable,
        COALESCE(c.column_default, '') AS column_default
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name <> '_prisma_migrations'
      ORDER BY c.table_name, c.ordinal_position
    `);

    const constraints = await pool.query(`
      SELECT
        cls.relname AS table_name,
        con.conname AS constraint_name,
        con.contype AS constraint_type,
        pg_get_constraintdef(con.oid, true) AS definition
      FROM pg_constraint con
      JOIN pg_class cls ON cls.oid = con.conrelid
      JOIN pg_namespace ns ON ns.oid = cls.relnamespace
      WHERE ns.nspname = 'public'
        AND cls.relname <> '_prisma_migrations'
      ORDER BY cls.relname, con.conname
    `);

    const indexes = await pool.query(`
      SELECT tablename AS table_name, indexname AS index_name, indexdef AS definition
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename <> '_prisma_migrations'
      ORDER BY tablename, indexname
    `);

    const uuidColumns = columns.rows.filter((row) => row.data_type === 'uuid');
    if (uuidColumns.length) {
      const locations = uuidColumns.map((row) => `${row.table_name}.${row.column_name}`).join(', ');
      throw new Error(
        `Physical schema diverges from production TEXT-ID baseline; UUID columns remain: ${locations}`,
      );
    }

    const normalized = JSON.stringify({
      columns: columns.rows,
      constraints: constraints.rows,
      indexes: indexes.rows,
    });
    const fingerprint = crypto.createHash('sha256').update(normalized).digest('hex');
    const expected = String(process.env.EXPECTED_DB_ARCHITECTURE_FINGERPRINT || '').trim();

    console.log(`Database architecture fingerprint: ${fingerprint}`);
    console.log(`Tables/columns: ${new Set(columns.rows.map((row) => row.table_name)).size}/${columns.rows.length}`);
    console.log(`Constraints/indexes: ${constraints.rows.length}/${indexes.rows.length}`);
    console.log('ID storage contract: TEXT-backed (no PostgreSQL UUID columns in public schema)');

    if (expected && expected !== fingerprint) {
      throw new Error(`Database architecture fingerprint mismatch: expected ${expected}, received ${fingerprint}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`Database architecture audit failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
