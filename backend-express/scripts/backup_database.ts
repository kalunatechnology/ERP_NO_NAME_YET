/**
 * File: backend-express/scripts/backup_database.ts
 *
 * Purpose: Implements database administration script responsibilities for the platform domain.
 * Responsibility: Defines the executable contracts in this file and connects them to their callers without owning unrelated domain behavior.
 * Integration: Used through static imports, Express/Next framework discovery, or an explicit npm/script entry point as applicable.
 * Dependencies and side effects: See each documented function; database, browser storage, network, and response mutations are called out where present.
 */
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import prisma from '../src/config/database';

/**
 * quoteIdentifier executes one step of this explicit database administration script.
 *
 * Database operations: Uses the database/client operations visible in the implementation.
 * Operational contract: It runs only when this script is invoked; it is not part of the normal HTTP request lifecycle.
 * Failure behavior: Rejects/throws to the script entry point so the process can report failure and perform its configured cleanup/disconnect.
 */
function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

/**
 * quoteLiteral executes one step of this explicit database administration script.
 *
 * Database operations: Uses the database/client operations visible in the implementation.
 * Operational contract: It runs only when this script is invoked; it is not part of the normal HTTP request lifecycle.
 * Failure behavior: Rejects/throws to the script entry point so the process can report failure and perform its configured cleanup/disconnect.
 */
function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/**
 * main executes one step of this explicit database administration script.
 *
 * Database operations: Uses the database/client operations visible in the implementation.
 * Operational contract: It runs only when this script is invoked; it is not part of the normal HTTP request lifecycle.
 * Failure behavior: Rejects/throws to the script entry point so the process can report failure and perform its configured cleanup/disconnect.
 */
async function main() {
  const tables = await prisma.$queryRawUnsafe<Array<{ tablename: string }>>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
  );
  const columns = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = 'public'
     ORDER BY table_name, ordinal_position`,
  );

  const exportQuery = tables.map(({ tablename }) => (
    `SELECT ${quoteLiteral(tablename)} AS table_name, ` +
    `COALESCE(jsonb_agg(to_jsonb(row_data)), '[]'::jsonb) AS rows ` +
    `FROM ${quoteIdentifier(tablename)} AS row_data`
  )).join('\nUNION ALL\n');
  const exportedTables = await prisma.$queryRawUnsafe<Array<{ table_name: string; rows: unknown[] }>>(
    exportQuery,
  );
  const data = Object.fromEntries(exportedTables.map((item) => [item.table_name, item.rows]));

  const snapshot = {
    created_at: new Date().toISOString(),
    database_schema: 'public',
    columns,
    data,
  };
  const json = JSON.stringify(snapshot, (_key, value) => (
    typeof value === 'bigint' ? value.toString() : value
  ), 2);
  const digest = crypto.createHash('sha256').update(json).digest('hex');
  const backupDir = path.join(os.tmpdir(), 'marka-erp-db-backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
  const outputPath = path.join(backupDir, `q3-pre-migration-${stamp}.json`);
  fs.writeFileSync(outputPath, json, { encoding: 'utf8', flag: 'wx' });
  fs.writeFileSync(`${outputPath}.sha256`, `${digest}  ${path.basename(outputPath)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });

  const nonEmptyTables = Object.entries(data)
    .filter(([, rows]) => rows.length > 0)
    .map(([table, rows]) => ({ table, rows: rows.length }));
  console.log(JSON.stringify({ outputPath, sha256: digest, tableCount: tables.length, nonEmptyTables }));
}

/**
 * main executes one step of this explicit database administration script.
 *
 * Database operations: Uses the database/client operations visible in the implementation.
 * Operational contract: It runs only when this script is invoked; it is not part of the normal HTTP request lifecycle.
 * Failure behavior: Rejects/throws to the script entry point so the process can report failure and perform its configured cleanup/disconnect.
 */
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
