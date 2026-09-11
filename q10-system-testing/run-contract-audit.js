/**
 * Q10 read-only Express–Next contract audit.
 *
 * Scans backend route declarations and frontend Axios/native-fetch calls,
 * normalizes dynamic path segments, and reports likely contract, security, and
 * test-coverage gaps. It does not start servers, connect to a database, or
 * modify application files.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const backend = path.join(root, 'backend-express');
const frontend = path.join(root, 'frontend-next');

/** Recursively reads relevant source files while excluding generated folders. */
function filesUnder(directory, extensions = ['.ts', '.tsx', '.js']) {
  const result = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (['node_modules', '.next', 'dist', '.git'].includes(entry.name)) continue;
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (extensions.includes(path.extname(entry.name))) result.push(target);
    }
  };
  visit(directory);
  return result;
}

/** Replaces interpolation, UUID-like values, and trailing slash differences. */
function normalizePath(value) {
  return value
    .replace(/\$\{[^}]+\}/g, ':param')
    .replace(/:[A-Za-z_][A-Za-z0-9_]*/g, ':param')
    .replace(/\/+/g, '/')
    .replace(/\?.*$/, '')
    .replace(/\/$/, '') || '/';
}

/** Creates an endpoint identity suitable for static route matching. */
function endpoint(method, route) {
  return `${method.toUpperCase()} ${normalizePath(route)}`;
}

/** Extract complete call bodies without relying on a fragile character limit. */
function callBodies(source, callee) {
  const bodies = [];
  const marker = `${callee}(`;
  let cursor = 0;
  while ((cursor = source.indexOf(marker, cursor)) !== -1) {
    const open = cursor + marker.length - 1;
    let depth = 0;
    let quote = null;
    let escaped = false;
    let lineComment = false;
    let blockComment = false;
    let completed = false;
    for (let index = open; index < source.length; index += 1) {
      const char = source[index];
      const next = source[index + 1];
      if (lineComment) {
        if (char === '\n') lineComment = false;
        continue;
      }
      if (blockComment) {
        if (char === '*' && next === '/') {
          blockComment = false;
          index += 1;
        }
        continue;
      }
      if (quote) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === quote) quote = null;
        continue;
      }
      if (char === '/' && next === '/') {
        lineComment = true;
        index += 1;
        continue;
      }
      if (char === '/' && next === '*') {
        blockComment = true;
        index += 1;
        continue;
      }
      if (char === "'" || char === '"' || char === '`') {
        quote = char;
        continue;
      }
      if (char === '(') depth += 1;
      if (char === ')' && --depth === 0) {
        bodies.push(source.slice(open + 1, index));
        cursor = index + 1;
        completed = true;
        break;
      }
    }
    if (!completed) cursor = open + 1;
  }
  return bodies;
}

/** Expands the exact public contract registered by createCrudRouter. */
function crudRouteRecords(base, file, kind) {
  return [
    ['get', base],
    ['post', base],
    ['get', `${base}/metadata`],
    ['post', `${base}/bulk-create`],
    ['patch', `${base}/bulk-update`],
    ['post', `${base}/bulk-delete`],
    ['get', `${base}/:param`],
    ['put', `${base}/:param`],
    ['patch', `${base}/:param`],
    ['delete', `${base}/:param`],
  ].map(([method, routePath]) => ({ method, path: normalizePath(routePath), file, kind }));
}

/** Adds route records from a backend router source file. */
function extractRouterRoutes(file, mounts) {
  const source = fs.readFileSync(file, 'utf8');
  const routeRecords = [];
  const routerNames = new Set([...source.matchAll(/export\s+const\s+(\w+Router)\s*=\s*Router\(\)/g)].map((m) => m[1]));
  // Accounts mounts one resource function on two routers. Treat its local
  // `router` parameter as both public/authenticated route mounts.
  if (source.includes('mountAccountResources(accountsRouter)')) routerNames.add('router');
  for (const router of routerNames) {
    const prefixes = router === 'router'
      ? [...(mounts.get('accountsRouter') || []), ...(mounts.get('authRouter') || [])]
      : mounts.get(router) || [];
    const direct = new RegExp(`${router}\\.(get|post|put|patch|delete)\\(\\s*['\"]([^'\"]+)`, 'g');
    for (const match of source.matchAll(direct)) {
      for (const prefix of prefixes) routeRecords.push({ method: match[1], path: normalizePath(`${prefix}/${match[2]}`), file, kind: 'custom' });
    }
    const useBodies = callBodies(source, `${router}.use`);
    for (const body of useBodies) {
      const match = /^\s*['"]([^'"]+)['"]/.exec(body);
      if (!match || !/\bcreateCrudRouter\s*\(/.test(body)) continue;
      for (const prefix of prefixes) {
        const base = normalizePath(`${prefix}/${match[1]}`);
        routeRecords.push(...crudRouteRecords(base, file, 'generic'));
      }
    }
    // Some routers wrap CRUD factory creation in a local helper (for example
    // `rolesCrud()`). Resolve that indirection when the helper is local.
    for (const body of useBodies) {
      const match = /^\s*['"]([^'"]+)['"][\s\S]*?\b(\w+Crud)\s*\(\s*\)/.exec(body);
      if (!match) continue;
      if (!new RegExp(`(?:const|function)\\s+${match[2]}[\\s\\S]{0,600}?createCrudRouter`).test(source)) continue;
      for (const prefix of prefixes) {
        const base = normalizePath(`${prefix}/${match[1]}`);
        routeRecords.push(...crudRouteRecords(base, file, 'generic-helper'));
      }
    }
  }
  return routeRecords;
}

/** Reads app mount declarations to resolve router-local paths into API paths. */
function backendRoutes() {
  const appFile = path.join(backend, 'src', 'app.ts');
  const app = fs.readFileSync(appFile, 'utf8');
  const mounts = new Map();
  for (const body of callBodies(app, 'apiV1.use')) {
    const pathMatch = /^\s*['"]([^'"]+)['"]/.exec(body);
    const routerMatches = [...body.matchAll(/\b(\w+Router)\b/g)];
    const routerName = routerMatches.at(-1)?.[1];
    if (!pathMatch || !routerName) continue;
    const prefix = normalizePath(`/api/v1/${pathMatch[1]}`);
    mounts.set(routerName, [...(mounts.get(routerName) || []), prefix]);
  }
  const records = [{ method: 'get', path: '/health', file: appFile, kind: 'custom' }];
  for (const file of filesUnder(path.join(backend, 'src', 'modules')).filter((item) => item.endsWith('.routes.ts'))) {
    records.push(...extractRouterRoutes(file, mounts));
  }
  return records;
}

/** Extracts literal and template-literal frontend HTTP requests. */
function frontendCalls() {
  const records = [];
  const sourceFiles = [
    ...filesUnder(path.join(frontend, 'app')),
    ...filesUnder(path.join(frontend, 'components')),
    ...filesUnder(path.join(frontend, 'lib')),
    ...filesUnder(path.join(frontend, 'services')),
  ];
  for (const file of sourceFiles) {
    const source = fs.readFileSync(file, 'utf8');
    const axios = /api\.(get|post|put|patch|delete)\(\s*(["'`])([\s\S]*?)\2/g;
    for (const match of source.matchAll(axios)) {
      const raw = match[3];
      if (raw.includes('/api/')) records.push({ method: match[1], path: normalizePath(raw), file, transport: 'axios' });
    }
    const fetchCall = /fetch\(\s*(["'`])([\s\S]*?)\1([\s\S]{0,700}?)(?:\)\s*;|\)\s*\n)/g;
    for (const match of source.matchAll(fetchCall)) {
      const raw = match[2];
      if (!raw.includes('/api/')) continue;
      const apiPath = raw.slice(raw.indexOf('/api/'));
      const tail = match[3];
      const method = /method\s*:\s*["'](GET|POST|PUT|PATCH|DELETE)["']/i.exec(tail)?.[1] || 'get';
      const hasAuthorization = /authorization/i.test(tail);
      const hasCompany = /x-company-id/i.test(tail);
      records.push({ method, path: normalizePath(apiPath), file, transport: 'fetch', hasAuthorization, hasCompany });
    }
  }
  return records;
}

/** Classifies audit results without claiming that static analysis is runtime proof. */
function main() {
  const backendRecords = backendRoutes();
  const frontendRecords = frontendCalls();
  const supported = new Set(backendRecords.map((record) => endpoint(record.method, record.path)));
  const findings = [];
  const dynamicCalls = [];
  for (const call of frontendRecords) {
    const raw = call.path;
    if (/^https?:/.test(raw) || raw.includes(':param') && !raw.startsWith('/api/v1/')) {
      dynamicCalls.push(call);
      continue;
    }
    const key = endpoint(call.method, raw);
    if (!supported.has(key)) findings.push({ severity: 'HIGH', category: 'FE_BE_ROUTE_MISMATCH', endpoint: key, file: path.relative(root, call.file) });
    if (call.transport === 'fetch' && (!call.hasAuthorization || !call.hasCompany)) {
      findings.push({ severity: 'HIGH', category: 'RAW_FETCH_BYPASSES_STANDARD_AUTH_SCOPE', endpoint: key, file: path.relative(root, call.file), authorization: call.hasAuthorization, company: call.hasCompany });
    }
  }

  const axiosFile = path.join(frontend, 'lib', 'api', 'axios.ts');
  const axiosSource = fs.readFileSync(axiosFile, 'utf8');
  const nextConfig = ['next.config.js', 'next.config.mjs'].map((name) => path.join(frontend, name)).find(fs.existsSync);
  const nextSource = nextConfig ? fs.readFileSync(nextConfig, 'utf8') : '';
  if (/127\.0\.0\.1:8000/.test(axiosSource) && /127\.0\.0\.1:8001/.test(nextSource)) {
    findings.push({ severity: 'HIGH', category: 'DEFAULT_BACKEND_PORT_MISMATCH', endpoint: 'NEXT Axios 8000 vs rewrite 8001', file: 'frontend-next/lib/api/axios.ts' });
  }
  const middlewareFile = ['middleware.ts', 'middleware.tsx'].map((name) => path.join(frontend, name)).find(fs.existsSync);
  if (middlewareFile) {
    const middleware = fs.readFileSync(middlewareFile, 'utf8');
    if (!/isPublicErrorPage|pathname\.startsWith\('\/error\/'\)/.test(middleware)) findings.push({ severity: 'MEDIUM', category: 'PUBLIC_ROUTE_GUARD_MISMATCH', endpoint: '/error', file: 'frontend-next/middleware.ts' });
  }
  const result = {
    status: 'AUDIT_COMPLETE',
    scope: { backend_route_records: backendRecords.length, frontend_http_calls: frontendRecords.length, generic_route_records: backendRecords.filter((item) => item.kind === 'generic').length },
    findings,
    unresolved_dynamic_calls: dynamicCalls.map((call) => ({ method: call.method.toUpperCase(), path: call.path, file: path.relative(root, call.file) })),
    limitations: [
      'Static audit cannot prove dynamic router aliases, runtime middleware order, or database state.',
      'Every HIGH finding requires a targeted HTTP BDD scenario before changing production behavior.',
      'Generic CRUD endpoint coverage is represented by route metadata and requires generated scenario fixtures.',
    ],
  };
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) main();

module.exports = { backendRoutes, endpoint, frontendCalls, normalizePath };
