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
  const action = { kind: 'project.create', payload: { project_name: 'A', customer_name: 'B', manager_name: 'C' } };
  assert.match(await exports.executeMarbotAction(action), /dibaca ulang/);
  assert.equal(calls[0].url, '/api/v1/projects/projects/');
  assert.equal(calls[1].url, `/api/v1/projects/projects/${id}/`);
  api.get = async () => { throw new Error('DB down'); };
  await assert.rejects(() => exports.executeMarbotAction(action), /belum dapat diverifikasi/);
  api.get = async () => ({ data: { ...stored, project_name: 'different' } });
  await assert.rejects(() => exports.executeMarbotAction(action), /belum dapat diverifikasi/);
  api.post = async () => { throw new Error('permission denied'); };
  await assert.rejects(() => exports.executeMarbotAction(action), /permission denied/);
  await assert.rejects(() => exports.executeMarbotAction({ kind: '__proto__', payload: {} }), /tidak didukung/);
  stored = { id, status: 'NOT_STARTED', output_result: 'hasil', notes: 'catatan' };
  api.get = async () => ({ data: stored });
  assert.match(await exports.executeMarbotAction({ kind: 'task.update', payload: { id, status: 'IN_PROGRESS', output_result: 'hasil' } }), /NOT_STARTED/);
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
  console.log('Marbot client: canonical routes, create readback, update derived status, permission denial, mismatch, DB failure, unknown action, complete/truncated/empty SSE passed.');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
