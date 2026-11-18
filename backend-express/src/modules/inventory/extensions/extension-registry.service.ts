/**
 * File: backend-express/src/modules/inventory/extensions/extension-registry.service.ts
 *
 * Purpose: Universal Inventory Phase 3 — Composable Industry Extension Registry.
 * Allows each company to toggle industry extensions on/off:
 *   - PROJECT_SITE   : Project Site Warehouses & Excess Material Returns
 *   - MANUFACTURING  : BOM Backflushing & Production Output Receipts
 *   - WMS            : Putaway Suggestions & Wave/FEFO Pick Lists
 *   - RETAIL_POS     : POS Auto-Deduction & Store Negative Stock Support
 */
import crypto from 'crypto';
import prisma from '../../../config/database';
import { ForbiddenError, ValidationError } from '../../../utils/errors';

export const INDUSTRY_EXTENSION_CODES = [
  'PROJECT_SITE',
  'MANUFACTURING',
  'WMS',
  'RETAIL_POS',
] as const;

export type IndustryExtensionCode = typeof INDUSTRY_EXTENSION_CODES[number];

const DEFAULT_EXTENSION_DESCRIPTIONS: Record<IndustryExtensionCode, string> = {
  PROJECT_SITE: 'Project Site Warehouse, Material Allocation & Excess Return',
  MANUFACTURING: 'BOM Component Backflushing & Finished Goods Receipt',
  WMS: '3D Bin Putaway Suggestions & Wave/FEFO Pick List Generation',
  RETAIL_POS: 'Real-Time POS Auto-Deduction per Store/Variant',
};

export async function listCompanyExtensions(companyId: string) {
  const rows: any[] = await (prisma as any).inv_company_extension
    ?.findMany?.({ where: { company_id: companyId } })
    .catch(() => []) ?? [];
  const byCode = new Map(rows.map((r) => [String(r.extension_code).toUpperCase(), r]));
  return INDUSTRY_EXTENSION_CODES.map((code) => {
    const row = byCode.get(code);
    return {
      extension_code: code,
      description: DEFAULT_EXTENSION_DESCRIPTIONS[code],
      is_enabled: Boolean(row?.is_enabled ?? false),
      config_json: row?.config_json ?? '{}',
      updated_at: row?.updated_at ?? null,
    };
  });
}

export async function setCompanyExtension(input: {
  companyId: string;
  tenantId?: string | null;
  userId: string;
  extensionCode: string;
  isEnabled: boolean;
  configJson?: string;
}) {
  const code = String(input.extensionCode || '').trim().toUpperCase() as IndustryExtensionCode;
  if (!INDUSTRY_EXTENSION_CODES.includes(code)) {
    throw new ValidationError(`Kode ekstensi "${code}" tidak valid.`);
  }
  const existing = await (prisma as any).inv_company_extension.findFirst({
    where: { company_id: input.companyId, extension_code: code },
  });
  if (existing) {
    return (prisma as any).inv_company_extension.update({
      where: { id: existing.id },
      data: {
        is_enabled: input.isEnabled,
        ...(input.configJson !== undefined ? { config_json: input.configJson } : {}),
        updated_by_id: input.userId,
      },
    });
  }
  return (prisma as any).inv_company_extension.create({
    data: {
      id: crypto.randomUUID(),
      tenant_id: input.tenantId ?? null,
      company_id: input.companyId,
      extension_code: code,
      is_enabled: input.isEnabled,
      config_json: input.configJson ?? '{}',
      updated_by_id: input.userId,
    },
  });
}

export async function assertExtensionEnabled(
  companyId: string,
  extensionCode: IndustryExtensionCode,
  tx: any = prisma,
): Promise<void> {
  const row = await tx.inv_company_extension
    ?.findFirst?.({
      where: { company_id: companyId, extension_code: extensionCode },
      select: { is_enabled: true },
    })
    .catch(() => null);
  if (!row?.is_enabled) {
    throw new ForbiddenError(
      `Ekstensi industri "${extensionCode}" belum diaktifkan untuk company ini. Aktifkan melalui PUT /api/v1/inventory/extensions/${extensionCode}.`,
    );
  }
}

