import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { postStockMove } from '../inventory/stock-posting.service';
import { ValidationError, NotFoundError } from '../../utils/errors';

/** Issues explicitly prepared stock movements; does not invent warehouse locations. */
export async function issueProductionMaterials(id: string, companyId: string, userId: string) {
  return prisma.$transaction(async tx => {
    const order = await tx.mfg_production_order.findFirst({ where: { id, company_id: companyId } });
    if (!order) throw new NotFoundError('ProductionOrder');
    if (!['RELEASED', 'IN_PROGRESS'].includes(order.status)) throw new ValidationError('Production order harus RELEASED sebelum issue.');
    const materials = await tx.mfg_production_material.findMany({ where: { company_id: companyId, production_order_id: id } });
    const moves = await tx.inv_stock_move.findMany({ where: { company_id: companyId, production_order_id: id, move_type: 'ISSUE' } });
    if (!materials.length || !moves.length) throw new ValidationError('Material plan dan stock ISSUE terkait wajib disiapkan.');
    if (new Set(materials.map(m => m.product_id)).size !== materials.length) throw new ValidationError('Material product ambigu; satukan material plan sebelum issue.');
    for (const move of moves) await postStockMove(move.id, companyId, userId, tx);
    const ledger = await tx.inv_stock_ledger_entry.findMany({ where: { company_id: companyId, production_order_id: id, source_document_id: { in: moves.map(m => m.id) }, quantity_delta: { lt: 0 } } });
    if (ledger.some(l => !materials.some(m => m.product_id === l.product_id))) throw new ValidationError('Movement memuat product di luar material plan.');
    for (const material of materials) {
      const entries = ledger.filter(l => l.product_id === material.product_id);
      const quantity = entries.reduce((sum, l) => sum.minus(l.quantity_delta ?? 0), new Prisma.Decimal(0));
      const cost = entries.reduce((sum, l) => sum.minus(l.value_delta ?? 0), new Prisma.Decimal(0));
      if (material.required_quantity == null || !quantity.equals(material.required_quantity)) throw new ValidationError('Kuantitas ISSUE harus sesuai kebutuhan material plan.');
      await tx.mfg_production_material.update({ where: { id: material.id }, data: { issued_quantity: quantity, actual_cost: cost } });
      for (const entry of entries) {
        if (!await tx.mfg_cost_ledger_entry.findFirst({ where: { company_id: companyId, stock_ledger_entry_id: entry.id } })) {
          await tx.mfg_cost_ledger_entry.create({ data: { company_id: companyId, tenant_id: order.tenant_id, created_by_id: userId, project_id: order.project_id, production_order_id: id, product_id: entry.product_id, cost_element: 'MATERIAL', quantity: entry.quantity_delta!.negated(), rate: entry.unit_cost, amount: entry.value_delta!.negated(), stock_ledger_entry_id: entry.id, source_document_id: entry.source_document_id, posting_at: new Date() } });
        }
      }
    }
    return tx.mfg_production_order.update({ where: { id }, data: { status: 'IN_PROGRESS', material_status: 'ISSUED', actual_start_at: order.actual_start_at ?? new Date() } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
