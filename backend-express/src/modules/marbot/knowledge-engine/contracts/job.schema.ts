import { z } from 'zod';

export const JobTypeEnum = z.enum([
  'INCREMENTAL_CRAWL',
  'FULL_RECONCILIATION',
  'AST_EXTRACT_MODULE',
  'MINILLM_ANALYZE_FEATURE',
  'VERIFY_SNAPSHOT',
  'PUBLISH_SNAPSHOT',
]);
export type JobType = z.infer<typeof JobTypeEnum>;

export const JobStatusEnum = z.enum([
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'DEAD_LETTER',
]);
export type JobStatus = z.infer<typeof JobStatusEnum>;

export const JobPayloadSchema = z.object({
  commitSha: z.string().optional(),
  targetCommitSha: z.string().optional(),
  baseCommitSha: z.string().optional(),
  moduleCode: z.string().optional(),
  featureId: z.string().optional(),
  snapshotId: z.string().optional(),
  forceFullScan: z.boolean().optional(),
  triggerSource: z.enum(['cron', 'webhook', 'manual', 'cli']).optional(),
  options: z.record(z.unknown()).optional(),
});
export type JobPayload = z.infer<typeof JobPayloadSchema>;

export const JobCheckpointSchema = z.object({
  stage: z.string().optional(),
  totalFeatures: z.number().optional(),
  processedFeatures: z.number().optional(),
  completedModules: z.array(z.string()).default([]),
  completedFeatures: z.array(z.string()).default([]),
  failedFeatures: z.array(z.string()).default([]),
  cursor: z.string().optional(),
  lastUpdated: z.string().optional(),
});
export type JobCheckpoint = z.infer<typeof JobCheckpointSchema>;
