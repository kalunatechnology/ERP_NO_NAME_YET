# Q12 — Final End-to-End Verification Report

**Executed:** 5 September 2026; final extension 7 September 2026
**Scope:** Express backend, Next frontend, IAM, company isolation, module delegation, Finance transaction controls, project progress rules, and the generated frontend-to-Express contract matrix.

## Final extension summary

| Verification | Result | Evidence |
|---|---|---|
| Complete Express route registration | PASS | 2,616/2,616, zero 404/5xx/timeout |
| Authenticated GET matrix | PASS | 783/783 reached data handlers; max 2,010.4 ms |
| Mutation protected-pipeline matrix | PASS | 1,833/1,833; writes blocked by Prisma firewall |
| Login 3-second SLA | PASS | 9/9 scenarios |
| Login to complete initial dashboard | PASS | latest 2,009 ms including Request Card feed |
| Dashboard read-through cache | PASS | MISS 1,033 ms; HIT 118 ms |
| Request Card read-through cache | PASS | first 1,388 ms; HIT 394 ms; mutation invalidation enabled |
| Authentication single-flight | PASS | parallel initial requests share only the active snapshot; no completed auth decision cached |
| Full final BDD | PASS | static, login, critical, Company Admin, runtime contract suites |

Canonical current summary: [Current Implementation Status](../docs/CURRENT_IMPLEMENTATION_STATUS.md).

## Verified results

| Verification | Result | Evidence |
| --- | --- | --- |
| Backend TypeScript type-check | PASS | `tsc --noEmit` |
| Backend production build | PASS | Prisma client generation + TypeScript compile |
| Next production build | PASS | 14 routes generated successfully |
| Frontend-to-Express route contract | PASS | latest matrix 177/177 calls mapped; 0 static gaps |
| Anonymous access boundary | PASS | protected calls stop at authentication before controller/persistence |
| Q6 authenticated end-to-end integration | PASS | 20/20 assertions |
| Q7 Finance idempotency/immutability | PASS | 6/6 assertions; temporary billing fixture deleted |
| Q9 IAM database invariants (after tests) | PASS | 19 canonical identities, 1 Super Admin, 0 cross-company roles |
| Q9 Director/Company Admin HTTP regression | PASS | Director reports/projects, Laode governance, 403 forged company |
| Q9 per-user module delegation | PASS | Laode: Jundy Finance 403 → 200; override restored |
| Q10 critical BDD | PASS | 8/8 scenarios |
| Q10 Company Admin access matrix | PASS | 12/12 scenarios |

## Functional conclusion

The verified application behavior is consistent with the approved access model:

- `dummy.admin@example.com` is the sole Super Admin.
- Rian is Director, not Company Admin or Super Admin; he can access projects and reporting.
- Laode is Company Admin and can administer users and delegate read/write access only for modules enabled by Super Admin for his own company.
- A company user cannot forge another company context; the tested request was rejected with HTTP 403.
- Arof can change active role from PM to Finance without a new login and is restored to PM after the test.
- Project progress does not exist without a real WBS/main-task hierarchy, and manual progress overrides are closed.
- Finance idempotency prevents duplicate billing records; posted billing records cannot be deleted through the ordinary flow.
- All temporary Finance, CRM, Project, entitlement, active-role, and per-user module-access fixtures were cleaned or restored. One CRM fixture left by an earlier forcibly interrupted Q6 run was identified by exact ID/name/creator and removed; the final cleanup check returned zero temporary entitlements and zero Q6/Q7 fixtures. The final Q9 read-only audit passed after cleanup.

## Remaining concern to resolve before real business data

### Duplicate Ghost company code — **TECHNICAL DEBT**

The database contains **two** `core_company` records whose `company_code` is `GHOST-ARSALYNK`. Canonical Ghost demo users are consistently associated with one record, so tested authorization and isolation behavior passed. Nevertheless, `company_code` is not unique in the current schema and duplicate codes can make future code that looks up a company by code select an unintended record.

This is not an active authorization bypass in the tests above, but it is a data-integrity risk. Resolve it before importing real data by choosing the intended Ghost record, moving/removing obsolete demo references only after a relational impact review, and adding/enforcing the intended uniqueness rule if the domain requires unique company codes.

### Runtime-performance observation — **MONITOR**

The authenticated suites completed successfully. Application-level query consolidation, scoped BFF caches, stale fallback, and authentication single-flight now reduce healthy-path initial loading to 2,009 ms in the latest run. Remote Prisma/Supabase tail latency remains an infrastructure concern: a hard worst-case three-second SLA still requires healthy pooler capacity, regional proximity, and a shared Redis-compatible cache for multi-instance deployment.

## Evidence artifacts

- [Q11 generated 177-case contract matrix](Q11_CONTRACT_BDD_CASES.md)
- [Q11 machine-readable results](Q11_CONTRACT_BDD_RESULTS.json)
- [Q11 contract report](Q11_CONTRACT_BDD_REPORT.md)
- [Q10 audit report](Q10_AUDIT_REPORT.md)

## Honest release assessment

**No blocking functional defect was found in the tested scope.** The two items above mean it would be inaccurate to say the system has literally nothing left to worry about. The immediate priority is correcting the duplicate Ghost company code; next is production-like load/latency testing for the database pooler.
