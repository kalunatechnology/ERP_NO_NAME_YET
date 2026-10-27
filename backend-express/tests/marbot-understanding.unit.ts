import assert from 'node:assert/strict';
import { RoleCode } from '@prisma/client';
import { env } from '../src/config/env';
import prisma from '../src/config/database';
import { validateUnderstanding, understandMarbotQuestion } from '../src/modules/marbot/brain/reasoning/understanding.service';
import { answerMarbotQuestion } from '../src/modules/marbot/brain/reasoning/orchestrator.service';
import type { NativeScope } from '../src/modules/marbot/brain/reasoning/native.service';
import { isNativeTaskReadQuestion } from '../src/modules/marbot/brain/reasoning/native.service';
import { isDataReadQuestion, isMutationCommand, isProcedureQuestion } from '../src/modules/marbot/brain/reasoning/intent';

const scope: NativeScope = { tenantId: 'tenant-fixture', companyId: 'company-fixture', userId: 'user-fixture', roleId: 'role-fixture', roleCode: RoleCode.PROJECT_MANAGER,
  enabledModules: ['MARBOT', 'PROJECTS', 'REQUESTS', 'IMPLEMENTATION'], permissions: ['USE_MARBOT', 'READ_TASK', 'READ_PROJECT'], projectScope: { mode: 'LIST', projectIds: ['project-fixture'] } };
const req = { headers: { authorization: 'Bearer fixture' }, companyId: scope.companyId, socket: { localPort: 1234 } } as any;
const signal = () => new AbortController().signal;
const noDb = new Proxy({}, { get() { throw new Error('Static retrieval/proposal must not query business data'); } }) as any;
const route = (topic: string, operation: string | null) => ({ route: 'guide', topic, operation, confidence: 0.96 });

async function main() {
  assert.equal(isDataReadQuestion('saya memiliki berapa opportunity'), true, 'first-person count phrasing is a live-data request');
  const crmScope: NativeScope = { ...scope, roleCode: RoleCode.CRM_LEAD, enabledModules: [...scope.enabledModules, 'CRM'], permissions: [...scope.permissions, 'READ_CRM_DEALS'] };
  assert.equal(validateUnderstanding({ route: 'knowledge', modules: ['CRM'], confidence: 0.99 }, 'saya memiliki berapa opportunity', crmScope), null,
    'a live opportunity count cannot be routed to reference knowledge');
  const savedKey = env.MARBOT_AI_API_KEY, savedModel = env.MARBOT_AI_MODEL, savedFetch = global.fetch;
  let modelCalls = 0, synthesisCalls = 0, canonicalCalls = 0, businessReads = 0, mcpOpportunityShortlistSeen = false;
  let modelOutput: unknown = route('meeting', 'delete');
  let lastPrompt: any;
  let mode: 'ok' | 'http-error' | 'malformed' | 'throw' = 'ok';
  let lastSql: any;
  const db: any = { $queryRaw: async (sql: any) => {
    businessReads++; lastSql = sql;
    assert(sql.values.includes(scope.companyId) && sql.values.includes('project-fixture'));
    return [{ title: 'Fixture verified task', owner_id: scope.userId, status: 'NOT_STARTED', progress: 0, total: 3n, completed: 0n, overdue: 0n, blocked: 0n }];
  } };
  try {
    env.MARBOT_AI_API_KEY = 'fixture-only'; env.MARBOT_AI_MODEL = 'fixture-model';
    global.fetch = async (url, options) => {
      if (String(url).startsWith('https://openrouter.ai/')) {
        modelCalls++; lastPrompt = JSON.parse(String(options?.body));
        if (lastPrompt.messages[0].content.includes('AI agent untuk pengguna ERP')) {
          synthesisCalls++;
          const packet = JSON.parse(lastPrompt.messages[1].content);
          const text = packet.evidence.resource === 'crm.opportunities'
            ? `Anda memiliki ${packet.evidence.count} opportunity sesuai cakupan akses Anda.`
            : packet.evidence.operation === 'count'
              ? `Ada ${packet.evidence.count} record pekerjaan implementasi yang sesuai.`
            : `Saya menemukan ${packet.evidence.count} record yang sesuai dengan permintaan Anda.`;
          return new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), { status: 200 });
        }
        assert.equal(lastPrompt.response_format.type, 'json_object');
        assert.equal(lastPrompt.messages[0].role, 'system');
        assert.match(lastPrompt.messages[0].content, /interpret intent|BEFORE/);
        assert.doesNotMatch(lastPrompt.messages[1].content, /Bearer|fixture-only|company-fixture|tenant-fixture|user-fixture|Fixture verified task/);
        const agentContext = JSON.parse(lastPrompt.messages[1].content);
        assert(agentContext.capabilities.mcpTools.includes('search_erp_schema') && agentContext.capabilities.mcpTools.includes('erp.query'));
        assert.doesNotMatch(lastPrompt.messages[1].content, /\/api\/v\d+\//, 'MCP metadata sent to model must not contain internal endpoint routes');
        const asked = JSON.parse(lastPrompt.messages[2].content).request;
        if (/opportunit/i.test(asked)) mcpOpportunityShortlistSeen = agentContext.capabilities.mcpSchemaSearch.candidates.some((candidate:any)=>candidate.key==='crm.opportunities');
        if (mode === 'http-error') return new Response('{}', { status: 503 });
        if (mode === 'throw') throw new Error('Provider timeout');
        return new Response(JSON.stringify({ choices: [{ message: { content: mode === 'malformed' ? '{invalid' : JSON.stringify(modelOutput) } }] }), { status: 200 });
      }
      canonicalCalls++;
      const path = new URL(String(url));
      assert.equal(path.hostname, '127.0.0.1');
      assert.match(path.pathname, /^\/api\/v1\/(?:implementation\/work-items|crm\/opportunities)\//);
      assert.equal(options?.method, 'GET', 'Reads never become POST/PATCH');
      assert.equal((options?.headers as any).authorization, 'Bearer fixture');
      assert.equal((options?.headers as any)['x-company-id'], scope.companyId);
      if (path.pathname.includes('/crm/opportunities/')) assert.equal(path.searchParams.get('owner_user_id'), scope.userId,
        'personal opportunity read must be forced to the authenticated owner even when the model omitted the filter');
      return new Response(JSON.stringify({ count: 7, results: [{ id: 'row-fixture', title: 'Evidence from canonical API' }] }), { status: 200 });
    };
    // The words do not match the local delete/meeting grammar. The LLM route
    // directly retrieves meeting/delete; final facts still come from ERP code.
    const paraphrase = 'agenda tadi udah nggak kepake, langkah nyingkirinnya gimana ya?';
    let result = await answerMarbotQuestion(req, paraphrase, 'HELPER', scope, signal(), undefined, noDb);
    assert.equal(result.understanding.source, 'llm');
    assert.match(result.answer.content, /Hapus Meeting/);
    assert.doesNotMatch(result.answer.content, /Tambah Notulensi/);
    assert.match(result.answer.sources[0], /^(?:ERP:procedure:meeting:delete:|ERP:curated-procedure:meeting\.delete:)/);
    assert.equal(result.answer.action, undefined);
    const guideCases = [
      ['aku yang nyatet diskusi tadi, boleh revisi rangkumannya?', 'minutes', 'edit', /Edit Notulensi[\s\S]*PUBLISHED/],
      ['catatan untuk pertemuan rutin mau aku bagikan ke peserta', 'minutes', 'publish', /recurring[\s\S]*seri tetap berjalan/],
      ['aktivitas harian punyaku mau dibuang, langkahnya apa?', 'daily', 'delete', /Hapus Daily Task[\s\S]*pemilik/],
      ['ingin mengajukan sasaran sepekan sendiri, urutannya gimana?', 'weekly', 'create', /Ajukan Target Mingguan/],
    ] as const;
    for (const [question, topic, operation, expected] of guideCases) {
      modelOutput = route(topic, operation);
      result = await answerMarbotQuestion(req, question, 'HELPER', scope, signal(), undefined, noDb);
      assert.equal(result.understanding.source, 'llm', question);
      assert.match(result.answer.content, expected, question);
      assert.equal(result.answer.action, undefined);
    }
    modelOutput = route('meeting', 'delete');
    result = await answerMarbotQuestion(req, 'kalau dibuang?', 'HELPER', scope, signal(), 'bagaimana membuat meeting?', noDb);
    assert.match(result.answer.content, /Hapus Meeting/);
    assert.equal(JSON.parse(lastPrompt.messages.at(-1).content).previousQuestion, 'bagaimana membuat meeting?');
    assert.equal(canonicalCalls + businessReads, 0, 'Retrieval is not a live business read');

    const approvalQuestion = 'bagaimana saya melakukan acc pada weekly target dari staf';
    modelOutput = { route: 'native', plan: { type: 'read', domains: ['tasks'], personal: true, taskLevel: 'weekly' }, confidence: 0.99 };
    result = await answerMarbotQuestion(req, approvalQuestion, 'HELPER', scope, signal(), undefined, noDb);
    assert.deepEqual(result.answer.tools, ['help.procedure'], 'A wrong model read must fall back to the requested approval guide');
    assert.match(result.answer.content, /Tinjau Pengajuan[\s\S]*Approve \(Setujui\)/);
    assert.equal(result.answer.action, undefined);
    result = await answerMarbotQuestion(req, 'kamu tidak paham pertanyaan saya ya', 'HELPER', scope, signal(), approvalQuestion, noDb);
    assert.equal(result.understanding.status, 'recovered');
    assert.match(result.answer.content, /Persetujuan Target Mingguan/);
    mode = 'throw';
    result = await answerMarbotQuestion(req, approvalQuestion, 'HELPER', scope, signal(), undefined, noDb);
    assert.deepEqual(result.answer.tools, ['help.procedure']);
    assert.equal(canonicalCalls + businessReads, 0);
    mode = 'ok';

    // Model selection retrieves real data from the chosen existing tool.
    modelOutput = { route: 'resource', plan: { resource: 'implementation.work-items', operation: 'count', filters: {} }, confidence: 0.97 };
    result = await answerMarbotQuestion(req, 'jumlah pekerjaan implementasi yang tercatat ada berapa?', 'HELPER', scope, signal(), undefined, noDb);
    assert.match(result.answer.content, /7 record/);
    assert.equal(canonicalCalls, 1);
    assert.equal(result.understanding.source, 'llm');
    modelOutput = { route: 'resource', plan: { resource: 'crm.opportunities', operation: 'count', filters: {} }, confidence: 0.97 };
    result = await answerMarbotQuestion(req, 'saya memiliki berapa opportunity', 'HELPER', crmScope, signal(), undefined, noDb);
    assert.match(result.answer.content, /Anda memiliki 7 opportunity/);
    assert.doesNotMatch(result.answer.content, /\`\`\`json|\/api\/v1|Data aktual/);
    assert.equal(canonicalCalls, 2, 'first-person CRM count reads live CRM records');
    assert.equal(synthesisCalls, 2, 'live resource answers are synthesized from verified MCP results');
    assert.equal(mcpOpportunityShortlistSeen, true, 'MCP schema search must supply the opportunity candidate to the intent model');
    modelOutput = { route: 'native', plan: { type: 'read', domains: ['tasks'], personal: true, period: 'tomorrow' }, confidence: 0.98 };
    result = await answerMarbotQuestion(req, 'pekerjaan saya besok ada apa?', 'HELPER', scope, signal(), undefined, db);
    assert.match(result.answer.content, /Fixture verified task/);
    assert(lastSql.values.includes(scope.userId), 'Semantic personal intent must filter PM data to the owner');
    assert.match(lastSql.sql, /AND d.planned_date >=/);

    // A model-inferred today/default or lost owner does not change explicit task semantics.
    modelOutput = { route: 'native', plan: { type: 'read', domains: ['tasks'], period: 'today', personal: false }, confidence: 0.99 };
    result = await answerMarbotQuestion(req, 'seluruh daily task saya', 'HELPER', scope, signal(), undefined, db);
    assert(lastSql.values.includes(scope.userId));
    assert.doesNotMatch(lastSql.sql, /AND d.planned_date >=/);
    await answerMarbotQuestion(req, 'bagaimana dengan daily task lain yang bukan hari ini', 'HELPER', scope, signal(), undefined, db);
    assert.match(lastSql.sql, /planned_date IS NULL OR/);

    // Known tool plans are proposals only; confirmation remains a separate endpoint.
    modelOutput = { route: 'native', plan: { type: 'action', kind: 'project.create', payload: { project_name: 'A', customer_name: 'B', manager_name: 'C' } }, confidence: 0.99 };
    result = await answerMarbotQuestion(req, 'buat proyek A untuk B dengan PM C', 'HELPER', scope, signal(), undefined, noDb);
    assert.equal(result.answer.action?.kind, 'project.create');
    assert.match(result.answer.content, /belum disimpan/i);
    result = await answerMarbotQuestion(req, 'tolong buatkan proyek A untuk B dengan PM C', 'HELPER', scope, signal(), undefined, noDb);
    assert.equal(result.answer.action?.kind, 'project.create', 'Polite explicit intent uses the validated existing action tool');
    assert.equal(canonicalCalls, 2, 'A proposal must not execute an ERP write');
    assert.equal(validateUnderstanding(modelOutput, 'apakah saya bisa buat proyek A untuk B dengan PM C?', scope), null);
    assert.equal(validateUnderstanding({ route: 'native', plan: { type: 'action', kind: 'project.create', payload: { project_name: 'invented' } }, confidence: 1 }, 'buat proyek A', scope), null);
    assert.equal(validateUnderstanding({ ...route('minutes', 'create') }, 'apakah saya bisa hapus meeting?', scope), null, 'Wrong meaning must not reach retrieval');
    assert.equal(validateUnderstanding({ ...route('meeting', 'delete'), sql: 'DROP TABLE' }, 'hapus meeting?', scope), null);
    assert.equal(validateUnderstanding({ route: 'native', plan: { type: 'read', domains: ['finance'] }, confidence: 1 }, 'total biaya', scope), null);
    assert.equal(validateUnderstanding({ route: 'resource', plan: { resource: 'implementation.work-items', operation: 'list', filters: { title: 'invented' } }, confidence: 1 }, 'jumlah pekerjaan implementasi', scope), null);
    assert.equal(validateUnderstanding({ route: 'resource', plan: { resource: 'finance.payments', operation: 'list' }, confidence: 1 }, 'daftar payments', scope)?.route, 'clarify', 'Out-of-scope entity must not execute as a resource read');
    assert.equal(validateUnderstanding({ route: 'knowledge', modules: ['FINANCE'], confidence: 1 }, 'fitur finance', scope), null);
    assert.equal(validateUnderstanding({ route: 'schema', tables: ['iam_user'], confidence: 1 }, 'schema user', scope), null);

    modelOutput = { route: 'knowledge', modules: ['REQUESTS'], confidence: 0.98 };
    result = await answerMarbotQuestion(req, 'jelaskan ruang kerja agenda dan catatan diskusi', 'HELPER', scope, signal(), undefined, noDb);
    assert.match(result.answer.content, /Requests & Meetings[\s\S]*CANCELLED/);
    modelOutput = { ...route('meeting', 'delete'), confidence: 0.3 };
    result = await answerMarbotQuestion(req, 'yang tadi aja', 'HELPER', scope, signal(), undefined, noDb);
    assert.match(result.answer.content, /belum yakin/);
    assert.equal(result.answer.action, undefined);
    modelOutput = { route: 'clarify', reason: 'multiple', confidence: 0.96 };
    result = await answerMarbotQuestion(req, 'sekaligus beresin semua yang tadi', 'HELPER', scope, signal(), undefined, noDb);
    assert.match(result.answer.content, /beberapa tujuan/);
    assert.equal(result.answer.action, undefined);

    // Invalid/failed provider plans use one local fallback, never a second LLM.
    for (const failure of ['http-error', 'malformed', 'throw'] as const) {
      mode = failure;
      const before = modelCalls;
      result = await answerMarbotQuestion(req, 'apakah saya bisa hapus meeting?', 'HELPER', scope, signal(), undefined, noDb);
      assert.equal(modelCalls - before, 1);
      assert.equal(result.understanding.source, 'local');
      assert.match(result.answer.content, /Hapus Meeting/);
    }
    mode = 'ok';
    const beforeExplicit = modelCalls;
    result = await answerMarbotQuestion(req, 'data {"resource":"implementation.work-items","operation":"count"}', 'HELPER', scope, signal(), undefined, noDb);
    assert.equal(modelCalls, beforeExplicit + 1, 'Explicit tool JSON skips intent planning but the verified result still receives a natural-language answer');
    assert.equal(result.understanding.source, 'explicit');
    assert.match(result.answer.content, /7 record/);
    env.MARBOT_AI_API_KEY = undefined;
    const beforeMissing = modelCalls;
    assert.equal((await understandMarbotQuestion('hapus meeting?', scope, signal())).status, 'unconfigured');
    result = await answerMarbotQuestion(req, 'cara hapus meeting', 'HELPER', scope, signal(), undefined, noDb);
    assert.equal(modelCalls, beforeMissing);
    assert.equal(result.understanding.status, 'unconfigured');
    assert.match(result.answer.content, /Hapus Meeting/);
    assert.equal(canonicalCalls, 3, 'Only the three read fixtures call ERP; all actions remain proposals');
    let weeklySql: any;
    const weeklyDb = { $queryRaw: async (sql: any) => {
      weeklySql = sql;
      return [{ target_description: 'Target perlu ditinjau',status:'PENDING_APPROVAL',progress:0,total:3n }];
    } } as any;
    for (const question of ['tampilkan weekly target yang menunggu approval?', 'berapa jumlah target mingguan menunggu persetujuan?', 'tolong daftar weekly task saya menunggu approval']) {
      assert(isDataReadQuestion(question)); assert(!isProcedureQuestion(question)); assert(isNativeTaskReadQuestion(question));
      assert.equal(validateUnderstanding(route('weekly','approve'),question,scope),null,'A data request must not become an approval guide');
      assert.equal(validateUnderstanding({route:'knowledge',modules:['PROJECTS'],confidence:1},question,scope),null);
      const answer = await answerMarbotQuestion(req,question,'HELPER',scope,signal(),undefined,weeklyDb);
      assert.deepEqual(answer.answer.tools,['tasks']); assert.match(answer.answer.content,/Target perlu ditinjau/);
      assert(weeklySql.values.includes('PENDING_APPROVAL')); assert(weeklySql.values.includes(scope.companyId)); assert(weeklySql.values.includes('project-fixture'));
      if(question.includes('saya')) assert(weeklySql.values.includes(scope.userId));
      assert.equal(answer.answer.action,undefined);
    }
    assert(isProcedureQuestion('bagaimana cara melihat daftar weekly target?'));
    assert(isProcedureQuestion('bagaimana melakukan approval weekly target?'));
    assert(!isMutationCommand('tampilkan daily task "Buat laporan dan hapus draft"'));
    assert(!isMutationCommand('cara menghapus meeting?'));
    assert(isMutationCommand('tolong hapus meeting'));
    assert(isMutationCommand('buat proyek A untuk B'));
    result=await answerMarbotQuestion(req,'jumlah data yang belum dikenali?','HELPER',scope,signal(),undefined,noDb);
    assert.deepEqual(result.answer.tools,['intent.clarification']); assert.deepEqual(result.answer.sources,[]); assert.match(result.answer.content,/Data aktual belum diambil/);
    console.log(`Semantic orchestration passed: ${modelCalls} model fixtures, exact reference retrieval, paraphrases/context, canonical/native reads, ownership/dates, proposals, low confidence, invalid plans, permission filtering and provider fallbacks. No business writes.`);
  } finally { env.MARBOT_AI_API_KEY = savedKey; env.MARBOT_AI_MODEL = savedModel; global.fetch = savedFetch; }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
