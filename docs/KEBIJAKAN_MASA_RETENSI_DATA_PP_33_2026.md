# Kebijakan Masa Retensi & Pemusnahan Data Pribadi

**Dokumen ID:** POL-GOV-RET-01  
**Berlaku Untuk:** MarkaSuite / PT Arsalynk Teknologi Indonesia  
**Dasar Hukum:**  
- **PP No. 33 Tahun 2026 Pasal 74–75** (Kewajiban Penetapan Jangka Waktu Penyimpanan, Penghapusan, dan Pemusnahan Data Pribadi)  
- **UU No. 27 Tahun 2022 (UU PDP)** Pasal 16 ayat (2) huruf e, Pasal 43–44  
- **UU KUP / Ketentuan Perpajakan & Akuntansi Indonesia** (kewajiban penyimpanan dokumen transaksi/faktur minimal 10 tahun)  

---

## 1. Prinsip Umum Retensi (PP 33/2026 Pasal 74–75)
1. Data Pribadi hanya disimpan selama masih relevan dengan tujuan pemrosesan yang sah atau selama diwajibkan oleh peraturan perundang-undangan.
2. Apabila jangka waktu retensi berakhir, tujuan pemrosesan telah tercapai, atau terdapat permintaan penghapusan yang sah dari Subjek Data (DSR) tanpa kewajiban penahanan hukum, Pengendali wajib melakukan **penghapusan atau pemusnahan secara aman** sehingga data tidak dapat direkonstruksi kembali.
3. Bukti pelaksanaan pemusnahan/anonimisasi dicatat dalam log audit tata kelola.

---

## 2. Jadwal Masa Retensi & Metode Pemusnahan per Kategori

| No | Kategori Data & Aktivitas (ROPA) | Kategori Subjek Data | Periode Retensi | Metode Pemusnahan / Penghapusan | Penanggung Jawab | Dasar Hukum Retensi |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **Akun & Autentikasi IAM** (`ROPA-01`) | Karyawan, Admin Perusahaan, Pengguna Terundang | Selama akun aktif + **2 tahun** setelah penonaktifan (log audit keamanan: **5 tahun**) | Penghapusan kredensial/secret MFA dan anonimisasi profil pada `iam_user` | Super Admin & DPO | PP 33/2026 Pasal 74–75; Pelaksanaan Perjanjian & Keamanan Sistem (UU PDP Pasal 20) |
| 2 | **Proyek, CRM & Penagihan Keuangan** (`ROPA-02`) | PIC Klien B2B, Karyawan Pelaksana | **10 tahun** untuk faktur, pajak, dan buku besar; **3 tahun** setelah proyek/deal ditutup untuk catatan non-fiskal | Arsip terkunci selama masa wajib, lalu *hard-delete* & penimpaan backup kedaluwarsa | Company Admin & Finance Lead | UU KUP (retensi dokumen perpajakan 10 tahun); PP 33/2026 Pasal 74–75 |
| 3 | **Asisten AI / Marbot & Knowledge Engine** (`ROPA-03`) | Pengguna Internal (Staff, SPV, PM, Admin) | **1 tahun** untuk riwayat percakapan/prompt AI; **5 tahun** untuk log audit akses | *Purge* terjadwal pada tabel percakapan AI & anonimisasi `user_id` pada log | Engineering Lead & DPO | PP 33/2026 Pasal 74–75; Kepentingan yang Sah & Audit Keamanan |
| 4 | **Integrasi WhatsApp CRM** (`ROPA-04`) | Prospek/Leads, PIC Pelanggan Eksternal | Selama relasi aktif + **3 tahun** sejak interaksi terakhir (atau lebih cepat via DSR) | Penghapusan riwayat pesan inbound/outbound & anonimisasi nomor kontak | CRM Lead & Company Admin | PP 33/2026 Pasal 74–75; UU PDP Pasal 20 & 43 |
| 5 | **Procurement & Data Vendor** (`ROPA-05`) | PIC Vendor/Supplier, Pemilik Usaha Perorangan | **10 tahun** untuk PO, faktur vendor, dan bukti pembayaran | Pengarsipan terkunci lalu penghapusan permanen dari database & arsip | Procurement & Finance Lead | UU KUP (10 tahun); PP 33/2026 Pasal 74–75 |
| 6 | **Inventory & Aset Custodian** (`ROPA-06`) | Karyawan Pemegang Aset, Petugas Gudang | Selama aset aktif + **5 tahun** setelah *disposal* aset | Anonimisasi identitas custodian pada histori aset tanpa merusak saldo ledger | Warehouse / Asset Lead & Company Admin | PP 33/2026 Pasal 74–75; Tata Kelola Aset & Audit Internal |
| 7 | **Consent Ledger & Tiket DSR** (`ROPA-07`) | Seluruh Pengguna & Pemohon DSR Publik | **5 tahun** sejak pencabutan persetujuan atau penutupan tiket DSR | Penghapusan aman / anonimisasi permanen setelah masa pembuktian hukum selesai | Data Protection Officer (DPO) | UU PDP Pasal 20, 30–35; PP 33/2026 Pasal 74–75 |

---

## 3. Pengecualian & Penahanan Hukum (*Legal Hold*)
Apabila data pribadi sedang menjadi objek sengketa hukum, pemeriksaan pajak, atau investigasi insiden keamanan aktif, pemusnahan ditunda (*legal hold*) hingga proses hukum selesai dan dicatat oleh DPO.
