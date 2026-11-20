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

function hasInventoryProfile(user: { module_assignments?: any[] } | undefined): boolean {
  return Boolean(user?.module_assignments?.some((assignment) =>
    String(assignment.module_code || '').toUpperCase() === 'INVENTORY'
    && String(assignment.status || '').toUpperCase() === 'ACTIVE'
    && Boolean(assignment.profile_id && assignment.profile_active),
  ));
}

function hasGlobalWarehouseOversight(user: { roles?: string[]; active_role_code?: string | null; module_assignments?: any[] } | undefined): boolean {
  if (!user) return false;
  if (hasInventoryProfile(user)) return false;
  const roles = user.roles || [];
  if (isSuperAdmin(roles) || isCompanyAdmin(roles)) return true;
  const active = user.active_role_code ? parseRoleCode(user.active_role_code) : null;
  return active === RoleCode.DIRECTOR || active === RoleCode.COMPANY_ADMIN;
}

export async function getAllowedWarehouseIds(
  companyId: string,
  user: { id: string; roles?: string[]; active_role_code?: string | null; module_assignments?: any[] } | undefined,
): Promise<string[] | null> {
  if (!user?.id || hasGlobalWarehouseOversight(user)) return null; // null = unrestricted across company
  const scopes: any[] = await (prisma as any).inv_warehouse_user_scope
    ?.findMany?.({
      where: { company_id: companyId, user_id: user.id, is_active: true, can_read: true },
      select: { warehouse_id: true },
    })
    .catch(() => []) ?? [];
  if (!scopes.length) {
    const inventoryAssignments = user.module_assignments?.filter((assignment) =>
      String(assignment.module_code || '').toUpperCase() === 'INVENTORY'
      && Boolean(assignment.profile_id && assignment.profile_active),
    ) ?? [];
    const profileScopes = inventoryAssignments.flatMap((assignment) => Array.isArray(assignment.scope_resource_ids) ? assignment.scope_resource_ids.map(String) : []);
    if (inventoryAssignments.some((assignment) => String(assignment.data_scope || '').toUpperCase() === 'ALL')) return null;
    return profileScopes.length ? [...new Set(profileScopes)] : inventoryAssignments.length ? [] : null;
  }
  return scopes.map((s) => String(s.warehouse_id));
}

export async function assertWarehouseScopeAccess(input: {
  companyId: string;
  user?: { id: string; roles?: string[]; active_role_code?: string | null; module_assignments?: any[] };
  warehouseId?: string | null;
  action: WarehouseScopeAction;
}): Promise<void> {
  if (!input.user?.id || !input.warehouseId || hasGlobalWarehouseOversight(input.user)) {
    return;
  }
  const profileAssignments = input.user.module_assignments?.filter((assignment) =>
    String(assignment.module_code || '').toUpperCase() === 'INVENTORY'
    && Boolean(assignment.profile_id && assignment.profile_active),
  ) ?? [];
  if (profileAssignments.length) {
    const profileScopes = profileAssignments.flatMap((assignment) => Array.isArray(assignment.scope_resource_ids) ? assignment.scope_resource_ids.map(String) : []);
    const allWarehouses = profileAssignments.some((assignment) => String(assignment.data_scope || '').toUpperCase() === 'ALL');
    if (!allWarehouses && !profileScopes.includes(String(input.warehouseId))) {
      throw new ForbiddenError('Role profile Inventory tidak memiliki scope ke gudang ini.');
    }
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

