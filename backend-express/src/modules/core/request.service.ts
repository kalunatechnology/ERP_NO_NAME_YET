import crypto from 'crypto';
import prisma from '../../config/database';
import { ValidationError, NotFoundError, ForbiddenError } from '../../utils/errors';
import { AuditService } from './audit.service';

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

  static async createRequest(payload: CreateRequestPayload, userId: string, companyId?: string | null) {
    const {
      request_type, title, description, amount, budget_category,
      bank_target, project_id, start_at, end_at, tagged_users = [],
      attachment_url, is_draft
    } = payload;

    if (!title || title.trim().length === 0) {
      throw new ValidationError('Judul/Topik request wajib diisi.');
    }

    if (request_type === 'FUND_REQUEST' && (!amount || Number(amount) <= 0)) {
      throw new ValidationError('Nominal dana (amount) wajib diisi lebih dari 0 untuk Fund Request.');
    }

    const requestNumber = `REQ-${Date.now().toString().slice(-6)}`;
    const initialStatus = is_draft ? 'DRAFT' : 'PENDING_OM';

    // Buat workflow instance sebagai backplane status
    const instanceId = crypto.randomUUID();
    await prisma.core_workflow_instance.create({
      data: {
        id:            instanceId,
        workflow_code: `INTERNAL_${request_type}`,
        current_state: initialStatus,
        status:        is_draft ? 'DRAFT' : 'IN_PROGRESS',
        started_at:    new Date(),
      },
    });

    // Simpan payload metadata ke audit event agar persistent
    const requestData = {
      id:                 instanceId,
      request_number:     requestNumber,
      request_type,
      title,
      description:        description ?? '',
      amount:             amount ? Number(amount) : null,
      budget_category:    budget_category ?? (request_type === 'FUND_REQUEST' ? 'OPERATIONAL' : null),
      bank_target:        bank_target ?? null,
      project_id:         project_id ?? null,
      start_at:           start_at ? new Date(start_at).toISOString() : null,
      end_at:             end_at ? new Date(end_at).toISOString() : null,
      tagged_users,
      attachment_url:     attachment_url ?? null,
      status:             initialStatus,
      created_by_id:      userId,
      company_id:         companyId ?? null,
      created_at:         new Date().toISOString(),
      updated_at:         new Date().toISOString(),
      om_review:          null,
      exec_review:        null,
      disbursement:       null,
      lpj:                null,
    };

    await AuditService.logDeltaEvent({
      entity:      'core_internal_request',
      entityId:    instanceId,
      action:      'CREATE_REQUEST',
      before:      {},
      after:       requestData as any,
      userId,
      description: `Permohonan baru ${request_type}: ${title} (${requestNumber})${amount ? ` sebesar Rp ${Number(amount).toLocaleString('id-ID')}` : ''}`,
      companyId:   companyId ?? undefined,
    });

    // Jika bukan draft, kirim notifikasi ke OM
    if (!is_draft) {
      await this.createNotification({
        title:              `Permohonan ${request_type}: ${title}`,
        message:            `Permohonan baru ${requestNumber} diajukan dan membutuhkan validasi Operations Manager.`,
        action_url:         `/dashboard?tab=requests&id=${instanceId}`,
        notification_type:  'APPROVAL_REQUEST',
        priority:           'HIGH',
        recipient_role_id:  'OPERATIONS_MANAGER',
        company_id:         companyId ?? null,
      });
    }

    return requestData;
  }

  // ---------------------------------------------------------------------------
  // 2. LEVEL 1: VALIDATION THROUGH OM
  // ---------------------------------------------------------------------------

  static async validateByOM(params: {
    requestId: string;
    decision:  'APPROVE' | 'RE_CHECK';
    remarks?:  string;
    omUserId:  string;
  }) {
    const { requestId, decision, remarks = '', omUserId } = params;

    const instance = await prisma.core_workflow_instance.findUnique({ where: { id: requestId } });
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
      });
    } else {
      await this.createNotification({
        title:              `Permohonan Membutuhkan Perbaikan (Re-checking)`,
        message:            `OM meminta perbaikan: "${remarks}". Silakan perbarui dan kirim ulang.`,
        action_url:         `/dashboard?tab=requests&id=${requestId}`,
        notification_type:  'REVISION_REQUESTED',
        priority:           'MEDIUM',
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

  static async approveByExecutive(params: {
    requestId:  string;
    decision:   'APPROVE' | 'REJECT';
    remarks?:   string;
    execUserId: string;
  }) {
    const { requestId, decision, remarks = '', execUserId } = params;

    const instance = await prisma.core_workflow_instance.findUnique({ where: { id: requestId } });
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

  static async disburseRequest(params: {
    requestId:         string;
    disburseAccountId?: string;
    disburseReference?: string;
    disburseUserId:    string;
  }) {
    const { requestId, disburseAccountId, disburseReference, disburseUserId } = params;

    const instance = await prisma.core_workflow_instance.findUnique({ where: { id: requestId } });
    if (!instance) throw new NotFoundError('Request');

    if (instance.current_state !== 'REGISTERED') {
      throw new ValidationError(`Hanya request berstatus REGISTERED yang dapat dicairkan (Status: ${instance.current_state}).`);
    }

    const disbursementData = {
      disbursed_at:       new Date().toISOString(),
      disbursed_by_id:    disburseUserId,
      account_id:         disburseAccountId ?? '1111-BCA-OPS',
      reference_number:   disburseReference ?? `DISB-${Date.now().toString().slice(-6)}`,
    };

    await prisma.core_workflow_instance.update({
      where: { id: requestId },
      data:  { current_state: 'DISBURSED' },
    });

    await AuditService.logDeltaEvent({
      entity:      'core_internal_request',
      entityId:    requestId,
      action:      'DISBURSE_FUND',
      before:      { status: 'REGISTERED' },
      after:       { status: 'DISBURSED', disbursement: disbursementData },
      userId:      disburseUserId,
      description: `Dana permohonan berhasil dicairkan oleh Finance (Ref: ${disbursementData.reference_number})`,
    });

    return {
      id:           requestId,
      status:       'DISBURSED',
      disbursement: disbursementData,
    };
  }

  // ---------------------------------------------------------------------------
  // 5. SUBMIT LPJ & NOTA BUKTI (SETTLEMENT) - PEMOHON
  // ---------------------------------------------------------------------------

  static async submitLPJ(params: {
    requestId:         string;
    realizationAmount: number;
    discrepancyAmount?: number;
    discrepancyType?:  string;
    notes?:            string;
    invoices?:         LPJInvoiceItem[];
    requesterUserId:   string;
  }) {
    const { requestId, realizationAmount, discrepancyAmount = 0, discrepancyType = 'NONE', notes = '', invoices = [], requesterUserId } = params;

    const instance = await prisma.core_workflow_instance.findUnique({ where: { id: requestId } });
    if (!instance) throw new NotFoundError('Request');

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

  static async verifyLPJByOM(params: {
    requestId: string;
    decision:  'APPROVE' | 'REVISE';
    remarks?:  string;
    omUserId:  string;
  }) {
    const { requestId, decision, remarks = '', omUserId } = params;

    const instance = await prisma.core_workflow_instance.findUnique({ where: { id: requestId } });
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
  // 7. GET REQUESTS LIST & FEED
  // ---------------------------------------------------------------------------

  static async getRequests(params: {
    type?:      string;
    status?:    string;
    page?:      number;
    pageSize?:  number;
    companyId?: string | null;
  }) {
    const { type, status, page = 1, pageSize = 20, companyId } = params;

    const where: any = {
      entity_name: 'core_internal_request',
      event_type:  'CREATE_REQUEST',
    };

    if (companyId) {
      where.company_id = companyId;
    }

    const total = await prisma.core_audit_event.count({ where });

    const auditLogs = await prisma.core_audit_event.findMany({
      where,
      orderBy: { occurred_at: 'desc' },
      skip:    (page - 1) * pageSize,
      take:    pageSize,
    });

    const instanceIds = auditLogs.map(a => a.entity_id).filter(Boolean) as string[];
    const instances = await prisma.core_workflow_instance.findMany({
      where: { id: { in: instanceIds } },
    });

    const approvals = await prisma.core_workflow_approval.findMany({
      where: { workflow_instance_id: { in: instanceIds } },
      orderBy: { decided_at: 'asc' },
    });

    const rows = auditLogs.map(log => {
      const payload = (log.after_data as any) || {};
      const entityId = log.entity_id || log.id;
      const liveInstance = instances.find(inst => inst.id === log.entity_id);
      const reqApprovals = approvals.filter(appr => appr.workflow_instance_id === log.entity_id);

      return {
        id:                 entityId,
        request_number:     payload.request_number || `REQ-${entityId.slice(-6)}`,
        request_type:       payload.request_type || 'OTHER',
        title:              payload.title || 'Untitled Request',
        description:        payload.description || '',
        amount:             payload.amount || null,
        budget_category:    payload.budget_category || null,
        bank_target:        payload.bank_target || null,
        project_id:         payload.project_id || null,
        start_at:           payload.start_at,
        end_at:             payload.end_at,
        tagged_users:       payload.tagged_users || [],
        attachment_url:     payload.attachment_url,
        status:             liveInstance?.current_state || payload.status || 'PENDING_OM',
        created_by_id:      payload.created_by_id || log.user_id,
        company_id:         payload.company_id || log.company_id,
        created_at:         log.occurred_at,
        approvals:          reqApprovals.map(a => ({
          level:      a.approval_level,
          decision:   a.decision,
          remarks:    a.remarks,
          decided_at: a.decided_at,
          decided_by: a.approver_user_id,
        })),
      };
    });

    // Client-side filter jika ada query type/status
    let filtered = rows;
    if (type && type !== 'ALL') {
      filtered = filtered.filter(r => r.request_type === type);
    }
    if (status && status !== 'ALL') {
      filtered = filtered.filter(r => r.status === status);
    }

    return {
      total,
      page,
      page_size:   pageSize,
      total_pages: Math.ceil(total / pageSize),
      rows:        filtered,
    };
  }

  // ---------------------------------------------------------------------------
  // 8. GET TEAM MEMBERS (Company Isolated Search)
  // ---------------------------------------------------------------------------

  static async getTeamMembers(companyId?: string | null, search?: string) {
    let companyUserIds: string[] | null = null;

    if (companyId) {
      const userRoles = await prisma.iam_user_role.findMany({
        where: { company_id: companyId },
        select: { user_id: true, role_id: true },
      });
      const ids = userRoles.map(r => r.user_id).filter(Boolean) as string[];
      if (ids.length > 0) {
        companyUserIds = ids;
      }
    }

    const whereClause: any = { is_active: true };

    if (companyUserIds !== null) {
      whereClause.id = { in: companyUserIds };
    }

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
        is_staff:     true,
        is_superuser: true,
      },
    }).catch(() => []);

    const userRoleMappings = await prisma.iam_user_role.findMany({
      where: {
        user_id: { in: users.map(u => u.id) },
        ...(companyId ? { company_id: companyId } : {}),
      },
    }).catch(() => []);

    return users.map((u: { id: string; full_name: string; email: string; username: string; is_staff: boolean; is_superuser: boolean }) => {
      const roleMap = userRoleMappings.find(r => r.user_id === u.id);
      let roleLabel = 'Team Member';
      
      if (u.is_superuser) {
        roleLabel = 'Superadmin';
      } else if (roleMap?.role_id?.toUpperCase().includes('ADMIN') || u.is_staff) {
        roleLabel = 'Company Admin';
      } else if (roleMap?.role_id?.toUpperCase().includes('MANAGER') || roleMap?.role_id?.toUpperCase().includes('OM')) {
        roleLabel = 'Operations Manager';
      } else if (roleMap?.role_id?.toUpperCase().includes('PM')) {
        roleLabel = 'Project Manager';
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
                { role_code: { equals: params.recipient_role_id, mode: 'insensitive' } },
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
