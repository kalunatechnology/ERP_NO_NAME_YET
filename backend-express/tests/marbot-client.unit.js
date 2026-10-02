const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

async function main() {
  const calls = [];
  const id = 'b75d14c9-365c-49a8-b4c0-de618d827c25';
  let stored = { id, project_name: 'A', customer_name: 'B', manager_name: 'C', status: 'IN_PROGRESS' };
  const api = {
    post: async (url, payload) => { calls.push({ url, payload }); return { data: stored }; },
    patch: async (url, payload) => { calls.push({ url, payload }); return { data: stored }; },
    get: async url => { calls.push({ url }); return { data: stored }; },
  };
  const source = fs.readFileSync(path.resolve(__dirname, '../../frontend-next/services/chatbot.service.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  let stream = '';
  const exports = {};
  const context = { exports, require: name => { assert.equal(name, '@/lib/api/axios'); return api; }, process: { env: {} }, localStorage: { getItem: () => '' }, TextDecoder, AbortSignal,
    fetch: async () => new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } }), console };
  vm.runInNewContext(code, context);
  const action = { ticketId: id, kind: 'project.create', payload: { project_name: 'A' } };
  api.post = async (url, payload) => { calls.push({ url, payload }); return { data: { data: { verified: true, content: 'Hasil dibaca ulang ERP' } } }; };
  assert.match(await exports.executeMarbotAction(action), /dibaca ulang/);
  assert.equal(calls[0].url, `/api/v1/marbot/actions/${id}/execute`);
  assert.equal(JSON.stringify(calls[0].payload), '{"confirmed":true}');
  assert.equal(calls.length, 1, 'browser must not execute business mutations/readbacks itself');
  await assert.rejects(() => exports.executeMarbotAction({ kind: 'project.create', payload: {} }), /Tiket backend/);
  api.post = async () => ({ data: { data: { verified: false, content: 'unknown' } } });
  await assert.rejects(() => exports.executeMarbotAction(action), /belum memverifikasi/);
  api.post = async () => { throw new Error('permission denied'); };
  await assert.rejects(() => exports.executeMarbotAction(action), /permission denied/);
  context.fetch = async () => new Response(JSON.stringify({ data: { messages: [
    { id, role: 'assistant', content: 'pending', created_at: '2026-10-02T00:00:00Z', metadata: { action: { kind: 'project.create', payload: { project_name: 'A' } } } },
    { id: 'b75d14c9-365c-49a8-b4c0-de618d827c26', role: 'assistant', content: 'done', created_at: '2026-10-02T00:01:00Z', metadata: { action: { kind: 'project.create', payload: {} }, result: 'verified', verified: true } },
  ] } }), { headers: { 'Content-Type': 'application/json' } });
  const history = await exports.getNativeConversation(id);
  assert.equal(history[0].action.ticketId, id, 'pending server ticket must survive history reload');
  assert.equal(history[1].action, undefined, 'settled ticket cannot be executed from history');
  assert.equal(history[1].actionState, 'verified');
  context.fetch = async () => new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
  let done = 0;
  let chunks = '';
  let errors = 0;
  const options = { message: 'A', onChunk: s => { chunks += s; }, onDone: () => { done++; }, onError: () => { errors++; } };
  stream = 'data: {"event":"chunk","data":{"delta":"hasil"}}\n\n';
  await assert.rejects(() => exports.streamChatCompletion(options), /belum lengkap/);
  assert.equal(done, 0);
  assert.equal(errors, 1);
  stream += 'data: {"event":"done","data":{"conversationId":"A"}}\n\n';
  await exports.streamChatCompletion(options);
  assert.equal(done, 1);
  stream = '';
  await assert.rejects(() => exports.streamChatCompletion(options), /tanpa respons/);
  console.log('Marbot client: server tickets, no client business writes, verified result, permission denial, missing tickets, complete/truncated/empty SSE passed.');
}
main().catch(e => { console.error(e); process.exitCode = 1; });

