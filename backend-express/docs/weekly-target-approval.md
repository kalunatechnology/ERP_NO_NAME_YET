# Persetujuan weekly target bersama PM dan SPV

PM pemilik proyek dan SPV yang ditugaskan melalui membership proyek aktif atau assignment Main Task dapat melihat weekly target proyek yang sama. SPV tidak perlu menjadi Acting PM untuk memberi keputusan atas ajuan.

- `GET /api/v1/projects/weekly-tasks/review-workspace` menyediakan proyek, Main Task, PIC, dan weekly target dalam scope reviewer. Proyeksi ini tidak memuat keuangan proyek.
- `GET /api/v1/projects/projects/{id}/authority` menyatakan `can_review_weekly_tasks` terpisah dari `can_manage_weekly_tasks`.
- `POST /api/v1/projects/weekly-tasks/{id}/review` menerima `APPROVE` atau `REJECT`. Ajuan hanya berubah dari `PENDING_APPROVAL` menjadi `PLANNED` atau `REJECTED`; keputusan kedua mendapat conflict.
- Pembuat tidak memberi keputusan atas ajuan sendiri. Akses write PROJECTS yang dicabut Admin tetap menghalangi approval.
- Setelah persetujuan, PIC dapat membuat Daily Task. Target pending atau rejected tidak dapat digunakan untuk Daily Task.
- Tombol hapus dan kewenangan pengelolaan proyek yang sudah ada tetap mengikuti aturan sebelumnya.

Notifikasi pengajuan dan keputusan muncul pada panel Alert yang sudah ada:

- Setiap weekly target baru mengirim notifikasi kepada PM pemilik proyek, SPV yang terkait melalui membership aktif/assignment Main Task, dan Acting PM aktif. Pembuat tidak menerima notifikasi atas tindakannya sendiri. Untuk target yang langsung aktif, PIC juga menerima notifikasi.
- ACC dan reject mengirim hasil kepada reviewer terkait, pengaju, dan PIC. Penerima harus menjadi user aktif dengan membership company aktif; penerima yang sama hanya mendapat satu notifikasi per kejadian.
- Notifikasi dan perubahan weekly disimpan dalam transaksi yang sama. Kegagalan penyimpanan notifikasi membatalkan perubahan; keputusan ulang tidak mengirim hasil ganda.
- Tautan `/projects?project={projectId}&tab=TREE&weekly={weeklyId}` mengambil data terbaru, memilih proyek, membuka cabang Main Task dan weekly terkait, lalu mengarahkan fokus dan memberi sorotan pada kartu yang dituju, termasuk target yang sudah disetujui/ditolak.
- Panel Alert memakai penyegaran otomatis yang sudah ada (45 detik) dan tombol refresh. Kategori ditampilkan sebagai `Target Mingguan`.

Verifikasi dengan fixture tanpa menghubungi database ERP:

```powershell
node node_modules/ts-node/dist/bin.js --files tests/weekly-shared-review.http.unit.ts
node node_modules/ts-node/dist/bin.js --files tests/weekly-staff-access.http.unit.ts
node node_modules/ts-node/dist/bin.js --files tests/project-acting-manager.unit.ts
```

Pengujian HTTP juga memverifikasi penerima notifikasi, tautan yang tepat, pembacaan sidebar feed, dan rollback create/review saat notifikasi gagal. Pengujian browser `tests/project-workspace.browser.js` menggunakan runtime Playwright dari `MARBOT_TEST_RUNTIME_PACKAGES`. Ini menguji klik dari komponen Alert ke halaman `/projects` asli untuk target pending/approved/rejected, SPV tanpa Acting PM, keputusan yang terlihat oleh PM dan SPV, persetujuan sendiri yang dinonaktifkan, gate Daily Task, dan tombol hapus yang tetap tersedia sesuai kewenangan.
