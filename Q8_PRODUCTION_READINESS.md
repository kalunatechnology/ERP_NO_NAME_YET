# Q8 — Production Readiness & Frontend Stabilization

Latest integration changes and unresolved release gates: [Integration hardening 10 September](docs/INTEGRATION_HARDENING_2026_09_10.md). Historical PASS counts below are not acceptance evidence for the new transactional code. New tax-scheme migration is pending target verification; production readiness remains blocked.

**Status diperbarui 10 September 2026.** Route registration 2.616/2.616, authenticated GET 783/783, mutation pipeline dry-run 1.833/1.833, full BDD, backend compile, dan frontend 14-route production build pada baseline terakhir semuanya lulus. Q11 System Guardrails terbaru lulus 9/9 termasuk kontrak Frontend Route → Module → API. Benchmark terakhir login sampai seluruh data dashboard awal adalah 2.009 ms. Rincian: [Current Implementation Status](docs/CURRENT_IMPLEMENTATION_STATUS.md).

## Status verifikasi

- Backend Prisma Client generation: lulus.
- Backend TypeScript build: lulus.
- Frontend TypeScript validation: lulus.
- Backend TypeScript validation setelah revisi kontrak akses: lulus.
- Q11 System Guardrails: 9/9 lulus.
- Validasi link dokumentasi: lulus.
- Frontend optimized production build: lulus, 14 route berhasil dihasilkan.
- Regresi integrasi Q1–Q6: 20/20 lulus pada pengujian terakhir.
- Governance transaksi Q7: 6/6 lulus; replay idempotency menghasilkan satu record dan data uji dibersihkan.
- Browser smoke test `/login`: halaman termuat dan struktur form dapat diakses.
- Deployment Vercel: tidak dijalankan sesuai instruksi pemilik sistem.

## Perubahan operasional Q8

- Setiap respons API sekarang memiliki `X-Request-ID` untuk korelasi laporan frontend, log server, dan audit event.
- Respons error menyertakan `request_id`; nilai ini aman ditampilkan kepada user saat meminta bantuan.
- CORS mengekspos `X-Request-ID`, `X-Idempotent-Replay`, `Server-Timing`, `X-Dashboard-Cache`, dan `X-Request-Cache` kepada frontend.
- Mutation gagal tetap dicatat oleh audit middleware, dengan payload sensitif disensor.
- Health check tetap menjadi satu-satunya endpoint operasional publik di luar autentikasi.

## Penyempurnaan frontend

- Emoji dekoratif di seluruh source frontend telah dihapus.
- Navigasi Finance menggunakan satu keluarga ikon Lucide dengan label yang ringkas.
- Header halaman, description, section panel, KPI, tab, tabel, dan hover mengikuti primitive visual yang konsisten.
- KPI tidak lagi memakai treatment hijau identik atau animasi naik pada semua kartu.
- Copy toast dan tombol dibuat singkat, profesional, dan tidak memakai simbol dekoratif.
- Finance, period closing, fixed assets, tax, company master, CRM, Projects, Tasks, Dashboard, Reporting, Requests, dan panel global telah dinormalisasi.
- Login dan shell Marka+ yang sudah sesuai identitas awal dipertahankan.
- Kontrak route, active role, module entitlement, delegasi personal, API prefix, dan Dashboard BFF dipusatkan pada `frontend-next/lib/access/module-contract.ts`.
- `/tasks` menggunakan module backend `PROJECTS`; module tidak lagi diturunkan dari nama URL.
- Axios membatalkan request modular yang diketahui tidak sah sebelum transmisi. Data Explorer, Reporting, dashboard, panel global, Inventory, dan tab Assets hanya memuat source yang diizinkan kontrak aktif.
- Login dan `/auth/me` menyediakan `delegated_modules` agar delegasi frontend identik dengan access context backend.
- Weekly Task mengirim `assignee` berupa user ID sesuai model backend, bukan nama PIC atau field ekstra yang tidak dikenal.
- Project Cost → WIP/journal, Billing Proposal → Billing Document, dan AP Payment kini memakai command backend transaksional; frontend tidak menulis status lifecycle melalui CRUD generik.
- Nomor bukti pajak dan identitas proyek tidak lagi dibuat secara sintetis oleh frontend; input wajib harus berasal dari pengguna atau record backend.

## Readiness kontrak Frontend → Backend

| Gate | Status lokal | Kriteria produksi |
|---|---|---|
| Route → Module | PASS | AppShell dan Sidebar memakai registry yang sama; `/tasks` → `PROJECTS` |
| Active role | PASS | Tidak ada authorization dari gabungan seluruh assigned role |
| Company entitlement | PASS | Module kosong/tidak valid fail-closed; company-disabled module tidak dapat dibuka oleh delegasi |
| Cross-module loader | PASS | Project/Finance/CRM/Reporting/Inventory/Assets diperiksa sebelum request |
| API preflight | PASS | Request yang diketahui unauthorized dibatalkan dengan `ERR_FRONTEND_MODULE_ACCESS` |
| Tanggal operasional | PASS | Date/DateTime API dinormalisasi ke calendar key; “hari ini” memakai timezone browser, bukan UTC |
| Backend enforcement | PASS | JWT, company, entitlement, active role, delegation, row scope, dan strict action tetap diperiksa backend |
| Browser production smoke | PENDING DEPLOYMENT | Setelah deploy, ulangi login tiap persona dan pastikan Network tidak berisi expected-403 dari background loader |

Pemeriksaan role-surface terbaru menambahkan projection Reporting operasional untuk OM, menghapus tab finansial/executive dari journey OM, membatasi tabel portofolio rinci ke PM, dan menghapus request Inventory dari dashboard Finance. Type-check lokal wajib lulus sebelum deploy; endpoint baru tetap memerlukan deployment backend dan authenticated smoke di Hostinger sebelum ditandai production PASS.

Catatan readiness: log Hostinger 11 September 2026 membuktikan migration `20260910020000_billing_tax_scheme` telah diterapkan ke database target. Build yang sama kemudian berhenti pada Q11 karena test backend mengimpor dependency UI frontend yang tidak diinstal di backend; perbaikan telah dibuat di source. Production readiness tetap menunggu deployment frontend/backend dari release yang sama serta browser smoke Hostinger.

Status **PASS lokal** bukan bukti bahwa build terbaru sudah aktif di Hostinger. Release baru dianggap siap setelah frontend dan backend berasal dari commit/build yang sama, user melakukan login ulang untuk menyegarkan `delegated_modules`, dan browser smoke pada domain produksi lulus.

## Environment wajib sebelum deployment

Backend:

- `NODE_ENV=production`
- `DATABASE_URL`
- `JWT_ACCESS_SECRET` dan `JWT_REFRESH_SECRET` berbeda, eksplisit, minimal 32 karakter
- `CORS_ALLOWED_ORIGINS` hanya berisi origin frontend resmi
- `ERP_ENFORCE_IAM=true` setelah permission catalog final diverifikasi
- `ERP_ENFORCE_FIELD_PERMISSIONS=true` hanya setelah seluruh field policy selesai diisi

Frontend:

- `NEXT_PUBLIC_API_BASE_URL` menunjuk endpoint Express production
- `NEXT_PUBLIC_API_URL` disamakan atau dikosongkan bila memakai Next.js rewrite
- `NEXT_PUBLIC_CHATBOT_API_URL` hanya diisi bila layanan chatbot benar-benar tersedia

## Checklist go-live

1. Backup database sebelum deployment pertama.
2. Pastikan hanya `dummy.admin@example.com` yang memiliki status Super Admin.
3. Pastikan seluruh company module access sesuai kontrak/pembayaran; default tetap nonaktif.
4. Uji login dan `/auth/me` untuk setiap akun demo representatif.
5. Uji satu alur CRM, Project, Finance, Request, approval, reversal, serta closing pada company uji.
6. Pastikan mutation frontend mengirim `Idempotency-Key` dan laporan error menyertakan `request_id`.
7. Jalankan smoke test production tanpa memasukkan data asli.
8. Setelah hasil stabil, masukkan master data serta data perusahaan asli secara bertahap.
9. Catat pengujian cold dan cache-hit secara terpisah; pastikan complete initial dashboard tetap <= 3.000 ms pada lingkungan target.
10. Untuk deployment lebih dari satu instance, pindahkan read-through cache proses-lokal ke Redis-compatible shared cache dengan scoped key dan aturan invalidasi yang sama.
11. Pastikan frontend dan backend dideploy sebagai satu release contract; jangan deploy registry frontend tanpa respons auth backend yang memuat `delegated_modules`.
12. Login ulang sebagai PM, Staff, Finance, CRM, Director, Company Admin, dan Super Admin; verifikasi route yang tampil sesuai active role dan entitlement.
13. Pantau Network saat membuka Dashboard, `/tasks`, `/reporting`, `/projects`, `/finance`, `/crm`, dan `/resources`. Tidak boleh ada request ke module lain yang sudah diketahui tidak sah.
14. Verifikasi direct API unauthorized tetap menghasilkan 403 dari backend walaupun frontend telah memiliki preflight.

## Catatan font

Frontend tidak lagi mengunduh Google Fonts saat build. Font memakai system stack sehingga build tidak bergantung pada jaringan font eksternal.

## Audit integrasi antar-page 10 September 2026

Baseline frontend terbaru menutup fallback yang sebelumnya membuat kegagalan API tampak berhasil atau menulis aggregate yang berbeda:

- Main Task dan Weekly Task tidak lagi dialihkan ke generic `project_task` ketika endpoint WBS gagal.
- Assignment memakai action backend `/main-tasks/:id/assign-members`; delete assignment tidak lagi menelan error.
- Project lifecycle tidak lagi melakukan generic PATCH status setelah command gagal, dan kalkulasi EVM gagal tidak lagi menampilkan angka contoh.
- Keputusan customer quotation mengirim `decision=ACCEPTED|REJECTED` sesuai kontrak Sales.
- Command palette dan tombol attendance disaring dengan registry route/role/module yang sama.
- Progress Daily Task tidak dapat diedit sebagai persentase manual; response backend berbasis checklist/status menjadi nilai authoritative.
- Funding draw memakai action `/draw`, bukan menyisipkan `DISBURSED` ke endpoint `/decide`; UI tidak lagi mengklaim transfer bank atau perubahan saldo yang tidak dilakukan backend.
- AP payment membentuk Payment dan allocation lalu menjalankan `/submit`; bill tidak lagi diubah langsung menjadi `PAID`.
- Company master, rekening, fasilitas kredit, pajak, health, profitabilitas, dan bank tidak lagi diawali record/angka produksi sintetis.
- Static route audit sekarang mem-parsing call router secara utuh dan tidak lagi gagal ketika middleware mount lebih panjang dari 900 karakter.

Verifikasi lokal setelah hardening Finance: frontend TypeScript PASS, backend TypeScript PASS, static Express-Next contract audit 176 call terhadap 2.648 route record tanpa finding/dynamic call unresolved, serta Q11 9/9 PASS. Browser, database aktual, dan deployment production belum diuji, sehingga status smoke Hostinger tetap `PENDING DEPLOYMENT`.

## Finance hardening — 10 September 2026

- Project Cost: `DRAFT → VALIDATED → POSTED_TO_WIP`; posting membuat jurnal seimbang debit akun WIP `1150` dan kredit akun sumber yang dipilih.
- Billing Proposal: `DRAFT → SUBMITTED → APPROVED → ISSUED`; issuance atomik membuat satu Billing Document `DRAFT` dan menautkan `billing_document_id` sebagai idempotency bisnis.
- Billing Document customer/supplier tetap melalui `DRAFT → SUBMITTED → VERIFIED → APPROVED → POSTED`; posting customer invoice adalah titik pembuatan tax dan jurnal.
- AP Payment dibuat sekaligus dengan allocation dalam satu transaksi melalui `/billing-documents/:id/create-payment`, berstatus `SUBMITTED`. Approval dan execution terpisah menurut SoD; execution membuat jurnal AP/bank dan memperbarui outstanding invoice secara atomik.
- Tax workspace memakai `/tax-transactions/projection`; `tax_scheme` kini disimpan pada proposal dan Billing Document lalu diteruskan ke proyeksi. Record historis yang belum diklasifikasikan tetap `null`.
- Dashboard PM memakai projection milik module `PROJECTS`, bukan request silang ke `FINANCE`.
- CRUD generik menolak penulisan field lifecycle untuk model Finance terproteksi; status awal dipaksakan ke `DRAFT` oleh backend.
- UI AP tidak lagi mengarang vendor, PO, GRN, nominal, atau hasil “match 100%”. Karena kontrak Billing Document belum memiliki relasi GRN authoritative, UI menyebut aksinya “Verifikasi Dokumen”, bukan bukti three-way match.
- Profile mutation tidak menelan error; Right Panel menampilkan degraded-state dan mempertahankan data terakhir bila seluruh source feed yang diizinkan gagal.
