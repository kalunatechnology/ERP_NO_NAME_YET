/** Keep existing OM-stage records actionable without rewriting approval history. */
export function normalizeRequestStatus(status: string): string {
  return ['PENDING_OM', 'PENDING_EXEC', 'RE_CHECKING'].includes(status) ? 'REGISTERED' : status;
}
