import type { Request } from 'express';
import prisma from '../../../../config/database';
import { answerNative, detectTools, followUpQuestion, isNativeTaskReadQuestion, type AssistantMode, type NativeScope } from './native.service';
import type { MarbotAction } from '../actions/action.service';
import { helperAnswer, systemKnowledgeAnswer } from '../../knowledge/knowledge';
import { validateNativePlan } from './planner.service';
import { executeResourceRead, planResourceQuestion, type ResourcePlan } from '../../knowledge/resource.service';
import { discoverMarbotSchema } from '../../knowledge/schema.service';
import { understandMarbotQuestion } from './understanding.service';
import { isDataReadQuestion, isIntentCorrection, isProcedureQuestion } from './intent';
import { RetrievalGatewayService } from '../../knowledge-engine/gateway/retrieval-gateway.service';
import { renderConversationalAnswer } from '../models/provider.service';

export type MarbotAnswer = { content: string; tools: string[]; sources: string[]; action?: MarbotAction };
export type MarbotDecision = { answer: MarbotAnswer; understanding: { source: 'llm' | 'local' | 'explicit';
  route: string; status: string; confidence?: number; model?: string } };
const clarification = {
  entity: 'Jenis data yang dimaksud belum spesifik. Sebutkan entitasnya, misalnya customer, opportunity, quotation, order, invoice, tiket, atau proyek. Jika ingin menghubungkan dua jenis data, sebutkan keduanya. Belum ada data yang diambil.',
  operation: 'Tujuan Anda ingin melihat data, mengetahui caranya, atau meminta perubahan data? Sebutkan satu tindakan yang dimaksud.',
  record: 'Record yang dimaksud belum teridentifikasi. Sebutkan nama lengkap dan konteks project/meeting atau identitas record yang tepat.',
  fields: 'Data untuk tindakan ini belum lengkap. Sebutkan record yang dimaksud dan nilai yang ingin dibuat atau diubah; saya belum menyiapkan perubahan.',
  multiple: 'Pertanyaan ini memuat beberapa tujuan yang perlu dipisahkan. Tanyakan satu tindakan atau satu kelompok data terlebih dahulu.',
  unsupported: 'Belum ada tool atau referensi terverifikasi untuk menjalankan kebutuhan ini melalui chat. Sebutkan fitur dan tujuan yang lebih spesifik; saya belum mengambil atau mengubah data.',
  uncertain: 'Saya belum yakin memahami maksud Anda. Sebutkan fitur, tindakan yang diinginkan, dan record atau periode bila terkait data. Belum ada perubahan dijalankan.',
};

async function resourceAnswer(req: Request, plan: ResourcePlan, scope: NativeScope): Promise<MarbotAnswer> {
  if (['create', 'update'].includes(plan.operation)) return {
    content: `Usulan perubahan ${plan.resource}:\n\n\`\`\`json\n${JSON.stringify(plan, null, 2)}\n\`\`\`\n\nBelum disimpan. Konfirmasi diperlukan; backend memvalidasi hak akses dan membaca ulang hasil.`,
    tools: ['resource.proposal'], sources: ['ERP:canonical-api'], action: { kind: 'resource.write', payload: plan },
  };
  const result = await executeResourceRead(req, plan, scope);
  return { content: `Data aktual ${plan.resource}: ${result.aggregate ? 'agregasi database sesuai filter dan akses Anda' : `${result.count} record sesuai filter dan akses Anda`}.\n\n\`\`\`json\n${JSON.stringify(result.aggregate ?? result.rows, null, 2)}\n\`\`\`${result.truncated ? '\nDaftar dibatasi 30 record; jumlah berasal dari total query ERP.' : ''}`,
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

  // Early check: Conversational confirmation of lack of access (e.g. "jadi saya tidak ada akses ke finance...")
  const specificAccessEarly = resolveSpecificAccessInquiry(message, scope);
  if (specificAccessEarly) {
    return {
      understanding: { source: 'local', route: 'access', status: 'ready' },
      answer: specificAccessEarly,
    };
  }

  const fallbackQuestion = followUpQuestion(message, previousQuestion);
  if (isIntentCorrection(message) && fallbackQuestion !== message) return {
    understanding: { source: 'local', route: 'guide', status: 'recovered' },
    answer: await answerNative(fallbackQuestion, mode, scope, db),
  };
  const result = explicit ? null : await understandMarbotQuestion(message, scope, signal, previousQuestion);
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
      const data = await resourceAnswer(req, intent.plan, scope);
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
    if (intent.route === 'clarify') return { understanding, answer: { content: clarification[intent.reason], tools: ['intent.clarification'], sources: [] } };
    if (intent.route === 'access') {
      const specific = resolveSpecificAccessInquiry(message, scope);
      if (specific) return { understanding, answer: specific };
      return { understanding, answer: await answerNative('hak akses', mode, scope, db) };
    }
    if (intent.route === 'schema') return { understanding, answer: {
      content: `Metadata database aktual sesuai akses Anda:\n\n\`\`\`json\n${JSON.stringify(await discoverMarbotSchema(scope, db, intent.tables), null, 2)}\n\`\`\`\nMetadata tidak memberi hak tambahan.`,
      tools: ['schema.discovery'], sources: ['ERP:database-metadata'] } };
    if (intent.route === 'resource') return { understanding, answer: await resourceAnswer(req, intent.plan, scope) };
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
  // Missing credentials/provider failure use the verified local path once.
  // Never retry a failed intent with a second model that chooses another goal.
  const understanding = { source: explicit ? 'explicit' as const : 'local' as const,
    route: 'fallback', status: explicit ? 'explicit' : result?.status ?? 'unconfigured' };
  if (!explicit && /^(?:halo|hai|hi|hello|pagi|selamat pagi|siang|selamat siang|sore|selamat sore|malam|selamat malam|terima kasih|makasih|thanks|thank you)[!.?\s]*$/i.test(message.trim())) {
    const rendered = await renderConversationalAnswer(message, previousQuestion, signal);
    return { understanding: { ...understanding, route: 'conversation', model: rendered.model }, answer: {
      content: rendered.content, tools: ['llm.conversation'], sources: [],
    } };
  }
  const taskRead = isNativeTaskReadQuestion(fallbackQuestion);
  const resourcePlan = taskRead || isProcedureQuestion(fallbackQuestion) ? null : await planResourceQuestion(fallbackQuestion, scope, signal, false);
  if (resourcePlan) return { understanding, answer: await resourceAnswer(req, resourcePlan, scope) };
  if (/\b(schema|skema|foreign key|primary key|relasi tabel|kolom database)\b/i.test(message)) return { understanding, answer: {
    content: `Metadata database aktual sesuai permission tool Anda:\n\n\`\`\`json\n${JSON.stringify(await discoverMarbotSchema(scope, db), null, 2)}\n\`\`\`\n\nMetadata tidak memberikan akses query atau mutasi tambahan.`,
    tools: ['schema.discovery'], sources: ['ERP:database-metadata'] } };
  if (isDataReadQuestion(fallbackQuestion) && !detectTools(fallbackQuestion).length) return {
    understanding: { ...understanding, route: 'clarify' },
    answer: { content: 'Permintaan data ini belum dapat dipetakan ke tool baca yang sesuai. Sebutkan jenis record dan filter yang diperlukan, misalnya proyek, periode, atau status. Data aktual belum diambil.', tools: ['intent.clarification'], sources: [] },
  };

  const specificAccessFallback = resolveSpecificAccessInquiry(message, scope);
  if (specificAccessFallback) {
    return { understanding: { ...understanding, route: 'access' }, answer: specificAccessFallback };
  }

  return { understanding, answer: await answerNative(fallbackQuestion, mode, scope, db) };
}
