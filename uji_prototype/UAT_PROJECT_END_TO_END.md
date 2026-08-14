# UAT End-to-End Project Management, Finance, dan User Access

## Tujuan

Case ini menguji satu rangkaian data yang sama dari order masuk sampai project berjalan, perubahan client ditagihkan, masalah operasional diselesaikan, dan akses user tetap terisolasi.

Gunakan kode pengujian `UAT-E2E-001` pada nama/deskripsi data agar record mudah dicari dan dibersihkan.

## Aktor

| Aktor | Global role | Tanggung jawab |
|---|---|---|
| Executive | `EXECUTIVE` | Melihat seluruh data dan mengatur global role |
| Project Manager | `PROJECT_MANAGEMENT` | Mengelola project, membership, change, dan issue |
| Finance | `ACCOUNTING_FINANCE` | Memverifikasi funding dan accounting |
| Assignee | `PROJECT_ASSIGNEE` | Melihat project yang diberikan, task, dan melaporkan issue |
| Outsider | `PROJECT_ASSIGNEE` | User pembanding yang tidak menjadi member project |

Sebelum mulai, pastikan semua user berada pada tenant dan company yang sama. Jangan memberikan global role Finance kepada Project Manager.

## Data uji

| Data | Nilai |
|---|---|
| Sales order | `SO-UAT-E2E-001` |
| Product | `MAT-UAT-001` — Panel Assembly |
| Ordered quantity | `5` |
| Stock tersedia | `10` |
| Warehouse | `WH-UAT-01` |
| Project | `PRJ-UAT-E2E-001` — Project Panel Assembly |
| Budget awal | `Rp100.000.000` |
| Assignee | User dengan role `PROJECT_ASSIGNEE` |
| Change request | Tambahan 3 unit material dan tambahan waktu 7 hari |
| Cost impact | `Rp15.000.000` |
| Billing adjustment | `Rp20.000.000` |
| Operational issue | Machine stopped karena bearing failure |

## Persiapan

1. Jalankan backend dan prototype frontend.
2. Buka prototype, login sebagai Project Manager, lalu isi `Company` dengan UUID company pengujian.
3. Pastikan order `SO-UAT-E2E-001` berstatus `CONFIRMED` atau `ALLOCATED`.
4. Pastikan stock `MAT-UAT-001` di `WH-UAT-01` mempunyai `available_quantity = 10`.
5. Buka **Project Management → Operational Flow & User Assignment**.

Jika order dan stock belum tersedia, buat melalui Data Explorer atau seeder terlebih dahulu. Jangan memakai project produksi.

## Case 1 — Incoming order menjadi project

1. Pilih tab **Incoming Order**.
2. Temukan `SO-UAT-E2E-001` lalu klik **Convert**.
3. Isi:
   - Project name: `Project Panel Assembly UAT-E2E-001`
   - Budget: `100000000`
4. Simpan.

Hasil yang harus terlihat:

- Order tidak lagi muncul sebagai kandidat konversi.
- Project baru muncul di portfolio.
- Project mempunyai `source_type = SALES_ORDER` dan status awal `DRAFT`.
- Scope/technical brief dan material requirement terbentuk dari line order.
- Menekan Convert lagi tidak membuat project kedua untuk order yang sama.

Checkpoint Supabase:

| Table | Kondisi |
|---|---|
| `project_project` | Satu row dengan `sales_order_id` dari `SO-UAT-E2E-001` |
| `project_technical_brief` | Terhubung ke project baru |
| `project_material_requirement` | Quantity material `5` |
| `core_document_link` | Link order menuju project |

## Case 2 — Verify, reserve, dan start

1. Pada **Project gate**, pilih project UAT.
2. Klik **Verify**.
3. Klik **Reserve**.
4. Klik **Start**.

Hasil yang harus terlihat:

- Verify berhasil karena scope, budget, material, dan stock tersedia.
- Setelah Reserve, material mempunyai reservation aktif.
- Setelah Start, status project menjadi `IN_PROGRESS`.
- Dispatch muncul untuk `FINANCE`, `WAREHOUSE`, dan `PRODUCTION`.

Checkpoint Supabase:

| Table | Kondisi |
|---|---|
| `project_readiness_check` | Tidak ada check berstatus `FAILED` |
| `inv_stock_reservation` | Satu reservation `ACTIVE`, quantity `5` |
| `project_lifecycle_event` | Ada action `VERIFY`, `RESERVE_MATERIALS`, dan `START` |
| `project_dispatch` | Tepat tiga target department |
| `core_notification` | Tiga notification start project |

Pengujian negatif: pada project draft lain, klik **Start** sebelum Verify dan Reserve. Backend harus menolak dengan HTTP `400` dan project tetap `DRAFT`.

## Case 3 — Assign user dan isolasi data

1. Pilih tab **User Management**.
2. Pilih project UAT.
3. Klik **Assign User**.
4. Pilih user Assignee dan role `PROJECT_ASSIGNEE`.
5. Simpan.
6. Login ulang sebagai Assignee.

Hasil yang harus terlihat:

- Assignee dapat melihat project UAT.
- Assignee dapat melihat atau memperbarui task yang diberikan kepadanya.
- Assignee tidak dapat mengubah struktur project atau memberi assignment user lain.
- Outsider yang tidak di-assign tidak dapat melihat detail project atau task tersebut.
- Finance tidak dapat membuat atau mengubah task project.

Checkpoint Supabase:

| Table | Kondisi |
|---|---|
| `project_member` | Satu row `ACTIVE` untuk project dan Assignee |
| `iam_user_role` | Global role Assignee tetap; tidak berubah menjadi PM atau Finance |

## Case 4 — Change request sampai billing proposal

1. Login sebagai Project Manager.
2. Pilih tab **Change Request** lalu klik **Request**.
3. Pilih project UAT, type `SCOPE`, dan isi `Tambahan scope client UAT-E2E-001`.
4. Pada request `DRAFT`, klik **+ Material** dan isi:
   - Product: `MAT-UAT-001`
   - Warehouse: `WH-UAT-01`
   - Quantity delta: `3`
   - Unit cost: `1000000`
5. Klik **Analyze** dan isi:
   - Schedule impact days: `7`
   - Cost impact: `15000000`
   - Revised end date: tujuh hari setelah end date lama
   - Billing adjustment: `20000000`
6. Klik **Send Client**.
7. Klik **Client Decision**, pilih `APPROVED`, dan isi note `Approved UAT-E2E-001`.

Hasil yang harus terlihat:

- Status bergerak `DRAFT → ANALYZED → WAITING_CLIENT → APPLIED`.
- Required material bertambah dari `5` menjadi `8`.
- Budget project berubah dari Rp100 juta menjadi Rp115 juta.
- End date bergeser tujuh hari.
- Billing proposal Rp20 juta terbentuk untuk Finance.

Checkpoint Supabase:

| Table | Kondisi |
|---|---|
| `project_change_request` | `status = APPLIED`, `approval_status = APPROVED` |
| `project_change_request_material` | Quantity delta `3` dan `applied_requirement_id` terisi |
| `project_material_requirement` | Required quantity total `8` |
| `project_project` | Budget `115000000` |
| `fin_billing_proposal` | Trigger `CHANGE_REQUEST_APPROVED`, total `20000000` |

Pengujian negatif: client decision sebelum **Send Client** harus ditolak backend karena status belum `WAITING_CLIENT`.

## Case 5 — Operational issue sampai resolved

1. Login sebagai Assignee.
2. Pilih tab **Operational Issue** dan klik **Report Issue**.
3. Isi:
   - Project: project UAT
   - Type: `MACHINE_FAILURE`
   - Severity: `HIGH`
   - Problem: `Machine stopped UAT-E2E-001`
4. Login sebagai Project Manager.
5. Klik **Analyze**, lalu isi:
   - Severity: `CRITICAL`
   - Root cause: `Bearing failure`
   - Milestone impact: `Delay dua hari`
6. Klik **+ Action**:
   - Action: `REALLOCATE_MACHINE`
   - Assign user: Assignee
   - Description: `Alihkan pekerjaan ke mesin cadangan`
7. Klik **Complete REALLOCATE_MACHINE**.

Hasil yang harus terlihat:

- Status issue bergerak `REPORTED → ANALYZED → ACTION_IN_PROGRESS → RESOLVED`.
- Setelah analysis, alert berstatus `ACTIVE` dan notification dibuat.
- Setelah seluruh action complete, alert dan issue berstatus `RESOLVED`.

Checkpoint Supabase:

| Table | Kondisi |
|---|---|
| `project_issue` | `status = RESOLVED`, `alert_status = RESOLVED` |
| `project_issue_action` | `status = COMPLETED`, `completed_at` terisi |
| `core_notification` | Type `PROJECT_OPERATIONAL_ISSUE` |

Pengujian negatif: Outsider mencoba melaporkan issue untuk project UAT. Backend harus menolak karena user bukan anggota project.

## Case 6 — Finance menerima handoff yang benar

1. Login sebagai Finance.
2. Buka **Accounting / Finance → Project Billing**.
3. Temukan billing proposal dengan trigger `CHANGE_REQUEST_APPROVED` dan nilai Rp20 juta.
4. Pastikan Finance dapat melakukan proses review/approval sesuai status proposal.
5. Buka bagian project costing/WIP dan pastikan data operasional project dapat dibaca, tetapi Finance tidak mempunyai tombol untuk mengatur task atau membership.

Hasil yang harus terlihat:

- Finance melihat financial handoff dari project.
- Finance tidak mengambil alih kontrol operasional project.
- Project Manager tidak dapat melakukan approval Finance.

## Kriteria kelulusan

UAT dinyatakan lulus apabila:

- Seluruh enam case utama berhasil.
- Seluruh pengujian negatif ditolak dengan HTTP `400`, `403`, atau `404` yang sesuai.
- Tidak ada project ganda dari satu sales order.
- Tidak ada user yang memperoleh global role baru hanya karena project assignment.
- Budget, material, billing, issue, notification, reservation, dan dispatch dapat ditelusuri ke project UAT yang sama.
- Refresh browser tetap menampilkan state yang sama karena data berasal dari backend/Supabase, bukan local-only state.

## Bukti uji

Simpan bukti berikut untuk setiap run:

- Screenshot setiap status akhir pada empat tab Project Management.
- Screenshot billing proposal pada Finance.
- UUID project, change request, billing proposal, issue, dan issue action.
- HTTP status pada Request Log.
- Tanggal, tester, company UUID, dan hasil `PASS/FAIL`.

Format hasil singkat:

```text
Run ID     : UAT-E2E-001-YYYYMMDD
Tester     :
Company ID :
Project ID :
Case 1     : PASS / FAIL
Case 2     : PASS / FAIL
Case 3     : PASS / FAIL
Case 4     : PASS / FAIL
Case 5     : PASS / FAIL
Case 6     : PASS / FAIL
Catatan    :
```

## Automated regression yang terkait

```powershell
cd backend
python manage.py test `
  apps.projects.tests.test_project_flow `
  apps.projects.tests.test_diagram_workflows `
  apps.projects.tests.test_funding_membership_permissions
```

Test tersebut memverifikasi conversion/idempotency, readiness gate, reservation, dispatch, change approval, billing proposal, issue alert/action, serta isolasi membership dan role.
