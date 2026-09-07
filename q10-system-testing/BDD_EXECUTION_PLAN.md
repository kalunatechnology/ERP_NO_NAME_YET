# Q10 executable BDD plan

**Completed checkpoint — 7 September 2026:** the sequence below has been executed. Static contract, all login personas, eight critical scenarios, twelve Company Admin scenarios, runtime API contract, 2,616 route registration checks, 783 authenticated reads, and 1,833 mutation pipeline dry-runs pass. The earlier `P1001` block was transient and is no longer the current status. See [Current Implementation Status](../docs/CURRENT_IMPLEMENTATION_STATUS.md).

This folder is independent from the Next and Express applications. Its first
runner is read-only contract discovery. The next runners must be added in this
order to keep failures attributable and test data reversible:

## Current checkpoint

- Static contract discovery is complete; see [Q10_AUDIT_REPORT.md](./Q10_AUDIT_REPORT.md).
- Runtime contracts were executed against the actual Express app and configured project database.
- A transient Prisma `P1001` remains documented as environment evidence, but successful retries and the final full suite passed.
- Application remediation and performance evidence are now tracked in [Performance Changelog](./PERFORMANCE_CHANGELOG.md).

1. `contract`: static route/method/transport audit.
2. `identity`: login, refresh, active role, one-company scope, module ceiling.
3. `access`: Company Admin delegation matrix and Super Admin entitlement matrix.
4. `frontend`: browser/API client states: loading, empty, 401, 403, 500, retry.
5. `requests`, `crm-sales`, `projects-wbs`, and `finance-governance` workflows.
6. Generated generic CRUD matrix for every registered resource.
7. Remaining operational domains: master data, procurement, inventory,
   manufacturing, quality, assets, service, logistics, implementation,
   analytics, reporting, and commands.
8. Runtime/build/serverless verification.

All mutation suites must create only records with a `Q10-` prefix, capture
their initial state, and clean up in `finally`. Contract findings are evidence
for tests, not permission to change the application automatically.
