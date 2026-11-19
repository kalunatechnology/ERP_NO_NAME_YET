import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Given, When, Then } from '@cucumber/cucumber';
import { Prisma } from '@prisma/client';
import prisma from '../../src/config/database';
import { installInMemoryPrisma } from '../support/in-memory-prisma';
import { postStockMove } from '../../src/modules/inventory/stock-posting.service';
import { evaluateWorkflowTransition } from '../../src/modules/inventory/workflow-engine.service';
import { assertWarehouseScopeAccess } from '../../src/modules/inventory/warehouse-scope.service';
import {
  approveIntercompanySto,
  createIntercompanySto,
  dispatchIntercompanySto,
  receiveIntercompanySto,
} from '../../src/modules/inventory/intercompany-sto.service';
import { setCompanyExtension } from '../../src/modules/inventory/extensions/extension-registry.service';
import { postPosSaleDeduction } from '../../src/modules/inventory/extensions/retail-pos.service';
import { evaluateDdmrpBuffers, upsertDdmrpBuffer } from '../../src/modules/inventory/advanced/ddmrp.service';
import { dispatchPendingOutboxWebhooks } from '../../src/modules/inventory/advanced/webhook.service';
import { exportEpcis2Document } from '../../src/modules/inventory/advanced/epcis.service';
import { calculatePeriodicUnitPrice } from '../../src/modules/inventory/advanced/material-ledger.service';

interface WorldState {
  store: Map<string, any[]>;
  companyId: string;
  tenantId: string;
  lastMove?: any;
  lastError?: Error | null;
  lastWorkflowResult?: any;
  lastSto?: any;
  ddmrpResults?: any[];
  capturedWebhookHeaders?: Record<string, string>;
  epcisDoc?: any;
  pupRows?: any[];
}

const world: WorldState = {
  store: new Map(),
  companyId: 'COMP-A',
  tenantId: 'TENANT-1',
};

function seedCompanyOwner(companyId: string) {
  const owners = world.store.get('inv_inventory_owner')!;
  if (!owners.some((o) => o.company_id === companyId && o.is_default)) {
    owners.push({
      id: `OWN-${companyId}`,
      tenant_id: world.tenantId,
      company_id: companyId,
      owner_code: 'OWN-COMPANY-DEFAULT',
      owner_name: 'Company Owned',
      owner_type: 'COMPANY_OWNED',
      is_default: true,
      status: 'ACTIVE',
    });
  }
}

Given('an isolated in-memory inventory sandbox for company {string}', async (companyId: string) => {
  world.store = installInMemoryPrisma();
  world.companyId = companyId;
  world.lastError = null;
  world.lastMove = null;
  seedCompanyOwner(companyId);
});

Given('an isolated in-memory inventory sandbox for multi-company tenant {string}', async (tenantId: string) => {
  world.store = installInMemoryPrisma();
  world.tenantId = tenantId;
  world.companyId = 'COMP-A';
  world.lastError = null;
  seedCompanyOwner('COMP-A');
  seedCompanyOwner('COMP-B');
});

Given('product {string} is active with stock tracking enabled and FIFO costing', async (sku: string) => {
  world.store.get('master_product')!.push({
    id: sku,
    tenant_id: world.tenantId,
    company_id: world.companyId,
    product_code: sku,
    product_name: `Product ${sku}`,
    product_type: 'GOODS',
    costing_method: 'FIFO',
    stock_item: true,
    lot_controlled: false,
    serial_controlled: false,
    status: 'ACTIVE',
  });
});

Given('lot-controlled product {string} is active with FIFO costing', async (sku: string) => {
  world.store.get('master_product')!.push({
    id: sku,
    tenant_id: world.tenantId,
    company_id: world.companyId,
    product_code: sku,
    product_name: `Lot Product ${sku}`,
    product_type: 'GOODS',
    costing_method: 'FIFO',
    stock_item: true,
    lot_controlled: true,
    serial_controlled: false,
    status: 'ACTIVE',
  });
});

Given('physical warehouse location {string} exists', async (locId: string) => {
  world.store.get('master_warehouse_location')!.push({
    id: locId,
    tenant_id: world.tenantId,
    company_id: world.companyId,
    warehouse_id: 'WH-1',
    location_code: locId,
    location_name: `Warehouse ${locId}`,
    location_type: 'INTERNAL',
    location_purpose: 'STORAGE',
    is_virtual: false,
    is_allocatable: true,
    allow_negative_stock: false,
    quality_hold: false,
    active: true,
  });
});

async function seedLotBalance(lotId: string, daysOffset: number, qty: number, locId: string) {
  const product = world.store.get('master_product')![0];
  world.store.get('inv_lot')!.push({
    id: lotId,
    tenant_id: world.tenantId,
    company_id: world.companyId,
    product_id: product.id,
    lot_number: lotId,
    expiry_date: new Date(Date.now() + daysOffset * 86_400_000),
    quality_status: 'RELEASED',
  });

  const moveId = `SEED-${lotId}`;
  await (prisma as any).inv_stock_move.create({
    data: {
      id: moveId,
      tenant_id: world.tenantId,
      company_id: world.companyId,
      created_by_id: 'SEEDER',
      move_type: 'RECEIPT',
      source_location_id: null,
      destination_location_id: locId,
      status: 'READY',
    },
  });
  await (prisma as any).inv_stock_move_line.create({
    data: {
      id: `LINE-${lotId}`,
      tenant_id: world.tenantId,
      company_id: world.companyId,
      created_by_id: 'SEEDER',
      stock_move_id: moveId,
      product_id: product.id,
      lot_id: lotId,
      quantity: new Prisma.Decimal(qty),
      unit_cost: new Prisma.Decimal(10000),
    },
  });
  await postStockMove(moveId, world.companyId, 'SEEDER');
}

Given('lot {string} expired yesterday with {int} units in {string}', async (lotId: string, qty: number, locId: string) => {
  await seedLotBalance(lotId, -1, qty, locId);
});

Given('lot {string} expires in {int} days with {int} units in {string}', async (lotId: string, days: number, qty: number, locId: string) => {
  await seedLotBalance(lotId, days, qty, locId);
});

When('a RECEIPT stock move of {int} units at cost {int} into {string} is posted', async (qty: number, cost: number, locId: string) => {
  const prod = world.store.get('master_product')![0];
  const moveId = crypto.randomUUID();
  await (prisma as any).inv_stock_move.create({
    data: {
      id: moveId,
      tenant_id: world.tenantId,
      company_id: world.companyId,
      created_by_id: 'USER-1',
      move_type: 'RECEIPT',
      source_location_id: null,
      destination_location_id: locId,
      status: 'READY',
    },
  });
  await (prisma as any).inv_stock_move_line.create({
    data: {
      id: crypto.randomUUID(),
      tenant_id: world.tenantId,
      company_id: world.companyId,
      created_by_id: 'USER-1',
      stock_move_id: moveId,
      product_id: prod.id,
      quantity: new Prisma.Decimal(qty),
      unit_cost: new Prisma.Decimal(cost),
    },
  });
  world.lastMove = await postStockMove(moveId, world.companyId, 'USER-1');
});

Then('the stock move status is {string}', (status: string) => {
  assert.equal(world.lastMove.status, status);
});

Then('the move source location is auto-linked to virtual counterpart {string}', (code: string) => {
  const locs = world.store.get('master_warehouse_location')!;
  const cp = locs.find((l) => l.id === world.lastMove.source_location_id);
  assert.ok(cp, 'Counterpart location should exist');
  assert.equal(cp.location_code, code);
  assert.equal(cp.is_virtual, true);
});

Then('physical location {string} has on-hand {int} and inventory value {int}', (locId: string, qty: number, val: number) => {
  const bals = world.store.get('inv_stock_balance')!.filter((b) => b.warehouse_location_id === locId);
  assert.equal(bals.length, 1);
  assert.equal(Number(bals[0].on_hand_quantity), qty);
  assert.equal(Number(bals[0].inventory_value), val);
});

Then('virtual counterpart {string} has zero balance rows', (code: string) => {
  const cp = world.store.get('master_warehouse_location')!.find((l) => l.location_code === code);
  const bals = world.store.get('inv_stock_balance')!.filter((b) => b.warehouse_location_id === cp?.id);
  assert.equal(bals.length, 0);
});

When('an ISSUE stock move of {int} units from {string} without manual lot is posted', async (qty: number, locId: string) => {
  const prod = world.store.get('master_product')![0];
  const moveId = crypto.randomUUID();
  await (prisma as any).inv_stock_move.create({
    data: {
      id: moveId,
      tenant_id: world.tenantId,
      company_id: world.companyId,
      created_by_id: 'USER-1',
      move_type: 'ISSUE',
      source_location_id: locId,
      destination_location_id: null,
      status: 'READY',
    },
  });
  await (prisma as any).inv_stock_move_line.create({
    data: {
      id: crypto.randomUUID(),
      tenant_id: world.tenantId,
      company_id: world.companyId,
      created_by_id: 'USER-1',
      stock_move_id: moveId,
      product_id: prod.id,
      lot_id: null,
      quantity: new Prisma.Decimal(qty),
    },
  });
  world.lastMove = await postStockMove(moveId, world.companyId, 'USER-1');
});

Then('FEFO allocates {int} units from {string} and {int} units from {string}', (q1: number, lot1: string, q2: number, lot2: string) => {
  const lines = world.store.get('inv_stock_move_line')!.filter((l) => l.stock_move_id === world.lastMove.id);
  const l1 = lines.find((l) => l.lot_id === lot1);
  const l2 = lines.find((l) => l.lot_id === lot2);
  assert.equal(Number(l1?.quantity ?? 0), q1);
  assert.equal(Number(l2?.quantity ?? 0), q2);
});

Then('{string} remains untouched with {int} units', (lotId: string, qty: number) => {
  const bal = world.store.get('inv_stock_balance')!.find((b) => b.lot_id === lotId);
  assert.equal(Number(bal?.on_hand_quantity ?? 0), qty);
});

When('an ISSUE stock move of {int} unit explicitly using {string} to customer is attempted', async (qty: number, lotId: string) => {
  const prod = world.store.get('master_product')![0];
  const moveId = crypto.randomUUID();
  await (prisma as any).inv_stock_move.create({
    data: {
      id: moveId,
      tenant_id: world.tenantId,
      company_id: world.companyId,
      created_by_id: 'USER-1',
      move_type: 'ISSUE',
      source_location_id: 'LOC-WH-A',
      destination_location_id: null,
      status: 'READY',
    },
  });
  await (prisma as any).inv_stock_move_line.create({
    data: {
      id: crypto.randomUUID(),
      tenant_id: world.tenantId,
      company_id: world.companyId,
      created_by_id: 'USER-1',
      stock_move_id: moveId,
      product_id: prod.id,
      lot_id: lotId,
      quantity: new Prisma.Decimal(qty),
    },
  });
  try {
    await postStockMove(moveId, world.companyId, 'USER-1', undefined, { counterpartKind: 'CUSTOMER' });
    world.lastError = null;
  } catch (err: any) {
    world.lastError = err;
  }
});

Then('the posting fails with validation error containing {string}', (msg: string) => {
  assert.ok(world.lastError, 'Expected error to be thrown');
  assert.ok(world.lastError!.message.includes(msg), `Expected "${world.lastError!.message}" to include "${msg}"`);
});

Given('a TRANSFER_ORDER workflow rule requires Tier {int} for amounts >= {int} with SoD', async (tier: number, threshold: number) => {
  world.store.get('inv_workflow_rule')!.push({
    id: crypto.randomUUID(),
    company_id: world.companyId,
    document_type: 'TRANSFER_ORDER',
    from_status: 'SUBMITTED',
    to_status: 'APPROVED',
    min_amount_threshold: threshold,
    required_tier_level: tier,
    enforce_sod: true,
    require_expiry_min_days: 0,
    is_active: true,
  });
});

When('a Tier {int} supervisor attempts to approve a transfer worth {int}', async (tier: number, amount: number) => {
  world.store.get('iam_user_module_assignment')!.push({
    company_id: world.companyId,
    user_id: 'SPV-1',
    module_code: 'INVENTORY',
    tier_level: tier,
    status: 'ACTIVE',
  });
  try {
    world.lastWorkflowResult = await evaluateWorkflowTransition({
      companyId: world.companyId,
      documentType: 'TRANSFER_ORDER',
      fromStatus: 'SUBMITTED',
      toStatus: 'APPROVED',
      transactionAmount: amount,
      requesterId: 'REQ-1',
      actorUser: { id: 'SPV-1', roles: ['ROLE-SUPERVISOR'], active_role_code: 'ROLE-SUPERVISOR' },
    });
    world.lastError = null;
  } catch (err: any) {
    world.lastError = err;
  }
});

Then('the workflow evaluation rejects with {string}', (msg: string) => {
  assert.ok(world.lastError, 'Expected workflow rejection');
  assert.ok(world.lastError!.message.includes(msg));
});

When('a Tier {int} director attempts to approve their own transfer request', async (_tier: number) => {
  try {
    await evaluateWorkflowTransition({
      companyId: world.companyId,
      documentType: 'TRANSFER_ORDER',
      fromStatus: 'SUBMITTED',
      toStatus: 'APPROVED',
      transactionAmount: 75000000,
      requesterId: 'DIR-1',
      actorUser: { id: 'DIR-1', roles: ['ROLE-DIRECTOR'], active_role_code: 'ROLE-DIRECTOR' },
    });
    world.lastError = null;
  } catch (err: any) {
    world.lastError = err;
  }
});

When('a different Tier {int} director approves the transfer worth {int}', async (_tier: number, amount: number) => {
  world.lastError = null;
  world.lastWorkflowResult = await evaluateWorkflowTransition({
    companyId: world.companyId,
    documentType: 'TRANSFER_ORDER',
    fromStatus: 'SUBMITTED',
    toStatus: 'APPROVED',
    transactionAmount: amount,
    requesterId: 'REQ-1',
    actorUser: { id: 'DIR-2', roles: ['ROLE-DIRECTOR'], active_role_code: 'ROLE-DIRECTOR' },
  });
});

Then('the workflow evaluation succeeds with required tier {int}', (tier: number) => {
  assert.equal(world.lastError, null);
  assert.equal(world.lastWorkflowResult.requiredTier, tier);
});

Given('user {string} is scoped only to warehouse {string} with write access', async (userId: string, whId: string) => {
  world.store.get('inv_warehouse_user_scope')!.push({
    id: crypto.randomUUID(),
    company_id: world.companyId,
    user_id: userId,
    warehouse_id: whId,
    can_read: true,
    can_write: true,
    can_approve: false,
    is_active: true,
  });
});

Then('{string} is allowed {string} on warehouse {string}', async (userId: string, action: string, whId: string) => {
  await assertWarehouseScopeAccess({
    companyId: world.companyId,
    user: { id: userId, roles: ['ROLE-STAFF'] },
    warehouseId: whId,
    action: action as any,
  });
});

Then('{string} is denied {string} on warehouse {string} with {string}', async (userId: string, action: string, whId: string, msg: string) => {
  await assert.rejects(
    () =>
      assertWarehouseScopeAccess({
        companyId: world.companyId,
        user: { id: userId, roles: ['ROLE-STAFF'] },
        warehouseId: whId,
        action: action as any,
      }),
    new RegExp(msg),
  );
});

Given('{string} has {int} units of {string} at cost {int} in {string}', async (comp: string, qty: number, sku: string, cost: number, locId: string) => {
  world.store.get('master_product')!.push({
    id: `${comp}-${sku}`,
    tenant_id: world.tenantId,
    company_id: comp,
    product_code: sku,
    product_name: sku,
    costing_method: 'FIFO',
    stock_item: true,
    lot_controlled: false,
    serial_controlled: false,
    status: 'ACTIVE',
  });
  world.store.get('master_warehouse_location')!.push({
    id: locId,
    tenant_id: world.tenantId,
    company_id: comp,
    location_code: locId,
    location_name: locId,
    location_type: 'INTERNAL',
    location_purpose: 'STORAGE',
    is_virtual: false,
    is_allocatable: true,
    quality_hold: false,
    active: true,
  });
  const mId = `IC-SEED-${comp}`;
  await (prisma as any).inv_stock_move.create({
    data: { id: mId, tenant_id: world.tenantId, company_id: comp, move_type: 'RECEIPT', destination_location_id: locId, status: 'READY' },
  });
  await (prisma as any).inv_stock_move_line.create({
    data: { id: crypto.randomUUID(), tenant_id: world.tenantId, company_id: comp, stock_move_id: mId, product_id: `${comp}-${sku}`, quantity: new Prisma.Decimal(qty), unit_cost: new Prisma.Decimal(cost) },
  });
  await postStockMove(mId, comp, 'SEEDER');
});

Given('{string} has receiving location {string}', async (comp: string, locId: string) => {
  world.store.get('master_product')!.push({
    id: `${comp}-SKU-IC`,
    tenant_id: world.tenantId,
    company_id: comp,
    product_code: 'SKU-IC',
    product_name: 'SKU-IC',
    costing_method: 'FIFO',
    stock_item: true,
    lot_controlled: false,
    serial_controlled: false,
    status: 'ACTIVE',
  });
  world.store.get('master_warehouse_location')!.push({
    id: locId,
    tenant_id: world.tenantId,
    company_id: comp,
    location_code: locId,
    location_name: locId,
    location_type: 'INTERNAL',
    location_purpose: 'STORAGE',
    is_virtual: false,
    is_allocatable: true,
    quality_hold: false,
    active: true,
  });
});

When('an Intercompany STO for {int} units from {string} to {string} is created, approved, dispatched, and received', async (qty: number, supComp: string, reqComp: string) => {
  const sto = await createIntercompanySto({
    tenantId: world.tenantId,
    userId: 'REQ-USER',
    requestingCompanyId: reqComp,
    requestingLocationId: 'LOC-A',
    supplyingCompanyId: supComp,
    supplyingLocationId: 'LOC-B',
    lines: [{ product_id: `${supComp}-SKU-IC`, requested_quantity: qty }],
  });
  await approveIntercompanySto(sto.id, supComp, 'APPR-USER');
  await dispatchIntercompanySto(sto.id, supComp, 'DISP-USER');
  // Map receiving product id to COMP-A product id on line for multi-company SKU parity
  const line = world.store.get('inv_intercompany_sto_line')!.find((l) => l.sto_id === sto.id);
  if (line) line.product_id = `${reqComp}-SKU-IC`;
  world.lastSto = await receiveIntercompanySto(sto.id, reqComp, 'RECV-USER');
});

Then('the Intercompany STO status is {string}', (status: string) => {
  assert.equal(world.lastSto.status, status);
});

Then('{string} balance in {string} is {int} units', (comp: string, locId: string, qty: number) => {
  const bal = world.store.get('inv_stock_balance')!.find((b) => b.company_id === comp && b.warehouse_location_id === locId);
  assert.equal(Number(bal?.on_hand_quantity ?? 0), qty);
});

Then('{string} balance in {string} is {int} units at value {int}', (comp: string, locId: string, qty: number, val: number) => {
  const bal = world.store.get('inv_stock_balance')!.find((b) => b.company_id === comp && b.warehouse_location_id === locId);
  assert.equal(Number(bal?.on_hand_quantity ?? 0), qty);
  assert.equal(Number(bal?.inventory_value ?? 0), val);
});

Then('outbox events include {string} and {string}', (e1: string, e2: string) => {
  const types = new Set(world.store.get('inv_outbox_event')!.map((e) => e.event_type));
  assert.ok(types.has(e1));
  assert.ok(types.has(e2));
});

Given('product {string} has {int} units in store location {string}', async (sku: string, qty: number, locId: string) => {
  world.store.get('master_product')!.push({
    id: sku, tenant_id: world.tenantId, company_id: world.companyId, product_code: sku, product_name: sku,
    costing_method: 'FIFO', stock_item: true, lot_controlled: false, serial_controlled: false, status: 'ACTIVE',
  });
  world.store.get('master_warehouse_location')!.push({
    id: locId, tenant_id: world.tenantId, company_id: world.companyId, location_code: locId, location_name: locId,
    location_type: 'STORE', location_purpose: 'STORAGE', is_virtual: false, is_allocatable: true, quality_hold: false, active: true,
  });
  const mId = `POS-SEED`;
  await (prisma as any).inv_stock_move.create({
    data: { id: mId, tenant_id: world.tenantId, company_id: world.companyId, move_type: 'RECEIPT', destination_location_id: locId, status: 'READY' },
  });
  await (prisma as any).inv_stock_move_line.create({
    data: { id: crypto.randomUUID(), tenant_id: world.tenantId, company_id: world.companyId, stock_move_id: mId, product_id: sku, quantity: new Prisma.Decimal(qty), unit_cost: new Prisma.Decimal(10000) },
  });
  await postStockMove(mId, world.companyId, 'SEEDER');
});

When('a Retail POS sale deduction of {int} units is attempted while {string} is disabled', async (qty: number, _ext: string) => {
  try {
    await postPosSaleDeduction({
      companyId: world.companyId,
      tenantId: world.tenantId,
      userId: 'CASHIER-1',
      storeLocationId: 'LOC-STORE',
      receiptNumber: 'POS-FAIL',
      lines: [{ product_id: 'SKU-POS', quantity: qty }],
    });
    world.lastError = null;
  } catch (err: any) {
    world.lastError = err;
  }
});

Then('the operation is rejected with {string}', (msg: string) => {
  assert.ok(world.lastError?.message.includes(msg));
});

When('extension {string} is enabled for company {string}', async (extCode: string, comp: string) => {
  await setCompanyExtension({ companyId: comp, userId: 'ADMIN-1', extensionCode: extCode, isEnabled: true });
});

When('a Retail POS sale deduction of {int} units is posted for receipt {string}', async (qty: number, rcpt: string) => {
  await postPosSaleDeduction({
    companyId: world.companyId,
    tenantId: world.tenantId,
    userId: 'CASHIER-1',
    storeLocationId: 'LOC-STORE',
    receiptNumber: rcpt,
    lines: [{ product_id: 'SKU-POS', quantity: qty }],
  });
});

Then('store location {string} has {int} units remaining', (locId: string, qty: number) => {
  const bal = world.store.get('inv_stock_balance')!.find((b) => b.warehouse_location_id === locId);
  assert.equal(Number(bal?.on_hand_quantity ?? 0), qty);
});

Given('DDMRP buffer for {string} has ADU {int}, DLT {int}, LTF {float}, VF {float}, MOQ {int} and available stock {int}', async (sku: string, adu: number, dlt: number, ltf: number, vf: number, moq: number, avail: number) => {
  world.store.get('master_product')!.push({
    id: sku, tenant_id: world.tenantId, company_id: world.companyId, product_code: sku, product_name: sku, costing_method: 'FIFO', stock_item: true, status: 'ACTIVE',
  });
  world.store.get('inv_stock_balance')!.push({
    id: crypto.randomUUID(), company_id: world.companyId, product_id: sku, condition_status: 'GOOD', available_quantity: avail, on_hand_quantity: avail, inventory_value: avail * 1000,
  });
  await upsertDdmrpBuffer({ companyId: world.companyId, productId: sku, adu, dltDays: dlt, ltf, vf, moq });
});

When('DDMRP buffers are evaluated', async () => {
  world.ddmrpResults = await evaluateDdmrpBuffers(world.companyId);
});

Then('{string} zone status is {string} with recommended order {int}', (sku: string, status: string, recQty: number) => {
  const row = world.ddmrpResults!.find((r) => r.product_id === sku);
  assert.equal(row?.zone_status, status);
  assert.equal(row?.recommended_order_qty, recQty);
});

When('an active webhook subscription receives a PENDING outbox event', async () => {
  world.store.get('inv_webhook_subscription')!.push({
    id: 'WH-SUB-1',
    company_id: world.companyId,
    name: 'ERP Sync Hook',
    target_url: 'https://example.invalid/webhook',
    event_types: '*',
    secret_hmac: 'super-secret',
    is_active: true,
  });
  world.store.get('inv_outbox_event')!.push({
    id: 'OUT-1',
    company_id: world.companyId,
    aggregate_type: 'STOCK_MOVE',
    aggregate_id: 'MOVE-1',
    event_type: 'inventory.stock.posted',
    idempotency_key: 'IDEMP-1',
    payload_json: JSON.stringify({ ok: true }),
    status: 'PENDING',
    attempt_count: 0,
  });

  const origFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: any, init: any) => {
    world.capturedWebhookHeaders = init.headers;
    return { ok: true, status: 200 } as any;
  }) as any;
  try {
    await dispatchPendingOutboxWebhooks(world.companyId, 10);
  } finally {
    globalThis.fetch = origFetch;
  }
});

Then('the webhook HTTP POST carries an {string} sha256 HMAC header', (headerName: string) => {
  assert.ok(world.capturedWebhookHeaders?.[headerName]?.startsWith('sha256='));
});

Then('the outbox event status becomes {string}', (status: string) => {
  const evt = world.store.get('inv_outbox_event')!.find((e) => e.id === 'OUT-1');
  assert.equal(evt?.status, status);
});

When('GS1 EPCIS 2.0 events and Material Ledger PUP are queried', async () => {
  world.store.get('inv_stock_ledger_entry')!.push({
    id: 'LED-EPC-1',
    company_id: world.companyId,
    product_id: 'SKU-DDMRP',
    warehouse_location_id: 'LOC-WH-A',
    transaction_type: 'RECEIPT',
    quantity_delta: 50,
    value_delta: 500000,
    posting_at: new Date(),
  });
  world.epcisDoc = await exportEpcis2Document({ companyId: world.companyId });
  world.pupRows = await calculatePeriodicUnitPrice({
    companyId: world.companyId,
    periodStart: new Date(Date.now() - 86_400_000),
    periodEnd: new Date(Date.now() + 86_400_000),
  });
});

Then('the EPCIS document type is {string} with CBV 2.0 events', (docType: string) => {
  assert.equal(world.epcisDoc.type, docType);
  assert.ok(world.epcisDoc.epcisBody.eventList.length >= 1);
});

Then('Material Ledger PUP returns positive periodic unit price', () => {
  assert.ok(world.pupRows!.length >= 1);
  assert.ok(world.pupRows![0].periodic_unit_price > 0);
});

