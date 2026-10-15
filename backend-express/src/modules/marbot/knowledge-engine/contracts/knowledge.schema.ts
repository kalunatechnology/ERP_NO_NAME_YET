import { z } from 'zod';

export const KnowledgeCategoryEnum = z.enum([
  'TECHNICAL_FACT',
  'BUSINESS_RULE',
  'USER_PROCEDURE',
]);
export type KnowledgeCategory = z.infer<typeof KnowledgeCategoryEnum>;

export const LifecycleStatusEnum = z.enum([
  'ACTIVE',
  'STALE',
  'SUPERSEDED',
  'QUARANTINED',
  'RETIRED',
]);
export type LifecycleStatus = z.infer<typeof LifecycleStatusEnum>;

export const ComparisonStatusEnum = z.enum([
  'NEW',
  'UPDATED',
  'UNCHANGED',
  'CONFLICT',
  'UNVERIFIED',
]);
export type ComparisonStatus = z.infer<typeof ComparisonStatusEnum>;

export const SourcePriorityEnum = z.enum([
  'TEST_VERIFIED',
  'CODE_FACT',
  'HUMAN_APPROVED',
  'AI_INFERENCE',
]);
export type SourcePriority = z.infer<typeof SourcePriorityEnum>;

export const ActorPolicySchema = z.object({
  allowedRoles: z.array(z.string()).default([]),
  requiredModules: z.array(z.string()).default([]),
  requiresWriteAccess: z.boolean().default(false),
  uiVisibility: z
    .object({
      allowedRoles: z.array(z.string()).optional(),
      condition: z.string().optional(),
      componentFile: z.string().optional(),
    })
    .optional(),
  backendPolicy: z
    .object({
      allowedRoles: z.array(z.string()).optional(),
      guards: z.array(z.string()).optional(),
      endpoint: z.string().optional(),
      verifiedAtCommit: z.string().optional(),
    })
    .optional(),
  denialMessage: z.string().optional(),
  roleMatchMessage: z.string().optional(),
  roleDeniedMessage: z.string().optional(),
  moduleBlockedMessage: z.string().optional(),
});
export type ActorPolicy = z.infer<typeof ActorPolicySchema>;

export const WorkflowContractSchema = z.object({
  initialStatus: z.string().optional(),
  allowedTransitions: z
    .array(
      z.object({
        from: z.string(),
        to: z.string(),
        action: z.string(),
        requiredRole: z.string().optional(),
      })
    )
    .default([]),
  terminalStatuses: z.array(z.string()).default([]),
  sideEffects: z.array(z.string()).default([]),
});
export type WorkflowContract = z.infer<typeof WorkflowContractSchema>;

export const NavigationContractSchema = z.object({
  targetPath: z.string().optional(),
  pageFile: z.string().optional(),
  buttonLabel: z.string().optional(),
  apiEndpoint: z.string().optional(),
  requiredQueryParams: z.array(z.string()).default([]),
});
export type NavigationContract = z.infer<typeof NavigationContractSchema>;

export const ProcedureContentSchema = z.object({
  summary: z.string().optional(),
  steps: z.array(z.string()).default([]),
  importantNotes: z.array(z.string()).default([]),
  body: z.string().optional(),
});
export type ProcedureContent = z.infer<typeof ProcedureContentSchema>;

export const ProvenanceMetadataSchema = z.object({
  snapshotId: z.string().optional(),
  commitSha: z.string().min(1),
  verifiedAt: z.string().optional(),
  astNodeHashes: z.array(z.string()).default([]),
  sourceFiles: z.array(z.string()).default([]),
  sourcePriority: SourcePriorityEnum.default('CODE_FACT'),
  sourceType: z.string().default('BACKEND_ROUTE'),
});
export type ProvenanceMetadata = z.infer<typeof ProvenanceMetadataSchema>;

export const KnowledgeEntrySchema = z.object({
  id: z.string().optional(),
  snapshot_id: z.string().optional(),
  feature_id: z.string().min(1),
  topic: z.string().min(1),
  operation: z.string().nullable().optional(),
  module_code: z.string().min(1),
  title: z.string().min(1),
  knowledge_category: KnowledgeCategoryEnum.default('USER_PROCEDURE'),
  lifecycle_status: LifecycleStatusEnum.default('ACTIVE'),
  comparison_status: ComparisonStatusEnum.default('NEW'),
  source_priority: SourcePriorityEnum.default('CODE_FACT'),
  actor_policy: ActorPolicySchema.optional(),
  workflow: WorkflowContractSchema.optional(),
  navigation: NavigationContractSchema.optional(),
  content: ProcedureContentSchema,
  confidence_score: z.number().min(0).max(1).default(1.0),
  review_required: z.boolean().default(false),
  provenance: ProvenanceMetadataSchema.optional(),
});
export type KnowledgeEntry = z.infer<typeof KnowledgeEntrySchema>;
