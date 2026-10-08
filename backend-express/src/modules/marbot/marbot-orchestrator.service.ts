import type { Request } from 'express';
import prisma from '../../config/database';
import { answerNative, detectTools, followUpQuestion, isNativeTaskReadQuestion, type AssistantMode, type NativeScope } from './marbot-native.service';
import type { MarbotAction } from './marbot-action.service';
import { helperAnswer, systemKnowledgeAnswer } from './marbot-knowledge';
import { validateNativePlan } from './marbot-planner.service';
import { executeResourceRead, planResourceQuestion, type ResourcePlan } from './marbot-resource.service';
import { discoverMarbotSchema } from './marbot-schema.service';
import { understandMarbotQuestion } from './marbot-understanding.service';
import { isDataReadQuestion, isIntentCorrection, isProcedureQuestion } from './marbot-intent';

export type MarbotAnswer = { content: string; tools: string[]; sources: string[]; action?: MarbotAction };
export type MarbotDecision = { answer: MarbotAnswer; understanding: { source: 'llm' | 'local' | 'explicit';
  route: string; status: string; confidence?: number; model?: string } };
const clarification = {
  entity: 'Fitur yang dimaksud apa: meeting, notulensi, Weekly Task, Daily Task, atau fitur lain? Sebutkan fitur dan tujuan Anda.',
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

/** LLM understands -> validated route -> retrieve reference OR execute an
 * existing tool -> answer from that evidence. No model-generated business facts. */
export async function answerMarbotQuestion(req: Request, message: string, mode: AssistantMode, scope: NativeScope,
  signal: AbortSignal, previousQuestion?: string, db = prisma): Promise<MarbotDecision> {
  const explicit = /^\s*(?:data|resource)\s+\{/.test(message);
  const fallbackQuestion = followUpQuestion(message, previousQuestion);
  if (isIntentCorrection(message) && fallbackQuestion !== message) return {
    understanding: { source: 'local', route: 'guide', status: 'recovered' },
    answer: await answerNative(fallbackQuestion, mode, scope, db),
  };
  const result = explicit ? null : await understandMarbotQuestion(message, scope, signal, previousQuestion);
  if (result?.status === 'ready') {
    const intent = result.intent;
    const understanding = { source: 'llm' as const, route: intent.route, status: 'ready', confidence: intent.confidence, model: result.model };
    if (intent.route === 'guide') return { understanding, answer: { content: helperAnswer(message, scope,
      { topic: intent.topic, operation: intent.operation ?? undefined }), tools: ['help.procedure'],
      sources: [`ERP:procedure:${intent.topic}:${intent.operation ?? 'overview'}:2026-10-07`] } };
    if (intent.route === 'knowledge') return { understanding, answer: { content: systemKnowledgeAnswer(message, scope.enabledModules, intent.modules),
      tools: ['help.procedure'], sources: intent.modules.map(module => `ERP:code-knowledge:${module}:2026-10-07`) } };
    if (intent.route === 'clarify') return { understanding, answer: { content: clarification[intent.reason], tools: ['intent.clarification'], sources: [] } };
    if (intent.route === 'access') return { understanding, answer: await answerNative('hak akses', mode, scope, db) };
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
  return { understanding, answer: await answerNative(fallbackQuestion, mode, scope, db) };
}
