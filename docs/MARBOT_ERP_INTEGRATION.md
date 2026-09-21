# MarBot Enterprise Contract V2

ERP owns identity and business authority. MarBot enforces the signed runtime snapshot, while PostgreSQL provides the final read-only data boundary. The browser only calls ERP with its normal JWT and active company; API keys, HMAC secrets, database credentials, permissions, and project scope are never supplied by the browser.

## Runtime flow

`POST /api/v1/marbot/chat/completions` reloads the active user/company/role/module snapshot, batch-loads MarBot permissions, and derives project visibility through `ProjectsService.projectAccessWhere()`. ERP emits `MarbotRuntimeContextV2` with `contextVersion: 2`, a 120-second expiry, company, mapped role, filtered modules, effective permissions, canonical `ALL`/`LIST` project scope, locale, and unique JTI. The canonical JSON is signed with the tenant inbound-context secret.

Tool callbacks use a 13-part HMAC payload: method, path and sorted query, timestamp, nonce, body hash, external tenant, user, sorted roles, tool, request ID, company, sorted permissions, and canonical project scope. ERP verifies HMAC and replay nonce before reloading current authority. A callback may narrow permissions or projects, but can never broaden them.

## Control plane and lifecycle

Managed provisioning calls `POST /api/v1/control-plane/tenants` with Contract V2 and stable idempotency key `erp:<tenantId>:marbot:provision:v2`. Modules are derived from active ERP company entitlements. Lifecycle metadata records contract/runtime versions, datasource state, operation ID, and last contract sync. Retrying an uncertain request uses the same operation key.

Server-only configuration:

```env
CHATBOT_SERVICE_URL=https://marbot.example.com
CHATBOT_CONTROL_PLANE_SECRET=<high-entropy-control-plane-secret>
CHATBOT_CONTRACT_MODE=legacy
ERP_BASE_URL=https://erp.example.com
CHATBOT_ERP_READONLY_DATABASE_URL=postgresql://marbot_reader:.../erp
MARBOT_ENCRYPTION_KEY=<32-byte-base64-or-64-hex-key>
```

The currently published `chatbot-arsalynk.vercel.app` OpenAPI is version 1.0 and documents the caller-token contract (`message`, `conversationId`, and `X-External-User-Id`). Keep `CHATBOT_CONTRACT_MODE=legacy` for that deployment. ERP still validates its own user/module/permission/project authority before forwarding. Change the value to `v2` only after the target deployment accepts Runtime Context V2 and its control-plane endpoint; managed provisioning is intentionally disabled in legacy mode.

Production managed provisioning fails closed without `MARBOT_ENCRYPTION_KEY`. New credentials are stored as AES-256-GCM `enc:v1` values. Existing plaintext legacy rows remain readable during migration, but browser responses only contain masks/status metadata.

## Safe datasource

The read-only credential must not be the ERP `DATABASE_URL`. Grant `marbot_reader` only `CONNECT`, schema `USAGE`, and `SELECT` on `ai_projects`, `ai_project_tasks`, `ai_project_finance_summary`, `ai_finance_summary`, and `ai_crm_deals`.

The provisioning contract enforces the `company_id` scope column, allowlisted views, 100-row/30-column limits, a 256 KiB result limit, and a five-second statement timeout. Never expose base tables or a generic write/SQL tool.

## Permissions and project scope

Legacy `READ_FINANCE_SUMMARY` remains supported. Contract V2 adds `READ_PROJECT_FINANCE`, `READ_COMPANY_FINANCE`, and `READ_CRM_DEALS`. Runtime modules are the intersection of company entitlement and effective permission. Project scope always comes from canonical ERP project policy, so original PM, Acting PM, Director/OM, Staff, and Supervisor behavior stays aligned with the Project module.

## Release order

Run `prisma migrate deploy` before starting the new application revision. The migrations add lifecycle fields/permissions and then safe views. Create the restricted database role outside the application migration if it does not exist; the view migration grants access only when `marbot_reader` already exists. Configure secrets, provision/sync from Super Admin, test connectivity, and only then enable the MARBOT company entitlement.

Regression commands are defined in `backend-express/package.json`: signature, tenant lifecycle, runtime V2, tool HMAC V2, control plane V2, project scope, and project authority. The enterprise CI workflow validates Prisma, backend type/build/tests, and the frontend build.
