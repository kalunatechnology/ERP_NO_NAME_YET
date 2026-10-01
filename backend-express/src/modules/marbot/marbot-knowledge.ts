// Reviewed against the ERP routes and forms. Versioned with the application.
export const moduleKnowledge = [
  { module: 'GENERAL', title: 'Dashboard', path: '/dashboard', keywords: /dashboard|beranda/i, content: 'Dashboard menampilkan konteks perusahaan aktif dan kartu permintaan. Data serta aksi yang tersedia mengikuti role aktif.' },
  { module: 'PROJECTS', title: 'Projects', path: '/projects', keywords: /proyek|project|wbs|mingguan|assignment/i, content: 'Hierarki eksekusi: Project → Main Task → Weekly Task → Daily Task. Assignment Main Task menentukan peserta; Weekly Task memiliki assignee; Daily Task memiliki owner. Progres dihitung dari checklist dan digulung ke hierarki induk. Output hasil wajib untuk penyelesaian task; alasan wajib untuk task blocked. Perubahan assignment/transfer memakai aksi khusus dengan validasi authority.' },
  { module: 'PROJECTS', title: 'Tugas Harian', path: '/tasks', keywords: /tugas|task|timesheet/i, content: 'Tugas Harian adalah eksekusi personal. Pembuatan task memerlukan assignment Main Task dan ownership Weekly Task. Timesheet terhubung ke employee; master_employee.user_id menghubungkan employee dengan akun user. Status task aktual mengikuti aturan checklist backend.' },
  { module: 'FINANCE', title: 'Finance & Accounting', path: '/finance', keywords: /finance|keuangan|wip|billing|piutang|jurnal|biaya/i, content: 'Halaman mencakup costing & WIP, funding proyek, tagihan vendor, billing termin, piutang, kas & bank, buku besar, laporan keuangan, rekonsiliasi, perpajakan, aset, tutup buku dan audit trail. Biaya proyek aktual asisten hanya mengakui cost entry VALIDATED, APPROVED, POSTED_TO_WIP. Draft/rejected tidak dijumlahkan. Director memiliki akses preview Finance; mutasi operasional dibatasi backend.' },
  { module: 'CRM', title: 'CRM & Commercial', path: '/crm', keywords: /crm|commercial|komersial|customer|pelanggan|deal|inquiry/i, content: 'Halaman mencakup Dashboard, Deals & Credit, Incoming Inquiry, Accounts dan Engagement. Estimating & Quoting serta Contracts & Orders memerlukan modul SALES; Support & Garansi memerlukan SERVICE. Keberadaan tab tidak memberikan permission untuk mengambil data.' },
  { module: 'REPORTING', title: 'Reporting & Observability', path: '/reporting', keywords: /reporting|laporan|kehadiran|attendance/i, content: 'Tab laporan: Executive View, Project P&L, General Ledger, Ringkasan Berkala, Kehadiran dan Operasional. Sumber finance/proyek memerlukan akses modul asal; akses Reporting tidak memberi akses Finance secara otomatis.' },
  { module: 'REQUESTS', title: 'Requests & Meetings', path: '/requests', keywords: /request|meeting|rapat|notulen/i, content: 'Permintaan dan meeting memiliki participant, agenda, minutes, decision serta action item. Editor notulensi dibatasi ke notulis yang ditunjuk. Draft dan publikasi adalah aksi terpisah.' },
  { module: 'ANALYTICS', title: 'Enterprise Repository & Document Catalog', path: '/resources', keywords: /repository|arsip|dokumen|resources/i, content: 'Halaman merupakan pusat arsip digital, katalog transaksi dan dokumentasi operasional. Data katalog mengikuti akses sumbernya.' },
] as const;

export function systemKnowledgeAnswer(message: string, enabledModules: string[]) {
  const available = moduleKnowledge.filter(item => enabledModules.includes(item.module));
  const matches = /seluruh|semua|fitur sistem|modul sistem/i.test(message) ? available : available.filter(item => item.keywords.test(message));
  if (!matches.length) return 'Referensi fitur tersebut belum tersedia dalam cakupan modul aktif Anda. Tidak ada kesimpulan mengenai data aktual yang dapat dibuat.';
  return matches.map(item => `${item.title}\n\n${item.content}\n\n[Buka ${item.title}](${item.path})`).join('\n\n---\n\n') + '\n\nSumber: route, form, dan service ERP versi 2026-10-01. Data aktual harus dibaca dari database.';
}
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
