import { Prisma } from '@prisma/client';
import prisma from '../../../config/database';
import { NativeScope } from '../brain/reasoning/native.service';
import { resourceCatalog } from './resource.service';
import { rankResourceCandidates, resourceIntentTerms, shortestResourcePaths, type ResourceGraphEdge } from './resource-semantics';

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

const schemaStopWords = new Set(['data', 'database', 'database', 'tampilkan', 'daftar', 'berapa', 'tolong', 'please', 'show', 'list', 'the', 'untuk', 'dari', 'yang', 'dan', 'status', 'apa', 'ini', 'itu']);

function schemaWords(value: string): string[] {
  return [...new Set(value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[._/-]+/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').split(/\s+/)
    .filter(word => word.length > 2 && !schemaStopWords.has(word)))];
}

function schemaPhraseMatches(query: string, term: string): boolean {
  const normalize = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[._/-]+/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
  return ` ${normalize(query)} `.includes(` ${normalize(term)} `);
}

/** Permission-scoped schema search: returns a bounded metadata shortlist, never
 * business row samples or SQL. Lexical field evidence supplements curated aliases.
 */
export function searchMarbotSchema(scope: NativeScope, query: string, limit = 3) {
  const resources = resourceCatalog(scope);
  const semantic = rankResourceCandidates(query, resources);
  const semanticScores = new Map(semantic.map(item => [item.key, item]));
  const terms = schemaWords(query);
  const ranked = resources.map(resource => {
    const hits: string[] = [];
    let fieldScore = 0;
    for (const field of resource.fields) {
      const fieldTerms = schemaWords(field.name.replace(/_/g, ' '));
      const matching = terms.filter(term => fieldTerms.some(candidate => candidate === term || candidate.startsWith(term) || term.startsWith(candidate)));
      if (matching.length) {
        fieldScore += matching.length * 1.4;
        hits.push(...matching.map(term => `${term} → ${field.name}`));
      }
    }
    const alias = semanticScores.get(resource.key);
    const curatedMatch = resourceIntentTerms(resource.key).some(term => schemaPhraseMatches(query, term));
    const aliasScore = alias ? alias.score * (curatedMatch ? 4 : 1) : 0;
    const score = aliasScore + fieldScore * (curatedMatch ? 0.6 : 1);
    return { resource, score, matchedTerms: [...new Set([...(alias?.matchedTerms ?? []), ...hits])].slice(0, 8) };
  }).filter(item => item.score > 0).sort((a, b) => b.score - a.score || a.resource.key.localeCompare(b.resource.key));
  const candidates = ranked.slice(0, Math.max(1, Math.min(limit, 3))).map((item, index) => {
    const margin = item.score - (ranked[index + 1]?.score ?? 0);
    const confidence = item.score >= 100 ? 0.99 : item.score >= 4.5 && margin >= 1.25 ? 0.9 : item.score >= 4 ? 0.78 : 0.55;
    const matchingFields = item.resource.fields.filter(field => item.matchedTerms.some(hit => hit.endsWith(`→ ${field.name}`)));
    const fallbackFields = item.resource.fields.filter(field => field.isId || /(?:^|_)(?:code|number|name|status|type|date|created_at|updated_at|customer_party_id)(?:_|$)/i.test(field.name));
    return { key: item.resource.key, module: item.resource.module, model: item.resource.model,
      confidence, matchedTerms: item.matchedTerms,
      fields: (matchingFields.length ? matchingFields : fallbackFields).slice(0, 8)
        .map(field => ({ name: field.name, type: field.type, required: field.isRequired && !field.hasDefaultValue })),
      relationships: item.resource.relationships.slice(0, 8) };
  });
  const ambiguous = ranked.length > 1 && ranked[0].score - ranked[1].score < 1.25;
  const relationshipPaths = candidates.flatMap((candidate, index) => candidates.slice(index + 1).flatMap(target =>
    shortestResourcePaths(candidate.key, target.key, resources as unknown as Array<{ key: string; relationships: ResourceGraphEdge[] }>, 3, 1)
      .map(path => ({ from: candidate.key, to: target.key, ...path }))));
  return { query, source: 'permission-scoped-prisma-schema', limit: candidates.length, ambiguous, candidates, relationshipPaths };
}
