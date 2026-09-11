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
