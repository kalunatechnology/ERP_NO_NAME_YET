# Q12 — Final End-to-End Verification Report

**Executed:** 5 September 2026  
**Scope:** Express backend, Next frontend, IAM, company isolation, module delegation, Finance transaction controls, project progress rules, and the generated frontend-to-Express contract matrix.

## Verified results

| Verification | Result | Evidence |
| --- | --- | --- |
| Backend TypeScript type-check | PASS | `tsc --noEmit` |
| Backend production build | PASS | Prisma client generation + TypeScript compile |
| Next production build | PASS | 14 routes generated successfully |
| Frontend-to-Express route contract | PASS | 176/176 calls mapped; 0 static gaps |
| Anonymous access boundary | PASS | 176/176 protected calls returned 401 before controller/persistence |
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

The authenticated suites completed successfully, but several calls were slow while using the configured remote Prisma/Supabase pooler. Tests now have a 30-second general HTTP ceiling (and 15 seconds for login). Monitor connection latency and pooler capacity before production load testing; this is a stability concern, not a failed functional assertion.

## Evidence artifacts

- [Q11 generated 176-case contract matrix](Q11_CONTRACT_BDD_CASES.md)
- [Q11 machine-readable results](Q11_CONTRACT_BDD_RESULTS.json)
- [Q11 contract report](Q11_CONTRACT_BDD_REPORT.md)
- [Q10 audit report](Q10_AUDIT_REPORT.md)

## Honest release assessment

**No blocking functional defect was found in the tested scope.** The two items above mean it would be inaccurate to say the system has literally nothing left to worry about. The immediate priority is correcting the duplicate Ghost company code; next is production-like load/latency testing for the database pooler.
