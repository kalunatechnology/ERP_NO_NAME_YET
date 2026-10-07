# Project, Weekly Task, dan Daily Task — 6 Oktober 2026

Implementasi lokal untuk poin 2–4 yang dikirim pengguna. Tidak ada poin tambahan yang diasumsikan. Perubahan sebelumnya pada workspace dipertahankan. Belum dirilis ke hosting.

## Perubahan

1. **Project aktif dan tab.** Pilihan project dan tab ditulis ke parameter URL `project` dan `tab`. Pemilihan project diperbarui langsung pada state/ref. Loader tidak lagi memprioritaskan parameter project lama atas pilihan pengguna atau memuat ulang karena tab berganti. Project terpilih tidak diganti otomatis dengan baris pertama ketika ID tersebut tidak tersedia. Reload mempertahankan project dari URL.
2. **Pengajuan Weekly.** Staff/User non-PM mengajukan Weekly untuk dirinya sendiri pada Main Task yang memang ditugaskan kepadanya dalam company aktif dan project yang dapat diakses. Ketentuan assignment dan eligibility assignee existing dipakai kembali. Server memaksa status `PENDING_APPROVAL`, creator sesuai caller, progres nol, dan menolak override progres. Pengajuan muncul pada daftar Weekly/WBS existing milik pengelola project. Aksi review menggunakan kewenangan pengelolaan project existing, termasuk PM terkait dan delegasi Acting PM yang sudah berlaku. Approve mengubahnya menjadi `PLANNED`, yaitu status Weekly aktif existing; Reject menjadi `REJECTED`. Weekly pending/rejected tidak dapat menjadi induk Daily dan tidak ikut rata-rata progres Main Task. Rejected tetap tercatat dan tidak dapat dihapus/dihidupkan melalui CRUD Weekly. Weekly tidak memiliki field alasan penolakan; tidak ditambahkan field atau memakai field lain dengan arti berbeda.
3. **Daily edit/delete.** Edit di WBS/Workspace dan halaman Tasks memakai command API existing dengan tambahan payload judul, tanggal, dan slot waktu; hasil, catatan, status, serta aturan Output Target tetap mengikuti logic existing. Owner dan Weekly parent tidak dapat diganti lewat edit. Delete tersedia untuk owner, termasuk di halaman Tasks dan Workspace Personal. Delete memakai transaksi: membersihkan checklist dan transfer yang terkait, melepas tautan Daily pada action item meeting tanpa menghapus meeting/notulensi/action item, lalu menghitung ulang progres dari Weekly hingga Project. Modal edit Tasks dapat discroll di ponsel.

Tidak ada perubahan Prisma schema, tabel, field, atau migrasi. Metadata catalog hanya diperbarui pada hash file route Project; 204 resource tetap sama. Tidak ada konfigurasi role/module atau data website produksi yang diubah.

## Permission yang diverifikasi

| Identitas/kondisi | Hasil |
|---|---|
| Staff, assigned Main Task | Dapat mengajukan Weekly sendiri; status pending |
| Supervisor tanpa Acting PM | Dapat mengajukan sendiri; tidak mendapat hak management otomatis |
| Finance dengan baseline Staff existing dan assignment | Dapat mengajukan sendiri; baseline tidak mengubah active role Finance |
| Staff memilih PIC lain | Ditolak |
| Project/Main Task tidak ditugaskan atau company lain | Ditolak |
| PM terkait | Dapat membaca proposal, approve/reject, dan mengelola Weekly approved |
| PM lain pada company yang sama | Review ditolak |
| Staff mereview atau mengedit Weekly resmi | Ditolak; pengelolaan tetap mengikuti authority existing |
| Director | Mutasi tetap ditolak sesuai boundary read-only existing |
| Daily owner | Dapat edit/delete |
| PM atau owner lain mengedit/menghapus Daily milik orang lain | Ditolak |
| Payload mengganti owner/Weekly parent | Relasi dan owner tidak berubah |

Pengujian Finance memakai role dasar Staff pada **fixture QA lokal** karena assignment existing memang mensyaratkannya. Aplikasi tidak memberikan role baru secara otomatis.

## Pengujian dan bukti

- HTTP integration dengan aplikasi Express, autentikasi asli, dan PostgreSQL QA: **lolos**. Meliputi create pending, daftar PM, scope company/project, reject/approve, review ulang, bypass CRUD, Daily gate, edit, delete, child cleanup, progres, serta meeting dan notulensi yang tidak berubah setelah Daily dihapus.
- Browser Edge terhadap komponen React asli dengan API fixture yang diintersep: **lolos**. Memilih B dari URL A, refresh, seluruh tab yang tersedia, reload, pindah project secara eksplisit, Staff submit dengan PIC terkunci, PM approve, Daily edit dalam viewport 390×844, cancel delete tanpa request, dan confirm delete.
- Browser final memasang komponen secara client-only pada route fixture sementara, yang dihapus setelah tes. Percobaan fixture dengan SSR sempat menghasilkan hydration mismatch. Tes ini tidak memverifikasi SSR halaman hosting dan tidak dianggap bukti bahwa hydration website produksi bermasalah atau sudah diperbaiki.
- 17 suite regresi existing lolos pada run awal; Q11 memiliki dua assertion aturan lama yang tidak sesuai pengajuan Weekly yang baru diminta. Assertion diperbarui untuk memeriksa submission pending, ownership, dan Daily gate; Q11 kemudian **lolos 9/9**, termasuk saat build backend. Suite lain tidak dikurangi atau diberi pengecualian.
- Regresi Meeting recurring, authority Project/Acting PM, input/financial Project, output comparison, integration hardening, dan tiga suite Marbot terkait: **lolos**.
- Backend/frontend typecheck: **lolos**.
- Backend build dengan `DEPLOYMENT_TARGET=local`: **lolos**, termasuk gate Q11 dan regresi yang diwajibkan build.
- Frontend production build: **lolos**; route fixture browser tidak ikut build akhir.
- Frontend lint: **lolos dengan warning existing**. Tidak dilakukan refactor untuk warning di luar cakupan.
- Contract audit: **0 findings**; pemeriksaan statis bukan pengganti tes runtime.
- Catalog check dan diff whitespace check: **lolos**.

Tes khusus tersimpan pada:

- `backend-express/tests/project-weekly-daily.integration.ts`
- `backend-express/tests/project-workspace.browser.js`
- `backend-express/tests/q11-system-guardrails.ts` (contract pengajuan diperbarui)

Log QA disimpan di `.tmp/project-qa-20261006/`. Database QA `marka_qa_20261005` hanya di PostgreSQL lokal port 55440; test menolak database selain host, port, nama database, dan environment test yang ditentukan. Database website tidak dipakai untuk tes write. Server PostgreSQL QA sudah dihentikan setelah tes selesai; database QA dipertahankan.
