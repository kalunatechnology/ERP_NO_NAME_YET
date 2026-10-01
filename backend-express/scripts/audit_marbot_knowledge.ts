import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import prisma from '../src/config/database';

const root = path.resolve(__dirname, '../..');
function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]);
}
async function main() {
  const models = Prisma.dmmf.datamodel.models.map(m => ({
    name: m.name, table: m.dbName || m.name,
    primaryKey: m.primaryKey, uniqueFields: m.uniqueFields,
    fields: m.fields.map(f => ({ name: f.name, column: f.dbName || f.name, type: f.type, kind: f.kind, required: f.isRequired, primaryKey: f.isId, unique: f.isUnique, relation: f.relationName, from: f.relationFromFields, to: f.relationToFields })),
  }));
  const pages = files(path.join(root, 'frontend-next/app')).filter(f => f.endsWith('page.tsx')).map(f => path.relative(root, f).replace(/\\/g, '/'));
  const endpoints = files(path.join(root, 'backend-express/src/modules')).filter(f => f.endsWith('.routes.ts')).map(f => ({
    file: path.relative(root, f).replace(/\\/g, '/'),
    routes: [...fs.readFileSync(f, 'utf8').matchAll(/\b\w+\.(get|post|patch|put|delete|use)\(\s*['"]([^'"]+)['"]/g)].map(m => ({ method: m[1], path: m[2] })),
  }));
  let live: unknown;
  try {
    live = {
      source: 'connected database',
      columns: await prisma.$queryRaw`SELECT table_name::text AS table_name, column_name::text AS column_name, data_type::text AS data_type, is_nullable::text AS is_nullable FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position`,
      constraints: await prisma.$queryRaw`SELECT c.relname::text AS table_name, con.conname::text AS name, con.contype::text AS type, pg_get_constraintdef(con.oid, true) AS definition FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' ORDER BY c.relname, con.conname`,
    };
  } catch { live = { source: 'unavailable', error: 'Live metadata could not be verified. Prisma metadata is the compiled application contract, not evidence of deployed constraints.' }; }
  const schema = fs.readFileSync(path.join(root, 'backend-express/prisma/schema.prisma'), 'utf8');
  const report = { generatedAt: new Date().toISOString(), schemaHash: createHash('sha256').update(schema).digest('hex'), models, enums: Prisma.dmmf.datamodel.enums, pages, endpoints, live };
  const dir = path.join(root, 'docs/marbot');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'system-inventory.json'), JSON.stringify(report, null, 2));
  console.log(`Inventory: ${models.length} models, ${pages.length} pages. Live metadata: ${(live as any).source}.`);
}
main().catch(() => { console.error('Inventory generation failed.'); process.exitCode = 1; }).finally(() => prisma.$disconnect());
