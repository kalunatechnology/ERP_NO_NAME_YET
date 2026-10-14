# CRM internal message pipeline

Status: Marka accepts normalized inbound message events from trusted internal integrations. Each integration is configured against one company and optional business unit/default assignee. External channel transport and aggregation remain outside Marka.

## Ownership

- Upstream systems own whatever external connectivity, aggregation, enrichment, and delivery they need. They send normalized events to Marka and do not pass channel-specific integration logic into the CRM domain.
- Marka owns the durable event queue, company/unit-scoped conversation, configured default assignee, manual queue assignment, interaction history, ignore/escalation decision, Inquiry, Opportunity, quotation, and downstream business records.
- The signed webhook is an internal ingestion interface. CRM staff replies are stored in Marka and emitted as `message.reply_requested` through the outbound webhook dispatcher. The external channel adapter remains responsible for sending the reply to WhatsApp or another provider and should subscribe to this outbound event.
- Sender identity is optional. When the trusted source attests identity verification, the identity is recorded as `VERIFIED`; its relationship to a Marka customer remains `UNMATCHED` until CRM explicitly confirms it.

## Provision an integration

Set `CRM_INTEGRATION_ENCRYPTION_KEY` on the Marka backend to a base64-encoded random 32-byte key. Keep it in the host secret manager; do not commit it. Each company administrator can provision an integration source through authenticated `POST /api/v1/core/integration-sources/` after selecting the active company. The registry determines tenant/company and optional business-unit routing; those values cannot be overridden in the webhook body:

```json
{
  "source_code": "EXHIBITION_PIPELINE",
  "account_name": "Exhibition inquiries",
  "external_account_id": "exhibition-intake",
  "business_unit_code": "EXHIBITION",
  "business_unit_name": "Exhibition Services",
  "default_assigned_user_id": "<active CRM Lead or Sales user id>",
  "allowed_event_types": ["message.received"]
}
```

The response includes the global `id`, `key_id`, and `signing_secret` once. Deliver them to the integration's secret manager over a secure channel. Marka stores only AES-256-GCM ciphertext. Listing sources never returns the secret. Secret rotation at `POST /api/v1/core/integration-sources/:id/rotate-secret/` returns a new secret once and accepts the prior key for 24 hours. Source states are `ACTIVE`, `SUSPENDED`, and `REVOKED`. `default_assigned_user_id` must be an active CRM Lead or Sales user in the selected company.

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
    "thread_id": "pipeline-thread-191",
    "message_id": "source-message-92731",
    "sender": {
      "type": "EXTERNAL",
      "value": "contact-ref-321",
      "display_name": "Budi",
      "identity_verification": {
        "status": "VERIFIED",
        "method": "UPSTREAM_CONFIRMED"
      }
    },
    "message": { "type": "TEXT", "text": "Saya ingin menanyakan proposal." }
  }
}
```

The body limit is 1 MiB. `sender` is optional; when present it needs a stable sender type/value, while `identity_verification` is optional. Use `VERIFIED` only when the trusted integration has evidence for that identity; the verification method is an upstream-defined label. The integration HMAC authenticates the sending integration, not a customer's identity or relationship to a Marka customer. Marka groups messages by source registry plus `thread_id` and deduplicates them by source plus stable `message_id`.

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

The persistent Express server claims work using PostgreSQL `FOR UPDATE SKIP LOCKED`, a 90-second lease, a lock token, and short transactions. A crash releases work for lease recovery. Transient errors retry with exponential backoff and jitter; events stop after 12 attempts in `DEAD_LETTER`. Processed raw payloads are cleared; CRM message text and external ID mapping remain. A conversation inherits its business unit and default assignee from the integration source when the thread is first created; changing integration routing applies to new threads only.

Self-hosted Express starts the worker automatically. Serverless deployments do not have a durable background process; configure an external scheduler to `POST /internal/crm-integration-worker/run` with `Authorization: Bearer <CRM_INTEGRATION_WORKER_SECRET>` at a short interval. The worker secret must be at least 32 characters. Limit is 50 events per invocation. Do not expose this credential to browsers.

Company Admins can inspect safe event metadata at `GET /api/v1/core/integration-sources/:id/events/` and retry a dead-letter event at `POST /api/v1/core/integration-sources/:id/events/:eventId/retry/`. Neither endpoint returns the original payload or secret.

CRM inbox reads `/api/v1/crm/inbox/`. A CRM/Sales user can assign a thread, mark an irrelevant conversation `IGNORED` through `POST /api/v1/crm/conversations/:id/decision/`, reopen it, or explicitly create one Inquiry from it. Creating an Inquiry is the escalation action and changes conversation status to `ESCALATED`; the operation is idempotent and inherits a customer party already confirmed on the conversation. CRM Lead or Sales can explicitly match a source-verified identity to an active customer through `POST /api/v1/crm/external-identities/:id/confirm-customer/`; the customer party is company-scoped, and a multi-participant thread is not automatically attached to one party. Customer financial/business history is not joined before that confirmation.

For a conversation with an external thread, staff can post a text reply to `POST /api/v1/crm/conversations/:id/reply/` with `message_text` and a stable `client_message_id`. Marka stores an outbound message with `QUEUED` status and atomically queues `message.reply_requested`; the request is rejected unless at least one active outbound subscription handles this event. The envelope includes the source ID, channel account, external thread ID, and text. Configure an outbound webhook subscription for this event and have the adapter send it through the originating channel. A successful webhook delivery means the adapter accepted the request; it does not confirm delivery to the customer. Conversation replies are limited to 10,000 characters and cannot be sent to ignored conversations or threads without an external route.

## Database and rollout

Migrations `20261012133000_crm_arsalynk_inbound` and `20261013110000_crm_internal_pipeline_routing` add the durable pipeline, source/unit/default-assignee routing, external thread/message mapping, conversation-to-inquiry, idempotent deal handoff, and opportunity source-inquiry uniqueness. Audit/backfill and deploy these migrations before deploying application code. Compare production `_prisma_migrations`, physical column types, indexes, and constraints before rollout. This workspace change does not apply migrations to a live database.

Any upstream integration may implement the sender contract and deploy independently. No specific gateway, provider secret, production integration source, or production database migration is provisioned by this code change.
