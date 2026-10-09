# Filter periode Weekly Target

Filter kalender memakai `GET /api/v1/projects/weekly-tasks/periods?today=YYYY-MM-DD&month=YYYY-MM`. Backend merupakan satu sumber perhitungan: frontend menampilkan `periods` dan memakai rentang yang sama untuk filter. `month` opsional; tanpa bulan, pilihan awal mengikuti minggu kerja tanggal `today`. Tanpa `today`, backend memakai tanggal Asia/Jakarta.

- Weekly 1 dimulai pada Senin pertama dalam bulan. Setiap Weekly berakhir Jumat, termasuk Jumat di bulan/tahun berikutnya.
- Hari sebelum Senin pertama mengikuti identitas minggu dari bulan sebelumnya. Tidak ada Weekly tambahan di awal bulan.
- Sabtu/Minggu memilih minggu kerja Senin–Jumat yang baru berlalu, tanpa membuat periode akhir pekan.
- Identitas kalender adalah `YYYY-MM:Wn`, berdasarkan bulan tanggal Senin. Contoh `2026-09:W4` = 28 September–2 Oktober; Oktober Weekly 1 = 5–9 Oktober.
- Minggu terakhir yang mulai pada akhir bulan tetap lengkap sebagai satu identitas. Contoh Agustus Weekly 5 = 31 Agustus–4 September 2026.

Nomor `week_number` pada record tetap merupakan urutan target dalam Main Task proyek. Filter kalender menggunakan tanggal jadwal, bukan membandingkan nomor kalender dengan nomor urutan proyek. Pembuatan, assignment, approval, akses dan data tersimpan tidak diubah atau dinomori ulang.

Target yang jadwalnya tumpang tindih dengan rentang kerja terpilih ditampilkan. Jadwal lama Senin–Minggu tetap ditemukan pada Senin–Jumat yang sama. Target yang dijadwalkan lebih dari satu minggu tetap muncul pada tiap periode aktifnya dengan ID record yang sama; record tidak dipecah. Target tanpa tanggal tidak dianggap memiliki periode yang diketahui.

Endpoint daftar yang sudah ada mendukung `period_month=YYYY-MM&period_week=n`. Tanpa `period_week`, rentang semua Weekly bulan terpilih digunakan. Syarat periode selalu diiriskan dengan scope tenant, company dan akses pengguna yang sudah ada. Parameter tidak memengaruhi endpoint mutasi.

Verifikasi fixture tanpa database operasional:

```powershell
npm run test:weekly-period
npm run test:weekly-management
npm run test:weekly-staff-access
node tests/weekly-management.browser.js
```

Uji browser memerlukan `MARBOT_TEST_RUNTIME_PACKAGES` berisi direktori runtime Playwright yang terpasang. Uji mencakup bulan dengan empat/lima Weekly, default awal bulan/tahun, pemulihan kegagalan kalender, tampilan mobile dan regresi pembuatan target berdasarkan proyek serta alur Staff/PM yang sudah ada.
