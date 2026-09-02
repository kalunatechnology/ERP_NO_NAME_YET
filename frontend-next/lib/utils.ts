/**
 * cn() utility: menggabungkan clsx + tailwind-merge
 * Gunakan ini untuk class conditional di semua komponen
 */

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

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

export function formatRupiah(value: number | string | null | undefined): string {
  const num = Number(value || 0);
  return `Rp ${num.toLocaleString("id-ID")}`;
}

/* ── Format Number ─────────────────────────── */
export function formatNumber(value: number | string | null | undefined): string {
  return Number(value || 0).toLocaleString("id-ID");
}

/* ── Format Date ───────────────────────────── */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString("id-ID", {
    day: "numeric", month: "short", year: "numeric",
  });
}

/* ── Status color maps ─────────────────────── */
export const STATUS_COLORS: Record<string, string> = {
  DRAFT:       "bg-gray-100 text-gray-600",
  ACTIVE:      "bg-blue-100 text-blue-700",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  PENDING:     "bg-yellow-100 text-yellow-700",
  ON_HOLD:     "bg-orange-100 text-orange-700",
  DONE:        "bg-brand-light-green text-brand-deep-green",
  COMPLETED:   "bg-brand-light-green text-brand-deep-green",
  CLOSED:      "bg-brand-light-green text-brand-deep-green",
  BLOCKED:     "bg-red-100 text-red-700",
  CANCELLED:   "bg-red-100 text-red-600",
  APPROVED:    "bg-brand-light-green text-brand-green",
};

export function getStatusColor(status: string): string {
  return STATUS_COLORS[status?.toUpperCase()] ?? "bg-gray-100 text-gray-600";
}
