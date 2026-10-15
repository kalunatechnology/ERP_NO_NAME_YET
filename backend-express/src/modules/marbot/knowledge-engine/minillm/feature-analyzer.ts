import type { Evidence } from '../contracts/evidence.schema';
import type { KnowledgeEntry } from '../contracts/knowledge.schema';
import { ContextBuilder } from './context-builder';
import { MiniLlmClient } from './model-client';

export class FeatureAnalyzer {
  /**
   * Analyzes an evidence unit to produce a candidate KnowledgeEntry.
   */
  static async analyze(
    evidence: Evidence,
    relatedEvidences: Evidence[] = []
  ): Promise<KnowledgeEntry> {
    const parts = evidence.feature_id.split('.');
    const moduleCode = parts[0]?.toUpperCase() || 'CORE';
    const topic = parts[1] || 'general';
    const operation = evidence.route_method?.toLowerCase() || 'overview';

    // 1. Prepare sandboxed prompt
    const { systemPrompt, userPrompt } = ContextBuilder.buildFeaturePrompt(
      evidence,
      relatedEvidences
    );

    let title = evidence.symbol_name || `${moduleCode} ${topic}`;
    let summary = `Prosedur untuk ${title} pada modul ${moduleCode}.`;
    let steps: string[] = [
      `Buka modul ${moduleCode}.`,
      `Pilih menu atau navigasi terkait ${topic}.`,
      `Lakukan operasi ${operation} sesuai hak akses Anda.`,
    ];
    let importantNotes: string[] = [];

    // 2. Call MiniLLM if available
    const llmResponse = await MiniLlmClient.complete({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      responseFormatJson: true,
      timeoutMs: 15000,
    });

    if (llmResponse) {
      try {
        const parsed = JSON.parse(llmResponse) as {
          title?: string;
          summary?: string;
          steps?: string[];
          importantNotes?: string[];
        };

        if (parsed.title) title = parsed.title;
        if (parsed.summary) summary = parsed.summary;
        if (Array.isArray(parsed.steps) && parsed.steps.length > 0) {
          steps = parsed.steps;
        }
        if (Array.isArray(parsed.importantNotes)) {
          importantNotes = parsed.importantNotes;
        }
      } catch {
        // Fall back to deterministic template if JSON parse fails
      }
    }

    // 3. Extract roles from backend guard if present
    const allowedRoles: string[] = [];
    if (evidence.backend_authorization_guard) {
      const match = evidence.backend_authorization_guard.match(/[A-Z0-9_]{3,30}/g);
      if (match) {
        allowedRoles.push(...match.filter((m) => !['REQUIRE', 'ROLE', 'ACTIVE', 'RESTRICT', 'GUARD'].includes(m)));
      }
    }

    return {
      feature_id: evidence.feature_id,
      topic,
      operation,
      module_code: moduleCode,
      title,
      knowledge_category: 'USER_PROCEDURE',
      lifecycle_status: 'ACTIVE',
      comparison_status: 'NEW',
      source_priority: llmResponse ? 'AI_INFERENCE' : 'CODE_FACT',
      actor_policy: {
        allowedRoles,
        requiredModules: [moduleCode],
        requiresWriteAccess: ['POST', 'PUT', 'PATCH', 'DELETE'].includes(
          evidence.route_method || ''
        ),
        backendPolicy: {
          allowedRoles,
          guards: evidence.middleware_chain || [],
          endpoint: evidence.route_path || undefined,
          verifiedAtCommit: evidence.commit_sha,
        },
      },
      navigation: {
        targetPath: evidence.route_path || '/',
        apiEndpoint: evidence.route_path
          ? `${evidence.route_method ?? 'GET'} ${evidence.route_path}`
          : undefined,
        requiredQueryParams: [],
      },
      content: {
        summary,
        steps,
        importantNotes,
      },
      confidence_score: 0.9,
      review_required: false,
      provenance: {
        commitSha: evidence.commit_sha,
        astNodeHashes: [evidence.ast_node_hash],
        sourceFiles: [evidence.source_file],
        sourcePriority: llmResponse ? 'AI_INFERENCE' : 'CODE_FACT',
        sourceType: evidence.source_type,
      },
    };
  }
}
