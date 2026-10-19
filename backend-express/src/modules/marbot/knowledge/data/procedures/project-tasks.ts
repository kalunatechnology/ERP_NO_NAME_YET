import type { ProcedureRule } from '../../schemas/procedure.schema';

export const projectTaskProcedures: ProcedureRule[] = [
  {
    id: 'weekly.approve',
    topic: 'weekly',
    operation: 'approve',
    title: 'Persetujuan Target Mingguan',
    targetPath: '/projects',
    version: '2026-10-07',
    content: {
      summary: 'Untuk ACC pengajuan staf, gunakan kartu target mingguan di halaman Proyek. PM atau SPV yang ditunjuk sebagai Project Supervisor dapat meninjau pengajuan pada proyek yang mereka kelola.\n\n1. Buka **Proyek** dan pilih proyek staf tersebut.\n2. Pada panel **Persetujuan Target Mingguan** di bagian atas, klik **Tinjau Pengajuan**. Anda akan diarahkan ke **Hierarki Task** dan kartu target berstatus **Menunggu Approval** (PENDING_APPROVAL).\n3. Periksa PIC, isi target, dan tanggal pelaksanaannya. Klik **Approve (Setujui)** untuk menerima atau **Reject (Tolak)** untuk menolak.\n4. Setelah disetujui, target menjadi PLANNED. PIC dapat membuat **Daily Task** langsung dari kartu yang sama. Target REJECTED belum dapat dipakai untuk Daily Task.\n\nJika panel menunjukkan **Belum ada pengajuan menunggu persetujuan**, tidak ada ajuan PENDING_APPROVAL pada proyek yang dipilih. Periksa pilihan proyek dan status ajuan staf. Jika tombol keputusan tidak tersedia, periksa penunjukan Project Supervisor serta akses kelola proyek Anda. Tombol **Hapus** tetap tersedia bagi pengelola; target yang masih memiliki Daily Task harus dikosongkan terlebih dahulu. Panduan ini tidak menyetujui pengajuan melalui chat.',
    },
  },
  {
    id: 'weekly.default',
    topic: 'weekly',
    title: 'Pengajuan Weekly Task',
    targetPath: '/projects',
    version: '2026-10-07',
    keywords: /weekly\s+(?:tasks?|target)|(?:tugas|target)\s+mingguan/i,
    content: {
      summary: 'Sebagai Staff biasa, buka Proyek Ditugaskan, pilih project yang dapat Anda akses, lalu tab Task Terkait Saya. Pada Main Task yang ditugaskan kepada Anda, pilih Ajukan Target Mingguan. Isi target, nomor minggu, tanggal mulai dan selesai; PIC adalah diri sendiri. Setelah disimpan, status Menunggu Approval (PENDING_APPROVAL). PM atau SPV yang ditunjuk sebagai Project Supervisor mereview melalui panel Persetujuan Target Mingguan dengan Approve (Setujui) atau Reject (Tolak). Jika disetujui, Weekly menjadi PLANNED dan dapat digunakan untuk Daily Task; jika ditolak, tetap tercatat REJECTED dan tidak dapat digunakan untuk Daily. Alasan penolakan belum memiliki field khusus. Staff dengan kewenangan Acting PM atau kelola penuh PROJECTS dari Admin mengikuti kewenangan pengelolaan; Weekly yang dibuat dapat langsung aktif.',
    },
  },
  {
    id: 'daily.edit',
    topic: 'daily',
    operation: 'edit',
    title: 'Edit Daily Task',
    targetPath: '/projects',
    version: '2026-10-07',
    content: {
      summary: 'Daily Task hanya dapat diedit oleh pemiliknya pada company aktif. Buka Projects, pilih project dan Weekly Task induknya, lalu pilih Update Daily Task pada task milik Anda. Simpan hasil pekerjaan, catatan atau kendala sesuai form. Status/progress mengikuti checklist; penyelesaian memerlukan output hasil dan blocked memerlukan alasan. Owner dan Weekly induk tidak dapat diganti melalui edit biasa. Setelah tersimpan, progress Weekly dan dashboard dihitung ulang. Hak akses tetap diperiksa ketika menyimpan.',
    },
  },
  {
    id: 'daily.delete',
    topic: 'daily',
    operation: 'delete',
    title: 'Hapus Daily Task',
    targetPath: '/projects',
    version: '2026-10-07',
    content: {
      summary: 'Daily Task hanya dapat dihapus oleh pemiliknya, termasuk ketika PM melihat task orang lain. Buka Projects, pilih project dan Weekly induk, lalu klik Hapus Daily Task dan konfirmasi. Task dihapus, progress induk/dashboard dihitung ulang. Action item meeting tetap disimpan, tetapi tautannya ke Daily Task yang dihapus dilepas. Periksa hasil setelah refresh; saya belum menghapus task.',
    },
  },
  {
    id: 'daily.create',
    topic: 'daily',
    operation: 'create',
    title: 'Membuat Daily Task',
    targetPath: '/tasks',
    version: '2026-10-07',
    content: {
      summary: 'Buka Tugas Harian → Buat Task Harian. Pilih project, Main Task yang ditugaskan kepada Anda dan Weekly Task milik Anda. Weekly PENDING_APPROVAL atau REJECTED belum dapat dipakai. Isi judul, jam dan output target, lalu simpan. Task dibuat dengan Anda sebagai owner; project dan periode mengikuti Weekly induk. Saya belum membuat task melalui penjelasan ini.',
    },
  },
  {
    id: 'daily.submit',
    topic: 'daily',
    operation: 'submit',
    title: 'Membuat Daily Task',
    targetPath: '/tasks',
    version: '2026-10-07',
    content: {
      summary: 'Buka Tugas Harian → Buat Task Harian. Pilih project, Main Task yang ditugaskan kepada Anda dan Weekly Task milik Anda. Weekly PENDING_APPROVAL atau REJECTED belum dapat dipakai. Isi judul, jam dan output target, lalu simpan. Task dibuat dengan Anda sebagai owner; project dan periode mengikuti Weekly induk. Saya belum membuat task melalui penjelasan ini.',
    },
  },
  {
    id: 'tasks.default',
    topic: 'tasks',
    title: 'Tugas harian',
    targetPath: '/tasks',
    version: '2026-10-07',
    keywords: /tugas|task|pekerjaan/i,
    content: {
      summary: 'Buka Tugas Harian. Pilih task yang ditugaskan kepada Anda, catat hasil pekerjaan, bukti atau kendala pada formulir yang tersedia, lalu kirim pembaruan. Periksa status pengajuan setelah tersimpan.',
    },
  },
];
