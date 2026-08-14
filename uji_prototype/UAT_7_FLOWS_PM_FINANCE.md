# UAT 7 Flow — Project Management dan Finance

Dokumen ini menguji 3 flow Project Management dan 4 flow Finance/Accounting melalui prototype FE dengan backend dan Supabase live.

## Persiapan

1. Jalankan backend pada `http://127.0.0.1:8000` dan prototype pada `http://127.0.0.1:4173`.
2. Isi Company ID yang sama pada seluruh akun.
3. Gunakan akun sesuai role: Project Management, Project Assignee, Finance Maker, dan Finance Approver.
4. Gunakan Run ID unik, misalnya `UAT-7FLOW-20260814-01`, pada nama/deskripsi record.
5. Setelah login atau berganti akun, tekan **Refresh data**.

Audit Supabase sebelum UAT: tersedia 1 order CONFIRMED/ALLOCATED, 16 project, 21 PO, 2 Goods Receipt, 19 billing, 8 cost entry, dan 10 tax transaction.

## PM-1 — Incoming Order menjadi Project

Role: **Project Management**.

1. Buka **Project Management → Incoming Order**.
2. Pilih order berstatus `CONFIRMED` atau `ALLOCATED`, lalu klik **Convert**.
3. Isi nama project dengan Run ID, budget, warehouse, dan tanggal rencana.
4. Klik **Buat project & scope**.
5. Pilih project pada **Project gate**, kemudian jalankan **Verify → Reserve → Start**.

PASS jika:

- Project, technical brief, requirement, material requirement, dan link order terbentuk.
- Conversion kedua pada order yang sama tidak membuat project ganda.
- Status project bergerak `DRAFT → VERIFIED → MATERIAL_RESERVED → IN_PROGRESS`.
- Reservation material aktif.
- Terdapat dispatch ke Finance, Warehouse, dan Production.

Negative test: klik **Start** pada project yang belum Verify/Reserve. Harus ditolak HTTP 400.

## PM-2 — Order Change Request

Role: **Project Management**.

1. Buka tab **Change Request**, klik **Request**.
2. Pilih project UAT dan isi perubahan scope.
3. Tambahkan material tambahan bila diperlukan.
4. Klik **Analyze** dan isi schedule impact, cost impact, serta billing adjustment.
5. Klik **Send Client**.
6. Klik **Client Decision**, pilih approved.

PASS jika:

- Status bergerak `DRAFT → ANALYZED → WAITING_CLIENT → APPLIED`.
- Timeline, budget, task/milestone terbuka, dan material requirement diperbarui.
- Shortage membuat Purchase Requisition.
- Billing adjustment membuat Billing Proposal untuk Finance.

Negative test: Client Decision sebelum `WAITING_CLIENT` harus ditolak.

## PM-3 — Operational Problem Reporting

Role pertama: **Project Assignee**. Role kedua: **Project Management**.

1. Assignee membuka **Operational Issue → Report Issue**.
2. Isi jenis `MACHINE_FAILURE`, severity, deskripsi, dan project.
3. Login sebagai PM, klik **Analyze** dan isi root cause serta milestone impact.
4. Tambahkan action `REALLOCATE_MACHINE` atau `ADD_LABOR`.
5. Isi mesin pengganti atau jam kerja tambahan.
6. Selesaikan seluruh action.

PASS jika:

- Status bergerak `REPORTED → ANALYZED → ACTION_IN_PROGRESS → RESOLVED`.
- Notification/alert dibuat ketika dianalisis.
- Reallocation memperbarui Work Order dan Equipment Usage.
- Add Labor membuat Resource Request dan Project Cost Entry.
- Issue hanya RESOLVED setelah seluruh action COMPLETED.

Negative test: user di luar membership project tidak boleh melaporkan issue.

## FIN-1 — Incoming Supplier Invoice

Role: **Finance Maker**, kemudian **Finance Approver**.

1. Buka **Accounts Payable**, buat Supplier Billing dan pilih PO yang mempunyai Goods Receipt.
2. Tambahkan billing line, lalu simpan DRAFT.
3. Jalankan **3-way match**.
4. Jika hasil `VARIANCE`, buka tab **Incoming Invoice**, lalu klik **Resolve & Accept** dan isi alasan.
5. Kembali ke Accounts Payable, klik **Verify**.
6. Login sebagai Finance Approver berbeda, klik **Approve**, kemudian **Post billing**.
7. Buat payment, jalankan `Submit → Approve oleh user berbeda → Execute → Allocate`.
8. Rekonsiliasikan bank statement.

PASS jika:

- Match menjadi `MATCHED` atau `MATCHED_WITH_OVERRIDE`.
- Billing bergerak `DRAFT → VERIFIED → APPROVED → POSTED`.
- Verifier tidak dapat approve billing yang sama.
- AP schedule `OPEN` terbentuk saat posting.
- Setelah payment dialokasikan, outstanding invoice berkurang/menjadi nol.

## FIN-2 — Finished Project menjadi Invoice dan AR

Role pertama: **Project Management**. Role kedua: **Finance**.

1. Pastikan progress project 100%, seluruh acceptance criteria passed, dan tidak ada issue terbuka.
2. PM menutup project melalui action **Close**.
3. Login Finance, buka **Project Billing**.
4. Cari proposal trigger `PROJECT_COMPLETED` dengan Run ID/project code.
5. Klik **Approve & Create Invoice**.
6. Periksa tab Piutang/AR schedule.

PASS jika:

- Close project otomatis mengumpulkan operational cost.
- Final Billing Proposal otomatis berstatus `SUBMITTED` dan hanya dibuat sekali.
- Approval Finance membuat Customer Invoice `POSTED` dan AR schedule `OPEN`.
- Invoice tidak dianggap kas sampai incoming payment/bank receipt dialokasikan.

## FIN-3 — Costing dan WIP Valuation

Role: **Finance**.

1. Buka **Project Costing & WIP**.
2. Pilih project dan jalankan pengumpulan operational cost, atau buat cost manual.
3. Pada cost `CAPTURED`, klik **Validate Evidence**.
4. Pada cost `VALIDATED`, klik **Post to WIP**.
5. Klik **Calculate WIP**.

PASS jika:

- Sumber warehouse, timesheet, project expense, dan issue labor tidak diduplikasi saat collect ulang.
- Status bergerak `CAPTURED → VALIDATED → POSTED`.
- Journal mempunyai debit WIP dan kredit Cost Clearing dengan nilai sama.
- Snapshot WIP hanya menghitung cost `POSTED`.

Negative test: cost CAPTURED tidak boleh langsung Post dan PM tidak boleh melakukan validasi Finance.

## FIN-4 — Tax Compliance

Role: **Finance**.

1. Post billing yang mempunyai tax amount, atau buat Tax Transaction melalui Data Explorer.
2. Buka **Tax Compliance**.
3. Klik **Validate**.
4. Klik **Create Billing Code**.
5. Klik **Record Payment**, isi payment reference dan NTPN.
6. Klik **Mark Reported**.

PASS jika:

- Billing dengan pajak otomatis mempunyai Tax Transaction.
- Status bergerak `DRAFT → VALIDATED → BILLING_CODE_CREATED → PAID → REPORTED`.
- Report ditolak bila belum PAID atau NTPN kosong.
- Tax Transaction tetap terlihat setelah refresh karena mempunyai company scope langsung.

## Form hasil

| Flow | Hasil | ID record | Catatan |
|---|---|---|---|
| PM-1 Incoming Order | PASS / FAIL | | |
| PM-2 Change Request | PASS / FAIL | | |
| PM-3 Operational Issue | PASS / FAIL | | |
| FIN-1 Incoming Invoice | PASS / FAIL | | |
| FIN-2 Finished Project | PASS / FAIL | | |
| FIN-3 Costing & WIP | PASS / FAIL | | |
| FIN-4 Tax Compliance | PASS / FAIL | | |

Simpan screenshot status akhir, UUID record, dan HTTP status pada Request Log untuk setiap flow.

## Automated regression

```powershell
cd backend
python manage.py test `
  apps.projects.tests.test_project_flow `
  apps.projects.tests.test_diagram_workflows `
  apps.projects.tests.test_funding_membership_permissions `
  apps.finance.tests `
  apps.procurement.tests.test_three_way_match `
  --keepdb
```
