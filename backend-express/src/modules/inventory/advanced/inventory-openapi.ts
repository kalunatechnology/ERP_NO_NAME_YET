/**
 * File: backend-express/src/modules/inventory/advanced/inventory-openapi.ts
 *
 * Purpose: Phase 4 — Interactive OpenAPI 3.0 Specification for Arsalynt Universal Inventory.
 */
export const INVENTORY_OPENAPI_SPEC = {
  openapi: '3.0.3',
  info: {
    title: 'Arsalynt ERP — Universal Inventory & Asset Management API',
    version: '4.0.0',
    description:
      'Double-entry immutable ledger inventory API with canonical stock identity, FEFO compliance, configurable workflow rules, warehouse ABAC scopes, intercompany STO, industry extensions, DDMRP, webhooks, Material Ledger PUP, and GS1 EPCIS 2.0.',
  },
  paths: {
    '/api/v1/inventory/overview': { get: { summary: 'Get company inventory overview & KPIs' } },
    '/api/v1/inventory/movements/{id}/post': { post: { summary: 'Post stock movement with double-entry counterpart & FEFO' } },
    '/api/v1/inventory/movements/{id}/reverse': { post: { summary: 'Append-only reversal of a posted stock movement' } },
    '/api/v1/inventory/locations/virtual': { get: { summary: 'List/ensure virtual counterpart locations' } },
    '/api/v1/inventory/product-variants': { get: { summary: 'List product variants' }, post: { summary: 'Create product variant' } },
    '/api/v1/inventory/workflow-rules': { get: { summary: 'List workflow transition & DoA rules' }, post: { summary: 'Create workflow rule' } },
    '/api/v1/inventory/warehouse-scopes': { get: { summary: 'List ABAC warehouse user scopes' }, post: { summary: 'Assign warehouse user scope' } },
    '/api/v1/inventory/intercompany-stos': { get: { summary: 'List intercompany STOs' }, post: { summary: 'Create intercompany STO' } },
    '/api/v1/inventory/extensions': { get: { summary: 'List industry extensions & enabled state' } },
    '/api/v1/inventory/extensions/{code}': { put: { summary: 'Enable or disable an industry extension' } },
    '/api/v1/inventory/ddmrp/buffers': { get: { summary: 'Evaluate live DDMRP Green/Yellow/Red buffers' } },
    '/api/v1/inventory/webhooks': { get: { summary: 'List outbound webhook subscriptions' }, post: { summary: 'Create outbound webhook subscription' } },
    '/api/v1/inventory/outbox-events/dispatch-webhooks': { post: { summary: 'Dispatch PENDING outbox events to webhook subscribers' } },
    '/api/v1/inventory/epcis/events': { get: { summary: 'Export GS1 EPCIS 2.0 JSON-LD traceability events' } },
    '/api/v1/inventory/material-ledger/pup': { get: { summary: 'Calculate Material Ledger Periodic Unit Price (PUP)' } },
  },
};

