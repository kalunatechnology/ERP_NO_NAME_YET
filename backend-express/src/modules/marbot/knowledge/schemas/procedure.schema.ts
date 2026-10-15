import type { ProcedureTopic, ProcedureOperation } from '../../brain/reasoning/intent';

export interface ProcedureAuthorization {
  allowedRoles?: string[];
  requiredModules?: string[];
  requiresWriteAccess?: boolean;
  denialMessage?: string;
  roleMatchMessage?: (role: string) => string;
  roleDeniedMessage?: (role: string) => string;
  moduleBlockedMessage?: (role: string, module: string) => string;
}

export interface ProcedureRule {
  id: string;
  topic: ProcedureTopic;
  operation?: ProcedureOperation;
  title: string;
  targetPath?: string;
  version?: string;
  keywords?: RegExp;
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
