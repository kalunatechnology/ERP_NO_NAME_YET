import type { Request } from 'express';
import prisma from '../../../../config/database';
import { answerNative, followUpQuestion, isNativeTaskReadQuestion, type AssistantMode, type NativeScope } from './native.service';
import type { MarbotAction } from '../actions/action.service';
import { helperAnswer, systemKnowledgeAnswer } from '../../knowledge/knowledge';
import { validateNativePlan } from './planner.service';
import { planResourceQuestion, type ResourcePlan } from '../../knowledge/resource.service';
import { discoverMarbotSchema } from '../../knowledge/schema.service';
import { understandMarbotQuestion } from './understanding.service';
import { RetrievalGatewayService } from '../../knowledge-engine/gateway/retrieval-gateway.service';
import { renderClarificationAnswer, renderConversationalAnswer, renderGroundedAgentAnswer } from '../models/provider.service';
import { callMcpErpQueryTool } from '../../routing/mcp-tools.service';

export type MarbotAnswer = { content: string; tools: string[]; sources: string[]; action?: MarbotAction };
export type MarbotDecision = { answer: MarbotAnswer; understanding: { source: 'llm' | 'local' | 'explicit';
  route: string; status: string; confidence?: number; model?: string } };
async function resourceAnswer(req: Request, plan: ResourcePlan, scope: NativeScope, question: string): Promise<MarbotAnswer> {
  if (['create', 'update'].includes(plan.operation)) return {
    content: `Usulan perubahan ${plan.resource}:\n\n\`\`\`json\n${JSON.stringify(plan, null, 2)}\n\`\`\`\n\nBelum disimpan. Konfirmasi diperlukan; backend memvalidasi hak akses dan membaca ulang hasil.`,
    tools: ['resource.proposal'], sources: ['ERP:canonical-api'], action: { kind: 'resource.write', payload: plan },
  };
  const result = await callMcpErpQueryTool(req, plan, scope);
  const rendered = await renderGroundedAgentAnswer(question, { resource: result.resource, operation: plan.operation,
    count: result.count, aggregate: result.aggregate, rows: result.rows, truncated: result.truncated });
  return { content: rendered.content,
    tools: ['resource.query'], sources: [result.source] };
}

function resolveSpecificAccessInquiry(message: string, scope: NativeScope): MarbotAnswer | null {
  const normMsg = message.toLowerCase()
    .replace(/\btikda\b/g, 'tidak')
    .replace(/\bfinace\b/g, 'finance')
    .replace(/\bkeuagan\b/g, 'keuangan')
    .replace(/\bga\b/g, 'tidak')
    .replace(/\bgak\b/g, 'tidak');

  const isAccessCheck = /\b(akses|izin|bisa|boleh|hak)\b/i.test(normMsg);
  const isConfirmation = /\b(jadi|berarti|artinya)\b/i.test(normMsg) && /\b(tidak|tanpa|bukan|belum)\b/i.test(normMsg);
  const isDirectQuestion = /\b(apakah|kenapa|mengapa)\b.*\b(tidak|ada|punya|bisa)\b.*\b(akses|izin)\b/i.test(normMsg);

  if (isAccessCheck || isConfirmation || isDirectQuestion) {
    const modulesToCheck = [
      { key: 'FINANCE', terms: ['finance', 'keuangan', 'pembukuan', 'accounting', 'jurnal umum', 'neraca saldo', 'p&l', 'laba rugi'] },
      { key: 'CRM', terms: ['crm', 'tiket', 'ticket', 'deals', 'leads', 'inbox'] },
      { key: 'INVENTORY', terms: ['inventory', 'gudang', 'stok', 'stock'] },
      { key: 'HR', terms: ['hr', 'payroll', 'gaji', 'karyawan'] },
    ];

    for (const mod of modulesToCheck) {
      if (mod.terms.some(t => normMsg.includes(t))) {
        const hasAccess = scope.enabledModules.includes(mod.key) && !scope.blockedReadModules?.includes(mod.key);
        if (!hasAccess) {
          return {
            content: `**Benar.** Sesuai kebijakan hak akses untuk peran Anda saat ini (\`${scope.roleCode || 'STAFF'}\`), Anda **tidak memiliki akses** ke modul **${mod.key}** untuk melihat data operasional atau pembukuan menyeluruh perusahaan.\n\n` +
                     `Modul aktif yang diizinkan untuk akun Anda saat ini meliputi: **${scope.enabledModules.join(', ')}**.\n\n` +
                     `Untuk melihat estimasi dan performa proyek yang ditugaskan kepada Anda, silakan akses modul **REPORTING** (tab *Project P&L*) atau modul **PROJECTS**. Jika Anda memerlukan akses resmi ke modul ${mod.key}, silakan ajukan permohonan otorisasi kepada Finance Manager atau Direksi.`,
            tools: ['access.verification'],
            sources: ['ERP:role-policy-check'],
          };
        }
      }
    }
  }
  return null;
}

/** LLM understands -> validated route -> retrieve reference OR execute an
 * existing tool -> answer from that evidence. No model-generated business facts. */
export async function answerMarbotQuestion(req: Request, message: string, mode: AssistantMode, scope: NativeScope,
  signal: AbortSignal, previousQuestion?: string, db = prisma): Promise<MarbotDecision> {
  const explicit = /^\s*(?:data|resource)\s+\{/.test(message);

  const fallbackQuestion = followUpQuestion(message, previousQuestion);
  const result = explicit ? null : await understandMarbotQuestion(message, scope, signal, previousQuestion);
  if (!explicit && result?.status !== 'ready') {
    if (result?.status === 'invalid') {
      const rendered = await renderClarificationAnswer(message,
        'Rencana belum sesuai katalog resource atau aturan query yang diizinkan.', signal);
      return { understanding: { source: 'llm', route: 'clarify', status: 'recovered', model: rendered.model },
        answer: { content: rendered.content, tools: ['llm.clarification'], sources: [] } };
    }
    const content = result?.status === 'unconfigured'
      ? 'Asisten AI belum aktif karena provider bahasa belum dikonfigurasi. Silakan atur MARBOT_AI_API_KEY dan MARBOT_AI_MODEL pada secret environment backend.'
      : 'Asisten AI belum dapat memproses permintaan ini karena layanan model tidak merespons dengan rencana yang valid. Coba lagi setelah layanan pulih.';
    return {
      understanding: { source: 'local', route: 'model-unavailable', status: result?.status ?? 'unavailable' },
      answer: { content, tools: [], sources: [] },
    };
  }
  if (result?.status === 'ready') {
    const intent = result.intent;
    const understanding = { source: 'llm' as const, route: intent.route, status: 'ready', confidence: intent.confidence, model: result.model };
    if (intent.route === 'conversation') {
      const rendered = await renderConversationalAnswer(message, previousQuestion, signal);
      return { understanding: { ...understanding, model: rendered.model }, answer: {
        content: rendered.content, tools: ['llm.conversation'], sources: [],
      } };
    }
    if (intent.route === 'hybrid') {
      const rule = await RetrievalGatewayService.resolveProcedureRule(intent.procedure.topic, intent.procedure.operation ?? undefined);
      if (!rule) return { understanding, answer: { content: helperAnswer(message, scope,
        { topic: intent.procedure.topic, operation: intent.procedure.operation ?? undefined }),
        tools: ['help.procedure'], sources: [`ERP:curated-procedure:${intent.procedure.topic}:${intent.procedure.operation ?? 'overview'}:baseline`] } };
      const guidance = helperAnswer(message, scope,
        { topic: intent.procedure.topic, operation: intent.procedure.operation ?? undefined }, rule);
      const data = await resourceAnswer(req, intent.plan, scope, message);
      return { understanding, answer: { content: `${guidance}\n\n---\n\n${data.content}`,
        tools: ['help.procedure', ...data.tools], sources: [
          rule.provenance?.snapshotId
            ? `ERP:procedure:${rule.topic}:${rule.operation ?? 'overview'}:v${rule.version ?? 'unknown'}:${rule.provenance.commitSha.slice(0, 7)}`
            : `ERP:curated-procedure:${rule.id}:${rule.version ?? 'baseline'}`,
          ...data.sources,
        ] } };
    }
    if (intent.route === 'guide') {
      const rule = await RetrievalGatewayService.resolveProcedureRule(intent.topic, intent.operation ?? undefined);
      const provenance = rule?.provenance?.snapshotId
        ? `ERP:procedure:${rule.topic}:${rule.operation ?? 'overview'}:v${rule.version ?? 'unknown'}:${rule.provenance.commitSha.slice(0, 7)}`
        : `ERP:curated-procedure:${rule?.id ?? `${intent.topic}.${intent.operation ?? 'overview'}`}:${rule?.version ?? 'baseline'}`;
      return { understanding, answer: { content: helperAnswer(message, scope,
        { topic: intent.topic, operation: intent.operation ?? undefined }, rule), tools: ['help.procedure'],
        sources: [provenance] } };
    }
    if (intent.route === 'knowledge') {
      // Check if this is an explicit module overview inquiry
      const isOverviewQuery = /^(?:jelaskan|apa itu|overview|ruang kerja)\s+(?:modul|ruang kerja)/i.test(message) && intent.modules.length === 1;

      if (!isOverviewQuery) {
        const mkieEntries = await RetrievalGatewayService.searchRelevantKnowledge(message, scope);
        if (mkieEntries.length > 0) {
          const groundedContent = await RetrievalGatewayService.generateGroundedAnswer(message, mkieEntries, scope);
          return {
            understanding,
            answer: {
              content: groundedContent,
              tools: ['help.procedure'],
              sources: mkieEntries.map((e) => e.provenance),
            },
          };
        }
      }

      const canonicalContent = systemKnowledgeAnswer(message, scope.enabledModules, intent.modules);

      if (!canonicalContent.includes('belum tersedia')) {
        return {
          understanding,
          answer: {
            content: canonicalContent,
            tools: ['help.procedure'],
            sources: intent.modules.map((module) => `ERP:curated-module:${module}:baseline`),
          },
        };
      }

      const mkieEntries = await RetrievalGatewayService.searchRelevantKnowledge(message, scope);
      if (mkieEntries.length > 0) {
        const groundedContent = await RetrievalGatewayService.generateGroundedAnswer(message, mkieEntries, scope);
        return {
          understanding,
          answer: {
            content: groundedContent,
            tools: ['help.procedure'],
            sources: mkieEntries.map((e) => e.provenance),
          },
        };
      }

      return {
        understanding,
        answer: {
          content: canonicalContent,
          tools: ['help.procedure'],
          sources: intent.modules.map((module) => `ERP:curated-module:${module}:baseline`),
        },
      };
    }
    if (intent.route === 'clarify') {
      const rendered = await renderClarificationAnswer(message, intent.reason, signal);
      return { understanding: { ...understanding, model: rendered.model }, answer: {
        content: rendered.content, tools: ['llm.clarification'], sources: [],
      } };
    }
    if (intent.route === 'access') {
      const specific = resolveSpecificAccessInquiry(message, scope);
      if (specific) return { understanding, answer: specific };
      return { understanding, answer: await answerNative('hak akses', mode, scope, db) };
    }
    if (intent.route === 'schema') return { understanding, answer: {
      content: `Metadata database aktual sesuai akses Anda:\n\n\`\`\`json\n${JSON.stringify(await discoverMarbotSchema(scope, db, intent.tables), null, 2)}\n\`\`\`\nMetadata tidak memberi hak tambahan.`,
      tools: ['schema.discovery'], sources: ['ERP:database-metadata'] } };
    if (intent.route === 'resource') return { understanding, answer: await resourceAnswer(req, intent.plan, scope, message) };
    if (intent.route === 'native') {
      const planned = validateNativePlan(intent.plan, message, intent.plan.type === 'read');
      if (planned) {
        // Explicit existing task predicates are the verifier for owner, Weekly
        // vs Daily, all dates and exclusions. A model must not drop/add them.
        const question = intent.plan.type === 'read' && isNativeTaskReadQuestion(fallbackQuestion) ? fallbackQuestion : planned;
        return { understanding, answer: await answerNative(question, mode, scope, db) };
      }
    }
  }
  if (!explicit) {
    const rendered = await renderClarificationAnswer(message, 'Rencana belum lolos validasi keamanan backend.', signal);
    return { understanding: { source: 'llm', route: 'plan-rejected', status: 'invalid', model: rendered.model },
      answer: { content: rendered.content, tools: ['llm.clarification'], sources: [] } };
  }

  const understanding = { source: 'explicit' as const, route: 'explicit', status: 'explicit' };
  const resourcePlan = await planResourceQuestion(message, scope, signal, false);
  if (resourcePlan) return { understanding, answer: await resourceAnswer(req, resourcePlan, scope, message) };
  return { understanding, answer: { content: 'Format permintaan data terstruktur tidak valid. Belum ada data yang diambil.', tools: ['intent.rejected'], sources: [] } };
}
