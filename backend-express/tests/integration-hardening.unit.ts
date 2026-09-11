import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import prisma from '../src/config/database';
import { matchPurchaseOrder } from '../src/modules/procurement/three-way-match.service';
import { postRequestDisbursement } from '../src/modules/finance/request-disbursement.service';
import { AssetService } from '../src/modules/assets/asset.service';
import { assertNoGenericLifecycleWrite, assertRecordMutable } from '../src/utils/crud-factory';

const dec = (n: number) => new Prisma.Decimal(n);
async function main() {
  let writes = 0;
  let price = 10;
  let receiptCompanyMatches = true;
  const original = prisma.$transaction;
  const tx = {
    proc_purchase_order: { findFirst: async () => ({ id: 'po', supplier_party_id: 'vendor', currency_id: 'idr', tax_amount: dec(0) }) },
    proc_goods_receipt: { findFirst: async () => receiptCompanyMatches ? ({ supplier_party_id: 'vendor', status: 'COMPLETED', inspection_status: 'ACCEPTED' }) : null },
    fin_billing_document: { findFirst: async () => ({ party_id: 'vendor', currency_id: 'idr', tax_amount: dec(0), subtotal: dec(2 * price), total_amount: dec(2 * price) }) },
    proc_purchase_order_line: { findMany: async () => [{ id: 'line', product_id: 'product', uom_id: 'pcs', ordered_quantity: dec(2), unit_price: dec(10) }] },
    proc_goods_receipt_line: { findMany: async () => [{ purchase_order_line_id: 'line', product_id: 'product', uom_id: 'pcs', accepted_quantity: dec(2), received_quantity: dec(2) }] },
    fin_billing_document_line: { findMany: async () => [{ product_id: 'product', uom_id: 'pcs', quantity: dec(2), unit_price: dec(price) }] },
    proc_three_way_match: { findFirst: async () => null, create: async ({ data }: any) => { writes++; return data; } },
  };
  (prisma as any).$transaction = async (callback: any) => callback(tx);
  try {
    assert.equal((await matchPurchaseOrder('po', 'gr', 'inv', 'company', 'actor')).match_status, 'MATCHED');
    price = 11;
    const mismatch = await matchPurchaseOrder('po', 'gr', 'inv', 'company', 'actor');
    assert.equal(mismatch.match_status, 'MISMATCH');
    assert.equal(mismatch.price_variance?.toString(), '2');
    receiptCompanyMatches = false;
    await assert.rejects(matchPurchaseOrder('po', 'gr', 'inv', 'company', 'actor'), /terhubung/);
    assert.equal(writes, 2, 'Invalid references must not persist a match');
    await assert.rejects(postRequestDisbursement('req', '', '', 'actor', 'company'), /wajib/);
    await assert.rejects(AssetService.disposeAsset('asset', new Date(), -1, 'actor', 'company'), /non-negatif/);
    assert.throws(() => assertNoGenericLifecycleWrite('inv_stock_move', { status: 'COMPLETED' }), /lifecycle/);
    assert.throws(() => assertRecordMutable('qa_inspection', { status: 'COMPLETED' }), /immutable/);
    assert.throws(() => assertNoGenericLifecycleWrite('fin_billing_document', { tax_scheme: 'invented' }), /tax_scheme/);
    console.log('PASS: exact match, price mismatch, invalid references/no write, invalid disbursement, invalid disposal, lifecycle and tax guards. Mocked service tests; database atomicity is not verified.');
  } finally { (prisma as any).$transaction = original; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
