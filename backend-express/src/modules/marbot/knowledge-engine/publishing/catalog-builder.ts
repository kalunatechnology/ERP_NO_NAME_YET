import type { ProcedureRule } from '../../knowledge/schemas/procedure.schema';
import type { ModuleKnowledge } from '../../knowledge/schemas/module.schema';
import type { KnowledgeEntry } from '../contracts/knowledge.schema';

export class CatalogBuilder {
  /**
   * Converts a list of KnowledgeEntries into active ProcedureRules.
   */
  static buildProcedures(entries: KnowledgeEntry[]): ProcedureRule[] {
    return entries.map((entry) => ({
      id: entry.feature_id,
      topic: entry.topic,
      operation: entry.operation || 'overview',
      title: entry.title,
      authorization: {
        allowedRoles: entry.actor_policy?.allowedRoles || [],
        requiredModules:
          entry.actor_policy?.requiredModules && entry.actor_policy.requiredModules.length > 0
            ? entry.actor_policy.requiredModules
            : [entry.module_code],
        requiresWriteAccess: entry.actor_policy?.requiresWriteAccess || false,
        uiVisibility: entry.actor_policy?.uiVisibility,
        backendPolicy: entry.actor_policy?.backendPolicy,
        denialMessage: entry.actor_policy?.denialMessage,
        roleMatchMessage: entry.actor_policy?.roleMatchMessage,
        roleDeniedMessage: entry.actor_policy?.roleDeniedMessage,
        moduleBlockedMessage: entry.actor_policy?.moduleBlockedMessage,
      },
      navigation: {
        targetPath: entry.navigation?.targetPath || '/',
        pageFile: entry.navigation?.pageFile,
        buttonLabel: entry.navigation?.buttonLabel,
        apiEndpoint: entry.navigation?.apiEndpoint,
      },
      content: {
        summary: entry.content.summary,
        steps: entry.content.steps || [],
        importantNotes: entry.content.importantNotes || [],
      },
      lifecycleStatus: entry.lifecycle_status,
      knowledgeCategory: entry.knowledge_category,
      sourcePriority: entry.source_priority,
      provenance: entry.provenance
        ? {
            snapshotId: entry.snapshot_id || entry.provenance.snapshotId || '',
            commitSha: entry.provenance.commitSha,
            verifiedAt: entry.provenance.verifiedAt || new Date().toISOString(),
            astNodeHashes: entry.provenance.astNodeHashes || [],
            sourceFiles: entry.provenance.sourceFiles || [],
            sourcePriority: entry.provenance.sourcePriority || entry.source_priority,
            sourceType: entry.provenance.sourceType || 'BACKEND_ROUTE',
          }
        : undefined,
    }));
  }

  /**
   * Groups KnowledgeEntries by module_code to construct ModuleKnowledge records.
   */
  static buildModules(entries: KnowledgeEntry[]): ModuleKnowledge[] {
    const moduleMap = new Map<string, KnowledgeEntry[]>();

    for (const entry of entries) {
      const code = entry.module_code.toUpperCase();
      const list = moduleMap.get(code) || [];
      list.push(entry);
      moduleMap.set(code, list);
    }

    const result: ModuleKnowledge[] = [];
    for (const [code, modEntries] of moduleMap.entries()) {
      const name = code.charAt(0) + code.slice(1).toLowerCase();
      result.push({
        module: code,
        title: name,
        path: `/${code.toLowerCase()}`,
        keywords: new RegExp(`\\b(?:${code.toLowerCase()}|${name.toLowerCase()})\\b`, 'i'),
        content: `Modul ${name}: ${modEntries.map((e) => e.title).join(', ')}`,
        snapshotId: modEntries[0]?.snapshot_id,
        commitSha: modEntries[0]?.provenance?.commitSha,
        lifecycleStatus: 'ACTIVE',
      });
    }

    return result;
  }
}
