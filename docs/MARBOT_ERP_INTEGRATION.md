# Marbot authorization owned by ERP

This integration keeps the chatbot source unchanged. The ERP browser sends chat
requests to `POST /api/v1/marbot/chat/completions` with its ordinary ERP JWT and
active `X-Company-ID`. ERP reloads the user, active membership, active role,
company, module access, and `USE_MARBOT` grant. It creates a two-minute signed
context and streams the chatbot response back to that browser. The tenant API
key and signing key remain on the ERP server. The browser no longer embeds a
chatbot credential. Chat and tool audits store identifiers and outcomes only;
they do not store prompt text or ERP response data.

The chatbot's existing read tools call `/internal/marbot/projects/summary`,
`/internal/marbot/projects/tasks`, `/internal/marbot/finance/expenses`, and
`/internal/marbot/crm/tickets`. ERP verifies the chatbot HMAC against method,
path, sorted query, body hash, timestamp, nonce, tenant, user, active role, tool,
and request ID. The unique nonce row blocks replay across ERP processes. ERP
then reloads authorization from its own database and applies company and
project/task scopes before returning projected fields. There are no action
endpoints in this phase; action requests cannot mutate ERP through Marbot.

## Provisioning

1. Apply the `20260915160000_marbot_request` Prisma migration before activating
   the routes. The new table is required for replay protection; missing tables
   cause a closed denial.
2. Add `MARBOT_TENANT_CONFIG_JSON` on the ERP server. Its keys are ERP
   `core_tenant.id` values. `externalTenantId` must equal both ERP
   `core_tenant.code` and the chatbot tenant's `externalTenantId`. Set a fixed
   HTTPS `chatbotUrl` (`https://chatbot-arsalynk.vercel.app` for the supplied
   deployment), tenant API key, and two different random HMAC secrets.
   The `inboundContextSecret` must equal the chatbot tenant's `INBOUND_CONTEXT`
   key; `outboundToolSecret` must equal its `OUTBOUND_TOOL` key. Configure the
   chatbot's `erpBaseUrl` as the fixed HTTPS ERP base URL and allow that domain.
3. In **Company entitlements**, Super Admin enables **MarBot Assistant** for
   each intended company. The toggle is available only after server-side
   tenant keys and endpoint are configured. Activation installs an initial
   `USE_MARBOT` and read-permission profile for the company's business roles
   in one transaction; Super Admin and Company Admin roles are excluded.
   Existing explicit role grants or denials are preserved. Deactivation stops
   access immediately and does not delete role or user configuration.
4. In **Team access control**, Company Admin selects a user and sets MarBot to
   **Role default**, **No access**, or **Use MarBot**. The user override cannot
   exceed the company entitlement. MarBot has no **View & manage** mode while
   the unchanged chatbot offers only safe read tools. A user's active role must
   have `USE_MARBOT`; the default role profile covers the ordinary business
   roles. Role permissions can be adjusted through the ERP's existing
   `accounts/role-permissions` governance API. New custom roles created after
   activation require an explicit role grant.
5. Each read tool uses the following ERP permission and scope:

   | Tool | Module | ERP permission | Scope |
   | --- | --- | --- | --- |
   | `project.summary` | PROJECTS | `READ_PROJECT` | Company for Director/OM; Finance projects with cost entries; assigned or managed project otherwise |
   | `project.task_overview` | PROJECTS | `READ_TASK` | Company for Director/OM; Staff/Supervisor additionally own assigned tasks |
   | `finance.expense_summary` | FINANCE | `READ_FINANCE_SUMMARY` | Director/Finance, company, posted project cost entries only |
   | `crm.open_tickets` | CRM | `READ_TICKET` | Director/CRM Lead; Sales only assigned service cases |

6. Configure corresponding module/role permissions in the chatbot tenant
   registry so its existing tool precheck can reach ERP. ERP remains the final
   decision for those calls. The default `DIRECTOR` signed role is
   `EXECUTIVE`; any other mismatch can be set in `roleMap`.
7. Disable the chatbot `TenantDataSource` for sensitive ERP data, or do not
   register it. The chatbot's direct PostgreSQL query path does not call the
   ERP gateway, so ERP row-level scope cannot govern it. Upload only documents
   intended for the chatbot's existing tenant/module/visibility controls.
8. Rotate the old browser-exposed chatbot caller token. Removing it from the
   frontend bundle does not revoke already-issued copies.

## Known compatibility limits of the unchanged chatbot

- Its `project.summary` tool requires `projectId`, while its current chat
  orchestrator calls that tool with empty parameters for some project prompts.
  The request fails before reaching ERP. Those prompts need an explicitly
  configured safe data view or a future chatbot update to supply `projectId`.
- If an outbound ERP request fails, the chatbot dispatcher can return mock
  data. ERP cannot prevent that reply without changing chatbot behavior. Do
  not treat chatbot narrative as a financial or approval source of record.
- The existing finance tool name says `expense_summary`; ERP supplies posted
  **project cost entries** only and marks the response `PROJECT_COST_ONLY`.
  It does not represent every expense category in the accounting ledger.
- The chatbot's GraphRAG and stored knowledge are separate from ERP read
  endpoints. ERP cannot retroactively filter information already indexed there.
- Signed context sends only modules for which the active ERP role has a read
  grant. The unchanged chatbot still filters knowledge primarily by module and
  visibility, so documents within one module must not mix finer data scopes.
- Existing chatbot conversation listing routes still use legacy caller auth.
  The ERP drawer now creates an owned conversation through signed chat and
  stores only its ID for the current browser session. Team-wide conversation
  access is intentionally absent.

Validation: backend and frontend TypeScript checks, Prisma schema validation,
and the HMAC compatibility vector in `tests/marbot-signature.unit.ts`.

Public deployment probe on 2026-09-15 against
`https://chatbot-arsalynk.vercel.app`: `/health` returned 200 with `status: ok`,
`/docs/openapi.json` returned 200 and lists the chat POST path, and a dummy
chat POST without credentials returned 401. The OpenAPI ChatRequest schema does
not list enterprise signed context, although a context-bearing unauthenticated
request follows the tenant-auth rejection path. This confirms route existence
and authentication enforcement, not tenant-key/HMAC interoperability. The ERP
local `.env` currently has no `MARBOT_TENANT_CONFIG_JSON`; a real signed
conversation cannot be exercised until that configuration and chatbot tenant
keys are provisioned. Re-run `test:marbot-deployment` for the public probe.

On 2026-09-15, `prisma migrate status` could not complete against either the
configured Supabase direct endpoint or the runtime pooler, including an
approved network retry. No database migration or company activation was
performed. Confirm database reachability and apply the migration before
enabling MarBot; TypeScript, Prisma schema validation, signature unit test,
and the public deployment smoke test passed after ERP configuration hardening.

## Automatic migration at release

The MarBot migration is in the committed Prisma migration directory, so the
existing release gate picks it up with every pending migration. For Hostinger,
set `DEPLOYMENT_TARGET=hostinger` and `SUPABASE_DIRECT_URL` to the direct
Supabase endpoint. `npm run deploy:hostinger` runs `prisma migrate deploy`
before compilation, and a migration failure stops the build. For Docker,
`DEPLOYMENT_TARGET=docker` is set by the Dockerfile; the production startup
script runs migrations before loading Express, and a failure stops startup.
The image includes the Prisma migrations and the deployment scripts. Both
paths are idempotent for already-applied migrations. Vercel builds deliberately
do not migrate a shared database; use a separate controlled migration release
step if the ERP backend is ever deployed there.

Automatic schema migration does not provision tenant API keys or turn on a
company entitlement. Those remain explicit server configuration and ERP admin
actions after the release; MarBot activation fails closed until they exist.
