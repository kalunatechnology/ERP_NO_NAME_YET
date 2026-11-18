/**
 * File: backend-express/src/modules/inventory/extensions/project-site.service.ts
 *
 * Purpose: Phase 3 Extension — Project Site Warehouse (W6).
 * - Creates/resolves a dedicated Site Warehouse location per project_project
 * - Transfers materials from Main Warehouse -> Project Site (TRANSFER)
 * - Consumes materials at Site -> VIRT-PROJECT_CONSUMPTION (ISSUE)
 * - Returns excess materials from Project Site -> Main Warehouse (TRANSFER)
 */
import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../../../config/database';
import { NotFoundError, ValidationError } from '../../../utils/errors';
import { postStockMove } from '../stock-posting.service';
import { assertExtensionEnabled } from './extension-registry.service';

export async function ensureProjectSiteLocation(
  tx: Prisma.TransactionClient | any,
  input: { companyId: string; tenantId?: string | null; projectId: string },
) {
  const project = await tx.project_project.findFirst({
    where: { id: input.projectId, company_id: input.companyId },
  });
  if (!project) throw new NotFoundError('Project');

  const siteCode = `SITE-${String(project.project_code || project.id.slice(0, 8)).toUpperCase()}`;
  const existing = await tx.master_warehouse_location.findFirst({
    where: { company_id: input.companyId, location_code: siteCode },
  });
  if (existing) return existing;

  return tx.master_warehouse_location.create({
    data: {
      id: crypto.randomUUID(),
      tenant_id: input.tenantId ?? project.tenant_id ?? null,
      company_id: input.companyId,
      warehouse_id: null,
      parent_id: null,
      location_code: siteCode,
      location_name: `Site Proyek: ${project.project_name || project.project_code}`,
      location_type: 'PROJECT_SITE',
      location_purpose: 'STORAGE',
      is_virtual: false,
      is_allocatable: true,
      allow_negative_stock: false,
      quality_hold: false,
      active: true,
    },
  });
}

export interface SiteMaterialLine {
  product_id: string;
  variant_id?: string | null;
  lot_id?: string | null;
  serial_number_id?: string | null;
  quantity: number | string;
  uom_id?: string | null;
}

export async function transferToProjectSite(input: {
  companyId: string;
  tenantId?: string | null;
  userId: string;
  projectId: string;
  sourceLocationId: string;
  lines: SiteMaterialLine[];
}) {
  if (!input.lines.length) throw new ValidationError('Minimal 1 baris material wajib diisi.');
  return prisma.$transaction(
    async (tx: any) => {
      await assertExtensionEnabled(input.companyId, 'PROJECT_SITE', tx);
      const siteLoc = await ensureProjectSiteLocation(tx, {
        companyId: input.companyId,
        tenantId: input.tenantId,
        projectId: input.projectId,
      });
      const move = await tx.inv_stock_move.create({
        data: {
          id: crypto.randomUUID(),
          tenant_id: input.tenantId ?? null,
          company_id: input.companyId,
          created_by_id: input.userId,
          move_type: 'TRANSFER',
          source_location_id: input.sourceLocationId,
          destination_location_id: siteLoc.id,
          project_id: input.projectId,
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
        idempotencyKeyPrefix: `SITE_IN_${move.id}`,
      });
      return { site_location: siteLoc, stock_move: posted };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function consumeOrReturnProjectSiteMaterial(input: {
  companyId: string;
  tenantId?: string | null;
  userId: string;
  projectId: string;
  mode: 'CONSUME' | 'RETURN_EXCESS';
  destinationLocationId?: string | null;
  lines: SiteMaterialLine[];
}) {
  if (!input.lines.length) throw new ValidationError('Minimal 1 baris material wajib diisi.');
  if (input.mode === 'RETURN_EXCESS' && !input.destinationLocationId) {
    throw new ValidationError('Lokasi gudang tujuan pengembalian excess material wajib diisi.');
  }
  return prisma.$transaction(
    async (tx: any) => {
      await assertExtensionEnabled(input.companyId, 'PROJECT_SITE', tx);
      const siteLoc = await ensureProjectSiteLocation(tx, {
        companyId: input.companyId,
        tenantId: input.tenantId,
        projectId: input.projectId,
      });
      const move = await tx.inv_stock_move.create({
        data: {
          id: crypto.randomUUID(),
          tenant_id: input.tenantId ?? null,
          company_id: input.companyId,
          created_by_id: input.userId,
          move_type: input.mode === 'CONSUME' ? 'ISSUE' : 'TRANSFER',
          source_location_id: siteLoc.id,
          destination_location_id: input.mode === 'RETURN_EXCESS' ? input.destinationLocationId! : null,
          project_id: input.projectId,
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
        counterpartKind: input.mode === 'CONSUME' ? 'PROJECT_CONSUMPTION' : undefined,
        idempotencyKeyPrefix: `SITE_${input.mode}_${move.id}`,
      });
      return { site_location: siteLoc, stock_move: posted };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

