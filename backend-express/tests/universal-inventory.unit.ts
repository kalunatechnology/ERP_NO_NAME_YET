import assert from 'node:assert/strict';
import prisma from '../src/config/database';
import {
  buildBalanceIdentityKey,
  evaluateStockEligibility,
} from '../src/modules/inventory/inventory-policy.service';
import {
  defaultCounterpartKind,
  isCounterpartLocation,
  virtualLocationCode,
} from '../src/modules/inventory/virtual-location.service';
import { evaluateWorkflowTransition } from '../src/modules/inventory/workflow-engine.service';
import {
  assertWarehouseScopeAccess,
  getAllowedWarehouseIds,
} from '../src/modules/inventory/warehouse-scope.service';
import { evaluateDdmrpBuffers } from '../src/modules/inventory/advanced/ddmrp.service';
import { exportEpcis2Document } from '../src/modules/inventory/advanced/epcis.service';
import { calculatePeriodicUnitPrice } from '../src/modules/inventory/advanced/material-ledger.service';
import { INVENTORY_OPENAPI_SPEC } from '../src/modules/inventory/advanced/inventory-openapi';

async function main() {
  const db = prisma as any;
  const companyId = 'comp-unit-1';

  // 1. Canonical Stock Identity (with & without variantId)
  const kBase = buildBalanceIdentityKey({
    companyId,
    productId: 'prod-1',
    locationId: 'loc-1',
    inventoryOwnerId: 'own-1',
    conditionStatus: 'good',
  });
  const kBaseUpper = buildBalanceIdentityKey({
    companyId,
    productId: 'prod-1',
    locationId: 'loc-1',
    inventoryOwnerId: 'own-1',
    conditionStatus: 'GOOD',
  });
  assert.equal(kBase, kBaseUpper, 'Condition status should normalize deterministically');

  const kVar = buildBalanceIdentityKey({
    companyId,
    productId: 'prod-1',
    locationId: 'loc-1',
    inventoryOwnerId: 'own-1',
    conditionStatus: 'GOOD',
    variantId: 'var-red-xl',
  });
  assert.notEqual(kBase, kVar, 'Variant ID must produce distinct canonical stock identity');

  // 2. Stock Eligibility & FEFO Expiry Guard
  assert.equal(
    evaluateStockEligibility({
      conditionStatus: 'GOOD',
      location: { active: true, quality_hold: false, is_allocatable: true, location_purpose: 'STORAGE' },
      lot: { quality_status: 'RELEASED', expiry_date: new Date(Date.now() + 86_400_000 * 30) },
    }).eligible,
    true,
  );
  assert.equal(
    evaluateStockEligibility({
      conditionStatus: 'GOOD',
      location: { active: true, quality_hold: false, is_allocatable: true, location_purpose: 'STORAGE' },
      lot: { quality_status: 'RELEASED', expiry_date: new Date(Date.now() - 86_400_000) },
    }).stockStatus,
    'EXPIRED_HOLD',
  );
  assert.equal(
    evaluateStockEligibility({
      conditionStatus: 'DAMAGED',
      location: { active: true, quality_hold: false, is_allocatable: true, location_purpose: 'STORAGE' },
    }).stockStatus,
    'INELIGIBLE_CONDITION',
  );

  // 3. Virtual Counterpart Logic
  assert.equal(defaultCounterpartKind({ move_type: 'RECEIPT' }), 'VENDOR');
  assert.equal(defaultCounterpartKind({ move_type: 'RECEIPT', production_order_id: 'po-1' }), 'PRODUCTION');
  assert.equal(defaultCounterpartKind({ move_type: 'ISSUE', project_id: 'prj-1' }), 'PROJECT_CONSUMPTION');
  assert.equal(defaultCounterpartKind({ move_type: 'ADJUSTMENT' }), 'INVENTORY_LOSS');
  assert.equal(virtualLocationCode('VENDOR'), 'VIRT-VENDOR');
  assert.equal(isCounterpartLocation({ is_virtual: true, location_purpose: 'VIRTUAL' }), true);
  assert.equal(isCounterpartLocation({ is_virtual: true, location_purpose: 'TRANSIT' }), false);

  // 4. Workflow Engine (SoD + DoA Thresholds + FEFO min days)
  const mockWorkflowTx = {
    inv_workflow_rule: {
      findMany: async () => [
        {
          from_status: 'SUBMITTED',
          to_status: 'APPROVED',
          min_amount_threshold: 50_000_000,
          required_tier_level: 1,
          enforce_sod: true,
          require_expiry_min_days: 30,
        },
        {
          from_status: 'SUBMITTED',
          to_status: 'APPROVED',
          min_amount_threshold: 0,
          required_tier_level: 2,
          enforce_sod: true,
          require_expiry_min_days: 0,
        },
      ],
    },
    inv_lot: {
      findMany: async () => [
        { id: 'lot-short', lot_number: 'LOT-SHORT', expiry_date: new Date(Date.now() + 86_400_000 * 5) },
      ],
    },
  };
  db.iam_user_module_assignment = { findFirst: async () => ({ tier_level: 2 }) };

  // SoD block
  await assert.rejects(
    () =>
      evaluateWorkflowTransition(
        {
          companyId,
          documentType: 'TRANSFER_ORDER',
          fromStatus: 'SUBMITTED',
          toStatus: 'APPROVED',
          transactionAmount: 1_000_000,
          requesterId: 'user-1',
          actorUser: { id: 'user-1', roles: ['ROLE-SUPERVISOR'], active_role_code: 'ROLE-SUPERVISOR' },
        },
        mockWorkflowTx,
      ),
    /Segregation of Duties/,
  );

  // DoA threshold block for Tier 2 when amount >= 50M
  await assert.rejects(
    () =>
      evaluateWorkflowTransition(
        {
          companyId,
          documentType: 'TRANSFER_ORDER',
          fromStatus: 'SUBMITTED',
          toStatus: 'APPROVED',
          transactionAmount: 75_000_000,
          requesterId: 'user-1',
          actorUser: { id: 'user-2', roles: ['ROLE-SUPERVISOR'], active_role_code: 'ROLE-SUPERVISOR' },
        },
        mockWorkflowTx,
      ),
    /Otorisasi DoA/,
  );

  // Tier 1 (Director) passes >= 50M, but fails if lot expiry < 30 days
  await assert.rejects(
    () =>
      evaluateWorkflowTransition(
        {
          companyId,
          documentType: 'TRANSFER_ORDER',
          fromStatus: 'SUBMITTED',
          toStatus: 'APPROVED',
          transactionAmount: 75_000_000,
          requesterId: 'user-1',
          actorUser: { id: 'dir-1', roles: ['ROLE-DIRECTOR'], active_role_code: 'ROLE-DIRECTOR' },
          lotIds: ['lot-short'],
        },
        mockWorkflowTx,
      ),
    /FEFO Workflow Policy/,
  );

  // 5. Warehouse ABAC Scope
  db.inv_warehouse_user_scope = {
    findMany: async () => [{ warehouse_id: 'wh-a', can_read: true, can_write: true, can_approve: false }],
  };
  const allowedWh = await getAllowedWarehouseIds(companyId, { id: 'staff-1', roles: ['ROLE-STAFF'] });
  assert.deepEqual(allowedWh, ['wh-a']);
  await assert.rejects(
    () =>
      assertWarehouseScopeAccess({
        companyId,
        user: { id: 'staff-1', roles: ['ROLE-STAFF'] },
        warehouseId: 'wh-b',
        action: 'read',
      }),
    /ABAC Warehouse Scope/,
  );
  await assert.rejects(
    () =>
      assertWarehouseScopeAccess({
        companyId,
        user: { id: 'staff-1', roles: ['ROLE-STAFF'] },
        warehouseId: 'wh-a',
        action: 'approve',
      }),
    /ABAC Warehouse Scope/,
  );
  // Director bypasses
  await assertWarehouseScopeAccess({
    companyId,
    user: { id: 'dir-1', roles: ['ROLE-DIRECTOR'], active_role_code: 'ROLE-DIRECTOR' },
    warehouseId: 'wh-b',
    action: 'approve',
  });

  // 6. DDMRP Zone Evaluation
  db.inv_ddmrp_buffer = {
    findMany: async () => [
      { id: 'buf-1', product_id: 'prod-1', warehouse_id: 'wh-a', adu: 10, dlt_days: 5, ltf: 0.4, vf: 0.5, moq: 25 },
    ],
  };
  db.master_product = {
    findMany: async () => [{ id: 'prod-1', product_code: 'SKU-01', product_name: 'Kabel LAN', costing_method: 'FIFO', barcode: '8990001' }],
  };
  db.inv_stock_balance = {
    findMany: async () => [{ product_id: 'prod-1', available_quantity: 20, on_hand_quantity: 20, inventory_value: 200_000 }],
  };
  const ddmrpRes = await evaluateDdmrpBuffers(companyId);
  assert.equal(ddmrpRes.length, 1);
  // Yellow = 50, Red = 50*0.4*(1+0.5) = 30, Green = max(20,25)=25, TopOfGreen = 105
  assert.equal(ddmrpRes[0].zones.red_zone, 30);
  assert.equal(ddmrpRes[0].zones.yellow_zone, 50);
  assert.equal(ddmrpRes[0].zones.green_zone, 25);
  assert.equal(ddmrpRes[0].zone_status, 'CRITICAL_RED');
  assert.equal(ddmrpRes[0].recommended_order_qty, 85);

  // 7. GS1 EPCIS 2.0 Export
  db.inv_stock_ledger_entry = {
    findMany: async () => [
      {
        id: 'led-1',
        product_id: 'prod-1',
        warehouse_location_id: 'loc-1',
        transaction_type: 'RECEIPT',
        quantity_delta: 100,
        value_delta: 1_000_000,
        posting_at: new Date('2026-11-18T00:00:00Z'),
      },
      {
        id: 'led-2',
        product_id: 'prod-1',
        warehouse_location_id: 'loc-1',
        transaction_type: 'ISSUE',
        quantity_delta: -20,
        value_delta: -200_000,
        posting_at: new Date('2026-11-18T01:00:00Z'),
      },
    ],
  };
  db.master_warehouse_location = { findMany: async () => [{ id: 'loc-1', location_code: 'WH-MAIN' }] };
  db.inv_lot = { findMany: async () => [] };
  db.inv_serial_number = { findMany: async () => [] };
  const epcis = await exportEpcis2Document({ companyId });
  assert.equal(epcis.type, 'EPCISDocument');
  assert.equal(epcis.epcisBody.eventList.length, 2);
  assert.equal(epcis.epcisBody.eventList[0].bizStep, 'receiving');
  assert.equal(epcis.epcisBody.eventList[1].bizStep, 'shipping');

  // 8. Material Ledger PUP
  const pupRows = await calculatePeriodicUnitPrice({
    companyId,
    productId: 'prod-1',
    periodStart: new Date('2026-11-01T00:00:00Z'),
    periodEnd: new Date('2026-11-30T23:59:59Z'),
    varianceAmount: 100_000,
  });
  assert.equal(pupRows.length, 1);
  // (1,000,000 + 100,000) / 100 = 11,000
  assert.equal(pupRows[0].periodic_unit_price, 11_000);
  assert.equal(pupRows[0].cogs_revaluation_delta, 20_000);

  // 9. OpenAPI 3.0 Spec
  assert.equal(INVENTORY_OPENAPI_SPEC.openapi, '3.0.3');
  assert.ok(INVENTORY_OPENAPI_SPEC.paths['/api/v1/inventory/ddmrp/buffers']);

  console.log('ALL UNIVERSAL INVENTORY UNIT TESTS PASSED (9/9 groups)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

