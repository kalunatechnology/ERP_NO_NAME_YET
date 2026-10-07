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
5. Untuk pemahaman bahasa dengan LLM, atur `MARBOT_AI_API_KEY` dan `MARBOT_AI_MODEL` di secret environment
   backend. Provider saat ini OpenRouter; pertanyaan, pertanyaan sebelumnya yang
   masih diizinkan dan katalog kemampuan yang dibatasi akses dikirim untuk memahami intent. Data hasil query bisnis, JWT dan credential database tidak dimasukkan ke prompt. Tanpa credential, jawaban
   terverifikasi tetap tersedia melalui mesin lokal. Jangan gunakan NEXT_PUBLIC
   untuk secret. Jangan menyalin credential chatbot lama sebagai key model.

Tidak ada migrasi database jarak jauh atau deployment yang dijalankan oleh perubahan
kode ini. Riwayat lama di service eksternal tidak otomatis dipindahkan.

## Pemahaman intent, pemilihan tool dan retrieval

Alur chat native: **pertanyaan → LLM memahami maksud → validasi rencana → retrieval referensi atau tool ERP → jawaban berdasarkan bukti**.

`marbot-understanding.service.ts` melakukan satu panggilan model yang mengembalikan JSON, bukan jawaban bisnis. Rencana dibedakan menjadi:

- `guide`: topic + operation, misalnya `meeting/delete` berbeda dari `minutes/create`. Backend mengambil referensi spesifik melalui `helperAnswer` dengan pilihan terstruktur; tidak mencocokkan ulang kata pengguna sebagai penentu utama.
- `knowledge`: mengambil referensi umum untuk modul yang tersedia pada scope aktif.
- `native`: menjalankan pembacaan hierarki task/project/cost/KPI/support yang ada, atau menyiapkan usulan aksi yang didukung.
- `resource`: memilih resource/field/operasi dari katalog aktual, kemudian menggunakan API canonical yang memeriksa permission dan aturan domain.
- `access` / `schema`: membaca konteks akses atau metadata tabel yang diizinkan.
- `clarify`: meminta penjelasan ketika record, data input, tujuan atau kemampuan belum jelas. Confidence di bawah 0,75 juga masuk klarifikasi; angka confidence model bukan jaminan akurasi.

`marbot-orchestrator.service.ts` memilih eksekutor dari rencana yang tervalidasi. Identitas, filter dan payload tidak boleh dibuat-buat oleh model. Company, tenant dan user berasal dari authority backend, bukan dari prompt atau hasil LLM. Pertanyaan tentang boleh/cara melakukan aksi tidak berubah menjadi write. Usulan create/update tetap membutuhkan tiket dan konfirmasi eksplisit melalui endpoint eksekusi lama; permission diperiksa kembali dan hasil dibaca ulang. Operasi domain yang belum didukung tidak diganti menjadi CRUD generik.

Untuk task, pemeriksaan lokal tetap memverifikasi ownership, Weekly/Daily, rentang tanggal dan pengecualian hari ini yang dinyatakan eksplisit. Model tidak dapat menghilangkan kata “saya” atau menambahkan default “hari ini” pada pembacaan seluruh task. Perintah terstruktur `data {...}` menggunakan validasi tool langsung karena sudah eksplisit.

Retrieval saat ini memakai referensi lokal terkurasi/versioned dari kode ERP, dipilih melalui intent terstruktur. Ini retrieval referensi untuk grounding; **belum merupakan pencarian embedding/vector atas semua dokumen perusahaan**, dan tidak ada tabel vector, crawler atau pipeline upload dokumen baru. Sumber dan version referensi ikut dikirim pada jawaban. Hasil operasional dan batas permission tidak ditulis ulang oleh LLM.

Tanpa konfigurasi model, ketika provider gagal, atau JSON/rencana tidak valid, aplikasi memakai fallback lokal terverifikasi satu kali tanpa mencoba planner model kedua. Jika fallback tidak bisa menentukan maksud, pengguna diminta memperjelas. Metadata pesan menyimpan sumber pemahaman (`llm`, `local`, `explicit`), route, status, confidence dan model untuk penelusuran, tanpa menyimpan chain-of-thought. Riwayat dan metadata tetap dibatasi authority yang berlaku.

Contoh: “agenda tadi udah nggak kepake, langkah nyingkirinnya gimana?” dapat dipetakan LLM ke `guide/meeting/delete`, kemudian jawaban diambil dari aturan penghapusan meeting dan role aktif. Keberhasilan pemetaan bahasa pada model nyata tetap memerlukan evaluasi dengan model/server yang dipakai deployment.

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

`npm run test:marbot-understanding` memakai respons model tiruan untuk menguji pemilihan referensi/tool, parafrasa/konteks, literal field/ID, ownership/periode, rencana salah, confidence rendah, kegagalan provider dan usulan yang tidak mengeksekusi write. Pengujian HTTP juga memeriksa intent dan sumber tersimpan di pesan. E2E PostgreSQL QA memasukkan rencana model tiruan pada query, retrieval dan create dengan konfirmasi. Pengujian ini membuktikan orchestration/guard, bukan kualitas pemahaman model nyata.

Format JSON provider mengikuti [dokumentasi resmi OpenRouter](https://openrouter.ai/docs/api/reference/overview). Backend tetap memvalidasi schema sendiri; JSON valid saja belum berarti intent, permission atau payload sudah benar.

`npm run typecheck` memeriksa backend. Jalankan `npx tsc --noEmit` di frontend.
Sesudah deploy, verifikasi status, pertanyaan SOP, ringkasan mingguan, KPI kosong,
akses staff vs PM/director, riwayat, pergantian perusahaan, dan kegagalan provider.
Test stub tidak menggantikan uji integrasi pada database staging setelah migrasi.
