import assert from 'node:assert/strict';
import prisma from '../src/config/database';
import { AuditService } from '../src/modules/core/audit.service';
import { MeetingRequestService } from '../src/modules/core/meeting-request.service';
import { meetingOccurrenceDates, resolveMeetingOccurrenceDate } from '../src/modules/core/meeting-occurrence.service';
import { RequestService } from '../src/modules/core/request.service';

async function main() {
  const schedule = {
    recurrence_type: 'RECURRING', timezone: 'Asia/Jakarta', recurrence_days: [1, 2, 3, 4, 5],
    start_at: new Date('2026-09-27T17:00:00.000Z'), recurrence_end_at: new Date('2026-10-04T16:59:00.000Z'),
  };
  assert.deepEqual(meetingOccurrenceDates(schedule), ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
  assert.deepEqual(meetingOccurrenceDates({ ...schedule, recurrence_days: [0, 6] }), ['2026-10-03', '2026-10-04']);
  assert.deepEqual(meetingOccurrenceDates({ ...schedule, recurrence_type: 'NON_RECURRING' }), ['2026-09-28']);
  assert.throws(() => resolveMeetingOccurrenceDate(schedule, '2026-10-03'), /bukan occurrence/);
  assert.throws(() => resolveMeetingOccurrenceDate(schedule, '2026-10-05'), /bukan occurrence/, 'An ended series must not accept a later weekday');
  assert.deepEqual(meetingOccurrenceDates({ ...schedule, start_at: new Date('2020-01-05T17:00:00Z'), recurrence_end_at: new Date('2020-01-10T16:59:00Z') }),
    ['2020-01-06', '2020-01-07', '2020-01-08', '2020-01-09', '2020-01-10'], 'Past series must stay bounded independently of the current date');
  assert.throws(() => meetingOccurrenceDates({ ...schedule, timezone: 'Invalid/Timezone' }), /Timezone/);

  const meeting: any = {
    id: 'meeting', tenant_id: 'tenant', company_id: 'company', request_id: 'request', created_by_id: 'organizer',
    organizer_user_id: 'organizer', notetaker_user_id: 'notetaker', meeting_type: 'INTERNAL', ...schedule,
    end_at: new Date('2026-09-28T03:00:00.000Z'), location: null, meeting_url: null, agenda_summary: null,
    requires_minutes: true, minutes_due_at: null, status: 'SCHEDULED', created_at: new Date(), updated_at: new Date(),
  };
  const ticket = { id: 'request', request_number: 'REQ-1', title: 'Daily Project Meeting', description: '', project_id: null };
  const notes: any[] = [];
  const decisions: any[] = [];
  const actions: any[] = [];
  let meetingUpdateCount = 0;
  let ticketUpdateCount = 0;
  const createdMeetings: any[] = [];
  const occurrenceKey = (value: Date) => value.toISOString().slice(0, 10);

  const tx: any = {
    core_workflow_instance: { create: async ({ data }: any) => data },
    request_ticket: { create: async ({ data }: any) => data },
    request_meeting_minutes: {
      upsert: async ({ where, update, create }: any) => {
        const date = occurrenceKey(where.meeting_id_occurrence_date.occurrence_date);
        const existing = notes.find((item) => occurrenceKey(item.occurrence_date) === date);
        if (existing) return Object.assign(existing, update, { updated_at: new Date() });
        const row = { ...create, status: 'DRAFT', version_number: 1, prepared_at: new Date(), published_at: null, created_at: new Date(), updated_at: new Date() };
        notes.push(row); return row;
      },
      update: async ({ where, data }: any) => Object.assign(notes.find((item) => item.id === where.id), data),
    },
    request_meeting_decision: {
      deleteMany: async ({ where }: any) => { for (let index = decisions.length - 1; index >= 0; index -= 1) if (decisions[index].minutes_id === where.minutes_id) decisions.splice(index, 1); },
      createMany: async ({ data }: any) => { decisions.push(...data); },
    },
    request_meeting_action_item: {
      deleteMany: async ({ where }: any) => { for (let index = actions.length - 1; index >= 0; index -= 1) if (actions[index].minutes_id === where.minutes_id) actions.splice(index, 1); },
      createMany: async ({ data }: any) => { actions.push(...data); },
    },
    request_meeting: {
      create: async ({ data }: any) => { createdMeetings.push(data); return data; },
      update: async () => { meetingUpdateCount += 1; return meeting; },
    },
    request_meeting_participant: { createMany: async ({ data }: any) => ({ count: data.length }) },
    request_meeting_agenda: { createMany: async ({ data }: any) => ({ count: data.length }) },
  };
  const patches: Array<() => void> = [];
  const patch = (target: any, key: string, replacement: any) => { const old = target[key]; target[key] = replacement; patches.push(() => { target[key] = old; }); };
  patch(prisma.request_meeting, 'findFirst', async () => meeting);
  patch(prisma.request_meeting, 'update', tx.request_meeting.update);
  patch(prisma.request_meeting_participant, 'findFirst', async ({ where }: any) => ['notetaker', 'attendee'].includes(where.user_id) ? { id: 'participant' } : null);
  patch(prisma.request_meeting_participant, 'findMany', async () => [
    { id: 'participant', meeting_id: 'meeting', company_id: 'company', user_id: 'notetaker', participant_role: 'NOTETAKER' },
    { id: 'attendee-participant', meeting_id: 'meeting', company_id: 'company', user_id: 'attendee', participant_role: 'ATTENDEE' },
  ]);
  patch(prisma.request_ticket, 'findFirst', async () => ticket);
  patch(prisma.request_ticket, 'update', async () => { ticketUpdateCount += 1; return ticket; });
  patch(prisma.request_meeting_agenda, 'findMany', async () => []);
  patch(prisma.request_meeting_minutes, 'findMany', async () => [...notes].sort((a, b) => occurrenceKey(b.occurrence_date).localeCompare(occurrenceKey(a.occurrence_date))));
  patch(prisma.request_meeting_minutes, 'update', tx.request_meeting_minutes.update);
  patch(prisma.request_meeting_decision, 'findMany', async ({ where }: any) => decisions.filter((item) => item.minutes_id === where.minutes_id));
  patch(prisma.request_meeting_action_item, 'findMany', async ({ where }: any) => actions.filter((item) => item.minutes_id === where.minutes_id));
  patch(prisma.iam_user, 'findMany', async () => [
    { id: 'notetaker', full_name: 'Notulis', email: 'note@example.test' },
    { id: 'attendee', full_name: 'Peserta', email: 'attendee@example.test' },
  ]);
  patch(prisma as any, '$transaction', async (input: any) => Array.isArray(input) ? Promise.all(input) : input(tx));
  patch(AuditService as any, 'logDeltaEvent', async () => undefined);
  try {
    await RequestService.createRequest({ request_type: 'MEETING', title: 'Recurring', is_draft: true,
      start_at: '2026-09-28T02:00:00.000Z', end_at: '2026-09-28T03:00:00.000Z', recurrence_type: 'RECURRING',
      recurrence_end_at: '2026-10-02T16:59:00.000Z', notetaker_user_id: 'notetaker' }, 'organizer', 'company', 'tenant');
    assert.equal(createdMeetings[0].recurrence_type, 'RECURRING');
    assert.deepEqual(createdMeetings[0].recurrence_days, [1, 2, 3, 4, 5]);
    assert.equal(notes.length, 0, 'creating a series must not create daily note rows');
    await RequestService.createRequest({ request_type: 'MEETING', title: 'One time', is_draft: true,
      start_at: '2026-09-28T02:00:00.000Z', end_at: '2026-09-28T03:00:00.000Z', notetaker_user_id: 'notetaker' }, 'organizer', 'company', 'tenant');
    assert.equal(createdMeetings[1].recurrence_type, 'NON_RECURRING');
    assert.equal(createdMeetings[1].recurrence_end_at, null);

    const initial = await MeetingRequestService.getById('meeting', 'company', 'notetaker', 'ROLE-STAFF', '2026-09-28');
    assert.equal(initial.notes.length, 5);
    assert(initial.notes.every((item) => item.status === 'NOT_CREATED'));
    assert.equal(notes.length, 0, 'view/refresh must not materialize empty notes');

    const first = await MeetingRequestService.saveMinutes('meeting', { occurrence_date: '2026-09-28', summary: 'Draft 1', decisions: [{ text: 'A' }] }, 'company', 'notetaker', 'ROLE-STAFF');
    assert.equal(first.minutes?.summary, 'Draft 1');
    const firstId = first.minutes?.id;
    await MeetingRequestService.saveMinutes('meeting', { occurrence_date: '2026-09-28', summary: 'Edited', decisions: [{ text: 'B' }] }, 'company', 'notetaker', 'ROLE-STAFF');
    assert.equal(notes.length, 1, 'refresh/repeated save must use the same daily note');
    assert.equal(notes[0].id, firstId);
    assert.equal(notes[0].summary, 'Edited');

    const second = await MeetingRequestService.saveMinutes('meeting', { occurrence_date: '2026-09-29', summary: 'Day 2' }, 'company', 'notetaker', 'ROLE-STAFF');
    assert.equal(notes.length, 2);
    assert.equal(second.selected_occurrence_date, '2026-09-29');
    assert.equal(second.minutes?.summary, 'Day 2');
    const switched = await MeetingRequestService.getById('meeting', 'company', 'notetaker', 'ROLE-STAFF', '2026-09-28');
    assert.equal(switched.minutes?.summary, 'Edited', 'notes from different dates must not mix');

    const completed = await MeetingRequestService.publishMinutes('meeting', 'company', 'notetaker', 'ROLE-STAFF', '2026-09-29');
    assert.equal(completed.notes.find((item) => item.occurrence_date === '2026-09-29')?.status, 'COMPLETED');
    assert.equal(meetingUpdateCount, 3, 'daily draft saves may mark the series in progress');
    assert.equal(ticketUpdateCount, 0, 'publishing one recurring occurrence must not complete the series ticket');
    await assert.rejects(() => MeetingRequestService.saveMinutes('meeting', { occurrence_date: '2026-09-29', summary: 'Overwrite' }, 'company', 'notetaker', 'ROLE-STAFF'), /sudah dipublikasikan/);
    await assert.rejects(() => MeetingRequestService.saveMinutes('meeting', { occurrence_date: '2026-10-03', summary: 'Weekend' }, 'company', 'notetaker', 'ROLE-STAFF'), /bukan occurrence/);
    await assert.rejects(() => MeetingRequestService.saveMinutes('meeting', { occurrence_date: '2026-09-30', summary: 'No access' }, 'company', 'other', 'ROLE-STAFF'), /tidak terlibat/);
    const attendeeView = await MeetingRequestService.getById('meeting', 'company', 'attendee', 'ROLE-STAFF', '2026-09-30');
    assert.equal(attendeeView.permissions.can_edit_minutes, true, 'in recurring meeting, participants can edit minutes');
    const attendeeSave = await MeetingRequestService.saveMinutes('meeting', { occurrence_date: '2026-09-30', summary: 'Attendee edit' }, 'company', 'attendee', 'ROLE-STAFF');
    assert.equal(attendeeSave.minutes?.summary, 'Attendee edit');

    meeting.recurrence_type = 'NON_RECURRING';
    meeting.recurrence_end_at = null;
    const attendeeOneTime = await MeetingRequestService.getById('meeting', 'company', 'attendee', 'ROLE-STAFF', '2026-09-28');
    assert.equal(attendeeOneTime.permissions.can_edit_minutes, false, 'in non-recurring meeting, only assigned notetaker can edit');
    await assert.rejects(() => MeetingRequestService.saveMinutes('meeting', { occurrence_date: '2026-09-28', summary: 'Attendee edit' }, 'company', 'attendee', 'ROLE-STAFF'), /Hanya notulis/);

    notes.splice(0);
    await MeetingRequestService.saveMinutes('meeting', { occurrence_date: '2026-09-28', summary: 'One-time note' }, 'company', 'notetaker', 'ROLE-STAFF');
    const oneTime = await MeetingRequestService.publishMinutes('meeting', 'company', 'notetaker', 'ROLE-STAFF', '2026-09-28');
    assert.equal(oneTime.notes.length, 1);
    assert.equal(oneTime.notes[0].status, 'COMPLETED');
    assert.equal(meetingUpdateCount, 6, 'one-time publish completes its meeting after the draft save');
    assert.equal(ticketUpdateCount, 1, 'one-time publish completes its request ticket');
    console.log('Recurring meeting passed: weekday defaults, explicit weekend config, lazy notes, create/view/edit, refresh idempotency, date isolation, completion and permission checks.');
  } finally {
    patches.reverse().forEach((restore) => restore());
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
