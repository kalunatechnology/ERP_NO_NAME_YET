# Perbaikan filter Daily Task dan respons 403 — 6 Oktober 2026

Perubahan ini diterapkan di workspace lokal. Belum di-deploy ke hosting.

## Temuan yang terverifikasi

- Pencarian teks tanggal membaca `bukan hari ini` sebagai `hari ini`, sehingga tugas pada tanggal lain tidak terbaca.
- Pertanyaan `bagaimana dengan daily task ...` dapat masuk ke jawaban panduan, bukan pembacaan data.
- Frontend hanya membaca `error.message`. Format error backend aktual menggunakan `detail` dan kode pada `error`, sehingga penjelasan backend hilang dan tampil `HTTP Error 403:`.
- Planner AI dapat menulis ulang pertanyaan task yang sudah dapat dibaca secara deterministik. Pertanyaan task yang didukung sekarang mempertahankan tanggal dan kepemilikan pengguna tanpa planner AI.
- Validasi akhir chat sebelumnya menolak setiap perubahan daftar proyek. Penambahan proyek yang diizinkan sekarang diterima menggunakan pemeriksaan snapshot authority yang sudah dipakai untuk hasil aksi. Pencabutan proyek atau perubahan role, permission, modul, tenant, company, dan kebijakan tetap menolak hasil lama.

Screenshot tidak menyertakan body error atau log backend hosting. Penyebab spesifik 403 pada kejadian tersebut belum terverifikasi; laporan ini tidak menyatakan bahwa seluruh 403 telah dihilangkan.

## Perilaku setelah perbaikan

- `hari ini saya memiliki berapa daily task`: hanya task milik pengguna bertanggal hari ini dalam zona Asia/Jakarta.
- `bagaimana dengan daily task lain yang bukan hari ini`: mengecualikan tanggal hari ini; mencakup tanggal lain dan task tanpa tanggal.
- `maksud saya adalah seluruh daily task saya`: seluruh tanggal milik pengguna dalam cakupan proyek yang diizinkan. Tidak mewarisi filter tanggal dari pertanyaan sebelumnya.
- `saya/my/mine` membatasi owner, termasuk saat role aktif PM. Kontrol akses tenant/company/proyek tetap berlaku. Jumlah total berasal dari query database; daftar tetap maksimal 20 task sesuai batas existing.
- Rentang tanggal dan pengecualian hari ini dijelaskan pada jawaban. Teks nama record dalam tanda kutip tidak menjadi filter tanggal task.
- Error chat menampilkan `detail` backend atau format legacy `error.message`; respons kosong/HTML memiliki pesan fallback untuk 401, 403, dan 429.
- Percakapan tidak tersedia mengembalikan `MARBOT_CONVERSATION_UNAVAILABLE`. Pengiriman berikutnya yang dilakukan pengguna membuka chat baru. Permintaan ditolak tidak dikirim ulang otomatis.
- Pencabutan authority selama pemrosesan mengembalikan `MARBOT_AUTHORITY_CHANGED`; frontend membersihkan pesan lama dan kembali ke mode Helper. Respons 403 umum tetap mengikuti penolakan akses backend.

Tidak ada tabel/field baru, migrasi, perubahan layout, atau perubahan flow Meeting/Request/Weekly/Daily di luar pembacaan chatbot. Perubahan Meeting/Request sebelumnya dipertahankan.

## Pengujian

Semua pemeriksaan berikut selesai dengan exit code 0:

- `marbot-native.unit.ts`: tanggal Jakarta, pengecualian hari ini, semua tanggal, nama task bertanggal, owner PM/Staff, permission dan SQL scope.
- `marbot-native-http.unit.ts`: tiga pertanyaan screenshot dengan provider terkonfigurasi tetapi planner dilarang berjalan; SSE/persistence; ownership conversation; perluasan scope diterima; pencabutan proyek/role/permission/modul ditolak tanpa menyimpan hasil.
- `marbot-client.unit.js`: error backend aktual dan legacy, body kosong/HTML, 401/403/429, tidak retry, kelengkapan SSE dan tiket aksi.
- `marbot-planner.unit.ts`, `marbot-security.unit.ts`, `marbot-resources.unit.ts`, `integration-hardening.unit.ts`, `q11-system-guardrails.ts`, `meeting-recurring.unit.ts`: regression sesuai domain.
- `marbot-task-dates.integration.ts`: HTTP autentikasi/JWT dengan query SQL PostgreSQL QA lokal `127.0.0.1:55440/marka_qa_20261005`. Dalam satu conversation, 4 task milik Staff menghasilkan 1 task hari ini, 3 selain hari ini, dan 4 seluruh tanggal. Task tanpa tanggal ikut terhitung; task PM, proyek lain, dan company lain tidak muncul. PM yang menanyakan task sendiri hanya melihat task miliknya. Conversation pengguna lain ditolak.
- `marbot-chat-recovery.browser.js`: komponen ChatbotDrawer aktual pada viewport 427×952, API fixture; alasan 403 tampil, pengiriman berikutnya membuka chat baru untuk conversation tidak tersedia, 403 umum tidak mereset conversation, pencabutan authority membersihkan pesan lama, tanpa retry otomatis atau error JavaScript.
- Typecheck backend/frontend, lint frontend, build produksi frontend, pemeriksaan katalog resource dan audit kontrak. Lint memiliki warning existing, tanpa error. Audit kontrak tidak menemukan temuan.
- `git diff --check` tanpa error whitespace.

Database QA terpisah dari hosting. Company seed berstatus `GHOST` diaktifkan hanya selama uji dan dikembalikan sesudahnya; fixture task/proyek dibersihkan. PostgreSQL QA dihentikan setelah pengujian. Tidak menggunakan provider AI berbayar dan tidak mengubah database produksi.

## Batas verifikasi

Uji browser menggunakan route fixture sementara dengan render client dan respons API terkontrol. Build frontend diverifikasi, tetapi deployment hosting dan sesi login pengguna pada screenshot tidak diuji. Backend dan frontend harus dirilis bersama agar kode error pemulihan baru tersedia di website.
