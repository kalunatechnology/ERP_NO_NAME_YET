/** Read-only static evidence collector for route/data-loading performance. */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const backendRoot = path.join(root, 'backend-express', 'src', 'modules');
const frontendRoots = [
  path.join(root, 'frontend-next', 'app'),
  path.join(root, 'frontend-next', 'components'),
  path.join(root, 'frontend-next', 'lib'),
];

function filesUnder(directory, extensions) {
  const result = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (['node_modules', '.next', 'dist'].includes(entry.name)) continue;
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (extensions.includes(path.extname(entry.name))) result.push(target);
    }
  };
  visit(directory);
  return result;
}

function lineAt(source, offset) {
  return source.slice(0, offset).split(/\r?\n/).length;
}

/** Returns a balanced call expression beginning at the supplied opening parenthesis. */
function balancedCall(source, opening) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = opening; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '(') depth += 1;
    if (char === ')') {
      depth -= 1;
      if (depth === 0) return source.slice(opening, index + 1);
    }
  }
  return source.slice(opening);
}

const unboundedReads = [];
const queryCounts = [];
for (const file of filesUnder(backendRoot, ['.ts'])) {
  const source = fs.readFileSync(file, 'utf8');
  const relative = path.relative(root, file).replaceAll('\\', '/');
  const queries = [...source.matchAll(/\b(?:prisma|tx)\.[A-Za-z0-9_]+\.(findMany|findFirst|findUnique|count|aggregate|groupBy|create|update|delete)\s*\(/g)];
  if (queries.length) queryCounts.push({ file: relative, query_calls: queries.length });
  for (const match of source.matchAll(/\.findMany\s*\(/g)) {
    const opening = match.index + match[0].lastIndexOf('(');
    const call = balancedCall(source, opening);
    if (!/\b(take|skip|cursor)\s*:/.test(call)) {
      unboundedReads.push({ file: relative, line: lineAt(source, match.index), evidence: call.slice(0, 240).replace(/\s+/g, ' ') });
    }
  }
}

const oversizedFrontendRequests = [];
const frontendCallCounts = [];
for (const base of frontendRoots) {
  for (const file of filesUnder(base, ['.ts', '.tsx'])) {
    const source = fs.readFileSync(file, 'utf8');
    const relative = path.relative(root, file).replaceAll('\\', '/');
    const calls = [...source.matchAll(/\b(?:api\.(?:get|post|put|patch|delete)|fetch)\s*\(/g)];
    if (calls.length) frontendCallCounts.push({ file: relative, http_calls: calls.length });
    for (const match of source.matchAll(/page_size=(\d+)/g)) {
      const pageSize = Number(match[1]);
      if (pageSize > 50) oversizedFrontendRequests.push({ file: relative, line: lineAt(source, match.index), page_size: pageSize });
    }
  }
}

const result = {
  generated_at: new Date().toISOString(),
  classification: 'Candidates require manual route-level verification; static evidence is not a performance benchmark.',
  totals: {
    backend_files_with_queries: queryCounts.length,
    unbounded_find_many_candidates: unboundedReads.length,
    frontend_files_with_http_calls: frontendCallCounts.length,
    frontend_page_size_over_50: oversizedFrontendRequests.length,
  },
  backend_query_counts: queryCounts.sort((a, b) => b.query_calls - a.query_calls),
  unbounded_find_many_candidates: unboundedReads,
  frontend_http_call_counts: frontendCallCounts.sort((a, b) => b.http_calls - a.http_calls),
  frontend_oversized_page_requests: oversizedFrontendRequests,
};

const output = path.join(__dirname, 'ROUTE_PERFORMANCE_EVIDENCE.json');
fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ output, ...result.totals }, null, 2));
