# Filter periode Weekly Target

Filter kalender memakai `GET /api/v1/projects/weekly-tasks/periods?today=YYYY-MM-DD&month=YYYY-MM`. Backend menjadi sumber perhitungan kalender; frontend memakai periode yang sama.

- Identitas Weekly mengikuti Senin pertama dalam bulan. Setiap Weekly memiliki rentang kerja Senin–Jumat, termasuk Jumat yang berada di bulan/tahun berikutnya.
- **Keanggotaan target pada Weekly ditentukan hanya oleh `created_at`**, bukan `start_date`, `end_date`, deadline, tanggal selesai, atau nomor urutan `week_number` di Main Task.
- Batas waktu pembuatan adalah Senin pukul 00.00 WIB (inklusif) sampai Sabtu pukul 00.00 WIB (eksklusif). Contoh Oktober 2026 Weekly 2 (12–16 Oktober) hanya menampilkan target yang dibuat sejak 12 Oktober 2026 pukul 00.00 WIB sampai sebelum 17 Oktober 2026 pukul 00.00 WIB. Target yang dibuat pada 8 atau 9 Oktober tidak masuk Weekly 2 meskipun jadwal/deadline-nya tumpang tindih.
- Respons kalender menyediakan `filter_start` dan `filter_end` dengan offset Asia/Jakarta (`+07:00`). `start` dan `end` tetap menjadi tanggal Senin–Jumat untuk label kalender.
- Hari sebelum Senin pertama mengikuti identitas minggu kerja dari bulan sebelumnya. Tidak ada Weekly tambahan di awal bulan. Akhir pekan tetap berada pada periode Senin–Jumat yang baru berlalu untuk pemilihan periode saat ini.
- Identitas kalender adalah `YYYY-MM:Wn`, berdasarkan bulan tanggal Senin. Nomor `week_number` yang tersimpan tetap menjadi urutan target dalam Main Task dan tidak dinomori ulang.

Backend menggunakan satu syarat `created_at` dengan batas awal inklusif dan akhir eksklusif. Frontend menerapkan batas timestamp yang sama sehingga hasil daftar dan hasil endpoint konsisten. Target tanpa timestamp pembuatan yang valid tidak dapat dimasukkan ke filter periode. Scope tenant, company, dan akses pengguna tetap diterapkan oleh endpoint yang ada. Pembuatan, assignment, approval, akses, serta data tersimpan tidak diubah.

Verifikasi fixture tanpa database operasional:

```powershell
npm run test:weekly-period
npm run test:weekly-management
npm run test:weekly-staff-access
node tests/weekly-management.browser.js
```

Uji browser memerlukan `MARBOT_TEST_RUNTIME_PACKAGES` berisi direktori runtime Playwright yang terpasang.
