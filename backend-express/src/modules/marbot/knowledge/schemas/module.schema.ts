import type { LifecycleStatus } from '../../knowledge-engine/contracts/knowledge.schema';

export interface ModuleKnowledge {
  module: string;
  title: string;
  path: string;
  keywords: RegExp;
  content: string;
  snapshotId?: string;
  commitSha?: string;
  lifecycleStatus?: LifecycleStatus;
  evidenceIds?: string[];
}
