import type { ProcedureRule } from './schemas/procedure.schema';
import type { ProcedureTopic, ProcedureOperation } from '../brain/reasoning/intent';
import { meetingProcedures } from './data/procedures/meetings';
import { projectTaskProcedures } from './data/procedures/project-tasks';
import { financeProcedures } from './data/procedures/finance';
import { hrRequestProcedures } from './data/procedures/hr-requests';
import { moduleKnowledgeCatalog } from './data/modules.catalog';

export const allProcedures: readonly ProcedureRule[] = [
  ...meetingProcedures,
  ...projectTaskProcedures,
  ...financeProcedures,
  ...hrRequestProcedures,
];

export const allModules = moduleKnowledgeCatalog;

export const supportedOperationsByTopic: Record<string, string[]> = {
  weekly: ['create', 'submit', 'approve'],
  minutes: ['create', 'edit', 'publish'],
  reports: [],
  timesheet: ['create', 'start', 'stop', 'submit'],
  invoice: ['create', 'submit', 'approve', 'publish'],
  leave: ['create', 'submit'],
  meeting: ['create', 'submit', 'publish', 'delete', 'cancel'],
  daily: ['create', 'submit', 'edit', 'delete'],
};

export function findProcedureRule(topic: ProcedureTopic, operation?: ProcedureOperation): ProcedureRule | undefined {
  if (operation) {
    const exact = allProcedures.find(p => p.topic === topic && p.operation === operation);
    if (exact) return exact;
  }
  // Fallback to topic default rule
  const defaultRule = allProcedures.find(p => p.topic === topic && !p.operation);
  if (defaultRule) return defaultRule;

  // Fallback for daily -> tasks
  if (topic === 'daily') {
    return allProcedures.find(p => p.topic === 'tasks' && !p.operation);
  }

  return undefined;
}
