# Filter periode Weekly Target

Filter kalender memakai `GET /api/v1/projects/weekly-tasks/periods?today=YYYY-MM-DD&month=YYYY-MM`. Backend merupakan satu sumber perhitungan: frontend menampilkan `periods` dan memakai rentang yang sama untuk filter. `month` opsional; tanpa bulan, pilihan awal mengikuti minggu kerja tanggal `today`. Tanpa `today`, backend memakai tanggal Asia/Jakarta.

- Identitas Weekly 1 mengikuti Senin pertama dalam bulan. Setiap Weekly berakhir Jumat, termasuk Jumat di bulan/tahun berikutnya.
- Filter tanggal jadwal Weekly yang lama dipertahankan. Untuk rentang tambahan `created_at`, **kedua ujung** rentang Weekly dikurangi **3 hari**, lalu waktunya ditetapkan ke **15.00 WIB**. Batas awal inklusif dan batas akhir eksklusif. Contoh Oktober Weekly 1 (5–9 Oktober 2026) menyertakan target yang dibuat sejak **2 Oktober 2026 pukul 15.00 WIB** sampai sebelum **6 Oktober 2026 pukul 15.00 WIB**.
- Respons kalender menyediakan `filter_start` dan `filter_end` dengan offset Asia/Jakarta (`+07:00`). `start` dan `end` tetap tanggal Senin–Jumat untuk identitas/pilihan kalender. Batas filter diterapkan sebagai timestamp tanpa memotong jam menjadi tanggal.
- Hari sebelum Senin pertama mengikuti identitas minggu dari bulan sebelumnya. Tidak ada Weekly tambahan di awal bulan.
- Sabtu/Minggu memilih minggu kerja Senin–Jumat yang baru berlalu, tanpa membuat periode akhir pekan.
- Identitas kalender adalah `YYYY-MM:Wn`, berdasarkan bulan tanggal Senin. Contoh `2026-09:W4` = 28 September–2 Oktober; Oktober Weekly 1 = 5–9 Oktober.
- Minggu terakhir yang mulai pada akhir bulan tetap lengkap sebagai satu identitas. Contoh Agustus Weekly 5 = 31 Agustus–4 September 2026.

Nomor `week_number` pada record tetap merupakan urutan target dalam Main Task proyek. Filter kalender menggunakan tanggal jadwal, bukan membandingkan nomor kalender dengan nomor urutan proyek. Pembuatan, assignment, approval, akses dan data tersimpan tidak diubah atau dinomori ulang.

Kedua kondisi digabung dengan **OR**: jadwal tumpang tindih dengan Senin–Jumat terpilih **atau** `created_at` berada pada rentang tambahan tersebut. Target lama dengan jadwal cocok tetap tampil meskipun timestamp pembuatannya lebih awal atau tidak tersedia. Target tanpa jadwal tetap bisa muncul melalui timestamp pembuatan yang valid. Target yang cocok pada keduanya muncul sekali dengan ID yang sama. Frontend mempertahankan `created_at` dari respons API, termasuk sesudah simpan, agar daftar langsung konsisten. Alur, default tanggal, validasi dan payload pembuatan target tetap seperti sebelumnya.

Rumus rentang tambahan: `filter_start = start - 3 hari, pukul 15.00 WIB` dan `filter_end = end - 3 hari, pukul 15.00 WIB`. Tanggal jadwal Weekly tidak digeser. Target di luar rentang `created_at` masih dapat tampil jika jadwalnya cocok dengan tanggal Weekly semula.

Endpoint daftar yang sudah ada mendukung `period_month=YYYY-MM&period_week=n`. Tanpa `period_week`, rentang semua Weekly bulan terpilih digunakan. Syarat periode selalu diiriskan dengan scope tenant, company dan akses pengguna yang sudah ada. Parameter tidak memengaruhi endpoint mutasi.

Verifikasi fixture tanpa database operasional:

```powershell
npm run test:weekly-period
npm run test:weekly-management
npm run test:weekly-staff-access
node tests/weekly-management.browser.js
```

Uji browser memerlukan `MARBOT_TEST_RUNTIME_PACKAGES` berisi direktori runtime Playwright yang terpasang. Uji mencakup bulan dengan empat/lima Weekly, default awal bulan/tahun, pemulihan kegagalan kalender, tampilan mobile dan regresi pembuatan target berdasarkan proyek serta alur Staff/PM yang sudah ada.
