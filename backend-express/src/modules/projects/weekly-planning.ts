/** Approval, ownership, hierarchy and progress are controlled by domain actions. */
export function weeklyPlanningPatch(data: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const field of ['target_description', 'week_number', 'start_date', 'end_date']) {
    if (data[field] !== undefined) patch[field] = data[field];
  }
  return patch;
}
