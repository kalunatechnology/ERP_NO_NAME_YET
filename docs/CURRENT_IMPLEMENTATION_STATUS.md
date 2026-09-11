# Current Implementation Status

> **Access-control update — 10 September 2026:** `ACC-2026-09-10-04` is implemented locally and verified through backend/frontend type-check and Q11 9/9 PASS. Route, active role, module entitlement, delegation, Dashboard BFF section, and API preflight now share one frontend contract. The earlier active-role RBAC, Project/Task row scope, privileged workflow gates, LPJ ownership, and fail-closed SoD remain active. No database migration is required. See [Access Control Baseline and Change Log](./ACCESS_CONTROL_CHANGELOG.md).

**Status date:** 10 September 2026
**Active stack:** Node.js/Express/TypeScript/Prisma + PostgreSQL/Supabase, consumed by Next.js App Router  
**Purpose:** concise operational baseline after the routing, security, loading-performance, and BFF resilience revisions.

This document is the current release summary. Historical Django/prototype documents remain useful as migration and UAT references, but they do not override this baseline or [System Documentation](./SYSTEM_DOCUMENTATION.md).

## Verified scope

| Area | Current evidence |
|---|---|
| Express route inventory | 2,616 unique method/path pairs registered and exercised; 2,616/2,616 passed registration/auth-boundary execution |
| Authenticated reads | 783/783 reached their authenticated data handler; p50 715.1 ms, p95 1,006.9 ms, p99 1,512.3 ms, max 2,010.4 ms |
| Mutations | 1,833/1,833 passed the protected-pipeline dry-run; Prisma write firewall blocked persistence during the generated matrix |
| Real business regression | Static contract, nine login cases, eight Q10 critical scenarios, twelve Company Admin scenarios, runtime API contract, and nine Q11 system guardrails all pass |
| Builds | Backend TypeScript production compile and frontend 14-route production build pass |
| Login SLA | Nine login scenarios pass the 3,000 ms budget; latest full BDD valid-user observations were 401–887 ms |
| Login to complete initial dashboard | Latest real Express/Supabase benchmark: 2,009 ms, including dashboard and Request Card feed |
| BFF cache | Dashboard MISS 1,033 ms / HIT 118 ms; Request Card first read 1,388 ms / HIT 394 ms in the latest run |

Generated mutation coverage is intentionally a non-destructive pipeline test, not proof that every possible business mutation was committed. Targeted BDD suites provide the real transaction evidence.

## Initial loading architecture

1. Login returns JWT, active role, assigned roles, `enabled_modules`, `delegated_modules`, company ID, and compact company identity in one response.
2. The frontend hydrates identity and company state immediately; no extra company request is required before rendering.
3. Dashboard and Request Card requests start in parallel.
4. Concurrent authentication checks for one user share one in-flight database snapshot. The result is discarded after the request wave, so later requests revalidate account and access state.
5. Dashboard Projects and Finance use compact PostgreSQL JSON projections instead of browser fan-out. Independent section loaders run concurrently.
6. Dashboard cache keys include tenant, company, user, active role, enabled modules, and requested sections.
7. Request Card cache keys include company, filters, page, and page size; every successful Request Card mutation clears the feed cache.

## Cache behavior and consistency

| Projection | Fresh TTL | Stale window | Slow-load fallback | Capacity |
|---|---:|---:|---:|---:|
| Dashboard BFF | 15 s | 285 s | 1.2 s | 250 keys/process |
| Request Card feed | 10 s | 50 s | 1.0 s | 250 keys/process |

Both caches are bounded process-local read-through caches with request coalescing. They never cache login credentials, JWT validation results, mutation responses, or a completed authorization decision. Diagnostic headers are `X-Dashboard-Cache` and `X-Request-Cache`; possible values are `MISS`, `HIT`, and `STALE`.

This design improves the current single-instance/local test path. A multi-instance production deployment should use a shared Redis-compatible implementation with the same scoped keys and invalidation rules. Even with caching, no application can guarantee a hard three-second cold request while its remote database or network is unavailable; deployment region, pooler health, and capacity remain part of the SLA.

## Security and data integrity retained

- Every operational request remains JWT-authenticated and tenant/company scoped.
- A forged company header is rejected with HTTP 403.
- Module entitlement and active role are part of dashboard representation identity.
- AppShell, Sidebar, Dashboard BFF client, modular loaders, and Axios use the canonical frontend module contract. `/tasks` resolves to `PROJECTS`, while `/reporting` remains `REPORTING`.
- Known unauthorized modular requests are cancelled before network transmission; backend authorization remains authoritative for direct or manipulated requests.
- Company Admin cannot cross company scope, self-escalate, or enable modules beyond the Super Admin ceiling.
- Finance terminal records remain immutable through generic CRUD; reversal and closing workflows retain separation-of-duty and idempotency controls.
- Reporting views are read-only and scoped by tenant/company or project.
- Workflow validation/not-found/transition failures use typed 400/404 responses instead of generic 500 responses.

## Operational calendar consistency

Frontend treats project, Weekly/Daily Task, payment, tax, and asset dates as business calendar dates. `localDateKey` creates defaults from the browser timezone and `normalizeDateKey` converts both date-only and ISO DateTime API values to the same `YYYY-MM-DD` comparison key. Daily Tasks, Project Overview, and Dashboard therefore classify the same assigned task consistently. This is a frontend normalization change and requires no database migration.

## Database changes

Six migration folders are present. The latest migration, `20260907010000_reporting_views`, creates these read-only projections:

- `view_finance_main_dashboard`
- `view_project_dashboard`
- `view_project_timeline_cost`
- `view_crm_sales_dashboard`

It was deployed successfully to the configured project database during verification. A different target database must still run `prisma migrate status` and `prisma migrate deploy`; never mark a migration applied without checking its objects.

## Reproducing verification

Run from the repository root with the intended test database configured:

```powershell
node q10-system-testing/run-all-bdd.js
node q10-system-testing/run-all-route-registration-smoke.js
node q10-system-testing/run-authenticated-read-route-benchmark.js
node q10-system-testing/run-authenticated-mutation-route-smoke.js
node q10-system-testing/run-dashboard-loading-benchmark.js
node q10-system-testing/validate-documentation-links.js
cd backend-express
npm run test:q11
```

Build checks:

```powershell
cd backend-express
npm run build
cd ../frontend-next
npm run build
```

The route matrix and read benchmark are safe reads except that successful login updates `last_login_at`. The mutation matrix installs a Prisma firewall and must remain non-destructive. Use a disposable company for targeted workflows that legitimately commit records.

## Evidence index

- [Complete route inventory](../q10-system-testing/ROUTE_INVENTORY.md)
- [Performance changelog](../q10-system-testing/PERFORMANCE_CHANGELOG.md)
- [Final BDD result](../q10-system-testing/Q10_RUNTIME_RESULTS.json)
- [Authenticated read result](../q10-system-testing/AUTHENTICATED_READ_ROUTE_BENCHMARK.json)
- [Mutation dry-run result](../q10-system-testing/AUTHENTICATED_MUTATION_ROUTE_RESULTS.json)
- [Database documentation](./DATABASE_DOCUMENTATION.md)
- [System documentation](./SYSTEM_DOCUMENTATION.md)
- [Access-control baseline and changelog](./ACCESS_CONTROL_CHANGELOG.md)
- [Production readiness](../Q8_PRODUCTION_READINESS.md)

## Deployment acceptance still required

The source-level contract is verified locally, but production readiness still requires a same-release frontend/backend deployment and browser verification on the Hostinger domain. After deployment, every persona must log in again so cached profile data contains `delegated_modules`. The Network panel must show no background request to a known unauthorized module; manually calling that API outside the frontend must still be rejected by backend with 403.

## Finance hardening status — 10 September 2026

Implemented in source: transactional Project Cost→WIP journal, Billing Proposal→Billing Document issuance, atomic AP Payment creation/allocation and execution, request-disbursement Payment/journal posting, persisted billing tax scheme, exact PO–accepted GRN–supplier invoice matching, controlled inventory posting, manufacturing material issue integration, quality completion gates, corrected asset-disposal accounting, PROJECTS-owned PM financial summary, generic lifecycle write protection, vendor master-data options, honest empty/fallback states, corrected profile API contract, and deterministic system-font build. Hostinger's 11 September 2026 build log confirms `20260910020000_billing_tax_scheme` reached the target database, but that build stopped in Q11 before backend startup; the Q11 frontend-dependency mismatch is now fixed locally. Frontend/backend deployment of the corrected release and authenticated browser smoke remain pending and must not be inferred from source-level PASS. Detailed scope and explicit limitations are tracked in `docs/INTEGRATION_HARDENING_2026_09_10.md`.

## User-testing baseline

For acceptance testing, measure separately:

- button click to successful login response;
- button click to dashboard shell;
- button click to complete initial dashboard including Request Cards;
- cache state headers;
- browser console/network errors;
- company and active-role label correctness.

Record cold and repeated runs independently. The currently verified healthy-path target is complete initial content within 3,000 ms; the latest measured result is 2,009 ms.
