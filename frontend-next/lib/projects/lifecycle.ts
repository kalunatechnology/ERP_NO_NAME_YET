export const PROJECT_LIFECYCLE_STAGES = [
  "INCOMING",
  "DISCOVERY",
  "PITCHING",
  "NEGOTIATION",
  "VERIFIED",
  "RESERVED",
  "ACTIVE",
  "CLOSED",
  "LOST",
] as const;

export type ProjectLifecycleStage = (typeof PROJECT_LIFECYCLE_STAGES)[number];

export const PROJECT_LIFECYCLE_LABELS: Record<ProjectLifecycleStage, string> = {
  INCOMING: "Incoming",
  DISCOVERY: "Discovery",
  PITCHING: "Pitching",
  NEGOTIATION: "Negotiation",
  VERIFIED: "Verified",
  RESERVED: "Reserved",
  ACTIVE: "Active",
  CLOSED: "Closed",
  LOST: "Lost",
};

const LEGACY_LIFECYCLE_ALIASES: Record<string, ProjectLifecycleStage> = {
  DRAFT: "INCOMING",
  SUBMITTED: "INCOMING",
  PROSPECT: "INCOMING",
  IN_PROGRESS: "ACTIVE",
  STARTED: "ACTIVE",
  PLANNED: "INCOMING",
  ON_HOLD: "ACTIVE",
  PITCH: "PITCHING",
  PROPOSAL: "PITCHING",
  ESTIMATION: "PITCHING",
  IN_REVIEW: "NEGOTIATION",
  APPROVAL: "NEGOTIATION",
  WON: "VERIFIED",
  APPROVED: "VERIFIED",
  ALLOCATED: "RESERVED",
  COMPLETED: "CLOSED",
  FINISHED: "CLOSED",
  CANCELLED: "LOST",
  REJECTED: "LOST",
};

/** Resolve lifecycle independently from the operational project.status field. */
export function normalizeProjectLifecycleStage(
  lifecycleStatus?: unknown,
  legacyStatus?: unknown,
): ProjectLifecycleStage {
  const lifecycle = String(lifecycleStatus ?? "").trim().toUpperCase();
  if (PROJECT_LIFECYCLE_STAGES.includes(lifecycle as ProjectLifecycleStage)) {
    return lifecycle as ProjectLifecycleStage;
  }
  if (LEGACY_LIFECYCLE_ALIASES[lifecycle]) return LEGACY_LIFECYCLE_ALIASES[lifecycle];

  const legacy = String(legacyStatus ?? "").trim().toUpperCase();
  if (PROJECT_LIFECYCLE_STAGES.includes(legacy as ProjectLifecycleStage)) {
    return legacy as ProjectLifecycleStage;
  }
  return LEGACY_LIFECYCLE_ALIASES[legacy] ?? "INCOMING";
}

export function getProjectLifecycleLabel(lifecycleStatus?: unknown, legacyStatus?: unknown): string {
  return PROJECT_LIFECYCLE_LABELS[normalizeProjectLifecycleStage(lifecycleStatus, legacyStatus)];
}

export function getNextProjectLifecycleStage(stage: ProjectLifecycleStage): ProjectLifecycleStage | null {
  const index = PROJECT_LIFECYCLE_STAGES.indexOf(stage);
  if (stage === "LOST" || stage === "CLOSED" || index < 0) return null;
  return PROJECT_LIFECYCLE_STAGES[index + 1] ?? null;
}
