# Deployment Database Baru

Dokumen ini hanya untuk database PostgreSQL baru dan kosong. Prosedur memakai
`DIRECT_URL` (diutamakan) atau `DATABASE_URL` yang sudah disiapkan pada `.env`
deployment.

## Hasil akhir

- Satu tenant: `SINERGI_MUDA_ARSA`
- Satu company: `SMA` / PT Sinergi Muda Arsa
- User resmi beserta role jabatan dan baseline `ROLE-STAFF`
- Tujuh proyek operasional beserta Main, Weekly, dan Daily Task
- Tidak ada data CRM, jurnal Finance, atau Project Supervisor aktif
- Histori schema dikelola oleh Prisma migration

## Menjalankan bootstrap

Pastikan `.env` deployment sudah menunjuk database baru, lalu siapkan password
awal akun:

```text
DIRECT_URL=<direct PostgreSQL URL database baru>
DATABASE_URL=<runtime PostgreSQL URL database baru>
SEED_DEFAULT_PASSWORD=<password awal kuat minimal 12 karakter>
```

Kemudian jalankan satu kali:

```bash
npm run deploy:database:new
```

## Seed otomatis pada Hostinger

Untuk seed bersamaan dengan build/deploy Hostinger, cukup tambahkan pada `.env`
deployment:

```text
DEPLOYMENT_TARGET=hostinger
AUTO_SEED_EMPTY_DATABASE=true
SEED_DEFAULT_PASSWORD=<password awal kuat minimal 12 karakter>
```

Saat deploy, migration berjalan terlebih dahulu. Seed hanya dijalankan jika
seluruh tabel aplikasi masih kosong. Deployment berikutnya mendeteksi data yang
sudah ada dan melewati seed, sehingga tidak menghapus atau menimpa data.

Script akan:

1. Membaca `.env` deployment tanpa memerlukan system environment variable baru.
2. Menolak URL transaction pooler/port `6543` untuk proses migrasi.
3. Menolak target yang sudah memiliki data aplikasi.
4. Menjalankan `prisma migrate deploy` menggunakan baseline migration.
5. Menjalankan seed production pada URL baru tersebut.
6. Menggagalkan seluruh seed secara atomik jika ada satu record yang tidak valid.

Jangan mengarahkan `DIRECT_URL`/`DATABASE_URL` ke database lama atau database
production yang sudah berisi data. Untuk deployment normal setelah bootstrap,
gunakan alur `deploy:hostinger:db`; jangan jalankan bootstrap seed lagi.
