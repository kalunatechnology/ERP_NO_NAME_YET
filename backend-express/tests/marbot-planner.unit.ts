import assert from 'node:assert/strict';
import { validateNativePlan, planNativeQuestion } from '../src/modules/marbot/marbot-planner.service';
import { env } from '../src/config/env';

async function main() {
  assert.equal(validateNativePlan({ type: 'read', domains: ['tasks'], teamName: 'A', period: 'this_week', owner: true }, 'Siapa di tim A yang bekerja pekan ini?'), 'tugas tim "A" minggu ini siapa penanggung jawab');
  assert.equal(validateNativePlan({ type: 'read', domains: ['tasks'], taskTitle: 'invented' }, 'siapa mengerjakan task?'), null);
  assert.equal(validateNativePlan({ type: 'read', domains: ['tasks'], sql: 'DROP TABLE iam_user' }, 'tugas'), null);
  assert.equal(validateNativePlan({ type: 'read', domains: ['secrets'] }, 'tugas'), null);
  assert.equal(validateNativePlan({ type: 'action', kind: 'project.create', payload: { project_name: 'A', customer_name: 'B', manager_name: 'C' } }, 'buat proyek A untuk customer B dengan PM C'), 'buat proyek {"project_name":"A","customer_name":"B","manager_name":"C"}');
  assert.equal(validateNativePlan({ type: 'action', kind: 'project.create', payload: { project_name: 'Invented' } }, 'buat proyek A'), null);
  assert.equal(validateNativePlan({ type: 'action', kind: 'project.create', payload: {} }, 'bagaimana proyek saya?'), null);
  const originalKey = env.MARBOT_AI_API_KEY, originalModel = env.MARBOT_AI_MODEL, originalFetch = global.fetch;
  try {
    env.MARBOT_AI_API_KEY = 'test-only'; env.MARBOT_AI_MODEL = 'fixture';
    global.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ type: 'read', domains: ['projects'], groupByStatus: true }) } }] }), { status: 200 });
    assert.equal(await planNativeQuestion('Bagaimana pembagian portfolio?', {}, new AbortController().signal), 'proyek berdasarkan status');
    global.fetch = async () => { throw new Error('timeout'); };
    assert.equal(await planNativeQuestion('portfolio', {}, new AbortController().signal), 'portfolio');
    global.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: '{invalid' } }] }), { status: 200 });
    assert.equal(await planNativeQuestion('portfolio', {}, new AbortController().signal), 'portfolio');
  } finally { env.MARBOT_AI_API_KEY = originalKey; env.MARBOT_AI_MODEL = originalModel; global.fetch = originalFetch; }
  console.log('Planner: strict JSON, allowlisted domains/actions, literal entities, no SQL, no invented write values, provider success/error/malformed fallbacks passed.');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
