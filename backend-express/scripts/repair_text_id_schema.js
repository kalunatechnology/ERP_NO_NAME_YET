const { Pool } = require('pg');
const { postgresPoolConfig } = require('./prisma_client');

const OWNED_VIEWS = [
  'ai_crm_deals',
  'ai_finance_summary',
  'ai_project_finance_summary',
  'ai_project_tasks',
  'ai_projects',
  'view_crm_sales_dashboard',
  'view_project_timeline_cost',
  'view_project_dashboard',
  'view_finance_main_dashboard',
];

function ident(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

async function rows(pool, sql, params = []) {
  return (await pool.query(sql, params)).rows;
}

async function prepareRecoveryCatalog(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public._erp_text_id_fk_restore (
      table_schema text NOT NULL,
      table_name text NOT NULL,
      constraint_name text NOT NULL,
      constraint_definition text NOT NULL,
      PRIMARY KEY (table_schema, table_name, constraint_name)
    );
    CREATE TABLE IF NOT EXISTS public._erp_text_id_default_restore (
      table_schema text NOT NULL,
      table_name text NOT NULL,
      column_name text NOT NULL,
      default_expression text NOT NULL,
      PRIMARY KEY (table_schema, table_name, column_name)
    );
  `);

  await pool.query(`
    INSERT INTO public._erp_text_id_fk_restore
      (table_schema, table_name, constraint_name, constraint_definition)
    SELECT ns.nspname::text, cls.relname::text, con.conname::text,
           pg_get_constraintdef(con.oid, true)
    FROM pg_constraint con
    JOIN pg_class cls ON cls.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = cls.relnamespace
    WHERE con.contype = 'f' AND ns.nspname = 'public'
      AND (
        EXISTS (
          SELECT 1 FROM unnest(con.conkey) AS key(attnum)
          JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = key.attnum
          WHERE a.atttypid = 'uuid'::regtype
        )
        OR EXISTS (
          SELECT 1 FROM unnest(con.confkey) AS key(attnum)
          JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = key.attnum
          WHERE a.atttypid = 'uuid'::regtype
        )
      )
    ON CONFLICT DO NOTHING;

    INSERT INTO public._erp_text_id_default_restore
      (table_schema, table_name, column_name, default_expression)
    SELECT ns.nspname::text, cls.relname::text, attr.attname::text,
           pg_get_expr(def.adbin, def.adrelid)
    FROM pg_attribute attr
    JOIN pg_class cls ON cls.oid = attr.attrelid
    JOIN pg_namespace ns ON ns.oid = cls.relnamespace
    JOIN pg_attrdef def ON def.adrelid = attr.attrelid AND def.adnum = attr.attnum
    WHERE ns.nspname = 'public' AND cls.relkind IN ('r', 'p')
      AND attr.attnum > 0 AND NOT attr.attisdropped
      AND attr.atttypid = 'uuid'::regtype
    ON CONFLICT DO NOTHING;
  `);
}

async function dropOwnedViews(pool) {
  for (const view of OWNED_VIEWS) {
    const found = await rows(pool, `
      SELECT c.relkind::text AS relkind
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = $1
    `, [view]);
    if (found[0]?.relkind === 'v' || found[0]?.relkind === 'm') {
      await pool.query(`DROP ${found[0].relkind === 'm' ? 'MATERIALIZED ' : ''}VIEW public.${ident(view)}`);
    }
  }
}

async function assertNoUnknownDependentViews(pool) {
  const dependent = await rows(pool, `
    SELECT DISTINCT format('%I.%I', view_ns.nspname, view_cls.relname) AS view_name
    FROM pg_depend dep
    JOIN pg_rewrite rewrite ON rewrite.oid = dep.objid
    JOIN pg_class view_cls ON view_cls.oid = rewrite.ev_class
    JOIN pg_namespace view_ns ON view_ns.oid = view_cls.relnamespace
    JOIN pg_attribute attr ON attr.attrelid = dep.refobjid AND attr.attnum = dep.refobjsubid
    WHERE dep.classid = 'pg_rewrite'::regclass
      AND dep.refclassid = 'pg_class'::regclass
      AND view_ns.nspname = 'public'
      AND view_cls.relkind IN ('v', 'm')
      AND attr.atttypid = 'uuid'::regtype
      AND NOT (view_cls.relname::text = ANY($1::text[]))
  `, [OWNED_VIEWS]);
  if (dependent.length) {
    throw new Error(`UUID-to-TEXT convergence blocked by dependent view(s): ${dependent.map(row => row.view_name).join(', ')}`);
  }
}

async function dropForeignKeysAndDefaults(pool) {
  const foreignKeys = await rows(pool, `SELECT * FROM public._erp_text_id_fk_restore ORDER BY table_name, constraint_name`);
  for (const item of foreignKeys) {
    const exists = await rows(pool, `
      SELECT 1 FROM pg_constraint con
      JOIN pg_class cls ON cls.oid = con.conrelid
      JOIN pg_namespace ns ON ns.oid = cls.relnamespace
      WHERE ns.nspname = $1 AND cls.relname = $2 AND con.conname = $3
    `, [item.table_schema, item.table_name, item.constraint_name]);
    if (exists.length) {
      await pool.query(`ALTER TABLE ${ident(item.table_schema)}.${ident(item.table_name)} DROP CONSTRAINT ${ident(item.constraint_name)}`);
    }
  }

  const defaults = await rows(pool, `SELECT * FROM public._erp_text_id_default_restore ORDER BY table_name, column_name`);
  for (const item of defaults) {
    await pool.query(`ALTER TABLE ${ident(item.table_schema)}.${ident(item.table_name)} ALTER COLUMN ${ident(item.column_name)} DROP DEFAULT`);
  }
}

async function convertUuidTables(pool) {
  const columns = await rows(pool, `
    SELECT table_schema::text AS table_schema, table_name::text AS table_name,
           column_name::text AS column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND data_type = 'uuid'
    ORDER BY table_name, ordinal_position
  `);
  const tables = new Map();
  for (const column of columns) {
    const key = `${column.table_schema}.${column.table_name}`;
    if (!tables.has(key)) tables.set(key, { ...column, columns: [] });
    tables.get(key).columns.push(column.column_name);
  }
  for (const table of tables.values()) {
    const clauses = table.columns.map(column =>
      `ALTER COLUMN ${ident(column)} TYPE text USING ${ident(column)}::text`,
    ).join(', ');
    console.log(`Converting UUID columns on ${table.table_schema}.${table.table_name} (${table.columns.length})`);
    await pool.query(`ALTER TABLE ${ident(table.table_schema)}.${ident(table.table_name)} ${clauses}`);
  }
}

async function restoreDefaultsAndForeignKeys(pool) {
  const defaults = await rows(pool, `SELECT * FROM public._erp_text_id_default_restore ORDER BY table_name, column_name`);
  for (const item of defaults) {
    await pool.query(
      `ALTER TABLE ${ident(item.table_schema)}.${ident(item.table_name)} ALTER COLUMN ${ident(item.column_name)} SET DEFAULT ((${item.default_expression})::text)`,
    );
  }

  const foreignKeys = await rows(pool, `SELECT * FROM public._erp_text_id_fk_restore ORDER BY table_name, constraint_name`);
  for (const item of foreignKeys) {
    const exists = await rows(pool, `
      SELECT 1 FROM pg_constraint con
      JOIN pg_class cls ON cls.oid = con.conrelid
      JOIN pg_namespace ns ON ns.oid = cls.relnamespace
      WHERE ns.nspname = $1 AND cls.relname = $2 AND con.conname = $3
    `, [item.table_schema, item.table_name, item.constraint_name]);
    if (!exists.length) {
      await pool.query(`ALTER TABLE ${ident(item.table_schema)}.${ident(item.table_name)} ADD CONSTRAINT ${ident(item.constraint_name)} ${item.constraint_definition}`);
    }
  }
}

async function repairTextIdSchema(connectionString) {
  const pool = new Pool({ ...postgresPoolConfig(connectionString), max: 1 });
  let locked = false;
  try {
    await pool.query(`SELECT pg_advisory_lock(hashtext('erp_text_id_schema_repair'))`);
    locked = true;
    await assertNoUnknownDependentViews(pool);
    await dropOwnedViews(pool);
    await prepareRecoveryCatalog(pool);
    await dropForeignKeysAndDefaults(pool);
    await convertUuidTables(pool);
    await restoreDefaultsAndForeignKeys(pool);
    await pool.query(`DROP TABLE public._erp_text_id_fk_restore, public._erp_text_id_default_restore`);
  } finally {
    if (locked) await pool.query(`SELECT pg_advisory_unlock(hashtext('erp_text_id_schema_repair'))`);
    await pool.end();
  }
}

module.exports = { repairTextIdSchema };
