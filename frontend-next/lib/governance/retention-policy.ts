export interface RetentionScheduleItem {
  id: string;
  ropaRef: string;
  category: string;
  subjectCategories: string;
  retentionPeriod: string;
  deletionMethod: string;
  ownerRole: string;
  legalBasis: string;
}

export const RETENTION_POLICY_META = {
  documentId: "POL-GOV-RET-01",
  title: "Kebijakan Masa Retensi & Pemusnahan Data Pribadi",
  legalReferences:
    "PP No. 33 Tahun 2026 Pasal 74–75, UU No. 27 Tahun 2022 (UU PDP) Pasal 16 ayat (2) huruf e & Pasal 43–44, serta UU KUP",
  principles: [
    "Data Pribadi hanya disimpan selama masih relevan dengan tujuan pemrosesan yang sah atau selama diwajibkan oleh peraturan perundang-undangan.",
    "Apabila jangka waktu retensi berakhir, tujuan pemrosesan telah tercapai, atau terdapat permintaan penghapusan yang sah (DSR) tanpa kewajiban penahanan hukum, Pengendali wajib melakukan penghapusan atau pemusnahan secara aman sehingga data tidak dapat direkonstruksi kembali.",
    "Bukti pelaksanaan pemusnahan atau anonimisasi dicatat dalam log audit tata kelola.",
  ],
  legalHoldNote:
    "Apabila data pribadi sedang menjadi objek sengketa hukum, pemeriksaan pajak, atau investigasi insiden keamanan aktif, pemusnahan ditunda (legal hold) hingga proses hukum selesai dan dicatat oleh DPO.",
};

export const RETENTION_SCHEDULE: RetentionScheduleItem[] = [
  {
    id: "RET-01",
    ropaRef: "ROPA-01",
    category: "Akun & Autentikasi IAM",
    subjectCategories: "Karyawan, Admin Perusahaan, Pengguna Terundang",
    retentionPeriod: "Selama akun aktif + 2 tahun setelah penonaktifan (log audit keamanan: 5 tahun)",
    deletionMethod: "Penghapusan kredensial/secret MFA dan anonimisasi profil pada iam_user",
    ownerRole: "Super Admin & DPO",
    legalBasis: "PP 33/2026 Pasal 74–75; Pelaksanaan Perjanjian & Keamanan Sistem (UU PDP Pasal 20)",
  },
  {
    id: "RET-02",
    ropaRef: "ROPA-02",
    category: "Proyek, CRM & Penagihan Keuangan",
    subjectCategories: "PIC Klien B2B, Karyawan Pelaksana",
    retentionPeriod: "10 tahun untuk faktur, pajak, dan buku besar; 3 tahun setelah proyek/deal ditutup untuk catatan non-fiskal",
    deletionMethod: "Arsip terkunci selama masa wajib, lalu hard-delete & penimpaan backup kedaluwarsa",
    ownerRole: "Company Admin & Finance Lead",
    legalBasis: "UU KUP (retensi dokumen perpajakan 10 tahun); PP 33/2026 Pasal 74–75",
  },
  {
    id: "RET-03",
    ropaRef: "ROPA-03",
    category: "Asisten AI / Marbot & Knowledge Engine",
    subjectCategories: "Pengguna Internal (Staff, SPV, PM, Admin)",
    retentionPeriod: "1 tahun untuk riwayat percakapan/prompt AI; 5 tahun untuk log audit akses",
    deletionMethod: "Purge terjadwal pada tabel percakapan AI & anonimisasi user_id pada log",
    ownerRole: "Engineering Lead & DPO",
    legalBasis: "PP 33/2026 Pasal 74–75; Kepentingan yang Sah & Audit Keamanan",
  },
  {
    id: "RET-04",
    ropaRef: "ROPA-04",
    category: "Integrasi WhatsApp CRM",
    subjectCategories: "Prospek/Leads, PIC Pelanggan Eksternal",
    retentionPeriod: "Selama relasi aktif + 3 tahun sejak interaksi terakhir (atau lebih cepat via DSR)",
    deletionMethod: "Penghapusan riwayat pesan inbound/outbound & anonimisasi nomor kontak",
    ownerRole: "CRM Lead & Company Admin",
    legalBasis: "PP 33/2026 Pasal 74–75; UU PDP Pasal 20 & 43",
  },
  {
    id: "RET-05",
    ropaRef: "ROPA-05",
    category: "Procurement & Data Vendor",
    subjectCategories: "PIC Vendor/Supplier, Pemilik Usaha Perorangan",
    retentionPeriod: "10 tahun untuk PO, faktur vendor, dan bukti pembayaran",
    deletionMethod: "Pengarsipan terkunci lalu penghapusan permanen dari database & arsip",
    ownerRole: "Procurement & Finance Lead",
    legalBasis: "UU KUP (10 tahun); PP 33/2026 Pasal 74–75",
  },
  {
    id: "RET-06",
    ropaRef: "ROPA-06",
    category: "Inventory & Aset Custodian",
    subjectCategories: "Karyawan Pemegang Aset, Petugas Gudang",
    retentionPeriod: "Selama aset aktif + 5 tahun setelah disposal aset",
    deletionMethod: "Anonimisasi identitas custodian pada histori aset tanpa merusak saldo ledger",
    ownerRole: "Warehouse / Asset Lead & Company Admin",
    legalBasis: "PP 33/2026 Pasal 74–75; Tata Kelola Aset & Audit Internal",
  },
  {
    id: "RET-07",
    ropaRef: "ROPA-07",
    category: "Consent Ledger & Tiket DSR",
    subjectCategories: "Seluruh Pengguna & Pemohon DSR Publik",
    retentionPeriod: "5 tahun sejak pencabutan persetujuan atau penutupan tiket DSR",
    deletionMethod: "Penghapusan aman / anonimisasi permanen setelah masa pembuktian hukum selesai",
    ownerRole: "Data Protection Officer (DPO)",
    legalBasis: "UU PDP Pasal 20, 30–35; PP 33/2026 Pasal 74–75",
  },
];
