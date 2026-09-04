# Q8 — Production Readiness & Frontend Stabilization

## Status verifikasi

- Backend Prisma Client generation: lulus.
- Backend TypeScript build: lulus.
- Frontend TypeScript validation: lulus.
- Frontend optimized production build: lulus, 14 route berhasil dihasilkan.
- Regresi integrasi Q1–Q6: 20/20 lulus pada pengujian terakhir.
- Governance transaksi Q7: 6/6 lulus; replay idempotency menghasilkan satu record dan data uji dibersihkan.
- Browser smoke test `/login`: halaman termuat dan struktur form dapat diakses.
- Deployment Vercel: tidak dijalankan sesuai instruksi pemilik sistem.

## Perubahan operasional Q8

- Setiap respons API sekarang memiliki `X-Request-ID` untuk korelasi laporan frontend, log server, dan audit event.
- Respons error menyertakan `request_id`; nilai ini aman ditampilkan kepada user saat meminta bantuan.
- CORS mengekspos `X-Request-ID` dan `X-Idempotent-Replay` kepada frontend.
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

## Catatan font

Production build lokal berhasil. Optimisasi Google Fonts dilewati ketika jaringan build dibatasi; browser tetap memakai fallback Roboto/Inter/system-ui. Untuk build yang sepenuhnya deterministik, font sebaiknya di-host lokal pada iterasi berikutnya.
