import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { NativeScope } from './marbot-native.service';
import { resourceCatalog } from './marbot-resource.service';

// Discovery exposes metadata only for executable, permission-checked tools.
// Column names are never inferred from *_id naming conventions.
export function readableTables(scope: NativeScope): string[] {
  const tables: string[] = [];
  if (scope.enabledModules.includes('PROJECTS')) {
    if (scope.permissions.includes('READ_PROJECT')) tables.push('project_project');
    if (scope.permissions.includes('READ_TASK')) tables.push('project_daily_task', 'project_weekly_task', 'project_main_task');
  }
  if (scope.enabledModules.includes('FINANCE') && scope.permissions.some(p => ['READ_PROJECT_FINANCE', 'READ_COMPANY_FINANCE', 'READ_FINANCE_SUMMARY'].includes(p))) tables.push('fin_project_cost_entry');
  if (scope.enabledModules.includes('CRM') && scope.permissions.includes('READ_TICKET')) tables.push('service_case');
  const blocked = new Set(scope.blockedReadModules || []);
  return [...new Set([...tables.filter(table => !blocked.has(table.startsWith('project_') ? 'PROJECTS' : table.startsWith('fin_') ? 'FINANCE' : 'CRM')), ...resourceCatalog(scope).map(item => item.model)])];
}

export async function discoverMarbotSchema(scope: NativeScope, db = prisma, requestedTables?: string[]) {
  const tables = readableTables(scope).filter(table => !requestedTables || requestedTables.includes(table));
  if (!tables.length) return { source: 'database', tables: [], columns: [], constraints: [] };
  const columns = await db.$queryRaw(Prisma.sql`
    SELECT table_name::text AS table_name, column_name::text AS column_name, data_type::text AS data_type, is_nullable::text AS is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name IN (${Prisma.join(tables)})
    ORDER BY table_name, ordinal_position
  `);
  const constraints = await db.$queryRaw(Prisma.sql`
    SELECT c.relname::text AS table_name, con.conname::text AS name, con.contype::text AS type,
      pg_get_constraintdef(con.oid, true) AS definition
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname IN (${Prisma.join(tables)})
      AND con.contype IN ('p', 'f', 'c', 'u')
    ORDER BY c.relname, con.conname
  `);
  return { source: 'database', tables, columns, constraints };
}
