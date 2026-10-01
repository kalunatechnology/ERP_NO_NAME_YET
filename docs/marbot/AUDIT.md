# Marka Plus audit — 2026-10-01

## Verified system

The active implementation is Next.js (`frontend-next`) and Express/Prisma (`backend-express`). Marka Plus defaults to native ERP execution; `MARBOT_RUNTIME=external` selects the older HMAC integration. Native persistence uses `marbot_conversation`, `marbot_message`, and `marbot_request`. The optional provider is OpenRouter and is configured through `MARBOT_AI_API_KEY` and `MARBOT_AI_MODEL`; credential values were not copied into this report.

Native tools are structured ERP service/API access, not a newly implemented protocol-compliant MCP server. The external integration exposes four HMAC-bound tools (`project.summary`, `project.task_overview`, `finance.expense_summary`, `crm.open_tickets`) and has separate managed V2/MCP-Lite provisioning. Its compatibility status must not be read as proof that arbitrary SQL, every table or every mutation is supported.

`system-inventory.json` contains 265 compiled Prisma models, their scalar fields, primary/unique keys and declared relations, enums, 14 frontend pages, route registrations and separately collected **live** PostgreSQL columns and constraints. The connected public schema had 282 tables/views and 1,114 constraints; all 265 Prisma table/view names were present. Presence alone does not prove every field, migration or business workflow is correct. Scalar names ending in `_id` are not considered proof of a foreign key.

Refresh the inventory with `npm run audit:marbot-knowledge`. Metadata queries do not select business rows or credentials. The artifact records its generation timestamp and the SHA-256 of the Prisma schema. Its source labels distinguish the compiled application contract from live database evidence.

## Changes

- Backend: project status filtering and grouping; task status, exact title, date and Jakarta period filtering; task owner lookup; explicit clarification for unidentified tasks and unsupported annual/quarter ranges.
- Queries: parameterized SQL for task hierarchy and metadata, tenant/company boundaries, canonical project visibility, user ownership for personal execution, bounded lists, exact counts before limiting display.
- Live schema endpoint: `GET /api/v1/marbot/schema`, restricted to existing read tools and effective permissions. Schema questions in native chat use this same discovery function. No arbitrary SQL endpoint was introduced.
- Knowledge: actual frontend feature catalogue and verified project/finance/CRM/reporting/request workflows. The full technical inventory is maintained separately; it is not a claim that every inventoried endpoint has an assistant tool.
- Planner: optional OpenRouter JSON plans are validated with a strict union of supported domains/actions. The model cannot supply SQL/endpoints or business results. Entity names and write values must occur literally in the user's request; canonical executors validate the typed fields and database relations. Invalid/provider-failed plans fall back to deterministic execution. The local environment currently has no configured AI key/model, so provider integration was tested with fixtures, not a live model.
- Writes: strict proposals for project, Main Task, Weekly Task, Daily Task creation and Daily Task progress/output updates. A proposal is not a mutation. The native backend validates company/personal PROJECTS write entitlement before returning an executable proposal. The UI requires confirmation and calls fixed canonical ERP API routes through the existing authenticated, scoped, idempotent API client. Those routes enforce role, ownership, assignment, task hierarchy and workflow. The result is read again; mismatches or failed verification are reported without claiming success. Derived task status is reported as stored, even when different from the requested status.
- Authorization: native requests reload effective authority. Configured field restrictions/masking or custom role data-scope policies that lack a safe evaluator cause the affected module to fail closed. This is intentionally conservative and can deny more than the affected field. Restriction changes also invalidate privileged conversation replay.
- Reliability: partial database failures are explicit and successful domains remain visible. Denials/action proposals cannot be rephrased by the optional provider. Static provider output must be an exact extract of the authoritative reference; unverified paraphrases fall back to the reference. Interrupted SSE is an error until a `done` event arrives.
- UI: bounded message/table layout, readable wide-table scrolling, loading and verified/failed write feedback, accessible conversation status, history error reset.

## Test evidence

Passed: backend/frontend TypeScript checks; native service regression tests; hermetic HTTP tests for SSE, persistence, ownership, authority, validation and limits; capability tests for knowledge, role, status/period queries, scoped joins, empty data, SQL injection, partial failure, metadata and strict proposals; client tests for canonical create/update routes, readback mismatch/failure, permission denial, derived task status and complete/truncated/empty SSE.

The read-only live smoke test loads an eligible user's **actual** authority, discovers physical metadata, compares the assistant's running-project count to a directly scoped database count and executes the weekly Daily→Weekly→Main Task join. It passed. It does not create or update live business data.

Commands:

```text
npm run typecheck
npm run test:marbot-native
npm run test:marbot-capabilities
npm run test:marbot-live-read
npm run audit:marbot-knowledge
```

Browser fixture testing is provided by `tests/marbot-ui.browser.js`. It requires the bundled Playwright package path in `MARBOT_TEST_RUNTIME_PACKAGES`, runs a temporary standalone Next route with intercepted API fixtures and removes that route afterward. It covers long responses, wide tables, mobile/desktop, loading, errors, confirmation cancel/accept and verified write feedback. Screenshots are written under this directory when successful.

Browser tests passed using installed Edge: mobile and desktop, 100-row long responses, horizontal table containers, a desktop drawer limited to 410px, loading, explicit API errors, canceled confirmation producing zero writes, accepted confirmation producing exactly one fixture write, and verified readback feedback. Screenshots were visually inspected. Temporary routes were removed.

| Requested scenario | Verification layer |
|---|---|
| 1. General system information | Native knowledge unit tests |
| 2. Feature questions | Permission-filtered knowledge unit tests |
| 3. Role questions | Actual authority response + HTTP authorization fixtures |
| 4. Single-table query | Live project count comparison |
| 5. Related data | Live Daily→Weekly→Main Task join |
| 6. Filtering/aggregation | Live scoped project count + status/date unit fixtures |
| 7. Empty data | Native empty-query fixtures |
| 8. Permission denied | Native/HTTP/client fixtures |
| 9. Create | Strict proposal + canonical API/readback client fixtures + browser confirmation |
| 10. Update | Canonical API/readback client fixtures, including derived status |
| 11. Invalid input | Zod/HTTP/date/action fixtures |
| 12. Database/tool/provider failure | Partial-failure, readback and planner fixtures |
| 13. Data not found | Empty scoped-query and clarification fixtures |
| 14. Long UI response | Browser fixture with 100 rows, mobile and desktop |
| 15. Loading/error state | Browser fixture with delayed responses and HTTP 503 |

These layers are not a claim that all 15 scenarios passed full business-mutation E2E against a seeded database.

## Remaining coverage and release limits

This implementation is **not the complete system-wide assistant requested**. These remain required:

1. Dedicated permission-aware read/write adapters for every remaining business module, including CRM deals, procurement, inventory, manufacturing, quality, assets, logistics and implementation. Existing native operational reads remain limited to projects, tasks, recognized project costs, support-ticket counts and KPI results.
2. Expand the validated natural-language planner to the remaining system modules and configure `MARBOT_AI_API_KEY`/`MARBOT_AI_MODEL` on the server for live provider testing. Without them, reads use deterministic intents and writes require explicit structured fields and IDs. Assignment and mutations outside the listed operations remain unsupported.
3. A reviewed evaluator for configured field masking and custom data-scope expressions. Current native behavior safely rejects those modules; it does not implement their full semantics. The external/HMAC runtime has not been extended with these new native capabilities.
4. Atomic, server-owned action tickets, execution/result persistence and full mutation E2E against an isolated seeded database. Current confirmation and readback feedback run in the client over canonical ERP APIs; confirmed results are not appended to persisted chat history. No production business mutations were performed for testing.
5. Full workflow-level knowledge review and schema/knowledge regeneration in CI. The technical inventory covers all models/pages, but semantic workflow coverage is narrower. Dynamic metadata remains the source for physical constraints.

No deployment, migration, production seed, or destructive operation was performed.
