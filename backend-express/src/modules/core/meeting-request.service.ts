import crypto from 'crypto';
import prisma from '../../config/database';
import { ForbiddenError, NotFoundError, ValidationError } from '../../utils/errors';
import { AuditService } from './audit.service';
import { meetingOccurrenceDates, occurrenceDateForDatabase, resolveMeetingOccurrenceDate } from './meeting-occurrence.service';

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

// Only true executives may view all meetings regardless of participation.
// Every other role (PM, OM, Supervisor, Staff, etc.) is restricted to meetings
// they are directly involved in (organizer, notetaker, or participant).
const EXECUTIVE_ROLES = new Set([
  'SUPER_ADMIN', 'COMPANY_ADMIN', 'DIRECTOR',
  'ROLE-SUPER-ADMIN', 'ROLE-COMPANY-ADMIN', 'ROLE-DIRECTOR',
]);

export class MeetingRequestService {
  static async list(companyId: string, userId: string, activeRole: string, query: { status?: string; search?: string }) {
    const unrestricted = EXECUTIVE_ROLES.has(activeRole);
    const participantRows = unrestricted ? [] : await prisma.request_meeting_participant.findMany({
      where: { company_id: companyId, user_id: userId }, select: { meeting_id: true },
    });
    const accessibleMeetingIds = participantRows.map((row) => row.meeting_id);
    const meetings = await prisma.request_meeting.findMany({
      where: {
        company_id: companyId,
        ...(query.status ? { status: query.status } : {}),
        ...(unrestricted ? {} : { OR: [
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
    if (!EXECUTIVE_ROLES.has(activeRole) && meeting.organizer_user_id !== userId && meeting.notetaker_user_id !== userId && !participant) {
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
    const selectedOccurrenceDate = resolveMeetingOccurrenceDate(meeting, occurrenceDate);
    const minutes = allMinutes.find((item) => item.occurrence_date.toISOString().slice(0, 10) === selectedOccurrenceDate) ?? null;
    const minutesByDate = new Map(allMinutes.map((item) => [item.occurrence_date.toISOString().slice(0, 10), item]));
    const notes = [...occurrences].reverse().map((date) => {
      const note = minutesByDate.get(date);
      return {
        occurrence_date: date,
        minutes_id: note?.id ?? null,
        status: !note ? 'NOT_CREATED' : note.status === 'PUBLISHED' ? 'COMPLETED' : 'DRAFT',
      };
    });
    const [decisions, actionItems] = minutes ? await Promise.all([
      prisma.request_meeting_decision.findMany({ where: { minutes_id: minutes.id, company_id: companyId }, orderBy: { decision_number: 'asc' } }),
      prisma.request_meeting_action_item.findMany({ where: { minutes_id: minutes.id, company_id: companyId }, orderBy: { created_at: 'asc' } }),
    ]) : [[], []];
    return {
      ...meeting, request,
      participants: participants.map((item) => ({ ...item, user: item.user_id ? userById.get(item.user_id) ?? null : null })),
      notetaker: meeting.notetaker_user_id ? userById.get(meeting.notetaker_user_id) ?? null : null,
      permissions: { can_edit_minutes: meeting.notetaker_user_id === userId },
      agenda,
      selected_occurrence_date: selectedOccurrenceDate,
      notes,
      minutes: minutes ? { ...minutes, decisions, action_items: actionItems } : null,
    };
  }

  static async saveMinutes(meetingId: string, payload: SaveMeetingMinutesPayload, companyId: string, userId: string, activeRole: string) {
    const detail = await this.getById(meetingId, companyId, userId, activeRole, payload.occurrence_date);
    if (!detail.request) throw new NotFoundError('Request');
    if (detail.notetaker_user_id !== userId) {
      throw new ForbiddenError('Hanya notulis yang ditugaskan yang dapat menyusun notulensi.');
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
    await AuditService.logDeltaEvent({ entity: 'request_meeting_minutes', entityId: minutes.id, action: 'SAVE_MINUTES', before: {},
      after: { meeting_id: meetingId, occurrence_date: occurrenceDate, decision_count: decisions.length, action_item_count: actionItems.length }, userId, companyId,
      description: `Draft notulensi ${detail.request.request_number} disimpan.`,
    });
    return this.getById(meetingId, companyId, userId, activeRole, occurrenceDate);
  }

  static async publishMinutes(meetingId: string, companyId: string, userId: string, activeRole: string, occurrenceDate?: string) {
    const detail = await this.getById(meetingId, companyId, userId, activeRole, occurrenceDate);
    if (!detail.minutes) throw new ValidationError('Simpan draft notulensi sebelum dipublikasikan.');
    if (!detail.minutes.summary.trim() && !detail.minutes.general_discussion.trim()) {
      throw new ValidationError('Ringkasan atau pembahasan notulensi wajib diisi sebelum publikasi.');
    }
    if (detail.notetaker_user_id !== userId) {
      throw new ForbiddenError('Hanya notulis yang ditugaskan yang dapat mempublikasikan notulensi.');
    }
    const now = new Date();
    const updates: any[] = [
      prisma.request_meeting_minutes.update({ where: { id: detail.minutes.id }, data: { status: 'PUBLISHED', published_at: now, approved_by_id: userId } }),
    ];
    if (detail.recurrence_type !== 'RECURRING') {
      updates.push(
        prisma.request_meeting.update({ where: { id: meetingId }, data: { status: 'COMPLETED' } }),
        prisma.request_ticket.update({ where: { id: detail.request_id }, data: { status: 'COMPLETED', completed_at: now } }),
      );
    }
    await prisma.$transaction(updates);
    await AuditService.logDeltaEvent({ entity: 'request_meeting_minutes', entityId: detail.minutes.id, action: 'PUBLISH_MINUTES',
      before: { status: detail.minutes.status }, after: { status: 'PUBLISHED', meeting_id: meetingId, occurrence_date: detail.selected_occurrence_date }, userId, companyId,
      description: `Notulensi ${detail.request?.request_number ?? meetingId} dipublikasikan.`,
    });
    return this.getById(meetingId, companyId, userId, activeRole, detail.selected_occurrence_date);
  }
}
