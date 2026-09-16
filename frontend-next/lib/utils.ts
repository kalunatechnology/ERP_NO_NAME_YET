/**
 * Purpose: Defines application infrastructure contracts and their integration boundary for the frontend application.
 * Responsibility: Documents and exposes only the behavior implemented in this file; function comments identify inputs, outputs, dependencies, and side effects.
 * cn() utility: menggabungkan clsx + tailwind-merge
 * Gunakan ini untuk class conditional di semua komponen
 */

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { getStatusStyle } from "@/lib/ui/semantic-styles";

/**
 * cn implements this file's named function contract.
 *
 * @param input - Uses the typed parameters declared by the signature.
 * @returns The value or Promise declared by the implementation.
 * Database: no direct Prisma operation is present in this function; persistence may be delegated to an imported service.
 * Failure/side effects: propagates validation, authorization, persistence, or dependency failures according to the existing caller contract.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* ── Format Rupiah (Full / Short) ──────────── */
export function formatMoney(value: number | string | null | undefined): string {
  const num = Number(value || 0);
  if (num >= 1_000_000_000) return `Rp ${(num / 1_000_000_000).toFixed(1)}M`;
  if (num >= 1_000_000) return `Rp ${(num / 1_000_000).toFixed(1)}jt`;
  if (num >= 1_000) return `Rp ${(num / 1_000).toFixed(0)}rb`;
  return `Rp ${num.toLocaleString("id-ID")}`;
}

/**
 * formatRupiah implements this file's named function contract.
 *
 * @param input - Uses the typed parameters declared by the signature.
 * @returns The value or Promise declared by the implementation.
 * Database: no direct Prisma operation is present in this function; persistence may be delegated to an imported service.
 * Failure/side effects: propagates validation, authorization, persistence, or dependency failures according to the existing caller contract.
 */
export function formatRupiah(value: number | string | null | undefined): string {
  const num = Number(value || 0);
  return `Rp ${num.toLocaleString("id-ID")}`;
}

/* ── Format Number ─────────────────────────── */
/**
 * formatNumber implements this file's named function contract.
 *
 * @param input - Uses the typed parameters declared by the signature.
 * @returns The value or Promise declared by the implementation.
 * Database: no direct Prisma operation is present in this function; persistence may be delegated to an imported service.
 * Failure/side effects: propagates validation, authorization, persistence, or dependency failures according to the existing caller contract.
 */
export function formatNumber(value: number | string | null | undefined): string {
  return Number(value || 0).toLocaleString("id-ID");
}

/* ── Format Date ───────────────────────────── */
/**
 * formatDate implements this file's named function contract.
 *
 * @param input - Uses the typed parameters declared by the signature.
 * @returns The value or Promise declared by the implementation.
 * Database: no direct Prisma operation is present in this function; persistence may be delegated to an imported service.
 * Failure/side effects: propagates validation, authorization, persistence, or dependency failures according to the existing caller contract.
 */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString("id-ID", {
    day: "numeric", month: "short", year: "numeric",
  });
}

/** Returns a YYYY-MM-DD calendar key in the browser's local timezone. */
export function localDateKey(value: Date = new Date()): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Normalizes API Date/DateTime values for calendar-day comparisons. Date-only
 * fields preserve their serialized YYYY-MM-DD prefix instead of being shifted
 * through UTC conversion.
 */
export function normalizeDateKey(value: string | Date | null | undefined): string {
  if (!value) return "";
  if (typeof value === "string") {
    const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : localDateKey(date);
}

/* ── Status color maps ─────────────────────── */
/**
 * getStatusColor implements this file's named function contract.
 *
 * @param input - Uses the typed parameters declared by the signature.
 * @returns The value or Promise declared by the implementation.
 * Database: no direct Prisma operation is present in this function; persistence may be delegated to an imported service.
 * Failure/side effects: propagates validation, authorization, persistence, or dependency failures according to the existing caller contract.
 */
export function getStatusColor(status: string): string {
  return getStatusStyle(status);
}

/**
 * Extracts a user-readable error message from an Axios error response.
 *
 * Backend (Express) sends human-readable errors in `detail` from `sendError()`,
 * while `error` contains technical codes (e.g. 'FORBIDDEN', 'VALIDATION_ERROR').
 * Therefore, `detail` is prioritized over `error` so users see actionable business messages.
 *
 * @returns A localized, user-friendly string describing the failure.
 */
export function extractApiError(err: unknown, fallback = "Terjadi kesalahan. Coba lagi."): string {
  if (!err) return fallback;
  const data = (err as any)?.response?.data;
  if (data) {
    // 1. DRF / Express { detail: "..." } - prioritized for clear business explanations
    if (typeof data.detail === "string" && data.detail.trim()) return data.detail.trim();
    // 2. Generic { message: "..." }
    if (typeof data.message === "string" && data.message.trim()) return data.message.trim();
    // 3. Validation errors array: { errors: [...] }
    if (Array.isArray(data.errors) && data.errors.length > 0) {
      const first = data.errors[0];
      if (typeof first === "string" && first.trim()) return first.trim();
      if (first && typeof first.message === "string" && first.message.trim()) return first.message.trim();
    }
    // 4. Backend { error: "..." } fallback (if detail is absent)
    if (typeof data.error === "string" && data.error.trim()) return data.error.trim();
    // 5. DRF validation errors: { non_field_errors: ["..."] }
    if (Array.isArray(data.non_field_errors) && data.non_field_errors.length > 0) {
      return data.non_field_errors.join(", ");
    }
    // 6. DRF field errors: { field_name: ["error"] }
    if (typeof data === "object") {
      const firstField = Object.keys(data).find(k => Array.isArray(data[k]) && k !== "errors");
      if (firstField) return `${firstField}: ${(data[firstField] as string[]).join(", ")}`;
    }
  }
  // Axios network error
  if ((err as any)?.message) return (err as any).message;
  return fallback;
}

/**
 * Parses user-supplied date (YYYY-MM-DD or DD/MM/YYYY) and optional time range
 * (e.g. "02.00 PM - 03.00 PM", "14:00", "09.00 AM") into a valid ISO timestamp string.
 * Accurately converts 12-hour AM/PM to 24-hour time to avoid saving wrong hours.
 */
export function parseFormDateTime(dateStr?: string, timeRangeStr?: string): string {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth(); // 0-indexed
  let day = now.getDate();

  if (dateStr && typeof dateStr === "string") {
    const s = dateStr.trim();
    const ymd = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (ymd) {
      year = parseInt(ymd[1], 10);
      month = parseInt(ymd[2], 10) - 1;
      day = parseInt(ymd[3], 10);
    } else if (dmy) {
      day = parseInt(dmy[1], 10);
      month = parseInt(dmy[2], 10) - 1;
      year = parseInt(dmy[3], 10);
    }
  }

  let hours = 9;
  let minutes = 0;

  if (timeRangeStr && typeof timeRangeStr === "string") {
    const startPart = timeRangeStr.split("-")[0].trim();
    const match = startPart.match(/^(\d{1,2})(?:[:.](\d{2}))?(?:\s*(AM|PM))?$/i);
    if (match) {
      let h = parseInt(match[1], 10);
      const m = match[2] ? parseInt(match[2], 10) : 0;
      const mer = match[3] ? match[3].toUpperCase() : null;

      if (mer === "PM" && h < 12) h += 12;
      else if (mer === "AM" && h === 12) h = 0;

      if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
        hours = h;
        minutes = m;
      }
    }
  }

  const d = new Date(year, month, day, hours, minutes, 0, 0);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}
