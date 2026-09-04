/**
 * File: backend-express/scripts/apply_sql_migration.ts
 *
 * Purpose: Implements database administration script responsibilities for the platform domain.
 * Responsibility: Defines the executable contracts in this file and connects them to their callers without owning unrelated domain behavior.
 * Integration: Used through static imports, Express/Next framework discovery, or an explicit npm/script entry point as applicable.
 * Dependencies and side effects: See each documented function; database, browser storage, network, and response mutations are called out where present.
 */
import fs from 'fs';
import path from 'path';
import prisma from '../src/config/database';

/**
 * splitSql executes one step of this explicit database administration script.
 *
 * Database operations: Uses the database/client operations visible in the implementation.
 * Operational contract: It runs only when this script is invoked; it is not part of the normal HTTP request lifecycle.
 * Failure behavior: Rejects/throws to the script entry point so the process can report failure and perform its configured cleanup/disconnect.
 */
function splitSql(source: string): string[] {
  source = source.replace(/--.*$/gm, '');
  const statements: string[] = [];
  let current = '';
  let quote: "'" | '"' | null = null;
  let dollarTag: string | null = null;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]!;
    const rest = source.slice(i);
    if (!quote) {
      const dollar = rest.match(/^\$[A-Za-z0-9_]*\$/)?.[0];
      if (dollar) {
        if (dollarTag === dollar) dollarTag = null;
        else if (!dollarTag) dollarTag = dollar;
        current += dollar;
        i += dollar.length - 1;
        continue;
      }
    }
    if (!dollarTag) {
      if (quote && char === quote && source[i - 1] !== '\\') quote = null;
      else if (!quote && (char === "'" || char === '"')) quote = char;
      if (!quote && char === ';') {
        const statement = current.trim();
        if (statement && !['BEGIN', 'COMMIT'].includes(statement.toUpperCase())) statements.push(statement);
        current = '';
        continue;
      }
    }
    current += char;
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

/**
 * main executes one step of this explicit database administration script.
 *
 * Database operations: Uses the database/client operations visible in the implementation.
 * Operational contract: It runs only when this script is invoked; it is not part of the normal HTTP request lifecycle.
 * Failure behavior: Rejects/throws to the script entry point so the process can report failure and perform its configured cleanup/disconnect.
 */
async function main() {
  const relative = process.argv[2];
  if (!relative) throw new Error('Migration file path is required.');
  const file = path.resolve(process.cwd(), relative);
  const root = path.resolve(process.cwd(), 'prisma', 'migrations');
  if (!file.startsWith(`${root}${path.sep}`)) throw new Error('Migration must be inside prisma/migrations.');
  const statements = splitSql(fs.readFileSync(file, 'utf8'));
  await prisma.$transaction(async (tx) => {
    for (const statement of statements) await tx.$executeRawUnsafe(statement);
  }, { timeout: 180_000, maxWait: 30_000 });
  console.log(JSON.stringify({ migration: path.basename(file), statements: statements.length, status: 'applied' }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
