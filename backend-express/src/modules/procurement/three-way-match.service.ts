import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { NotFoundError, ValidationError } from '../../utils/errors';

/** Exact matching only: ambiguous product/UOM lines require explicit resolution. */
export async function matchPurchaseOrder(poId: string, receiptId: string, invoiceId: string, companyId: string, userId: string) {
  if (!receiptId || !invoiceId) throw new ValidationError('goods_receipt_id dan supplier_invoice_id wajib diisi.');
  return prisma.$transaction(async tx => {
    const po = await tx.proc_purchase_order.findFirst({ where: { id: poId, company_id: companyId } });
    if (!po) throw new NotFoundError('PurchaseOrder');
    const receipt = await tx.proc_goods_receipt.findFirst({ where: { id: receiptId, purchase_order_id: poId, company_id: companyId } });
    const invoice = await tx.fin_billing_document.findFirst({ where: { id: invoiceId, purchase_order_id: poId, company_id: companyId, billing_type: 'SUPPLIER_INVOICE' } });
    if (!receipt || !invoice || !po.supplier_party_id || receipt.supplier_party_id !== po.supplier_party_id || invoice.party_id !== po.supplier_party_id) throw new ValidationError('PO, penerimaan, invoice, dan supplier harus terhubung dalam company yang sama.');
    if (receipt.status !== 'COMPLETED' || receipt.inspection_status !== 'ACCEPTED') throw new ValidationError('Penerimaan harus selesai dan lolos inspeksi sebelum matching.');
    const [orders, receipts, invoices] = await Promise.all([
      tx.proc_purchase_order_line.findMany({ where: { purchase_order_id: poId, company_id: companyId } }),
      tx.proc_goods_receipt_line.findMany({ where: { goods_receipt_id: receiptId, company_id: companyId } }),
      tx.fin_billing_document_line.findMany({ where: { billing_document_id: invoiceId, company_id: companyId } }),
    ]);
    if (!orders.length || !receipts.length || !invoices.length) throw new ValidationError('Baris PO, penerimaan dan invoice wajib tersedia.');
    if (invoice.currency_id !== po.currency_id) throw new ValidationError('Mata uang invoice berbeda dari PO.');
    if (orders.length !== invoices.length || receipts.some(r => !orders.some(o => o.id === r.purchase_order_line_id && o.product_id === r.product_id && o.uom_id === r.uom_id))) throw new ValidationError('Pencocokan penuh memerlukan seluruh baris PO dan referensi penerimaan yang valid.');
    let quantityVariance = new Prisma.Decimal(0), priceVariance = new Prisma.Decimal(0);
    const seen = new Set<string>();
    for (const line of invoices) {
      const key = `${line.product_id}:${line.uom_id}`;
      const candidates = orders.filter(o => o.product_id && o.product_id === line.product_id && o.uom_id === line.uom_id);
      if (candidates.length !== 1 || seen.has(key)) throw new ValidationError('Baris invoice ambigu terhadap PO; product/UOM harus unik untuk pencocokan ini.');
      seen.add(key);
      const order = candidates[0];
      const received = receipts.filter(r => r.purchase_order_line_id === order.id && r.product_id === line.product_id && r.uom_id === line.uom_id);
      if (!received.length || line.quantity == null || line.unit_price == null || order.ordered_quantity == null || order.unit_price == null) throw new ValidationError('Kuantitas, harga, atau referensi penerimaan tidak lengkap.');
      const accepted = received.reduce((sum, r) => sum.plus(r.accepted_quantity ?? 0), new Prisma.Decimal(0));
      if (received.some(r => r.accepted_quantity == null || r.received_quantity == null || r.accepted_quantity.lt(0) || r.accepted_quantity.gt(r.received_quantity))) throw new ValidationError('Kuantitas penerimaan tidak konsisten.');
      if (line.quantity.lte(0) || line.quantity.gt(order.ordered_quantity)) throw new ValidationError('Kuantitas invoice harus positif dan tidak melebihi PO.');
      quantityVariance = quantityVariance.plus(line.quantity.minus(accepted).abs());
      quantityVariance = quantityVariance.plus(line.quantity.minus(order.ordered_quantity).abs());
      priceVariance = priceVariance.plus(line.unit_price.minus(order.unit_price).abs().times(line.quantity));
    }
    const subtotal = invoices.reduce((sum, line) => sum.plus(line.quantity!.times(line.unit_price!).minus(line.discount_amount ?? 0)), new Prisma.Decimal(0));
    if (invoice.subtotal == null || !subtotal.equals(invoice.subtotal) || invoice.total_amount == null || !subtotal.plus(invoice.tax_amount ?? 0).equals(invoice.total_amount)) throw new ValidationError('Total invoice tidak konsisten dengan baris dan pajaknya.');
    // Tax cannot be allocated safely across partial invoices without line tax amounts.
    if (invoice.tax_amount == null || po.tax_amount == null) throw new ValidationError('Nilai pajak PO dan invoice wajib tersedia.');
    const taxVariance = invoice.tax_amount.minus(po.tax_amount).abs();
    const matched = quantityVariance.isZero() && priceVariance.isZero() && taxVariance.isZero();
    const data = { goods_receipt_id: receiptId, supplier_invoice_id: invoiceId, quantity_variance: quantityVariance, price_variance: priceVariance, tax_variance: taxVariance, match_status: matched ? 'MATCHED' : 'MISMATCH', reviewed_by: userId, reviewed_at: new Date() };
    const previous = await tx.proc_three_way_match.findFirst({ where: { company_id: companyId, purchase_order_id: poId, goods_receipt_id: receiptId, supplier_invoice_id: invoiceId } });
    return previous ? tx.proc_three_way_match.update({ where: { id: previous.id }, data }) : tx.proc_three_way_match.create({ data: { ...data, company_id: companyId, tenant_id: po.tenant_id, created_by_id: userId, purchase_order_id: poId } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
