/**
 * File: backend-express/scripts/generate_scope_patch.mjs
 *
 * Purpose: Implements database administration script responsibilities for the platform domain.
 * Responsibility: Defines the executable contracts in this file and connects them to their callers without owning unrelated domain behavior.
 * Integration: Used through static imports, Express/Next framework discovery, or an explicit npm/script entry point as applicable.
 * Dependencies and side effects: See each documented function; database, browser storage, network, and response mutations are called out where present.
 */
import fs from 'fs';
import path from 'path';

const schemaPath = path.resolve('prisma/schema.prisma');
const schema = fs.readFileSync(schemaPath, 'utf8');
const globalModels = new Set([
  'core_tenant',
  'core_company',
  'core_document_template',
  'core_document_template_version',
  'core_document_template_field',
  'iam_user',
  'iam_role',
  'iam_permission',
  'iam_user_company_membership',
  'iam_company_module_access',
  'master_currency',
]);

const additions = [
  ['tenant_id', '  tenant_id                    String? @map("tenant_id")'],
  ['company_id', '  company_id                   String? @map("company_id")'],
  ['created_by_id', '  created_by_id                String? @map("created_by_id")'],
  ['created_at', '  created_at                   DateTime? @default(now())'],
  ['updated_at', '  updated_at                   DateTime? @updatedAt'],
];

const patches = [];
for (const match of schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
  const name = match[1];
  const body = match[2];
  if (globalModels.has(name)) continue;

  const missing = additions
    .filter(([field]) => !new RegExp(`^\\s*${field}\\s`, 'm').test(body))
    .map(([, declaration]) => `+${declaration}`);
  const hasTenant = /^\s*tenant_id\s/m.test(body);
  const hasCompany = /^\s*company_id\s/m.test(body);
  const indexLine = '  @@index([tenant_id, company_id])';
  if (!hasTenant || !hasCompany) {
    missing.push(`+${indexLine}`);
  } else if (!body.includes(indexLine)) {
    missing.push(`+${indexLine}`);
  }
  if (!missing.length) continue;
  patches.push(`@@\n model ${name} {\n${missing.join('\n')}`);
}

process.stdout.write(`*** Begin Patch\n*** Update File: ${schemaPath}\n${patches.join('\n')}\n*** End Patch\n`);
