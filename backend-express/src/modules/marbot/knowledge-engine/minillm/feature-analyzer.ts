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
    const isFrontendTab = evidence.feature_id.startsWith('frontend.tab.');
    const isFrontendView = evidence.feature_id.startsWith('frontend.view.');
    const isPrismaModel = evidence.source_type === 'PRISMA_MODEL';

    let moduleCode = 'CORE';
    let topic = 'general';
    let operation = evidence.route_method?.toLowerCase() || 'overview';
    let title = evidence.symbol_name || 'Fitur ERP';
    let summary = `Fitur ${title}.`;
    let steps: string[] = [];
    let knowledgeCategory: 'USER_PROCEDURE' | 'BUSINESS_RULE' | 'TECHNICAL_FACT' = 'USER_PROCEDURE';

    if (isFrontendTab) {
      // Format: frontend.tab.<module>.<tabId>
      moduleCode = (parts[2] || 'CRM').toUpperCase();
      topic = parts[3] || 'tab';
      operation = 'view';
      knowledgeCategory = 'USER_PROCEDURE';
      const cleanLabel = (evidence.symbol_name || topic).replace(/^Tab:\s*/i, '').replace(/\s*\([^)]*\)$/, '').trim();
      title = `${cleanLabel} (${moduleCode})`;
      summary = `Tab ${cleanLabel} pada modul ${moduleCode}. Halaman ini dapat diakses langsung melalui ${evidence.route_path || `/${moduleCode.toLowerCase()}`}.`;
      const linkedModels = relatedEvidences
        .filter((r) => r.source_type === 'PRISMA_MODEL')
        .map((r) => r.symbol_name)
        .filter(Boolean);
      if (linkedModels.length > 0) {
        summary += ` Terhubung dengan entitas model: ${Array.from(new Set(linkedModels)).slice(0, 5).join(', ')}.`;
      }
      steps = [
        `Buka modul ${moduleCode} (${evidence.route_path || `/${moduleCode.toLowerCase()}`}).`,
        `Pilih tab "${cleanLabel}".`,
        `Lihat data, jalankan pencarian, atau kelola transaksi sesuai hak akses Anda.`,
      ];
    } else if (isFrontendView) {
      // Format: frontend.view.<module>.<viewSlug>
      moduleCode = (parts[2] || 'GENERAL').toUpperCase();
      topic = parts[3] || 'view';
      operation = 'view';
      knowledgeCategory = 'USER_PROCEDURE';
      title = evidence.symbol_name || `${moduleCode} View`;
      summary = `Halaman antarmuka ${title} di Arsalynt ERP pada rute ${evidence.route_path || '/'}.`;
      const linkedModels = relatedEvidences
        .filter((r) => r.source_type === 'PRISMA_MODEL')
        .map((r) => r.symbol_name)
        .filter(Boolean);
      if (linkedModels.length > 0) {
        summary += ` Terhubung dengan entitas model: ${Array.from(new Set(linkedModels)).slice(0, 5).join(', ')}.`;
      }
      steps = [
        `Buka rute ${evidence.route_path || '/'}.`,
        `Periksa informasi dan data sesuai izin modul Anda.`,
      ];
    } else if (isPrismaModel) {
      // Format: schema.model.<model_name>
      const modelName = parts[2] || evidence.symbol_name || 'unknown_model';
      topic = 'database_model';
      operation = 'read';
      knowledgeCategory = 'TECHNICAL_FACT';

      const deriveMod = (name: string): string => {
        if (name.startsWith('crm_') || name.startsWith('service_')) return 'CRM';
        if (name.startsWith('fin_')) return 'FINANCE';
        if (name.startsWith('project_')) return 'PROJECTS';
        if (name.startsWith('iam_')) return 'ACCOUNTS';
        if (name.startsWith('analytics_')) return 'ANALYTICS';
        if (name.startsWith('asset_')) return 'ASSETS';
        if (name.startsWith('inv_') || name.startsWith('inventory_')) return 'INVENTORY';
        if (name.startsWith('proc_') || name.startsWith('procurement_')) return 'PROCUREMENT';
        if (name.startsWith('mfg_') || name.startsWith('manufacturing_')) return 'MANUFACTURING';
        if (name.startsWith('qa_') || name.startsWith('quality_')) return 'QUALITY';
        if (name.startsWith('logistics_')) return 'LOGISTICS';
        if (name.startsWith('report_')) return 'REPORTING';
        return 'CORE';
      };

      moduleCode = deriveMod(modelName);
      title = `Model Data: ${modelName} (${moduleCode})`;
      const sampleFields = (evidence.related_symbols || []).slice(0, 12).join(', ');
      summary = `Tabel database ${modelName} untuk domain ${moduleCode}. Terdiri dari kolom: ${sampleFields}.`;
      steps = [
        `Data ${modelName} diakses melalui service dan API modul ${moduleCode}.`,
        `Hanya pengguna berhak akses ${moduleCode} yang dapat melihat atau mengubah record.`,
      ];
    } else {
      // Backend route
      moduleCode = parts[0]?.toUpperCase() || 'CORE';
      topic = parts.length > 2 ? parts[2] : (parts[1] || 'general');
      operation = evidence.route_method?.toLowerCase() || 'overview';
      title = evidence.symbol_name || `${moduleCode} ${topic}`;

      if (evidence.backend_authorization_guard) {
        knowledgeCategory = 'BUSINESS_RULE';
        summary = `Endpoint API ${title} pada modul ${moduleCode}. Memerlukan hak akses guard: ${evidence.backend_authorization_guard}.`;
      } else {
        knowledgeCategory = 'TECHNICAL_FACT';
        summary = `Endpoint API ${title} pada modul ${moduleCode}.`;
      }

      steps = [
        `Buka antarmuka modul ${moduleCode}.`,
        `Lakukan aksi terkait ${topic} sesuai hak akses Anda.`,
      ];
    }

    let importantNotes: string[] = [];

    // 1. Prepare sandboxed prompt
    const { systemPrompt, userPrompt } = ContextBuilder.buildFeaturePrompt(
      evidence,
      relatedEvidences
    );

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

    // 3. Extract roles from backend guard or related routes
    const allowedRoles: string[] = [];
    const guards = [
      evidence.backend_authorization_guard,
      ...relatedEvidences.map((r) => r.backend_authorization_guard),
    ].filter(Boolean);

    for (const g of guards) {
      const match = g!.match(/[A-Z0-9_]{3,30}/g);
      if (match) {
        for (const m of match) {
          if (
            !['REQUIRE', 'ROLE', 'ACTIVE', 'RESTRICT', 'GUARD'].includes(m) &&
            !allowedRoles.includes(m)
          ) {
            allowedRoles.push(m);
          }
        }
      }
    }

    return {
      feature_id: evidence.feature_id,
      topic,
      operation,
      module_code: moduleCode,
      title,
      knowledge_category: knowledgeCategory,
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
