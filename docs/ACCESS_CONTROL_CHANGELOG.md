# Access Control Baseline and Change Log

Dokumen ini adalah catatan resmi perubahan aturan akses pada runtime aktif `backend-express/` dan `frontend-next/`. Ia melengkapi, dan bila ada perbedaan pada area akses, lebih baru daripada catatan historis di dokumen lain. Source code dan test executable tetap menjadi bukti final.

**Baseline aktif:** 10 September 2026
**Perubahan terakhir:** `ACC-2026-09-10-04` — Kontrak Route → Module → API dipusatkan dan request lintas-modul dibuat fail-closed.
**Tidak ada migration database dalam perubahan ini.**

## Cara membaca dan melacak perubahan

Setiap perubahan akses baru wajib menambah entri pada bagian **Change log**, memperbarui matriks yang terdampak, memperbarui test Q11 atau test integrasi yang relevan, dan menautkan source endpoint/service yang menjadi enforcement. UI tidak boleh menjadi satu-satunya kontrol; backend adalah trust boundary.

Urutan keputusan akses yang berlaku adalah:

1. JWT dan user aktif tervalidasi.
2. Tenant/company efektif ditetapkan dan company header palsu ditolak.
3. Entitlement module company dan delegasi module personal diperiksa.
4. Role **aktif** diperiksa untuk policy route biasa.
5. Untuk approval, disbursement, dan executive override, role aktif diperiksa tanpa bypass delegasi module.
6. Scope record diperiksa lagi pada query/service: company, project, assignment, atau owner.
7. State/lifecycle, audit, idempotency, dan SoD diterapkan bila route mendukungnya.

## Baseline akses aktif

| Aktor aktif | Project portfolio dan WBS | Daily execution | Aksi governance / approval |
|---|---|---|---|
| Super Admin | Baca seluruh company yang dipilih; policy platform tetap mengatur mutation operasional | Sesuai route/platform policy | Melewati role guard khusus sebagai Super Admin, tetap memerlukan company/context yang sah |
| Company Admin | Portfolio company bila entitlement/delegasi `PROJECTS` mengizinkan | Tidak menjadi pengganti ownership task | Tidak dapat menggunakan delegasi module untuk approval sensitif |
| Director | Baca portfolio company | Tidak mengubah progress Daily milik user lain | CRM executive override dan executive approval CRM; approval request executive juga menerima Director |
| Operational Manager | Portfolio seluruh company aktif; mengelola project | Kelola struktur dan reassignment pada project company | Validasi request dan verifikasi LPJ |
| Project Manager | Hanya project dengan `project_manager_id` sendiri atau membership aktif ber-role PM | Mengelola struktur, delete, transfer/reassign hanya pada project kelolaan; progress/output/blocker Daily tetap owner-only | Approval request executive/PM |
| Staff / Supervisor | Hanya project yang memiliki membership aktif atau Main Task assignment dirinya | Hanya Daily Task dengan `owner_id` dirinya; dapat membuat Weekly dari Main yang ditugaskan dan Daily pada Weekly miliknya | Tidak dapat approve, disburse, delete Weekly/Main, atau reassignment manajerial |
| Finance | Sesuai entitlement Finance | Tidak memiliki hak task hanya karena role Finance | Disbursement request; kontrol Finance lain tetap memakai FSM/SoD masing-masing |

### Project dan task hierarchy

- `project_project` memakai row scope melalui `ProjectsService.projectAccessWhere`.
- Detail project canonical `/projects/:id/*` memakai `enforceProjectBoundary`: read memerlukan `assertCanViewProject`; mutation memerlukan `assertCanManageProject`.
- Main Task, Weekly Task, Daily Task, dan Task Transfer memakai `accessWhere` pada generic CRUD. Scope ini digabung dengan tenant/company scope melalui `AND`, sehingga ID yang diketahui tidak dapat dipakai untuk melompati ownership.
- Staff/Supervisor melihat Main Task berdasarkan `project_task_assignment.assignee_id`, Weekly berdasarkan `assignee_id`, dan Daily berdasarkan `owner_id`.
- Project Manager hanya memperoleh scope project yang terdaftar pada `project_project.project_manager_id` atau `project_member` aktif dengan peran PM.
- Pembuatan project oleh PM otomatis menetapkan `project_manager_id` bila belum diberikan.
- Perubahan progress, output, dan blocker Daily hanya boleh oleh `owner_id`; PM/OM memakai jalur reassignment atau struktur, bukan mengaku sebagai pelaksana.
- Transfer yang diajukan owner membutuhkan target membership company aktif, target berbeda, alasan non-kosong, dan tidak boleh duplikat `PENDING`. PM/OM dapat direct reassign pada project yang dikelola. CRUD generik transfer bersifat read-only.

### Request, CRM, dan SoD

| Proses | Role aktif yang dibutuhkan | Aturan tambahan |
|---|---|---|
| `POST /api/v1/requests/:id/validate-om` | `OPERATIONAL_MANAGER` | State service tetap menentukan transisi yang sah |
| `POST /api/v1/requests/:id/approve-exec` | `PROJECT_MANAGER` atau `DIRECTOR` | State harus `PENDING_EXEC` |
| `POST /api/v1/requests/:id/disburse` | `FINANCE` | State harus `REGISTERED` |
| `POST /api/v1/requests/:id/submit-lpj` | Requester | `created_by_id` harus sama dengan caller |
| `POST /api/v1/requests/:id/verify-lpj-om` | `OPERATIONAL_MANAGER` | State service tetap menentukan transisi |
| CRM executive override dan executive-approval decide/approve/reject | `DIRECTOR` | Delegasi module tidak dapat menggantikan role Director |

`enforceSoD` menerapkan maker-checker fail-closed bila pembuat dan checker adalah user yang sama. Repository belum memiliki model Delegation of Authority yang memuat delegator, company scope, masa berlaku, dan revocation; karena itu approval `DELEGATED` tidak boleh dipakai sebagai bypass sampai model tersebut tersedia.

## Kontrak frontend

Frontend menyelaraskan affordance dengan backend, tetapi backend tetap authoritative:

- Registry tunggal `frontend-next/lib/access/module-contract.ts` adalah mirror frontend dari mount `requireModuleAccess(...)` dan `requireRole(...)` di `backend-express/src/app.ts` serta Commands/BFF. AppShell, Sidebar, loader, Data Explorer, panel global, dan Axios preflight wajib memakai registry ini; module tidak boleh diturunkan dari nama route.
- Mapping route aktif: `/tasks` dan `/projects` → `PROJECTS`; `/crm` → `CRM`; `/finance` → `FINANCE`; `/reporting` → `REPORTING`; `/resources` → `ANALYTICS`; `/dashboard` tidak memiliki satu module karena section BFF dinilai satu per satu.
- Setiap API modular dikenali dari prefix backend (`CRM`, `SALES`, `PROJECTS`, `FINANCE`, `PROCUREMENT`, `INVENTORY`, `MANUFACTURING`, `QUALITY`, `ASSETS`, `SERVICE`, `LOGISTICS`, `ANALYTICS`, `IMPLEMENTATION`, `REPORTING`, `REQUESTS`). Nilai module kosong atau tidak dikenal tidak diperlakukan sebagai entitlement sah.
- Axios membatalkan request modular yang diketahui sebelum transmisi bila profil browser tidak memiliki company entitlement, delegasi personal yang sah, atau active role yang sesuai. Backend tetap mengulang seluruh pemeriksaan sebagai trust boundary.
- Dashboard BFF tidak menerima delegasi module karena implementasi `canReadSection` backend hanya menerima company entitlement dan active role. Loader frontend mengikuti aturan tersebut.
- Tab Finance `Aset Tetap`, resource Data Explorer, fallback panel global, alerts, dan inventory hanya memuat endpoint modul tambahan bila kontrak endpoint mengizinkan konteks aktif.
- Profil login dan `/auth/me` membawa `delegated_modules`, sehingga route dan request frontend menggunakan delegasi efektif yang sama dengan backend tanpa membaca seluruh role account sebagai izin aktif.
- Route `/tasks` adalah workspace Project Management dan selalu memakai entitlement `PROJECTS`, bukan module `TASKS`.
- Route `/reporting` memakai entitlement mandiri `REPORTING`. Sidebar hanya boleh menampilkan route ini bila entitlement tersebut aktif; route tidak boleh dipetakan sebagai `PROJECTS` atau module lain.
- Endpoint Reporting membatasi Staff pada data aktivitas dirinya sendiri. Karena itu fixture company QA PT Coba Arsalynk mengaktifkan `REPORTING`; entitlement ini tidak memberi akses ke agregat manajerial.
- Reporting hanya memanggil source `PROJECTS` atau `FINANCE` jika entitlement miliknya aktif. Staff hanya memanggil projection Reporting yang memang menyajikan aktivitas dan kehadirannya sendiri. Fallback panel samping mengikuti aturan yang sama.
- Route guard frontend mengevaluasi role aktif yang sudah dinormalisasi, bukan daftar seluruh role assignment.
- Tombol membuat Daily hanya muncul untuk PIC Weekly atau PM/OM.
- Tombol hapus Weekly hanya muncul untuk PM/OM.
- Owner menggunakan request transfer; PM/OM menggunakan direct reassignment.
- API frontend memakai endpoint custom `/daily-tasks/:id/update-progress`, `/request-transfer`, dan `/direct-reassign`, bukan generic PATCH untuk field terlindungi.

## Verifikasi dan regression guard

`backend-express/tests/q11-system-guardrails.ts` adalah guardrail build untuk baseline ini. Skenario mencakup active role, scope PM/staff/admin pada task/project, transfer generic read-only, workflow action sensitif, ownership LPJ, registry route/API, API preflight, serta loader lintas-modul. `backend-express/scripts/build.js` menjalankan Prisma generate, TypeScript compile, dan Q11; build Hostinger menjalankan migration hanya bila `DEPLOYMENT_TARGET=hostinger`.

Verifikasi terakhir untuk `ACC-2026-09-10-04`:

- backend TypeScript `--noEmit`: PASS;
- frontend TypeScript `--noEmit`: PASS;
- backend build pipeline: PASS;
- Q11: 9/9 skenario PASS.

## Change log

| ID | Tanggal | Status | Perubahan | Bukti source/test |
|---|---|---|---|---|
| `ACC-2026-09-10-05` | 10 Sep 2026 | Implemented and verified locally | Menyaring command palette dan shortcut attendance memakai kontrak route aktif; menyelaraskan menu Staff dengan panduan implementasi; menghapus fallback lintas-model WBS dan lifecycle Project; membuat progress Daily mengikuti response checklist backend; mengirim assignee Weekly sebagai user ID; memperbaiki payload keputusan quotation serta action Funding draw; dan menutup false-success/synthetic state pada Finance master/tax/payment. Aksi accounting yang belum memiliki command backend ditampilkan sebagai belum tersedia. | `GlobalCommandPalette.tsx`, `Topbar.tsx`, `Sidebar.tsx`, `project.api.ts`, `ProjectsClient.tsx`, `TasksClient.tsx`, `crm.api.ts`, `FinanceClient.tsx`, `CompanyMasterWorkspace.tsx`, `ProjectTaxWorkspace.tsx`, Q11 dan static contract audit |
| `ACC-2026-09-10-04` | 10 Sep 2026 | Implemented and verified | Memusatkan kontrak route, module, role aktif, entitlement, delegasi, endpoint API, dan section Dashboard BFF. Menutup allow-all saat entitlement kosong; menghentikan request lintas Project/Finance/CRM/Inventory/Assets yang tidak sah; menyaring Data Explorer dan tab Assets; menghapus probe Finance dari alur funding Project; mengekspor delegasi efektif lewat profil auth; serta menambah Axios preflight fail-closed. | `module-contract.ts`, `axios.ts`, `AppShell.tsx`, `Sidebar.tsx`, loader API dan caller dashboard/project/task/CRM/reporting/resources/panel, `accounts.service.ts`, Q11 |
| `ACC-2026-09-10-03` | 10 Sep 2026 | Implemented and verified | Menghapus probe API Finance/CRM yang tidak sah dari halaman Reporting dan fallback panel samping. Data source kini dimuat hanya bila company memiliki entitlement induknya; konteks Staff diberi judul laporan personal dan ekspor CSV finansial disembunyikan. | `ReportingClient.tsx`, `feed.api.ts`, `RightPanel.tsx`, Q11 |
| `ACC-2026-09-10-02` | 10 Sep 2026 | Implemented and verified | Menyelaraskan entitlements Reporting: PT Coba Arsalynk fixture mengaktifkan `REPORTING` untuk journey laporan Staff yang dibatasi pada data sendiri, dan sidebar kini menyaring `/reporting` menurut entitlement `REPORTING`. | `prisma/seed.ts`, `Sidebar.tsx`, `AppShell.tsx`, Q11 |
| `ACC-2026-09-10-01` | 10 Sep 2026 | Implemented and verified | Memperbaiki guard `/tasks` yang sebelumnya menurunkan module dari URL menjadi `TASKS`; Daily Tasks sebenarnya memakai API dan entitlement `PROJECTS`. Guard frontend juga memakai active role ternormalisasi agar tidak bertentangan dengan backend. | `frontend-next/components/layout/AppShell.tsx`, Q11 |
| `ACC-2026-09-09-01` | 9 Sep 2026 | Implemented and verified | Mengganti role-union untuk policy RBAC menjadi active role; menambahkan strict `requireActiveRole` untuk aksi sensitif; menambah row scope project/task; mengunci execution Daily ke owner; memisahkan transfer owner dan reassignment PM/OM; menutup generic transfer mutation; menambahkan ownership LPJ; membatasi CRM executive actions ke Director; membuat SoD fail-closed tanpa DoA valid; menyelaraskan UI project task. | `rbac.middleware.ts`, `sod.middleware.ts`, `projects.service.ts`, `projects.routes.ts`, `request.*`, `crm.routes.ts`, `crud-factory.ts`, `ProjectsClient.tsx`, Q11 |

## Batasan yang masih harus dilacak

- Delegation of Authority yang benar belum tersedia; jangan mengaktifkan bypass SoD berdasarkan flag/status semata.
- Scope read untuk daftar Request masih merupakan policy company feed yang terpisah; perubahan ini hanya menutup mutasi privileged dan ownership LPJ.
- Generic CRUD pada domain lain harus diaudit sebelum dianggap memiliki row-level ownership yang sama dengan Projects.
- Status workflow lintas Finance/CRM/Project yang belum memakai named action tetap mengikuti gap pada `SYSTEM_INTEGRATION_AUDIT.md`.

## Source of truth

- `backend-express/src/middlewares/rbac.middleware.ts`
- `backend-express/src/middleware/sod.middleware.ts`
- `backend-express/src/utils/crud-factory.ts`
- `backend-express/src/modules/projects/projects.service.ts` dan `projects.routes.ts`
- `backend-express/src/modules/core/request.routes.ts` dan `request.service.ts`
- `backend-express/src/modules/crm/crm.routes.ts`
- `frontend-next/lib/access/module-contract.ts`
- `frontend-next/lib/api/axios.ts`
- `frontend-next/app/(app)/projects/ProjectsClient.tsx`
- `frontend-next/lib/api/project.api.ts`
- `backend-express/tests/q11-system-guardrails.ts`
- `Q8_PRODUCTION_READINESS.md`
