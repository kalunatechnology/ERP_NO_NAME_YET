/**
 * File: backend-express/src/modules/inventory/intercompany-sto.service.ts
 *
 * Purpose: Universal Inventory Phase 2 — Intercompany Stock Transport Order (STO).
 * Orchestrates stock movement across two different legal entities (companies)
 * within the same tenant:
 *   1. Create STO (Requesting Co <-> Supplying Co)
 *   2. Approve STO (with SoD)
 *   3. Dispatch STO (ISSUE from Supplying Co -> VIRT-CUSTOMER, captures unit_cost)
 *   4. Receive STO (RECEIPT into Requesting Co <- VIRT-VENDOR at dispatched cost,
 *      emits `inventory.intercompany.received` outbox event for AP/AR elimination)
 */
import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { ForbiddenError, NotFoundError, ValidationError } from '../../utils/errors';
import { postStockMove } from './stock-posting.service';
import { emitInventoryOutboxEvent } from './inventory-event.service';

export interface CreateIntercompanyStoInput {
  tenantId?: string | null;
  userId: string;
  requestingCompanyId: string;
  requestingLocationId: string;
  supplyingCompanyId: string;
  supplyingLocationId: string;
  notes?: string;
  lines: Array<{
    product_id: string;
    uom_id?: string | null;
    lot_id?: string | null;
    serial_number_id?: string | null;
    requested_quantity: number | string;
  }>;
}

export async function createIntercompanySto(input: CreateIntercompanyStoInput) {
  if (input.requestingCompanyId === input.supplyingCompanyId) {
    throw new ValidationError('Intercompany STO harus melibatkan dua company yang berbeda. Gunakan Transfer Order biasa untuk antar-gudang satu company.');
  }
  if (!input.lines.length) {
    throw new ValidationError('Intercompany STO wajib memiliki minimal 1 baris item.');
  }

  return prisma.$transaction(async (tx: any) => {
    const [reqLoc, supLoc] = await Promise.all([
      tx.master_warehouse_location.findFirst({
        where: { id: input.requestingLocationId, company_id: input.requestingCompanyId, active: true },
      }),
      tx.master_warehouse_location.findFirst({
        where: { id: input.supplyingLocationId, company_id: input.supplyingCompanyId, active: true },
      }),
    ]);
    if (!reqLoc) throw new ValidationError('Lokasi penerima (Requesting Company) tidak valid.');
    if (!supLoc) throw new ValidationError('Lokasi pengirim (Supplying Company) tidak valid.');

    const stoNumber = `IC-STO-${Date.now().toString(36).toUpperCase()}`;
    const sto = await tx.inv_intercompany_sto.create({
      data: {
        id: crypto.randomUUID(),
        tenant_id: input.tenantId ?? null,
        sto_number: stoNumber,
        requesting_company_id: input.requestingCompanyId,
        requesting_location_id: input.requestingLocationId,
        supplying_company_id: input.supplyingCompanyId,
        supplying_location_id: input.supplyingLocationId,
        status: 'SUBMITTED',
        notes: input.notes ? String(input.notes).trim() : '',
        requested_by_id: input.userId,
        created_by_id: input.userId,
      },
    });

    const createdLines = [];
    for (const l of input.lines) {
      const qty = new Prisma.Decimal(l.requested_quantity ?? 0);
      if (qty.lte(0)) throw new ValidationError('Kuantitas Intercompany STO harus positif.');
      const line = await tx.inv_intercompany_sto_line.create({
        data: {
          id: crypto.randomUUID(),
          tenant_id: input.tenantId ?? null,
          sto_id: sto.id,
          product_id: l.product_id,
          uom_id: l.uom_id ?? null,
          lot_id: l.lot_id ?? null,
          serial_number_id: l.serial_number_id ?? null,
          requested_quantity: qty,
        },
      });
      createdLines.push(line);
    }

    return { ...sto, lines: createdLines };
  });
}

export async function approveIntercompanySto(id: string, companyId: string, userId: string) {
  const sto = await (prisma as any).inv_intercompany_sto.findFirst({
    where: {
      id,
      OR: [{ requesting_company_id: companyId }, { supplying_company_id: companyId }],
    },
  });
  if (!sto) throw new NotFoundError('IntercompanySTO');
  if (!['DRAFT', 'SUBMITTED'].includes(sto.status)) {
    throw new ValidationError(`Intercompany STO berstatus ${sto.status} tidak dapat di-approve.`);
  }
  if (sto.requested_by_id && sto.requested_by_id === userId) {
    throw new ForbiddenError('Segregation of Duties (SoD): Pembuat STO tidak dapat menyetujui STO sendiri.');
  }
  return (prisma as any).inv_intercompany_sto.update({
    where: { id: sto.id },
    data: { status: 'APPROVED', approved_by_id: userId, approved_at: new Date() },
  });
}

export async function dispatchIntercompanySto(id: string, supplyingCompanyId: string, userId: string) {
  return prisma.$transaction(
    async (tx: any) => {
      const sto = await tx.inv_intercompany_sto.findFirst({
        where: { id, supplying_company_id: supplyingCompanyId },
      });
      if (!sto) throw new NotFoundError('IntercompanySTO');
      if (sto.status !== 'APPROVED') {
        throw new ValidationError('Intercompany STO harus berstatus APPROVED sebelum dispatch.');
      }

      const lines = await tx.inv_intercompany_sto_line.findMany({ where: { sto_id: sto.id } });
      if (!lines.length) throw new ValidationError('Intercompany STO tidak memiliki baris item.');

      const outMove = await tx.inv_stock_move.create({
        data: {
          id: crypto.randomUUID(),
          tenant_id: sto.tenant_id,
          company_id: sto.supplying_company_id,
          created_by_id: userId,
          document_id: sto.id,
          move_type: 'ISSUE',
          source_location_id: sto.supplying_location_id,
          destination_location_id: null,
          scheduled_at: new Date(),
          status: 'READY',
        },
      });

      const moveLineIds: Array<{ stoLineId: string; moveLineId: string; qty: Prisma.Decimal }> = [];
      for (const line of lines) {
        const moveLineId = crypto.randomUUID();
        const qty = new Prisma.Decimal(line.requested_quantity);
        await tx.inv_stock_move_line.create({
          data: {
            id: moveLineId,
            tenant_id: sto.tenant_id,
            company_id: sto.supplying_company_id,
            created_by_id: userId,
            stock_move_id: outMove.id,
            product_id: line.product_id,
            lot_id: line.lot_id,
            serial_number_id: line.serial_number_id,
            quantity: qty,
            uom_id: line.uom_id,
          },
        });
        moveLineIds.push({ stoLineId: line.id, moveLineId, qty });
      }

      await postStockMove(outMove.id, sto.supplying_company_id, userId, tx, {
        counterpartKind: 'CUSTOMER',
        idempotencyKeyPrefix: `IC_STO_OUT_${sto.id}`,
      });

      let totalAmount = new Prisma.Decimal(0);
      for (const pair of moveLineIds) {
        const postedLine = await tx.inv_stock_move_line.findUnique({ where: { id: pair.moveLineId } });
        const unitCost = new Prisma.Decimal(postedLine?.unit_cost ?? 0);
        const lineTotal = new Prisma.Decimal(postedLine?.total_value ?? 0);
        totalAmount = totalAmount.plus(lineTotal);
        await tx.inv_intercompany_sto_line.update({
          where: { id: pair.stoLineId },
          data: { shipped_quantity: pair.qty, unit_cost: unitCost, total_value: lineTotal },
        });
      }

      const updatedSto = await tx.inv_intercompany_sto.update({
        where: { id: sto.id },
        data: {
          status: 'DISPATCHED',
          total_amount: totalAmount,
          dispatched_by_id: userId,
          dispatched_at: new Date(),
        },
      });

      await emitInventoryOutboxEvent(
        {
          tenantId: sto.tenant_id,
          companyId: sto.supplying_company_id,
          aggregateType: 'INTERCOMPANY_STO',
          aggregateId: sto.id,
          eventType: 'inventory.intercompany.dispatched',
          payload: {
            sto_id: sto.id,
            sto_number: sto.sto_number,
            supplying_company_id: sto.supplying_company_id,
            requesting_company_id: sto.requesting_company_id,
            total_amount: totalAmount.toString(),
          },
        },
        tx,
      );

      return updatedSto;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function receiveIntercompanySto(id: string, requestingCompanyId: string, userId: string) {
  return prisma.$transaction(
    async (tx: any) => {
      const sto = await tx.inv_intercompany_sto.findFirst({
        where: { id, requesting_company_id: requestingCompanyId },
      });
      if (!sto) throw new NotFoundError('IntercompanySTO');
      if (sto.status !== 'DISPATCHED') {
        throw new ValidationError('Intercompany STO harus berstatus DISPATCHED sebelum diterima.');
      }

      const lines = await tx.inv_intercompany_sto_line.findMany({ where: { sto_id: sto.id } });
      const inMove = await tx.inv_stock_move.create({
        data: {
          id: crypto.randomUUID(),
          tenant_id: sto.tenant_id,
          company_id: sto.requesting_company_id,
          created_by_id: userId,
          document_id: sto.id,
          move_type: 'RECEIPT',
          source_location_id: null,
          destination_location_id: sto.requesting_location_id,
          scheduled_at: new Date(),
          status: 'READY',
        },
      });

      for (const line of lines) {
        const qty = new Prisma.Decimal(line.shipped_quantity ?? line.requested_quantity ?? 0);
        if (qty.lte(0)) continue;
        await tx.inv_stock_move_line.create({
          data: {
            id: crypto.randomUUID(),
            tenant_id: sto.tenant_id,
            company_id: sto.requesting_company_id,
            created_by_id: userId,
            stock_move_id: inMove.id,
            product_id: line.product_id,
            lot_id: line.lot_id,
            serial_number_id: line.serial_number_id,
            quantity: qty,
            uom_id: line.uom_id,
            unit_cost: line.unit_cost,
          },
        });
        await tx.inv_intercompany_sto_line.update({
          where: { id: line.id },
          data: { received_quantity: qty },
        });
      }

      await postStockMove(inMove.id, sto.requesting_company_id, userId, tx, {
        counterpartKind: 'VENDOR',
        idempotencyKeyPrefix: `IC_STO_IN_${sto.id}`,
      });

      const updatedSto = await tx.inv_intercompany_sto.update({
        where: { id: sto.id },
        data: { status: 'RECEIVED', received_by_id: userId, received_at: new Date() },
      });

      await emitInventoryOutboxEvent(
        {
          tenantId: sto.tenant_id,
          companyId: sto.requesting_company_id,
          aggregateType: 'INTERCOMPANY_STO',
          aggregateId: sto.id,
          eventType: 'inventory.intercompany.received',
          payload: {
            sto_id: sto.id,
            sto_number: sto.sto_number,
            supplying_company_id: sto.supplying_company_id,
            requesting_company_id: sto.requesting_company_id,
            total_amount: String(sto.total_amount ?? 0),
          },
        },
        tx,
      );

      return updatedSto;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
