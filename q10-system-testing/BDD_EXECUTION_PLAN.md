# Q10 executable BDD plan

This folder is independent from the Next and Express applications. Its first
runner is read-only contract discovery. The next runners must be added in this
order to keep failures attributable and test data reversible:

## Current checkpoint

- Static contract discovery is complete; see [Q10_AUDIT_REPORT.md](./Q10_AUDIT_REPORT.md).
- Selected runtime contracts were attempted against the actual Express app.
- Further runtime BDD execution is blocked until the configured Prisma
  datasource is reachable again (`P1001` observed during login).
- No application remediation is included in this testing folder.

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
