/**
 * File: backend-express/src/modules/inventory/extensions/retail-pos.service.ts
 *
 * Purpose: Phase 3 Extension — Retail & Omnichannel POS Auto-Deduction (W4).
 * Deducts sold SKUs/variants from a store location (`ISSUE` -> `VIRT-CUSTOMER`),
 * supporting `allow_negative_stock` configured on store locations.
 */
import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../../../config/database';
import { ValidationError } from '../../../utils/errors';
import { postStockMove } from '../stock-posting.service';
import { assertExtensionEnabled } from './extension-registry.service';

export async function postPosSaleDeduction(input: {
  companyId: string;
  tenantId?: string | null;
  userId: string;
  storeLocationId: string;
  receiptNumber: string;
  lines: Array<{
    product_id: string;
    variant_id?: string | null;
    lot_id?: string | null;
    serial_number_id?: string | null;
    quantity: number | string;
    uom_id?: string | null;
  }>;
}) {
  if (!input.storeLocationId) throw new ValidationError('store_location_id wajib diisi.');
  if (!input.lines.length) throw new ValidationError('Minimal 1 item penjualan POS wajib diisi.');

  return prisma.$transaction(
    async (tx: any) => {
      await assertExtensionEnabled(input.companyId, 'RETAIL_POS', tx);

      const move = await tx.inv_stock_move.create({
        data: {
          id: crypto.randomUUID(),
          tenant_id: input.tenantId ?? null,
          company_id: input.companyId,
          created_by_id: input.userId,
          document_id: input.receiptNumber || null,
          move_type: 'ISSUE',
          source_location_id: input.storeLocationId,
          destination_location_id: null,
          scheduled_at: new Date(),
          status: 'READY',
        },
      });

      for (const l of input.lines) {
        await tx.inv_stock_move_line.create({
          data: {
            id: crypto.randomUUID(),
            tenant_id: input.tenantId ?? null,
            company_id: input.companyId,
            created_by_id: input.userId,
            stock_move_id: move.id,
            product_id: l.product_id,
            variant_id: l.variant_id ?? null,
            lot_id: l.lot_id ?? null,
            serial_number_id: l.serial_number_id ?? null,
            quantity: l.quantity,
            uom_id: l.uom_id ?? null,
          },
        });
      }

      const posted = await postStockMove(move.id, input.companyId, input.userId, tx, {
        counterpartKind: 'CUSTOMER',
        idempotencyKeyPrefix: `POS_${input.receiptNumber || move.id}`,
      });
      return { receipt_number: input.receiptNumber, stock_move: posted };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

