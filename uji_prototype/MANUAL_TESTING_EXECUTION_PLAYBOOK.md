# BUKU PANDUAN EKSEKUSI PENGUJIAN MANUAL (MANUAL TESTING PLAYBOOK)
## Studi Kasus Simulasi Penggunaan Nyata End-to-End 3 Modul ERP: CRM ➔ Proyek ➔ Finance
**Target Pengguna:** Tester Manual, QA Engineer, Product Owner, & Developer  
**Lingkungan Uji:**  
- **Frontend App:** `http://127.0.0.1:5500` (atau `http://localhost:5500`)  
- **Backend API:** `http://127.0.0.1:8000` (Django REST Framework)  
- **Password Default Seluruh Akun Demo:** `DummyPass123!`

---

## 🎭 DAFTAR ROLE & AKUN PENGUJIAN

| No | Peran / Role | Akun Email | Password | Fungsi & Tanggung Jawab dalam Skenario |
|---|---|---|---|---|
| 1 | **Dummy Administrator** | `dummy.admin@example.com` | `DummyPass123!` | Akses sistem penuh, setup company, reset session. |
| 2 | **Executive (Direksi)** | `executive.demo@erp.local` | `DummyPass123!` | Otorisasi *Credit Override*, approval harga khusus, evaluasi P&L. |
| 3 | **CRM Operational Manager** | `dummy.manager@example.com` | `DummyPass123!` | Approval Quotation, eksekusi *Deal Won*, evaluasi prospek. |
| 4 | **CRM Operational Staff** | `dummy.staff@example.com` | `DummyPass123!` | Input Inquiry pelanggan, hitung estimasi HPP, tiket garansi. |
| 5 | **Project Manager (PM)** | `project.manager.demo@erp.local` | `DummyPass123!` | Kendali stage-gate proyek, WBS, kirim biaya lapangan & termin tagihan. |
| 6 | **Project Assignee (Field)**| `assignee.demo@erp.local` | `DummyPass123!` | Eksekusi task lapangan, input jam kerja (*Timesheet*). |
| 7 | **Finance Demo (Maker)** | `finance.demo@erp.local` | `DummyPass123!` | Verifikasi tagihan AP, validasi cost entry lapangan, draft payment. |
| 8 | **Finance Approver (Checker)**| `finance.approver@example.com` | `DummyPass123!` | Otorisasi batas dana (funding), posting AP/AR, approve transfer bank. |

---

# 📋 URUTAN SKENARIO PENGUJIAN (SCENARIO FLOWMAP)

```text
SCENARIO 01: Setup & Autentikasi Role Pengguna
        ↓
SCENARIO 02: CRM Intake Kebutuhan Klien & Kalkulasi HPP (Estimating)
        ↓
SCENARIO 03: Deal Closed Won & Evaluasi Limit Kredit Klien (Credit Assessment)
        ↓
SCENARIO 04: Pengajuan Pagu Dana Proyek & Persetujuan Finance (Maker-Checker)
        ↓
SCENARIO 05: Inisiasi Proyek & Transisi Stage-Gate Lifecycle
        ↓
SCENARIO 06: Eksekusi Lapangan (Jam Kerja Timesheet & Pemakaian Material)
        ↓
SCENARIO 07: Handoff Biaya Aktual dari Lapangan ke Cost Inbox Finance (WIP Posting)
        ↓
SCENARIO 08: Milestone Selesai ➔ Pengajuan Billing Proposal ➔ Penerbitan Invoice AR
        ↓
SCENARIO 09: Accounts Payable (Tagihan Vendor, 3-Way Match, & Pembayaran Kas/Bank)
        ↓
SCENARIO 10: Rekonsiliasi Bank Otomatis & Pembukuan Jurnal Umum (General Ledger)
        ↓
SCENARIO 11: Layanan Purnajual: Tiket Support & Klaim Garansi Produk
        ↓
SCENARIO 12: Evaluasi Eksekutif: Dashboard Laba Rugi Proyek (P&L) & Gross Margin %
        ↓
SCENARIO 13: Skenario Penolakan, Error Handling & Proteksi Batas (Negative Flows)
        ↓
SCENARIO 14: Pengujian Endpoint Backend Tanpa UI via API Console
```

---

## SCENARIO 01 — Setup Lingkungan, Koneksi Company & Switch Role

### 🎯 Tujuan
Memastikan backend aktif, frontend modular berhasil terhubung ke OpenAPI live, company context tersimpan, dan fitur ganti akun instan berfungsi normal.

### 👥 Aktor
* `dummy.admin@example.com`

### 📦 Kondisi Awal
* Buka browser dan arahkan ke `http://127.0.0.1:5500`.
* Halaman login muncul dengan 8 kartu role akun siap uji.

### 👣 Langkah Eksekusi (Step-by-Step)
1. Pada bagian filter role di atas daftar akun, klik tombol **CRM & Sales**, **Project**, **Finance**, dan **Semua** secara bergantian.
   - *Pemeriksaan:* Pastikan daftar kartu role terfilter secara instan.
2. Pada kartu akun paling atas **Dummy Administrator**, klik tombol **⚡ Masuk**.
3. Sistem akan otomatis login dan membuka halaman **Dashboard** (`#/dashboard`).
4. Perhatikan indikator di pojok kiri bawah Sidebar:
   - *Pemeriksaan:* Pastikan titik status berwarna hijau bertuliskan **API terhubung** (atau kuning bertuliskan **Schema offline** jika backend offline).
5. Pada header topbar sebelah kanan, klik kotak input **Company**. Masukkan ID Tenant (contoh: `1` atau UUID Company Anda).
   - *Pemeriksaan:* Muncul toast hijau bertuliskan *"Company scope disimpan"*.
6. Klik avatar profil pengguna di pojok kanan atas topbar untuk membuka dropdown menu akun.
7. Klik salah satu role lain (misal: **🏛️ Executive**).
   - *Pemeriksaan:* Topbar langsung berubah menampilkan nama `Executive Demo` dan role `EXECUTIVE` tanpa perlu mengetik ulang password.

### 🚩 Checkpoint
* [ ] Login berhasil tanpa error di console browser (`F12`).
* [ ] Company scope `X-Company-ID` tersimpan di `localStorage`.
* [ ] Navigasi sidebar menampilkan seluruh modul API.

---

## SCENARIO 02 — CRM: Intake Kebutuhan Klien & Kalkulasi HPP (Estimating)

### 🎯 Tujuan
Mensimulasikan masuknya permintaan proyek dari calon pelanggan, melakukan kualifikasi prospek teknis, menghitung estimasi biaya dasar (HPP Material + Labor), menentukan persentase keuntungan (*markup*), dan menerbitkan *Sales Quotation*.

### 👥 Aktor
* `dummy.staff@example.com` (CRM Staff)
* `dummy.manager@example.com` (CRM Manager)

### 📝 Data Uji
* **Nama Klien:** PT Wahana Otomasi Maju
* **Email Klien:** `procurement@wahana-otomasi.co.id`
* **Subjek Proyek:** `Pengadaan Sistem Conveyor & Sensor Packaging Line #TEST-01`
* **Estimasi Biaya Material:** `Rp 200.000.000`
* **Estimasi Biaya Tenaga Kerja (Labor):** `Rp 50.000.000`
* **Markup Keuntungan:** `30%` (Harga Penawaran = `Rp 325.000.000`)

### 👣 Langkah Eksekusi (Step-by-Step)
1. Klik avatar topbar ➔ pilih **🧑‍💼 Dummy Operational Staff**.
2. Buka menu **CRM & Sales** pada sidebar (URL menjadi `#/crm`).
3. Jika data belum termuat, klik tombol **Muat Data CRM** di hero banner.
4. Klik tab **Incoming Inquiry** (`#/crm/incoming`).
5. Cari inquiry dengan subjek proyek atau buat baru jika diperlukan. Klik tombol **⚡ Qualify Inquiry** pada inquiry terkait.
   - *Pemeriksaan:* Badge status inquiry berubah dari `DRAFT` menjadi hijau `QUALIFIED`.
6. Klik tab **Estimating & Quoting** (`#/crm/estimate`).
7. Pada panel kiri *Cost Estimating*, klik tombol **⚡ Hitung** pada estimasi biaya.
   - *Pemeriksaan:* Total HPP terhitung Rp 250.000.000 dan Penawaran menjadi Rp 325.000.000.
8. Klik tombol hijau **📄 Buat Quotation**.
   - *Pemeriksaan:* Pada panel kanan *Sales Quotations*, muncul dokumen quotation baru dengan status `DRAFT`.
9. Klik tombol **Minta Approval** pada dokumen penawaran tersebut.
   - *Pemeriksaan:* Status penawaran berubah menjadi `PENDING_APPROVAL`.
10. Ganti akun ke **👔 Dummy Operational Manager** via topbar menu.
11. Buka kembali `#/crm/estimate` ➔ Pada quotation terkait, klik tombol **Setujui (Approve)**.
   - *Pemeriksaan:* Status quotation berubah menjadi `APPROVED`.
12. Klik tombol **Kirim** ➔ lalu klik **Accept** (mensimulasikan klien menyetujui penawaran).
   - *Pemeriksaan:* Status quotation berubah menjadi `ACCEPTED` dan tombol **📦 Convert to Order** muncul.

### 🚩 Checkpoint
* [ ] Dokumen penawaran harga resmi (Quotation) sukses disetujui.
* [ ] Nilai komersial kontrak terkunci sebesar Rp 325.000.000.

---

## SCENARIO 03 — Deal Closed Won & Evaluasi Limit Kredit Klien

### 🎯 Tujuan
Menguji gerbang mitigasi risiko finansial (*Credit Assessment Gate*). Ketika deal ditutup menang (*Won*), sistem otomatis memeriksa riwayat piutang klien, invoice jatuh tempo (*overdue*), dan sisa limit plafon kredit sebelum proyek boleh dieksekusi.

### 👥 Aktor
* `dummy.manager@example.com` (CRM Manager)
* `executive.demo@erp.local` (Executive / Direksi)

### 👣 Langkah Eksekusi (Step-by-Step)
1. Sebagai **Dummy Operational Manager**, buka tab **Deal & Credit Management** (`#/crm/deals`).
2. Pada daftar *Deal Pipeline & Closed Won*, cari opportunity proyek yang bersangkutan.
3. Klik tombol **⚡ Process Deal Won & Check Credit**.
4. Muncul jendela modal **Deal Won & Credit Assessment** yang menampilkan hasil kalkulasi real-time:
   - *Credit Limit Klien*
   - *Total Outstanding Piutang*
   - *Piutang Jatuh Tempo (Overdue)*
   - *Available Credit & Status Risiko*
5. **Kasus A (Kredit Aman):** Status kredit `SAFE / AVAILABLE` ➔ Kesepakatan disetujui langsung untuk lanjut ke Project Management.
6. **Kasus B (Kredit Over-limit / Hold):** Status kredit `HOLD` atau `OVER_LIMIT`:
   - Tombol emas **👑 Executive Override** akan muncul di modal.
   - Beralih akun ke **🏛️ Executive Demo**.
   - Klik tombol **👑 Executive Override**.
   - *Pemeriksaan:* Muncul toast hijau *"Executive Override Berhasil: Pengecualian limit kredit disetujui oleh Direksi"*.
7. Kembali ke tab **Contracts & Orders** (`#/crm/contracts`):
   - *Pemeriksaan:* Terbentuk **Sales Order** resmi berstatus `CONFIRMED` yang siap di-handoff ke Project Management.

### 🚩 Checkpoint
* [ ] Evaluasi kredit terbukti memblokir order berisiko secara otomatis.
* [ ] Fitur Executive Override hanya dapat dieksekusi oleh peran Direksi.
* [ ] Sales Order berhasil terbentuk di database.

---

## SCENARIO 04 — Pengajuan Pagu Dana Proyek & Persetujuan Finance (Maker-Checker)

### 🎯 Tujuan
Menguji pemisahan wewenang (*Separation of Duties*) antara Project Management yang mengajukan kebutuhan anggaran (*Funding Request*) dan Accounting/Finance yang memverifikasi serta mengunci pagu dana (*Funding Approval*) menggunakan prinsip *Maker-Checker*.

### 👥 Aktor
* `project.manager.demo@erp.local` (Project Manager)
* `finance.demo@erp.local` (Finance Maker)
* `finance.approver@example.com` (Finance Approver)

### 📝 Data Uji
* **Tujuan Pengajuan:** `Pagu Anggaran Pelaksanaan Proyek Otomasi Line #TEST-01`
* **Nilai Dana Diajukan:** `Rp 220.000.000`

### 👣 Langkah Eksekusi (Step-by-Step)
1. Ganti akun ke **🏗️ Project Manager Demo**.
2. Buka menu **Accounting / Finance ➔ Funding Approval** (`#/finance/funding`).
3. Periksa daftar pengajuan. Terdapat pengajuan dana dengan status `SUBMITTED`.
4. Ganti akun ke **💼 Finance Demo (Maker)**.
5. Buka kembali `#/finance/funding`. Pada baris pengajuan terkait, klik tombol **Verify**.
   - *Pemeriksaan:* Status pengajuan berubah menjadi biru `VERIFIED`. Tombol aksi berubah menjadi **Approve** dan **Reject**.
6. *(Uji Negatif Hak Akses Maker):* Klik tombol **Approve** menggunakan akun Finance Maker ini.
   - *Pemeriksaan:* Aksi ditolak atau sistem mengharuskan user approver yang berbeda (*Maker-checker protection*).
7. Ganti akun ke **✍️ Finance Approver**.
8. Buka `#/finance/funding` ➔ Klik tombol **Approve**.
   - *Pemeriksaan:* Status pengajuan berubah menjadi hijau `APPROVED` / `ACTIVE`.
   - Plafon pagu anggaran sebesar Rp 220.000.000 resmi disahkan oleh Finance.

### 🚩 Checkpoint
* [ ] Pengajuan dana tidak dapat disetujui langsung tanpa melalui tahap verifikasi.
* [ ] Approval berhasil mengunci limit anggaran proyek.

---

## SCENARIO 05 — Inisiasi Proyek & Transisi Stage-Gate Lifecycle

### 🎯 Tujuan
Menguji kendali gerbang eksekusi proyek (*Stage-Gate System*). Proyek tidak boleh langsung dikerjakan sebelum melewati verifikasi spek order dan alokasi material gudang.

### 👥 Aktor
* `project.manager.demo@erp.local` (Project Manager)

### 👣 Langkah Eksekusi (Step-by-Step)
1. Masuk sebagai **🏗️ Project Manager Demo**.
2. Buka menu **Project Management** pada sidebar (`#/projects`).
3. Pada dropdown **Pilih Proyek**, pilih proyek yang sedang diuji.
4. Perhatikan panel hero proyek:
   - Status awal adalah `DRAFT`.
   - Total Budget: `Rp 325.000.000` (atau sesuai nilai kontrak).
   - Progress Fisik: `0%`.
5. Perhatikan diagram *Project Lifecycle Flow* di tengah halaman. Klik tombol hijau **⚡ Majukan Stage Lifecycle**.
   - **Transisi 1 (Verify):** Status proyek berubah menjadi `VERIFIED` (Menandakan spek teknis order telah divalidasi).
6. Klik kembali tombol **⚡ Majukan Stage Lifecycle**.
   - **Transisi 2 (Reserve Materials):** Status proyek berubah menjadi `MATERIAL_RESERVED` (Sistem mengunci stok komponen di gudang).
7. Klik kembali tombol **⚡ Majukan Stage Lifecycle**.
   - **Transisi 3 (Start Execution):** Status proyek berubah menjadi hijau `STARTED / ACTIVE`.
   - *Pemeriksaan:* Tanggal mulai tercatat dan proyek resmi masuk ke fase pengerjaan lapangan.

### 🚩 Checkpoint
* [ ] Proyek sukses melewati stage gates: `DRAFT` ➔ `VERIFIED` ➔ `MATERIAL_RESERVED` ➔ `STARTED`.
* [ ] Tidak terjadi *skip gate* (melompati tahapan).

---

## SCENARIO 06 — Eksekusi Lapangan (Jam Kerja Timesheet & Pemakaian Material)

### 🎯 Tujuan
Mensimulasikan aktivitas teknisi/engineer di lapangan dalam mencatat jam kerja dan merekam progres tugas-tugas WBS.

### 👥 Aktor
* `assignee.demo@erp.local` (Project Assignee / Field Engineer)
* `project.manager.demo@erp.local` (Project Manager)

### 👣 Langkah Eksekusi (Step-by-Step)
1. Masuk sebagai **👷 Project Assignee Demo**.
2. Buka menu **Project Management** (`#/projects`).
3. Periksa panel kiri **Task & WBS List**.
4. Buka detail task (misal: *Perakitan Panel Kontrol & Wiring*).
5. Masukkan catatan progres dan jam kerja (misal: `40 jam kerja teknisi`).
6. Update status task menjadi `IN_PROGRESS` atau `DONE`.
7. Ganti akun kembali ke **🏗️ Project Manager Demo**.
8. Buka menu `#/projects` ➔ Klik tombol **⚡ Hitung Health Proyek**.
   - *Pemeriksaan:* Indikator *Progress Fisik* proyek naik (contoh: menjadi `65%`), dan indeks *Project Health Score* terhitung normal (`HEALTHY / OK`).

### 🚩 Checkpoint
* [ ] Progres tugas WBS berhasil memperbarui total progres fisik proyek secara otomatis.

---

## SCENARIO 07 — Handoff Biaya Aktual ke Cost Inbox Finance & Posting ke WIP

### 🎯 Tujuan
Menguji jembatan integrasi PM ke Finance. Seluruh biaya riil di lapangan (nota material, upah kerja timesheet, overhead) dikirim oleh PM ke Finance dan dibukukan ke akun *Work-in-Progress (WIP)*.

### 👥 Aktor
* `project.manager.demo@erp.local` (Project Manager)
* `finance.demo@erp.local` (Finance Maker)

### 📝 Data Uji Biaya
* **Biaya 1 (Material Gudang):** `Rp 180.000.000` (Komponen Sensor & Motor Servo)
* **Biaya 2 (Tenaga Kerja / Labor):** `Rp 45.000.000` (Upah Engineer Sprint 1)
* **Total Biaya Aktual Terpakai:** `Rp 225.000.000`

### 👣 Langkah Eksekusi (Step-by-Step)
1. Sebagai **Project Manager**, buka menu `#/projects`.
2. Scroll ke bawah ke panel **Handoff Operasional ke Accounting & Finance**.
3. Klik tombol **+ Kirim Biaya ke Finance**.
   - Pilih Sumber Biaya: `WAREHOUSE`.
   - Elemen Biaya: `MATERIAL`.
   - Deskripsi: `Pengeluaran Sensor & Motor Servo Sprint 1`.
   - Total Biaya: `180000000`.
   - Klik **Kirim ke Cost Inbox**.
4. Klik kembali tombol **+ Kirim Biaya ke Finance**.
   - Pilih Sumber Biaya: `TIMESHEET`.
   - Elemen Biaya: `LABOR`.
   - Deskripsi: `Upah 3 Engineer Sprint 1 (120 Jam)`.
   - Total Biaya: `45000000`.
   - Klik **Kirim ke Cost Inbox**.
5. Beralih akun ke **💼 Finance Demo (Maker)**.
6. Buka menu **Accounting / Finance ➔ Project Costing & WIP** (`#/finance/costing`).
7. Pada tabel *Daftar Cost Inbox Proyek*, terlihat 2 entri biaya di atas dengan status `CAPTURED`.
8. Pada masing-masing baris biaya:
   - Klik tombol **Validate** ➔ Status berubah menjadi `VALIDATED`.
   - Klik tombol **Post to WIP** ➔ Status berubah menjadi hijau `POSTED`.
9. Periksa tabel bawah *Riwayat Snapshot Valuasi WIP*:
   - *Pemeriksaan:* Nilai *Recognized Cost (Biaya WIP)* tercatat bertambah sebesar `Rp 225.000.000`.

### 🚩 Checkpoint
* [ ] Biaya lapangan masuk ke Finance dalam status *unposted* (`CAPTURED`), sehingga tidak bisa memanipulasi buku besar tanpa izin Finance.
* [ ] Setelah di-post, nilai aset WIP proyek bertambah secara akurat.

---

## SCENARIO 08 — Milestone Selesai ➔ Pengajuan Billing Proposal ➔ Penerbitan Invoice AR

### 🎯 Tujuan
Mensimulasikan pencapaian target progres proyek (milestone), di mana PM mengajukan termin penagihan (*Billing Proposal*) ke klien, dan Finance menerbitkan Faktur Penjualan (*Customer Invoice*) resmi.

### 👥 Aktor
* `project.manager.demo@erp.local` (Project Manager)
* `finance.approver@example.com` (Finance Approver)

### 📝 Data Uji Penagihan
* **Trigger:** `PROGRESS_APPROVED` (Progress 65% Selesai)
* **Subtotal Tagihan:** `Rp 200.000.000`
* **PPN (11%):** `Rp 22.000.000`
* **Total Faktur:** `Rp 222.000.000`

### 👣 Langkah Eksekusi (Step-by-Step)
1. Sebagai **Project Manager**, buka menu `#/projects`.
2. Pada panel handoff di bawah, klik tombol **+ Buat Billing Proposal**.
   - Trigger Billing: `PROGRESS_APPROVED`.
   - Subtotal: `200000000`.
   - Pajak (%): `11`.
   - Keterangan: `Termin 1 — Pencapaian Progres Perakitan 65%`.
   - Klik **Simpan Draft Proposal**.
3. Buka menu `#/finance/project-billing`.
4. Pada proposal terkait yang berstatus `SUBMITTED`:
   - Ganti akun ke **✍️ Finance Approver**.
   - Klik tombol **Approve & Create Invoice**.
5. *Pemeriksaan:*
   - Status proposal berubah menjadi `APPROVED`.
   - Dokumen Faktur Penjualan (*Customer Invoice*) resmi diterbitkan dengan nomor seri otomatis.
   - Posisi Piutang Usaha (AR) terbuka sebesar Rp 222.000.000 menunggu pembayaran klien.

### 🚩 Checkpoint
* [ ] Revenue proyek resmi diakui melalui penerbitan Invoice legal.
* [ ] Nilai piutang klien tercatat di sistem keuangan.

---

## SCENARIO 09 — Accounts Payable (Tagihan Vendor, 3-Way Match & Pembayaran)

### 🎯 Tujuan
Menguji siklus pengeluaran kas/bank untuk membayar vendor pengadaan sparepart/subkontraktor melalui pencocokan 3 arah (*3-Way Matching* antara PO, Surat Jalan, dan Invoice Vendor).

### 👥 Aktor
* `finance.demo@erp.local` (Finance Maker)
* `finance.approver@example.com` (Finance Approver)

### 👣 Langkah Eksekusi (Step-by-Step)
1. Sebagai **Finance Demo**, buka menu **Accounting / Finance ➔ Billing & Invoice** (`#/finance/billing`).
2. Klik tombol **+ Buat Billing Baru** untuk mencatat tagihan masuk dari vendor komponen.
3. Masukkan nomor invoice vendor, tanggal jatuh tempo, dan nilai tagihan (contoh: `Rp 50.000.000`).
4. Klik tombol **Verify** pada baris tagihan ➔ Status menjadi `VERIFIED`.
5. Ganti akun ke **Finance Approver** ➔ Klik **Approve** ➔ lalu klik **Post to AP**.
   - *Pemeriksaan:* Hutang Usaha (AP) resmi dibukukan.
6. Buka tab **Payments** (`#/finance/payments`).
7. Klik **+ Buat Batch Payment** untuk melunasi tagihan vendor tersebut.
8. Klik **Submit** ➔ lalu login sebagai Approver dan klik **Approve**.
9. Klik tombol hijau **Execute** dan masukkan nomor referensi transfer bank (contoh: `TRF-BCA-88921`).
   - *Pemeriksaan:* Status tagihan vendor berubah menjadi `PAID` dan saldo hutang berkurang menjadi nol.

### 🚩 Checkpoint
* [ ] Siklus Accounts Payable berjalan tertib: `DRAFT` ➔ `VERIFIED` ➔ `APPROVED` ➔ `POSTED` ➔ `PAID`.
* [ ] Saldo kas/bank dan buku hutang tersinkronisasi.

---

## SCENARIO 10 — Rekonsiliasi Bank Otomatis & General Ledger (Buku Besar)

### 🎯 Tujuan
Memvalidasi pencocokan mutasi rekening koran bank dengan catatan kas internal secara otomatis (*Auto-Reconciliation*) dan memastikan seluruh jurnal umum debet-kredit seimbang.

### 👥 Aktor
* `finance.demo@erp.local` (Finance Maker)

### 👣 Langkah Eksekusi (Step-by-Step)
1. Buka menu **Accounting / Finance ➔ Bank Reconciliation** (`#/finance/reconcile`).
2. Pada baris rekening koran (*Bank Statement*) yang masih berstatus `OPEN` / `UNRECONCILED`:
   - Klik tombol **Auto Reconcile**.
   - *Pemeriksaan:* Sistem membandingkan nominal mutasi bank dengan nomor referensi transfer pembayaran (`TRF-...`).
   - Status statement berubah menjadi hijau `RECONCILED` / `CLOSED`.
3. Buka tab **General Accounting** (`#/finance/accounting`).
4. Periksa daftar *Chart of Accounts (CoA)* dan entri *Journal Entries*:
   - *Pemeriksaan:* Terdapat jurnal debet pada akun *Piutang Usaha (1-1200)* dan kredit pada *Pendapatan Proyek (4-1000)*, serta jurnal debet *Beban Pokok Proyek (5-1000)* dan kredit *Kas/Bank (1-1100)*.

### 🚩 Checkpoint
* [ ] Mutasi bank 100% cocok dengan jurnal internal.
* [ ] Tidak ada jurnal gantung (*unbalanced entry*).

---

## SCENARIO 11 — Layanan Purnajual: Tiket Support & Klaim Garansi Produk

### 🎯 Tujuan
Menguji integrasi CRM Service saat customer mengajukan komplain atau klaim garansi setelah serah terima proyek selesai.

### 👥 Aktor
* `dummy.staff@example.com` (CRM Staff)

### 👣 Langkah Eksekusi (Step-by-Step)
1. Masuk sebagai **🧑‍💼 Dummy Operational Staff**.
2. Buka menu **CRM & Sales ➔ Ticket Support & Warranty** (`#/crm/tickets`).
3. Pada daftar tiket keluhan klien yang berstatus `OPEN`:
   - Klik tombol **🔍 Check Status & Warranty**.
4. Muncul jendela modal verifikasi garansi:
   - *Pemeriksaan:* Sistem memeriksa tanggal kontrak pengiriman vs tanggal hari ini.
   - Menampilkan status garansi: **GARANSI MASIH AKTIF** (Batas Garansi s/d `2027-12-31`).
   - Memberikan rekomendasi solusi: *"Lakukan perbaikan gratis / penggantian sparepart di bawah garansi"*.
5. Tutup modal, lalu klik tombol **✨ Deliver Solution**.
6. Pilih jenis resolusi: `REPAIR_COMPLETED` (Perbaikan Selesai di Lokasi Klien) dan masukkan catatan teknisi.
   - *Pemeriksaan:* Status tiket berubah menjadi hijau `RESOLVED` dan tercatat di riwayat servis pelanggan.

### 🚩 Checkpoint
* [ ] Sistem mampu membedakan produk yang masih dalam masa garansi vs garansi kadaluarsa secara otomatis.
* [ ] Kasus keluhan berhasil ditutup dengan status `RESOLVED`.

---

## SCENARIO 12 — Evaluasi Eksekutif: Dashboard Laba Rugi Proyek (P&L) & Gross Margin %

### 🎯 Tujuan
Sebagai pengujian puncak (*The Climax Verification*), Direksi/Eksekutif membuka laporan observabilitas finansial untuk melihat apakah seluruh alur transaksi dari CRM ➔ Proyek ➔ Finance menghasilkan angka profitabilitas yang akurat.

### 👥 Aktor
* `executive.demo@erp.local` (Executive Direksi)

### 👣 Langkah Eksekusi (Step-by-Step)
1. Masuk sebagai **🏛️ Executive Demo**.
2. Buka menu **📊 Reporting & Observability** pada sidebar (`#/reporting`).
3. Pastikan tab aktif adalah **📊 Project Profit & Loss (P&L Proyek)** (`#/reporting/project-pnl`).
4. Pada dropdown selector proyek di bagian atas, pilih proyek yang baru saja diuji.
5. Amati 4 kartu metrik utama di bagian atas:
   - **Nilai Kontrak (Revenue):** Tercatat sebesar `Rp 325.000.000` (atau sesuai nilai termin invoice yang diakui).
   - **Total Biaya Aktual (COGS / HPP):** Tercatat sebesar `Rp 225.000.000` (Sesuai total pengeluaran Material Rp 180M + Labor Rp 45M yang di-post di Scenario 07).
   - **Gross Profit (Laba Kotor):** `Rp 325.000.000 - Rp 225.000.000 =` **`Rp 100.000.000`** (Angka berwarna hijau).
   - **Gross Margin %:** `(100M / 325M) * 100% =` **`30.8%`**.
6. Periksa panel kiri bawah **Rincian Beban Biaya (Cost Breakdown)**:
   - *Biaya Material:* `Rp 180.000.000`
   - *Biaya Tenaga Kerja (Labor):* `Rp 45.000.000`
   - *Biaya Overhead:* `Rp 0`
7. Klik tab **🏛️ Executive Dashboard & Revenue** (`#/reporting/executive`):
   - *Pemeriksaan:* Menampilkan ringkasan total nilai seluruh pesanan aktif, total hutang vendor yang belum lunas, dan performa portofolio perusahaan.
8. Klik tab **📒 General Ledger & Jurnal Keuangan** (`#/reporting/journals`):
   - *Pemeriksaan:* Seluruh riwayat jurnal transaksi yang terbentuk dari awal hingga akhir tercatat rapi dan berstatus `POSTED`.

### 🚩 Checkpoint
* [ ] Perhitungan Laba Kotor (*Gross Profit*) dan Margin % 100% matematis cocok dengan data riil transaksi lapangan.
* [ ] Seluruh data dari 3 modul terbukti terhubung utuh (*seamlessly integrated*).

---

## SCENARIO 13 — Skenario Penolakan, Error Handling & Proteksi Batas (Negative Flows)

### 🎯 Tujuan
Memastikan sistem memiliki pertahanan yang kokoh (*robust error handling*) terhadap input tidak sah, manipulasi wewenang, dan pelanggaran aturan bisnis.

### 👣 Langkah Eksekusi (Step-by-Step)
1. **Uji 1 (Mencoba Bypass Stage Gate Proyek):**
   - Buat proyek baru dengan status `DRAFT`.
   - Langsung coba panggil perintah `start` tanpa menjalankan `verify` dan `reserve-materials`.
   - *Hasil yang diharapkan:* Sistem menolak dengan pesan error: *"Prasyarat belum lengkap: verified, material_reserved"*.
2. **Uji 2 (Input Biaya Negatif atau Nol):**
   - Pada form kirim biaya proyek, masukkan total biaya `-15000000` atau `0`.
   - *Hasil yang diharapkan:* Form HTML5 / validator menolak submit dengan peringatan *"Nilai harus lebih besar dari 0"*.
3. **Uji 3 (Akses Resource Milik Tenant Lain):**
   - Ganti header `X-Company-ID` menjadi ID company yang tidak sah.
   - *Hasil yang diharapkan:* Query data menampilkan kosong atau menolak akses, tidak membocorkan data rahasia tenant lain (*Multi-tenant data isolation*).
4. **Uji 4 (Token JWT Expired / Blacklist):**
   - Buka menu **Auth Tester** (`#/auth`) ➔ Klik **Logout Sesi**.
   - Coba gunakan token access lama untuk melakukan fetch request.
   - *Hasil yang diharapkan:* Backend mengembalikan response `HTTP 401 Unauthorized`.

---

## SCENARIO 14 — Pengujian Endpoint Backend Langsung via API Console

### 🎯 Tujuan
Menguji endpoint-endpoint backend secara langsung (termasuk yang tidak memiliki tombol khusus di antarmuka) menggunakan fitur bawaan **API Console** yang telah terintegrasi dengan OpenAPI schema live.

### 👣 Langkah Eksekusi (Step-by-Step)
1. Buka menu **API Console** pada sidebar (`#/console`).
2. Pada panel kiri *Operation Filter*, ketik kata kunci endpoint yang ingin diuji (contoh: `flow-status` atau `weekly-monitoring`).
3. Klik salah satu operasi (misal: `GET /api/v1/commands/projects/projects/{id}/flow-status/`).
4. Pada panel kanan, sistem otomatis membentuk form input parameter berdasarkan OpenAPI schema:
   - Pada field `Path parameters -> id`, masukkan UUID proyek yang sedang diuji.
5. Klik tombol **Execute GET**.
   - *Pemeriksaan:* Di bagian bawah muncul response badge hijau `200 OK`, durasi eksekusi (ms), dan payload JSON response lengkap.
6. Klik tombol **Copy cURL** untuk menyalin perintah curl ke clipboard jika ingin dieksekusi di terminal terminal bash/powershell.

---

## 🏁 KESIMPULAN AKHIR PENGUJIAN

Jika seluruh **14 Skenario di atas berhasil dieksekusi dari awal hingga akhir tanpa ada checkpoint yang gagal**, maka sistem **Arsalynt ERP dinyatakan SIAP & LULUS UAT (User Acceptance Testing)** dengan integritas data 100% konsisten melintasi seluruh 3 pilar utama:
$$\text{CRM \& Sales} \longleftrightarrow \text{Project Management} \longleftrightarrow \text{Accounting \& Finance}$$
