import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { ValidationError } from '../../utils/errors';

/**
 * Resolves multi-UOM conversions (direct, reverse, or 2-hop chained via Base UOM)
 * using Prisma.Decimal arithmetic.
 */
export async function convertUomQuantity(
  input: {
    companyId: string;
    productId?: string | null;
    fromUomId: string;
    toUomId: string;
    quantity: Prisma.Decimal | number | string;
  },
  tx: any = prisma,
): Promise<{
  convertedQuantity: Prisma.Decimal;
  factor: Prisma.Decimal;
}> {
  const qty = new Prisma.Decimal(input.quantity);
  if (input.fromUomId === input.toUomId) {
    return { convertedQuantity: qty, factor: new Prisma.Decimal(1) };
  }

  const rules: any[] = await tx.master_uom_conversion
    .findMany({
      where: {
        company_id: input.companyId,
        status: 'ACTIVE',
        OR: [{ product_id: input.productId ?? null }, { product_id: null }],
      },
      orderBy: { product_id: 'desc' }, // Product-specific rule takes priority over global rule
    })
    .catch(() => []);

  // 1. Direct match (from -> to)
  const direct = rules.find(
    (r) => r.from_uom_id === input.fromUomId && r.to_uom_id === input.toUomId,
  );
  if (direct) {
    const factor = new Prisma.Decimal(direct.conversion_factor);
    const scale = Number(direct.precision_scale ?? 4);
    const converted = qty.times(factor).toDecimalPlaces(scale, Prisma.Decimal.ROUND_HALF_UP);
    return { convertedQuantity: converted, factor };
  }

  // 2. Inverse match (to -> from)
  const inverse = rules.find(
    (r) => r.from_uom_id === input.toUomId && r.to_uom_id === input.fromUomId,
  );
  if (inverse) {
    const invFactor = new Prisma.Decimal(inverse.conversion_factor);
    if (invFactor.lte(0)) throw new ValidationError('Faktor konversi UOM tidak valid.');
    const factor = new Prisma.Decimal(1).div(invFactor);
    const scale = Number(inverse.precision_scale ?? 4);
    const converted = qty.times(factor).toDecimalPlaces(scale, Prisma.Decimal.ROUND_HALF_UP);
    return { convertedQuantity: converted, factor };
  }

  // 3. Two-hop chain (from -> mid -> to)
  for (const r1 of rules.filter((r) => r.from_uom_id === input.fromUomId)) {
    const r2 = rules.find((r) => r.from_uom_id === r1.to_uom_id && r.to_uom_id === input.toUomId);
    if (r2) {
      const factor = new Prisma.Decimal(r1.conversion_factor).times(
        new Prisma.Decimal(r2.conversion_factor),
      );
      const scale = Number(r2.precision_scale ?? 4);
      const converted = qty.times(factor).toDecimalPlaces(scale, Prisma.Decimal.ROUND_HALF_UP);
      return { convertedQuantity: converted, factor };
    }
  }

  throw new ValidationError(
    `Aturan konversi satuan dari UOM '${input.fromUomId}' ke '${input.toUomId}' belum terdaftar.`,
  );
}

