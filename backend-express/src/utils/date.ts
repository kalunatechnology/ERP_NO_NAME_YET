import { format } from 'date-fns';

/**
 * Format a date to ISO 8601 string.
 */
export function formatDatetime(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString();
}

/**
 * Format a date to YYYY-MM-DD (ISO 8601 date only).
 */
export function formatDate(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  const d = typeof date === 'string' ? new Date(date) : date;
  return format(d, 'yyyy-MM-dd');
}

/**
 * Get current date in local timezone as YYYY-MM-DD string.
 */
export function localDate(): string {
  const now = new Date();
  return format(now, 'yyyy-MM-dd');
}

/**
 * Parse a date string (YYYY-MM-DD) into a Date object.
 */
export function parseDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}
