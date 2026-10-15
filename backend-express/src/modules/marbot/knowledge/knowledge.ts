import resourceInventory from './resource-catalog.generated.json';
import { intentText, procedureOperation, procedureTopic, type ProcedureTopic, type ProcedureOperation } from '../brain/reasoning/intent';
import { allModules, allProcedures, findProcedureRule, supportedOperationsByTopic } from './knowledge.registry';
import { evaluateGuidance, formatUnavailable } from './guidance-evaluator';
import type { HelpContext, ProcedureSelection } from './schemas/procedure.schema';

export * from './schemas/procedure.schema';
export * from './schemas/module.schema';
export * from './knowledge.registry';
export * from './guidance-evaluator';
export const moduleKnowledge = allModules;
export const procedures = allProcedures;

export function systemKnowledgeAnswer(message: string, enabledModules: string[], selectedModules?: string[]): string {
  const available = moduleKnowledge.filter(item => enabledModules.includes(item.module));
  const matches = selectedModules
    ? available.filter(item => selectedModules.includes(item.module))
    : /seluruh|semua|fitur sistem|modul sistem/i.test(message)
    ? available
    : available.filter(item => item.keywords.test(message));

  if (!matches.length) {
    return 'Referensi fitur tersebut belum tersedia dalam cakupan modul aktif Anda. Tidak ada kesimpulan mengenai data aktual yang dapat dibuat.';
  }

  return (
    matches
      .map(item => {
        const resources = resourceInventory.resources.filter(resource => resource.module === item.module);
        const reference = resources.length
          ? `\n\nResource API aktual: ${resources.map(resource => resource.key).join(', ')}. Akses baca/tulis tetap diperiksa backend pada eksekusi.`
          : '';
        return `${item.title}\n\n${item.content}${item.path ? `\n\n[Buka ${item.title}](${item.path})` : ''}${reference}`;
      })
      .join('\n\n---\n\n') + '\n\nSumber: route, form, service dan katalog schema ERP. Data aktual harus dibaca dari database.'
  );
}

const selectedNames: Record<ProcedureTopic, string> = {
  minutes: 'notulensi',
  meeting: 'meeting',
  weekly: 'weekly task',
  daily: 'daily task',
  timesheet: 'timesheet',
  reports: 'laporan kerja',
  invoice: 'invoice',
  leave: 'cuti',
  tasks: 'task',
};

/** A validated semantic selection retrieves the exact local reference, without re-matching keywords. */
export function helperAnswer(message: string, context?: HelpContext, selection?: ProcedureSelection): string {
  if (
    !selection &&
    /\b(?:dan|atau|serta)\s+(?:hapus|menghapus|delete|edit|mengedit|ubah|update|buat|membuat|create|publikasikan|publish|approve|setujui|bayar|batalkan)\b/.test(
      intentText(message),
    )
  ) {
    return 'Ada beberapa tindakan dalam pertanyaan Anda. Tanyakan satu tindakan dan jenis record terlebih dahulu agar hak akses serta hasilnya jelas. Belum ada data diubah.';
  }

  const topic = selection
    ? { id: selection.topic, name: selectedNames[selection.topic] }
    : procedureTopic(message);
  const operation = selection ? selection.operation : procedureOperation(message);

  if (!topic) {
    return 'Maksud fitur atau tindakan belum jelas. Sebutkan fitur dan tujuan Anda, misalnya "cara hapus meeting", "edit daily task milik saya", atau "buat notulensi". Saya belum menjalankan query atau mengubah data.';
  }

  // Task disambiguation guard
  if (topic.id === 'tasks' && operation) {
    return 'Jenis task perlu diperjelas: Main Task, Weekly Task, atau Daily Task? Hak create/edit/delete berbeda untuk setiap tingkat. Sebutkan jenis task dan tujuan; belum ada data diubah.';
  }

  // Meeting read query guard
  if (topic.id === 'meeting' && !operation && /\b(?:berapa|jumlah|tampilkan|daftar|kapan|siapa)\b/.test(intentText(message))) {
    return 'Data meeting aktual belum dibaca untuk pertanyaan ini. Buka Requests & Meetings untuk melihat daftar/jadwal yang sesuai akses Anda. Saya belum dapat menyimpulkan jumlah, peserta, atau jadwal dari panduan statis.';
  }

  // Check supported operations for this topic
  const supported = supportedOperationsByTopic[topic.id];
  if (operation && supported && !supported.includes(operation)) {
    return formatUnavailable(topic.name, operation);
  }

  const rule = findProcedureRule(topic.id, operation);
  if (!rule) {
    return formatUnavailable(topic.name, operation);
  }

  return evaluateGuidance(rule, context);
}
