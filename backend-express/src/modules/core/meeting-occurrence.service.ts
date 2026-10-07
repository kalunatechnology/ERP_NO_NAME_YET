import { ValidationError } from '../../utils/errors';

export const DEFAULT_RECURRING_DAYS = [1, 2, 3, 4, 5] as const;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export type MeetingSchedule = {
  recurrence_type: string;
  recurrence_end_at: Date | null;
  recurrence_days: number[];
  start_at: Date;
  timezone: string;
};

export function dateKeyInTimeZone(value: Date, timeZone: string): string {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(value);
  } catch {
    throw new ValidationError('Timezone meeting tidak valid.');
  }
  const valueOf = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  return `${valueOf('year')}-${valueOf('month')}-${valueOf('day')}`;
}

function dateFromKey(value: string): Date {
  if (!DATE_KEY.test(value)) throw new ValidationError('Tanggal notulensi harus menggunakan format YYYY-MM-DD.');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new ValidationError('Tanggal notulensi tidak valid.');
  }
  return date;
}

export function normalizeRecurringDays(days?: number[] | null): number[] {
  const normalized = Array.from(new Set(days?.length ? days : DEFAULT_RECURRING_DAYS)).sort((a, b) => a - b);
  if (!normalized.length || normalized.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    throw new ValidationError('Hari recurring harus berada di antara Minggu (0) dan Sabtu (6).');
  }
  return normalized;
}

export function meetingOccurrenceDates(meeting: MeetingSchedule): string[] {
  const startKey = dateKeyInTimeZone(meeting.start_at, meeting.timezone);
  if (meeting.recurrence_type !== 'RECURRING') return [startKey];

  const todayKey = dateKeyInTimeZone(new Date(), meeting.timezone);
  let endKey: string;
  if (meeting.recurrence_end_at) {
    const rawEndKey = dateKeyInTimeZone(meeting.recurrence_end_at, meeting.timezone);
    // An explicit end date closes the series, regardless of today's date.
    endKey = rawEndKey;
  } else {
    // Jika tidak ada recurrence_end_at, defaultkan hingga hari ini atau 30 hari ke depan
    const startDate = dateFromKey(startKey);
    const thirtyDaysLater = new Date(startDate.getTime() + 30 * 86_400_000);
    const defaultEndKey = dateKeyInTimeZone(thirtyDaysLater, meeting.timezone);
    endKey = defaultEndKey < todayKey ? todayKey : defaultEndKey;
  }

  const start = dateFromKey(startKey);
  const end = dateFromKey(endKey);
  const span = Math.floor((end.getTime() - start.getTime()) / 86_400_000);
  if (span < 0) return [startKey];
  const boundedSpan = Math.min(span, 3660);
  const allowed = new Set(normalizeRecurringDays(meeting.recurrence_days));
  const dates: string[] = [];
  for (let offset = 0; offset <= boundedSpan; offset += 1) {
    const date = new Date(start.getTime() + offset * 86_400_000);
    if (allowed.has(date.getUTCDay())) dates.push(date.toISOString().slice(0, 10));
  }
  return dates.length ? dates : [startKey];
}

export function resolveMeetingOccurrenceDate(meeting: MeetingSchedule, requested?: string | null): string {
  const occurrences = meetingOccurrenceDates(meeting);
  if (requested) {
    dateFromKey(requested);
    if (!occurrences.includes(requested)) throw new ValidationError('Tanggal tersebut bukan occurrence meeting ini.');
    return requested;
  }
  const today = dateKeyInTimeZone(new Date(), meeting.timezone);
  return [...occurrences].reverse().find((date) => date <= today) ?? occurrences[0];
}

export function occurrenceDateForDatabase(value: string): Date {
  return dateFromKey(value);
}
