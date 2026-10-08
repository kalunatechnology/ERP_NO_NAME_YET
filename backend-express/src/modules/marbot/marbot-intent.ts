/** Topic and requested operation are distinct. Quoted record names are data. */
export function intentText(message: string) {
  return message.normalize('NFKC').replace(/["“][^"”]*["”]/g, '').replace(/'[^']*'/g, '').toLowerCase()
    .replace(/\bdi\s+(hapus|edit|ubah|buat|tambah|batalkan)\b/g, 'di$1');
}

const operationPatterns = {
  delete: /\b(?:hapus(?:kan)?|menghapus|dihapus|delete|remove|hapusnya)\b/,
  cancel: /\b(?:batal(?:kan)?|membatalkan|dibatalkan|cancel)\b/,
  edit: /\b(?:edit|mengedit|diedit|ubah|mengubah|diubah|update|perbarui|memperbarui|koreksi)\b/,
  publish: /\b(?:publikasikan|mempublikasikan|publikasi|publish|terbitkan|menerbitkan)\b/,
  approve: /\b(?:acc|mengacc|approve|approval|setujui|menyetujui|persetujuan|terima|menerima|tolak|menolak|reject)\b/,
  submit: /\b(?:submit|kirim|mengirim|ajukan|mengajukan)\b/,
  stop: /\b(?:stop|hentikan|menghentikan|berhenti)\b/,
  start: /\b(?:start|mulai|memulai)\b/,
  pay: /\b(?:bayar|membayar|pembayaran|lunasi|melunasi|pencairan|cairkan)\b/,
  export: /\b(?:export|ekspor|download|unduh|cetak|print)\b/,
  restore: /\b(?:restore|pulihkan|memulihkan|dipulihkan|kembalikan|mengembalikan|dikembalikan)\b/,
  transfer: /\b(?:transfer|pindahkan|memindahkan|dipindahkan|alih(?:kan)?|alihkan)\b/,
  archive: /\b(?:arsipkan|mengarsipkan|diarsipkan|archive)\b/,
  create: /\b(?:buat(?:kan)?|membuat|create|tambah(?:kan)?|menambah(?:kan)?|isi|mengisi|input|catat|mencatat)\b/,
} as const;
export type ProcedureOperation = keyof typeof operationPatterns;
function requestedActionText(message: string) {
  const text = intentText(message);
  // Context such as "notulensi sudah publish, apakah bisa edit?" does not
  // request publishing. Prefer the question's how/can clause, then its first verb.
  const how = text.match(/\b(?:cara|caranya|bagaimana|gimana|gmn|how to|how do|how can)\b(.*)/)?.[1];
  const capability = text.match(/\b(?:bisakah|bolehkah|dapatkah|bisa|boleh|dapat|can|could|may)\b(.*)/)?.[1];
  return how ?? capability ?? text;
}
export function procedureOperation(message: string): ProcedureOperation | undefined {
  const text = requestedActionText(message);
  return (Object.keys(operationPatterns) as ProcedureOperation[])
    .map(operation => ({ operation, index: text.search(operationPatterns[operation]) }))
    .filter(match => match.index >= 0).sort((a, b) => a.index - b.index)[0]?.operation;
}

const topics = [
  { id: 'minutes', name: 'notulensi', pattern: /\b(?:notulen(?:si)?|notulis|minutes|notes?|catatan rapat)\b/ },
  { id: 'meeting', name: 'meeting', pattern: /\b(?:meetings?|rapat)\b/ },
  { id: 'weekly', name: 'weekly task', pattern: /\b(?:weekly\s+(?:tasks?|targets?)|(?:tugas|task|target)\s+mingguan|(?:pengajuan|ajuan)\s+(?:(?:target|tugas|task)\s+)?mingguan|mingguan\s+(?:task|tugas))\b/ },
  { id: 'daily', name: 'daily task', pattern: /\b(?:daily\s+tasks?|(?:tugas|task)\s+harian)\b/ },
  { id: 'timesheet', name: 'timesheet', pattern: /\b(?:timesheet|timer|lembur|jam kerja)\b/ },
  { id: 'reports', name: 'laporan kerja', pattern: /\b(?:laporan|reports?)\b/ },
  { id: 'invoice', name: 'invoice', pattern: /\b(?:invoice|faktur|billing|tagihan)\b/ },
  { id: 'leave', name: 'cuti', pattern: /\b(?:cuti|izin|leave)\b/ },
  { id: 'tasks', name: 'task', pattern: /\b(?:tugas|tasks?|pekerjaan)\b/ },
] as const;
export type ProcedureTopic = typeof topics[number]['id'];
export function procedureTopic(message: string) {
  const text = intentText(message);
  // Prefer the explicit object of the action: "hapus meeting yang ada
  // notulensinya" must not become "hapus notulensi".
  const target = requestedActionText(message).match(/\b(?:hapus(?:kan)?|menghapus|delete|remove|batal(?:kan)?|membatalkan|cancel|edit|mengedit|ubah|mengubah|update|buat(?:kan)?|membuat|create|tambah(?:kan)?|isi|mengisi|publikasikan|publish|setujui|acc|mengacc|approve|terima|menerima|tolak|menolak|reject|kirim|ajukan|restore|pulihkan|transfer|pindahkan|arsipkan|archive)\s+(?:(?:saya|sebuah|satu|data|semua|seluruh|a|an|the|my|pada)\s+){0,3}(.+)/)?.[1];
  if (target) {
    const direct = topics.find(topic => new RegExp(`^(?:${topic.pattern.source.replace(/^\\b|\\b$/g, '')})\\b`).test(target));
    return direct;
  }
  return topics.find(topic => topic.pattern.test(text));
}

/** Asking whether/how an action is possible never authorizes that action. */
export function isProcedureQuestion(message: string) {
  const text = intentText(message);
  if (/\b(?:cara|caranya|panduan|tutorial|dimana|di mana|how to|how do|how can)\b/.test(text)) return true;
  if (/\b(?:bagaimana|gimana|gmn)\b/.test(text) && (procedureOperation(text) || procedureTopic(text))) return true;
  if (!procedureOperation(text)) return false;
  return /\b(?:apakah|apa bisa|apa boleh|apa dapat|bisakah|bolehkah|dapatkah|bisa|boleh|dapat|can|could|may|siapa|kenapa|mengapa)\b/.test(text)
    || /\?\s*$/.test(text);
}

export function isIntentCorrection(message: string) {
  return /\b(?:(?:tidak|belum|nggak|gak|ga)\s+(?:paham|mengerti|memahami)|bukan itu|salah paham|jawaban(?:mu|nya)?\s+(?:salah|keliru))\b/.test(intentText(message));
}

/** A secondary write guard after semantic interpretation. Questions/quoted
 * instructions are not commands; polite explicit commands remain supported. */
export function isExplicitWriteRequest(message: string) {
  return !isProcedureQuestion(message) && /^\s*(?:(?:tolong|mohon|please)\s+|saya\s+(?:ingin|mau)\s+)?(?:buat(?:kan)?|membuat|bikin|create|tambah(?:kan)?|menambah(?:kan)?|ubah|mengubah|edit|update|perbarui|memperbarui)\b/.test(intentText(message));
}
