/**
 * File: backend-express/src/modules/core/request.service.ts
 *
 * Purpose: Implements domain service responsibilities for the core domain.
 * Responsibility: Defines the executable contracts in this file and connects them to their callers without owning unrelated domain behavior.
 * Integration: Used through static imports, Express/Next framework discovery, or an explicit npm/script entry point as applicable.
 * Dependencies and side effects: See each documented function; database, browser storage, network, and response mutations are called out where present.
 */
import crypto from 'crypto';
import prisma from '../../config/database';
import { ValidationError, NotFoundError, ForbiddenError } from '../../utils/errors';
import { AuditService } from './audit.service';
import { RoleCode } from '../../types/roles';
import { Prisma } from '@prisma/client';
import { postRequestDisbursement } from '../finance/request-disbursement.service';

export interface TaggedUser {
  id: string;
  name: string;
  avatar_url?: string;
  email?: string;
  role?: string;
}

export interface LPJInvoiceItem {
  invoice_number?: string;
  amount?: number;
  file_url: string;
  description?: string;
}

export interface CreateRequestPayload {
  request_type: 'MEETING' | 'LEAVE' | 'OTHER' | 'FUND_REQUEST';
  title: string;
  description?: string;
  amount?: number;
  budget_category?: string;
  bank_target?: string;
  project_id?: string;

  /**
   * User yang ditugaskan menangani request.
   * Null / undefined berarti request belum di-assign.
   */
  assignee_user_id?: string;

  start_at?: string | Date;
  end_at?: string | Date;
  tagged_users?: TaggedUser[];
  attachment_url?: string;
  is_draft?: boolean;
}

export class RequestService {

  // ---------------------------------------------------------------------------
  // 1. CREATE REQUEST CARD
  // ---------------------------------------------------------------------------

/**
 * createRequest implements a named method within this file's domain service boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: Reads or mutates Prisma model(s) `core_workflow_instance`; transaction boundaries are exactly those visible in the body.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
static async createRequest(
  payload: CreateRequestPayload,
  userId: string,
  companyId: string,
  tenantId?: string | null,
) {
  const {
    request_type,
    title,
    description,
    amount,
    budget_category,
    bank_target,
    project_id,
    assignee_user_id,
    start_at,
    end_at,
    tagged_users = [],
    attachment_url,
    is_draft,
  } = payload;

  if (!title || title.trim().length === 0) {
    throw new ValidationError('Judul/Topik request wajib diisi.');
  }

  if (
    request_type === 'FUND_REQUEST' &&
    (!amount || Number(amount) <= 0)
  ) {
    throw new ValidationError(
      'Nominal dana (amount) wajib diisi lebih dari 0 untuk Fund Request.',
    );
  }

  /**
   * Kalau request langsung di-assign saat dibuat,
   * pastikan user tersebut:
   *
   * - aktif
   * - memang anggota company yang sama
   */
  if (assignee_user_id) {
    const [assignee, membership] = await Promise.all([
      prisma.iam_user.findFirst({
        where: {
          id: assignee_user_id,
          is_active: true,
        },
        select: {
          id: true,
          full_name: true,
        },
      }),

      prisma.iam_user_role.findFirst({
        where: {
          user_id: assignee_user_id,
          company_id: companyId,
        },
        select: {
          id: true,
        },
      }),
    ]);

    if (!assignee || !membership) {
      throw new ValidationError(
        'User assignee tidak ditemukan atau bukan anggota company aktif.',
      );
    }
  }

  const requestNumber = `REQ-${Date.now()
    .toString()
    .slice(-6)}`;

  const initialStatus = is_draft
    ? 'DRAFT'
    : 'PENDING_OM';

  /**
   * Workflow instance tetap menjadi status backplane.
   */
  const instanceId = crypto.randomUUID();

  await prisma.core_workflow_instance.create({
    data: {
      id: instanceId,
      tenant_id: tenantId ?? null,
      company_id: companyId,
      created_by_id: userId,

      workflow_code: `INTERNAL_${request_type}`,
      current_state: initialStatus,

      status: is_draft
        ? 'DRAFT'
        : 'IN_PROGRESS',

      started_at: new Date(),
    },
  });

  /**
   * Persistent request payload.
   */
  const requestData = {
    id: instanceId,

    request_number: requestNumber,

    request_type,

    title,

    description: description ?? '',

    amount:
      amount !== undefined &&
      amount !== null
        ? Number(amount)
        : null,

    budget_category:
      budget_category ??
      (
        request_type === 'FUND_REQUEST'
          ? 'OPERATIONAL'
          : null
      ),

    bank_target:
      bank_target ?? null,

    project_id:
      project_id ?? null,

    /**
     * NEW
     */
    assignee_user_id:
      assignee_user_id ?? null,

    start_at:
      start_at
        ? new Date(start_at).toISOString()
        : null,

    end_at:
      end_at
        ? new Date(end_at).toISOString()
        : null,

    tagged_users,

    attachment_url:
      attachment_url ?? null,

    status:
      initialStatus,

    created_by_id:
      userId,

    company_id:
      companyId ?? null,

    created_at:
      new Date().toISOString(),

    updated_at:
      new Date().toISOString(),

    om_review: null,
    exec_review: null,
    disbursement: null,
    lpj: null,
  };

  /**
   * CREATE_REQUEST tetap menjadi base snapshot request.
   */
  await AuditService.logDeltaEvent({
    entity: 'core_internal_request',
    entityId: instanceId,
    action: 'CREATE_REQUEST',

    before: {},

    after:
      requestData as any,

    userId,

    description:
      `Permohonan baru ${request_type}: ${title} (${requestNumber})${
        amount
          ? ` sebesar Rp ${Number(amount).toLocaleString('id-ID')}`
          : ''
      }`,

    companyId:
      companyId ?? undefined,
  });

  /**
   * Existing approval notification ke OM.
   */
  if (!is_draft) {
    await this.createNotification({
      title:
        `Permohonan ${request_type}: ${title}`,

      message:
        `Permohonan baru ${requestNumber} diajukan dan membutuhkan validasi Operations Manager.`,

      action_url:
        `/dashboard?tab=requests&id=${instanceId}`,

      notification_type:
        'APPROVAL_REQUEST',

      priority:
        'HIGH',

      recipient_role_id:
        'OPERATIONS_MANAGER',

      company_id:
        companyId ?? null,
    });

    /**
     * Kalau langsung assigned, kirim notification
     * juga ke user yang menerima assignment.
     */
    if (assignee_user_id) {
      await this.createNotification({
        title:
          'Request Baru Ditugaskan kepada Anda',

        message:
          `${requestNumber} — ${title}`,

        action_url:
          `/dashboard?tab=requests&id=${instanceId}`,

        notification_type:
          'REQUEST_ASSIGNED',

        priority:
          'MEDIUM',

        recipient_user_id:
          assignee_user_id,

        company_id:
          companyId,
      });
    }
  }

  return requestData;
}

  // ---------------------------------------------------------------------------
  // 2. LEVEL 1: VALIDATION THROUGH OM
  // ---------------------------------------------------------------------------

/**
 * validateByOM implements this operation using the typed arguments declared in its signature.
 *
 * @param input - Parameters declared by the function/method.
 * @returns The synchronous result or Promise produced below.
 * Database/side effects: uses `core_workflow_instance`; transaction scope is exactly the coded scope.
 */
  static async validateByOM(params: {
    requestId: string;
    decision:  'APPROVE' | 'RE_CHECK';
    remarks?:  string;
    omUserId:  string;
    companyId: string;
  }) {
    const { requestId, decision, remarks = '', omUserId, companyId } = params;

    const instance = await prisma.core_workflow_instance.findFirst({ where: { id: requestId, company_id: companyId } });
    if (!instance) throw new NotFoundError('Request');

    if (instance.current_state !== 'PENDING_OM' && instance.current_state !== 'RE_CHECKING') {
      throw new ValidationError(`Request tidak dalam status validasi OM (Status saat ini: ${instance.current_state}).`);
    }

    const nextState = decision === 'APPROVE' ? 'PENDING_EXEC' : 'RE_CHECKING';

    await prisma.$transaction(async (tx) => {
      await tx.core_workflow_instance.update({
        where: { id: requestId },
        data:  { current_state: nextState },
      });

      await tx.core_workflow_approval.create({
        data: {
          id:                   crypto.randomUUID(),
          tenant_id:            instance.tenant_id,
          company_id:           companyId,
          created_by_id:        omUserId,
          workflow_instance_id: requestId,
          approver_user_id:     omUserId,
          approval_level:       'OM',
          decision:             decision === 'APPROVE' ? 'APPROVED' : 'RE_CHECK',
          remarks:              remarks,
          decided_at:           new Date(),
        },
      });
    });

    await AuditService.logDeltaEvent({
      entity:      'core_internal_request',
      entityId:    requestId,
      action:      `OM_${decision}`,
      before:      { status: instance.current_state },
      after:       { status: nextState, om_remarks: remarks, om_user_id: omUserId },
      userId:      omUserId,
      companyId,
      description: `OM ${decision === 'APPROVE' ? 'menyetujui & meneruskan ke Executive' : 'meminta Re-checking'}: ${remarks}`,
    });

    // Notifikasi
    if (decision === 'APPROVE') {
      await this.createNotification({
        title:              `Persetujuan Eksekutif Diperlukan`,
        message:            `Permohonan #${requestId.slice(0, 8)} telah divalidasi OM dan menunggu approval Executive/PM.`,
        action_url:         `/dashboard?tab=requests&id=${requestId}`,
        notification_type:  'EXECUTIVE_APPROVAL',
        priority:           'HIGH',
        recipient_role_id:  'PROJECT_MANAGER',
        company_id:         companyId,
      });
    } else {
      await this.createNotification({
        title:              `Permohonan Membutuhkan Perbaikan (Re-checking)`,
        message:            `OM meminta perbaikan: "${remarks}". Silakan perbarui dan kirim ulang.`,
        action_url:         `/dashboard?tab=requests&id=${requestId}`,
        notification_type:  'REVISION_REQUESTED',
        priority:           'MEDIUM',
        company_id:         companyId,
      });
    }

    return {
      id:            requestId,
      status:        nextState,
      decision,
      remarks,
      validated_by:  omUserId,
      validated_at:  new Date(),
    };
  }

  // ---------------------------------------------------------------------------
  // 3. LEVEL 2: EXECUTIVE / PM APPROVAL
  // ---------------------------------------------------------------------------

/**
 * approveByExecutive implements this operation using the typed arguments declared in its signature.
 *
 * @param input - Parameters declared by the function/method.
 * @returns The synchronous result or Promise produced below.
 * Database/side effects: uses `core_workflow_instance`; transaction scope is exactly the coded scope.
 */
  static async approveByExecutive(params: {
    requestId:  string;
    decision:   'APPROVE' | 'REJECT';
    remarks?:   string;
    execUserId: string;
    companyId:  string;
  }) {
    const { requestId, decision, remarks = '', execUserId, companyId } = params;

    const instance = await prisma.core_workflow_instance.findFirst({ where: { id: requestId, company_id: companyId } });
    if (!instance) throw new NotFoundError('Request');

    if (instance.current_state !== 'PENDING_EXEC') {
      throw new ValidationError(`Request belum divalidasi oleh OM (Status saat ini: ${instance.current_state}).`);
    }

    const nextState = decision === 'APPROVE' ? 'REGISTERED' : 'REJECTED';

    await prisma.$transaction(async (tx) => {
      await tx.core_workflow_instance.update({
        where: { id: requestId },
        data: {
          current_state: nextState,
          status:        decision === 'APPROVE' ? 'COMPLETED' : 'REJECTED',
          completed_at:  decision === 'APPROVE' ? new Date() : null,
        },
      });

      await tx.core_workflow_approval.create({
        data: {
          id:                   crypto.randomUUID(),
          tenant_id:            instance.tenant_id,
          company_id:           companyId,
          created_by_id:        execUserId,
          workflow_instance_id: requestId,
          approver_user_id:     execUserId,
          approval_level:       'EXECUTIVE_PM',
          decision:             decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
          remarks:              remarks,
          decided_at:           new Date(),
        },
      });
    });

    await AuditService.logDeltaEvent({
      entity:      'core_internal_request',
      entityId:    requestId,
      action:      `EXEC_${decision}`,
      before:      { status: 'PENDING_EXEC' },
      after:       { status: nextState, exec_remarks: remarks, exec_user_id: execUserId },
      userId:      execUserId,
      companyId,
      description: `Executive/PM ${decision === 'APPROVE' ? 'menyetujui resmi (TICKET REGISTERED)' : 'menolak'}: ${remarks}`,
    });

    // Notifikasi hasil akhir
    await this.createNotification({
      title:              decision === 'APPROVE' ? `🎉 Tiket Resmi Terdaftar!` : `Tiket Ditolak oleh Executive`,
      message:            decision === 'APPROVE'
        ? `Permohonan telah disetujui penuh oleh Executive & OM. Jadwal/Dana telah terdaftar resmi.`
        : `Permohonan ditolak oleh Executive: ${remarks}`,
      action_url:         `/dashboard?tab=requests&id=${requestId}`,
      notification_type:  'FINAL_STATUS',
      priority:           decision === 'APPROVE' ? 'MEDIUM' : 'HIGH',
      company_id:         companyId,
    });

    return {
      id:            requestId,
      status:        nextState,
      decision,
      remarks,
      approved_by:   execUserId,
      approved_at:   new Date(),
    };
  }

  // ---------------------------------------------------------------------------
  // 4. PENCAIRAN DANA (DISBURSEMENT) - FINANCE
  // ---------------------------------------------------------------------------

/**
 * disburseRequest implements this operation using the typed arguments declared in its signature.
 *
 * @param input - Parameters declared by the function/method.
 * @returns The synchronous result or Promise produced below.
 * Database/side effects: uses `core_workflow_instance`; transaction scope is exactly the coded scope.
 */
  static async disburseRequest(params: {
    requestId:         string;
    disburseAccountId?: string;
    disburseReference?: string;
    disburseUserId:    string;
    companyId:          string;
  }) {
    const { requestId, disburseAccountId, disburseReference, disburseUserId, companyId } = params;

    return postRequestDisbursement(requestId, disburseAccountId ?? '', disburseReference ?? '', disburseUserId, companyId);
  }

  // ---------------------------------------------------------------------------
  // 5. SUBMIT LPJ & NOTA BUKTI (SETTLEMENT) - PEMOHON
  // ---------------------------------------------------------------------------

/**
 * submitLPJ implements this operation using the typed arguments declared in its signature.
 *
 * @param input - Parameters declared by the function/method.
 * @returns The synchronous result or Promise produced below.
 * Database/side effects: uses `core_workflow_instance`; transaction scope is exactly the coded scope.
 */
  static async submitLPJ(params: {
    requestId:         string;
    realizationAmount: number;
    discrepancyAmount?: number;
    discrepancyType?:  string;
    notes?:            string;
    invoices?:         LPJInvoiceItem[];
    requesterUserId:   string;
    companyId:          string;
  }) {
    const { requestId, realizationAmount, discrepancyAmount = 0, discrepancyType = 'NONE', notes = '', invoices = [], requesterUserId, companyId } = params;

    const instance = await prisma.core_workflow_instance.findFirst({ where: { id: requestId, company_id: companyId } });
    if (!instance) throw new NotFoundError('Request');

    if (instance.created_by_id !== requesterUserId) {
      throw new ForbiddenError('LPJ hanya dapat dikirim oleh pembuat request.');
    }

    if (instance.current_state !== 'REGISTERED' && instance.current_state !== 'DISBURSED' && instance.current_state !== 'LPJ_REVISION') {
      throw new ValidationError(`Request belum siap untuk pelaporan LPJ (Status saat ini: ${instance.current_state}).`);
    }

    const lpjData = {
      submitted_at:        new Date().toISOString(),
      submitted_by_id:     requesterUserId,
      realization_amount:  Number(realizationAmount),
      discrepancy_amount:  Number(discrepancyAmount),
      discrepancy_type:    discrepancyType,
      notes,
      invoices,
    };

    await prisma.core_workflow_instance.update({
      where: { id: requestId },
      data:  { current_state: 'PENDING_LPJ_VERIFICATION' },
    });

    await AuditService.logDeltaEvent({
      entity:      'core_internal_request',
      entityId:    requestId,
      action:      'SUBMIT_LPJ',
      before:      { status: instance.current_state },
      after:       { status: 'PENDING_LPJ_VERIFICATION', lpj: lpjData },
      userId:      requesterUserId,
      companyId,
      description: `Pemohon mengunggah pertanggungjawaban LPJ realisasi Rp ${Number(realizationAmount).toLocaleString('id-ID')}`,
    });

    // Notifikasi ke OM untuk verifikasi nota
    await this.createNotification({
      title:              `Verifikasi LPJ Diperlukan`,
      message:            `Pemohon telah menyetor bukti nota LPJ untuk tiket #${requestId.slice(0, 8)}. Mohon verifikasi kesesuaian nota.`,
      action_url:         `/dashboard?tab=requests&id=${requestId}`,
      notification_type:  'LPJ_VERIFICATION',
      priority:           'HIGH',
      recipient_role_id:  'OPERATIONS_MANAGER',
      company_id:         companyId,
    });

    return {
      id:     requestId,
      status: 'PENDING_LPJ_VERIFICATION',
      lpj:    lpjData,
    };
  }

  // ---------------------------------------------------------------------------
  // 6. VERIFIKASI LPJ OLEH OM (TUTUP TIKET / CLOSED)
  // ---------------------------------------------------------------------------

/**
 * verifyLPJByOM implements this operation using the typed arguments declared in its signature.
 *
 * @param input - Parameters declared by the function/method.
 * @returns The synchronous result or Promise produced below.
 * Database/side effects: uses `core_workflow_instance`; transaction scope is exactly the coded scope.
 */
  static async verifyLPJByOM(params: {
    requestId: string;
    decision:  'APPROVE' | 'REVISE';
    remarks?:  string;
    omUserId:  string;
    companyId: string;
  }) {
    const { requestId, decision, remarks = '', omUserId, companyId } = params;

    const instance = await prisma.core_workflow_instance.findFirst({ where: { id: requestId, company_id: companyId } });
    if (!instance) throw new NotFoundError('Request');

    if (instance.current_state !== 'PENDING_LPJ_VERIFICATION') {
      throw new ValidationError(`LPJ belum diajukan atau tidak dalam status verifikasi OM (Status: ${instance.current_state}).`);
    }

    const nextState = decision === 'APPROVE' ? 'COMPLETED' : 'LPJ_REVISION';

    await prisma.$transaction(async (tx) => {
      await tx.core_workflow_instance.update({
        where: { id: requestId },
        data: {
          current_state: nextState,
          status:        decision === 'APPROVE' ? 'COMPLETED' : 'IN_PROGRESS',
          completed_at:  decision === 'APPROVE' ? new Date() : null,
        },
      });

      await tx.core_workflow_approval.create({
        data: {
          id:                   crypto.randomUUID(),
          tenant_id:            instance.tenant_id,
          company_id:           companyId,
          created_by_id:        omUserId,
          workflow_instance_id: requestId,
          approver_user_id:     omUserId,
          approval_level:       'OM_LPJ_VERIFICATION',
          decision:             decision === 'APPROVE' ? 'APPROVED' : 'REVISION_REQUESTED',
          remarks,
          decided_at:           new Date(),
        },
      });
    });

    await AuditService.logDeltaEvent({
      entity:      'core_internal_request',
      entityId:    requestId,
      action:      `OM_LPJ_${decision}`,
      before:      { status: 'PENDING_LPJ_VERIFICATION' },
      after:       { status: nextState, om_lpj_remarks: remarks, om_user_id: omUserId },
      userId:      omUserId,
      companyId,
      description: `OM ${decision === 'APPROVE' ? 'memverifikasi nota LPJ cocok (TIKET RESMI CLOSED)' : 'meminta revisi nota LPJ'}: ${remarks}`,
    });

    // Notifikasi hasil
    await this.createNotification({
      title:              decision === 'APPROVE' ? `✅ LPJ Terverifikasi & Tiket Selesai (Closed)` : `Nota LPJ Membutuhkan Revisi`,
      message:            decision === 'APPROVE'
        ? `OM telah memvalidasi seluruh nota belanja fisik. Tiket telah resmi diselesaikan (CLOSED).`
        : `OM meminta revisi dokumen LPJ: ${remarks}`,
      action_url:         `/dashboard?tab=requests&id=${requestId}`,
      notification_type:  'LPJ_RESULT',
      priority:           decision === 'APPROVE' ? 'LOW' : 'HIGH',
      company_id:         companyId,
    });

    return {
      id:           requestId,
      status:       nextState,
      decision,
      remarks,
      verified_by:  omUserId,
      verified_at:  new Date(),
    };
  }

  // ---------------------------------------------------------------------------
// ASSIGN / REASSIGN REQUEST
// ---------------------------------------------------------------------------

static async assignRequest(params: {
  requestId: string;
  assigneeUserId: string;
  assignedByUserId: string;
  companyId: string;
}) {
  const {
    requestId,
    assigneeUserId,
    assignedByUserId,
    companyId,
  } = params;

  /**
   * Request harus berada dalam company yang sama.
   */
  const instance =
    await prisma.core_workflow_instance.findFirst({
      where: {
        id: requestId,
        company_id: companyId,
      },

      select: {
        id: true,
        tenant_id: true,
        company_id: true,
        current_state: true,
      },
    });

  if (!instance) {
    throw new NotFoundError('Request');
  }

  /**
   * Pastikan target assignee merupakan user aktif
   * dalam company yang sama.
   */
  const [assignee, membership] =
    await Promise.all([
      prisma.iam_user.findFirst({
        where: {
          id: assigneeUserId,
          is_active: true,
        },

        select: {
          id: true,
          full_name: true,
          email: true,
        },
      }),

      prisma.iam_user_role.findFirst({
        where: {
          user_id: assigneeUserId,
          company_id: companyId,
        },

        select: {
          id: true,
        },
      }),
    ]);

  if (!assignee || !membership) {
    throw new ValidationError(
      'User assignee tidak ditemukan atau bukan anggota company aktif.',
    );
  }

  /**
   * Base CREATE_REQUEST.
   */
  const createEvent =
    await prisma.core_audit_event.findFirst({
      where: {
        entity_name: 'core_internal_request',
        entity_id: requestId,
        event_type: 'CREATE_REQUEST',
        company_id: companyId,
      },

      orderBy: [
        {
          occurred_at: 'asc',
        },
        {
          id: 'asc',
        },
      ],

      select: {
        after_data: true,
      },
    });

  /**
   * Cari assignment terakhir.
   */
  const latestAssignment =
    await prisma.core_audit_event.findFirst({
      where: {
        entity_name: 'core_internal_request',
        entity_id: requestId,
        company_id: companyId,

        event_type: {
          in: [
            'ASSIGN_REQUEST',
            'REASSIGN_REQUEST',
          ],
        },
      },

      orderBy: [
        {
          occurred_at: 'desc',
        },
        {
          id: 'desc',
        },
      ],

      select: {
        after_data: true,
      },
    });

  const createPayload =
    (createEvent?.after_data as Record<
      string,
      any
    > | null) ?? {};

  const latestPayload =
    (latestAssignment?.after_data as Record<
      string,
      any
    > | null) ?? {};

  /**
   * Assignment terakhir menang.
   * Kalau belum pernah reassign, gunakan assignment
   * dari CREATE_REQUEST.
   */
  const currentAssigneeUserId =
    latestPayload.assignee_user_id ??
    createPayload.assignee_user_id ??
    null;

  /**
   * Kalau sama dengan assignee sekarang,
   * tidak perlu membuat audit event baru.
   */
  if (
    currentAssigneeUserId ===
    assigneeUserId
  ) {
    return {
      id: requestId,

      assignee_user_id:
        assigneeUserId,

      assignee_user: {
        id: assignee.id,
        name: assignee.full_name,
        email: assignee.email,
      },

      reassigned: false,
    };
  }

  const action =
    currentAssigneeUserId
      ? 'REASSIGN_REQUEST'
      : 'ASSIGN_REQUEST';

  const assignedAt =
    new Date().toISOString();

  /**
   * Assignment disimpan sebagai audit delta.
   *
   * CREATE_REQUEST tidak dimutasi supaya history
   * request tetap immutable.
   */
  await AuditService.logDeltaEvent({
    entity:
      'core_internal_request',

    entityId:
      requestId,

    action,

    before: {
      assignee_user_id:
        currentAssigneeUserId,
    },

    after: {
      assignee_user_id:
        assigneeUserId,

      assigned_by_id:
        assignedByUserId,

      assigned_at:
        assignedAt,
    },

    userId:
      assignedByUserId,

    companyId,

    description:
      currentAssigneeUserId
        ? `Request dialihkan kepada ${assignee.full_name}.`
        : `Request ditugaskan kepada ${assignee.full_name}.`,
  });

  /**
   * Notify assignee baru.
   */
  await this.createNotification({
    title:
      currentAssigneeUserId
        ? 'Request Dialihkan kepada Anda'
        : 'Request Ditugaskan kepada Anda',

    message:
      `Anda ditugaskan menangani request #${requestId.slice(0, 8)}.`,

    action_url:
      `/dashboard?tab=requests&id=${requestId}`,

    notification_type:
      currentAssigneeUserId
        ? 'REQUEST_REASSIGNED'
        : 'REQUEST_ASSIGNED',

    priority:
      'MEDIUM',

    recipient_user_id:
      assigneeUserId,

    company_id:
      companyId,
  });

  return {
    id:
      requestId,

    assignee_user_id:
      assigneeUserId,

    assignee_user: {
      id:
        assignee.id,

      name:
        assignee.full_name,

      email:
        assignee.email,
    },

    previous_assignee_user_id:
      currentAssigneeUserId,

    reassigned:
      Boolean(
        currentAssigneeUserId,
      ),

    assigned_by_id:
      assignedByUserId,

    assigned_at:
      assignedAt,
  };
}

  // ---------------------------------------------------------------------------
  // 7. GET REQUESTS LIST & FEED
  // ---------------------------------------------------------------------------

/**
 * getRequests implements this operation using the typed arguments declared in its signature.
 *
 * @param input - Parameters declared by the function/method.
 * @returns The synchronous result or Promise produced below.
 * Database/side effects: uses `core_audit_event`, `core_workflow_instance`, `core_workflow_approval`; transaction scope is exactly the coded scope.
 */
static async getRequests(params: {
  type?: string;
  status?: string;
  page?: number;
  pageSize?: number;

  companyId?: string | null;

  /**
   * User yang sedang login.
   * Dibutuhkan untuk personal Staff feed.
   */
  requesterUserId?: string | null;

  /**
   * Active role dari authentication context.
   */
  activeRole?: RoleCode | string | null;
}) {
  const {
    type,
    status,
    companyId,
    requesterUserId,
    activeRole,
  } = params;

  const page = Math.max(
    1,
    Math.trunc(
      Number(params.page) || 1,
    ),
  );

  const pageSize = Math.min(
    100,
    Math.max(
      1,
      Math.trunc(
        Number(params.pageSize) || 20,
      ),
    ),
  );

  /**
   * Support baik enum RoleCode maupun raw role string.
   */
  const normalizedRole =
    String(activeRole ?? '')
      .trim()
      .toUpperCase();

  const isStaff =
    activeRole === RoleCode.STAFF ||
    normalizedRole === 'STAFF' ||
    normalizedRole === 'ROLE-STAFF';

  /**
   * Staff feed tidak boleh dibuat tanpa identity.
   */
  if (
    isStaff &&
    !requesterUserId
  ) {
    throw new ForbiddenError(
      'User Staff tidak tersedia untuk memuat Request Card.',
    );
  }

  type RequestFeedRow = {
    id: string;

    entity_id:
      string | null;

    user_id:
      string | null;

    company_id:
      string | null;

    after_data:
      Record<string, unknown> | null;

    occurred_at:
      Date;

    current_state:
      string | null;

    assignee_user_id:
      string | null;

    assignee_full_name:
      string | null;

    assignee_email:
      string | null;

    assignee_username:
      string | null;

    approvals: Array<{
      approval_level: string;
      decision: string;
      remarks: string;
      decided_at:
        Date | string | null;
      approver_user_id:
        string | null;
    }>;

    total_count:
      bigint;
  };

  const companyClause =
    companyId
      ? Prisma.sql`
          AND ae.company_id =
            ${companyId}::uuid
        `
      : Prisma.empty;

  /**
   * Request feed:
   *
   * 1. Ambil CREATE_REQUEST sebagai base request.
   * 2. Cari assignment paling baru.
   * 3. Overlay assignee terbaru.
   * 4. Kalau Staff, filter hanya request assigned ke dirinya.
   * 5. Join user assignee agar frontend langsung punya nama.
   */
  const feedRows =
    await prisma.$queryRaw<
      RequestFeedRow[]
    >(Prisma.sql`

      WITH create_logs AS (
        SELECT
          ae.id,
          ae.entity_id,
          ae.user_id,
          ae.company_id,
          ae.after_data,
          ae.occurred_at

        FROM core_audit_event ae

        WHERE
          ae.entity_name =
            'core_internal_request'

          AND ae.event_type =
            'CREATE_REQUEST'

          ${companyClause}
      ),

      request_state AS (
        SELECT
          cl.*,

          COALESCE(

            /**
             * Assignment terbaru menang.
             */
            NULLIF(
              (
                SELECT
                  assignment.after_data
                    ->> 'assignee_user_id'

                FROM core_audit_event assignment

                WHERE
                  assignment.entity_name =
                    'core_internal_request'

                  AND assignment.entity_id =
                    cl.entity_id

                  AND assignment.event_type IN (
                    'ASSIGN_REQUEST',
                    'REASSIGN_REQUEST'
                  )

                  AND (
                    cl.company_id IS NULL

                    OR assignment.company_id =
                      cl.company_id
                  )

                ORDER BY
                  assignment.occurred_at
                    DESC NULLS LAST,

                  assignment.id DESC

                LIMIT 1
              ),
              ''
            ),

            /**
             * Fallback ke initial assignee dari
             * CREATE_REQUEST.
             */
            NULLIF(
              cl.after_data
                ->> 'assignee_user_id',
              ''
            )

          ) AS assignee_user_id

        FROM create_logs cl
      ),

      filtered_logs AS (
        SELECT
          rs.*,

          count(*) OVER()
            AS total_count

        FROM request_state rs

        WHERE
          (
            ${isStaff}::boolean = false

            OR rs.assignee_user_id =
              ${requesterUserId ?? null}::text
          )

        ORDER BY
          rs.occurred_at DESC

        OFFSET ${
          (page - 1) * pageSize
        }

        LIMIT ${pageSize}
      )

      SELECT
        logs.*,

        wi.current_state,

        au.full_name
          AS assignee_full_name,

        au.email
          AS assignee_email,

        au.username
          AS assignee_username,

        COALESCE(
          (
            SELECT
              jsonb_agg(
                jsonb_build_object(
                  'approval_level',
                    wa.approval_level,

                  'decision',
                    wa.decision,

                  'remarks',
                    wa.remarks,

                  'decided_at',
                    wa.decided_at,

                  'approver_user_id',
                    wa.approver_user_id
                )

                ORDER BY
                  wa.decided_at ASC
              )

            FROM core_workflow_approval wa

            WHERE
              wa.workflow_instance_id =
                logs.entity_id

              AND (
                ${companyId ?? null}::uuid
                  IS NULL

                OR wa.company_id =
                  ${companyId ?? null}::uuid
              )
          ),
          '[]'::jsonb
        ) AS approvals

      FROM filtered_logs logs

      LEFT JOIN core_workflow_instance wi
        ON wi.id =
          logs.entity_id

        AND (
          ${companyId ?? null}::uuid
            IS NULL

          OR wi.company_id =
            ${companyId ?? null}::uuid
        )

      /**
       * Join via text supaya invalid historical
       * JSON tidak menyebabkan UUID cast error.
       */
      LEFT JOIN iam_user au
        ON au.id::text =
          logs.assignee_user_id

      ORDER BY
        logs.occurred_at DESC
    `);

  const total =
    Number(
      feedRows[0]?.total_count ?? 0,
    );

  const rows =
    feedRows.map((log) => {
      const payload =
        (log.after_data as any) || {};

      const entityId =
        log.entity_id ||
        log.id;

      const reqApprovals =
        log.approvals ?? [];

      return {
        id:
          entityId,

        request_number:
          payload.request_number ||
          `REQ-${entityId.slice(-6)}`,

        request_type:
          payload.request_type ||
          'OTHER',

        title:
          payload.title ||
          'Untitled Request',

        description:
          payload.description ||
          '',

        amount:
          payload.amount ??
          null,

        budget_category:
          payload.budget_category ??
          null,

        bank_target:
          payload.bank_target ??
          null,

        project_id:
          payload.project_id ??
          null,

        /**
         * Assignment terbaru.
         */
        assignee_user_id:
          log.assignee_user_id ??
          null,

        /**
         * Frontend bisa langsung render:
         *
         * Assigned to: Nama Staff
         */
        assignee_user:
          log.assignee_user_id
            ? {
                id:
                  log.assignee_user_id,

                name:
                  log.assignee_full_name ??
                  'Unknown User',

                email:
                  log.assignee_email,

                username:
                  log.assignee_username,
              }
            : null,

        start_at:
          payload.start_at,

        end_at:
          payload.end_at,

        tagged_users:
          payload.tagged_users ||
          [],

        attachment_url:
          payload.attachment_url,

        status:
          log.current_state ||
          payload.status ||
          'PENDING_OM',

        created_by_id:
          payload.created_by_id ||
          log.user_id,

        company_id:
          payload.company_id ||
          log.company_id,

        created_at:
          log.occurred_at,

        approvals:
          reqApprovals.map(
            (approval) => ({
              level:
                approval.approval_level,

              decision:
                approval.decision,

              remarks:
                approval.remarks,

              decided_at:
                approval.decided_at,

              decided_by:
                approval.approver_user_id,
            }),
          ),
      };
    });

  /**
   * Existing filters.
   */
  let filtered =
    rows;

  if (
    type &&
    type !== 'ALL'
  ) {
    filtered =
      filtered.filter(
        (request) =>
          request.request_type === type,
      );
  }

  if (
    status &&
    status !== 'ALL'
  ) {
    filtered =
      filtered.filter(
        (request) =>
          request.status === status,
      );
  }

  return {
    total,

    page,

    page_size:
      pageSize,

    total_pages:
      Math.ceil(
        total / pageSize,
      ),

    rows:
      filtered,
  };
}

  // ---------------------------------------------------------------------------
  // 8. GET TEAM MEMBERS (Company Isolated Search)
  // ---------------------------------------------------------------------------

/**
 * getTeamMembers implements a named method within this file's domain service boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: Reads or mutates Prisma model(s) `iam_user_role`, `iam_user`, `iam_role`; transaction boundaries are exactly those visible in the body.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
  static async getTeamMembers(companyId?: string | null, search?: string) {
    let companyUserIds: string[] = [];

    if (companyId) {
      const userRoles = await prisma.iam_user_role.findMany({
        where: { company_id: companyId },
        select: { user_id: true, role_id: true },
      });
      const ids = userRoles.map(r => r.user_id).filter(Boolean) as string[];
      companyUserIds = ids;
    }

    const whereClause: any = { is_active: true };

    if (companyId) whereClause.id = { in: companyUserIds };

    if (search && search.trim()) {
      const q = search.trim();
      whereClause.AND = [
        {
          OR: [
            { full_name: { contains: q, mode: 'insensitive' } },
            { email:     { contains: q, mode: 'insensitive' } },
            { username:  { contains: q, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const users = await prisma.iam_user.findMany({
      where: whereClause,
      take: 30,
      select: {
        id:           true,
        full_name:    true,
        email:        true,
        username:     true,
      },
    }).catch(() => []);

    const userRoleMappings = await prisma.iam_user_role.findMany({
      where: {
        user_id: { in: users.map(u => u.id) },
        ...(companyId ? { company_id: companyId } : {}),
      },
    }).catch(() => []);
    const roleIds = [...new Set(userRoleMappings.map((mapping) => mapping.role_id).filter((id): id is string => Boolean(id)))];
    const roles = roleIds.length
      ? await prisma.iam_role.findMany({ where: { id: { in: roleIds } } }).catch(() => [])
      : [];
    const roleCodeById = new Map(roles.map((role) => [role.id, role.role_code]));

    return users.map((u) => {
      const roleCodes = userRoleMappings
        .filter((mapping) => mapping.user_id === u.id && mapping.role_id)
        .map((mapping) => roleCodeById.get(mapping.role_id!))
        .filter((code): code is RoleCode => code !== undefined);
      let roleLabel = 'Team Member';
      
      if (roleCodes.includes(RoleCode.SUPER_ADMIN)) {
        roleLabel = 'Superadmin';
      } else if (roleCodes.includes(RoleCode.COMPANY_ADMIN)) {
        roleLabel = 'Company Admin';
      } else if (roleCodes.includes(RoleCode.PROJECT_MANAGER)) {
        roleLabel = 'Project Manager';
      } else if (roleCodes.includes(RoleCode.DIRECTOR)) {
        roleLabel = 'Director';
      }

      return {
        id:         u.id,
        name:       u.full_name || u.username || u.email.split('@')[0],
        email:      u.email,
        role:       roleLabel,
        avatar_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(u.id || u.username || u.email)}`,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // HELPER: NOTIFICATION CREATOR (Safe UUID handling)
  // ---------------------------------------------------------------------------

/**
 * createNotification implements this operation using the typed arguments declared in its signature.
 *
 * @param input - Parameters declared by the function/method.
 * @returns The synchronous result or Promise produced below.
 * Database/side effects: uses `core_notification`, `iam_role`, `core_notification_recipient`; transaction scope is exactly the coded scope.
 */
  private static async createNotification(params: {
    title:              string;
    message:            string;
    action_url:         string;
    notification_type:  string;
    priority:           string;
    recipient_role_id?: string;
    recipient_user_id?: string;
    company_id?:        string | null;
  }) {
    try {
      const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      const notifId = crypto.randomUUID();
      const notif = await prisma.core_notification.create({
        data: {
          id:                 notifId,
          title:              params.title,
          message:            params.message,
          action_url:         params.action_url,
          notification_type:  params.notification_type,
          priority:           params.priority,
          company_id:         params.company_id && UUID_REGEX.test(params.company_id) ? params.company_id : null,
          created_at:         new Date(),
        },
      });

      let validRoleId: string | null = null;
      if (params.recipient_role_id) {
        if (UUID_REGEX.test(params.recipient_role_id)) {
          validRoleId = params.recipient_role_id;
        } else {
          const roleRecord = await prisma.iam_role.findFirst({
            where: {
              OR: [
                { role_code: { equals: params.recipient_role_id as RoleCode } },
                { role_name: { equals: params.recipient_role_id, mode: 'insensitive' } },
              ],
            },
            select: { id: true },
          }).catch(() => null);

          if (roleRecord && UUID_REGEX.test(roleRecord.id)) {
            validRoleId = roleRecord.id;
          }
        }
      }

      let validUserId: string | null = null;
      if (params.recipient_user_id && UUID_REGEX.test(params.recipient_user_id)) {
        validUserId = params.recipient_user_id;
      }

      if (validRoleId || validUserId) {
        await prisma.core_notification_recipient.create({
          data: {
            id:                crypto.randomUUID(),
            notification_id:   notif.id,
            recipient_role_id: validRoleId,
            recipient_user_id: validUserId,
            delivery_status:   'UNREAD',
          },
        });
      }
    } catch (err) {
      console.warn('[RequestService] Notification creation non-blocking warning:', err);
    }
  }
}
