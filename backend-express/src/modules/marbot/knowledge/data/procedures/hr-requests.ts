import type { ProcedureRule } from '../../schemas/procedure.schema';

export const hrRequestProcedures: ProcedureRule[] = [
  {
    id: 'reports.default',
    topic: 'reports',
    title: 'Laporan kerja',
    targetPath: '/reporting?tab=periodic',
    version: '2026-10-06',
    keywords: /laporan|report/i,
    content: {
      summary: 'Buka menu Laporan lalu pilih tab Ringkasan Berkala untuk melihat ringkasan aktivitas dari task harian pada periode berjalan. Tombol Laporan Berkala di Tugas Harian, jika tersedia, merupakan pintasan ke halaman yang sama. Data yang muncul mengikuti peran dan akses Anda. Jika menu tidak tersedia, hubungi admin perusahaan.',
    },
  },
  {
    id: 'timesheet.default',
    topic: 'timesheet',
    title: 'Timesheet dan lembur',
    targetPath: '/tasks',
    version: '2026-10-07',
    keywords: /timesheet|timer|lembur|jam kerja/i,
    content: {
      summary: 'Sebagai Staff, buka Tugas Harian lalu bagian Timesheet & Lembur Saya. Pilih proyek, tanggal kerja, dan task bila diperlukan, lalu mulai timer kerja. Hentikan timer saat selesai. Untuk lembur, mulai dan hentikan timer lembur serta isi alasannya. Kirim catatan setelah timer berhenti, lalu periksa riwayat dan status approval. Durasi dihitung server dari waktu mulai/selesai; jangan mengisi durasi manual.',
    },
  },
  {
    id: 'leave.default',
    topic: 'leave',
    title: 'Pengajuan cuti',
    targetPath: '/dashboard',
    version: '2026-10-07',
    keywords: /cuti|izin|leave/i,
    content: {
      summary: 'Buka Dashboard, cari Kartu Permintaan Aktif, lalu pilih Tambahkan Kartu. Pada Request Type pilih Leave Request. Isi tanggal pelaksanaan dan Request Details; lampirkan tautan dokumen bila diperlukan. Pilih Simpan Draft untuk menyimpan sementara atau Kirim Request untuk mengajukan. Setelah terkirim, status dapat dilihat pada kartu permintaan. Persetujuan dilakukan oleh pejabat yang berwenang sesuai alur perusahaan.',
    },
  },
];
