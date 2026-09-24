// Read-only deployment diagnosis; never print connection credentials.
require('dotenv').config({ quiet: true });
const { Pool } = require('pg');
const { postgresPoolConfig } = require('./prisma_client');
let connection = process.env.SUPABASE_DIRECT_URL || process.env.DIRECT_URL;
if (process.argv.includes('--session-pooler')) {
  const direct = new URL(connection);
  const pooler = new URL(process.env.DATABASE_URL);
  const project = direct.hostname.split('.')[1];
  if (!pooler.hostname.endsWith('.pooler.supabase.com') || !decodeURIComponent(pooler.username).endsWith(`.${project}`)) {
    throw new Error('Pooler does not identify the same Supabase project.');
  }
  pooler.port = '5432';
  connection = pooler.toString();
}
const pool = new Pool(postgresPoolConfig(connection));
(async () => {
  try {
    console.log(JSON.stringify((await pool.query(`
      SELECT migration_name, finished_at, rolled_back_at, applied_steps_count
      FROM public._prisma_migrations ORDER BY started_at
    `)).rows, null, 2));
    console.log(JSON.stringify((await pool.query(`
      SELECT count(*) AS uuid_columns FROM information_schema.columns
      WHERE table_schema = 'public' AND data_type = 'uuid'
    `)).rows));
  } catch (error) {
    console.error('Database inspection failed:', error.code || error.name);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
