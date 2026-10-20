import { ValidationError } from '../../utils/errors';

export interface WeeklyWorkPeriod {
  id: string;
  month: string;
  week: number;
  start: string;
  end: string;
  filter_start: string;
  filter_end: string;
}

function dateKey(date: Date): string { return date.toISOString().slice(0, 10); }

function parseDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ValidationError('Tanggal filter Weekly tidak valid.');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || dateKey(date) !== value) throw new ValidationError('Tanggal filter Weekly tidak valid.');
  return date;
}

/** Each Monday owns one complete Mon–Fri period, including a Friday in the next month. */
export function weeklyWorkPeriods(month: string): WeeklyWorkPeriod[] {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || Number(month.slice(0, 4)) < 1) {
    throw new ValidationError('Bulan filter Weekly harus berupa YYYY-MM.');
  }
  const monday = parseDate(`${month}-01`);
  monday.setUTCDate(1 + (8 - monday.getUTCDay()) % 7);
  const periods: WeeklyWorkPeriod[] = [];
  while (dateKey(monday).slice(0, 7) === month) {
    const friday = new Date(monday);
    friday.setUTCDate(friday.getUTCDate() + 4);
    const week = periods.length + 1;
    const filterStart = new Date(monday);
    filterStart.setUTCDate(filterStart.getUTCDate() - 3);
    const filterEnd = new Date(friday);
    periods.push({ id: `${month}:W${week}`, month, week, start: dateKey(monday), end: dateKey(friday),
      filter_start: `${dateKey(filterStart)}T15:00:00+07:00`,
      filter_end: `${dateKey(filterEnd)}T15:00:00+07:00` });
    monday.setUTCDate(monday.getUTCDate() + 7);
  }
  return periods;
}

/** Early-month days belong to the preceding Monday's month; weekends retain that workweek. */
export function weeklyWorkPeriodForDate(value: string): WeeklyWorkPeriod {
  const monday = parseDate(value);
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  const key = dateKey(monday);
  return weeklyWorkPeriods(key.slice(0, 7)).find(period => period.start === key)!;
}

/** Automatically maps creation timestamp to its execution period (shifted to next week if >= Friday 15:00 WIB). */
export function weeklyWorkPeriodForTimestamp(createdAt: Date | string | number = new Date()): WeeklyWorkPeriod {
  const date = new Date(createdAt);
  if (!Number.isFinite(date.getTime())) {
    throw new ValidationError('Waktu pembuatan Weekly Target tidak valid.');
  }
  const wibMs = date.getTime() + 7 * 3600 * 1000;
  const wibDate = new Date(wibMs);
  const day = wibDate.getUTCDay();
  const hours = wibDate.getUTCHours();

  let daysToMonday = 0;
  if (day === 5 && hours >= 15) {
    daysToMonday = 3;
  } else if (day === 6) {
    daysToMonday = 2;
  } else if (day === 0) {
    daysToMonday = 1;
  } else {
    daysToMonday = -(day - 1);
  }

  const mondayMs = wibMs + daysToMonday * 86400 * 1000;
  const mondayKey = new Date(mondayMs).toISOString().slice(0, 10);
  return weeklyWorkPeriodForDate(mondayKey);
}

export function selectedWeeklyWorkPeriod(month: string, week: unknown): WeeklyWorkPeriod {
  if (typeof week !== 'string' && typeof week !== 'number') throw new ValidationError('Nomor Weekly filter tidak valid.');
  const period = weeklyWorkPeriods(month).find(item => String(item.week) === String(week));
  if (!period) throw new ValidationError('Nomor Weekly tidak tersedia pada bulan yang dipilih.');
  return period;
}

export function weeklyPeriodCalendar(month: unknown, today: unknown) {
  if (today !== undefined && typeof today !== 'string') throw new ValidationError('Tanggal filter Weekly tidak valid.');
  const current = weeklyWorkPeriodForDate(typeof today === 'string' ? today : jakartaToday());
  if (month !== undefined && typeof month !== 'string') throw new ValidationError('Bulan filter Weekly tidak valid.');
  const selectedMonth = month === undefined ? current.month : month;
  return { month: selectedMonth, current, periods: weeklyWorkPeriods(selectedMonth) };
}

function jakartaToday(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = (type: string) => parts.find(item => item.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Filter Weekly targets by creation timestamp only; schedule dates and completion dates do not affect calendar membership. */
export function weeklyPeriodWhere(month: unknown, week: unknown): Record<string, unknown> {
  if (month === undefined && week === undefined) return {};
  if (typeof month !== 'string') throw new ValidationError('Bulan filter Weekly wajib diisi.');
  const periods = weeklyWorkPeriods(month);
  const period = week === undefined ? null : selectedWeeklyWorkPeriod(month, week);
  const start = period?.filter_start ?? periods[0].filter_start;
  const end = period?.filter_end ?? periods[periods.length - 1].filter_end;
  return { created_at: { gte: new Date(start), lt: new Date(end) } };
}
