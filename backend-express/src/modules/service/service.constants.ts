export const SERVICE_CASE_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;

export type ServiceCasePriority = typeof SERVICE_CASE_PRIORITIES[number];

export function normalizeServiceCasePriority(value: unknown): ServiceCasePriority | null {
  if (value === undefined || value === null) return 'NORMAL';
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  if (!normalized) return null;
  return SERVICE_CASE_PRIORITIES.includes(normalized as ServiceCasePriority)
    ? normalized as ServiceCasePriority
    : null;
}
