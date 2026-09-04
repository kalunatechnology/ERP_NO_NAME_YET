/**
 * File: backend-express/src/modules/core/audit.service.ts
 *
 * Purpose: Implements domain service responsibilities for the core domain.
 * Responsibility: Defines the executable contracts in this file and connects them to their callers without owning unrelated domain behavior.
 * Integration: Used through static imports, Express/Next framework discovery, or an explicit npm/script entry point as applicable.
 * Dependencies and side effects: See each documented function; database, browser storage, network, and response mutations are called out where present.
 */
import prisma from '../../config/database';

// =============================================================================
// AUDIT SERVICE — Enterprise Delta Logger
// Menyimpan HANYA field yang berubah (before/after changed keys) ke core_audit_event.
// Strategi ini menghemat storage secara drastis vs full-snapshot dump.
// =============================================================================

interface AuditEventParams {
  entity:       string;
  entityId:     string;
  action:       string;
  before:       Record<string, unknown>;
  after:        Record<string, unknown>;
  userId:       string;
  description?: string;
  companyId?:   string;
  tenantId?:    string;
}

export class AuditService {

  // ---------------------------------------------------------------------------
  // logDeltaEvent: Hanya menyimpan field yang benar-benar berubah (changed keys)
  // ---------------------------------------------------------------------------

/**
 * logDeltaEvent implements a named method within this file's domain service boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: Reads or mutates Prisma model(s) `core_audit_event`; transaction boundaries are exactly those visible in the body.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
  static async logDeltaEvent(params: AuditEventParams): Promise<void> {
    const { entity, entityId, action, before, after, userId, description, companyId, tenantId } = params;

    // Ekstrak delta — hanya key yang nilainya berbeda antara before dan after
    const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
    const changedBefore: Record<string, unknown> = {};
    const changedAfter:  Record<string, unknown> = {};

    for (const key of allKeys) {
      const bVal = before[key];
      const aVal = after[key];
      // Bandingkan dengan JSON stringify untuk handle object/array
      if (JSON.stringify(bVal) !== JSON.stringify(aVal)) {
        changedBefore[key] = bVal;
        changedAfter[key]  = aVal;
      }
    }

    // Jika tidak ada perubahan, tidak perlu log
    if (Object.keys(changedBefore).length === 0) return;

    // Tambahkan metadata konteks
    const metadata: Record<string, unknown> = {};
    if (description) metadata['description'] = description;

    try {
      await prisma.core_audit_event.create({
        data: {
          id:          crypto.randomUUID(),
          entity_name: entity,
          entity_id:   entityId,
          event_type:  action,
          before_data: { ...changedBefore, _description: description ?? null } as any,
          after_data:  { ...changedAfter,  _description: description ?? null } as any,
          user_id:     userId,
          company_id:  companyId ?? null,
          tenant_id:   tenantId  ?? null,
          occurred_at: new Date(),
        },
      });
    } catch {
      // Audit log tidak boleh memblokir operasi utama — silent fail & log ke console
      console.warn(`[AuditService] Failed to write audit log for ${entity}#${entityId} action=${action}`);
    }
  }

  // ---------------------------------------------------------------------------
  // getAuditTrail: Ambil riwayat audit untuk satu entity dengan filter
  // ---------------------------------------------------------------------------

/**
 * getAuditTrail implements this operation using the typed arguments declared in its signature.
 *
 * @param input - Parameters declared by the function/method.
 * @returns The synchronous result or Promise produced below.
 * Database/side effects: uses `core_audit_event`; transaction scope is exactly the coded scope.
 */
  static async getAuditTrail(params: {
    entity?:     string;
    entityId?:   string;
    userId?:     string;
    action?:     string;
    fromDate?:   Date;
    toDate?:     Date;
    companyId?:  string;
    page?:       number;
    pageSize?:   number;
  }) {
    const { entity, entityId, userId, action, fromDate, toDate, companyId, page = 1, pageSize = 50 } = params;

    const where: Record<string, unknown> = {};
    if (entity)    where['entity_name'] = entity;
    if (entityId)  where['entity_id']   = entityId;
    if (userId)    where['user_id']     = userId;
    if (action)    where['event_type']  = action;
    if (companyId) where['company_id']  = companyId;
    if (fromDate || toDate) {
      where['occurred_at'] = {
        ...(fromDate ? { gte: fromDate } : {}),
        ...(toDate   ? { lte: toDate   } : {}),
      };
    }

    const [total, rows] = await Promise.all([
      prisma.core_audit_event.count({ where: where as any }),
      prisma.core_audit_event.findMany({
        where:   where as any,
        orderBy: { occurred_at: 'desc' },
        skip:    (page - 1) * pageSize,
        take:    pageSize,
      }),
    ]);

    return {
      total,
      page,
      page_size:   pageSize,
      total_pages: Math.ceil(total / pageSize),
      rows,
    };
  }
}
