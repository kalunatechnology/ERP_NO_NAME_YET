# Marka Plus: batas akses chatbot dan gateway MCP

Gateway privat: `POST /api/v1/marbot/mcp`. Login ERP memberikan bearer JWT personal.
Gateway memverifikasi token, memuat identitas/role aktif dari database, menyelesaikan
company, lalu memeriksa entitlement modul, `USE_MARBOT`, permission baca, cakupan
proyek, dan kebijakan field/data. Klaim role dalam prompt atau argumen tool tidak
memberikan otoritas. Gateway tetap tersedia saat `MARBOT_RUNTIME=external`.

`tools/list` hanya mengiklankan tool yang diizinkan sesi. `tools/call` memeriksa
ulang izin tersebut. Tool query hanya menerima resource/filter bertipe dari katalog
dan memanggil API ERP dengan otorisasi pengguna yang sama. Tidak ada tool SQL bebas
atau mutasi MCP. Perubahan melalui chat native memerlukan tiket milik pengguna,
konfirmasi eksplisit, permission terbaru, dan pembacaan ulang hasil API ERP.

Implementasi ini memakai autentikasi privat ERP, bukan authorization server OAuth
untuk pendaftaran otomatis klien publik seperti Claude/Cursor. Untuk interoperabilitas
publik, gunakan alur OAuth dan validasi audience yang dijelaskan dalam
[spesifikasi otorisasi MCP](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization).

## Aturan Staff dan Supervisor

Resource proyek memakai cakupan API yang sama untuk chat dan MCP: keanggotaan
proyek ACTIVE atau assignment main task memberikan akses proyek. Query tetap
dibatasi tenant dan perusahaan. Cakupan ini juga diterapkan pada resource generik
yang memiliki company_id, serta diturunkan melalui project/main/weekly/daily task.
Resource proyek tanpa hubungan yang dapat diverifikasi ditolak secara konservatif.
Permission baca dan pembatasan tugas yang lebih spesifik tetap berlaku.

Resource biaya, anggaran, snapshot keuangan dan EVM memerlukan modul FINANCE serta
READ_PROJECT_FINANCE atau READ_COMPANY_FINANCE. Kolom keuangan pada resource proyek
juga disembunyikan tanpa izin tersebut, termasuk untuk filter dan agregasi chatbot.
Uji regresi Staff memakai mock database; validasi database nyata dan deployment
tetap perlu dilakukan sebelum menyatakan lingkungan produksi siap.

## Aturan Project Manager

Saat role aktif `PROJECT_MANAGER`, hanya proyek dengan `created_by_id` sama dengan
ID pengguna login yang dapat dibaca/dikelola. Menjadi `project_manager_id`, anggota
proyek lain, atau memiliki role Staff tambahan tidak memperluas cakupan PM aktif.
Daftar main/weekly/daily task, assignment, transfer, resource CRUD dan agregasinya
mengikuti cakupan pembuat. Identitas pembuat ditentukan backend dan tidak dapat
diganti melalui create/update API. Kebijakan Director, OM, Company Admin dan Acting
PM yang sudah ada tetap berlaku.

Proyek lama dengan `created_by_id=NULL` tidak otomatis menjadi milik PM. Rekonsiliasi
hanya boleh menetapkan pembuat berdasarkan bukti historis, bukan menyamakan pembuat
dengan manager saat ini.

## Percakapan dan external

Riwayat dan judul yang dikirim ke klien berasal dari pesan dengan fingerprint
otoritas aktif. Daftar menyembunyikan percakapan tanpa pesan pengguna yang dapat
dibaca pada otoritas itu. Judul tersimpan dari role lama tidak digunakan. Fingerprint
baru membuat riwayat sebelum pembaruan ini tersembunyi secara konservatif.

External wajib contract V2, runtime context V2, dan konfigurasi `GATEWAY_ONLY`.
Legacy serta datasource database langsung ditolak. Provisioning mengirim
`dataSource:null`, tidak mengirim connection string, dan menolak respons yang
menunjukkan datasource masih aktif. Tenant lama harus disinkronkan; konfigurasi
environment saja tidak dapat menandai integrasi lama aman.

Konteks berumur 120 detik ditandatangani HMAC. Callback tool ditandatangani terpisah,
terikat ke method/path/query, user, company, role, permission, project scope,
timestamp dan nonce unik. Backend memeriksa authority saat callback. JWT ERP personal
tidak dikirim ke chatbot external; hanya credential integrasi dan signed context.

Conversation ID yang terlihat browser adalah ID lokal milik pengguna. ID upstream
dibentuk HMAC dari ID lokal dan fingerprint otoritas, sehingga pengguna/role/cakupan
berbeda tidak berbagi namespace riwayat. Respons external dibuffer maksimal 1 MiB,
harus berakhir dengan event `done`, lalu hak akses diperiksa ulang sebelum teks
dilepas. Conversation ID upstream dan tiket tindakan external tidak diteruskan.
Respons external karena itu tiba setelah selesai, bukan token demi token.

Setelah deployment, sinkronkan tenant external dan pastikan layanan upstream benar-benar
menonaktifkan datasource lama. Credential database yang pernah diekspor harus dicabut
atau dirotasi pada PostgreSQL; perubahan source ini tidak mencabut credential yang
sudah disimpan di layanan luar. Enforcement internal layanan tersebut perlu diverifikasi
dalam pengujian staging tersendiri.

## Rate limit dan efisiensi token

Chat native/external: 20 request per menit per user/company/tenant. Query native dan
MCP tool calls: masing-masing 60. Callback signed: 120 per tool. Reservasi memakai
`pg_advisory_xact_lock` dan count+insert dalam transaksi `ReadCommitted`. Kunci dimiliki
transaksi, berlaku lintas instance, dan dilepas saat commit/rollback. Kegagalan database
menolak request tanpa fallback in-memory. Request gagal tetap memakan kuota.

Instruksi tetap dan katalog/schema/referensi yang telah disaring izin ditempatkan
sebelum pertanyaan dinamis untuk membantu prefix caching provider yang mendukungnya.
Tidak ada penambahan provider DeepSeek atau MLA. Model menerima metadata terpilih dan
pertanyaan terkini, bukan seluruh riwayat chat. Follow-up native hanya memakai pesan
pengguna sebelumnya pada otoritas yang sama; hasil bisnis diambil kembali dari ERP.
Tidak ada cache lintas pengguna untuk data bisnis, permission, JWT, atau keputusan akses.
Persentase penghematan token/biaya tidak dijamin.

## Verifikasi

`npm run typecheck`, `npm run test:project-authority`, `npm run test:marbot-native`,
`npm run test:marbot-security`, `npm run test:marbot-capabilities`, dan suite V2.
Tes keamanan mencakup PM lain/proyek tanpa pembuat/company lain, scope tugas turunan,
write relasi terlarang, JWT rusak/kedaluwarsa, MCP tersembunyi, legacy/datasource
langsung, signed context, pemisahan token, ID riwayat, revokasi saat pemrosesan, dan
50 request paralel dengan dua instance database yang disimulasikan (20 diterima).
Tes ini tidak menggantikan pengujian lock pada PostgreSQL nyata atau deployment upstream.
