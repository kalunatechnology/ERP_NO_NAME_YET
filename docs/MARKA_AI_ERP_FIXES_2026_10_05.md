# Hasil perbaikan AI Marka+ dan ERP — 5 Oktober 2026

Perbaikan diterapkan pada source Express/TypeScript di workspace ini. Bug QA-01 sampai QA-04 sudah ditangani, panduan invoice/timer dilengkapi, dan beberapa operasi bahasa alami dapat digunakan tanpa provider AI. Pengujian penyimpanan memakai database lokal terisolasi; tidak ada deployment atau perubahan data bisnis operasional.

## Perubahan

| Temuan sebelumnya | Penyelesaian | Verifikasi |
|---|---|---|
| QA-01: history hilang setelah membuat proyek | Pesan baru menyimpan snapshot akses milik server. History dapat dibaca ketika akses proyek bertambah, dengan identitas, role, module, permission dan policy tetap sama. Hasil mutasi menyimpan scope setelah write agar pencabutan proyek baru juga menyembunyikan hasilnya | E2E asli dan assertion tambahan: history/list tetap terlihat, replay terverifikasi tetap idempotent; setelah akses dicabut, hasil disembunyikan dan replay 403 |
| QA-02: kondisi proyek saat ini tampil sebagai laporan bulan lalu | Query proyek dengan periode meminta klarifikasi tanggal pembuatan/jadwal/status historis, dan tidak menjalankan query kondisi saat ini. Label periode hanya tampil untuk domain yang benar-benar difilter | Unit memastikan tidak ada query saat pertanyaan historis ambigu; HTTP E2E memastikan tidak ada jumlah proyek saat ini dalam jawaban |
| QA-03: meeting melewati tanggal akhir | `recurrence_end_at` menjadi batas akhir nyata; service tidak memperpanjang series tertutup sampai hari ini | Suite meeting PASS, termasuk fixture masa lalu dan penolakan tanggal 5 Oktober di luar series yang berakhir 4 Oktober |
| QA-04: katalog gagal pada Windows | Hash source/schema serta perbandingan katalog menormalisasi CRLF ke LF | `generate_marbot_catalog.js --check` PASS; 204 resource pada 15 module |
| Panduan invoice/timer tidak menjawab pertanyaan pengguna | Panduan memakai alur Finance → Billing Termin → Submit/Approve/Terbitkan Billing dan timer Staff → mulai/hentikan/kirim | Unit panduan PASS; nama/alur diperiksa terhadap UI source |
| Input sederhana masih meminta JSON/UUID | Parser eksplisit untuk membuat proyek, membuat tugas harian berdasarkan nama target mingguan, dan memperbarui task berdasarkan nama | Unit dan write/readback E2E PASS; nama tidak ditemukan/ambigu tidak membuat proposal |
| Audit statis memberi false positive | Deteksi mount langsung `app.use`, beberapa router dalam satu mount, child router, dan helper header lokal. Audit exit nonzero jika masih ada temuan HIGH | 223 frontend HTTP call sites dipindai; 0 temuan; 2.754 deklarasi route ditemukan secara statis, bukan klaim semua transaksi telah diuji |

## Contoh bahasa alami yang sudah didukung

```text
Buat proyek Website Toko untuk PT Contoh dengan PM Melika

Buat tugas harian "Perbaiki login" untuk target mingguan "Sprint 1" jam "08:00-09:00" hasil "Login berfungsi"

Ubah tugas "Perbaiki login" catatan "Validasi selesai"
Ubah tugas "Perbaiki login" hasil "Login berhasil diuji"
Ubah tugas "Perbaiki login" status "IN_PROGRESS"

Bagaimana cara membuat invoice?
Bagaimana cara memulai timer kerja?
```

Nama task/target harus cocok secara unik dalam scope pengguna. Pembuatan tugas harian memakai target mingguan yang ditugaskan kepada pengguna; pembaruan berdasarkan nama hanya mencari task milik pengguna. Query pencarian menggunakan parameter, company/tenant, owner/assignee dan scope proyek. Backend tetap memeriksa hak tulis, ownership, checklist, dan aturan status saat konfirmasi. Format JSON lama tetap dapat digunakan.

Input belum lengkap mengembalikan panduan atau klarifikasi. Tidak ada pemilihan record secara fuzzy, default customer/PM, penyimpanan sebelum konfirmasi, atau penerbitan invoice otomatis oleh panduan.

## Keamanan riwayat dan ticket

- Snapshot hanya ditulis server pada metadata pesan. Browser tidak memilih scope, endpoint, atau permission.
- Pergantian tenant/company/user/role, perubahan permission/module/policy, dan kehilangan proyek tidak dapat memperlihatkan kembali pesan lama dari scope lebih luas.
- Hasil mutasi memakai scope setelah eksekusi. Jika akses menyempit atau berubah selama penyimpanan, respons tidak mengirim hasil sensitif ke konteks baru.
- Confirmation tetap memakai atomic claim dan API kanonis; duplicate tidak membuat proyek tambahan.
- Pesan lama tanpa snapshot tetap memakai hash authority yang persis sama. Scope lama tidak ditebak atau dimigrasikan secara massal.

## Pengujian sesudah perbaikan

| Pemeriksaan | Hasil |
|---|---|
| 16 suite regression AI | PASS 16/16 |
| 14 suite regression ERP, termasuk Q11 | PASS 14/14; Q11 PASS 9/9 |
| Native unit/HTTP setelah adapter nama ditambahkan | PASS |
| Backend dan frontend typecheck | PASS |
| Backend build dengan `DEPLOYMENT_TARGET=local`, `NODE_ENV=test` dan URL database loopback | PASS; termasuk Q11, financial/input/authority, reporting, CORS, text IDs, hardening, signature |
| Katalog `--check` | PASS |
| Audit kontrak | PASS, 0 temuan |
| HTTP E2E terisolasi | PASS, semua assertion asli aktif dan assertion baru ditambahkan |
| Frontend lint | PASS dengan 114 warning yang sudah ada; 14 berkaitan dependency React Hook |

Suite 16 AI dan 14 ERP merupakan jumlah suite, bukan jumlah transaksi bisnis. Adapter nama diuji kembali setelah penambahannya. Frontend UI tidak diubah oleh perbaikan ini; production build dan browser fixture mobile/desktop sudah lolos pada baseline sebelumnya.

E2E meliputi create Project → Main → assignment → Weekly → Daily, update Daily, create/update resource Implementation, MCP, agregasi, history sesudah create, replay konkuren, replay sesudah create, pencabutan field permission, history/replay sesudah kehilangan proyek, create Daily berdasarkan nama dan update catatan berdasarkan nama. Nama fixture dibuat unik agar rerun tidak dianggap task ambigu.

Database `marka_qa_20261005` berada di `127.0.0.1:55439`. Pengujian menolak shared/cloud database. PostgreSQL lokal dihentikan setelah verifikasi; database disimpan untuk reproduksi. Tidak ada migrasi database yang diperlukan untuk perbaikan ini karena snapshot memakai kolom JSON metadata yang sudah tersedia.

## Bagian yang masih membutuhkan konfigurasi atau pekerjaan baru

1. **Aktivasi AI pada aplikasi tujuan:** hasil baseline Supabase menunjukkan nol company dengan MARBOT enabled/read. Company tujuan perlu dipilih dan entitlement diaktifkan melalui pengaturan akses yang sah. Konfigurasi database hosting belum dibuktikan sama dengan lokal; tidak ada perubahan entitlement cloud dilakukan pada pekerjaan ini.
2. **Provider AI:** `MARBOT_AI_API_KEY` dan `MARBOT_AI_MODEL` lokal belum diisi. Perintah deterministik di atas sudah bekerja tanpa keduanya; pemetaan bahasa bebas di seluruh katalog masih perlu provider server dan smoke test live.
3. **WhatsApp dan CS eksternal:** belum dibangun atau diklaim tersedia. Kanal tersebut memerlukan integrasi channel, nomor/sender resmi, pemetaan identitas ke tenant/company, akses CS dan handoff manusia. Ini pengembangan fitur baru, bukan penyelesaian empat bug lokal.
4. **Laporan proyek historis:** kini tidak memberikan angka yang menyesatkan. Snapshot historis/filter tanggal dengan makna produk yang jelas masih belum dibuat.
5. **Warning React Hook:** belum diubah karena baseline belum membuktikan masing-masing warning sebagai bug runtime.

## Source dan bukti

Source utama:

- `backend-express/src/modules/marbot/marbot-authority.service.ts`
- `backend-express/src/modules/marbot/marbot-native.routes.ts`
- `backend-express/src/modules/marbot/marbot-native.service.ts`
- `backend-express/src/modules/marbot/marbot-named-action.service.ts`
- `backend-express/src/modules/marbot/marbot-action.service.ts`
- `backend-express/src/modules/marbot/marbot-knowledge.ts`
- `backend-express/src/modules/core/meeting-occurrence.service.ts`
- `backend-express/scripts/generate_marbot_catalog.js`
- `q10-system-testing/run-contract-audit.js`

Bukti hasil terbaru di `tmp/marka-qa-20261005/`: `isolated-fixed.log`, `native-fixed.log`, `native-http-fixed.log`, `backend-build-fixed.log`, `route-contract-fixed.log`, dan JSON/log regression. Log baseline `isolated-ai-e2e.log` tetap merekam kegagalan asli; runner regression memperbarui log AI/ERP/typecheck dengan hasil terbaru. Script diagnostik baseline yang mengharapkan tanggal meeting di luar batas sekarang memang ditolak oleh perbaikan; bukan regression failure.

Reproduksi E2E: dari `backend-express`, atur `DATABASE_URL` dan `DIRECT_URL` ke database QA loopback, `DEPLOYMENT_TARGET=local`, `NODE_ENV=test`, lalu jalankan `npm run test:marbot-isolated`. Jangan mengarahkan suite mutasi ke `.env` operasional.
