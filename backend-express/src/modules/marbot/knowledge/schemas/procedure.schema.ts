import type { ProcedureTopic, ProcedureOperation } from '../../brain/reasoning/intent';
import type {
  KnowledgeCategory,
  LifecycleStatus,
  ComparisonStatus,
  SourcePriority,
  ProvenanceMetadata,
} from '../../knowledge-engine/contracts/knowledge.schema';

export interface ProcedureAuthorization {
  allowedRoles?: string[];
  requiredModules?: string[];
  requiresWriteAccess?: boolean;
  uiVisibility?: {
    allowedRoles?: string[];
    condition?: string;
    componentFile?: string;
  };
  backendPolicy?: {
    allowedRoles?: string[];
    guards?: string[];
    endpoint?: string;
    verifiedAtCommit?: string;
  };
  denialMessage?: string;
  roleMatchMessage?: ((role: string) => string) | string;
  roleDeniedMessage?: ((role: string) => string) | string;
  moduleBlockedMessage?: ((role: string, module: string) => string) | string;
}

export interface ProcedureRule {
  id: string;
  topic: ProcedureTopic | (string & {});
  operation?: ProcedureOperation | (string & {});
  title: string;
  targetPath?: string;
  version?: string;
  keywords?: RegExp;
  knowledgeCategory?: KnowledgeCategory;
  lifecycleStatus?: LifecycleStatus;
  comparisonStatus?: ComparisonStatus;
  sourcePriority?: SourcePriority;
  provenance?: ProvenanceMetadata;
  authorization?: ProcedureAuthorization;
  content: {
    summary?: string;
    steps?: string[];
    importantNotes?: string[];
    body?: string;
  };
}

export type HelpContext = {
  roleCode: string;
  enabledModules?: string[];
  blockedWriteModules?: string[];
};

export type ProcedureSelection = {
  topic: ProcedureTopic;
  operation?: ProcedureOperation;
};
