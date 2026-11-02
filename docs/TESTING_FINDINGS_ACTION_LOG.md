# Tindak Lanjut Temuan Testing

Dokumen ini memperbarui rekap temuan testing yang diberikan. Status di bawah membedakan perubahan kode pada workspace ini, fitur yang sudah tersedia, dan hal yang masih memerlukan keputusan aturan bisnis. Status “sudah diperbaiki” berarti implementasi sudah diubah; belum berarti sudah lulus pengujian runtime.

## Status per temuan

| Modul | Temuan / kebutuhan | Status | Tindak lanjut / catatan |
| --- | --- | --- | --- |
| Piutang | Draft penerimaan belum mengubah saldo kas/bank dan jurnal | Perlu penegasan alur | Perilaku saat ini menyimpan Draft; saldo dan jurnal diperbarui setelah verifikasi dan posting. Ini sesuai perilaku aplikasi, tetapi alur verifikasi/posting perlu dijelaskan pada panduan pengguna. |
| Trial Balance | Sumber transaksi Beban Gaji & SDM | Menunggu keputusan bisnis | Belum ditemukan modul payroll yang menjadi sumber posting. Perlu ditentukan apakah jurnal gaji dibuat melalui jurnal umum atau integrasi payroll. |
| Trial Balance | Funding Proyek | Perlu keputusan akuntansi | Alur persetujuan/pencairan funding tersedia, tetapi belum seluruh status funding membentuk jurnal GL. Tentukan peristiwa pengakuan dan akun lawannya sebelum menambahkan posting otomatis. |
| Trial Balance | Costing & WIP | Sudah tersedia sebagian | Alur posting WIP ditemukan. Uji rekonsiliasi transaksi sumber ke jurnal dan Trial Balance tetap diperlukan sebelum menyatakan seluruh alur lulus. |
| Jurnal Umum | Jurnal Posted dan Storno | Passed menurut hasil testing sumber | Dipertahankan sebagai hasil testing yang dilaporkan; perubahan ini tidak mengulang pengujian. |
| Laporan Keuangan | Menampilkan nominal lengkap | Sudah diperbaiki | Nominal Trial Balance, Laba Rugi, dan Neraca memakai format rupiah penuh, tidak disingkat menjadi rb/jt. |
| Rekonsiliasi Bank | Pembayaran tidak bisa dipilih | Sudah diperbaiki | Daftar pencocokan memuat transaksi pembayaran/penerimaan berstatus POSTED. Backend memvalidasi status, company, rekening, nominal, dan mencegah pencocokan ganda. Baris tanpa transaksi yang bisa dipilih menampilkan keadaan kosong yang jelas. |
| Periode Fiskal | Persetujuan dan penutupan | Passed menurut hasil testing sumber | Dipertahankan sebagai hasil testing yang dilaporkan. |
| Quotation | Cara membuat nomor surat penawaran | Sudah tersedia | Nomor dibuat otomatis saat estimate dikonversi menjadi quotation; format saat ini `QUO-` diikuti delapan karakter awal ID estimate. |
| Customer / bot | Pencarian nama dan kode, toleransi salah eja | Perlu pengembangan terarah | Alur aksi bot saat ini sengaja mensyaratkan nama yang eksplisit dan unik; pencocokan fuzzy otomatis berisiko memilih customer yang salah. Pencarian nama dengan pilihan konfirmasi perlu dirancang agar identitas customer tidak ditebak. |
| Review eksternal | Akses pihak luar untuk quotation/tiket | Sudah tersedia sebagian | Portal API eksternal memiliki akses berscope untuk membaca quotation dan tiket. Belum ada bukti dari temuan ini bahwa proses review/komentar eksternal sudah lengkap; kebutuhan review harus diperinci. |
| Produk | Lokasi pencatatan Serial Number | Sudah tersedia | API dan menu Inventori menyediakan pencatatan nomor seri. Nomor seri dipakai untuk pemeriksaan garansi ketika sudah terhubung dengan produk/pengiriman. |
| Garansi | Hanya menampilkan satu status garansi | Sudah diperbaiki sebagian | Pemeriksaan sekarang mengembalikan semua periode kontrak garansi untuk customer/produk terkait, serta riwayat work order dan resolusi tiket. UI menampilkannya setelah tombol “Periksa garansi” digunakan. Periode kontrak perlu memiliki status/tanggal yang valid agar klasifikasinya akurat. |
| Garansi | Kaitan riwayat garansi dengan notulensi | Menunggu rancangan relasi | CRM sudah mendukung aktivitas yang ditautkan ke notulensi meeting, tetapi belum ada relasi langsung dari work order/garansi ke notulensi. Perlu diputuskan apakah tautan dibuat pada tiket, work order, atau aktivitas CRM. |
| Garansi | Penanda jadwal follow-up | Sudah tersedia pada aktivitas CRM | Jadwal aktivitas yang memiliki tanggal follow-up sudah diberi label “Jadwal follow-up”. Belum ada pengingat khusus yang otomatis dibuat untuk proses garansi. |
| Penerimaan / UI | Nama klien dapat diketik manual | Sudah diperbaiki | Field menjadi hanya-baca dan diisi dari proyek atau faktur yang dipilih. Untuk proyek manual yang tidak memiliki relasi klien tersimpan, penerimaan tidak dapat disimpan sampai faktur/proyek dengan data klien dipilih. |
| Pesan error | Peringatan teknis tidak jelas bagi pengguna | Sudah diperbaiki | Backend menerjemahkan sejumlah error validasi, konflik, akses, dan relasi menjadi pesan yang lebih mudah dipahami serta menghindari membocorkan pesan database mentah. Perlu perluasan bertahap berdasarkan respons error API yang benar-benar muncul di aplikasi. |
| Tagihan vendor | Satu invoice dapat dibuatkan beberapa permintaan pembayaran aktif | Sudah diperbaiki | Backend menolak alokasi pembayaran aktif/posted yang menduplikasi invoice yang sama. |
| Quotation / estimasi | Hapus estimasi mendapat 409 Conflict tanpa penjelasan | Sudah diperbaiki | Estimasi yang sudah menjadi quotation tidak menawarkan aksi hapus dan alasan pembatasan ditampilkan. Error API pada pembuatan quotation juga diteruskan sebagai pesan pengguna. |

## Catatan tindak lanjut

- Pilihan nama customer dari bot sebaiknya menampilkan kandidat dan meminta konfirmasi saat nama mirip/ambigu. Jangan mengubah pencocokan menjadi fuzzy otomatis untuk tindakan yang dapat mengubah data.
- Sebelum membuat posting GL untuk gaji atau funding, tetapkan event akuntansi, akun debit/kredit, dan apakah transaksi memerlukan approval atau bukti pencairan.
- Hubungan garansi, tiket servis, work order, notulensi, dan follow-up perlu aturan bisnis yang disepakati agar riwayat audit tidak terpecah.
- Temuan yang semula ditandai Passed tetap dicatat sebagai hasil laporan testing pengguna; perubahan ini tidak menjalankan ulang skenario tersebut.
- Perubahan kode pada workspace ini belum diverifikasi dengan test suite atau pengujian manual runtime.
