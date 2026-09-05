# Q10 Express–Next Contract & Runtime BDD Audit

**Scope:** `backend-express` and `frontend-next` only.  
**Runner location:** this directory is deliberately outside both applications.  
**Status:** **BLOCKED — runtime database connectivity unavailable; static contract audit complete.**

## Evidence produced

| Artifact | Purpose | Result |
| --- | --- | --- |
| `run-contract-audit.js` | Static Express route / Next HTTP-call contract scan | Completed |
| `run-runtime-contract-bdd.js` | Starts the real Express app on an ephemeral port and tests selected contracts | Partially executed; blocked by Prisma `P1001` |
| `BDD_EXECUTION_PLAN.md` | BDD execution sequence | Prepared |

## Confirmed findings

### Q10-RT-01 — Signup contract is broken

- **Frontend call:** `POST /api/v1/auth/signup` in `frontend-next/lib/api/auth.api.ts`.
- **Runtime evidence:** Express returned **HTTP 401** for an empty request body.
- **Expected:** the endpoint must be public and return a validation/domain result such as 400/409/422 (or it must be removed from the frontend together with its exposed route).
- **Impact:** the exposed signup journey cannot reach normal validation or account-creation behavior.
- **Classification:** `FE_BE_ROUTE_MISMATCH`, security/route-guard contract.

### Q10-ST-01 — CRM service-case action has no Express route

- **Frontend call:** `POST /api/v1/service/cases/:id/check-status` in `frontend-next/lib/api/crm.api.ts`.
- **Static evidence:** no matching Express route was found by the route inventory.
- **Impact:** the CRM client calls an endpoint that is not provided by the backend.
- **Classification:** `FE_BE_ROUTE_MISMATCH`.
- **Superseded by runtime evidence:** the static scanner did not resolve the
  generic route registration. With an authenticated CRM user, the endpoint
  returned **400** for the intentionally invalid `Q10-NONEXISTENT` identifier
  in 6.7 seconds. The route exists; this is **not** a route-mismatch defect.

### Q10-ST-02 — Finance and Assets bypass the shared API client

The following calls use native `fetch` rather than the project Axios client, so they do not visibly inherit bearer-token injection, refresh/retry behavior, company-context handling, and normalized error handling from `frontend-next/lib/api/axios.ts`.

| Frontend file | Calls |
| --- | --- |
| `components/finance/AuditTrailWorkspace.tsx` | `GET /api/v1/finance/audit-trail` |
| `components/finance/FixedAssetsWorkspace.tsx` | Asset list, books, depreciation schedule, depreciation, batch depreciation, disposal |
| `components/finance/PeriodClosingWorkspace.tsx` | Fiscal-period status, request closing, reopen period, reopen year-end |

- **Impact:** authenticated Finance/Assets requests can fail as anonymous requests or omit tenant context, while errors render differently from the rest of the application.
- **Classification:** `RAW_FETCH_BYPASSES_STANDARD_AUTH_SCOPE`.
- **Runtime confirmation:** pending; requires a reachable database and authenticated fixture.

### Q10-ST-03 — Local backend origin defaults disagree

| Location | Default |
| --- | --- |
| `frontend-next/lib/api/axios.ts` | `http://127.0.0.1:8000` |
| `frontend-next/next.config.mjs` rewrite | `http://127.0.0.1:8001` |

- **Impact:** direct Axios calls and rewritten browser requests can target different backend instances during local development.
- **Classification:** `DEFAULT_BACKEND_PORT_MISMATCH`.

### Q10-ST-04 — Public route protection is incomplete

- `frontend-next/middleware.tsx` does not explicitly treat the exposed `signup` and `error` routes as public exceptions.
- **Impact:** the UI route guard and the intended public/signup journey can contradict each other.
- **Classification:** `PUBLIC_ROUTE_GUARD_MISMATCH`.

### Q10-ENV-01 — Database connectivity prevents final runtime certification

The final runner reached the actual Express login handler, then Prisma failed with:

```text
P1001: Can't reach database server at aws-0-ap-northeast-1.pooler.supabase.com:6543
```

- This is an environment/connectivity failure, not proof that login credentials or roles are incorrect.
- Earlier runner attempts authenticated `crm.lead@arsalynk.id` and `arof.finance@arsalynk.com` successfully before the connection became unavailable.
- The remaining runtime scenarios therefore remain **NOT EXECUTED**, not passed or failed.

## Runtime execution ledger

| Scenario | State | Evidence |
| --- | --- | --- |
| Q10-RT-01 Public signup contract | **FAILED** | HTTP 401 |
| Q10-RT-02 CRM service-case check status | NOT EXECUTED | Database unavailable during runtime rerun |
| Q10-RT-03 Finance fiscal-period status native fetch | NOT EXECUTED | Database unavailable during runtime rerun |
| Q10-RT-04 Assets native fetch | NOT EXECUTED | Database unavailable during runtime rerun |
| Q10-RT-05 Local port contract | **FAILED (static)** | Axios 8000 vs rewrite 8001 |
| Q10-RT-06 Public route guard | **FAILED (static)** | No signup/error exception found |

## Follow-up execution with 15-second login ceiling

The requested retry was run with login timeout increased to **15 seconds**.

| BDD behavior | Latest observed status | Evidence |
| --- | --- | --- |
| Demo database login | PASS | `crm.lead@arsalynk.id` and `arof.finance@arsalynk.com` each returned HTTP 200 |
| Public health and protected resources | PASS | `/health` returned 200; anonymous projects request returned 401 |
| Director reporting access | PASS | Rian retained `ROLE-DIRECTOR`; Projects and periodic report returned 200 |
| Company-isolation onward in the combined suite | INCOMPLETE | A later request held the combined runner before it could emit a case result; it must be isolated per endpoint before it may be classified |

The BDD runners have therefore been updated to apply a 15-second ceiling to
database-backed login/request calls and to force-close test sockets during
cleanup. An incomplete case is deliberately not reported as a pass.

## Complete orchestration result

The complete BDD orchestrator was run after the timeout correction. The
machine-readable evidence is [Q10_RUNTIME_RESULTS.json](./Q10_RUNTIME_RESULTS.json).

| Suite | Result | Evidence |
| --- | --- | --- |
| Static Express–Next contract matrix | PASS | 3,019 backend route records and 176 frontend calls inventoried |
| All demo-persona login BDD | PASS | 8 demo identities plus invalid-password rejection; every login completed within 15 seconds |
| Critical system feature | FAIL | First 5 of 8 scenarios passed; multi-role switch scenario exceeded its 15-second request budget |
| Company Admin access feature | PASS | All 12 scenarios passed; temporary Jundy Finance override was restored |
| Runtime API contract BDD | FAIL | Confirmed four defects below |

### Runtime-confirmed contract defects

1. **Signup is not reachable as a public backend route:** `POST /api/v1/auth/signup` returns 401.
2. **Finance native fetch is unauthenticated:** anonymous fiscal-period status
   returns 401 while the same request with a Finance bearer token returns 200
   (6.1 seconds).
3. **Assets native fetch is unauthenticated:** anonymous asset-list request
   returns 401 while the same request with a Finance bearer token returns 200
   (7.3 seconds).
4. **Local origin configuration differs:** Axios defaults to 8000 and Next
   rewrite defaults to 8001.
5. **Public route guard does not include signup/error exceptions.**

The CRM `check-status` call is deliberately excluded from this defect list:
the 15-second rerun proved it reaches Express and returns a domain validation
response (400) for an invalid identifier.

## Safety statement

- No Express or Next application source was changed by this audit phase.
- The runtime runner uses a temporary local HTTP listener and read-only endpoint requests. Successful application logins may update `last_login_at`, as implemented by the application itself.
- No deployment, migration, seed, role assignment, module permission, or financial record mutation was executed.

## Required next execution order

1. Restore reliable database access to the configured Prisma datasource.
2. Re-run `npm run audit:runtime` from this directory.
3. Repair and regression-test the confirmed four application contract issues above.
4. Continue with the generated CRUD, tenant-isolation, role/module permission, WBS, Finance, CRM, and frontend browser BDD matrices in `BDD_EXECUTION_PLAN.md`.

This report is intentionally an AS-IS audit: it does not claim that unexecuted scenarios pass.

## Remediation verification — final

The contract findings above have now been remediated and retested.

| Finding | Remediation | Verification |
| --- | --- | --- |
| Public signup mismatch | Removed the obsolete signup API adapter and changed `/signup` into an invitation-only redirect to `/login` | Runtime confirms backend signup remains protected with 401; frontend exposes no signup mutation |
| Finance native fetch | Period Closing and Audit Trail now use the shared Axios client | Anonymous fiscal-period request 401; authenticated Finance request 200 |
| Assets native fetch | Fixed Assets list, book, depreciation, batch, and disposal calls now use the shared Axios client | Anonymous Assets request 401; authenticated request 200 |
| CRM `check-status` mismatch | “Periksa status” now reads the implemented canonical service-case detail endpoint | Static Express–Next audit reports zero mismatches |
| Local port mismatch | Next rewrite default changed from 8001 to the Axios/backend default 8000 | Static contract audit reports zero findings |
| Error-route redirect loop | `/error` and `/error/*` are explicit public middleware exceptions | Static contract audit reports zero findings |
| Active-role timeout | Role validation queries are reduced and the mutation returns a lean role result; Next refreshes `/auth/me` afterward | Critical BDD passes PM → Finance → PM without relogin |

### Final test ledger

| Verification | Result |
| --- | --- |
| Backend TypeScript check | PASS |
| Frontend TypeScript check | PASS |
| Next production build | PASS |
| Static contract audit (3,019 backend records / 176 frontend calls) | PASS — 0 findings |
| All demo identities and invalid-password login case | PASS 9/9; each login under 15 seconds |
| Critical system BDD | PASS 8/8 |
| Company Admin access matrix, isolated final run | PASS 12/12 |
| Runtime API contract BDD, isolated final run | PASS — 0 violations |

One infrastructure observation remains: executing every database-heavy suite
back-to-back can intermittently produce Prisma `P1001` from the external
Supabase transaction pooler. Each affected suite passed when rerun in isolation,
so this is recorded as pooler/connectivity instability rather than an access
assertion failure. It should still be monitored separately from application
contract correctness.
