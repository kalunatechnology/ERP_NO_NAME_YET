import crypto from 'crypto';
import prisma from '../../config/database';
import { ForbiddenError, NotFoundError, ValidationError } from '../../utils/errors';
import { AuditService } from './audit.service';

export interface SaveMeetingMinutesPayload {
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

const MANAGER_ROLES = new Set([
  'SUPER_ADMIN', 'COMPANY_ADMIN', 'DIRECTOR', 'OPERATIONAL_MANAGER', 'PROJECT_MANAGER', 'SUPERVISOR',
  'ROLE-SUPER-ADMIN', 'ROLE-COMPANY-ADMIN', 'ROLE-DIRECTOR', 'ROLE-OM', 'ROLE-PM', 'ROLE-SUPERVISOR',
]);

export class MeetingRequestService {
  static async list(companyId: string, userId: string, activeRole: string, query: { status?: string; search?: string }) {
    const unrestricted = MANAGER_ROLES.has(activeRole);
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

  static async getById(meetingId: string, companyId: string, userId: string, activeRole: string) {
    const meeting = await prisma.request_meeting.findFirst({ where: { id: meetingId, company_id: companyId } });
    if (!meeting) throw new NotFoundError('Meeting Request');
    const participant = await prisma.request_meeting_participant.findFirst({
      where: { meeting_id: meetingId, company_id: companyId, user_id: userId }, select: { id: true },
    });
    if (!MANAGER_ROLES.has(activeRole) && meeting.organizer_user_id !== userId && meeting.notetaker_user_id !== userId && !participant) {
      throw new ForbiddenError('Anda tidak terlibat dalam meeting ini.');
    }
    const [request, participants, agenda, minutes] = await Promise.all([
      prisma.request_ticket.findFirst({ where: { id: meeting.request_id, company_id: companyId } }),
      prisma.request_meeting_participant.findMany({ where: { meeting_id: meetingId, company_id: companyId }, orderBy: { created_at: 'asc' } }),
      prisma.request_meeting_agenda.findMany({ where: { meeting_id: meetingId, company_id: companyId }, orderBy: { sequence_number: 'asc' } }),
      prisma.request_meeting_minutes.findFirst({ where: { meeting_id: meetingId, company_id: companyId }, orderBy: { version_number: 'desc' } }),
    ]);
    const userIds = Array.from(new Set(participants.map((item) => item.user_id).filter((id): id is string => Boolean(id))));
    const users = userIds.length ? await prisma.iam_user.findMany({
      where: { id: { in: userIds } }, select: { id: true, full_name: true, email: true },
    }) : [];
    const userById = new Map(users.map((item) => [item.id, item]));
    const [decisions, actionItems] = minutes ? await Promise.all([
      prisma.request_meeting_decision.findMany({ where: { minutes_id: minutes.id, company_id: companyId }, orderBy: { decision_number: 'asc' } }),
      prisma.request_meeting_action_item.findMany({ where: { minutes_id: minutes.id, company_id: companyId }, orderBy: { created_at: 'asc' } }),
    ]) : [[], []];
    return {
      ...meeting, request,
      participants: participants.map((item) => ({ ...item, user: item.user_id ? userById.get(item.user_id) ?? null : null })),
      agenda,
      minutes: minutes ? { ...minutes, decisions, action_items: actionItems } : null,
    };
  }

  static async saveMinutes(meetingId: string, payload: SaveMeetingMinutesPayload, companyId: string, userId: string, activeRole: string) {
    const detail = await this.getById(meetingId, companyId, userId, activeRole);
    if (!detail.request) throw new NotFoundError('Request');
    if (!MANAGER_ROLES.has(activeRole) && detail.organizer_user_id !== userId && detail.notetaker_user_id !== userId) {
      throw new ForbiddenError('Hanya organizer, notulis, atau pengelola yang dapat menyusun notulensi.');
    }
    if (detail.minutes?.status === 'PUBLISHED') throw new ValidationError('Notulensi sudah dipublikasikan dan tidak dapat ditimpa.');
    const decisions = (payload.decisions ?? []).filter((item) => item.text?.trim());
    const actionItems = (payload.action_items ?? []).filter((item) => item.title?.trim());
    const nextMeetingAt = payload.next_meeting_at ? new Date(payload.next_meeting_at) : null;
    if (nextMeetingAt && Number.isNaN(nextMeetingAt.getTime())) throw new ValidationError('Jadwal meeting berikutnya tidak valid.');

    const minutes = await prisma.$transaction(async (tx) => {
      const record = detail.minutes
        ? await tx.request_meeting_minutes.update({ where: { id: detail.minutes.id }, data: {
            summary: payload.summary?.trim() ?? '', opening_notes: payload.opening_notes?.trim() ?? '',
            general_discussion: payload.general_discussion?.trim() ?? '', conclusion: payload.conclusion?.trim() ?? '',
            next_meeting_at: nextMeetingAt,
          } })
        : await tx.request_meeting_minutes.create({ data: {
            id: crypto.randomUUID(), tenant_id: detail.tenant_id, company_id: companyId, created_by_id: userId,
            meeting_id: meetingId, prepared_by_id: userId, summary: payload.summary?.trim() ?? '',
            opening_notes: payload.opening_notes?.trim() ?? '', general_discussion: payload.general_discussion?.trim() ?? '',
            conclusion: payload.conclusion?.trim() ?? '', next_meeting_at: nextMeetingAt,
          } });
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
      after: { meeting_id: meetingId, decision_count: decisions.length, action_item_count: actionItems.length }, userId, companyId,
      description: `Draft notulensi ${detail.request.request_number} disimpan.`,
    });
    return this.getById(meetingId, companyId, userId, activeRole);
  }

  static async publishMinutes(meetingId: string, companyId: string, userId: string, activeRole: string) {
    const detail = await this.getById(meetingId, companyId, userId, activeRole);
    if (!detail.minutes) throw new ValidationError('Simpan draft notulensi sebelum dipublikasikan.');
    if (!detail.minutes.summary.trim() && !detail.minutes.general_discussion.trim()) {
      throw new ValidationError('Ringkasan atau pembahasan notulensi wajib diisi sebelum publikasi.');
    }
    if (!MANAGER_ROLES.has(activeRole) && detail.organizer_user_id !== userId && detail.notetaker_user_id !== userId) {
      throw new ForbiddenError('Anda tidak memiliki akses untuk mempublikasikan notulensi.');
    }
    const now = new Date();
    await prisma.$transaction([
      prisma.request_meeting_minutes.update({ where: { id: detail.minutes.id }, data: { status: 'PUBLISHED', published_at: now, approved_by_id: userId } }),
      prisma.request_meeting.update({ where: { id: meetingId }, data: { status: 'COMPLETED' } }),
      prisma.request_ticket.update({ where: { id: detail.request_id }, data: { status: 'COMPLETED', completed_at: now } }),
    ]);
    await AuditService.logDeltaEvent({ entity: 'request_meeting_minutes', entityId: detail.minutes.id, action: 'PUBLISH_MINUTES',
      before: { status: detail.minutes.status }, after: { status: 'PUBLISHED', meeting_id: meetingId }, userId, companyId,
      description: `Notulensi ${detail.request?.request_number ?? meetingId} dipublikasikan.`,
    });
    return this.getById(meetingId, companyId, userId, activeRole);
  }
}
