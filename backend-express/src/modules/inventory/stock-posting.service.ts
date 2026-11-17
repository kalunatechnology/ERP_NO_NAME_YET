import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { ValidationError, NotFoundError } from '../../utils/errors';
import {
  buildBalanceIdentityKey,
  evaluateStockEligibility,
  resolveDefaultInventoryOwnerId,
} from './inventory-policy.service';
import { convertUomQuantity } from './uom-conversion.service';
import { calculateReceiptValuation, consumeOutboundValuation } from './costing-valuation.service';
import { emitInventoryOutboxEvent } from './inventory-event.service';

export interface PostStockMoveOptions {
  inventoryOwnerId?: string;
  conditionStatus?: string;
  idempotencyKeyPrefix?: string;
}

export async function postStockMove(
  id: string,
  companyId: string,
  userId: string,
  transaction?: Prisma.TransactionClient,
  options?: PostStockMoveOptions,
): Promise<any> {
  const run = async (tx: Prisma.TransactionClient) => {
    const move = await tx.inv_stock_move.findFirst({ where: { id, company_id: companyId } });
    if (!move) throw new NotFoundError('StockMove');
    if (move.status === 'COMPLETED') {
      const existingLedger = await tx.inv_stock_ledger_entry.findFirst({
        where: { company_id: companyId, source_document_id: id },
      });
      if (!existingLedger) {
        throw new ValidationError('Movement lama selesai tanpa ledger; rekonsiliasi dahulu.');
      }
      return move;
    }
    if (!['DRAFT', 'CONFIRMED', 'READY', 'APPROVED'].includes(move.status)) {
      throw new ValidationError('Status movement tidak dapat diposting.');
    }
    if (!['RECEIPT', 'ISSUE', 'TRANSFER', 'ADJUSTMENT'].includes(move.move_type)) {
      throw new ValidationError('Jenis movement memerlukan command penyesuaian tersendiri.');
    }

    const sourceId = move.source_location_id;
    const destinationId = move.destination_location_id;
    if (
      (move.move_type === 'RECEIPT' && (sourceId || !destinationId)) ||
      (move.move_type === 'ISSUE' && (!sourceId || destinationId)) ||
      (move.move_type === 'TRANSFER' && (!sourceId || !destinationId || sourceId === destinationId))
    ) {
      throw new ValidationError('Lokasi tidak sesuai jenis movement.');
    }

    const locationMap = new Map<string, any>();
    for (const locationId of [sourceId, destinationId].filter(Boolean)) {
      const location = await tx.master_warehouse_location.findFirst({
        where: { id: locationId!, company_id: companyId, active: true },
      });
      if (!location || location.quality_hold) {
        throw new ValidationError('Lokasi tidak valid atau dalam quality hold.');
      }
      locationMap.set(locationId!, location);
    }

    if (
      move.project_id &&
      !(await tx.project_project.findFirst({ where: { id: move.project_id, company_id: companyId } }))
    ) {
      throw new ValidationError('Project movement tidak valid.');
    }
    if (
      move.production_order_id &&
      !(await tx.mfg_production_order.findFirst({
        where: { id: move.production_order_id, company_id: companyId },
      }))
    ) {
      throw new ValidationError('Production order movement tidak valid.');
    }

    const lines = await tx.inv_stock_move_line.findMany({
      where: { stock_move_id: id, company_id: companyId },
      orderBy: { id: 'asc' },
    });
    if (!lines.length) throw new ValidationError('Movement harus memiliki baris.');

    const defaultOwnerId =
      options?.inventoryOwnerId ||
      (await resolveDefaultInventoryOwnerId(companyId, move.tenant_id, tx));
    const conditionStatus = String(options?.conditionStatus || 'GOOD').trim().toUpperCase();

    // Anti-Deadlock Protocol: precompute and sort all balance_identity_keys, then lock in order
    const identityKeysToLock = new Set<string>();
    for (const line of lines) {
      if (!line.product_id) continue;
      for (const locId of [sourceId, destinationId].filter(Boolean)) {
        identityKeysToLock.add(
          buildBalanceIdentityKey({
            companyId,
            productId: line.product_id,
            locationId: locId!,
            inventoryOwnerId: defaultOwnerId,
            conditionStatus,
            lotId: line.lot_id,
            serialNumberId: line.serial_number_id,
          }),
        );
      }
    }
    const sortedKeys = Array.from(identityKeysToLock).sort();
    if (sortedKeys.length > 0) {
      await (tx as any).$queryRawUnsafe(
        `SELECT id FROM "inv_stock_balance" WHERE "company_id" = $1 AND "balance_identity_key" = ANY($2::text[]) ORDER BY "balance_identity_key" ASC FOR UPDATE`,
        companyId,
        sortedKeys,
      ).catch(() => []);
    }

    const scope = { company_id: companyId, tenant_id: move.tenant_id, created_by_id: userId };

    for (const line of lines) {
      const product = await tx.master_product.findFirst({
        where: { id: line.product_id ?? '', company_id: companyId, status: 'ACTIVE' },
      });
      if (!product || !product.stock_item) {
        throw new ValidationError('Produk tidak aktif atau bukan stock item.');
      }

      const rawQuantity = line.quantity;
      if (rawQuantity == null || rawQuantity.lte(0)) {
        throw new ValidationError('Kuantitas movement harus positif.');
      }

      // Resolve UOM conversion to Base UOM if needed
      let quantity = new Prisma.Decimal(rawQuantity);
      if (line.uom_id && product.base_uom_id && line.uom_id !== product.base_uom_id) {
        const conv = await convertUomQuantity(
          {
            companyId,
            productId: product.id,
            fromUomId: line.uom_id,
            toUomId: product.base_uom_id,
            quantity,
          },
          tx,
        );
        quantity = conv.convertedQuantity;
      }

      // Lot & Serial Number Invariant Enforcement
      if (product.lot_controlled && !line.lot_id) {
        throw new ValidationError(`Produk ${product.product_code} wajib menyertakan Lot / Batch Number.`);
      }
      if (product.serial_controlled) {
        if (!line.serial_number_id) {
          throw new ValidationError(`Produk ${product.product_code} wajib menyertakan Serial Number.`);
        }
        if (!quantity.eq(1)) {
          throw new ValidationError('Mutasi barang berseri (serial_controlled) wajib memiliki kuantitas = 1 per baris.');
        }
      }

      let lotRecord: any = null;
      if (line.lot_id) {
        lotRecord = await tx.inv_lot.findFirst({
          where: { id: line.lot_id, company_id: companyId, product_id: product.id },
        });
        if (!lotRecord) throw new ValidationError('Lot / Batch tidak ditemukan untuk produk ini.');
      }

      if (line.serial_number_id) {
        const serialRec = await tx.inv_serial_number.findFirst({
          where: { id: line.serial_number_id, company_id: companyId, product_id: product.id },
        });
        if (!serialRec) throw new ValidationError('Serial Number tidak ditemukan untuk produk ini.');
      }

      // Valuation calculation
      let totalValue = new Prisma.Decimal(0);
      let consumedLayers: Array<{ unitCost: Prisma.Decimal; quantity: Prisma.Decimal; receivedAt: Date }> = [];

      const sourceIdentityKey = sourceId
        ? buildBalanceIdentityKey({
            companyId,
            productId: product.id,
            locationId: sourceId,
            inventoryOwnerId: defaultOwnerId,
            conditionStatus,
            lotId: line.lot_id ?? null,
            serialNumberId: line.serial_number_id ?? null,
          })
        : null;

      const sourceBalance = sourceId
        ? (await (tx as any).inv_stock_balance.findFirst({
            where: {
              company_id: companyId,
              OR: [
                { balance_identity_key: sourceIdentityKey },
                {
                  product_id: product.id,
                  warehouse_location_id: sourceId,
                  lot_id: line.lot_id ?? null,
                  serial_number_id: line.serial_number_id ?? null,
                },
              ],
            },
          }))
        : null;

      if (sourceId) {
        const currentAvg = new Prisma.Decimal((sourceBalance as any)?.unit_average_cost ?? 0);
        const outboundVal = await consumeOutboundValuation(
          {
            companyId,
            product,
            sourceLocationId: sourceId,
            quantity,
            currentAvgCost: currentAvg,
            lotId: line.lot_id,
            serialNumberId: line.serial_number_id,
          },
          tx,
        );
        totalValue = outboundVal.totalValue;
        consumedLayers = outboundVal.consumedLayers;
      } else {
        const destIdentityKey = destinationId
          ? buildBalanceIdentityKey({
              companyId,
              productId: product.id,
              locationId: destinationId,
              inventoryOwnerId: defaultOwnerId,
              conditionStatus,
              lotId: line.lot_id ?? null,
              serialNumberId: line.serial_number_id ?? null,
            })
          : null;
        const destBalance = destinationId
          ? await (tx as any).inv_stock_balance.findFirst({
              where: {
                company_id: companyId,
                OR: [
                  { balance_identity_key: destIdentityKey },
                  {
                    product_id: product.id,
                    warehouse_location_id: destinationId,
                    lot_id: line.lot_id ?? null,
                    serial_number_id: line.serial_number_id ?? null,
                  },
                ],
              },
            })
          : null;

        const receiptVal = await calculateReceiptValuation(
          {
            companyId,
            tenantId: move.tenant_id,
            product,
            quantity,
            rawUnitCost: line.unit_cost != null ? new Prisma.Decimal(line.unit_cost) : null,
            currentOnHand: new Prisma.Decimal(destBalance?.on_hand_quantity ?? 0),
            currentAvgCost: new Prisma.Decimal(destBalance?.unit_average_cost ?? 0),
            sourceDocumentId: id,
            sourceLineId: line.id,
          },
          tx,
        );
        totalValue = receiptVal.totalValue;
      }

      for (const [location, sign] of [
        [sourceId, -1],
        [destinationId, 1],
      ] as const) {
        if (!location) continue;
        const identityKey = buildBalanceIdentityKey({
          companyId,
          productId: product.id,
          locationId: location,
          inventoryOwnerId: defaultOwnerId,
          conditionStatus,
          lotId: line.lot_id ?? null,
          serialNumberId: line.serial_number_id ?? null,
        });

        const balances = await (tx as any).inv_stock_balance.findMany({
          where: {
            company_id: companyId,
            product_id: product.id,
            warehouse_location_id: location,
            lot_id: line.lot_id ?? null,
            serial_number_id: line.serial_number_id ?? null,
          },
        });
        if (balances.length > 1) {
          throw new ValidationError('Duplikasi stock balance perlu direkonsiliasi.');
        }
        const balance = balances[0];
        const onHand = new Prisma.Decimal(balance?.on_hand_quantity ?? 0).plus(quantity.times(sign));
        const reserved = new Prisma.Decimal(balance?.reserved_quantity ?? 0);
        const allocated = new Prisma.Decimal((balance as any)?.allocated_quantity ?? 0);
        const blocked = new Prisma.Decimal((balance as any)?.blocked_quantity ?? 0);
        const inventoryValue = new Prisma.Decimal(balance?.inventory_value ?? 0).plus(
          totalValue.times(sign),
        );

        const locObj = locationMap.get(location);
        const allowNegative = Boolean((locObj as any)?.allow_negative_stock);
        if (!allowNegative && (onHand.lt(reserved.plus(allocated).plus(blocked)) || inventoryValue.lt(0))) {
          throw new ValidationError('Stok bebas atau nilai inventory tidak mencukupi.');
        }

        // Serial Number Global Uniqueness Invariant: sum(on_hand) across company must be 0 or 1
        if (line.serial_number_id && sign === 1 && onHand.gt(1)) {
          throw new ValidationError(
            'Invariant Nomor Seri dilanggar: 1 Serial Number tidak boleh memiliki saldo > 1.',
          );
        }

        const eligibility = evaluateStockEligibility({
          conditionStatus,
          location: locObj,
          lot: lotRecord,
        });
        const availableQty = eligibility.eligible
          ? Prisma.Decimal.max(
              new Prisma.Decimal(0),
              onHand.minus(reserved).minus(allocated).minus(blocked),
            )
          : new Prisma.Decimal(0);
        const unitAvgCost = onHand.gt(0) ? inventoryValue.div(onHand) : new Prisma.Decimal(0);

        const txType =
          move.move_type === 'TRANSFER'
            ? sign === -1
              ? 'TRANSFER_OUT'
              : 'TRANSFER_IN'
            : move.move_type;
        const idempKey = `${options?.idempotencyKeyPrefix || 'MOVE'}:${id}:${line.id}:${location}:${sign}`;

        const ledger = await (tx as any).inv_stock_ledger_entry.create({
          data: {
            ...scope,
            product_id: product.id,
            warehouse_location_id: location,
            inventory_owner_id: defaultOwnerId,
            condition_status: conditionStatus,
            transaction_type: txType,
            idempotency_key: idempKey,
            lot_id: line.lot_id ?? null,
            serial_number_id: line.serial_number_id ?? null,
            source_document_id: id,
            source_line_id: line.id,
            project_id: move.project_id,
            production_order_id: move.production_order_id,
            posting_at: new Date(),
            quantity_delta: quantity.times(sign),
            value_delta: totalValue.times(sign),
            unit_cost: quantity.gt(0) ? totalValue.div(quantity) : new Prisma.Decimal(0),
            balance_quantity: onHand,
            balance_value: inventoryValue,
          },
        });

        const balanceData = {
          inventory_owner_id: defaultOwnerId,
          condition_status: conditionStatus,
          balance_identity_key: identityKey,
          on_hand_quantity: onHand,
          reserved_quantity: reserved,
          allocated_quantity: allocated,
          blocked_quantity: blocked,
          available_quantity: availableQty,
          unit_average_cost: unitAvgCost,
          inventory_value: inventoryValue,
          version: Number((balance as any)?.version ?? 0) + 1,
          last_ledger_entry_id: ledger.id,
        };

        if (balance) {
          await (tx as any).inv_stock_balance.update({
            where: { id: balance.id },
            data: balanceData,
          });
        } else {
          await (tx as any).inv_stock_balance.create({
            data: {
              ...scope,
              product_id: product.id,
              warehouse_location_id: location,
              lot_id: line.lot_id ?? null,
              serial_number_id: line.serial_number_id ?? null,
              ...balanceData,
            },
          });
        }

        if (line.serial_number_id) {
          await tx.inv_serial_number.update({
            where: { id: line.serial_number_id },
            data: {
              current_location_id: sign === 1 ? location : null,
              status: sign === 1 ? (conditionStatus === 'GOOD' ? 'IN_STOCK' : conditionStatus) : 'ISSUED',
            },
          });
        }

        if (sign === 1) {
          const locationRow =
            locObj ||
            (await tx.master_warehouse_location.findFirst({
              where: { id: location, company_id: companyId },
            }));
          if (consumedLayers.length > 0) {
            for (const cl of consumedLayers) {
              await tx.inv_valuation_layer.create({
                data: {
                  ...scope,
                  product_id: product.id,
                  warehouse_id: locationRow?.warehouse_id ?? null,
                  receipt_ledger_entry_id: ledger.id,
                  original_quantity: cl.quantity,
                  remaining_quantity: cl.quantity,
                  unit_cost: cl.unitCost,
                  remaining_value: cl.quantity.times(cl.unitCost),
                  received_at: cl.receivedAt,
                },
              });
            }
          } else {
            await tx.inv_valuation_layer.create({
              data: {
                ...scope,
                product_id: product.id,
                warehouse_id: locationRow?.warehouse_id ?? null,
                receipt_ledger_entry_id: ledger.id,
                original_quantity: quantity,
                remaining_quantity: quantity,
                unit_cost: quantity.gt(0) ? totalValue.div(quantity) : new Prisma.Decimal(0),
                remaining_value: totalValue,
                received_at: new Date(),
              },
            });
          }
        }
      }

      await tx.inv_stock_move_line.update({
        where: { id: line.id },
        data: {
          total_value: totalValue,
          unit_cost: quantity.gt(0) ? totalValue.div(quantity) : new Prisma.Decimal(0),
        },
      });
    }

    const completedMove = await tx.inv_stock_move.update({
      where: { id },
      data: { status: 'COMPLETED', completed_at: new Date() },
    });

    await emitInventoryOutboxEvent(
      {
        tenantId: move.tenant_id,
        companyId,
        aggregateType: 'STOCK_MOVE',
        aggregateId: id,
        eventType: 'inventory.stock.posted',
        payload: {
          stock_move_id: id,
          move_type: move.move_type,
          source_location_id: sourceId,
          destination_location_id: destinationId,
          project_id: move.project_id,
          posted_by_id: userId,
        },
      },
      tx,
    );

    return completedMove;
  };

  return transaction
    ? run(transaction)
    : prisma.$transaction(run, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
}

/**
 * Append-only reversal of a COMPLETED StockMove (creates inverse move & ledger entries).
 */
export async function reverseStockMove(
  id: string,
  companyId: string,
  userId: string,
  reason = 'Reversal transaksi stok',
): Promise<any> {
  return prisma.$transaction(
    async (tx) => {
      const originalMove = await tx.inv_stock_move.findFirst({
        where: { id, company_id: companyId },
      });
      if (!originalMove) throw new NotFoundError('StockMove');
      if (originalMove.status !== 'COMPLETED') {
        throw new ValidationError('Hanya dokumen movement berstatus COMPLETED yang dapat di-reverse.');
      }

      const originalLines = await tx.inv_stock_move_line.findMany({
        where: { stock_move_id: id, company_id: companyId },
      });
      if (!originalLines.length) {
        throw new ValidationError('Baris movement asal tidak ditemukan.');
      }

      const inverseMoveType =
        originalMove.move_type === 'RECEIPT'
          ? 'ISSUE'
          : originalMove.move_type === 'ISSUE'
            ? 'RECEIPT'
            : 'TRANSFER';

      const reversalMove = await tx.inv_stock_move.create({
        data: {
          id: crypto.randomUUID(),
          tenant_id: originalMove.tenant_id,
          company_id: companyId,
          created_by_id: userId,
          document_id: originalMove.id,
          move_type: inverseMoveType,
          source_location_id: originalMove.destination_location_id,
          destination_location_id: originalMove.source_location_id,
          project_id: originalMove.project_id,
          production_order_id: originalMove.production_order_id,
          scheduled_at: new Date(),
          status: 'READY',
        },
      });

      for (const line of originalLines) {
        await tx.inv_stock_move_line.create({
          data: {
            id: crypto.randomUUID(),
            tenant_id: originalMove.tenant_id,
            company_id: companyId,
            created_by_id: userId,
            stock_move_id: reversalMove.id,
            product_id: line.product_id,
            lot_id: line.lot_id,
            serial_number_id: line.serial_number_id,
            quantity: line.quantity,
            uom_id: line.uom_id,
            unit_cost: line.unit_cost,
            total_value: line.total_value,
          },
        });
      }

      const postedReversal = await postStockMove(reversalMove.id, companyId, userId, tx, {
        idempotencyKeyPrefix: 'REVERSAL',
      });

      await tx.inv_stock_move.update({
        where: { id: originalMove.id },
        data: { status: 'REVERSED' },
      });

      await emitInventoryOutboxEvent(
        {
          tenantId: originalMove.tenant_id,
          companyId,
          aggregateType: 'STOCK_MOVE',
          aggregateId: originalMove.id,
          eventType: 'inventory.stock.reversed',
          payload: {
            original_move_id: originalMove.id,
            reversal_move_id: reversalMove.id,
            reason,
            reversed_by_id: userId,
          },
        },
        tx,
      );

      return {
        original_move_id: originalMove.id,
        reversal_move: postedReversal,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
