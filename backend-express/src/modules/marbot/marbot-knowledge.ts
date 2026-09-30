// Reviewed against the ERP routes and forms. Versioned with the application.
export const procedures = [
  { id: 'reports', title: 'Laporan kerja', keywords: /laporan|report/i, path: '/reporting',
    content: 'Buka menu Laporan. Untuk laporan berkala, buka Tugas Harian lalu pilih Laporan Berkala. Data yang muncul mengikuti peran dan akses Anda. Jika menu tidak tersedia, hubungi admin perusahaan.' },
  { id: 'timesheet', title: 'Timesheet dan lembur', keywords: /timesheet|lembur|jam kerja/i, path: '/tasks',
    content: 'Buka Tugas Harian, lalu bagian Timesheet & Lembur Saya. Pilih proyek dan task yang sesuai pada formulir pencatatan waktu. Isi data wajib pada formulir, simpan, lalu periksa catatan di tabel timesheet. Persetujuan mengikuti alur perusahaan.' },
  { id: 'minutes', title: 'Notulensi meeting', keywords: /notulen|notulis|meeting|rapat/i, path: '/requests',
    content: 'Buka Requests & Meetings dan pilih meeting. Periksa nama Notulis. Hanya notulis yang ditunjuk dapat membuka editor. Pilih Tambah Notulensi atau Edit Notulensi, isi pembahasan, ringkasan, keputusan dan tindak lanjut. Simpan draft atau pilih Publikasikan setelah diperiksa.' },
  { id: 'tasks', title: 'Tugas harian', keywords: /tugas|task|pekerjaan/i, path: '/tasks',
    content: 'Buka Tugas Harian. Pilih task yang ditugaskan kepada Anda, catat hasil pekerjaan, bukti atau kendala pada formulir yang tersedia, lalu kirim pembaruan. Periksa status pengajuan setelah tersimpan.' },
  { id: 'leave', title: 'Pengajuan cuti', keywords: /cuti|izin|leave/i, path: '/dashboard',
    content: 'Buka Dashboard, cari Kartu Permintaan Aktif, lalu pilih Tambahkan Kartu. Pada Request Type pilih Leave Request. Isi tanggal pelaksanaan dan Request Details; lampirkan tautan dokumen bila diperlukan. Pilih Simpan Draft untuk menyimpan sementara atau Kirim Request untuk mengajukan. Setelah terkirim, status dapat dilihat pada kartu permintaan. Persetujuan dilakukan oleh pejabat yang berwenang sesuai alur perusahaan.' },
] as const;

export function helperAnswer(message: string): string {
  const matches = procedures.filter(item => item.keywords.test(message));
  if (!matches.length) return 'Saya dapat membantu panduan pengajuan cuti, laporan kerja, tugas harian, timesheet, dan notulensi meeting. Sebutkan fitur yang ingin Anda gunakan. Untuk data terkini, tanyakan progres proyek, task terlambat, biaya proyek, KPI, atau tiket support sesuai akses Anda.';
  return matches.map(item => `${item.title}\n\n${item.content}${item.path ? `\n\n[Buka ${item.title}](${item.path})` : ''}\n\nSumber: panduan ERP • versi 2026-09-30.`).join('\n\n---\n\n');
}
