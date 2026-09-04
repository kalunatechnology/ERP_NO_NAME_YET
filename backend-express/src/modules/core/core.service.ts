/**
 * File: backend-express/src/modules/core/core.service.ts
 *
 * Purpose: Implements domain service responsibilities for the core domain.
 * Responsibility: Defines the executable contracts in this file and connects them to their callers without owning unrelated domain behavior.
 * Integration: Used through static imports, Express/Next framework discovery, or an explicit npm/script entry point as applicable.
 * Dependencies and side effects: See each documented function; database, browser storage, network, and response mutations are called out where present.
 */
import prisma from '../../config/database';
import { ValidationError } from '../../utils/errors';
import { toExternalRoleCode } from '../../types/roles';

export class CoreService {
/**
 * getSidebarFeed implements a named method within this file's domain service boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: Reads or mutates Prisma model(s) `core_app_notification`, `core_activity_feed`, `iam_user`; transaction boundaries are exactly those visible in the body.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
  static async getSidebarFeed(userId: string, companyId: string | null) {
    const notifications = await prisma.core_app_notification.findMany({
      where: {
        recipient_id: userId,
        ...(companyId ? { company_id: companyId } : {}),
      },
      orderBy: { created_at: 'desc' },
      take: 10,
    });

    // A company-less super admin session has no single tenant context. Returning
    // an empty company stream prevents accidental aggregation across companies.
    const memberships = companyId
      ? await prisma.iam_user_company_membership.findMany({
          where: { company_id: companyId, status: 'ACTIVE' },
          select: { user_id: true },
        })
      : [];
    const companyUserIds = memberships.map((membership) => membership.user_id);

    const [activities, contactUsers] = companyId
      ? await Promise.all([
          prisma.core_activity_feed.findMany({
            where: { company_id: companyId },
            orderBy: { created_at: 'desc' },
            take: 15,
          }),
          prisma.iam_user.findMany({
            where: {
              id: { in: companyUserIds.filter((id) => id !== userId) },
              is_active: true,
            },
            select: {
              id: true,
              email: true,
              full_name: true,
              username: true,
              status: true,
              is_active: true,
              active_role_id: true,
            },
            // A stable human-readable order prevents team members from being
            // arbitrarily hidden behind UUID ordering in the sidebar.
            orderBy: { full_name: 'asc' },
            take: 20,
          }),
        ])
      : [[], []];

    const contactIds = contactUsers.map((contact) => contact.id);
    const roleAssignments = companyId && contactIds.length > 0
      ? await prisma.iam_user_role.findMany({
          where: { company_id: companyId, user_id: { in: contactIds } },
          select: { user_id: true, role_id: true },
        })
      : [];
    const roleIds = Array.from(new Set(roleAssignments.map((assignment) => assignment.role_id).filter((id): id is string => Boolean(id))));
    const roles = roleIds.length > 0
      ? await prisma.iam_role.findMany({
          where: { id: { in: roleIds } },
          select: { id: true, role_code: true, role_name: true },
        })
      : [];
    const roleMap = new Map(roles.map((role) => [role.id, role]));
    const assignmentsByUser = new Map<string, string[]>();
    for (const assignment of roleAssignments) {
      if (!assignment.user_id || !assignment.role_id) continue;
      const current = assignmentsByUser.get(assignment.user_id) ?? [];
      current.push(assignment.role_id);
      assignmentsByUser.set(assignment.user_id, current);
    }
    const contacts = contactUsers.map((contact) => {
      const assignedRoleIds = assignmentsByUser.get(contact.id) ?? [];
      const selectedRoleId = contact.active_role_id && assignedRoleIds.includes(contact.active_role_id)
        ? contact.active_role_id
        : assignedRoleIds[0];
      const selectedRole = selectedRoleId ? roleMap.get(selectedRoleId) : undefined;
      return {
        id: contact.id,
        email: contact.email,
        full_name: contact.full_name,
        username: contact.username,
        status: contact.status,
        is_active: contact.is_active,
        role_code: selectedRole ? toExternalRoleCode(selectedRole.role_code) : null,
        role_name: selectedRole?.role_name ?? null,
      };
    });

    const actorIds = [
      ...notifications.map((n) => n.actor_id).filter((id): id is string => Boolean(id)),
      ...activities.map((a) => a.actor_id).filter((id): id is string => Boolean(id)),
    ];

    const allowedActorIds = companyId
      ? actorIds.filter((id) => companyUserIds.includes(id))
      : actorIds.filter((id) => id === userId);
    const actors = await prisma.iam_user.findMany({
      where: { id: { in: allowedActorIds } },
      select: { id: true, full_name: true, username: true, email: true },
    });
    const actorMap = new Map(actors.map((a) => [a.id, a]));

    const serializedNotifications = notifications.map((n) => ({
      ...n,
      actor: n.actor_id ? actorMap.get(n.actor_id) ?? null : null,
    }));

    const serializedActivities = activities.map((a) => ({
      ...a,
      actor: a.actor_id ? actorMap.get(a.actor_id) ?? null : null,
    }));

    return {
      notifications: serializedNotifications,
      activities: serializedActivities,
      contacts,
    };
  }

/**
 * markNotificationsRead implements a named method within this file's domain service boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: Reads or mutates Prisma model(s) `core_app_notification`; transaction boundaries are exactly those visible in the body.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
  static async markNotificationsRead(userId: string) {
    await prisma.core_app_notification.updateMany({
      where: { recipient_id: userId, is_read: false },
      data: { is_read: true },
    });
    return { status: 'all notifications marked as read' };
  }

/**
 * getRecentItems implements a named method within this file's domain service boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: Reads or mutates Prisma model(s) `core_user_recent_item`; transaction boundaries are exactly those visible in the body.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
  static async getRecentItems(userId: string) {
    return prisma.core_user_recent_item.findMany({
      where: { user_id: userId },
      orderBy: { last_accessed_at: 'desc' },
      take: 10,
    });
  }

/**
 * trackRecentItem implements this operation using the typed arguments declared in its signature.
 *
 * @param input - Parameters declared by the function/method.
 * @returns The synchronous result or Promise produced below.
 * Database/side effects: uses `core_user_recent_item`, `iam_company_module_access`; transaction scope is exactly the coded scope.
 */
  static async trackRecentItem(
    userId: string,
    data: { item_type: string; object_id: string; title: string; target_url: string },
  ) {
    const existing = await prisma.core_user_recent_item.findFirst({
      where: { user_id: userId, object_id: data.object_id },
    });

    if (existing) {
      return prisma.core_user_recent_item.update({
        where: { id: existing.id },
        data: {
          item_type: data.item_type,
          title: data.title,
          target_url: data.target_url,
          last_accessed_at: new Date(),
          updated_at: new Date(),
        },
      });
    }

    return prisma.core_user_recent_item.create({
      data: {
        id: crypto.randomUUID(),
        user_id: userId,
        item_type: data.item_type,
        object_id: data.object_id,
        title: data.title,
        target_url: data.target_url,
        last_accessed_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      },
    });
  }

  static readonly ALL_MODULE_CODES = [
    'CORE',
    'REQUESTS',
    'CRM',
    'SALES',
    'PROJECTS',
    'FINANCE',
    'PROCUREMENT',
    'INVENTORY',
    'MANUFACTURING',
    'QUALITY',
    'ASSETS',
    'SERVICE',
    'LOGISTICS',
    'ANALYTICS',
    'IMPLEMENTATION',
    'REPORTING',
  ];

/**
 * getCompanyModules implements a named method within this file's domain service boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: Reads or mutates Prisma model(s) `iam_company_module_access`, `core_company`; transaction boundaries are exactly those visible in the body.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
  static async getCompanyModules(companyId: string) {
    const records = await prisma.iam_company_module_access.findMany({
      where: { company_id: companyId },
    });
    const recordMap = new Map(records.map((r) => [r.module_code.toUpperCase(), r]));

    return this.ALL_MODULE_CODES.map((code) => {
      const existing = recordMap.get(code);
      return {
        module_code: code,
        company_id: companyId,
        enabled: existing?.enabled ?? false,
        allow_read: existing?.allow_read ?? false,
        allow_write: existing?.allow_write ?? false,
        source: existing?.source ?? 'MANUAL',
        effective_from: existing?.effective_from ?? null,
        effective_until: existing?.effective_until ?? null,
        updated_at: existing?.updated_at ?? null,
      };
    });
  }

/**
 * setCompanyModuleAccess implements this operation using the typed arguments declared in its signature.
 *
 * @param input - Parameters declared by the function/method.
 * @returns The synchronous result or Promise produced below.
 * Database/side effects: uses `core_company`, `iam_company_module_access`; transaction scope is exactly the coded scope.
 */
  static async setCompanyModuleAccess(
    companyId: string,
    moduleCode: string,
    data: {
      enabled?: boolean;
      allow_read?: boolean;
      allow_write?: boolean;
      tenantId?: string;
      enabledById?: string;
    },
  ) {
    const cleanCode = moduleCode.trim().toUpperCase();
    if (!this.ALL_MODULE_CODES.includes(cleanCode)) {
      throw new ValidationError(`Module ${cleanCode} tidak terdaftar dalam katalog sistem.`);
    }
    const company = await prisma.core_company.findUnique({
      where: { id: companyId },
      select: { id: true, tenant_id: true },
    });
    if (!company) {
      throw new Error('Company tidak ditemukan.');
    }

    const tenantId = company.tenant_id;
    if (!tenantId) throw new ValidationError('Company tidak memiliki tenant yang valid.');

    const enabled = data.enabled ?? false;
    const allowRead = data.allow_read ?? (enabled ? true : false);
    const allowWrite = data.allow_write ?? (enabled ? true : false);

    return prisma.iam_company_module_access.upsert({
      where: {
        company_id_module_code: {
          company_id: companyId,
          module_code: cleanCode,
        },
      },
      update: {
        enabled,
        allow_read: allowRead,
        allow_write: allowWrite,
        ...(data.enabledById ? { enabled_by_id: data.enabledById } : {}),
      },
      create: {
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        company_id: companyId,
        module_code: cleanCode,
        enabled,
        allow_read: allowRead,
        allow_write: allowWrite,
        enabled_by_id: data.enabledById ?? null,
      },
    });
  }
}
