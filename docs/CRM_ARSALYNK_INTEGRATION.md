# CRM inbound integration: Arsalynk to Marka

Status: Marka-side inbound foundation implemented in source. The Arsalynk `wa_api` sender, production secrets, database migration, and live provider journey still need deployment/configuration in their own environments.

## Ownership

- Arsalynk / `wa_api` continues to own website and WhatsApp transport, AI triage, provider callbacks, human handoff, message delivery, and channel routing.
- Marka owns the durable inbound event queue, company-scoped CRM conversation, internal assignee, customer matching decision, inquiry, opportunity, quotation, and downstream business records.
- Phase one is inbound and read-oriented. Sending a reply from Marka, changing Arsalynk routing, and delivery receipts are not enabled.
- A signed sender identity is recorded as channel-verified, while its relationship to a Marka customer remains `UNMATCHED`. No party/contact history is exposed or linked automatically.

## Provision an integration

Set `CRM_INTEGRATION_ENCRYPTION_KEY` on the Marka backend to a base64-encoded random 32-byte key. Keep it in the host secret manager; do not commit it. Each company administrator can provision an integration source through authenticated `POST /api/v1/core/integration-sources/` after selecting the active company:

```json
{
  "source_code": "ARSALYNK_WA_API",
  "channel_type": "WHATSAPP",
  "account_name": "Arsalynk WhatsApp",
  "external_account_id": "wa_api-main",
  "allowed_event_types": ["message.received"]
}
```

The response includes the global `id`, `key_id`, and `signing_secret` once. Deliver those to the Arsalynk secret manager over a secure channel. Marka stores only AES-256-GCM ciphertext. Listing sources never returns the secret. Secret rotation at `POST /api/v1/core/integration-sources/:id/rotate-secret/` returns a new secret once and accepts the prior key for 24 hours. Source states are `ACTIVE`, `SUSPENDED`, and `REVOKED`.

The configured channel account, tenant, and company all come from the registry row. The webhook body cannot choose them.

## Webhook contract

Send `POST /api/v1/integrations/webhooks/events` with `Content-Type: application/json` and these headers:

```text
X-Integration-Id: <global integration UUID>
X-Integration-Key-Id: <key_id returned during provisioning>
X-Integration-Timestamp: <Unix seconds>
X-Integration-Nonce: <new random 16-128 character value for every delivery attempt>
X-Integration-Signature: <lowercase hex HMAC-SHA256>
```

The signature is computed over the exact UTF-8 bytes received, without parsing or reserializing the JSON:

```text
HMAC-SHA256(secret,
  UTF8("v1\nPOST\n/api/v1/integrations/webhooks/events\n" + timestamp + "\n" + nonce + "\n")
  || raw_body_bytes
)
```

The timestamp must be within ±300 seconds. The nonce is unique per attempt; `event_id` is stable across retries. Query strings and alternate/trailing-slash paths are rejected.

Supported version 1 event:

```json
{
  "schema_version": 1,
  "event_id": "waevt_01J...",
  "event_type": "message.received",
  "occurred_at": "2026-10-12T04:30:00.000Z",
  "data": {
    "thread_id": "wa-conversation-191",
    "message_id": "wamid.HBg...",
    "sender": {
      "type": "PHONE",
      "value": "+628123456789",
      "display_name": "Budi",
      "channel_verification": {
        "status": "VERIFIED",
        "method": "WHATSAPP_PROVIDER_INBOUND"
      }
    },
    "message": { "type": "TEXT", "text": "Saya ingin menanyakan proposal." }
  }
}
```

The body limit is 1 MiB. The gateway must send the original sender identifier, the provider/gateway thread ID, and a stable external message ID. Use `WHATSAPP_PROVIDER_INBOUND` only when the provider-authenticated inbound event establishes control of the sending number; use `WEBSITE_AUTHENTICATED_SESSION` only for an authenticated website session. Otherwise send `status: UNVERIFIED` or omit the verification object. A valid integration HMAC alone does not verify a customer's channel identity. Marka creates a conversation only from a signed thread ID and deduplicates external messages by integration, channel account, and message ID.

| Result | HTTP response |
|---|---:|
| New event durably stored | `202` |
| Same event ID and same raw-body hash; new nonce | `200` |
| Same event ID with different raw-body hash | `409` |
| Invalid signature, unknown source/key, stale timestamp, reused nonce | `401` |
| Suspended/revoked source | `403` |
| Invalid or unsupported payload | `400` or `422` |
| Database did not durably store the event | `503` |

Return `202` means queued durably; CRM processing happens asynchronously. On `503`, retry with the same `event_id`, a new nonce, a fresh timestamp, and a newly computed signature.

## Processing and operations

The persistent Express server claims work using PostgreSQL `FOR UPDATE SKIP LOCKED`, a 90-second lease, a lock token, and short transactions. A crash releases work for lease recovery. Transient errors retry with exponential backoff and jitter; events stop after 12 attempts in `DEAD_LETTER`. Processed raw payloads are cleared; CRM message text and external ID mapping remain.

Self-hosted Express starts the worker automatically. Serverless deployments do not have a durable background process; configure an external scheduler to `POST /internal/crm-integration-worker/run` with `Authorization: Bearer <CRM_INTEGRATION_WORKER_SECRET>` at a short interval. The worker secret must be at least 32 characters. Limit is 50 events per invocation. Do not expose this credential to browsers.

Company Admins can inspect safe event metadata at `GET /api/v1/core/integration-sources/:id/events/` and retry a dead-letter event at `POST /api/v1/core/integration-sources/:id/events/:eventId/retry/`. Neither endpoint returns the original payload or secret.

CRM inbox reads `/api/v1/crm/inbox/`. A CRM/Sales user can assign a thread to themself or explicitly create one Inquiry from it. The conversation-to-inquiry action is idempotent. It does not populate customer party/contact. CRM Lead or Sales can explicitly match a channel-verified identity to an active customer through `POST /api/v1/crm/external-identities/:id/confirm-customer/`; the customer party is company-scoped, and a multi-participant thread is not automatically attached to one party. Customer financial/business history is not joined before that confirmation.

## Database and rollout

Migration `20261012133000_crm_arsalynk_inbound` adds integration registry, durable inbox, external identity/thread/message mapping, conversation-to-inquiry, idempotent deal handoff, and opportunity source-inquiry uniqueness. Audit/backfill and deploy this migration before deploying application code. Compare production `_prisma_migrations`, physical column types, indexes, and constraints before rollout. This workspace change does not apply the migration to a live database.

The Arsalynk `wa_api` repository must implement the matching sender contract and undergo its own deployment. No live WhatsApp delivery, cross-repository commit, provider secret provisioning, or production database migration is performed by this change.
