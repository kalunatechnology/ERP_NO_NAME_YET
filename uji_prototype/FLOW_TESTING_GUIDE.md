# Panduan Skenario Pengujian End-to-End: Alur Terpadu CRM ➔ Budgeting ➔ Proyek ➔ Finance ➔ Dashboard Keuntungan

Dokumen ini memandu pengujian **alur data bisnis terpadu** pada Arsalynt ERP yang menghubungkan 4 pilar utama sistem:
1. **CRM & Penjualan** (Inquiry, Estimasi HPP, Quotation, Deal Won & Credit Check).
2. **Budgeting & Funding** (Pengajuan anggaran proyek & persetujuan Finance).
3. **Eksekusi Proyek & Biaya Aktual** (Stage-gates, Timesheets, Alokasi Material, Handoff Cost Entry).
4. **Dashboard Keuntungan & Observabilitas** (Penerbitan Invoice, Gross Profit, Gross Margin %, General Ledger).

---

## 🗺️ Diagram Alur Data Terpadu (End-to-End Pipeline)

```mermaid
flowchart TD
    %% TAHAP 1: CRM
    subgraph CRM ["1. CRM & Penjualan"]
        INQ["Customer Inquiry\n(Kebutuhan Klien)"] --> EST["Cost Estimating\n(Hitung HPP + Markup Profit)"]
        EST --> QUOTE["Sales Quotation\n(Penawaran Resmi)"]
        QUOTE --> WON["Deal Closed Won\n(Klien Menyetujui)"]
        WON --> CREDIT{"Evaluasi Kredit Klien\n(Plafon & Overdue)"}
        CREDIT -- "Kredit Aman / Override" --> SO["Sales Order Confirmed\n(Revenue Commitment)"]
    end

    %% TAHAP 2: BUDGETING
    subgraph Budgeting ["2. Budgeting & Funding Approval"]
        SO --> FUND_REQ["PM Mengajukan Funding Request\n(Plafon Anggaran Proyek)"]
        FUND_REQ --> FUND_VERIFY["Finance Verifikasi Kebutuhan\n(Status: VERIFIED)"]
        FUND_VERIFY --> FUND_APP["Finance Maker-Checker Approve\n(Status: APPROVED / ACTIVE)"]
    end

    %% TAHAP 3: PROJECT EXECUTION
    subgraph PM ["3. Eksekusi Proyek & Biaya Aktual"]
        FUND_APP --> PRJ_CREATE["Pembentukan Proyek Baru\n(Status: DRAFT)"]
        PRJ_CREATE --> GATE["Project Gates:\nVerify ➔ Reserve Material ➔ Start"]
        GATE --> WORK["Pekerjaan Lapangan Berjalan:\nTimesheets & Pemakaian Material"]
        WORK --> COST_INBOX["PM Kirim Biaya Aktual Lapangan\n(Cost Entry: CAPTURED)"]
        COST_INBOX --> WIP_POST["Finance Validasi & Post to WIP\n(Status: POSTED)"]
        WORK --> BILL_PROP["Milestone Selesai:\nPM Buat Billing Proposal"]
        BILL_PROP --> INV_APP["Finance Approve & Terbitkan Invoice\n(Revenue Realized)"]
    end

    %% TAHAP 4: PROFITABILITY
    subgraph Analytics ["4. Dashboard Keuntungan & Observabilitas"]
        INV_APP --> REV["Total Revenue / Pendapatan"]
        WIP_POST --> HPP["Total Biaya Aktual / HPP"]
        REV & HPP --> PNL["📊 Project P&L Report:\nGross Profit = Revenue - HPP\nGross Margin %"]
        PNL --> GL["📒 General Ledger (Jurnal Otomatis)"]
    end

    style CRM fill:#fbf9ff,stroke:#7746e8,stroke-width:2px
    style Budgeting fill:#f8fbff,stroke:#3182ce,stroke-width:2px
    style PM fill:#f4fbf6,stroke:#257743,stroke-width:2px
    style Analytics fill:#fcfaff,stroke:#a488f2,stroke-width:2px
```

---

## 🧪 Langkah Uji Praktis Menggunakan Frontend Baru

Gunakan frontend prototype modular (`http://127.0.0.1:5500` atau `http://localhost:5500`):

### Tahap 1: CRM & Evaluasi Kredit (Role: CRM Manager / Staff)
1. **Pilih Akun**: Masuk sebagai `dummy.staff@example.com` atau `dummy.manager@example.com`.
2. **Buka Menu CRM & Sales** (`#/crm`):
   - Klik tab **Incoming Inquiry** ➔ Klik **⚡ Qualify Inquiry** pada inquiry yang masuk.
   - Buka tab **Estimating & Quoting** ➔ Klik **⚡ Hitung HPP** ➔ Klik **📄 Buat Quotation**.
   - Buka tab **Deal & Credit Management** ➔ Klik **⚡ Process Deal Won & Check Credit**.
3. **Hasil yang Terlihat**:
   - Modal evaluasi kredit akan memeriksa plafon limit kredit customer.
   - Jika kredit aman (atau di-override dengan tombol **👑 Executive Override**), pesanan berubah menjadi `CONFIRMED`.

---

### Tahap 2: Pengajuan Budgeting / Funding (Role: Project Manager & Finance)
1. **Ganti Akun**: Masuk sebagai `project.manager.demo@erp.local`.
2. **Buka Menu Accounting / Finance ➔ Funding Approval** (`#/finance/funding`):
   - Klik **Refresh funding** untuk melihat pengajuan dana yang terkait dengan pesanan baru.
3. **Ganti Akun**: Masuk sebagai `finance.approver@example.com` (Finance Approver).
   - Klik tombol **Verify** ➔ lalu klik tombol **Approve**.
4. **Hasil yang Terlihat**:
   - Status funding request berubah menjadi `APPROVED` / `ACTIVE`, menandakan plafon anggaran proyek siap digunakan.

---

### Tahap 3: Eksekusi Proyek & Pencatatan Biaya Lapangan (Role: Project Manager)
1. **Ganti Akun**: Masuk kembali sebagai `project.manager.demo@erp.local`.
2. **Buka Menu Project Management** (`#/projects`):
   - Pilih proyek yang bersangkutan pada dropdown.
   - Klik tombol **⚡ Majukan Stage Lifecycle** untuk menggerakkan stage:
     `DRAFT` ➔ `VERIFIED` ➔ `MATERIAL_RESERVED` ➔ `STARTED / ACTIVE`.
3. **Kirim Biaya Aktual ke Finance (Cost Handoff)**:
   - Pada bagian bawah halaman proyek (*Handoff Operasional ke Accounting*), klik **+ Kirim Biaya ke Finance**.
   - Masukkan biaya Material (contoh: Rp 250.000.000) dan biaya Labor (contoh: Rp 80.000.000).
4. **Buat Pengajuan Termin Tagihan (Billing Proposal)**:
   - Klik **+ Buat Billing Proposal**.
   - Masukkan subtotal termin milestone (contoh: Rp 500.000.000) dengan pajak 11%.
5. **Ganti Akun**: Masuk sebagai `finance.demo@erp.local`:
   - Buka `#/finance/costing` ➔ Klik **Validate** lalu **Post to WIP** pada cost entry.
   - Buka `#/finance/project-billing` ➔ Klik **Approve & Create Invoice** pada billing proposal.

---

### Tahap 4: Dashboard Keuntungan & Observabilitas Finansial (Role: Executive)
1. **Ganti Akun**: Masuk sebagai `executive.demo@erp.local`.
2. **Buka Menu 📊 Reporting & Observability** (`#/reporting`):
   - Pilih proyek pada dropdown **P&L Proyek**.
3. **Hasil & Verifikasi Metrik Finansial**:
   - **Nilai Kontrak (Revenue)**: Rp 500.000.000
   - **Total Biaya Aktual (COGS / HPP)**: Rp 330.000.000 (Material + Labor)
   - **Gross Profit (Laba Kotor)**: Rp 170.000.000 (Positif / Hijau)
   - **Gross Margin %**: **34.0%**
   - Buka tab **General Ledger & Jurnal Keuangan** untuk melihat jurnal debet-kredit yang otomatis tercatat.
