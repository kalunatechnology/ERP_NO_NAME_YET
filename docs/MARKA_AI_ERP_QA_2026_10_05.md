# Hasil pengujian AI Marka+ dan ERP — 5 Oktober 2026

> Dokumen ini merekam baseline **sebelum perbaikan**. Implementasi dan hasil pengujian sesudah perbaikan dicatat di [Hasil Perbaikan AI Marka+ dan ERP](./MARKA_AI_ERP_FIXES_2026_10_05.md).

**Kesimpulan:** fondasi asisten internal, akses data, konfirmasi mutasi, dan tampilan chat sudah berfungsi pada lingkungan uji. Implementasi belum memenuhi seluruh rancangan: WhatsApp/CS eksternal belum ditemukan, percakapan bahasa alami masih terbatas, dan ditemukan masalah riwayat percakapan, periode laporan proyek, serta batas akhir meeting berulang. Belum layak menyatakan semua fitur ERP atau AI siap produksi.

## Acuan dan ruang lingkup

Acuan produk: `C:/Users/LENOVO/Downloads/Rancangan AI Marka.pdf`, dua halaman yang dibaca dan diperiksa secara visual. Isi dokumen digunakan sebagai target pembanding, bukan instruksi untuk menjalankan operasi. Klaim pasar dan statistik pada PDF tidak diaudit karena permintaan ini berfokus pada aplikasi.

Versi aktif yang diuji: `backend-express` (Express/TypeScript/Prisma) dan `frontend-next` (Next.js). Backend Django dan prototype lama tidak diperlakukan sebagai aplikasi aktif. Tidak ada perubahan source aplikasi, deployment, migrasi database operasional, atau penulisan data bisnis operasional.

Lapisan pengujian:

1. TypeScript, kompilasi, frontend production build, lint, dan audit kontrak source.
2. Tiga puluh suite regression AI/ERP yang sudah tersedia.
3. HTTP E2E dengan database baru `marka_qa_20261005` pada PostgreSQL lokal `127.0.0.1:55439`, dibentuk dari schema Prisma saat ini dan master seed. Semua mutasi bisnis pengujian hanya dilakukan di database ini.
4. Browser Edge headless: komponen chat sebenarnya dengan respons API fixture, viewport mobile 390×844 dan desktop 1440×900.
5. Sepuluh pertanyaan/perintah realistis melalui HTTP asisten lokal, dan pemeriksaan endpoint timer/chat.
6. GET tanpa login ke backend yang dikonfigurasi frontend, serta pemeriksaan baca saja konfigurasi akses pada Supabase yang dikonfigurasi backend lokal.

Backend hosting yang dicek: `https://lavender-alligator-903719.hostingersite.com`. Database pada konfigurasi lokal adalah Supabase. Belum dibuktikan bahwa hosting menggunakan database yang sama; hasil akses Supabase tidak otomatis berlaku pada hosting.

## Hasil eksekusi

| Pemeriksaan | Hasil | Batas bukti |
|---|---|---|
| 16 suite AI | PASS 16/16 | Native/HTTP, 204 resource contracts, planner dengan fixture, client/SSE, security, Staff scope, HMAC, tenant, runtime V2, control plane, secrets/config |
| 14 suite ERP | PASS 13/14 | Meeting recurring FAIL; pagination, JWT, reporting scope, project authority/finance/input, seed, migration, output, cache, text IDs, Q11 PASS |
| Q11 system guardrails | PASS 9/9 | Bagian dari 14 suite ERP; tidak dihitung sebagai 9 suite tambahan |
| Backend/frontend TypeScript | PASS | Backend `tsc --noEmit`, frontend `tsc --noEmit --incremental false` |
| Backend compile | PASS | `tsc`; bukan menjalankan deployment build Hostinger yang dapat menerapkan migrasi |
| Frontend production build | PASS | Next.js build; seluruh route hasil build terselesaikan |
| Frontend lint | PASS dengan 114 warning | Termasuk 14 warning dependency React Hook. Belum dibuktikan masing-masing menyebabkan bug runtime |
| Katalog AI `--check` | FAIL pada checkout Windows | Resource tetap identik 204/204; perbedaan hash dari CRLF versus LF, bukan daftar kemampuan yang berubah |
| Audit kontrak statis | 14 temuan otomatis | False positive pada nested router/helper headers; bukan 14 bug aplikasi yang terbukti |
| AI HTTP E2E asli | FAIL | Berhenti pada assertion riwayat hasil terverifikasi setelah membuat proyek |
| E2E diagnostik | PASS untuk pemeriksaan lanjutan | Assertion riwayat yang sudah terbukti gagal diganti pencatatan diagnostik; suite asli tetap FAIL |
| UI browser | PASS | Respons panjang 100 baris, tabel lebar, mobile/desktop, loading, 503, batal/terima konfirmasi, hasil tersimpan, perubahan authority |
| Backend hosting | PASS untuk health/auth boundary | `/health` 200; `/auth/me` dan `/marbot/status` tanpa token 401. Ini belum membuktikan chat setelah login berfungsi di hosting |
| AI terhadap data operasional aktual | BLOCKED oleh entitlement | Tidak ada company dengan MARBOT enabled/read pada database Supabase yang diperiksa |

**PASS 29/30 suite regression tidak berarti 29/30 skenario bisnis ERP.** Suite memiliki jumlah assertion berbeda. Klaim lama 2.616 route atau semua transaksi lulus di README tidak dipakai sebagai hasil pengujian hari ini.

## Masalah yang terbukti

### QA-01 — P1: riwayat hasil membuat proyek menghilang

Reproduksi memakai akun Project Manager pada database terisolasi:

1. Ajukan `buat proyek {"project_name":"...","customer_name":"...","manager_name":"..."}`.
2. Pastikan proposal belum menulis proyek, lalu kirim dua konfirmasi bersamaan.
3. Tepat satu proyek tersimpan. Hasil action di database berstatus `VERIFIED` dan `metadata.verified = true`.
4. Baca ulang conversation yang sama: `messages` berisi **0**, hasil penyimpanan tidak terlihat.

Penyebab: hash authority mencakup seluruh ID proyek yang dapat diakses. Membuat proyek menambah ID pada scope PM. Pesan disimpan dengan hash sebelumnya, sementara endpoint history hanya menampilkan pesan yang hash-nya persis sama dengan authority baru.

Dampak: pengguna kehilangan jejak pekerjaan AI setelah refresh/membuka riwayat, walaupun proyek sudah dibuat. Ticket lama juga dapat menjadi tidak cocok dengan authority saat ini. Data bisnis tidak hilang; bukti dan konteks percakapan tersaring.

Lokasi: `backend-express/src/modules/marbot/marbot-authority.service.ts:11`; `marbot-native.routes.ts:114` dan `:128`.

Saran: bedakan perubahan akses yang memperluas scope dari pencabutan akses, dan validasi ulang resource yang dirujuk sebelum menampilkan pesan. Pertahankan penolakan lintas company/role dan saat akses dicabut. Jangan menghapus seluruh pemeriksaan authority demi memperbaiki history.

Bukti: `tmp/marka-qa-20261005/isolated-ai-e2e.log`, `isolated-diagnostic.log`, `isolated-diagnostic-results.json`, `behavior-probe-results.json`.

### QA-02 — P1: pertanyaan periode proyek mengembalikan jumlah saat ini

Pertanyaan `Berapa jumlah proyek berjalan bulan lalu?` mengembalikan dua proyek hasil uji yang baru dibuat pada **5 Oktober 2026**, lalu menampilkan periode **1–30 September 2026**. Pertanyaan tanpa periode mengembalikan dua proyek yang sama. Kedua proyek tersebut tidak ada sebelum Oktober.

Source query proyek hanya memfilter tenant, company, scope proyek, dan status. Periode dihitung dan dicetak pada jawaban, tetapi tidak diterapkan pada query proyek.

Dampak: laporan berlabel bulan lalu dapat ditafsirkan sebagai kondisi historis, padahal isinya status proyek saat ini. Kata "bulan lalu" perlu diklarifikasi sebagai tanggal pembuatan, rentang pelaksanaan, atau status historis. Jika status historis belum tersedia, jawaban harus menyatakan keterbatasan tersebut.

Lokasi: `backend-express/src/modules/marbot/marbot-native.service.ts:146` dan `:246`.

Saran: tetapkan makna periode proyek dan gunakan filter yang sesuai, atau tolak/beri klarifikasi pertanyaan historis. Label periode hanya boleh muncul untuk domain yang benar-benar memakai filter tersebut.

Bukti: `tmp/marka-qa-20261005/behavior-probe-results.json`; pemeriksaan database menunjukkan dua proyek `Marka isolated ...`, semuanya dibuat pada Oktober.

### QA-03 — P2: meeting berulang tetap menerima tanggal setelah batas akhirnya

Fixture meeting: mulai 28 September 2026, berulang Senin–Jumat, berakhir 4 Oktober 2026 dalam Asia/Jakarta. Pada 5 Oktober, service menambahkan occurrence **5 Oktober 2026** dan `resolveMeetingOccurrenceDate(..., '2026-10-05')` menerimanya.

Suite `meeting-recurring.unit.ts` mengharapkan lima tanggal 28 September–2 Oktober; aktual memiliki satu tanggal tambahan. Source secara eksplisit memperpanjang batas akhir yang sudah berlalu sampai hari ini.

Dampak: `recurrence_end_at` tidak menjadi batas akhir nyata, dan perilaku bertambah seiring tanggal pengujian. Ini merupakan konflik antara implementasi terbaru dan kontrak regression yang tersedia. Apabila perpanjangan memang diinginkan produk, UI dan kontrak tes harus menjelaskannya; apabila tanggal akhir harus dihormati, service perlu diperbaiki.

Lokasi: `backend-express/src/modules/core/meeting-occurrence.service.ts:54`.

Bukti: `tmp/marka-qa-20261005/meeting-recurring.unit.log`, `behavior-probe-results.json`.

### QA-04 — P2: pemeriksaan katalog tidak konsisten antara akhir baris Windows/Linux

`node backend-express/scripts/generate_marbot_catalog.js --check` gagal dengan `Marka resource catalogue stale`.

Perbandingan diagnostik membuktikan array resource identik: **204 aktual, 204 hasil generate**. Hanya hash `projects.routes.ts` dan `prisma/schema.prisma` berbeda; setelah CRLF dinormalisasi menjadi LF, hash cocok dengan katalog.

Dampak: quality gate lokal gagal walaupun definisi resource sama. Ini masalah portabilitas verifikasi, bukan bukti katalog fungsional usang.

Lokasi: `backend-express/scripts/generate_marbot_catalog.js:12`, `:34`, `:37`.

Saran: gunakan normalisasi akhir baris konsisten saat hashing/generation, dengan aturan repository yang sama. Regenerate tanpa normalisasi hanya memindahkan masalah ke checkout platform lain.

Bukti: `tmp/marka-qa-20261005/catalog-diagnostic.json`.

## Kekurangan dibanding rancangan PDF

| Target rancangan | Kondisi yang diperiksa | Penilaian |
|---|---|---|
| Helper memahami setiap fitur ERP | Ada pengetahuan modul dan lima prosedur praktis. Pertanyaan cara membuat invoice dan memulai timer kerja hanya mendapat jawaban umum | SEBAGIAN; belum mencakup bantuan operasional semua fitur |
| Membaca data sesuai pengguna | Scope company/project/role dan query terstruktur tersedia; fixture akses dan query lolos | TERSEDIA pada lingkungan terisolasi; validasi live belum dapat dilanjutkan |
| Assistant dashboard untuk PM/leader | Query project/task/cost/KPI/ticket dan saran terbatas tersedia | SEBAGIAN; periode proyek bermasalah, tahun/kuartal ditolak, belum membuktikan analisis strategis bebas |
| Input dan update melalui chat | Project → Main → assignment → Weekly → Daily, update Daily, dan create/update Implementation berhasil dengan konfirmasi dan readback | TERSEDIA untuk struktur input yang didukung |
| Pengguna cukup berbicara dengan bahasa biasa | Perintah "Buat proyek Website Toko ..." meminta JSON; "Buat tugas harian perbaiki login besok" meminta UUID Weekly dan field JSON | BELUM terpenuhi dalam konfigurasi yang diperiksa |
| Kerja melalui WhatsApp | Tidak ditemukan adapter WhatsApp, webhook inbound, pemetaan nomor ke user/company, atau perjalanan E2E WhatsApp dalam source aktif | BELUM ditemukan implementasinya pada repo ini; integrasi di repo terpisah tidak diperiksa |
| CS eksternal/visitor dan serah-terima ke manusia | Asisten saat ini berada di balik autentikasi ERP; pertanyaan handoff CS menghasilkan panduan umum | BELUM ditemukan kanal CS publik/handoff khusus AI |
| Fokus industri/manufacturing | Ada pengetahuan umum dan katalog resource manufacturing | BELUM membuktikan asistensi industri mendalam atau UAT manufacturing |

**Provider:** `MARBOT_AI_API_KEY` dan `MARBOT_AI_MODEL` tidak terisi pada `.env` lokal yang diperiksa. Tidak ada panggilan provider berbayar. Regression provider memakai fixture. Menambahkan provider tetap memerlukan validasi live; tidak otomatis menjamin semua contoh bahasa alami akan berhasil.

**Entitlement database yang diperiksa:** 35 membership aktif, 1 definisi `USE_MARBOT`, 24 grant `USE_MARBOT`, tetapi **0 company dengan MARBOT enabled/read** dan **0 member aktif pada company tersebut**. Permission saja belum cukup untuk menggunakan asisten. Pemeriksaan live berhenti dengan `No eligible Marka Plus project reader found`.

## Hal yang terbukti berjalan

- Proposal tidak langsung menyimpan record; `confirmed: false` ditolak.
- Dua konfirmasi bersamaan membuat tepat satu proyek.
- Project, Main Task, assignment, Weekly Task, Daily Task, update Daily, dan resource Implementation berhasil ditulis/dibaca ulang di database terisolasi.
- Pencabutan field permission sesudah proposal mencegah execution; forged company ditolak.
- MCP initialize/tools/list/tools/call berjalan, agregasi sesuai Prisma, write melalui query MCP ditolak, origin tidak sah ditolak.
- Unit/native/HTTP meliputi isolasi akses, batas input/filter, injection, partial failure, history/ticket, provider fallback, serta SSE tanpa `done`.
- UI fixture: pembatalan konfirmasi menghasilkan nol write; penerimaan menghasilkan satu write. Pesan panjang/tabel tetap berada di viewport; Close dapat dijangkau. Pergantian authority membersihkan UI dan membatalkan respons lama.

## Kualitas harness dan batas pengujian

Audit statis menghasilkan 14 warning: 11 dugaan route mismatch serta 3 dugaan raw fetch tanpa auth/company. Timer dan native MarBot dipasang melalui child router; header fetch berasal dari helper `getErpAuthHeaders()`. Pemeriksaan source/HTTP membuktikan status/chat/history/action tersedia, dan timer aktif berespons 200 dengan token pada lingkungan terisolasi. Warning tersebut tidak boleh langsung diklaim sebagai route rusak atau kebocoran auth. Parser audit perlu memahami child router/helper dan memiliki exit status yang sesuai saat ada temuan nyata.

Belum diuji penuh: seluruh transaksi Finance/CRM/Procurement/Inventory/Manufacturing/Quality/Logistics di UI nyata, migrasi berurutan di database kosong, load test/concurrency skala produksi, backup/restore, provider live, WhatsApp nyata, CS publik, dan chat setelah login pada hosting. `prisma db push` memverifikasi schema E2E; bukan bukti semua migration dapat diterapkan berurutan. Browser fixture bukan UAT seluruh halaman ERP.

Pemeriksaan awal jaringan di sandbox gagal; pembacaan hosting/database diulang dengan izin eksekusi di luar sandbox. Tidak ada kegagalan jaringan sandbox yang dilabeli sebagai bug aplikasi. Koneksi `pg` langsung ditolak validasi sertifikat; pemeriksaan jumlah entitlement kemudian menggunakan jalur Prisma aplikasi yang sudah ada. Kredensial tidak disalin ke laporan.

## Urutan tindak lanjut

1. Perbaiki QA-01 dan QA-02; ulangi suite E2E asli tanpa mengecualikan assertion history.
2. Selaraskan batas akhir meeting (QA-03) dan jadikan tes tanggal deterministik.
3. Normalisasi quality gate katalog (QA-04), perbarui parser audit, dan evaluasi warning React Hook yang relevan.
4. Pada environment yang dituju, aktifkan entitlement MARBOT untuk company uji dan atur provider server; lakukan validasi live setelah konfigurasi. Simpan secrets di server.
5. Lengkapi bantuan invoice/timer dan natural-language input, dengan klarifikasi record/assignee yang aman.
6. Bangun adapter WhatsApp dan kanal CS eksternal beserta pemetaan identitas, batas akses, konfirmasi, dan handoff; lalu jalankan UAT kanal tersebut.

## Artefak dan reproduksi

Evidence ada di `tmp/marka-qa-20261005/`:

- `ai-results.json`, `erp-results.json`, `compile-results.json` dan log setiap suite.
- `frontend-build.log`, `backend-compile.log`, `ui-results.json`, `ui-mobile.png`, `ui-desktop.png`.
- `isolated-results.json` (suite asli FAIL), `isolated-diagnostic-results.json` (lanjutan diagnostik dengan satu assertion dikecualikan).
- `behavior-probe-results.json`, `catalog-diagnostic.json`, `live-config-read-results.json`, `deployment-read-results.json`.
- Script runner `run-checks.js`, `run-isolated.js`, `run-e2e-diagnostic.js`, `run-ui.js`, `behavior-probe.ts`, dan script read-only.

Regression bisa diulang dari root dengan `node tmp/marka-qa-20261005/run-checks.js ai`, `... erp`, dan `... compile`. Runner database menolak menimpa database QA yang sudah ada. Pertahankan `NODE_ENV=test`, `DEPLOYMENT_TARGET=local`, serta URL loopback `127.0.0.1:55439` untuk semua pengujian mutasi. Jangan menjalankan suite mutasi menggunakan `.env` operasional.

Database QA disimpan untuk reproduksi. PostgreSQL lokal dihentikan setelah pengujian selesai. Route UI fixture sementara dihapus oleh harness. Tidak ada perbaikan bug yang diterapkan dalam audit ini.
