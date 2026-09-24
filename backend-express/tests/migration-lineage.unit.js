const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const script = path.resolve(__dirname, '../scripts/deploy_hostinger_migrations.js');
const baseline = '20260922000000_production_baseline';
const conversion = '20260924024500_align_uuid_storage_to_production_text';
const repair = '20260924040000_repair_skipped_text_id_convergence';

async function scenario(uuid, alreadyApplied) {
  const rows = [{ migration_name: baseline, finished_at: new Date() }];
  if (alreadyApplied) rows.push({ migration_name: conversion, finished_at: new Date() });
  const calls = [];
  const client = {
    async $queryRawUnsafe(sql) {
      if (sql.includes('information_schema.columns')) return uuid ? [{ table_name: 'core_tenant', column_name: 'id' }] : [];
      return rows;
    },
  };
  const sandbox = {
    module: { exports: {} }, process, console: { log() {} },
    require(name) {
      if (name === 'node:child_process') return { spawnSync(command, args) {
        calls.push(args);
        rows.push({ migration_name: args.at(-1), finished_at: new Date() });
        return { status: 0 };
      } };
      if (name === './prisma_client') return {};
      return require(name);
    },
  };
  vm.runInNewContext(fs.readFileSync(script, 'utf8'), sandbox);
  const history = new Map(rows.map(row => [row.migration_name, row]));
  await sandbox.module.exports.convergeMigrationLineages('prisma', 'unused', client, history);
  return calls.map(args => args.at(-1));
}

(async () => {
  assert(!(await scenario(true, false)).includes(conversion), 'UUID schema must not have conversion marked applied');
  assert((await scenario(false, false)).includes(conversion), 'TEXT schema can bridge the old conversion');
  assert(!(await scenario(true, true)).includes(conversion), 'Previously applied history must stay immutable');
  for (const uuid of [false, true]) {
    assert(!(await scenario(uuid, true)).includes(repair), 'Forward repair must always remain executable');
  }
  console.log('PASS: physical schema controls conversion bridging; forward repair is never skipped.');
})().catch(error => { console.error(error); process.exitCode = 1; });
