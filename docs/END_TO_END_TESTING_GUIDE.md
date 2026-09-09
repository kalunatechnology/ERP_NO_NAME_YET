# Panduan Testing End-to-End Aplikasi — AS-IS

**Versi:** 1.0  
**Tanggal:** 8 September 2026  
**Runtime yang diuji:** `frontend-next/`, `backend-express/`, dan PostgreSQL/Supabase sesuai `backend-express/prisma/`  
**Referensi utama:** `docs/SYSTEM_INTEGRATION_AUDIT.md`  
**Target pembaca:** QA, developer, product owner, business analyst, dan reviewer UAT

## 1. Tujuan dan prinsip penggunaan

Panduan ini menguji aplikasi melalui lima perjalanan pengguna besar. Setiap test case menguji satu hasil bisnis dari awal sampai akhir dan secara bersamaan memeriksa UI, API, database, status, relasi, permission, audit, notifikasi, serta penanganan kegagalan. Tombol, modal, form, dan navigasi bukan test case tersendiri; semuanya merupakan bagian dari perjalanan pengguna.

Panduan ini bersifat **AS-IS**. Artinya:

- perilaku yang benar-benar ditemukan di source menjadi dasar langkah dan expected result;
- fitur yang hanya memiliki model atau generic CRUD tidak dianggap sebagai integrasi otomatis;
- gap yang sudah diketahui tetap dijalankan agar QA dapat membuktikan defect tersebut;
- hasil aktual yang bertentangan dengan expected business control harus dicatat sebagai defect, bukan diubah menjadi expected result baru;
- `backend/` Django dan `uji_prototype/` tidak digunakan sebagai runtime pengujian.

Lima case utama:

| Test Case | Perjalanan bisnis | Cakupan utama |
|---|---|---|
| TC-01 | Identitas, company, dan tata kelola akses | Login, session, company scope, role, module entitlement, user administration, navigation, profile, pagination, logout |
| TC-02 | Lead-to-project | Master Customer → CRM Inquiry → Opportunity → Estimate → Quotation → Sales Order/credit hold → Project |
| TC-03 | Project-to-execution | Project lifecycle → WBS → assignment → Weekly/Daily Task → checklist → transfer → progress/EVM → biaya/funding/billing |
| TC-04 | Request-to-accounting | Request → OM → Director → Finance → LPJ serta billing, payment, GL, bank, tax, asset, dan closing |
| TC-05 | Extended operations and assurance | Procurement → Inventory → Manufacturing → Quality → Logistics/Service, Analytics/Implementation, reporting, security, recovery, dan rekonsiliasi akhir |

## 2. Aturan eksekusi dan bukti

### 2.1 Lingkungan

Jalankan di database QA/UAT yang terisolasi. Jangan menjalankan skenario mutasi pada production. Pastikan:

1. Migration repository telah diterapkan dan seed QA telah tersedia.
2. Frontend menunjuk ke instance Express yang sama dengan database QA.
3. Jam aplikasi, database, dan browser dapat direkonsiliasi.
4. Browser DevTools menyimpan log Network selama perpindahan halaman.
5. Tester memiliki akses read-only ke database atau pendamping backend yang dapat membuktikan persistence.
6. Company dasar PT Coba Arsalynk memiliki entitlement `CORE`, `REQUESTS`, `CRM`, `SALES`, `PROJECTS`, dan `FINANCE` sesuai seed/migration repository.
7. TC-05 menggunakan company fixture kedua yang memang diberi entitlement modul lanjutan; jangan mengaktifkan modul dengan manipulasi browser.

Konektivitas live Supabase belum berhasil diverifikasi pada audit sumber karena endpoint direct bergantung IPv6. Sebelum test, buktikan `prisma migrate status` dan koneksi database dari host eksekusi. Kegagalan koneksi adalah blocker environment, bukan defect workflow.

### 2.2 Identitas uji

Seed menyediakan akun berikut untuk PT Coba Arsalynk:

| Persona | Email | Role source |
|---|---|---|
| Super Administrator | `dummy.admin@example.com` | `ROLE-SUPER-ADMIN` |
| Company Administrator | `admin.director@arsalynk.id` | `ROLE-COMPANY-ADMIN` |
| Director | `director@arsalynk.id` | `ROLE-DIRECTOR` |
| Project Manager | `pm.lead@arsalynk.id` | `ROLE-PM` |
| Supervisor | `supervisor@arsalynk.id` | `ROLE-SUPERVISOR`, `ROLE-STAFF` |
| CRM Lead | `crm.lead@arsalynk.id` | `ROLE-CRM-LEAD` |
| Sales | `sales@arsalynk.id` | `ROLE-SALES` |
| Finance Controller | `finance.lead@arsalynk.id` | `ROLE-FINANCE` |
| AP/AR | `dummy.finance@example.com` | `ROLE-FINANCE` |
| Estimator | `estimator@arsalynk.id` | `ROLE-CRM-LEAD` |
| Technical Staff | `staff.dev@arsalynk.id` | `ROLE-STAFF` |

Password awal seed saat ini adalah `DummyPass123!`, tetapi seed sengaja tidak menimpa password akun yang sudah ada. Gunakan password yang dikelola untuk environment QA apabila akun pernah diubah. Akun dan quick-login tersebut adalah data pengujian, bukan kredensial production.

### 2.3 Penamaan dan korelasi data

Gunakan satu `RUN_ID`, misalnya `E2E-20260908-01`, pada seluruh nomor/nama/deskripsi yang memungkinkan. Simpan ID database yang dihasilkan untuk:

- `party_id`, customer profile, inquiry, opportunity, estimate, quotation, order, dan project;
- Main Task, assignment, Weekly Task, Daily Task, checklist, dan transfer request;
- request/workflow, funding, billing, payment, journal, bank statement, tax, dan asset;
- requisition, RFQ, purchase order, goods receipt, stock move, production/work order, inspection, shipment, service case, KPI, dan release.

Untuk setiap langkah mutasi, simpan:

- persona dan active role;
- waktu, URL, HTTP method, status code, request payload yang sudah disensor, dan `request_id`/`X-Request-ID`;
- screenshot keadaan UI sebelum dan setelah aksi;
- ID serta status record sebelum/sesudah;
- baris `core_audit_event`, workflow approval, activity log, dan notification yang relevan.

### 2.4 Standar hasil

| Hasil | Makna |
|---|---|
| PASS | UI, HTTP response, database, permission, status, dan side effect sesuai expected result. |
| FAIL | Kontrak yang seharusnya tersedia tidak terpenuhi atau data menjadi tidak konsisten. |
| KNOWN GAP | Source sudah diketahui belum lengkap/keliru dan eksekusi membuktikannya. Tetap buka/tautkan defect. |
| BLOCKED | Environment, migration, seed, atau dependency eksternal mencegah langkah dijalankan. |
| NOT APPLICABLE | Hanya boleh digunakan jika entitlement atau fixture yang disyaratkan memang tidak disediakan dan telah disetujui test lead. |

Error API yang terkontrol harus berbentuk JSON dengan `success: false`, `error` atau `errors`, `detail` jika relevan, dan `request_id`. Secara umum gunakan 400 untuk validation, 401 untuk unauthenticated/token, 403 untuk forbidden, 404 untuk record/route yang tidak ditemukan, 409 untuk unique conflict, dan 503 untuk database unavailable.

---

## 3. TC-01 — Identity, Company Governance, and Controlled Access

### 3.1 Test Case ID

`TC-01`

### 3.2 Nama skenario

Onboarding pengguna terkontrol dari autentikasi sampai akses company/module/role yang benar, perubahan profil, dan pengakhiran session.

### 3.3 Tujuan

Memastikan identitas tidak dapat masuk dengan kredensial tidak valid, user hanya melihat company dan modul yang diberikan, Company Admin dapat mengelola anggota tanpa menaikkan privilege secara ilegal, active role mengubah persona secara sah, data antartenant terisolasi, dan logout menghapus session browser.

### 3.4 Role yang digunakan

- Super Administrator
- Company Administrator
- Project Manager atau akun multi-role fixture
- Technical Staff baru
- Satu user dari company fixture kedua untuk pembuktian isolasi

### 3.5 Precondition

1. Seed QA tersedia dan password akun uji diketahui.
2. PT Coba Arsalynk dan satu company pembanding tersedia.
3. PT Coba Arsalynk memiliki enam modul approved sesuai repository.
4. Tester dapat melihat Network dan memeriksa tabel IAM/Core.
5. Siapkan email unik `e2e.staff.<RUN_ID>@example.test`.

### 3.6 Skenario / User Journey

#### Fase A — autentikasi dan session awal

1. Buka URL aplikasi tanpa session pada sebuah route terlindungi seperti `/projects`. Pastikan aplikasi mempertahankan tujuan route secara aman atau mengarahkan pengguna ke entry authentication tanpa menampilkan data sebelumnya.
2. Dari login, masukkan identifier kosong, password kosong, email tidak dikenal, lalu password salah untuk akun yang dikenal. Catat validasi frontend dan response backend.
3. Gunakan panel akses cepat QA untuk memilih akun Company Administrator, kemudian login. Jangan menganggap pengisian otomatis sebagai bukti autentikasi; buktikan request token dan `/auth/me` berhasil.
4. Refresh halaman penuh. Pastikan profile dan company context dipulihkan dari token/session, bukan dari data dummy halaman.
5. Buka `/signup`. Source menetapkan self-registration tidak tersedia, sehingga route harus kembali ke `/login` dan tidak menawarkan pemilihan role/company publik.

#### Fase B — company, dashboard, dan navigasi berbasis akses

6. Verifikasi header/profile menampilkan Company Administrator dan PT Coba Arsalynk. Buka Company Dashboard, User & Access, dan Reports melalui perjalanan normal.
7. Cocokkan menu dengan active role dan `enabled_modules`. Untuk PT Coba Arsalynk, data company-approved harus berisi `CORE`, `REQUESTS`, `CRM`, `SALES`, `PROJECTS`, `FINANCE`; modul lain tidak boleh muncul sebagai izin operasional hanya karena model/route tersedia.
8. Gunakan pencarian global atau Data Explorer untuk mencari data dengan `RUN_ID`. Ulangi list dengan `search`, field filter, `ordering`, `page_size`, halaman berikutnya, dan jika endpoint menyediakannya `cursor`. Pastikan metadata count/next/previous dan urutan stabil tanpa duplikasi antarpagina.
9. Buka langsung URL sebuah modul yang tidak di-entitle, lalu panggil API modul tersebut dengan token dan `X-Company-ID` aktif. Pastikan response 403 dan route browser tidak berubah menjadi URL global yang kehilangan konteks secara tidak perlu.

#### Fase C — administrasi anggota dan least privilege

10. Di User & Access, cari anggota dengan email/nama dan pastikan hasil berasal dari company aktif. Buat/invite user `e2e.staff.<RUN_ID>@example.test` sebagai `ROLE-STAFF`.
11. Coba membuat user tanpa email/password/role yang wajib, dengan email duplikat, dengan role tidak dikenal, dengan `ROLE-SUPER-ADMIN`, dan dengan `ROLE-COMPANY-ADMIN` dari actor yang tidak berhak. Pastikan tidak ada partial user atau orphan assignment.
12. Berikan delegasi akses `PROJECTS` kepada user baru dan pilih level yang didukung UI (`Role default`, `No access`, `View only`, atau `View & manage`). Pastikan layar hanya menawarkan modul yang approved untuk company.
13. Login sebagai user baru. Verifikasi dashboard, sidebar, direct route, dan API konsisten dengan role serta delegasinya. `View only` tidak boleh dapat melakukan POST/PATCH/DELETE; `No access` harus menghasilkan 403.
14. Jika menggunakan akun multi-role fixture, ubah active role ke role yang memang assigned lalu refresh. Coba pula role yang tidak assigned. Pastikan role sah tersimpan di `iam_user.active_role_id`, sedangkan role tidak sah ditolak tanpa perubahan.
15. Sebagai Company Admin, nonaktifkan atau cabut akses user baru. Session berikutnya tidak boleh mendapat akses yang sudah dicabut.

#### Fase D — isolasi tenant, profile, password, dan logout

16. Ambil ID record milik company pembanding. Dengan token PT Coba Arsalynk, coba baca dan mutasi ID tersebut serta coba mengganti `X-Company-ID`. Sistem harus menolak atau mengembalikan not found tanpa membocorkan isi record.
17. Login sebagai Super Administrator. Pastikan global read/governance view tersedia sesuai implementasi, tetapi coba satu mutasi domain. Global `enforceSuperAdminReadOnly` harus menolak perubahan tersebut.
18. Pada user sementara, ubah nama/telepon lalu refresh. Coba email invalid/duplikat. Ubah password dengan current password salah, kemudian dengan current password benar dan password baru yang memenuhi validasi. Buktikan login lama gagal dan login baru berhasil.
19. Logout melalui aplikasi, lalu gunakan Back dan refresh route terlindungi. Pastikan cookie/local auth state hilang dan UI kembali ke login. Coba request tanpa token, token malformed, dan refresh token invalid.
20. Catat bahwa endpoint logout backend saat ini hanya mengembalikan 204 dan tidak menunjukkan token revocation server-side. Jika access token lama masih dapat dipakai langsung sampai kedaluwarsa, tandai **KNOWN GAP/security finding** walaupun browser sudah logout.

### 3.7 Expected Result

#### UI

- Login menampilkan feedback jelas tanpa membuka app saat kredensial invalid.
- Setelah login, nama, role aktif, company, dashboard, sidebar, profile, recent items, dan module menu berasal dari `/auth/me` serta company context.
- User tidak melihat fungsi yang tidak dimiliki; direct URL tetap diamankan oleh backend.
- Search/filter/order/pagination mempertahankan company scope.
- Setelah logout, data user sebelumnya tidak tampil kembali.

#### Backend/API

- Login valid menghasilkan access/refresh token dan `/auth/me` yang memuat roles, active role, company, serta enabled modules.
- Semua route protected menolak missing/invalid token dengan 401.
- Module entitlement dan RBAC menolak operasi di luar authority dengan 403.
- Validation/duplicate menghasilkan 400/409 terstruktur dan `request_id`.
- Header company yang dimanipulasi tidak memindahkan user ke company tanpa membership.
- Super Admin tidak dapat melakukan mutation domain karena read-only guard.

#### Database dan audit

- User valid menghasilkan `iam_user`, membership company, assignment role, active role, dan delegasi module yang konsisten.
- Percobaan invalid tidak meninggalkan user/assignment/delegation parsial.
- Profile/password hanya berubah pada user target.
- Mutation sukses memiliki audit event yang dapat dikorelasikan; mutation gagal tidak mengubah business record.

#### Permission dan known gap

- Backend menjadi sumber kebenaran; menyembunyikan menu saja tidak dianggap security.
- Perbedaan authority berdasarkan semua assigned roles versus active role harus dicatat bila UI dan API menghasilkan keputusan berbeda.
- Token yang tetap valid setelah logout merupakan known gap dari logout stateless saat ini.

### 3.8 Konsep/Fitur yang tercakup

Authentication, refresh/session, disabled signup, quick-login QA, profile, password, logout, company selection, multitenancy, dashboard, navigation, global search, recent items, company member CRUD, role assignment, active role, module entitlement/delegation, read-only access, validation, 401/403/404/409, pagination, audit, dan data persistence.

### 3.9 Postcondition

- User sementara dinonaktifkan atau diberi label untuk cleanup QA.
- Password akun seed utama tidak diubah.
- Simpan evidence matrix untuk setiap persona dan permission.
- Tidak ada data company pembanding yang berubah.

---

## 4. TC-02 — Lead-to-Project: CRM, Sales, Credit, and Commercial Handoff

### 4.1 Test Case ID

`TC-02`

### 4.2 Nama skenario

Mengubah inquiry customer nyata menjadi opportunity, estimate, quotation, Sales Order, credit decision, dan Project yang dapat dieksekusi.

### 4.3 Tujuan

Menguji rantai komersial utama dan membuktikan setiap objek terhubung ke customer/company yang sama, status bergerak melalui action yang benar, credit control memilih cabang yang tepat, duplikasi dicegah, permission Director/CRM/Sales/PM diterapkan, dan hasil terlihat pada dashboard/reporting.

### 4.4 Role yang digunakan

- CRM Lead
- Sales
- Estimator (`ROLE-CRM-LEAD` pada seed)
- Director
- Project Manager
- Finance Controller untuk verifikasi exposure/customer invoice
- Technical Staff sebagai negative actor

### 4.5 Precondition

1. TC-01 lulus untuk authentication dan company scope.
2. Modul `CRM`, `SALES`, `PROJECTS`, dan `FINANCE` aktif pada PT Coba Arsalynk.
3. Tersedia pipeline/stage CRM, product/master item bila diperlukan, dan user PM yang valid.
4. Siapkan dua customer baru: `E2E-SAFE-<RUN_ID>` dan `E2E-HOLD-<RUN_ID>`.
5. Customer SAFE memiliki credit limit memadai dan tidak memiliki overdue invoice; customer HOLD memiliki limit rendah atau POSTED CUSTOMER_INVOICE overdue/outstanding yang memicu hold.

### 4.6 Skenario / User Journey

#### Fase A — customer, inquiry, opportunity, dan engagement

1. Login sebagai CRM Lead, buka CRM Accounts, dan buat/temukan party serta customer profile SAFE. Isi identitas, contact, dan credit context yang benar; gunakan search untuk memastikan record dapat ditemukan tanpa melihat customer company lain.
2. Coba membuat customer/inquiry dengan field wajib kosong, tanggal/nominal invalid, dan referensi party company lain. Pastikan error tidak menciptakan record setengah jadi.
3. Buat inquiry `INQ-<RUN_ID>` untuk customer SAFE beserta requirement. Tambahkan activity atau conversation/feedback yang memang tersedia untuk merekam engagement.
4. Qualify inquiry. Ambil response dan buktikan inquiry menjadi `QUALIFIED`, `opportunity_id` terisi, dan opportunity baru berada pada `PROSPECT`/`OPEN` dengan probability awal 10%.
5. Jalankan qualify sekali lagi dengan idempotency key yang sama dan dengan key baru. Operasi tidak boleh menciptakan opportunity kedua untuk inquiry yang sama.
6. Buka pipeline/deal view dan pastikan relation inquiry–opportunity–customer tetap konsisten setelah refresh.

#### Fase B — estimating dan quotation

7. Sebagai Estimator/CRM Lead, buat cost estimate yang menunjuk opportunity/inquiry tadi. Tambahkan beberapa line nyata untuk material/labor/overhead sehingga expected total dapat dihitung manual.
8. Calculate estimate. Cocokkan direct cost, overhead, contingency, markup, selling amount, dan margin dengan perhitungan manual serta nilai opportunity.
9. Uji estimate kosong. Source saat ini dapat membuat synthetic material line Rp100.000.000 ketika line tidak ada dan direct cost nol. Perlakuan ini harus terlihat eksplisit; bila bisnis tidak mengizinkannya, tandai **KNOWN GAP**, jangan menyebutnya input nyata.
10. Create quotation dari estimate terhitung. Verifikasi terbentuk `core_business_document`, `sales_quotation`, quotation lines, dan `crm_quotation_version`; inquiry/estimate menjadi `QUOTED` dan quotation awal `DRAFT`.
11. Sebagai Sales, submit dan send quotation melalui action yang tersedia. Verifikasi status `PENDING_APPROVAL` lalu `SENT`, delivery/workflow history bila dibuat, serta feedback UI.
12. Lakukan customer decision ACCEPTED lalu ulangi pada fixture kedua dengan REJECTED. Frontend saat ini mengirim `{accepted: boolean}` sementara backend meminta `decision`. Bila UI menerima/menolak gagal 400, catat **KNOWN GAP contract mismatch** dan buktikan action API yang benar secara terkontrol tanpa memalsukan keberhasilan UI.
13. Periksa recipient pengiriman. UI saat ini menggunakan `customer@example.com` dan backend hanya mengubah status, tidak mengirim email. Catat bahwa tidak ada bukti email eksternal; jangan menganggap status `SENT` sebagai delivery email yang berhasil.

#### Fase C — Sales Order, credit-safe handoff, dan duplicate protection

14. Convert quotation ACCEPTED menjadi Sales Order melalui command yang tersedia. Verifikasi order `CONFIRMED`, line/reference/customer/company sama, dan quotation `ACCEPTED`.
15. Ulangi conversion dengan idempotency key sama lalu key baru. Satu quotation secara bisnis harus menghasilkan satu order. Jika key baru membuat order tambahan, tandai **FAIL/KNOWN GAP semantic duplicate**.
16. Process opportunity SAFE sebagai deal won. Verifikasi credit snapshot menghitung `credit_limit`, outstanding, overdue, exposure, dan keputusan dari Finance data customer yang benar.
17. Untuk jalur aman, verifikasi opportunity `WON`, Sales Order `CONFIRMED`, Project `PLANNED`/`DRAFT`, dan `project_member` PM dibuat. Semua record harus memiliki company/customer/source order/opportunity yang benar.
18. Pastikan project baru muncul pada Project Manager setelah refresh dan bukan pada staff yang tidak assigned.

#### Fase D — credit hold dan executive override

19. Ulangi alur minimum untuk customer HOLD lalu process deal won. Sistem seharusnya membuat credit snapshot HOLD/over-limit/overdue dan proforma `DRAFT`/`UNPAID`, bukan langsung memberi project operasional.
20. Sebagai Technical Staff, Sales, CRM Lead, PM, dan Director, coba executive override terhadap hold. Secara bisnis hanya Director dengan approval yang sah boleh override.
21. Periksa `crm_executive_approval`, decision metadata, actor, timestamp, dan hubungan ke opportunity. Source saat ini tidak mewajibkan Director di endpoint override dan tidak mengonsumsi approved approval record. Jika CRM/Sales/PM berhasil override, catat **P0 FAIL**.
22. Setelah override sah oleh Director, buktikan hanya satu order/project dibuat dan hold/approval/history tetap dapat diaudit.
23. Coba deal-won pada opportunity tanpa `customer_party_id` dan tanpa PM yang dapat dipetakan. Sistem tidak boleh memilih party aktif pertama atau PM berdasarkan username secara diam-diam. Jika hal itu terjadi, tandai **P1 FAIL** dan simpan ID customer/PM yang salah.

#### Fase E — integrasi baca dan modul opsional

24. Buka dashboard CRM, Contracts & Orders, Project list, Finance exposure, dan Reporting. Cari `RUN_ID`; angka dan link harus menunjuk record yang sama setelah refresh.
25. Buka Support & Garansi. Karena PT Coba Arsalynk tidak memiliki entitlement `SERVICE`, tab/route/API Service harus disembunyikan atau ditolak 403. Tidak adanya dedicated Service flow tidak boleh diganti data dummy.
26. Verifikasi conversation, feedback, attachment metadata, workflow event, stage history, audit event, dan notification hanya bila aksi terkait benar-benar membuatnya. `crm_message_attachment` atau URL metadata bukan bukti file binary telah diunggah.

### 4.7 Expected Result

#### UI

- CRM menampilkan customer, inquiry, deal, estimate, quotation, contract/order, engagement, dan project hasil handoff berdasarkan API nyata.
- Validation mempertahankan input yang dapat diperbaiki dan menampilkan error tanpa false-success toast.
- Refresh tidak menghilangkan data atau menggantinya dengan fallback dummy.
- Module `SERVICE` mengikuti entitlement.

#### Backend/API

- Qualify dan create quotation melakukan write lintas tabel sesuai kontrak.
- Estimate math dapat direkonsiliasi ke line.
- Quotation/order/project hanya dapat dimutasi role yang sah.
- Credit snapshot menggunakan customer yang dipilih, POSTED customer invoices, dan company yang sama.
- Repeated business commands bersifat idempotent secara semantik, bukan hanya untuk satu HTTP idempotency key.

#### Database dan relasi

- `customer_party_id`, inquiry, opportunity, estimate, quotation, order, project, dan PM member dapat ditelusuri sebagai satu graph.
- Tidak ada orphan, cross-company reference, customer fallback salah, atau duplikasi handoff.
- Audit/history merekam actor, action, before/after, dan waktu.

#### Known AS-IS findings yang harus dibuktikan

- Payload customer decision frontend/backend tidak kompatibel.
- Send quotation bukan implementasi pengiriman email.
- Estimate kosong dapat menghasilkan synthetic Rp100 juta.
- Executive override belum Director-only dan belum terikat approval.
- Deal-won berisiko memilih first active party, quotation pertama customer, dan PM berbasis username.
- Duplicate order/project/proforma belum memiliki semantic guard yang memadai.

### 4.8 Konsep/Fitur yang tercakup

Master customer/party, customer credit profile, CRM CRUD, inquiry requirement, qualification, opportunity/pipeline/history, activity, conversation/message/feedback, estimate/line/calculation, quotation/version/delivery, Sales approval/send/decision, contract/order, credit snapshot, executive approval/override, Finance exposure read, Project handoff/member, validation, idempotency, entitlement, RBAC, audit, notification, dashboard, reporting, search, attachment metadata, dan persistence lintas modul.

### 4.9 Postcondition

- Satu dataset SAFE berakhir pada satu order dan satu project.
- Satu dataset HOLD tetap hold/proforma atau memiliki override Director yang dapat diaudit.
- Semua duplicate/error attempt terdokumentasi dan tidak dihitung sebagai transaksi baru.
- Simpan ID project SAFE untuk TC-03.

---

## 5. TC-03 — Project-to-Execution: WBS, Assignment, Progress, and Project Finance

### 5.1 Test Case ID

`TC-03`

### 5.2 Nama skenario

Menjalankan project hasil penjualan dari intake sampai pekerjaan personal, kontrol progres, transfer tanggung jawab, milestone, health/EVM, dan permintaan finansial project.

### 5.3 Tujuan

Memastikan Project Manager dapat membentuk WBS dan mendelegasikan Main Task, Staff hanya bekerja pada assignment miliknya, progres bergerak dari checklist sampai project secara bottom-up, blocked/transfer memiliki ownership yang benar, lifecycle project konsisten, dan biaya/funding/billing dapat ditelusuri ke project serta Finance.

### 5.4 Role yang digunakan

- Project Manager
- Operational Manager
- Supervisor
- Technical Staff
- Staff kedua sebagai penerima transfer
- Finance Controller
- Director sebagai read/approval persona
- CRM/Sales untuk memastikan batas handoff

### 5.5 Precondition

1. Project SAFE dari TC-02 tersedia dan memiliki PM member yang benar.
2. Technical Staff dan Supervisor aktif di company yang sama.
3. Modul `PROJECTS` aktif; Finance actor memiliki `FINANCE`.
4. Project belum memiliki data WBS dengan `RUN_ID`.
5. Siapkan bobot Main Task yang totalnya dapat dihitung manual, misalnya 60% dan 40%.

### 5.6 Skenario / User Journey

#### Fase A — intake dan lifecycle project

1. Login sebagai Project Manager dan buka project hasil TC-02. Verifikasi customer, source order, PM, nilai/tanggal, dan status dari handoff tetap sama dengan CRM/Sales.
2. Jalankan readiness check, milestone/gate, health read/recalculate, serta `advance_stage` hanya setelah precondition bisnis terpenuhi. Catat lifecycle event dan status setiap perpindahan.
3. Uji advance dari status yang tidak valid, ulangi action, dan coba sebagai Staff. Pastikan validation/permission mencegah state skip dan tidak menulis event palsu.
4. Bandingkan status UI (`DRAFT`, `VERIFIED`, `RESERVED`, `STARTED`, `CLOSED`) dengan service (`DRAFT→VERIFIED→RESERVED→STARTED→COMPLETED`), tenant workflow (`RESOURCE_RESERVED`, `IN_PROGRESS`, `QC_REVIEW`, `COMPLETED`, `ON_HOLD`), command (`ACTIVE`, `COMPLETED`), dan status hasil CRM (`PLANNED`/`DRAFT`). Setiap ketidaksinkronan adalah **KNOWN GAP**, terutama bila frontend fallback melakukan direct PATCH setelah action gagal.

#### Fase B — WBS, assignment, dan weekly planning

5. Buat dua Main Task yang merepresentasikan paket kerja nyata, lengkap dengan deskripsi, priority, tanggal, dan bobot 60/40. Uji field wajib kosong, tanggal terbalik, bobot negatif/lebih dari batas, serta total bobot yang tidak masuk akal.
6. Assign Main Task pertama kepada Technical Staff dan Supervisor melalui PM delegation. Pastikan `project_task_assignment` menunjuk `main_task_id`, `user_id`, project, dan company yang sama.
7. Coba assignment ke user company lain, user inactive, user tanpa akses Project, dan duplicate assignment. Sistem tidak boleh menciptakan relation yang tidak sah.
8. Login sebagai Technical Staff. Project boleh terlihat sesuai scope, tetapi hanya Main Task assignment miliknya yang tersedia sebagai sumber Weekly Task.
9. Buat Weekly Task untuk minggu/tanggal valid dengan target terukur. Backend harus memverifikasi assignment Main Task dan memaksa `assignee_id` menjadi current user.
10. Coba membuat Weekly Task pada Main Task yang belum assigned, untuk assignee lain melalui payload, dengan week/date invalid, dan pada project company lain. Harus ditolak tanpa record.
11. Login sebagai Supervisor dan ulangi weekly planning untuk assignment Supervisor. Pastikan assigned role bukan alasan untuk melihat seluruh pekerjaan personal user lain.

#### Fase C — daily execution, checklist, block, dan roll-up

12. Turunkan Weekly Task menjadi beberapa Daily Task. Isi owner, date, target/deliverable, dan status awal yang sesuai. Uji field wajib, referensi weekly salah, dan owner lintas company.
13. Tambahkan checklist/control item pada satu Daily Task. Tandai sebagian item selesai, refresh, kemudian selesaikan semuanya.
14. Verifikasi progress Daily Task dihitung dari rasio checklist bila checklist tersedia; Daily average mengubah Weekly; Weekly average mengubah Main Task; weighted Main Task mengubah `project_project.progress_percent`.
15. Pada Daily Task tanpa checklist, update progress melalui action yang disediakan dan periksa activity log. Coba progress <0, >100, penurunan/transition ilegal, dan update oleh user bukan owner.
16. Laporkan sebuah task sebagai blocked dengan reason. Pastikan status/reason/activity tampil di Tasks, Project workspace, feed/notification bila dibuat, dan report staff.
17. Perbaiki blocker lalu lanjutkan hingga completed melalui action yang sah. Pastikan tidak ada false-success ketika backend gagal.

#### Fase D — transfer/reassignment dan personal workspace

18. Sebagai owner, ajukan transfer Daily Task kepada Staff kedua dengan alasan. Pastikan request `PENDING`, task belum pindah, dan terlihat pada queue PM.
19. Coba transfer oleh non-owner, ke user company lain, atau transfer kedua saat masih pending. Harus ditolak.
20. Sebagai PM, reject satu fixture transfer dan approve fixture lainnya. Rejected tidak mengubah owner; approved mengubah `owner_id` dan status request ke `APPROVED`.
21. Coba direct reassign sebagai Staff lalu sebagai PM. Hanya actor yang memang diizinkan boleh mengubah ownership; seluruh perubahan harus memiliki activity/audit evidence.
22. Login sebagai owner lama dan baru. Verifikasi tab Today, Overdue, Active, Completed, Blocked, All, Workspace Personal, dan Transfer Requests terfilter berdasarkan user/status secara nyata.

#### Fase E — fitur project lanjutan dan hubungan Finance

23. Buat atau baca milestone, task dependency, timesheet, risk, issue/action, change request, material requirement, resource request/allocation, board position, technical brief/version, requirement/acceptance criteria, equipment usage, dan progress snapshot melalui UI bila tersedia atau Data Explorer/API bila hanya generic CRUD.
24. Untuk setiap resource generic, uji minimal create valid, invalid relation, read/search/filter/order/pagination, update field non-lifecycle, dan delete pada fixture QA. Jangan menganggap keberadaan CRUD sebagai workflow otomatis.
25. Dari tab `Biaya, Dana & Billing`, buat cost entry atau project expense dengan kategori/division/deskripsi yang dapat direkonsiliasi, request funding, dan billing proposal untuk project.
26. Login Finance untuk membaca/memutuskan funding dan memproses billing pada TC-04. Staff tanpa Finance tidak boleh memperoleh write access hanya karena dapat melihat project.
27. Jalankan EVM/financial performance. Cocokkan Planned Value, Earned Value, Actual Cost, CPI/SPI, dan project progress dengan source record. Catat bahwa Actual Cost saat ini menggunakan nilai terbesar dari `fin_project_cost_entry` dan `project_expense`, bukan penjumlahan terrekonsiliasi; bila keduanya berisi biaya berbeda, tandai **KNOWN GAP**.
28. Gunakan project search/filter/sort/pagination dan dashboard/reporting untuk menemukan `RUN_ID`. Refresh dan login ulang untuk membuktikan persistence.

### 5.7 Expected Result

#### UI

- Project hasil CRM muncul tanpa data Ghost hard-coded.
- Hierarchy, personal workspace, milestones, transfers, financial panel, dan Tasks menampilkan dataset yang sama sesuai persona.
- Error mempertahankan consistency UI; tidak boleh ada optimistic state permanen atau success toast jika API gagal.

#### Backend/API

- Assignment menjadi syarat Weekly Task untuk Staff/Supervisor dan assignee tidak dapat dipalsukan.
- Ownership membatasi update/progress/block/transfer.
- Roll-up berjalan checklist → Daily → Weekly → Main → Project.
- Transfer approval atomik terhadap perubahan owner.
- Finance reads/writes tetap membutuhkan module/role Finance yang sesuai.

#### Database dan relasi

- Graph `project_project → project_main_task → project_task_assignment → project_weekly_task → project_daily_task → project_control_item` lengkap dan company-consistent.
- Activity log, lifecycle event, transfer request, progress, milestone, cost, funding, dan billing menunjuk project yang sama.
- Invalid/unauthorized request tidak menghasilkan orphan atau perubahan parsial.

#### Known AS-IS findings yang harus dibuktikan

- Terdapat beberapa vocabulary/state writer Project yang tidak konsisten.
- Frontend dapat fallback ke direct project PATCH ketika advance action gagal.
- Banyak fitur project lanjutan hanya generic CRUD, bukan orchestrated lifecycle.
- EVM memilih `max(project_expense, fin_project_cost_entry)` dan dapat mengurangi actual cost bila kedua sumber berbeda.
- Hampir semua relation masih berupa scalar ID tanpa Prisma `@relation`/database FK yang memadai.

### 5.8 Konsep/Fitur yang tercakup

Project intake, customer/order relation, lifecycle/workflow, readiness, milestone/gate, WBS, main/weekly/daily task, assignment, checklist, weighted progress, blocked/recovery, transfer/direct reassignment, personal workspace, activity log, timesheet, dependency, risk, issue, change request, materials/resources, board, technical brief, acceptance, equipment, snapshot, project health, EVM, cost, funding, billing, role/ownership, CRUD, validation, search/filter/sort/pagination, audit, notification, dan persistence.

### 5.9 Postcondition

- Project memiliki hierarchy dan progress yang dapat dihitung ulang.
- Minimal satu task completed, satu transfer approved, satu transfer rejected, dan satu blocked/recovered history tersimpan.
- Funding/billing/cost fixture tersedia untuk TC-04.
- Catat lifecycle vocabulary aktual yang digunakan oleh setiap endpoint/UI.

---

## 6. TC-04 — Request-to-Accounting: Approval, Cash, Billing, GL, Tax, Asset, and Closing

### 6.1 Test Case ID

`TC-04`

### 6.2 Nama skenario

Menjalankan kebutuhan dana operasional dan transaksi project melalui approval berjenjang sampai pertanggungjawaban, pencatatan keuangan, rekonsiliasi, aset, dan tutup buku.

### 6.3 Tujuan

Menguji dua rantai yang seharusnya bertemu di Finance: Request → OM → Director → disbursement → LPJ, serta Project billing/funding/cost → journal/payment/bank/tax/closing. Case ini juga membuktikan segregation of duties, period lock, journal balance, auditability, dan gap ketika status operasional tidak menghasilkan accounting side effect.

### 6.4 Role yang digunakan

- Technical Staff sebagai requester
- Operational Manager
- Director
- Finance Controller A sebagai maker/requester
- Finance Controller B/AP-AR sebagai approver bila SoD memerlukan actor berbeda
- Project Manager untuk source project/billing
- Company Admin dan CRM Lead sebagai negative actors

### 6.5 Precondition

1. TC-01 sampai TC-03 telah menghasilkan user, project, cost, funding, dan billing fixture.
2. Fiscal year dan fiscal period QA tersedia atau dapat dibuat oleh Finance.
3. Standard chart of accounts/journal/bank accounts tersedia; bila belum, gunakan setup standard action.
4. Gunakan nominal mudah direkonsiliasi, misalnya request Rp10.000.000, realisasi Rp9.500.000, selisih Rp500.000.
5. Siapkan invoice customer dan vendor fixture, bank statement line, tax transaction, serta asset fixture.
6. Gunakan dua Finance actor untuk membuktikan SoD; jangan menyetujui transaksi sendiri kecuali source memang mengizinkan dan test bertujuan menemukan defect.

### 6.6 Skenario / User Journey

#### Fase A — request, approval, disbursement, dan LPJ

1. Login sebagai Technical Staff. Buat draft request operasional terkait project, isi type/title/amount/purpose/urgency/invitees, dan pilih file bukti lokal melalui form.
2. Refresh draft lalu submit sesuai perjalanan UI. Verifikasi state awal `DRAFT` atau `PENDING_OM`, payload request dapat direkonstruksi, workflow instance/approval dibuat, dan reviewer mendapat notification bila implementasi membuatnya.
3. Uji amount nol/negatif/non-number, field wajib kosong, invitee company lain, attachment invalid, serta duplicate submission. Tidak boleh ada partial workflow.
4. Verifikasi mekanisme attachment dengan ketat. Frontend saat ini hanya menyimpan nama file sebagai URL sintetis `https://storage.marka.id/docs/...`; tidak ditemukan upload binary untuk request. Jika file tidak benar-benar tersimpan/dapat diunduh, tandai **KNOWN GAP** meskipun nama file tampil.
5. Login sebagai OM dan review request. Jalankan reject/re-check pada fixture pertama lalu approve/forward pada fixture utama. Verifikasi remarks, actor, approval, audit, notification, dan state `PENDING_EXEC` atau `RE_CHECKING`.
6. Login sebagai Director dan approve fixture utama; gunakan fixture lain untuk reject. Verifikasi approved request menuju `REGISTERED`, sedangkan reject menuju `REJECTED`.
7. Login sebagai Finance dan disburse approved request dengan account/reference. Verifikasi state `DISBURSED` dan evidence reference.
8. Login kembali sebagai requester dan submit LPJ dengan realization, discrepancy, notes, serta invoice URL/metadata. OM meminta revisi pada fixture pertama lalu memverifikasi fixture utama sampai `COMPLETED`.
9. Coba setiap privileged endpoint menggunakan Staff, CRM Lead, Company Admin, actor company lain, dan actor pada urutan status yang salah. Secara bisnis backend harus menolak 403/validation.
10. Source saat ini tidak memasang role middleware pada validate/approve/disburse/verify routes dan tidak membuktikan ownership saat submit LPJ. Bila actor tak berhak berhasil, catat **P0 FAIL**. Periksa juga workflow `status=COMPLETED` yang dapat muncul saat current state baru `REGISTERED`; catat inconsistency.
11. Cari payment, bank movement, journal, atau Finance disbursement yang dibuat oleh langkah 7. Saat ini Request menyimpan banyak data dalam `core_audit_event` JSON dan tidak membuat transaksi Finance. Ketidakhadiran accounting record adalah **KNOWN GAP**, bukan PASS.

#### Fase B — project funding, billing, receivable, dan payment

12. Sebagai Finance, review funding request dari TC-03. Uji approve/reject melalui `/project-fundings/:id/decide`, lalu draw approved funding. Coba draw sebelum approve dan draw dua kali.
13. Pastikan UI tidak menggunakan direct generic PATCH untuk mengubah status. Source memiliki direct PATCH lama dan `decideFunding` tidak memakai DocumentFSM; setiap bypass SoD/FSM dicatat sebagai **P0/P1 FAIL**.
14. Lengkapi billing proposal/document customer untuk project. Jalankan urutan `DRAFT → SUBMITTED → VERIFIED → APPROVED → POSTED` melalui custom action, menggunakan actor yang sesuai.
15. Uji reject, action out-of-order, self-approval yang melanggar SoD, posting di period closed, missing account, dan duplicate post.
16. Setelah posting customer invoice, verifikasi billing status, tax transaction, GL journal entry/lines, debit=credit, project/customer reference, fiscal period, dan outstanding yang digunakan CRM credit snapshot.
17. Buat payment/customer receipt dan jalankan `DRAFT → SUBMITTED → APPROVED → POSTED`/execute sesuai action. Coba actor sama sebagai maker/approver, payment invalid, dan duplicate execute.
18. Verifikasi apakah execute membentuk allocation, perubahan outstanding, bank movement, dan GL. Source saat ini hanya memperbarui status/tanggal payment; side effect yang tidak ada harus dicatat **KNOWN GAP**.
19. Pastikan generic CRUD tidak dapat mengubah terminal Finance states (`POSTED`, `PAID`, `CLOSED`, `LOCKED`, `EXECUTED`, `REVERSED`). Uji pula state pre-terminal yang masih bisa dipatch; jika action resmi dapat dilewati, catat defect.

#### Fase C — General Ledger, laporan, kas/bank, dan pajak

20. Setup standard accounts bila environment kosong. Buat journal entry dua line yang balance, post, lalu reverse dengan alasan. Verifikasi reversal menukar debit/credit dan original menjadi `REVERSED`.
21. Coba journal satu line, unbalanced, account invalid, company lain, duplicate number, dan posting pada closed period. Pastikan tidak ada line/journal parsial.
22. Rekonsiliasi Trial Balance, Profit & Loss, Balance Sheet, account balance, dan project profitability terhadap journal lines yang POSTED. Total debit harus sama dengan total credit.
23. Lakukan internal bank transfer dengan dua account yang sah. Import bank statement/CSV yang valid dan invalid, lalu reconcile statement line ke transaksi target. Uji duplicate import/reconcile dan actor non-Finance.
24. Verifikasi bank balance dan reconciliation status. Bila upload/import hanya menerima data/CSV payload dan bukan penyimpanan file umum, dokumentasikan batasnya.
25. Periksa tax summary dan record NTPN pada tax transaction yang memenuhi syarat. Uji nomor kosong/duplikat serta role tidak sah.

#### Fase D — fixed asset dan Project WIP

26. Buat category, asset, dan asset book dengan acquisition value, accumulated depreciation, useful life, serta account mapping yang dapat direkonsiliasi.
27. Tampilkan depreciation schedule, jalankan satu depreciation dan batch depreciation pada open period, lalu ulangi untuk memastikan tidak double-post.
28. Capitalize project WIP bila fixture memenuhi syarat dan pastikan project/asset/journal saling menunjuk.
29. Dispose asset dengan proceeds/gain/loss fixture. Verifikasi journal terhadap account aset biaya, accumulated depreciation, cash/receivable, serta gain/loss.
30. Source saat ini tampak memakai account accumulated depreciation sebagai `assetAccount` untuk credit cost basis. Bila journal salah, hentikan approval UAT untuk disposal dan catat **P0 accounting defect**.

#### Fase E — period/year closing, audit, dan laporan akhir

31. Request period closing sebagai Finance maker; approve dengan Finance actor berbeda; execute dengan actor yang diizinkan. Verifikasi SoD, snapshot/report, status period, dan audit.
32. Coba posting journal/billing/asset pada closed period. Harus ditolak. Reopen hanya dengan actor dan reason yang sah, kemudian buktikan posting recovery berjalan.
33. Jalankan year-end closing hanya setelah seluruh period memenuhi precondition. Periksa retained earnings/closing journal/snapshot sesuai implementasi, lalu uji reopen year-end.
34. Filter Audit Trail berdasarkan entity, action, user, tanggal, dan pagination. Cocokkan event dengan `request_id`, actor, before/after, serta transaksi dari seluruh fase.
35. Buka Finance Dashboard, Executive Report, Profitability, Costing & WIP, Funding, AP, Billing, AR, Cash & Bank, GL, Laporan Keuangan, Reconciliation, Tax, Assets, Period Closing, dan Reporting. Tidak boleh ada angka hard-coded yang disalahartikan sebagai hasil test.

### 6.7 Expected Result

#### UI

- Setiap persona melihat queue, action, status, feedback, dan laporan sesuai role.
- Refresh/relogin mempertahankan transaksi dan status.
- Kegagalan API tidak menghasilkan toast sukses atau status lokal palsu.
- Attachment request tidak boleh diklaim tersimpan bila hanya URL sintetis.

#### Backend/API

- Workflow menolak urutan dan actor tidak sah; semua custom action idempotent secara bisnis.
- Billing post menciptakan tax dan balanced GL side effect pada open period.
- Journal posting/reversal, bank reconcile, tax NTPN, asset operations, dan closing menerapkan validation/SoD/period guard.
- Error mengembalikan status serta `request_id` yang dapat ditelusuri.

#### Database dan accounting

- Request state, workflow approval, notification, dan audit konsisten.
- Billing, payment, journal, lines, period, bank, tax, asset/book/depreciation/disposal, project, dan customer tetap company-consistent.
- Setiap posted journal balance; reversal tepat; locked period tidak menerima posting.
- Laporan berasal dari transaksi yang sama dan dapat direkonsiliasi.

#### Known AS-IS findings yang harus dibuktikan

- Privileged Request actions tidak memiliki backend role gates yang memadai.
- Request disbursement tidak membentuk Finance payment/journal/bank transaction.
- Request attachment adalah URL sintetis, bukan binary upload yang terverifikasi.
- Finance UI/generic CRUD dapat melewati sebagian FSM dan SoD.
- Payment execute tidak membentuk GL/bank/allocation/outstanding side effects.
- Funding decide tidak menggunakan DocumentFSM.
- Asset disposal berisiko menggunakan account mapping yang salah.
- Monthly close snapshot failure dapat disuppress dan posting diizinkan bila fiscal period tidak ditemukan.

### 6.8 Konsep/Fitur yang tercakup

Request CRUD, draft/submission, member search/invitee, attachment metadata, OM/Director approval, rejection/re-check, disbursement, LPJ/revision/verification, workflow/notification/audit, project funding/cost/billing, AP/AR, customer receipt/vendor payment, Finance FSM, SoD, GL/journal/reversal, fiscal year/period, reporting, bank transfer/import/reconciliation, tax/NTPN, fixed asset/depreciation/disposal, WIP capitalization, validation, authorization, error/recovery, persistence, dan accounting consistency.

### 6.9 Postcondition

- Satu request selesai dengan LPJ dan satu rejected/revision history tersedia.
- Satu billing posted beserta tax/journal; satu reversal tersedia.
- Satu payment menunjukkan side effects aktual yang ditemukan.
- Satu asset depreciation dan disposal fixture terrekonsiliasi atau ditandai blocked karena defect P0.
- Period dikembalikan ke state yang disetujui test lead agar case berikutnya dapat membaca data.

---

## 7. TC-05 — Extended Operations, Security, Recovery, and Final Reconciliation

### 7.1 Test Case ID

`TC-05`

### 7.2 Nama skenario

Menjalankan rantai supply/production/delivery/service yang tersedia, membuktikan batas implementasinya, lalu melakukan assurance seluruh sistem terhadap reporting, tenant isolation, audit, error recovery, dan consistency data.

### 7.3 Tujuan

Menguji seluruh modul yang belum tercakup oleh empat journey utama tanpa mengarang otomasi: Procurement, Inventory, Manufacturing, Quality, Logistics, Service, Analytics, Implementation, Reporting, Core documents/files, dan Resource Explorer. Case ini membedakan status-only action dari integrasi transaksi nyata serta memastikan kegagalan tidak merusak hasil TC-01 sampai TC-04.

### 7.4 Role yang digunakan

- Company Admin pada company fixture ber-entitlement lengkap
- Project Manager/Operational Manager
- Supervisor/Staff
- Sales/CRM Lead
- Finance Controller
- Director
- Super Administrator untuk global read-only verification
- User company lain dan user tanpa module entitlement sebagai negative actors

Untuk modul lanjutan, top-level source umumnya hanya memeriksa entitlement module dan tidak selalu memiliki role/action guard lokal. Expected business security tetap least privilege; keberhasilan actor yang tidak semestinya harus dicatat sebagai gap, bukan dianggap desain final.

### 7.5 Precondition

1. Gunakan company QA terpisah dengan entitlement `PROCUREMENT`, `INVENTORY`, `MANUFACTURING`, `QUALITY`, `ASSETS`, `SERVICE`, `LOGISTICS`, `ANALYTICS`, `IMPLEMENTATION`, dan `REPORTING` sesuai kebutuhan, selain module core.
2. Semua actor merupakan anggota company tersebut dan memiliki role fixture yang terdokumentasi.
3. Tersedia master supplier/party, product/item, UOM, warehouse/location, chart of accounts, customer/order/project, dan fiscal period terbuka.
4. Tidak ada dedicated Next page untuk banyak modul ini. Eksekusi melalui Resource Explorer jika resource terdaftar atau API client; ketidaktersediaan UI harus dicatat.
5. Simpan baseline row count, status, ledger, balance, journal, report, dan audit sebelum journey.

### 7.6 Skenario / User Journey

#### Fase A — Procurement sampai penerimaan

1. Buat Purchase Requisition dan lines untuk material project/manufacturing dengan supplier/product/UOM/company yang valid. Uji field wajib, nominal/quantity invalid, duplicate number, dan reference lintas company.
2. Convert requisition ke RFQ melalui `/procurement/purchase-requisitions/:id/convert-to-rfq`. Verifikasi RFQ terbentuk dan cari apakah lines/status requisition ikut berubah.
3. Buat supplier quotation dan Purchase Order beserta lines melalui resource/API yang tersedia. Jalankan lifecycle yang benar-benar didukung; jangan mengasumsikan conversion quotation→PO karena executable action tersebut tidak ditemukan.
4. Buat Goods Receipt dan receipt lines untuk PO, lalu buat supplier invoice fixture yang relevan melalui Finance bila dibutuhkan.
5. Jalankan `/procurement/purchase-orders/:id/three-way-match`. Secara bisnis expected adalah perbandingan PO, GR, dan invoice untuk quantity/price/tolerance sebelum `MATCHED`.
6. Source saat ini langsung membuat `proc_three_way_match` berstatus `MATCHED` tanpa perbandingan tersebut. Buktikan dengan fixture mismatch dan tandai **P1 FAIL** bila tetap matched.
7. Pastikan conversion requisition saat ini hanya membuat RFQ tanpa copy line/status transition; catat sebagai **KNOWN GAP**. Pastikan tidak ada AP/journal/stock side effect yang diklaim otomatis jika memang tidak dibuat.

#### Fase B — Inventory, Manufacturing, dan Quality

8. Buat stock reservation dan stock move untuk material yang diterima. Catat stock balance, ledger, valuation layer, lot/serial, dan reservation sebelum complete.
9. Complete stock move melalui `/inventory/stock-moves/:id/complete`. Secara bisnis quantity, ledger, balance, valuation, reservation, dan Finance harus konsisten.
10. Source saat ini hanya mengubah `inv_stock_move.status=COMPLETED`. Jika ledger/balance/valuation tidak berubah, tandai **KNOWN GAP**, dan pastikan dashboard tidak menampilkan stock seolah-olah telah bertambah dari data dummy.
11. Buat BOM/version/lines, routing/operations, production order/material, dan work order yang mereferensikan item serta stock fixture.
12. Jalankan release production order, issue materials, start work order, dan complete work order dalam urutan yang benar. Uji action out-of-order, duplicate, insufficient stock, dan actor tanpa entitlement.
13. Cocokkan material issue, production output, scrap, labor log, machine log, cost ledger, inventory balance, dan Finance journal. Source saat ini hanya mengubah status/timestamp; side effect yang tidak ada adalah **KNOWN GAP**.
14. Buat quality plan/point dan inspection yang terkait receipt/production/project. Tambahkan result, lalu complete inspection.
15. Uji failed inspection. Secara bisnis failure seharusnya menghasilkan/gate NCR/CAPA dan lifecycle upstream. Source saat ini hanya menandai inspection `COMPLETED`; bila production/project/order tetap bebas bergerak tanpa rule, catat gap.
16. Buat/read/update Nonconformance dan Corrective Action melalui CRUD untuk membuktikan persistence, tetapi jangan menyatakan keduanya dibuat otomatis oleh inspection bila tidak terjadi.

#### Fase C — Sales delivery, Logistics, dan Service

17. Gunakan Sales Order/customer/product fixture untuk membuat sales delivery/lines dan logistics shipment/lines/tracking event.
18. Catat proof of delivery melalui `/logistics/shipments/:id/proof-of-delivery` dengan receiver/time/evidence yang valid dan invalid.
19. Verifikasi POD record dan shipment status aktual. Cari perubahan pada sales delivery/order fulfillment. Source tidak mengorkestrasi update upstream tersebut; ketidakhadiran adalah **KNOWN GAP**.
20. Buat Service Case terkait customer/order/product dan message/approval/resolution bila diperlukan, kemudian resolve melalui `/service/cases/:id/resolve`.
21. Verifikasi case `RESOLVED` dan resolution data. Cari replacement delivery, inventory movement, credit note/billing adjustment, warranty record, dan notification. Source hanya mengubah case status; side effect yang tidak ada harus dicatat.
22. Uji tenant/module/role restriction pada Procurement, Inventory, Manufacturing, Quality, Logistics, dan Service. Entitlement hilang harus 403. Jika user dengan role tidak relevan tetapi entitlement aktif dapat melakukan action kritis, catat **permission gap**.

#### Fase D — Analytics, Implementation, Core documents, dan external integration

23. Buat KPI definition/target, dashboard/widget, dan alert rule melalui CRUD. Jalankan `/analytics/kpis/recalculate` dan `/analytics/alerts/evaluate`.
24. Endpoint saat ini mengembalikan sukses/count nol tanpa computation/persistence. Pastikan tidak ada KPI result/alert event palsu lalu tandai modul **STUB/KNOWN GAP**.
25. Buat release, phase/item, workflow/stage, work item, test cycle, dan GTM milestone pada Implementation. Uji search/filter/order/pagination dan relation ID.
26. Verifikasi bahwa Implementation saat ini generic CRUD dan tidak otomatis mengubah Project, Service, Analytics, atau deployment. Ketiadaan integration service harus dilaporkan sebagai batas implementasi.
27. Uji Core business documents, document links, attachment/file metadata, templates/versions/fields, generated document, signature, team contact, quick action, notification, dan recent item hanya melalui path yang benar-benar tersedia.
28. Bedakan metadata file dari upload binary. `core_file`, document attachment, CRM attachment, dan request attachment tidak otomatis membuktikan object storage upload/download. Chatbot knowledge upload adalah dependency HTTP/SSE eksternal dan diuji terpisah dengan file aman bila service tersedia.
29. Putuskan dependency chatbot/network secara terkontrol. UI utama harus tetap dapat digunakan; chatbot harus menampilkan error/retry yang jelas dan tidak menghapus transaksi ERP.

#### Fase E — reporting, data explorer, resilience, dan rekonsiliasi akhir

30. Buka Dashboard dan Reporting untuk setiap persona. Cocokkan counts/totals/detail ke CRM, Project, Finance, Request, timesheet, dan audit records dari TC sebelumnya.
31. Identifikasi nilai hard-coded: CRM average cycle 14, margin 25,5, Finance cash position 1,5 miliar, overdue 0, atau pending approval 0 sebagaimana ditemukan di source. Jika nilai tampil tanpa dukungan data, tandai **P1 reporting defect**.
32. Jalankan Data Explorer pada seluruh resource yang terdaftar: search teks, exact filter, ordering ascending/descending, page/page_size, cursor bila didukung, empty result, invalid ordering, ID tidak ada, create/update/delete fixture non-authoritative, serta refresh.
33. Pada workflow/approval/Finance terminal records, coba generic PATCH/DELETE. Guard harus mencegah bypass. Jika pre-terminal approval/status dapat diubah tanpa action resmi, catat **P0 gap**.
34. Ulangi mutation yang sama dengan idempotency key sama dan berbeda. Same key/payload harus replay aman; same key/different payload harus conflict; new key tidak boleh menggandakan command yang secara bisnis unik.
35. Simulasikan validation error, 404, unauthorized 401, forbidden 403, unique conflict 409, database unavailable 503 di environment yang aman, timeout, serta dependency chatbot gagal. Setiap response harus memiliki feedback dan `request_id`; UI tidak boleh mengganti response gagal dengan array kosong atau toast sukses.
36. Cari penggunaan `.catch(() => null/[])` dengan journey yang gagal. Jika panel menjadi kosong seolah tidak ada data, atau Company Master menampilkan sukses setelah PATCH gagal, tandai **error masking defect**.
37. Verifikasi audit/history untuk semua mutation material. Filter berdasarkan user/entity/action/date dan cocokkan before/after. Global audit bersifat response-driven; jika mutation berhasil tanpa audit ketika audit insert gagal, catat known reliability gap.
38. Uji cross-company read/write untuk satu record dari setiap family modul. Karena mayoritas scalar IDs tidak memiliki FK/Prisma relation, lakukan query integritas untuk orphan dan cross-company reference.
39. Bandingkan hasil list sebelum/sesudah refresh, relogin, active-role switch, dan instance/server restart. Cache dashboard/feed bersifat process-local; data harus akhirnya konsisten dan tidak bocor antarcompany.
40. Login Super Admin untuk global read-only verification, lalu logout seluruh persona. Pastikan tidak ada user biasa yang mempertahankan akses lintas company/module dan tidak ada data seed/dummy frontend yang muncul sebagai transaksi aktual.

### 7.7 Expected Result

#### UI dan API coverage

- Fitur yang memiliki dedicated UI bekerja melalui API nyata; fitur tanpa UI tetap dapat diuji pada API/Resource Explorer dan dicatat sebagai coverage gap.
- Entitlement menjadi prasyarat semua modul lanjutan.
- Search/filter/sort/pagination stabil dan company-scoped.
- Error/dependency failure tidak menghasilkan fallback dummy, data lama milik user lain, atau false success.

#### Business integration

- Relasi source–target dapat ditelusuri dengan ID dan company yang benar.
- Hanya side effect yang benar-benar tercipta yang dinyatakan PASS.
- Three-way match, stock completion, manufacturing, inspection, POD, dan Service resolve yang hanya mengubah status harus diberi hasil **KNOWN GAP/FAIL terhadap integration expectation**.
- Analytics recalculate/evaluate tetap ditandai STUB sampai menghasilkan persistence nyata.

#### Security dan consistency

- Missing entitlement, unauthorized role, wrong company, wrong ownership, dan invalid state ditolak sebelum mutation.
- Duplicate/idempotent execution tidak menggandakan business object.
- Generic CRUD tidak boleh menjadi jalan pintas lifecycle/approval/accounting.
- Tidak ada orphan/cross-company reference baru; audit dapat menelusuri mutation material.

#### Reporting dan resilience

- Dashboard/report berasal dari persisted scoped data dan dapat direkonsiliasi.
- KPI hard-coded tidak boleh disetujui sebagai angka production.
- Restart/cache/dependency failure tidak merusak database atau isolation.
- Logout menutup state browser seluruh persona.

### 7.8 Konsep/Fitur yang tercakup

Procurement requisition/RFQ/quotation/PO/GR/three-way match, Inventory reservation/move/ledger/balance/count/valuation/lot/serial, Manufacturing BOM/routing/production/work order/material/output/scrap/labor/machine/cost, Quality plan/inspection/result/NCR/CAPA, Sales delivery, Logistics shipment/tracking/POD, Service case/message/approval/resolution, Analytics KPI/dashboard/widget/alert, Implementation release/phase/workflow/work item/test cycle/GTM, Core document/file/template/signature/notification/recent item, Resource Explorer CRUD, search/filter/sort/pagination, reporting, audit, idempotency, error contracts, external chatbot, cache/restart, multitenancy, security, recovery, dan final reconciliation.

### 7.9 Postcondition

- Seluruh fixture menggunakan `RUN_ID` dan daftar cleanup tersedia.
- Data TC-01 sampai TC-04 tidak berubah akibat negative/recovery test.
- Baseline dan final row count/status/ledger/journal/report/audit telah dibandingkan.
- Semua behavior status-only, stub, missing UI, hard-coded reporting, permission gap, dan orphan risk memiliki defect/evidence terpisah.
- Seluruh persona logout dan token QA dikelola sesuai kebijakan environment.

---

## 8. Matriks keterlacakan cakupan

Legenda: **P** = cakupan primer, **S** = cakupan pendukung/verification, **N** = negative/boundary test.

| Konsep/modul | TC-01 | TC-02 | TC-03 | TC-04 | TC-05 |
|---|---:|---:|---:|---:|---:|
| Authentication, refresh, session, logout | P | S | S | S | S |
| User, company, tenant, membership | P | S | S | S | N |
| Role, active role, module entitlement/delegation | P | S | P | P | P |
| Dashboard, navigation, recent items, command/global search | P | S | S | S | P |
| Generic CRUD, validation, persistence | P | P | P | P | P |
| Search, filter, sort, pagination/cursor | P | S | P | S | P |
| Master party/customer/product/UOM | S | P | S | S | P |
| CRM inquiry/opportunity/pipeline/engagement | N | P | S | S | S |
| Estimate, quotation, Sales Order/contract | N | P | S | S | S |
| Credit snapshot/approval/override | N | P | S | S | S |
| Project Management: lifecycle, WBS, assignment, Weekly/Daily | N | S | P | S | S |
| Checklist, progress, block, transfer, activity | N | S | P | S | S |
| Project risk/issue/change/resource/timesheet/technical data | N | S | P | S | S |
| Project cost/funding/billing/EVM | N | S | P | P | S |
| Request, OM/Director approval, disbursement, LPJ | N | S | S | P | S |
| Finance/Accounting: AP/AR/payment/billing | N | S | S | P | S |
| GL, bank, reconciliation, tax, fiscal closing | N | S | S | P | S |
| Assets/depreciation/disposal/WIP | N | N | S | P | S |
| Procurement | N | N | S | S | P |
| Inventory | N | N | S | S | P |
| Manufacturing | N | N | S | S | P |
| Quality | N | N | S | S | P |
| Logistics and Service | N | S | S | S | P |
| Analytics and Implementation | N | N | S | S | P |
| Reporting and reconciliation | S | S | S | P | P |
| Attachment/file/external chatbot | S | S | S | P | P |
| Notification, feedback, audit/history | S | P | P | P | P |
| Error handling, retry, recovery, idempotency | P | P | P | P | P |
| Tenant isolation and security restriction | P | P | P | P | P |

## 9. Database verification map

QA tidak wajib menggunakan SQL tertentu, tetapi minimal harus membuktikan kelompok data berikut. Gunakan query read-only dan filter `company_id`, `tenant_id`, `RUN_ID`, atau ID hasil response.

| Journey | Tabel/kelompok utama yang diverifikasi |
|---|---|
| TC-01 | `iam_user`, `iam_user_role`, `iam_role`, `iam_company_membership`, `iam_company_module`, `iam_user_module`, `core_tenant`, `core_company`, `core_audit_event` |
| TC-02 | `master_party`, `master_customer_profile`, `crm_customer_inquiry`, `crm_inquiry_requirement`, `crm_opportunity`, `crm_cost_estimate`, lines, `core_business_document`, `sales_quotation`, lines, `crm_quotation_version`, `sales_order`, `crm_credit_status_snapshot`, `crm_executive_approval`, `project_project`, `project_member` |
| TC-03 | `project_main_task`, `project_task_assignment`, `project_weekly_task`, `project_daily_task`, `project_control_item`, `project_task_transfer_request`, `project_task_activity_log`, lifecycle/milestone/risk/issue/timesheet/resource/progress tables, `fin_project_cost_entry`, `project_expense`, `fin_project_funding`, `fin_billing_proposal` |
| TC-04 | request payload events, `core_workflow_instance`, `core_workflow_approval`, notification tables, `fin_account`, `fin_journal`, `fin_journal_entry`, `fin_journal_line`, billing/payment/allocation, bank/statement/reconciliation, tax, fiscal year/period/closing, asset/book/depreciation/disposal tables |
| TC-05 | `proc_*`, `inv_*`, `mfg_*`, `qa_*`, `logistics_*`, `service_*`, `analytics_*`, `implementation_*`, Core document/file/template/signature tables, reporting views, `core_audit_event` |

Repo schema Prisma tidak mendeklarasikan `@relation`, dan migrations repository hanya membuat sedikit foreign key IAM/company. Karena itu, keberadaan UUID yang sama harus diverifikasi manual; jangan mengandalkan ORM untuk membuktikan referential integrity.

## 10. Checklist rekonsiliasi lintas case

Setelah lima case selesai, jawab seluruh pertanyaan berikut dengan evidence:

1. Apakah satu customer SAFE hanya menghasilkan satu opportunity, quotation, order, dan project?
2. Apakah customer HOLD tidak mendapat project tanpa approval Director yang benar?
3. Apakah project customer/order/PM sama di CRM, Projects, Finance, dashboard, dan report?
4. Apakah progress project sama dengan roll-up WBS/checklist yang dihitung manual?
5. Apakah Staff hanya membuat Weekly Task untuk Main Task assignment-nya dan hanya mengubah task miliknya?
6. Apakah transfer task mengubah owner hanya setelah PM approval?
7. Apakah seluruh project cost/funding/billing menunjuk project/company yang sama?
8. Apakah Request approved/disbursed/LPJ memiliki actor dan approval yang benar?
9. Apakah disbursement Request memiliki atau tidak memiliki Finance transaction nyata? Laporkan apa adanya.
10. Apakah setiap posted billing/journal balance dan berada pada period terbuka?
11. Apakah payment mengurangi outstanding serta menambah bank/GL, atau hanya berubah status?
12. Apakah asset depreciation/disposal journal menggunakan account yang benar?
13. Apakah closed period benar-benar menolak semua jalur posting, termasuk generic CRUD?
14. Apakah PO/GR/invoice benar-benar dibandingkan sebelum three-way match?
15. Apakah stock move dan production benar-benar memengaruhi ledger/balance/valuation/cost?
16. Apakah QA failure menahan proses terkait dan membentuk NCR/CAPA?
17. Apakah POD dan Service resolution memperbarui order/inventory/billing terkait?
18. Apakah KPI/report dihitung dari data dan tidak berasal dari konstanta?
19. Apakah setiap mutation material memiliki audit/history dan `request_id`?
20. Apakah tidak ada orphan/cross-company reference atau data dummy frontend yang dianggap record production?
21. Apakah seluruh unauthorized/invalid attempt meninggalkan database sama seperti sebelum request?
22. Apakah refresh, relogin, role switch, pagination, restart, dan dependency failure mempertahankan isolation serta consistency?

## 11. Kriteria selesai dan sign-off

Satu test case boleh dinyatakan selesai apabila:

- seluruh langkah normal, negative, dan recovery yang applicable telah dijalankan;
- bukti UI, Network/API, database, audit, serta perhitungan manual dilampirkan;
- setiap expected side effect dinyatakan ada atau tidak ada secara eksplisit;
- tidak ada response gagal yang disamarkan menjadi empty state/success;
- known gap memiliki defect ID, severity, owner, dan tautan evidence;
- cleanup/postcondition selesai tanpa menghapus data di luar `RUN_ID`.

Release tidak boleh mendapatkan sign-off production apabila salah satu berikut masih terbukti:

- actor tak berhak dapat approval/disbursement/override/accounting mutation;
- tenant/company isolation bocor;
- journal tidak balance atau asset disposal memakai account salah;
- closed period dapat dilewati;
- customer/order/project salah terhubung atau duplicate handoff tercipta;
- report hard-coded dipresentasikan sebagai nilai aktual;
- UI menunjukkan sukses ketika backend/database gagal.

## 12. Referensi source

| Area | Source utama |
|---|---|
| Runtime dan middleware | `backend-express/src/app.ts`, `backend-express/src/middlewares/**` |
| Auth, company, role, module access | `backend-express/src/modules/accounts/**`, `core/**`, `frontend-next/contexts/AuthContext.tsx`, layout components |
| Generic CRUD dan pagination | `backend-express/src/utils/crud-factory.ts`, pagination helpers/tests |
| CRM/Sales | `backend-express/src/modules/crm/**`, `sales/**`, `commands/**`, `frontend-next/app/(app)/crm/**` |
| Projects/Tasks | `backend-express/src/modules/projects/**`, `frontend-next/app/(app)/projects/**`, `tasks/**` |
| Requests | `backend-express/src/modules/core/request.*`, `frontend-next/components/requests/**` |
| Finance/Assets | `backend-express/src/modules/finance/**`, `assets/**`, `frontend-next/app/(app)/finance/**` |
| Extended modules | Corresponding route files under `backend-express/src/modules/` |
| Workflow/FSM | `backend-express/src/workflows/**`, `backend-express/src/utils/fsm.ts` |
| Database | `backend-express/prisma/schema.prisma`, `backend-express/prisma/migrations/**`, `backend-express/prisma/seed.ts` |
| Reporting/dashboard/feed | `backend-express/src/modules/reporting/**`, `dashboard/**`, `core/core.routes.ts`, frontend reporting/layout/feed adapters |
| AS-IS integration baseline | `docs/SYSTEM_INTEGRATION_AUDIT.md` |

Panduan ini harus diperbarui ketika role gate, module entitlement, state machine, database constraint, API contract, UI route, atau cross-module side effect berubah. Lima business journey tetap dipertahankan; langkah di dalamnya disesuaikan agar QA selalu menguji hasil bisnis end-to-end, bukan komponen UI secara terpisah.
