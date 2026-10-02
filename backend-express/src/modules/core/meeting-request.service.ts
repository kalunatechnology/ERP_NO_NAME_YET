import crypto from 'crypto';
import prisma from '../../config/database';
import { ForbiddenError, NotFoundError, ValidationError } from '../../utils/errors';
import { AuditService } from './audit.service';
import { dateKeyInTimeZone, meetingOccurrenceDates, occurrenceDateForDatabase, resolveMeetingOccurrenceDate } from './meeting-occurrence.service';

export interface SaveMeetingMinutesPayload {
  occurrence_date?: string;
  summary?: string;
  opening_notes?: string;
  general_discussion?: string;
  conclusion?: string;
  next_meeting_at?: string | null;
  decisions?: Array<{ text: string; owner_user_id?: string }>;
  action_items?: Array<{
    title: string;
    description?: string;
    assignee_user_id?: string;
    due_at?: string;
    priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
    project_id?: string;
  }>;
}

// ---------------------------------------------------------------------------
// STATUS HIERARCHY FOR MEETING MINUTES
// ---------------------------------------------------------------------------
// Per-occurrence status:  NOT_CREATED  →  DRAFT  →  COMPLETED (published)
// Meeting request status: SCHEDULED  →  IN_MINUTES  →  COMPLETED
//
// saveMinutes()    → saves/updates DRAFT; NO notification sent
// publishMinutes() → sets status to PUBLISHED; sends notification to all participants
// Non-recurring    → publish also closes meeting + ticket (COMPLETED)
// Recurring        → publish closes this occurrence only; series continues
// ---------------------------------------------------------------------------

// Only true executives may view all meetings regardless of participation.
// Every other role (PM, OM, Supervisor, Staff, etc.) is restricted to meetings
// they are directly involved in (organizer, notetaker, or participant).
const EXECUTIVE_ROLES = new Set([
  'SUPER_ADMIN', 'COMPANY_ADMIN', 'DIRECTOR',
  'ROLE-SUPER-ADMIN', 'ROLE-COMPANY-ADMIN', 'ROLE-DIRECTOR',
]);

// ---------------------------------------------------------------------------
// INTERNAL NOTIFICATION HELPER — notifyUser
// Sends a targeted app notification to a single user. Non-blocking:
// errors are caught and warned but never thrown to the caller.
// ---------------------------------------------------------------------------
async function notifyUser(params: {
  recipient_user_id: string;
  actor_user_id: string | null;
  title: string;
  message: string;
  action_url: string;
  notification_type: string;
  priority: string;
  company_id: string | null;
}): Promise<void> {
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_REGEX.test(params.recipient_user_id)) return;
  try {
    const now = new Date();
    const notifId = crypto.randomUUID();
    const companyId = params.company_id && UUID_REGEX.test(params.company_id) ? params.company_id : null;
    await prisma.core_notification.create({
      data: {
        id: notifId, title: params.title, message: params.message,
        action_url: params.action_url, notification_type: params.notification_type,
        priority: params.priority, company_id: companyId, created_at: now,
      },
    });
    await prisma.core_notification_recipient.create({
      data: {
        id: crypto.randomUUID(), notification_id: notifId, recipient_role_id: null,
        recipient_user_id: params.recipient_user_id, company_id: companyId, delivery_status: 'UNREAD',
      },
    });
    // Real-time sidebar (core_app_notification)
    await prisma.core_app_notification.create({
      data: {
        id: crypto.randomUUID(), company_id: companyId,
        recipient_id: params.recipient_user_id,
        actor_id: params.actor_user_id && UUID_REGEX.test(params.actor_user_id) ? params.actor_user_id : null,
        category: params.notification_type, title: params.title,
        description: params.message, target_url: params.action_url,
        is_read: false, created_at: now, updated_at: now,
      },
    });
  } catch (err) {
    console.warn('[MeetingRequestService] Notification warning (non-blocking):', err);
  }
}

// ---------------------------------------------------------------------------
// SEND MINUTES-PUBLISHED NOTIFICATION TO ALL PARTICIPANTS
// Notifies organizer + notetaker + all participants (except the publisher)
// that the minutes for a specific occurrence are now available.
// ---------------------------------------------------------------------------
async function notifyMinutesPublished(params: {
  meetingId: string;
  companyId: string;
  organizer_user_id: string | null;
  notetaker_user_id: string | null;
  participants: Array<{ user_id: string | null }>;
  requestNumber: string;
  requestTitle: string;
  occurrenceDate: string;
  publisherUserId: string;
}): Promise<void> {
  const recipientIds = Array.from(new Set([
    params.organizer_user_id,
    params.notetaker_user_id,
    ...params.participants.map((p) => p.user_id),
  ].filter((id): id is string => Boolean(id) && id !== params.publisherUserId)));

  const actionUrl = `/requests?meeting=${params.meetingId}`;
  const title = `Notulensi Dipublikasikan: ${params.requestTitle}`;
  let formattedDate = '';
  try { formattedDate = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(params.occurrenceDate)); } catch { /* ignore */ }
  const message = `${params.requestNumber} — Notulensi meeting${formattedDate ? ` tanggal ${formattedDate}` : ''} telah dipublikasikan dan dapat dibaca oleh seluruh peserta.`;

  await Promise.all(recipientIds.map((recipientUserId) =>
    notifyUser({
      recipient_user_id: recipientUserId,
      actor_user_id: params.publisherUserId,
      title, message, action_url: actionUrl,
      notification_type: 'MINUTES_PUBLISHED',
      priority: 'NORMAL',
      company_id: params.companyId,
    }),
  ));
}

async function notifyMeetingPublished(params: {
  meetingId: string;
  companyId: string;
  organizer_user_id: string | null;
  notetaker_user_id: string | null;
  assignee_user_id?: string | null;
  participants: Array<{ user_id: string | null }>;
  requestNumber: string;
  requestTitle: string;
  startAt: Date;
  timezone: string;
  publisherUserId: string;
}): Promise<void> {
  const recipientIds = Array.from(new Set([
    params.organizer_user_id,
    params.notetaker_user_id,
    params.assignee_user_id,
    ...params.participants.map((p) => p.user_id),
  ].filter((id): id is string => Boolean(id) && id !== params.publisherUserId)));

  const actionUrl = `/requests?meeting=${params.meetingId}`;
  const title = `Undangan Meeting: ${params.requestTitle}`;
  let formattedTime = '';
  try {
    formattedTime = params.startAt.toLocaleString('id-ID', { timeZone: params.timezone });
  } catch {
    formattedTime = params.startAt.toISOString();
  }
  const message = `${params.requestNumber} dijadwalkan ${formattedTime}. Anda diundang dalam meeting ini.`;

  await Promise.all(
    recipientIds.map((recipientId) =>
      notifyUser({
        recipient_user_id: recipientId,
        actor_user_id: params.publisherUserId,
        title,
        message,
        action_url: actionUrl,
        notification_type: 'MEETING_INVITATION',
        priority: 'HIGH',
        company_id: params.companyId,
      }),
    ),
  );
}


export class MeetingRequestService {
  static async list(companyId: string, userId: string, activeRole: string, query: { status?: string; search?: string }) {
    // Hanya Super Admin yang memiliki hak bypass audit global.
    // Seluruh peran lain hanya melihat meeting yang melibatkan mereka secara eksplisit (organizer, notetaker, atau peserta).
    const isGlobalAuditor = activeRole === 'SUPER_ADMIN' || activeRole === 'ROLE-SUPER-ADMIN';
    const participantRows = isGlobalAuditor ? [] : await prisma.request_meeting_participant.findMany({
      where: { company_id: companyId, user_id: userId }, select: { meeting_id: true },
    });
    const accessibleMeetingIds = participantRows.map((row) => row.meeting_id);
    const meetings = await prisma.request_meeting.findMany({
      where: {
        company_id: companyId,
        ...(query.status ? { status: query.status } : {}),
        ...(isGlobalAuditor ? {} : { OR: [
          { organizer_user_id: userId }, { notetaker_user_id: userId }, { id: { in: accessibleMeetingIds } },
        ] }),
      },
      orderBy: { start_at: 'desc' }, take: 100,
    });
    const requestIds = meetings.map((meeting) => meeting.request_id);
    const tickets = await prisma.request_ticket.findMany({ where: { company_id: companyId, id: { in: requestIds } } });
    const ticketById = new Map(tickets.map((ticket) => [ticket.id, ticket]));
    const search = query.search?.trim().toLowerCase();
    return meetings.map((meeting) => ({ ...meeting, request: ticketById.get(meeting.request_id) ?? null }))
      .filter((row) => !search || row.request?.title.toLowerCase().includes(search) || row.request?.request_number.toLowerCase().includes(search));
  }

  static async getById(meetingId: string, companyId: string, userId: string, activeRole: string, occurrenceDate?: string) {
    const meeting = await prisma.request_meeting.findFirst({ where: { id: meetingId, company_id: companyId } });
    if (!meeting) throw new NotFoundError('Meeting Request');
    const participant = await prisma.request_meeting_participant.findFirst({
      where: { meeting_id: meetingId, company_id: companyId, user_id: userId }, select: { id: true },
    });
    const isGlobalAuditor = activeRole === 'SUPER_ADMIN' || activeRole === 'ROLE-SUPER-ADMIN';
    if (!isGlobalAuditor && meeting.organizer_user_id !== userId && meeting.notetaker_user_id !== userId && !participant) {
      throw new ForbiddenError('Anda tidak terlibat dalam meeting ini.');
    }
    const [request, participants, agenda, allMinutes] = await Promise.all([
      prisma.request_ticket.findFirst({ where: { id: meeting.request_id, company_id: companyId } }),
      prisma.request_meeting_participant.findMany({ where: { meeting_id: meetingId, company_id: companyId }, orderBy: { created_at: 'asc' } }),
      prisma.request_meeting_agenda.findMany({ where: { meeting_id: meetingId, company_id: companyId }, orderBy: { sequence_number: 'asc' } }),
      prisma.request_meeting_minutes.findMany({ where: { meeting_id: meetingId, company_id: companyId }, orderBy: { occurrence_date: 'desc' } }),
    ]);
    const userIds = Array.from(new Set([
      ...participants.map((item) => item.user_id),
      meeting.notetaker_user_id,
    ].filter((id): id is string => Boolean(id))));
    const users = userIds.length ? await prisma.iam_user.findMany({
      where: { id: { in: userIds } }, select: { id: true, full_name: true, email: true },
    }) : [];
    const userById = new Map(users.map((item) => [item.id, item]));
    const occurrences = meetingOccurrenceDates(meeting);
    const todayKey = dateKeyInTimeZone(new Date(), meeting.timezone);
    const selectedOccurrenceDate = resolveMeetingOccurrenceDate(meeting, occurrenceDate);
    const minutes = allMinutes.find((item) => item.occurrence_date.toISOString().slice(0, 10) === selectedOccurrenceDate) ?? null;
    const minutesByDate = new Map(allMinutes.map((item) => [item.occurrence_date.toISOString().slice(0, 10), item]));

    // Tanggal notes harus dari tanggal terbaru dan menyesuaikan dengan tanggal hari ini.
    // Tampilkan occurrence yang telah atau sedang berlangsung (<= todayKey) serta tanggal yang sudah memiliki notulensi.
    const eligibleDates = occurrences.some((date) => date <= todayKey)
      ? occurrences.filter((date) => date <= todayKey || minutesByDate.has(date))
      : occurrences;

    const notes = [...eligibleDates].reverse().map((date) => {
      const note = minutesByDate.get(date);
      return {
        occurrence_date: date,
        minutes_id: note?.id ?? null,
        status: !note ? 'NOT_CREATED' : note.status === 'PUBLISHED' ? 'COMPLETED' : 'DRAFT',
        is_today: date === todayKey,
      };
    });
    const [decisions, actionItems] = minutes ? await Promise.all([
      prisma.request_meeting_decision.findMany({ where: { minutes_id: minutes.id, company_id: companyId }, orderBy: { decision_number: 'asc' } }),
      prisma.request_meeting_action_item.findMany({ where: { minutes_id: minutes.id, company_id: companyId }, orderBy: { created_at: 'asc' } }),
    ]) : [[], []];
    const isExecutive = EXECUTIVE_ROLES.has(activeRole);
    const isNotetaker = meeting.notetaker_user_id === userId;
    const isParticipant = Boolean(participant);
    const isOrganizer = meeting.organizer_user_id === userId;

    // Notulensi terbuka di recurring meeting atau bila notulis belum ditentukan secara khusus (semua peserta, organizer, notetaker, executive dapat menyusun).
    const canEditMinutes = meeting.recurrence_type === 'RECURRING' || !meeting.notetaker_user_id
      ? (isNotetaker || isOrganizer || isParticipant || isExecutive)
      : (isNotetaker || isExecutive);

    // can_publish: user has edit rights AND there is a DRAFT waiting to be published
    const canPublish = canEditMinutes && Boolean(minutes) && minutes?.status !== 'PUBLISHED';

    return {
      ...meeting, request,
      participants: participants.map((item) => ({ ...item, user: item.user_id ? userById.get(item.user_id) ?? null : null })),
      notetaker: meeting.notetaker_user_id ? userById.get(meeting.notetaker_user_id) ?? null : null,
      permissions: {
        can_edit_minutes: canEditMinutes,
        // can_publish is true only when a saved draft exists and the user has rights to publish.
        // This drives the enabled/disabled state of the Publikasikan button on the frontend.
        can_publish: canPublish,
      },
      agenda,
      selected_occurrence_date: selectedOccurrenceDate,
      notes,
      minutes: minutes ? { ...minutes, decisions, action_items: actionItems } : null,
    };
  }

  static async saveMinutes(meetingId: string, payload: SaveMeetingMinutesPayload, companyId: string, userId: string, activeRole: string) {
    const detail = await this.getById(meetingId, companyId, userId, activeRole, payload.occurrence_date);
    if (!detail.request) throw new NotFoundError('Request');
    if (!detail.permissions?.can_edit_minutes) {
      if (detail.recurrence_type === 'RECURRING' || !detail.notetaker_user_id) {
        throw new ForbiddenError('Hanya peserta yang tergabung dalam meeting ini yang dapat menyusun notulensi.');
      } else {
        throw new ForbiddenError('Hanya notulis yang ditugaskan yang dapat menyusun notulensi.');
      }
    }
    const occurrenceDate = resolveMeetingOccurrenceDate(detail, payload.occurrence_date);
    if (detail.minutes?.status === 'PUBLISHED') throw new ValidationError('Notulensi pada tanggal ini sudah dipublikasikan dan tidak dapat ditimpa.');
    const decisions = (payload.decisions ?? []).filter((item) => item.text?.trim());
    const actionItems = (payload.action_items ?? []).filter((item) => item.title?.trim());
    const nextMeetingAt = payload.next_meeting_at ? new Date(payload.next_meeting_at) : null;
    if (nextMeetingAt && Number.isNaN(nextMeetingAt.getTime())) throw new ValidationError('Jadwal meeting berikutnya tidak valid.');

    const minutes = await prisma.$transaction(async (tx) => {
      const record = await tx.request_meeting_minutes.upsert({
        where: { meeting_id_occurrence_date: { meeting_id: meetingId, occurrence_date: occurrenceDateForDatabase(occurrenceDate) } },
        update: {
          summary: payload.summary?.trim() ?? '', opening_notes: payload.opening_notes?.trim() ?? '',
          general_discussion: payload.general_discussion?.trim() ?? '', conclusion: payload.conclusion?.trim() ?? '',
          next_meeting_at: nextMeetingAt,
        },
        create: {
            id: crypto.randomUUID(), tenant_id: detail.tenant_id, company_id: companyId, created_by_id: userId,
            meeting_id: meetingId, occurrence_date: occurrenceDateForDatabase(occurrenceDate), prepared_by_id: userId, summary: payload.summary?.trim() ?? '',
            opening_notes: payload.opening_notes?.trim() ?? '', general_discussion: payload.general_discussion?.trim() ?? '',
            conclusion: payload.conclusion?.trim() ?? '', next_meeting_at: nextMeetingAt,
        },
      });
      await tx.request_meeting_decision.deleteMany({ where: { minutes_id: record.id, company_id: companyId } });
      await tx.request_meeting_action_item.deleteMany({ where: { minutes_id: record.id, company_id: companyId } });
      if (decisions.length) await tx.request_meeting_decision.createMany({ data: decisions.map((item, index) => ({
        id: crypto.randomUUID(), tenant_id: detail.tenant_id, company_id: companyId, created_by_id: userId,
        meeting_id: meetingId, minutes_id: record.id, decision_number: index + 1,
        decision_text: item.text.trim(), owner_user_id: item.owner_user_id ?? null,
      })) });
      if (actionItems.length) await tx.request_meeting_action_item.createMany({ data: actionItems.map((item) => ({
        id: crypto.randomUUID(), tenant_id: detail.tenant_id, company_id: companyId, created_by_id: userId,
        meeting_id: meetingId, minutes_id: record.id, title: item.title.trim(), description: item.description?.trim() ?? '',
        assignee_user_id: item.assignee_user_id ?? null, due_at: item.due_at ? new Date(item.due_at) : null,
        priority: item.priority ?? 'MEDIUM', project_id: item.project_id ?? detail.request?.project_id ?? null,
      })) });
      await tx.request_meeting.update({ where: { id: meetingId }, data: { status: 'IN_MINUTES' } });
      return record;
    });
    // Audit: note that draft was saved WITHOUT sending any notification.
    // Participants receive no notification at this stage — notification is sent only on publish.
    await AuditService.logDeltaEvent({ entity: 'request_meeting_minutes', entityId: minutes.id, action: 'SAVE_MINUTES', before: {},
      after: { meeting_id: meetingId, occurrence_date: occurrenceDate, status: 'DRAFT', decision_count: decisions.length, action_item_count: actionItems.length }, userId, companyId,
      description: `Draft notulensi ${detail.request.request_number} (${occurrenceDate}) disimpan — belum dipublikasikan, notifikasi belum dikirim.`,
    });
    // NO notifications dispatched — return refreshed detail only.
    return this.getById(meetingId, companyId, userId, activeRole, occurrenceDate);
  }

  // ---------------------------------------------------------------------------
  // publishMinutes — PUBLISHED status + NOTIFICATION to all participants
  // ---------------------------------------------------------------------------
  static async publishMinutes(meetingId: string, companyId: string, userId: string, activeRole: string, occurrenceDate?: string) {
    const detail = await this.getById(meetingId, companyId, userId, activeRole, occurrenceDate);

    // Guard 1: a saved draft must exist
    if (!detail.minutes) {
      throw new ValidationError('Simpan draft notulensi terlebih dahulu sebelum dipublikasikan.');
    }
    // Guard 2: cannot republish an already-published occurrence
    if (detail.minutes.status === 'PUBLISHED') {
      throw new ValidationError('Notulensi pada tanggal ini sudah dipublikasikan sebelumnya.');
    }
    // Guard 3: at least summary or general discussion must be filled
    if (!detail.minutes.summary?.trim() && !detail.minutes.general_discussion?.trim()) {
      throw new ValidationError('Ringkasan atau catatan utama notulensi wajib diisi sebelum publikasi.');
    }
    // Guard 4: permission check
    if (!detail.permissions.can_edit_minutes) {
      throw new ForbiddenError(
        detail.recurrence_type === 'RECURRING'
          ? 'Hanya peserta yang tergabung dalam recurring meeting ini yang dapat mempublikasikan notulensi.'
          : 'Hanya notulis yang ditugaskan yang dapat mempublikasikan notulensi.',
      );
    }

    const now = new Date();

    // Persist atomically: mark DRAFT as PUBLISHED
    const dbUpdates: any[] = [
      prisma.request_meeting_minutes.update({
        where: { id: detail.minutes.id },
        data: { status: 'PUBLISHED', published_at: now, approved_by_id: userId },
      }),
    ];
    // Non-recurring only: closing this one-time meeting also closes the parent ticket
    if (detail.recurrence_type !== 'RECURRING') {
      dbUpdates.push(
        prisma.request_meeting.update({ where: { id: meetingId }, data: { status: 'COMPLETED' } }),
        prisma.request_ticket.update({ where: { id: detail.request_id }, data: { status: 'COMPLETED', completed_at: now } }),
      );
    }
    await prisma.$transaction(dbUpdates);

    // Audit
    await AuditService.logDeltaEvent({
      entity: 'request_meeting_minutes', entityId: detail.minutes.id, action: 'PUBLISH_MINUTES',
      before: { status: 'DRAFT' },
      after: { status: 'PUBLISHED', meeting_id: meetingId, occurrence_date: detail.selected_occurrence_date },
      userId, companyId,
      description: `Notulensi ${detail.request?.request_number ?? meetingId} (${detail.selected_occurrence_date}) dipublikasikan — notifikasi dikirim ke seluruh peserta.`,
    });

    // Fire-and-forget: notify organizer + notetaker + all participants (excluding publisher)
    // This is intentionally non-blocking; errors are logged but never thrown.
    if (detail.request) {
      void notifyMinutesPublished({
        meetingId,
        companyId,
        organizer_user_id: detail.organizer_user_id ?? null,
        notetaker_user_id: detail.notetaker_user_id ?? null,
        participants: detail.participants,
        requestNumber: detail.request.request_number,
        requestTitle: detail.request.title,
        occurrenceDate: detail.selected_occurrence_date,
        publisherUserId: userId,
      });
    }

    return this.getById(meetingId, companyId, userId, activeRole, detail.selected_occurrence_date);
  }

  static async submitDraftMeeting(meetingId: string, companyId: string, userId: string, activeRole: string) {
    const meeting = await prisma.request_meeting.findFirst({
      where: { id: meetingId, company_id: companyId },
    });
    if (!meeting) throw new NotFoundError('Meeting Request');

    const ticket = await prisma.request_ticket.findFirst({
      where: { id: meeting.request_id, company_id: companyId },
    });
    if (!ticket) throw new NotFoundError('Request Ticket');

    if (ticket.status !== 'DRAFT' && meeting.status !== 'DRAFT') {
      throw new ValidationError('Meeting ini sudah diposting / tidak berstatus draft.');
    }

    const isCreator = meeting.created_by_id === userId || ticket.created_by_id === userId || ticket.requester_user_id === userId;
    const isOrganizer = meeting.organizer_user_id === userId;
    const isExecutive = EXECUTIVE_ROLES.has(activeRole);

    if (!isCreator && !isOrganizer && !isExecutive) {
      throw new ForbiddenError('Hanya pembuat atau organizer meeting yang dapat mempublikasikan draft ini.');
    }

    const now = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.request_ticket.update({
        where: { id: ticket.id },
        data: {
          status: 'PENDING_OM',
          submitted_at: now,
        },
      });

      await tx.request_meeting.update({
        where: { id: meeting.id },
        data: {
          status: 'SCHEDULED',
        },
      });

      await tx.core_workflow_instance.updateMany({
        where: { id: ticket.workflow_instance_id ?? ticket.id, company_id: companyId },
        data: {
          status: 'IN_PROGRESS',
          current_state: 'PENDING_OM',
        },
      });
    });

    // Kirim notifikasi undangan meeting ke seluruh peserta kecuali yang mempublikasikan
    const participants = await prisma.request_meeting_participant.findMany({
      where: { meeting_id: meeting.id, company_id: companyId },
      select: { user_id: true },
    });

    void notifyMeetingPublished({
      meetingId: meeting.id,
      companyId,
      organizer_user_id: meeting.organizer_user_id ?? null,
      notetaker_user_id: meeting.notetaker_user_id ?? null,
      assignee_user_id: ticket.assignee_user_id ?? null,
      participants,
      requestNumber: ticket.request_number,
      requestTitle: ticket.title,
      startAt: meeting.start_at,
      timezone: meeting.timezone,
      publisherUserId: userId,
    });

    await AuditService.logDeltaEvent({
      entity: 'request_meeting',
      entityId: meeting.id,
      action: 'PUBLISH_DRAFT_MEETING',
      before: { status: 'DRAFT' },
      after: { status: 'SCHEDULED' },
      userId,
      companyId,
      description: `Draft meeting ${ticket.request_number} (${ticket.title}) dipublikasikan. Undangan dikirim ke seluruh peserta.`,
    });

    return this.getById(meeting.id, companyId, userId, activeRole);
  }
}
