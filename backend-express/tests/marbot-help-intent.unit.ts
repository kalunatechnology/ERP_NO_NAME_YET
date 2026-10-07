import assert from 'node:assert/strict';
import { RoleCode } from '@prisma/client';
import { helperAnswer } from '../src/modules/marbot/marbot-knowledge';
import { answerNative, followUpQuestion, NativeScope } from '../src/modules/marbot/marbot-native.service';
import { isProcedureQuestion, procedureTopic } from '../src/modules/marbot/marbot-intent';
import { proposeAction } from '../src/modules/marbot/marbot-action.service';
import { proposeNamedTaskAction } from '../src/modules/marbot/marbot-named-action.service';
import { planNativeQuestion, validateNativePlan } from '../src/modules/marbot/marbot-planner.service';
import { planResourceQuestion } from '../src/modules/marbot/marbot-resource.service';
import { env } from '../src/config/env';
import prisma from '../src/config/database';

const staff: NativeScope = { tenantId: 't', companyId: 'c', userId: 'u', roleId: 'r', roleCode: RoleCode.STAFF,
  enabledModules: ['MARBOT', 'REQUESTS', 'PROJECTS'], permissions: ['USE_MARBOT', 'READ_TASK'], projectScope: { mode: 'LIST', projectIds: [] } };

async function main() {
  let scenarios = 0;
  const answer = helperAnswer('apakah saya bisa hapus meeting yang sudah dibuat?');
  assert.match(answer, /Hapus Meeting/);
  assert.doesNotMatch(answer, /Tambah Notulensi|Edit Notulensi/);
  const noBusinessAccess = new Proxy({}, { get() { throw new Error('A capability question must not access business data'); } });
  const response = await answerNative('apakah saya bisa hapus meeting yang sudah dibuat?', 'HELPER', staff, noBusinessAccess as any);
  assert.match(response.content, /STAFF/);
  assert.equal(response.action, undefined);
  const groups: Array<{ topic: string; prompts: string[]; expected: RegExp; forbidden: RegExp }> = [
    { topic: 'meeting', prompts: ['apakah saya bisa hapus meeting yang sudah dibuat?', 'Bisakah meeting saya dihapus?', 'Meeting bisa di hapus gak?', 'bolehkah menghapus rapat?', 'Bagaimana cara delete meeting?', 'Can I delete a meeting?', 'cara hapus meeting yang sudah punya notulensi', 'cara hapus meeting recurring', 'apa bisa batalkan meeting?'], expected: /Hapus Meeting/, forbidden: /Tambah Notulensi|Edit Notulensi/ },
    { topic: 'meeting', prompts: ['bagaimana membuat meeting baru?', 'Cara buat rapat recurring?', 'bisa tambah meeting?', 'cara buat meeting dengan notulis', 'cara membuat meeting tanpa menghapus notulensi lama'], expected: /Meeting Baru/, forbidden: /Edit Notulensi|Hapus Meeting/ },
    { topic: 'meeting', prompts: ['cara kirim meeting draft', 'bagaimana publikasi meeting?', 'apakah bisa publish meeting draft?'], expected: /SCHEDULED/, forbidden: /COMPLETED/ },
    { topic: 'minutes', prompts: ['cara membuat notulensi meeting', 'apakah saya bisa buat note meeting?', 'Bagaimana cara mengisi notulensi meeting?', 'bisakah isi catatan rapat?'], expected: /Tambah Notulensi/, forbidden: /Hapus Meeting/ },
    { topic: 'minutes', prompts: ['apakah notulis bisa edit note meeting?', 'cara mengedit notulensi meeting', 'bisakah notulensi yang sudah dipublikasikan diubah?', 'note meeting bisa di edit?', 'cara edit notulensi recurring', 'notulensi sudah publish, apakah bisa edit?', 'cara edit notulensi yang sudah publish'], expected: /Edit Notulensi[\s\S]*PUBLISHED[\s\S]*tidak dapat/, forbidden: /Hapus Meeting|Hanya notulis yang ditunjuk dapat membuka editor/ },
    { topic: 'minutes', prompts: ['bagaimana cara publish notulensi meeting?', 'bisa publikasikan notulensi recurring?', 'cara publikasi notulensi meeting sekali'], expected: /PUBLISHED[\s\S]*COMPLETED[\s\S]*recurring/, forbidden: /Hapus Meeting/ },
    { topic: 'daily', prompts: ['cara edit daily task milik saya', 'apakah tugas harian bisa diubah?', 'daily task bisa diedit?', 'bagaimana update tugas harian saya?'], expected: /Update Daily Task[\s\S]*pemilik|pemilik[\s\S]*Update Daily Task/, forbidden: /Ajukan Target Mingguan/ },
    { topic: 'daily', prompts: ['cara hapus daily task', 'bisakah tugas harian saya dihapus?', 'apa boleh delete daily task orang lain?', 'daily task bisa di hapus?'], expected: /Hapus Daily Task[\s\S]*dihitung ulang/, forbidden: /Ajukan Target Mingguan|Tambah Notulensi/ },
    { topic: 'daily', prompts: ['Bagaimana cara membuat daily task dari weekly task?', 'bisa tambah tugas harian?', 'cara buat daily task untuk meeting'], expected: /Buat Task Harian[\s\S]*PENDING_APPROVAL/, forbidden: /Ajukan Target Mingguan/ },
    { topic: 'weekly', prompts: ['cara membuat weekly task sendiri', 'bisa ajukan target mingguan?', 'cara buat tugas mingguan', 'cara membuat weekly task yang butuh approval PM'], expected: /Ajukan Target Mingguan[\s\S]*PENDING_APPROVAL/, forbidden: /Tambah Notulensi/ },
    { topic: 'weekly', prompts: ['siapa bisa approve weekly task?', 'bagaimana cara setujui target mingguan?'], expected: /PENDING_APPROVAL[\s\S]*PLANNED/, forbidden: /Buat Task Harian/ },
    { topic: 'reports', prompts: ['Laporan kerja di mana?', 'bagaimana membuka laporan kerja?'], expected: /Ringkasan Berkala/, forbidden: /Tambah Notulensi/ },
    { topic: 'timesheet', prompts: ['Bagaimana cara memulai timer kerja?', 'bagaimana menghentikan timesheet?', 'cara mengajukan lembur'], expected: /timer|lembur/, forbidden: /Ajukan Target Mingguan/ },
    { topic: 'leave', prompts: ['cara ajukan cuti', 'bisa membuat leave request?', 'pengajuan izin di mana?'], expected: /Leave Request/, forbidden: /Tambah Notulensi/ },
    { topic: 'invoice', prompts: ['cara membuat invoice', 'bagaimana approve billing termin?', 'bisa terbitkan invoice?'], expected: /Terbitkan Billing/, forbidden: /Tambah Notulensi/ },
  ];
  for (const group of groups) for (const prompt of group.prompts) {
    assert.equal(procedureTopic(prompt)?.id, group.topic, prompt);
    const result = await answerNative(prompt, 'HELPER', staff, noBusinessAccess as any);
    assert.match(result.content, group.expected, prompt);
    assert.doesNotMatch(result.content, group.forbidden, prompt);
    assert.equal(result.action, undefined, prompt);
    assert.deepEqual(result.tools, ['help.procedure'], prompt);
    scenarios++;
  }
  for (const roleCode of Object.values(RoleCode)) {
    const result = await answerNative('apakah saya bisa hapus meeting?', 'HELPER', { ...staff, roleCode }, noBusinessAccess as any);
    assert.match(result.content, ['PROJECT_MANAGER', 'DIRECTOR'].includes(roleCode) ? /memenuhi syarat role/ : /tidak diizinkan menghapus meeting/, roleCode);
    scenarios++;
  }
  const restricted = helperAnswer('bisa hapus meeting?', { ...staff, roleCode: RoleCode.PROJECT_MANAGER, blockedWriteModules: ['REQUESTS'] });
  assert.match(restricted, /akses perubahan Requests belum tersedia/);
  for (const prompt of ['cara hapus notulensi meeting', 'cara edit meeting', 'cara hapus invoice', 'cara bayar billing', 'cara hapus cuti', 'cara restore meeting', 'meeting yang sudah dihapus bisa dikembalikan?', 'cara arsipkan meeting', 'cara transfer weekly task']) {
    assert.match(helperAnswer(prompt), /belum dapat dipastikan/);
    assert.doesNotMatch(helperAnswer(prompt), /\[Buka /, 'An unverified operation must not route to a different procedure');
    scenarios++;
  }
  assert.match(helperAnswer('cara edit task'), /Main Task, Weekly Task, atau Daily Task/);
  assert.match(helperAnswer('cara membuat dan menghapus meeting'), /beberapa tindakan/);
  assert.match(helperAnswer('bisakah edit daily task dan hapus meeting?'), /beberapa tindakan/);
  assert.match(helperAnswer('berapa jumlah meeting saya?'), /Data meeting aktual belum dibaca/);
  assert.match(helperAnswer('cara hapus proyek yang punya daily task'), /Maksud fitur atau tindakan belum jelas/);
  assert.equal(procedureTopic('cara edit daily task "Hapus meeting"')?.id, 'daily');
  assert.match(followUpQuestion('kalau dihapus?', 'bagaimana membuat meeting?'), /meeting/);
  const followUp = await answerNative(followUpQuestion('kalau dihapus?', 'bagaimana membuat meeting?'), 'HELPER', staff, noBusinessAccess as any);
  assert.match(followUp.content, /Hapus Meeting/);
  assert.equal(followUpQuestion('kalau daily task dihapus?', 'bagaimana membuat meeting?'), 'kalau daily task dihapus?');
  const savedKey = env.MARBOT_AI_API_KEY, savedModel = env.MARBOT_AI_MODEL, originalFetch = global.fetch;
  let providerCalls = 0;
  try {
    env.MARBOT_AI_API_KEY = 'fixture'; env.MARBOT_AI_MODEL = 'fixture';
    global.fetch = async () => { providerCalls++; throw new Error('Procedure questions must bypass provider planning'); };
    for (const prompt of ['apakah saya bisa buat proyek A untuk B dengan PM C?', 'bisa ubah tugas "Login" status "IN_PROGRESS"?', 'buat proyek A untuk B dengan PM C?', 'bagaimana create invoice?']) {
      assert(isProcedureQuestion(prompt), prompt);
      assert.equal(proposeAction(prompt, staff), null);
      assert.equal(await proposeNamedTaskAction(prompt, staff, noBusinessAccess as any), null);
      assert.equal(await planResourceQuestion(prompt, staff, new AbortController().signal), null);
      assert.equal(await planNativeQuestion(prompt, {}, new AbortController().signal), prompt);
      assert.equal(validateNativePlan({ type: 'action', kind: 'project.create', payload: { project_name: 'A', customer_name: 'B', manager_name: 'C' } }, prompt), null);
      assert.equal(validateNativePlan({ type: 'read', domains: ['projects'] }, prompt), null);
      scenarios++;
    }
    assert.equal(providerCalls, 0);
  } finally { env.MARBOT_AI_API_KEY = savedKey; env.MARBOT_AI_MODEL = savedModel; global.fetch = originalFetch; }
  assert.equal(proposeAction('buat proyek A untuk B dengan PM C', { ...staff, roleCode: RoleCode.PROJECT_MANAGER })?.action?.kind, 'project.create');
  const feature = await answerNative('bagaimana fitur meeting dalam sistem?', 'HELPER', staff, noBusinessAccess as any);
  assert.match(feature.content, /CANCELLED/);
  const authority = await answerNative('bagaimana role aktif saya?', 'HELPER', staff, noBusinessAccess as any);
  assert.match(authority.content, /Peran aktif: STAFF/);
  console.log(`Marbot help intent: ${scenarios} language/role/operation scenarios plus clarification, follow-up, literal names and planner guards passed; no business reads or mutations.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
