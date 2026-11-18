/**
 * File: backend-express/src/modules/inventory/advanced/ddmrp.service.ts
 *
 * Purpose: Phase 4 — Demand-Driven MRP (DDMRP) Dynamic Buffer Zones.
 * Computes Green, Yellow, and Red zones from ADU, DLT, LTF, VF, and MOQ,
 * and evaluates live Net Flow Position (On-Hand - Allocated + On-Order) to
 * recommend replenishment orders before stockouts occur.
 */
import crypto from 'crypto';
import prisma from '../../../config/database';
import { ValidationError } from '../../../utils/errors';

export async function upsertDdmrpBuffer(input: {
  companyId: string;
  tenantId?: string | null;
  productId: string;
  warehouseId?: string | null;
  adu: number;
  dltDays: number;
  ltf?: number;
  vf?: number;
  moq?: number;
}) {
  if (!input.productId) throw new ValidationError('product_id wajib diisi.');
  const existing = await (prisma as any).inv_ddmrp_buffer.findFirst({
    where: {
      company_id: input.companyId,
      product_id: input.productId,
      warehouse_id: input.warehouseId ?? null,
    },
  });
  const data = {
    adu: Math.max(0, Number(input.adu ?? 0)),
    dlt_days: Math.max(0, Number(input.dltDays ?? 0)),
    ltf: Math.max(0, Number(input.ltf ?? 0.4)),
    vf: Math.max(0, Number(input.vf ?? 0.5)),
    moq: Math.max(0, Number(input.moq ?? 0)),
    is_active: true,
  };
  if (existing) {
    return (prisma as any).inv_ddmrp_buffer.update({ where: { id: existing.id }, data });
  }
  return (prisma as any).inv_ddmrp_buffer.create({
    data: {
      id: crypto.randomUUID(),
      tenant_id: input.tenantId ?? null,
      company_id: input.companyId,
      product_id: input.productId,
      warehouse_id: input.warehouseId ?? null,
      ...data,
    },
  });
}

export async function evaluateDdmrpBuffers(companyId: string) {
  const buffers: any[] = await (prisma as any).inv_ddmrp_buffer
    ?.findMany?.({ where: { company_id: companyId, is_active: true } })
    .catch(() => []) ?? [];

  if (!buffers.length) return [];

  const productIds = Array.from(new Set(buffers.map((b) => String(b.product_id))));
  const [products, balances] = await Promise.all([
    prisma.master_product.findMany({
      where: { company_id: companyId, id: { in: productIds } },
      select: { id: true, product_code: true, product_name: true },
    }),
    (prisma as any).inv_stock_balance.findMany({
      where: { company_id: companyId, product_id: { in: productIds }, condition_status: 'GOOD' },
      select: { product_id: true, on_hand_quantity: true, reserved_quantity: true, allocated_quantity: true, available_quantity: true },
    }),
  ]);

  const prodMap = new Map(products.map((p) => [p.id, p]));
  const availByProd = new Map<string, number>();
  for (const b of balances) {
    const pid = String(b.product_id || '');
    availByProd.set(pid, (availByProd.get(pid) ?? 0) + Number(b.available_quantity ?? 0));
  }

  return buffers.map((buf) => {
    const adu = Number(buf.adu ?? 0);
    const dlt = Number(buf.dlt_days ?? 0);
    const ltf = Number(buf.ltf ?? 0.4);
    const vf = Number(buf.vf ?? 0.5);
    const moq = Number(buf.moq ?? 0);

    const yellowZone = adu * dlt;
    const redBase = yellowZone * ltf;
    const redSafety = redBase * vf;
    const redZone = redBase + redSafety;
    const greenZone = Math.max(yellowZone * ltf, moq);

    const topOfRed = redZone;
    const topOfYellow = redZone + yellowZone;
    const topOfGreen = topOfYellow + greenZone;

    const netFlowPosition = availByProd.get(String(buf.product_id)) ?? 0;
    let zoneStatus: 'CRITICAL_RED' | 'REORDER_YELLOW' | 'HEALTHY_GREEN' | 'OVERSTOCK' = 'HEALTHY_GREEN';
    if (netFlowPosition <= topOfRed) zoneStatus = 'CRITICAL_RED';
    else if (netFlowPosition <= topOfYellow) zoneStatus = 'REORDER_YELLOW';
    else if (netFlowPosition > topOfGreen) zoneStatus = 'OVERSTOCK';

    const recommendedOrderQty =
      netFlowPosition <= topOfYellow ? Math.max(moq, Math.ceil(topOfGreen - netFlowPosition)) : 0;

    const prod = prodMap.get(String(buf.product_id));
    return {
      id: buf.id,
      product_id: buf.product_id,
      product_code: prod?.product_code ?? null,
      product_name: prod?.product_name ?? null,
      warehouse_id: buf.warehouse_id,
      adu,
      dlt_days: dlt,
      zones: {
        red_zone: Number(redZone.toFixed(2)),
        yellow_zone: Number(yellowZone.toFixed(2)),
        green_zone: Number(greenZone.toFixed(2)),
        top_of_red: Number(topOfRed.toFixed(2)),
        top_of_yellow: Number(topOfYellow.toFixed(2)),
        top_of_green: Number(topOfGreen.toFixed(2)),
      },
      net_flow_position: netFlowPosition,
      zone_status: zoneStatus,
      recommended_order_qty: recommendedOrderQty,
    };
  });
}

