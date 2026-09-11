import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { ValidationError, NotFoundError } from '../../utils/errors';

export async function postStockMove(id: string, companyId: string, userId: string, transaction?: Prisma.TransactionClient): Promise<any> {
  const run = async (tx: Prisma.TransactionClient) => {
    const move = await tx.inv_stock_move.findFirst({ where: { id, company_id: companyId } });
    if (!move) throw new NotFoundError('StockMove');
    if (move.status === 'COMPLETED') {
      if (!await tx.inv_stock_ledger_entry.findFirst({ where: { company_id: companyId, source_document_id: id } })) throw new ValidationError('Movement lama selesai tanpa ledger; rekonsiliasi dahulu.');
      return move;
    }
    if (!['DRAFT', 'CONFIRMED', 'READY'].includes(move.status)) throw new ValidationError('Status movement tidak dapat diposting.');
    if (!['RECEIPT', 'ISSUE', 'TRANSFER'].includes(move.move_type)) throw new ValidationError('Jenis movement memerlukan command penyesuaian tersendiri.');
    const sourceId = move.source_location_id, destinationId = move.destination_location_id;
    if ((move.move_type === 'RECEIPT' && (sourceId || !destinationId)) || (move.move_type === 'ISSUE' && (!sourceId || destinationId)) || (move.move_type === 'TRANSFER' && (!sourceId || !destinationId || sourceId === destinationId))) throw new ValidationError('Lokasi tidak sesuai jenis movement.');
    for (const locationId of [sourceId, destinationId].filter(Boolean)) {
      const location = await tx.master_warehouse_location.findFirst({ where: { id: locationId!, company_id: companyId, active: true } });
      if (!location || location.quality_hold) throw new ValidationError('Lokasi tidak valid atau dalam quality hold.');
    }
    if (move.project_id && !await tx.project_project.findFirst({ where: { id: move.project_id, company_id: companyId } })) throw new ValidationError('Project movement tidak valid.');
    if (move.production_order_id && !await tx.mfg_production_order.findFirst({ where: { id: move.production_order_id, company_id: companyId } })) throw new ValidationError('Production order movement tidak valid.');
    const lines = await tx.inv_stock_move_line.findMany({ where: { stock_move_id: id, company_id: companyId }, orderBy: { id: 'asc' } });
    if (!lines.length) throw new ValidationError('Movement harus memiliki baris.');
    const scope = { company_id: companyId, tenant_id: move.tenant_id, created_by_id: userId };
    for (const line of lines) {
      const product = await tx.master_product.findFirst({ where: { id: line.product_id ?? '', company_id: companyId, status: 'ACTIVE' } });
      if (!product || !product.stock_item || product.costing_method !== 'FIFO' || product.base_uom_id !== line.uom_id) throw new ValidationError('Posting ini memerlukan stock item FIFO dengan UOM dasar yang sama.');
      // Lot/serial inventory requires a dedicated traceability contract, not implicit pooling.
      if (product.lot_controlled || product.serial_controlled || line.lot_id || line.serial_number_id) throw new ValidationError('Lot/serial movement memerlukan posting traceability; tidak dapat dipool ke stok umum.');
      const quantity = line.quantity;
      if (quantity == null || quantity.lte(0)) throw new ValidationError('Kuantitas movement harus positif.');
      let value = new Prisma.Decimal(0);
      const key = { company_id: companyId, product_id: product.id, lot_id: null, serial_number_id: null };
      if (sourceId) {
        const receipts = await tx.inv_stock_ledger_entry.findMany({ where: { ...key, warehouse_location_id: sourceId, quantity_delta: { gt: 0 } }, select: { id: true } });
        const layers = await tx.inv_valuation_layer.findMany({ where: { company_id: companyId, product_id: product.id, receipt_ledger_entry_id: { in: receipts.map(r => r.id) }, remaining_quantity: { gt: 0 } }, orderBy: [{ received_at: 'asc' }, { id: 'asc' }] });
        let remaining = quantity;
        for (const layer of layers) {
          if (remaining.isZero()) break;
          if (layer.unit_cost == null || layer.unit_cost.lt(0) || layer.remaining_quantity == null) throw new ValidationError('FIFO layer tidak valid.');
          const take = Prisma.Decimal.min(remaining, layer.remaining_quantity);
          value = value.plus(take.times(layer.unit_cost));
          const left = layer.remaining_quantity.minus(take);
          await tx.inv_valuation_layer.update({ where: { id: layer.id }, data: { remaining_quantity: left, remaining_value: left.times(layer.unit_cost) } });
          remaining = remaining.minus(take);
        }
        if (!remaining.isZero()) throw new ValidationError('FIFO layer tidak mencukupi; rekonsiliasi stok diperlukan.');
      } else {
        if (line.unit_cost == null || line.unit_cost.lt(0)) throw new ValidationError('Harga perolehan receipt wajib tersedia.');
        value = quantity.times(line.unit_cost);
      }
      for (const [location, sign] of [[sourceId, -1], [destinationId, 1]] as const) {
        if (!location) continue;
        const balances = await tx.inv_stock_balance.findMany({ where: { ...key, warehouse_location_id: location } });
        if (balances.length > 1) throw new ValidationError('Duplikasi stock balance perlu direkonsiliasi.');
        const balance = balances[0];
        const onHand = new Prisma.Decimal(balance?.on_hand_quantity ?? 0).plus(quantity.times(sign));
        const reserved = new Prisma.Decimal(balance?.reserved_quantity ?? 0);
        const inventoryValue = new Prisma.Decimal(balance?.inventory_value ?? 0).plus(value.times(sign));
        if (onHand.lt(reserved) || inventoryValue.lt(0)) throw new ValidationError('Stok bebas atau nilai inventory tidak mencukupi.');
        const ledger = await tx.inv_stock_ledger_entry.create({ data: { ...scope, product_id: product.id, warehouse_location_id: location, source_document_id: id, source_line_id: line.id, project_id: move.project_id, production_order_id: move.production_order_id, posting_at: new Date(), quantity_delta: quantity.times(sign), value_delta: value.times(sign), unit_cost: value.div(quantity), balance_quantity: onHand, balance_value: inventoryValue } });
        const data = { on_hand_quantity: onHand, reserved_quantity: reserved, available_quantity: onHand.minus(reserved), inventory_value: inventoryValue, last_ledger_entry_id: ledger.id };
        if (balance) await tx.inv_stock_balance.update({ where: { id: balance.id }, data });
        else await tx.inv_stock_balance.create({ data: { ...scope, ...key, warehouse_location_id: location, ...data } });
        if (sign === 1) {
          const locationRow = await tx.master_warehouse_location.findFirst({ where: { id: location, company_id: companyId } });
          await tx.inv_valuation_layer.create({ data: { ...scope, product_id: product.id, warehouse_id: locationRow!.warehouse_id, receipt_ledger_entry_id: ledger.id, original_quantity: quantity, remaining_quantity: quantity, unit_cost: value.div(quantity), remaining_value: value, received_at: new Date() } });
        }
      }
      await tx.inv_stock_move_line.update({ where: { id: line.id }, data: { total_value: value, unit_cost: value.div(quantity) } });
    }
    return tx.inv_stock_move.update({ where: { id }, data: { status: 'COMPLETED', completed_at: new Date() } });
  };
  return transaction ? run(transaction) : prisma.$transaction(run, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
