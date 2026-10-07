import { z } from 'zod';
import { NativeScope } from './marbot-native.service';
import { isProcedureQuestion } from './marbot-intent';

const text = z.string().trim().min(1).max(2000);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
  const parsed = new Date(`${v}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === v;
}, 'Tanggal kalender tidak valid');
const project = z.object({ project_name: text, customer_name: text, manager_name: text, description: text.optional() }).strict();
const mainTask = z.object({ project_id: z.string().uuid(), name: text, weight: z.number().min(1).max(100), description: text.optional() }).strict();
const weekly = z.object({ main_task_id: z.string().uuid(), assignee_id: z.string().uuid(), week_number: z.number().int().min(1).max(52), start_date: date, end_date: date, target_description: text }).strict().refine(v => new Date(v.end_date) >= new Date(v.start_date), 'Rentang tanggal tidak valid');
const daily = z.object({ weekly_task_id: z.string().uuid(), title: text, time_slot: text, output_target: text }).strict();
const update = z.object({ id: z.string().uuid(), status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED']).optional(), output_result: text.optional(), block_reason: text.optional(), notes: text.optional() }).strict().refine(v => Object.keys(v).length > 1, 'Tidak ada perubahan');
export type MarbotAction = { kind: 'project.create' | 'task.create' | 'weekly.create' | 'daily.create' | 'task.update' | 'resource.write' | 'task.assign'; payload: Record<string, unknown> };

/** Proposals do not mutate. The canonical ERP API rechecks write authority on execution. */
export function proposeAction(message: string, scope: NativeScope): { content: string; tools: string[]; sources: string[]; action?: MarbotAction } | null {
  if (isProcedureQuestion(message)) return null;
  if (/^\s*(assign|tugaskan|assignment)\s+(task|tugas)\b/i.test(message)) {
    const base = { tools: ['action.proposal'], sources: ['ERP:projects-api'] };
    if (!scope.enabledModules.includes('PROJECTS') || scope.blockedReadModules?.includes('PROJECTS') || scope.blockedWriteModules?.includes('PROJECTS')) return { ...base, content: 'Assignment tidak tersedia dalam akses Anda.' };
    try {
      const start = message.indexOf('{');
      const payload = z.object({ id: z.string().uuid(), user_ids: z.array(z.string().uuid()).min(1).max(30) }).strict().parse(start < 0 ? {} : JSON.parse(message.slice(start)));
      return { ...base, content: `Usulan assignment tambahan Main Task (belum disimpan):\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\`\nKonfirmasi diperlukan. Backend memeriksa authority proyek dan keanggotaan aktif.`, action: { kind: 'task.assign', payload } };
    } catch { return { ...base, content: 'Assignment memerlukan JSON dengan id Main Task (UUID) dan user_ids (array UUID user). Tidak ada perubahan.' }; }
  }
  const createProject = /^\s*(?:buatkan|buat|tambahkan|create)\s+(?:project|proyek)\b/i.test(message);
  const updateTask = /^\s*(?:ubah|update|perbarui)\s+(?:task|tugas)\b/i.test(message);
  const createWeekly = /^\s*(?:buatkan|buat|tambahkan|create)\s+(?:weekly target|weekly task|target mingguan)\b/i.test(message);
  const createDaily = /^\s*(?:buatkan|buat|tambahkan|create)\s+(?:daily task|tugas harian)\b/i.test(message);
  const createMain = /^\s*(?:buatkan|buat|tambahkan|create)\s+(?:main task|task|tugas)\b/i.test(message) && !createDaily;
  if (!createProject && !updateTask && !createWeekly && !createDaily && !createMain) return null;
  const response = (content: string, action?: MarbotAction) => ({ content, tools: ['action.proposal'], sources: ['ERP:projects-api'], ...(action ? { action } : {}) });
  if (!scope.enabledModules.includes('PROJECTS')) return response('Modul Projects tidak tersedia untuk akses Anda. Tidak ada data diubah.');
  if (scope.blockedWriteModules?.includes('PROJECTS') || scope.blockedReadModules?.includes('PROJECTS')) return response('Policy field/data scope membatasi operasi ini. Asisten belum memiliki evaluator yang aman untuk policy tersebut; tidak ada data diubah.');
  if (createProject && !['PROJECT_MANAGER', 'OPERATIONAL_MANAGER', 'COMPANY_ADMIN'].includes(scope.roleCode)) return response('Peran aktif Anda tidak diizinkan membuat proyek. Tidak ada data diubah.');
  const json = message.indexOf('{');
  if (json < 0 && (createWeekly || createDaily || createMain)) return response(createWeekly
    ? 'Usulan target mingguan memerlukan JSON dengan main_task_id, assignee_id, week_number (1–52), start_date, end_date (YYYY-MM-DD) dan target_description. Assignee harus sudah diassign ke Main Task.'
    : createDaily ? 'Sebutkan nama tugas, target mingguan milik Anda, jam, dan hasil yang ditargetkan. Contoh: Buat tugas harian "Perbaiki login" untuk target mingguan "Sprint 1" jam "08:00-09:00" hasil "Login berfungsi". Format JSON dengan weekly_task_id, title, time_slot, output_target juga didukung.'
    : 'Usulan Main Task memerlukan JSON dengan project_id, name dan weight (1–100). Backend memeriksa kewenangan atas proyek.');
  if (json < 0 && createProject) {
    // Deterministic grammar: all three values must be stated by the user. Never infer a manager/customer.
    const parts = message.match(/^\s*(?:buatkan|buat|tambahkan|create)\s+(?:project|proyek)\s+(.+?)\s+untuk\s+(.+?)\s+dengan\s+(?:PM|project manager|manajer proyek)\s+(.+?)\s*$/i);
    const unquote = (value: string) => value.trim().replace(/^["“]([^"”]+)["”]$/, '$1');
    if (parts && !parts.slice(1).some(value => /[{}\n\r]/.test(value))) {
      const parsed = project.safeParse({ project_name: unquote(parts[1]), customer_name: unquote(parts[2]), manager_name: unquote(parts[3]) });
      if (parsed.success) return response(`Usulan proyek (belum disimpan):\nNama: ${parsed.data.project_name}\nCustomer: ${parsed.data.customer_name}\nPM: ${parsed.data.manager_name}\n\nKonfirmasikan untuk menyimpan. Backend memeriksa hak akses dan membaca ulang hasil.`, { kind: 'project.create', payload: parsed.data });
    }
  }
  if (json < 0) return response(createProject
    ? 'Nama proyek, customer, dan PM wajib diisi. Misalnya: Buat proyek Website Toko untuk PT Contoh dengan PM Melika. Saya akan menampilkan usulan untuk dikonfirmasi sebelum penyimpanan. Format JSON juga tetap didukung.'
    : 'Sebutkan nama task milik Anda dan perubahan, misalnya: Ubah tugas "Perbaiki login" catatan "Validasi selesai", atau Ubah tugas "Perbaiki login" status "IN_PROGRESS". Format JSON dengan id, status, output_result, block_reason, notes tetap didukung. Penyelesaian wajib memiliki output hasil; kendala wajib memiliki alasan. Backend memeriksa ownership dan checklist.' );
  let raw: unknown;
  try { raw = JSON.parse(message.slice(json)); } catch { return response('Input JSON tidak valid. Tidak ada data diubah.'); }
  const parsed = (createProject ? project : createWeekly ? weekly : createDaily ? daily : createMain ? mainTask : update).safeParse(raw);
  if (!parsed.success) return response(`Input tidak valid: ${parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}. Tidak ada data diubah.`);
  const action: MarbotAction = { kind: createProject ? 'project.create' : createWeekly ? 'weekly.create' : createDaily ? 'daily.create' : createMain ? 'task.create' : 'task.update', payload: parsed.data };
  return response(`Usulan ${action.kind}:\n\n\`\`\`json\n${JSON.stringify(parsed.data, null, 2)}\n\`\`\`\n\nBelum disimpan. Konfirmasikan usulan untuk menjalankan API ERP. Backend memeriksa permission dan aturan bisnis kembali; hasil dibaca ulang sebelum ditampilkan.`, action);
}
