# ERP Frontend Prototype

Frontend statis berbasis **HTML, CSS, dan JavaScript murni** untuk menguji ERP Operational API.

## Fitur

- login JWT;
- refresh, verify, current user, change password, dan logout;
- membaca OpenAPI schema live;
- fallback schema offline;
- sidebar modul dan resource;
- tabel data dengan search, ordering, dan pagination;
- form create dan patch otomatis dari `components.schemas`;
- detail dan delete data;
- API Console untuk seluruh operasi;
- input path, query, header, dan request body;
- `X-Company-ID`;
- request log dan export JSON.
- Finance Flow untuk memilih data dummy dan menguji command bisnis tanpa menyalin UUID.

## Workspace Accounting / Finance

Login, isi `X-Company-ID`, buka menu **Accounting / Finance**, lalu klik **Muat seluruh data**. Workspace Accounting sekarang terintegrasi langsung ke navbar utama dengan submenu:

- **Overview**: KPI, urutan workflow, pekerjaan tertunda, dan eksekusi terbaru;
- **Billing & Invoice**: membuat supplier billing beserta line item, three-way match, verify, approve/reject, dan post;
- **Approval Queue**: antrean persetujuan billing dan payment dengan maker-checker;
- **Payments**: memilih invoice POSTED, membuat batch payment, submit, approve, serta execute dan posting jurnal;
- **Bank Reconciliation**: daftar statement dan auto reconciliation;
- **General Accounting**: CoA, journal, pajak, fiscal period, budget, recurring payment, credit facility, dan project finance.

Workspace mengikuti cakupan rancangan Finance:

- Dashboard Utama: laba-rugi, cashflow, HPP, alert, dan KPI;
- Buku Besar: CoA, journal, pajak, dan tutup buku;
- Accounts Payable: verifikasi/approval invoice vendor, three-way matching, dan batch payment;
- Hutang: recurring payment dan credit facility;
- Piutang/Project Finance: WIP, project funding, cost variance, dan overhead;
- Pembiayaan Operasional: budget serta invoice/document builder;
- Nilai Aset: depresiasi dan maintenance.

Seluruh lifecycle Accounts Payable memakai API backend nyata. Data master dan resource accounting lain tetap dapat dibuka melalui Data Explorer dari kartu/menu General Accounting.

Bagian **Operational flow** menjalankan billing verify/approve/post, payment submit/approve/execute, jurnal pengeluaran dan alokasi otomatis, bank reconciliation, period close/reopen, budget check, KPI recalculation, dan finance dashboard. Eksekusi payment mencatat transfer manual berdasarkan referensi bank/kas; integrasi provider bank eksternal tidak disimulasikan.

Khusus KPI, pilihan UUID diambil dari `GET /api/v1/analytics/kpi-definitions/`. Field `filters` divalidasi sebagai JSON object sehingga frontend mengirim `{}` atau `{ "status": "POSTED" }`, bukan string JSON.

## Workspace Project Management

Untuk pengujian terpadu seluruh workflow dan role, gunakan [UAT_PROJECT_END_TO_END.md](./UAT_PROJECT_END_TO_END.md).

Buka menu **Project Management**, klik **Muat seluruh data**, lalu pilih proyek. Workspace mencakup seluruh bagian rancangan:

- Dashboard Project: KPI, Gantt/summary task, notification, dan quick action;
- Project Lists: health status, Kanban, milestone, dan KPI;
- Orders: linked sales order, technical brief, dan change request;
- Warehouse & Resource: material allocation, resource request, serta update;
- Execution & QA: work-order progress, milestone, dan quality control;
- Timeline & Cost: timesheet pekerja, penggunaan alat, budget, dan actual cost.

Project dashboard, health calculation, dan cost summary memakai command backend nyata. Gantt Chart dirender sebagai visual prototype dari task API. Penanda bulat merah muda menunjukkan informasi yang dibagikan lintas halaman atau modul.

## Menjalankan backend

Dari folder backend Django:

```powershell
venv\Scripts\Activate.ps1
python manage.py runserver
```

Backend default:

```text
http://127.0.0.1:8000
```

## Menjalankan frontend

Dari folder prototype:

```powershell
python -m http.server 5500
```

Atau klik `start_frontend.bat`.

Buka:

```text
http://127.0.0.1:5500
```

Jangan membuka `index.html` menggunakan `file:///`.

## CORS Django

Salin konfigurasi yang relevan dari `django_cors_snippet.py` ke `config/settings.py`.

Pastikan `corsheaders` sudah ada pada `INSTALLED_APPS` dan `CorsMiddleware` aktif.

## Schema

Frontend mencoba membaca:

```text
http://127.0.0.1:8000/api/schema/?format=json
```

Jika backend tidak tersedia, frontend memakai `openapi-schema.json` untuk menampilkan struktur modul. Operasi API tetap membutuhkan backend aktif.

## Authentication

Endpoint yang dipakai:

```http
POST /api/v1/auth/token/
POST /api/v1/auth/token/refresh/
POST /api/v1/auth/token/verify/
GET  /api/v1/auth/me/
POST /api/v1/auth/change-password/
POST /api/v1/auth/logout/
```

Payload login:

```json
{
  "email": "admin@example.com",
  "password": "password"
}
```

## Batas prototype

- relasi foreign key diisi menggunakan UUID;
- object dan array kompleks memakai JSON editor;
- form dibentuk dari OpenAPI, sehingga akurasinya mengikuti schema backend;
- penyimpanan JWT di `localStorage` hanya untuk prototype lokal, bukan produksi.
