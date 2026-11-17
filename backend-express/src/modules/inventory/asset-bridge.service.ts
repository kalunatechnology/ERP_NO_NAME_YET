import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { NotFoundError, ValidationError } from '../../utils/errors';

/**
 * Idempotent Fixed Asset Capitalization from Goods Receipt or Serialized Inventory.
 */
export async function capitalizeAssetIdempotent(input: {
  companyId: string;
  tenantId?: string | null;
  userId: string;
  productId: string;
  serialNumberId?: string | null;
  serialNumberText?: string;
  sourceGoodsReceiptId?: string | null;
  sourceGoodsReceiptLineId?: string | null;
  warehouseLocationId?: string | null;
  departmentId?: string | null;
  projectId?: string | null;
  acquisitionCost: number | string;
  usefulLifeMonths?: number;
}) {
  return prisma.$transaction(async (tx) => {
    const product = await tx.master_product.findFirst({
      where: { id: input.productId, company_id: input.companyId },
    });
    if (!product) throw new NotFoundError('Product');

    const cost = new Prisma.Decimal(input.acquisitionCost ?? 0);
    const minCapCost = new Prisma.Decimal((product as any).capitalization_min_cost ?? 0);
    if ((product as any).is_asset_capitalizable && cost.lt(minCapCost)) {
      throw new ValidationError(
        `Nilai perolehan (${cost.toString()}) di bawah batas minimum kapitalisasi aset (${minCapCost.toString()}).`,
      );
    }

    // Idempotency check by serial_number_id or (source_goods_receipt_line_id + serial_number)
    if (input.serialNumberId) {
      const existingBySerial = await (tx as any).asset_asset.findFirst({
        where: { company_id: input.companyId, serial_number_id: input.serialNumberId },
      });
      if (existingBySerial) {
        return { asset: existingBySerial, idempotentReplay: true };
      }
    }

    const assetCode = `AST-${new Date().toISOString().slice(0, 7).replace('-', '')}-${crypto
      .randomBytes(3)
      .toString('hex')
      .toUpperCase()}`;

    const createdAsset = await (tx as any).asset_asset.create({
      data: {
        id: crypto.randomUUID(),
        tenant_id: input.tenantId ?? product.tenant_id,
        company_id: input.companyId,
        created_by_id: input.userId,
        category_id: (product as any).default_asset_category_id ?? product.category_id,
        product_id: product.id,
        serial_number_id: input.serialNumberId ?? null,
        source_goods_receipt_id: input.sourceGoodsReceiptId ?? null,
        source_goods_receipt_line_id: input.sourceGoodsReceiptLineId ?? null,
        warehouse_location_id: input.warehouseLocationId ?? null,
        department_id: input.departmentId ?? null,
        project_id: input.projectId ?? null,
        asset_code: assetCode,
        asset_name: product.product_name,
        serial_number: input.serialNumberText || assetCode,
        acquisition_date: new Date(),
        available_for_use_date: new Date(),
        acquisition_cost: cost,
        salvage_value: new Prisma.Decimal(0),
        useful_life_months: input.usefulLifeMonths ?? 48,
        status: 'IN_STORAGE',
      },
    });

    return { asset: createdAsset, idempotentReplay: false };
  });
}

/**
 * Assigns or transfers an asset custodian (Employee/User/Project/Location) and records history.
 */
export async function assignAssetCustodian(input: {
  assetId: string;
  companyId: string;
  tenantId?: string | null;
  actorUserId: string;
  assignmentType?: 'HANDOVER' | 'RETURN' | 'TRANSFER' | 'MAINTENANCE_SEND';
  custodianUserId?: string | null;
  custodianEmpId?: string | null;
  departmentId?: string | null;
  projectId?: string | null;
  locationId?: string | null;
  conditionStatus?: string;
  notes?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const asset = await (tx as any).asset_asset.findFirst({
      where: { id: input.assetId, company_id: input.companyId },
    });
    if (!asset) throw new NotFoundError('Asset');

    // Close previous active assignment
    await (tx as any).asset_assignment_history.updateMany({
      where: { company_id: input.companyId, asset_id: asset.id, is_current: true },
      data: { is_current: false, returned_at: new Date() },
    });

    const assignType = String(input.assignmentType || 'HANDOVER').toUpperCase();
    const isReturn = assignType === 'RETURN';

    const historyRow = await (tx as any).asset_assignment_history.create({
      data: {
        id: crypto.randomUUID(),
        tenant_id: input.tenantId ?? asset.tenant_id,
        company_id: input.companyId,
        asset_id: asset.id,
        assignment_type: assignType,
        custodian_user_id: isReturn ? null : input.custodianUserId ?? null,
        custodian_emp_id: isReturn ? null : input.custodianEmpId ?? null,
        department_id: input.departmentId ?? asset.department_id,
        project_id: input.projectId ?? asset.project_id,
        location_id: input.locationId ?? asset.warehouse_location_id,
        condition_status: String(input.conditionStatus || 'GOOD').toUpperCase(),
        is_current: !isReturn,
        assigned_at: new Date(),
        returned_at: isReturn ? new Date() : null,
        notes: input.notes ? String(input.notes).trim() : '',
        assigned_by_id: input.actorUserId,
      },
    });

    const updatedAsset = await (tx as any).asset_asset.update({
      where: { id: asset.id },
      data: {
        current_custodian_user_id: isReturn ? null : input.custodianUserId ?? null,
        current_custodian_emp_id: isReturn ? null : input.custodianEmpId ?? null,
        department_id: input.departmentId ?? asset.department_id,
        project_id: input.projectId ?? asset.project_id,
        warehouse_location_id: input.locationId ?? asset.warehouse_location_id,
        status: isReturn
          ? 'IN_STORAGE'
          : assignType === 'MAINTENANCE_SEND'
            ? 'MAINTENANCE'
            : 'IN_USE',
      },
    });

    if (asset.serial_number_id && input.locationId) {
      await tx.inv_serial_number
        .update({
          where: { id: asset.serial_number_id },
          data: { current_location_id: input.locationId },
        })
        .catch(() => null);
    }

    return {
      asset: updatedAsset,
      history: historyRow,
    };
  });
}
