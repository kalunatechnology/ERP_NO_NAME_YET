import prisma from '../../../../config/database';
import type { ProcedureTopic, ProcedureOperation } from '../../../marbot/brain/reasoning/intent';
import type { ProcedureRule, HelpContext } from '../../../marbot/knowledge/schemas/procedure.schema';
import type { ModuleKnowledge } from '../../../marbot/knowledge/schemas/module.schema';
import { findProcedureRule, allModules } from '../../../marbot/knowledge/knowledge.registry';
import { checkAbstention, type AbstentionResult } from './abstention-guard';

interface ActiveSnapshotCache {
  snapshot: {
    id: string;
    version_number: string;
    commit_sha: string;
    published_at: Date | null;
  } | null;
  cachedAt: number;
}

let snapshotCache: ActiveSnapshotCache | null = null;
const CACHE_TTL_MS = 30_000;

export class RetrievalGatewayService {
  /**
   * Retrieves the currently published active knowledge snapshot from DB or cache.
   */
  static async getActiveSnapshot() {
    const now = Date.now();
    if (snapshotCache && now - snapshotCache.cachedAt < CACHE_TTL_MS) {
      return snapshotCache.snapshot;
    }

    try {
      const active = await (prisma as any).marbot_knowledge_snapshot.findFirst({
        where: { status: 'ACTIVE' },
        orderBy: { published_at: 'desc' },
        select: {
          id: true,
          version_number: true,
          commit_sha: true,
          published_at: true,
        },
      });
      snapshotCache = { snapshot: active ?? null, cachedAt: now };
      return snapshotCache.snapshot;
    } catch {
      // Fallback if table does not exist or database is offline
      snapshotCache = { snapshot: null, cachedAt: now };
      return null;
    }
  }

  /**
   * Invalidate the in-memory active snapshot cache (e.g. after publishing a new snapshot).
   */
  static invalidateCache() {
    snapshotCache = null;
  }

  /**
   * Resolves the authoritative ProcedureRule for a given topic and operation.
   * Checks the dynamic DB snapshot first; if not found, falls back to the baseline verified catalogue.
   */
  static async resolveProcedureRule(
    topic: ProcedureTopic,
    operation?: ProcedureOperation
  ): Promise<ProcedureRule | undefined> {
    const activeSnapshot = await this.getActiveSnapshot();

    if (activeSnapshot) {
      try {
        const entry = await (prisma as any).marbot_knowledge_entry.findFirst({
          where: {
            snapshot_id: activeSnapshot.id,
            topic,
            ...(operation ? { operation } : {}),
            lifecycle_status: { in: ['ACTIVE', 'QUARANTINED', 'RETIRED'] },
          },
        });

        if (entry) {
          const content = JSON.parse(entry.content_json || '{}');
          const actorPolicy = entry.actor_policy_json ? JSON.parse(entry.actor_policy_json) : undefined;
          const provenance = entry.provenance_json ? JSON.parse(entry.provenance_json) : undefined;

          return {
            id: entry.feature_id,
            topic: entry.topic as ProcedureTopic,
            operation: entry.operation as ProcedureOperation | undefined,
            title: entry.title,
            targetPath: entry.navigation_json ? JSON.parse(entry.navigation_json)?.targetPath : undefined,
            version: activeSnapshot.version_number,
            lifecycleStatus: entry.lifecycle_status as any,
            comparisonStatus: entry.comparison_status as any,
            sourcePriority: entry.source_priority as any,
            authorization: actorPolicy,
            provenance: {
              snapshotId: activeSnapshot.id,
              commitSha: activeSnapshot.commit_sha,
              verifiedAt: activeSnapshot.published_at?.toISOString() ?? new Date().toISOString(),
              astNodeHashes: provenance?.astNodeHashes ?? [],
              sourceFiles: provenance?.sourceFiles ?? [],
              sourcePriority: entry.source_priority as any,
              sourceType: provenance?.sourceType ?? 'BACKEND_ROUTE',
            },
            content: {
              summary: content.summary,
              steps: content.steps,
              importantNotes: content.importantNotes,
              body: content.body,
            },
          };
        }
      } catch {
        // Fallback to static baseline on DB query error
      }
    }

    // Baseline fallback
    return findProcedureRule(topic, operation);
  }

  /**
   * Searches relevant knowledge entries from the currently active snapshot in DB.
   */
  static async searchRelevantKnowledge(
    query: string,
    scope: { enabledModules: string[] }
  ): Promise<
    Array<{
      feature_id: string;
      title: string;
      module_code: string;
      knowledge_category?: string;
      summary: string;
      steps?: string[];
      targetPath?: string;
      provenance: string;
      actorPolicy?: any;
    }>
  > {
    const activeSnapshot = await this.getActiveSnapshot();
    if (!activeSnapshot) return [];

    try {
      const normalizedQuery = query.toLowerCase().replace(/[?.,!]/g, '').trim();
      const terms = normalizedQuery.split(/\s+/).filter((t) => t.length > 2);
      if (!terms.length) return [];

      const ERP_SYNONYM_MAP: Record<string, string[]> = {
        pelanggan: ['customer', 'inbox', 'lead', 'contact', 'crm', 'deals', 'klien'],
        customer: ['pelanggan', 'inbox', 'lead', 'client', 'contact'],
        sales: ['penjualan', 'deals', 'leads', 'inquiry', 'crm', 'order'],
        penjualan: ['sales', 'deals', 'order', 'quotation', 'contracts'],
        inbox: ['customer', 'pesan', 'chat', 'incoming', 'inquiry', 'whatsapp'],
        tagihan: ['invoice', 'billing', 'piutang', 'ar', 'termin'],
        invoice: ['tagihan', 'billing', 'piutang', 'ar'],
        billing: ['tagihan', 'invoice', 'termin'],
        piutang: ['ar', 'receivable', 'tagihan', 'invoice'],
        hutang: ['ap', 'payable', 'vendor', 'tagihan'],
        vendor: ['supplier', 'pemasok', 'ap', 'tagihan'],
        pembayaran: ['payment', 'kas', 'bank', 'cashbank'],
        kas: ['cash', 'bank', 'cashbank', 'pembayaran'],
        bank: ['banking', 'reconciliation', 'rekonsiliasi', 'cashbank'],
        pajak: ['tax', 'ppn', 'pph', 'faktur'],
        tax: ['pajak', 'ppn', 'pph', 'faktur'],
        aset: ['asset', 'fixed_asset', 'penyusutan', 'depresiasi', 'aktiva'],
        asset: ['aset', 'fixed_asset', 'depreciation', 'penyusutan'],
        penyusutan: ['depreciation', 'depresiasi', 'aset', 'schedule'],
        dana: ['funding', 'fundings', 'costing', 'wip', 'biaya'],
        funding: ['dana', 'pengajuan', 'costing', 'project'],
        biaya: ['cost', 'costing', 'expense', 'pengeluaran'],
        tugas: ['task', 'tasks', 'daily', 'weekly', 'pekerjaan'],
        task: ['tugas', 'daily', 'weekly', 'main_task'],
        proyek: ['project', 'projects', 'milestone', 'pekerjaan'],
        project: ['proyek', 'projects', 'active', 'completed'],
        tiket: ['ticket', 'tickets', 'case', 'support', 'garansi'],
        support: ['tiket', 'service', 'garansi', 'case'],
        notulensi: ['minutes', 'catatan', 'meeting', 'rapat'],
        meeting: ['notulensi', 'rapat', 'agenda'],
        cuti: ['leave', 'timeoff', 'izin'],
        persetujuan: ['approval', 'approve', 'verifikasi'],
        laporan: ['report', 'reporting', 'pnl', 'gl', 'financial'],
        skema: ['schema', 'model', 'tabel', 'database', 'kolom'],
        tabel: ['table', 'model', 'schema', 'database', 'prisma'],
      };

      const expandedTerms = new Set<string>(terms);
      for (const term of terms) {
        const syns = ERP_SYNONYM_MAP[term];
        if (syns) {
          for (const s of syns) expandedTerms.add(s);
        }
      }

      const isSchemaQuery = /\b(?:tabel|table|skema|schema|database|model|kolom|prisma)\b/i.test(normalizedQuery);

      const entries = await (prisma as any).marbot_knowledge_entry.findMany({
        where: {
          snapshot_id: activeSnapshot.id,
          module_code: { in: [...scope.enabledModules, 'GENERAL', 'CORE'] },
          lifecycle_status: 'ACTIVE',
        },
        select: {
          feature_id: true,
          module_code: true,
          title: true,
          topic: true,
          knowledge_category: true,
          content_json: true,
          navigation_json: true,
          provenance_json: true,
          actor_policy_json: true,
        },
      });

      const scored = entries
        .map((e: any) => {
          const titleLower = (e.title || '').toLowerCase();
          const topicLower = (e.topic || '').toLowerCase();
          const featureLower = (e.feature_id || '').toLowerCase();
          const contentStr = (e.content_json || '').toLowerCase();
          let score = 0;

          // 1. Exact query or phrase match bonus
          if (titleLower.includes(normalizedQuery)) score += 30;
          if (contentStr.includes(normalizedQuery)) score += 15;

          // 2. Direct term match
          for (const term of terms) {
            if (titleLower.includes(term)) score += 8;
            if (topicLower.includes(term)) score += 6;
            if (featureLower.includes(term)) score += 5;
            if (contentStr.includes(term)) score += 3;
          }

          // 3. Synonym / Concept match
          for (const exp of expandedTerms) {
            if (titleLower.includes(exp)) score += 4;
            if (topicLower.includes(exp)) score += 3;
            if (featureLower.includes(exp)) score += 3;
            if (contentStr.includes(exp)) score += 2;
          }

          // 4. Category-based boosts
          const isUserGuidanceQuery = /\b(how|cara|bagaimana|panduan|buka|lihat|view|menu|tab|halaman)\b/i.test(normalizedQuery);
          if (isUserGuidanceQuery) {
            if (e.feature_id.startsWith('frontend.tab.')) score += 35;
            if (e.feature_id.startsWith('frontend.view.')) score += 20;
            if (e.knowledge_category === 'USER_PROCEDURE') score += 15;
          } else {
            if (e.feature_id.startsWith('frontend.tab.')) score += 15;
            if (e.feature_id.startsWith('frontend.view.')) score += 8;
          }
          if (isSchemaQuery && e.feature_id.startsWith('schema.model.')) score += 25;

          return { entry: e, score };
        })
        .filter((item: { entry: any; score: number }) => item.score > 0);

      scored.sort((a: { score: number }, b: { score: number }) => b.score - a.score);

      return scored.slice(0, 4).map(({ entry: e }: { entry: any; score: number }) => {
        const content = JSON.parse(e.content_json || '{}');
        const navigation = e.navigation_json ? JSON.parse(e.navigation_json) : {};
        const actorPolicy = e.actor_policy_json ? JSON.parse(e.actor_policy_json) : undefined;
        return {
          feature_id: e.feature_id,
          title: e.title,
          module_code: e.module_code,
          knowledge_category: e.knowledge_category,
          summary: content.summary || '',
          steps: content.steps,
          targetPath: navigation.targetPath,
          provenance: `ERP:mkie:${e.module_code}:${e.topic}:v${activeSnapshot.version_number}`,
          actorPolicy,
        };
      });
    } catch {
      return [];
    }
  }

  /**
   * Synthesizes an authoritative answer grounded in retrieved MKIE facts.
   * Utilizes OpenRouter LLM when available, falling back gracefully to deterministic synthesis.
   */
  static async generateGroundedAnswer(
    query: string,
    entries: Array<{
      feature_id: string;
      title: string;
      module_code: string;
      knowledge_category?: string;
      summary: string;
      steps?: string[];
      targetPath?: string;
      provenance: string;
      actorPolicy?: any;
    }>,
    scope: { roleCode?: string; enabledModules: string[] }
  ): Promise<string> {
    if (!entries.length) {
      return 'Referensi fitur tersebut belum tersedia dalam cakupan modul aktif Anda. Belum ada bukti kode terverifikasi yang cocok.';
    }

    // Check OpenRouter LLM availability from environment
    const apiKey = process.env.MARBOT_AI_API_KEY;
    const model = process.env.MARBOT_AI_MODEL;

    if (apiKey && model) {
      try {
        const systemPrompt = `Anda adalah Marka Plus, asisten cerdas untuk sistem Arsalynt ERP.
Tugas Anda adalah menjawab pertanyaan pengguna secara ringkas, akurat, dan ramah dalam Bahasa Indonesia berdasarkan HANYA bukti kode (Code Evidence) yang disediakan.

ATURAN GROUNDING KETAT:
1. JANGAN mengarang fitur, prosedur, atau hak akses yang tidak tertera dalam bukti kode.
2. Jelaskan fitur yang dimaksud, modul terkait, rute navigasi dan link markdown [Buka ...] (jika path tersedia), serta langkah penggunaan.
3. Bila ada detail teknis yang tidak disebutkan dalam bukti kode (misalnya rumus kalkulasi khusus atau batas validasi), nyatakan dengan jujur bahwa hal tersebut belum tercatat pada bukti kode sistem saat ini.
4. Anda HANYA memberikan panduan dan informasi pengetahuan. JANGAN mengeksekusi mutasi/perubahan data.`;

        const factsPayload = entries.map((e) => ({
          title: e.title,
          module: e.module_code,
          category: e.knowledge_category || 'USER_PROCEDURE',
          summary: e.summary,
          steps: e.steps,
          path: e.targetPath,
          allowedRoles: e.actorPolicy?.allowedRoles,
        }));

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: model,
            temperature: 0.2,
            max_tokens: 800,
            messages: [
              { role: 'system', content: systemPrompt },
              {
                role: 'user',
                content: `Pertanyaan pengguna: "${query}"\nPeran pengguna: ${scope.roleCode || 'USER'} (Modul Aktif: ${scope.enabledModules.join(', ')})\n\nBukti Fitur Kode Sistem Terverifikasi:\n${JSON.stringify(factsPayload, null, 2)}`,
              },
            ],
          }),
          signal: AbortSignal.timeout(12000),
        });

        if (response.ok) {
          const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
          const reply = body.choices?.[0]?.message?.content?.trim();
          if (reply && reply.length > 20) {
            return reply;
          }
        }
      } catch {
        // Fallback to deterministic synthesis if API call fails or times out
      }
    }

    // Deterministic fallback synthesis
    return (
      entries
        .map((e) => {
          const stepsText =
            e.steps && e.steps.length > 0
              ? `\n\nLangkah-langkah:\n${e.steps.map((s, idx) => `${idx + 1}. ${s}`).join('\n')}`
              : '';
          const navText = e.targetPath ? `\n\n[Buka ${e.title}](${e.targetPath})` : '';
          return `### ${e.title}\n${e.summary}${stepsText}${navText}`;
        })
        .join('\n\n---\n\n') + '\n\nSumber: Arsalynt ERP Code Knowledge Engine (MKIE).'
    );
  }

  /**
   * Resolves active modules, applying active snapshot overrides if available.
   */
  static async resolveModules(enabledModules: string[]): Promise<readonly ModuleKnowledge[]> {
    const baseline = allModules.filter((item) => enabledModules.includes(item.module));
    const active = await this.getActiveSnapshot();
    if (!active) return baseline;

    try {
      const tabEntries = await (prisma as any).marbot_knowledge_entry.findMany({
        where: {
          snapshot_id: active.id,
          module_code: { in: enabledModules },
          feature_id: { startsWith: 'frontend.tab.' },
          lifecycle_status: 'ACTIVE',
        },
        select: {
          module_code: true,
          title: true,
          topic: true,
        },
      });

      if (!tabEntries.length) return baseline;

      const tabsByModule = new Map<string, string[]>();
      for (const t of tabEntries) {
        const list = tabsByModule.get(t.module_code) || [];
        const cleanTitle = t.title.replace(/^Tab:\s*/i, '').replace(/\s*\([^)]*\)$/, '');
        if (!list.includes(cleanTitle)) list.push(cleanTitle);
        tabsByModule.set(t.module_code, list);
      }

      return baseline.map((mod) => {
        const discoveredTabs = tabsByModule.get(mod.module);
        if (!discoveredTabs || !discoveredTabs.length) return mod;

        const enrichedContent = `${mod.content} Tab aktif terdeteksi: ${discoveredTabs.join(', ')}.`;
        const tabKeywords = discoveredTabs.map((t) => t.toLowerCase()).join('|');
        const enrichedKeywords = new RegExp(
          `${mod.keywords.source}|${tabKeywords}`,
          'i'
        );

        return {
          ...mod,
          content: enrichedContent,
          keywords: enrichedKeywords,
        };
      });
    } catch {
      return baseline;
    }
  }

  /**
   * Evaluates if a given rule triggers an abstention guard.
   */
  static evaluateAbstention(
    rule: ProcedureRule,
    topicName: string,
    operation?: ProcedureOperation
  ): AbstentionResult {
    return checkAbstention(rule, topicName, operation);
  }

  /**
   * Retrieves active provenance metadata string for orchestrator citations.
   */
  static async getActiveProvenanceString(
    topic: string,
    operation?: string
  ): Promise<string> {
    const active = await this.getActiveSnapshot();
    if (active) {
      return `ERP:procedure:${topic}:${operation ?? 'overview'}:v${active.version_number}:${active.commit_sha.slice(0, 7)}`;
    }
    return `ERP:procedure:${topic}:${operation ?? 'overview'}:2026-10-07`;
  }
}
