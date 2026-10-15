import type { ProcedureRule } from '../../schemas/procedure.schema';

export const meetingProcedures: ProcedureRule[] = [
  {
    id: 'meeting.delete',
    topic: 'meeting',
    operation: 'delete',
    title: 'Hapus meeting',
    targetPath: '/requests',
    version: '2026-10-07',
    authorization: {
      allowedRoles: ['PROJECT_MANAGER', 'DIRECTOR'],
      requiredModules: ['REQUESTS'],
      requiresWriteAccess: true,
      roleDeniedMessage: (role) => `Peran aktif Anda ${role} tidak diizinkan menghapus meeting, meskipun Anda pembuat atau pesertanya. Minta PM atau Director menindaklanjuti.`,
      moduleBlockedMessage: (role) => `Peran aktif Anda ${role} memenuhi syarat role, tetapi akses perubahan Requests belum tersedia dalam konteks asisten. Hak akses aplikasi tetap harus diperiksa.`,
      roleMatchMessage: (role) => `Peran aktif Anda ${role} memenuhi syarat role untuk menghapus meeting. Meeting tertentu tetap harus ada dalam company aktif dan belum CANCELLED.`,
      denialMessage: 'Meeting yang sudah dibuat dapat dihapus oleh PM atau Director pada company aktif.',
    },
    content: {
      summary: 'Buka Requests & Meetings → Meeting, pilih Hapus pada meeting yang dimaksud, lalu konfirmasi. Dari detail kartu permintaan meeting di Dashboard, tombolnya bernama Hapus Meeting. Meeting, tiket dan workflow ditandai CANCELLED sehingga hilang dari daftar aktif; notulensi dan tautan tindak lanjut tetap disimpan. Pada recurring, tindakan ini membatalkan meeting/seri, bukan hanya satu tanggal. Ini penjelasan hak dan langkah aplikasi; saya belum menghapus meeting.',
    },
  },
  {
    id: 'meeting.cancel',
    topic: 'meeting',
    operation: 'cancel',
    title: 'Hapus meeting',
    targetPath: '/requests',
    version: '2026-10-07',
    authorization: {
      allowedRoles: ['PROJECT_MANAGER', 'DIRECTOR'],
      requiredModules: ['REQUESTS'],
      requiresWriteAccess: true,
      roleDeniedMessage: (role) => `Peran aktif Anda ${role} tidak diizinkan menghapus meeting, meskipun Anda pembuat atau pesertanya. Minta PM atau Director menindaklanjuti.`,
      moduleBlockedMessage: (role) => `Peran aktif Anda ${role} memenuhi syarat role, tetapi akses perubahan Requests belum tersedia dalam konteks asisten. Hak akses aplikasi tetap harus diperiksa.`,
      roleMatchMessage: (role) => `Peran aktif Anda ${role} memenuhi syarat role untuk menghapus meeting. Meeting tertentu tetap harus ada dalam company aktif dan belum CANCELLED.`,
      denialMessage: 'Meeting yang sudah dibuat dapat dihapus oleh PM atau Director pada company aktif.',
    },
    content: {
      summary: 'Buka Requests & Meetings → Meeting, pilih Hapus pada meeting yang dimaksud, lalu konfirmasi. Dari detail kartu permintaan meeting di Dashboard, tombolnya bernama Hapus Meeting. Meeting, tiket dan workflow ditandai CANCELLED sehingga hilang dari daftar aktif; notulensi dan tautan tindak lanjut tetap disimpan. Pada recurring, tindakan ini membatalkan meeting/seri, bukan hanya satu tanggal. Ini penjelasan hak dan langkah aplikasi; saya belum menghapus meeting.',
    },
  },
  {
    id: 'meeting.create',
    topic: 'meeting',
    operation: 'create',
    title: 'Membuat meeting',
    targetPath: '/requests',
    version: '2026-10-07',
    content: {
      summary: 'Buka Requests & Meetings → Meeting → Meeting Baru. Isi judul, waktu mulai/selesai, jenis meeting, peserta, organizer/notulis dan agenda sesuai form. Waktu selesai harus setelah waktu mulai. Pilih sekali atau recurring; recurring memerlukan tanggal akhir dan hari pengulangan. Simpan draft atau kirim sesuai tombol form. Ini panduan; belum ada meeting dibuat melalui chat.',
    },
  },
  {
    id: 'meeting.submit',
    topic: 'meeting',
    operation: 'submit',
    title: 'Mengirim draft meeting',
    targetPath: '/requests',
    version: '2026-10-07',
    content: {
      summary: 'Buka detail meeting DRAFT, periksa jadwal dan peserta, lalu gunakan Publikasikan Meeting atau Kirim / Publikasikan Meeting. Pengiriman draft diperiksa berdasarkan pembuat/organizer atau role administratif yang diizinkan. Hasil aktif menjadi SCHEDULED dan tiket REGISTERED; peserta menerima undangan. Tidak diperlukan approval awal OM untuk mengaktifkan meeting baru. Ini pengiriman meeting, bukan publikasi notulensi.',
    },
  },
  {
    id: 'meeting.publish',
    topic: 'meeting',
    operation: 'publish',
    title: 'Mengirim draft meeting',
    targetPath: '/requests',
    version: '2026-10-07',
    content: {
      summary: 'Buka detail meeting DRAFT, periksa jadwal dan peserta, lalu gunakan Publikasikan Meeting atau Kirim / Publikasikan Meeting. Pengiriman draft diperiksa berdasarkan pembuat/organizer atau role administratif yang diizinkan. Hasil aktif menjadi SCHEDULED dan tiket REGISTERED; peserta menerima undangan. Tidak diperlukan approval awal OM untuk mengaktifkan meeting baru. Ini pengiriman meeting, bukan publikasi notulensi.',
    },
  },
  {
    id: 'meeting.default',
    topic: 'meeting',
    title: 'Meeting',
    targetPath: '/requests',
    version: '2026-10-07',
    content: {
      summary: 'Buka Requests & Meetings → Meeting untuk melihat agenda yang dapat Anda akses. Sebutkan tujuan Anda: membuat meeting, menghapus meeting, atau membuat/edit/publikasi notulensi. Ketiga tindakan tersebut mempunyai hak akses dan hasil berbeda.',
    },
  },
  {
    id: 'minutes.publish',
    topic: 'minutes',
    operation: 'publish',
    title: 'Publikasi notulensi',
    targetPath: '/requests',
    version: '2026-10-07',
    content: {
      summary: 'Buka meeting dan pilih tanggal pertemuan yang benar. Simpan draft terlebih dahulu, isi ringkasan atau pembahasan, lalu pilih Publikasikan jika hak editor tersedia. Draft yang dipublikasikan menjadi PUBLISHED dan tidak dapat ditimpa. Meeting sekali beserta tiket menjadi COMPLETED; recurring hanya menyelesaikan notulensi tanggal terkait dan seri tetap berjalan. Saya belum mempublikasikan apa pun.',
    },
  },
  {
    id: 'minutes.create',
    topic: 'minutes',
    operation: 'create',
    title: 'Membuat notulensi',
    targetPath: '/requests',
    version: '2026-10-07',
    content: {
      summary: 'Notulensi baru dapat dibuat pada tanggal pertemuan yang belum mempunyai catatan. Buka meeting dan tanggal yang benar, pilih Tambah Notulensi, isi pembahasan, ringkasan, keputusan dan tindak lanjut, lalu simpan draft.\n\nPada meeting sekali dengan notulis khusus, notulis yang ditunjuk serta Super Admin, Company Admin atau Director dapat menyusun. Pada recurring atau tanpa notulis khusus, organizer/peserta yang terkait juga dapat menyusun. Hak editor mengikuti permission detail meeting; menjadi PM saja tidak otomatis memberikan hak editor untuk meeting sekali dengan notulis lain. Simpan draft tidak mengirim notifikasi publikasi. Ini panduan; belum ada catatan diubah.',
    },
  },
  {
    id: 'minutes.edit',
    topic: 'minutes',
    operation: 'edit',
    title: 'Edit notulensi',
    targetPath: '/requests',
    version: '2026-10-07',
    content: {
      summary: 'Draft notulensi dapat diedit. Buka meeting dan tanggal yang benar, pilih Edit Notulensi, perbarui isinya, lalu simpan draft. Notulensi PUBLISHED sudah dipublikasikan dan tidak dapat diedit atau ditimpa.\n\nPada meeting sekali dengan notulis khusus, notulis yang ditunjuk serta Super Admin, Company Admin atau Director dapat menyusun. Pada recurring atau tanpa notulis khusus, organizer/peserta yang terkait juga dapat menyusun. Hak editor mengikuti permission detail meeting; menjadi PM saja tidak otomatis memberikan hak editor untuk meeting sekali dengan notulis lain. Simpan draft tidak mengirim notifikasi publikasi. Ini panduan; belum ada catatan diubah.',
    },
  },
  {
    id: 'minutes.default',
    topic: 'minutes',
    title: 'Notulensi meeting',
    targetPath: '/requests',
    version: '2026-10-07',
    keywords: /notulen|notulis|minutes|notes?|catatan rapat/i,
    content: {
      summary: 'Buka Requests & Meetings, pilih meeting dan tanggal pertemuan yang benar. Pilih Tambah Notulensi atau Edit Notulensi, isi pembahasan, ringkasan, keputusan dan tindak lanjut, lalu simpan draft. Pada meeting sekali dengan notulis khusus, notulis yang ditunjuk serta role executive administratif yang diizinkan dapat menyusun. Pada recurring atau tanpa notulis khusus, organizer/peserta yang terkait juga dapat menyusun. Hak editor mengikuti permission detail meeting. Notulensi PUBLISHED tidak dapat diedit atau ditimpa. Publikasikan draft setelah diperiksa; diperlukan ringkasan atau pembahasan. Publikasi meeting sekali menutup meeting dan tiket, sedangkan recurring hanya mempublikasikan tanggal terkait dan seri tetap berjalan.',
    },
  },
];
