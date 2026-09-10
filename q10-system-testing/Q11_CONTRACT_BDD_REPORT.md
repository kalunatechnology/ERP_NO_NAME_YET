# Q11 — Express–Next Contract BDD Execution Report

**Execution status:** PASS  
**Executed:** 5 September 2026; revalidated 7 September 2026
**Scope:** every HTTP call statically discovered in `frontend-next` and its matching Express route contract.

The current generated matrix contains **177/177** frontend contracts with zero findings. The 176-case counts below are the original Q11 snapshot and are retained as historical execution evidence. Current whole-backend coverage is documented in [Current Implementation Status](../docs/CURRENT_IMPLEMENTATION_STATUS.md).

> **10 September 2026 clarification:** this generated report proves HTTP method/path registration and authentication boundaries. The separate Q11 System Guardrails suite now also passes 9/9 and covers the canonical Frontend Route → Module → API contract, active role, entitlement, delegation, Dashboard BFF section policy, and cancellation of known unauthorized modular requests. See [Access Control Baseline and Change Log](../docs/ACCESS_CONTROL_CHANGELOG.md).

## Result summary

| Metric | Result |
| --- | ---: |
| Frontend call sites discovered | 176 |
| Express route records inspected | 3,019 |
| Static route-contract gaps | 0 |
| Dynamic frontend paths unresolved | 0 |
| Runtime scenarios executed | 176 |
| Passed | 176 |
| Failed | 0 |
| GET | 70 |
| POST | 76 |
| PATCH | 12 |
| PUT | 1 |
| DELETE | 17 |

## Contract tested

Each generated scenario proves two facts for one actual frontend call site:

1. Its HTTP method and normalized path have a matching Express route contract.
2. The route is protected. A request with no bearer token is rejected with **HTTP 401** by authentication middleware, before controller logic and database persistence execute.

All 176 discovered calls are protected calls. This includes the 106 mutation-capable calls (`POST`, `PATCH`, `PUT`, and `DELETE`). The runtime runner intentionally sent no user credentials and used non-existent placeholder identifiers, so this execution did not create, update, delete, approve, post, close, or otherwise mutate business data.

## Generated test assets

- [All 176 Gherkin-style cases](Q11_CONTRACT_BDD_CASES.md)
- [Machine-readable execution evidence](Q11_CONTRACT_BDD_RESULTS.json)
- [Runner source](run-q11-contract-bdd.js)
- [Static contract scanner](run-contract-audit.js)

Run again from this folder with:

```powershell
npm run q11:contract-bdd
```

## Interpretation

**IMPLEMENTED:** Express and Next agree on the method/path contract for every frontend API call found by the scanner. The application-wide authentication boundary blocks unauthenticated access consistently.

**NOT proven by this safe contract suite:** a valid authenticated user's allowed business workflow, payload validation success, database state transitions, cross-company record isolation after a valid login, or visual frontend behavior. Those require authenticated fixture scenarios and are covered separately by the Q10 role/company BDD suites. They should be run against disposable or explicitly approved test data because such scenarios may legitimately write records.

## Safety and limitations

- The generated suite is intentionally authentication-boundary focused; HTTP 401 is the expected result for every scenario.
- It exercises the real Express middleware and router, but does not issue bearer tokens or invoke protected controllers.
- Static extraction cannot prove HTTP calls assembled dynamically outside the source patterns it recognizes. This run found no unresolved dynamic calls.
- This report reflects the repository and configured runtime available at the execution time above; it is not a deployment verification.
