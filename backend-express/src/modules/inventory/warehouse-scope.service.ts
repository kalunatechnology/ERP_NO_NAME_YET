/**
 * File: backend-express/src/modules/inventory/warehouse-scope.service.ts
 *
 * Purpose: Universal Inventory Phase 2 — Attribute-Based Access Control (ABAC)
 * per warehouse (`inv_warehouse_user_scope`).
 *
 * If a user has explicit warehouse scope records in a company, their read/write/
 * approve operations are restricted to those assigned warehouses unless they
 * hold executive/admin oversight roles (SUPER_ADMIN, COMPANY_ADMIN, DIRECTOR).
 */
import prisma from '../../config/database';
import { ForbiddenError } from '../../utils/errors';
import { isCompanyAdmin, isSuperAdmin, parseRoleCode, RoleCode } from '../../types/roles';

export type WarehouseScopeAction = 'read' | 'write' | 'approve';

function hasGlobalWarehouseOversight(user: { roles?: string[]; active_role_code?: string | null } | undefined): boolean {
  if (!user) return false;
  const roles = user.roles || [];
  if (isSuperAdmin(roles) || isCompanyAdmin(roles)) return true;
  const active = user.active_role_code ? parseRoleCode(user.active_role_code) : null;
  return active === RoleCode.DIRECTOR || active === RoleCode.COMPANY_ADMIN;
}

export async function getAllowedWarehouseIds(
  companyId: string,
  user: { id: string; roles?: string[]; active_role_code?: string | null } | undefined,
): Promise<string[] | null> {
  if (!user?.id || hasGlobalWarehouseOversight(user)) return null; // null = unrestricted across company
  const scopes: any[] = await (prisma as any).inv_warehouse_user_scope
    ?.findMany?.({
      where: { company_id: companyId, user_id: user.id, is_active: true, can_read: true },
      select: { warehouse_id: true },
    })
    .catch(() => []) ?? [];
  if (!scopes.length) return null; // no explicit restriction configured for this user
  return scopes.map((s) => String(s.warehouse_id));
}

export async function assertWarehouseScopeAccess(input: {
  companyId: string;
  user?: { id: string; roles?: string[]; active_role_code?: string | null };
  warehouseId?: string | null;
  action: WarehouseScopeAction;
}): Promise<void> {
  if (!input.user?.id || !input.warehouseId || hasGlobalWarehouseOversight(input.user)) {
    return;
  }
  const allUserScopes: any[] = await (prisma as any).inv_warehouse_user_scope
    ?.findMany?.({
      where: { company_id: input.companyId, user_id: input.user.id, is_active: true },
    })
    .catch(() => []) ?? [];

  if (!allUserScopes.length) return; // user is not restricted to specific warehouses

  const match = allUserScopes.find((s) => String(s.warehouse_id) === String(input.warehouseId));
  if (!match) {
    throw new ForbiddenError('ABAC Warehouse Scope: Anda tidak memiliki akses ke gudang ini.');
  }
  if (input.action === 'read' && !match.can_read) {
    throw new ForbiddenError('ABAC Warehouse Scope: Akses baca ke gudang ini ditolak.');
  }
  if (input.action === 'write' && !match.can_write) {
    throw new ForbiddenError('ABAC Warehouse Scope: Akses tulis ke gudang ini ditolak.');
  }
  if (input.action === 'approve' && !match.can_approve) {
    throw new ForbiddenError('ABAC Warehouse Scope: Anda tidak berwenang menyetujui transaksi di gudang ini.');
  }
}
