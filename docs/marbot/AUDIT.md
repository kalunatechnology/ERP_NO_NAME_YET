# Marka Plus audit — 2026-10-02

## Verified system

The active implementation is Next.js (`frontend-next`) and Express/Prisma (`backend-express`). Marka Plus defaults to native ERP execution; `MARBOT_RUNTIME=external` selects the older HMAC integration. Native persistence uses `marbot_conversation`, `marbot_message`, and `marbot_request`. The optional provider is OpenRouter and is configured through `MARBOT_AI_API_KEY` and `MARBOT_AI_MODEL`; credential values were not copied into this report.

Native execution now includes an ERP-authenticated MCP Streamable HTTP endpoint at `POST /api/v1/marbot/mcp` (protocol `2025-11-25`, JSON response mode). Its tools discover permitted canonical resources, expose live physical schema metadata, run typed reads/aggregates/one-hop verified relations, and invoke the existing native project/task/finance/KPI/support reads. It never accepts SQL or mutation calls. The external integration remains available behind `MARBOT_RUNTIME=external` with its four older HMAC tools.

`system-inventory.json` contains 265 compiled Prisma models, their scalar fields, primary/unique keys and declared relations, enums, 14 frontend pages, route registrations and separately collected **live** PostgreSQL columns and constraints. The connected public schema had 282 tables/views and 1,114 constraints; all 265 Prisma table/view names were present. Presence alone does not prove every field, migration or business workflow is correct. Scalar names ending in `_id` are not considered proof of a foreign key.

Refresh the inventory with `npm run audit:marbot-knowledge`. Metadata queries do not select business rows or credentials. The artifact records its generation timestamp and the SHA-256 of the Prisma schema. Its source labels distinguish the compiled application contract from live database evidence.

## Changes

- Backend: project status filtering and grouping; task status, exact title, date and Jakarta period filtering; task owner lookup; explicit clarification for unidentified tasks and unsupported annual/quarter ranges.
- Queries: parameterized SQL for task hierarchy and metadata, tenant/company boundaries, canonical project visibility, user ownership for personal execution, bounded lists, exact counts before limiting display.
- Live schema and capability endpoints: `GET /api/v1/marbot/schema` and `/capabilities`, restricted to effective permissions. The generated catalogue currently maps 204 canonical CRUD resources across 15 routed modules and is checked against source hashes in CI. Schema questions query current physical columns and PK/FK/check/unique constraints; no arbitrary SQL endpoint exists.
- Knowledge: actual feature/workflow guidance covers Projects, Tasks, Finance, CRM, Reporting, Requests, Analytics/resources, Procurement, Inventory, Manufacturing, Quality, Assets, Logistics, Service, Sales, Implementation and Master Data. It includes verified transition invariants from their routes/services. The complete model/page/route inventory remains separate from semantic guidance.
- Planner: OpenRouter produces typed JSON plans only. Plans are checked against current catalogue fields and permitted modules. Business values must occur literally in the request; relations require a physical single-column foreign key; invalid, invented, or provider-failed plans produce a deterministic clarification/fallback. The checked local environment has no OpenRouter key/model configured, so provider behavior is verified with fixtures rather than a live paid call.
- Reads: typed list/count/filter/search/aggregate and one-hop related data use canonical ERP HTTP APIs, inheriting tenant/company scope, module entitlement, active role and resource-specific access hooks. Project/task/finance/KPI/support queries retain their dedicated bounded executors.
- Writes: backend-owned, 15-minute action tickets cover Project, Main/Weekly/Daily Task, assignment, Daily Task update, and schema-validated create/update for writable catalogue resources. Proposal creation never mutates. Confirmation uses an atomic claim, calls canonical ERP APIs, performs readback field verification, prevents replay, and persists verified/unverified results in chat history. A browser cannot choose an endpoint or execute a business API directly.
- Authorization: every request reloads effective authority. Field restrictions/masking and active custom role data-scope policies fail closed for the affected module; authority changes invalidate old history and pending tickets. The connected database currently contains zero data-scope policies, assignments, or field-permission rows, so there is no deployed custom expression semantics to infer.
- Reliability: partial database failures are explicit and successful domains remain visible. Denials/action proposals cannot be rephrased by the optional provider. Static provider output must be an exact extract of the authoritative reference; unverified paraphrases fall back to the reference. Interrupted SSE is an error until a `done` event arrives.
- UI: bounded long-message/table layout, mobile/desktop responsive drawer, clear loading/error states, explicit confirmation, verified/failed write feedback, accessible conversation status, history error reset, authority-change cancellation, and pending action-ticket restoration from history.

## Test evidence

Passed: backend/frontend TypeScript checks; native and HTTP regressions; all 204 generated resource contracts; required/default/type/date/filter validation; planner grounding; SQL/field/route injection rejection; partial failure; client ticket/history/SSE behavior; and catalogue freshness. CI runs native/capability/resource suites.

The read-only live smoke test loads an eligible user's **actual** authority, discovers physical metadata, compares the assistant's running-project count to a directly scoped database count and executes the weekly Daily→Weekly→Main Task join. It passed. It does not create or update live business data.

An isolated local PostgreSQL database was created from the current Prisma schema and seeded with the approved master dataset. Full HTTP E2E passed for ERP authentication/company scope, MCP initialize/tools/list/tools/call, empty data, aggregate equality against direct Prisma output, Project→Main→Weekly→Daily creation, Main Task assignment, Daily Task update, generic Implementation work-item create/update, readback, persisted result, simultaneous duplicate confirmation, invalid confirmation, forged company, and permission revocation after proposal. This database is isolated under `.tmp` and excluded from Git; no production business row was mutated.

Commands:

```text
npm run typecheck
npm run test:marbot-native
npm run test:marbot-capabilities
npm run test:marbot-live-read
npm run audit:marbot-knowledge
# Against an isolated PostgreSQL on 127.0.0.1:55439 only:
npm run test:marbot-isolated
```

Browser fixture testing is provided by `tests/marbot-ui.browser.js`. It requires the bundled Playwright package path in `MARBOT_TEST_RUNTIME_PACKAGES`, runs a temporary standalone Next route with intercepted API fixtures and removes that route afterward. It covers long responses, wide tables, mobile/desktop, loading, errors, confirmation cancel/accept and verified write feedback. Screenshots are written under this directory when successful.

Browser tests passed using installed Edge: mobile and desktop, 100-row long responses, horizontal table containers, a desktop drawer limited to 410px, loading, explicit API errors, canceled confirmation producing zero writes, accepted confirmation producing exactly one fixture write, and verified readback feedback. Screenshots were visually inspected. Temporary routes were removed.

| Requested scenario | Verification layer |
|---|---|
| 1. General system information | Native knowledge unit tests |
| 2. Feature questions | Permission-filtered workflow knowledge + 204 generated resource contracts |
| 3. Role questions | Actual authority response + HTTP authorization fixtures |
| 4. Single-table query | Live project count comparison |
| 5. Related data | Live Daily→Weekly→Main Task join + physical-FK-gated related resource executor |
| 6. Filtering/aggregation | Live scoped project count + isolated aggregate equality + status/date fixtures |
| 7. Empty data | Native empty-query fixtures |
| 8. Permission denied | Native/HTTP/client fixtures |
| 9. Create | Isolated DB: Project/Main/Weekly/Daily and Implementation resource creation |
| 10. Update | Isolated DB: Daily Task and Implementation resource update/readback |
| 11. Invalid input | Zod/HTTP/date/action fixtures |
| 12. Database/MCP/provider failure | Partial-failure, MCP error result, readback and OpenRouter fixtures |
| 13. Data not found | Empty scoped-query and clarification fixtures |
| 14. Long UI response | Browser fixture with 100 rows, mobile and desktop |
| 15. Loading/error state | Browser fixture with delayed responses and HTTP 503 |

All 15 requested scenarios now have executable evidence, including real mutation E2E in the isolated database. The implementation follows the actual routed API surface; administrative commands, bespoke lifecycle transitions, deletions and bulk destructive operations remain intentionally unavailable to AI unless a dedicated confirmed adapter is added.

## Release conditions

OpenRouter remains the selected provider, but `MARBOT_AI_API_KEY` and `MARBOT_AI_MODEL` are absent from the checked local environment. Deterministic queries, explicit structured resource requests, permissions, MCP and all writes work without the provider. Free-form natural-language mapping across the full catalogue will become active only after those two server secrets are configured and a live provider smoke test succeeds.

No application deployment, production migration, production seed, or production business mutation was performed. The code and tests are complete locally; production availability still requires the normal deployment process and server-side OpenRouter configuration.
