// Run only against the disposable local PostgreSQL test instance.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const { repairTextIdSchema } = require('../scripts/repair_text_id_schema');
const client = new Client({ host: '127.0.0.1', port: 55439, user: 'postgres', database: process.env.TEXT_ID_TEST_DATABASE || 'postgres' });
const sql = name => fs.readFileSync(path.join(__dirname, '../prisma/migrations', name, 'migration.sql'), 'utf8');
(async () => {
  await client.connect();
  try {
    await client.query(sql('20260922000000_production_baseline'));
    await client.query(`
      CREATE TABLE repair_parent (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE repair_child (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), parent_id uuid REFERENCES repair_parent(id) ON DELETE CASCADE);
      INSERT INTO repair_parent VALUES ('11111111-1111-4111-8111-111111111111');
      INSERT INTO repair_child(parent_id) VALUES ('11111111-1111-4111-8111-111111111111');
      CREATE VIEW custom_dependency AS SELECT id FROM repair_parent;
    `);
    const repair = sql('20260924040000_repair_skipped_text_id_convergence');
    const connection = `postgresql://postgres@127.0.0.1:55439/${process.env.TEXT_ID_TEST_DATABASE || 'postgres'}`;
    await assert.rejects(repairTextIdSchema(connection), /blocked by dependent view/);
    assert.equal((await client.query("SELECT pg_typeof(id)::text AS type FROM repair_parent")).rows[0].type, 'uuid');
    await client.query('DROP VIEW custom_dependency');
    await repairTextIdSchema(connection);
    await client.query(repair);
    assert.equal((await client.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='public' AND data_type='uuid'")).rows[0].n, 0);
    assert.equal((await client.query('SELECT id FROM repair_parent')).rows[0].id, '11111111-1111-4111-8111-111111111111');
    await client.query('INSERT INTO repair_parent DEFAULT VALUES');
    await assert.rejects(client.query("INSERT INTO repair_child(parent_id) VALUES ('missing')"), /foreign key/);
    await repairTextIdSchema(connection);
    await client.query(repair);
    assert.equal((await client.query('SELECT count(*)::int AS n FROM repair_child')).rows[0].n, 1);
    console.log('PASS: repair rollback, UUID conversion, preserved values/defaults/FKs, view recreation, and repeat execution.');
  } finally {
    await client.end();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
