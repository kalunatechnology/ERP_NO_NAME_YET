/** Canonical presentation contract for business statuses and categories. */
const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700 border-gray-200",
  PENDING: "bg-amber-50 text-amber-800 border-amber-200",
  PENDING_EXEC: "bg-amber-50 text-amber-800 border-amber-200",
  PENDING_LPJ_VERIFICATION: "bg-amber-50 text-amber-800 border-amber-200",
  ON_HOLD: "bg-amber-50 text-amber-800 border-amber-200",
  WARNING: "bg-amber-50 text-amber-800 border-amber-200",
  RE_CHECKING: "bg-amber-50 text-amber-800 border-amber-200",
  LPJ_REVISION: "bg-amber-50 text-amber-800 border-amber-200",
  BLOCKED: "bg-red-50 text-red-700 border-red-200",
  CANCELLED: "bg-red-50 text-red-700 border-red-200",
  REJECTED: "bg-red-50 text-red-700 border-red-200",
  CRITICAL: "bg-red-50 text-red-700 border-red-200",
  ACTIVE: "bg-brand-light-green text-brand-deep-green border-brand-primary-soft",
  IN_PROGRESS: "bg-brand-light-green text-brand-deep-green border-brand-primary-soft",
  ON_PROGRESS: "bg-brand-light-green text-brand-deep-green border-brand-primary-soft",
  DONE: "bg-brand-light-green text-brand-deep-green border-brand-primary-soft",
  COMPLETED: "bg-brand-light-green text-brand-deep-green border-brand-primary-soft",
  CLOSED: "bg-brand-light-green text-brand-deep-green border-brand-primary-soft",
  APPROVED: "bg-brand-light-green text-brand-deep-green border-brand-primary-soft",
  REGISTERED: "bg-brand-light-green text-brand-deep-green border-brand-primary-soft",
  DISBURSED: "bg-brand-light-green text-brand-deep-green border-brand-primary-soft",
  POSTED: "bg-brand-light-green text-brand-deep-green border-brand-primary-soft",
  HEALTHY: "bg-brand-light-green text-brand-deep-green border-brand-primary-soft",
};

const CATEGORY_STYLES: Record<string, string> = {
  INTERNAL: "border-blue-200 bg-blue-50 text-blue-800",
  EXTERNAL: "border-indigo-200 bg-indigo-50 text-indigo-800",
  OPERATIONAL: "border-sky-200 bg-sky-50 text-sky-800",
  MATERIAL: "border-amber-200 bg-amber-50 text-amber-800",
  LABOR: "border-violet-200 bg-violet-50 text-violet-800",
  SUBCON: "border-indigo-200 bg-indigo-50 text-indigo-800",
  OVERHEAD: "border-slate-200 bg-slate-100 text-slate-700",
  EQUIPMENT: "border-orange-200 bg-orange-50 text-orange-800",
  TRAVEL: "border-cyan-200 bg-cyan-50 text-cyan-800",
  CREATIVE: "border-purple-200 bg-purple-50 text-purple-800",
  VIDEOGRAPHY: "border-blue-200 bg-blue-50 text-blue-800",
  RESEARCH: "border-sky-200 bg-sky-50 text-sky-800",
};

const CATEGORY_FALLBACKS = [
  "border-blue-200 bg-blue-50 text-blue-800",
  "border-indigo-200 bg-indigo-50 text-indigo-800",
  "border-violet-200 bg-violet-50 text-violet-800",
  "border-slate-200 bg-slate-100 text-slate-700",
];

export function normalizePresentationKey(value?: string | null): string {
  return String(value || "").trim().replace(/[\s-]+/g, "_").toUpperCase();
}

export function getStatusStyle(status?: string | null): string {
  return STATUS_STYLES[normalizePresentationKey(status)] ?? "bg-gray-100 text-gray-700 border-gray-200";
}

export function getCategoryStyle(category?: string | null): string {
  const key = normalizePresentationKey(category);
  if (!key) return CATEGORY_FALLBACKS[0];
  const hash = Array.from(key).reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return CATEGORY_STYLES[key] ?? CATEGORY_FALLBACKS[hash % CATEGORY_FALLBACKS.length];
}

export const PRESENTATION_COLORS = {
  primary: "#294BB2",
  primaryDark: "#2649B3",
  primaryPale: "#EAF6FF",
  primarySoft: "#9FD6FF",
  neutral: "#9CA3AF",
  warning: "#F59E0B",
  danger: "#EF4444",
} as const;
