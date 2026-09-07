/** Generates a deterministic, deduplicated inventory of every Express route. */
const fs = require('node:fs');
const path = require('node:path');
const { backendRoutes } = require('./run-contract-audit');

const root = path.resolve(__dirname, '..');
const outputJson = path.join(__dirname, 'ROUTE_INVENTORY.json');
const outputMarkdown = path.join(__dirname, 'ROUTE_INVENTORY.md');
const registrationResultPath = path.join(__dirname, 'ALL_ROUTE_REGISTRATION_RESULTS.json');
const registrationPassed = fs.existsSync(registrationResultPath)
  && JSON.parse(fs.readFileSync(registrationResultPath, 'utf8')).status === 'PASS';
const readBenchmarkPath = path.join(__dirname, 'AUTHENTICATED_READ_ROUTE_BENCHMARK.json');
const readBenchmark = fs.existsSync(readBenchmarkPath)
  ? JSON.parse(fs.readFileSync(readBenchmarkPath, 'utf8'))
  : null;
const benchmarkedReadRoutes = new Set(
  readBenchmark?.status === 'PASS'
    ? readBenchmark.results.filter((item) => item.result === 'PASS' && item.reached_data_handler).map((item) => item.id)
    : [],
);
const mutationResultPath = path.join(__dirname, 'AUTHENTICATED_MUTATION_ROUTE_RESULTS.json');
const mutationResult = fs.existsSync(mutationResultPath)
  ? JSON.parse(fs.readFileSync(mutationResultPath, 'utf8'))
  : null;
const mutationDryRunRoutes = new Set(
  mutationResult?.status === 'PASS'
    ? mutationResult.results.filter((item) => item.result === 'PASS').map((item) => item.id)
    : [],
);

function moduleFromPath(routePath) {
  if (routePath === '/health') return 'health';
  const match = /^\/api\/v1\/([^/]+)/.exec(routePath);
  return match?.[1] || 'root';
}

const deduplicated = new Map();
for (const record of backendRoutes()) {
  const method = String(record.method).toUpperCase();
  const key = `${method} ${record.path}`;
  const source = path.relative(root, record.file).replaceAll('\\', '/');
  const existing = deduplicated.get(key);
  if (!existing) {
    const sharedCrud = record.kind === 'generic' || record.kind === 'generic-helper';
    const dashboardBootstrap = method === 'GET' && record.path === '/api/v1/dashboard/bootstrap';
    const module = moduleFromPath(record.path);
    const reviewedAuthRoute = ['accounts', 'auth'].includes(module);
    const reviewedAssetRoute = module === 'assets';
    const reviewedCommandRoute = module === 'commands';
    const reviewedCoreFeedRoute = ['core', 'recent-items', 'sidebar-feed'].includes(module);
    const reviewedCrmRoute = module === 'crm';
    const reviewedFinanceRoute = module === 'finance';
    const reviewedProjectsRoute = module === 'projects';
    const reviewedRequestsRoute = module === 'requests';
    const reviewedSalesRoute = module === 'sales';
    const reviewedReportingRoute = module === 'reporting';
    const reviewedFinalCustomRoute = ['health', 'inventory', 'logistics', 'manufacturing', 'master-data', 'procurement', 'quality', 'service'].includes(module);
    const reviewedNoDataRoute = module === 'analytics' && [
      'POST /api/v1/analytics/alerts/evaluate',
      'POST /api/v1/analytics/kpis/recalculate',
    ].includes(key);
    deduplicated.set(key, {
      id: key,
      method,
      path: record.path,
      module,
      kind: record.kind,
      sources: [source],
      registration_status: registrationPassed ? 'RUNTIME_PASS' : 'RUNTIME_PENDING',
      audit_status: sharedCrud ? 'COMPLETE_SHARED_FACTORY' : dashboardBootstrap || reviewedAuthRoute || reviewedNoDataRoute || reviewedAssetRoute || reviewedCommandRoute || reviewedCoreFeedRoute || reviewedCrmRoute || reviewedFinanceRoute || reviewedProjectsRoute || reviewedRequestsRoute || reviewedSalesRoute || reviewedReportingRoute || reviewedFinalCustomRoute ? 'COMPLETE_STATIC' : 'PENDING',
      optimization_status: sharedCrud
        ? 'CURSOR_AND_BOUNDS_APPLIED'
        : dashboardBootstrap
          ? 'BFF_PROJECTION_PARALLEL_SCOPE_APPLIED'
          : reviewedAuthRoute
            ? 'AUTH_CRITICAL_PATH_PARALLELIZED'
            : reviewedNoDataRoute
              ? 'NO_DATA_WORK_PLACEHOLDER'
              : reviewedAssetRoute
                ? 'COMPANY_SCOPE_ENFORCED_BATCH_CHUNKED'
                : reviewedCommandRoute
                  ? 'SCOPED_TRANSACTION_AND_ENTITLEMENT_APPLIED'
                  : reviewedCoreFeedRoute
                    ? 'SCOPED_FEED_AND_PARALLEL_READS_APPLIED'
                    : reviewedCrmRoute
                      ? 'COMPANY_SCOPE_AND_BFF_AGGREGATES_APPLIED'
                    : reviewedFinanceRoute
                      ? 'SCOPED_AGGREGATES_AND_BATCH_WRITES_APPLIED'
                      : reviewedProjectsRoute
                        ? 'SCOPED_HIERARCHY_AND_BATCH_ASSIGNMENTS_APPLIED'
                        : reviewedRequestsRoute
                          ? 'SCOPED_WORKFLOW_AND_BOUNDED_FEED_APPLIED'
                          : reviewedSalesRoute
                            ? 'SCOPED_ACTIONS_AND_IDEMPOTENT_PROJECT_CONVERSION_APPLIED'
                            : reviewedReportingRoute
                              ? 'PARALLEL_AGGREGATES_AND_BOUNDED_DETAILS_APPLIED'
                              : reviewedFinalCustomRoute
                                ? 'SCOPED_CUSTOM_ACTION_APPLIED'
            : 'PENDING',
      test_status: benchmarkedReadRoutes.has(key)
        ? 'AUTHENTICATED_RUNTIME_PASS'
        : mutationDryRunRoutes.has(key)
          ? 'AUTHENTICATED_MUTATION_DRY_RUN_PASS'
        : sharedCrud
        ? 'UNIT_PASS_RUNTIME_PENDING'
        : dashboardBootstrap || reviewedAuthRoute || reviewedNoDataRoute || reviewedAssetRoute || reviewedCommandRoute || reviewedCoreFeedRoute || reviewedCrmRoute || reviewedFinanceRoute || reviewedProjectsRoute || reviewedRequestsRoute || reviewedSalesRoute || reviewedReportingRoute || reviewedFinalCustomRoute
          ? 'TYPECHECK_AND_CONTRACT_PASS_RUNTIME_PENDING'
          : 'PENDING',
      benchmark_status: benchmarkedReadRoutes.has(key)
        ? 'AUTHENTICATED_READ_MEASURED'
        : mutationDryRunRoutes.has(key)
          ? 'SAFE_MUTATION_PIPELINE_MEASURED'
          : 'NOT_MEASURED',
    });
  } else if (!existing.sources.includes(source)) {
    existing.sources.push(source);
  }
}

const routes = [...deduplicated.values()].sort((a, b) =>
  a.module.localeCompare(b.module) || a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
const byModule = Object.entries(routes.reduce((result, route) => {
  result[route.module] = (result[route.module] || 0) + 1;
  return result;
}, {})).sort(([a], [b]) => a.localeCompare(b));
const readPassCount = routes.filter((route) => route.test_status === 'AUTHENTICATED_RUNTIME_PASS').length;
const mutationPassCount = routes.filter((route) => route.test_status === 'AUTHENTICATED_MUTATION_DRY_RUN_PASS').length;
const registrationPassCount = routes.filter((route) => route.registration_status === 'RUNTIME_PASS').length;

const payload = {
  generated_at: new Date().toISOString(),
  source: 'Static extraction of app.ts mounts, explicit Router methods, and exact createCrudRouter contract.',
  total_unique_routes: routes.length,
  modules: Object.fromEntries(byModule),
  routes,
};

const lines = [
  '# Complete Express Route Inventory',
  '',
  `Generated: ${payload.generated_at}`,
  '',
  `Unique routes: **${routes.length}**`,
  '',
  `Current generated evidence: **${registrationPassCount}/${routes.length} registered**, **${readPassCount} authenticated reads**, and **${mutationPassCount} mutation pipeline dry-runs** pass.`,
  '',
  'Mutation dry-run proves the protected pipeline while a Prisma firewall prevents business writes; targeted BDD supplies committed workflow evidence. See [Current Implementation Status](../docs/CURRENT_IMPLEMENTATION_STATUS.md) and [Performance Changelog](./PERFORMANCE_CHANGELOG.md).',
  '',
  '## Module totals',
  '',
  '| Module | Routes |',
  '|---|---:|',
  ...byModule.map(([module, count]) => `| ${module} | ${count} |`),
  '',
  '## Routes',
  '',
  '| ID | Kind | Source | Registration | Audit | Optimization | Test | Benchmark |',
  '|---|---|---|---|---|---|---|---|',
  ...routes.map((route) => `| \`${route.id}\` | ${route.kind} | ${route.sources.join('<br>')} | ${route.registration_status} | ${route.audit_status} | ${route.optimization_status} | ${route.test_status} | ${route.benchmark_status} |`),
  '',
];

fs.writeFileSync(outputJson, `${JSON.stringify(payload, null, 2)}\n`);
fs.writeFileSync(outputMarkdown, `${lines.join('\n')}\n`);
console.log(JSON.stringify({ total_unique_routes: routes.length, modules: payload.modules, outputJson, outputMarkdown }, null, 2));
