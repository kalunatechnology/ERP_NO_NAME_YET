# Marka Plus di ERP

Nama produk yang tampil kepada pengguna adalah **Marka Plus**. Identifier teknis
`MARBOT`, route `/api/v1/marbot`, tabel, dan nama environment dipertahankan agar
kontrak API serta deployment lama tetap kompatibel.

Runtime default adalah `native`. Chat, panduan, query data, audit, dan riwayat
berjalan di backend ERP. Tidak memerlukan service Chatbot_Arsalynk atau credential
antarserver. Endpoint lama hanya dipakai bila `MARBOT_RUNTIME=external`.

## Aktivasi server

1. Backup database sesuai prosedur release yang berlaku.
2. Jalankan gate migrasi repository: `npm run deploy:hostinger:db`. Migrasi baru
   `20260930120000_native_marbot` hanya membuat tabel percakapan dan pesan.
3. Build backend/frontend dan restart melalui prosedur deployment ERP.
4. Aktifkan modul MARBOT dan permission USE_MARBOT pada perusahaan/peran yang
   membutuhkan. Izin PROJECTS, FINANCE, CRM tetap diperiksa di server.
5. Opsional: atur `MARBOT_AI_API_KEY` dan `MARBOT_AI_MODEL` di secret environment
   backend. Provider saat ini OpenRouter; pertanyaan dan referensi ERP yang telah
   dibatasi akses dikirim untuk penyusunan bahasa. Tanpa credential, jawaban
   terverifikasi tetap tersedia melalui mesin lokal. Jangan gunakan NEXT_PUBLIC
   untuk secret. Jangan menyalin credential chatbot lama sebagai key model.

Tidak ada migrasi database jarak jauh atau deployment yang dijalankan oleh perubahan
kode ini. Riwayat lama di service eksternal tidak otomatis dipindahkan.

## Kemampuan

- AI Helper: panduan pengajuan cuti melalui Kartu Permintaan, laporan kerja,
  timesheet, tugas, notulensi, dan tautan halaman. Panduan dikurasi/versioned
  di `marbot-knowledge.ts` berdasarkan form dan route ERP yang aktif.
- Data: portofolio, task harian, biaya aktual proyek yang diakui, tiket terbuka,
  KPI tercatat, serta 204 resource canonical pada modul bisnis yang ditemukan
  langsung dari route dan schema aplikasi.
  Jawaban data operasional dikirim langsung dari query ERP tanpa diringkas ulang
  oleh model bahasa.
- Task dan mingguan: memakai `project_daily_task` dari hierarki main/weekly/daily
  yang juga menjadi sumber layar Tugas Harian. Terlambat berarti `planned_date`
  sebelum awal hari Asia/Jakarta dan status bukan COMPLETED/DONE. Data dibatasi
  proyek dan `owner_id` untuk pengguna individual.
- Biaya: memakai sumber yang sama dengan ringkasan keuangan proyek. Hanya status
  VALIDATED, APPROVED, dan POSTED_TO_WIP yang diakui; DRAFT/REJECTED tidak ikut.
- Dashboard: director, operational manager dan project manager dengan izin data
  proyek. KPI finance memerlukan READ_COMPANY_FINANCE dan scope ALL.
- Pertanyaan lintas domain dievaluasi per tool; penolakan satu domain tidak
  membuka domain lain. Nama/kode tim dicocokkan ke unit organisasi aktif dan
  anggotanya, lalu tetap dibatasi oleh project scope pengguna. Nama ambigu
  meminta klarifikasi dan tidak menampilkan data agregat pengganti.
- Periode: minggu ini/lalu, bulan ini/lalu, atau YYYY-MM, zona Asia/Jakarta.
- Proyek tertentu: `proyek "Nama Lengkap"`; nama ambigu memerlukan klarifikasi.
- Query resource mendukung list, count, equality filter, search, aggregate dan
  satu relasi yang harus terbukti sebagai foreign key fisik. SQL, URL, nama tabel,
  field, atau hasil bisnis yang dibuat model tidak pernah dieksekusi langsung.
- MCP Streamable HTTP tersedia pada `POST /api/v1/marbot/mcp` dengan autentikasi
  JWT ERP, company aktif, validasi Origin, versi protokol 2025-11-25, rate limit,
  audit request, dan tool baca `erp.capabilities`, `erp.schema`, `erp.query`,
  serta `erp.readQuestion`.
- OpenRouter opsional hanya memilih plan terstruktur. Executor lokal memvalidasi
  resource, field, literal input, permission dan hasil database.
- Riwayat dimiliki tenant + perusahaan + pengguna. Perubahan authority menyaring
  pesan lama; data selalu dihitung ulang untuk pertanyaan baru.

Jawaban model menyertakan referensi ERP aslinya. Data kosong tidak berarti target
tercapai. Status KPI berasal dari hasil tersimpan, bukan asumsi higher-is-better.
Daftar dibatasi dan batasnya disebutkan. Finance native adalah biaya proyek,
bukan total seluruh keuangan. Perubahan data memakai tiket backend berumur 15
menit, konfirmasi eksplisit, claim atomik, API ERP canonical, idempotency key,
readback, serta hasil verified/unverified yang disimpan ke riwayat. Delete, bulk
mutation, aksi admin, dan transisi lifecycle tanpa adapter khusus tidak tersedia.

## Verifikasi

`npm run test:marbot-native` menguji policy, scope, data mingguan, periode,
klarifikasi, kegagalan data, fallback provider, SSE, persistence, kepemilikan
percakapan, input, dan rate limit menggunakan database stub terisolasi.

`npm run test:marbot-capabilities` memeriksa knowledge, seluruh resource generated,
planner, client ticket/history dan streaming. `npm run test:marbot-isolated`
menjalankan mutation E2E hanya terhadap PostgreSQL lokal `127.0.0.1:55439`.

`npm run typecheck` memeriksa backend. Jalankan `npx tsc --noEmit` di frontend.
Sesudah deploy, verifikasi status, pertanyaan SOP, ringkasan mingguan, KPI kosong,
akses staff vs PM/director, riwayat, pergantian perusahaan, dan kegagalan provider.
Test stub tidak menggantikan uji integrasi pada database staging setelah migrasi.
