# Request otomatis dan hak hapus meeting — 6 Oktober 2026

Implementasi lokal mengikuti klarifikasi pengguna: seluruh request langsung dibuat tanpa approval OM maupun PM/Executive. PM dan Executive dapat menghapus request meeting.

## Perilaku akhir

- Request Meeting, Leave, Other, dan Fund Request yang dibuat langsung berstatus `REGISTERED`. Tidak membuat approval OM/PM atau mengirim notifikasi permintaan approval.
- Meeting langsung berstatus `SCHEDULED`; selesainya workflow registrasi tidak menandai kegiatan meeting selesai.
- Pilihan simpan draft tetap tersedia sebagai penyimpanan sukarela. Saat dipublikasikan oleh pembuat/organizer yang berwenang, draft langsung menjadi meeting aktif tanpa approval.
- Request lama berstatus `PENDING_OM`, `PENDING_EXEC`, atau `RE_CHECKING` otomatis menjadi `REGISTERED` ketika modul Request diakses dalam company terkait. Pembaruan ticket dan workflow dilakukan dalam satu transaksi dan tidak mengubah company lain.
- Tombol validasi OM serta approve/reject PM/Executive dihapus dari UI Request. Endpoint approval lama mengembalikan kesalahan bahwa request tidak lagi membutuhkan approval.
- Pesan sukses tidak lagi menampilkan “Waiting OM Validation”.

## Hapus meeting

- Role aktif PM (`PROJECT_MANAGER`) atau Executive (`DIRECTOR`) dapat menghapus meeting milik company aktif, melalui kartu meeting, detail meeting, atau kartu Request pada dashboard.
- PM/Executive dapat melihat meeting dalam company tersebut agar dapat menjalankan hak hapus. Hak PM untuk mengedit notulensi orang lain tidak diperluas.
- Staff, OM, dan Finance tidak mendapat hak hapus meeting. Guard company tetap berlaku.
- Menggunakan field existing: meeting/ticket/workflow menjadi `CANCELLED` dan `request_ticket.cancelled_at` terisi. Meeting hilang dari daftar aktif serta detail biasa; audit, notulensi, keputusan, action item, dan relasi Daily Task tetap tersimpan.
- Pembatalan konfirmasi hapus tidak mengirim permintaan DELETE. Penghapusan yang sudah selesai tidak dapat diulang.
- Endpoint DELETE hanya menangani meeting; request non-meeting tidak mendapat fitur hapus tambahan.

Tidak ada tabel, field, atau migrasi schema baru. Proses pencairan Finance dan verifikasi LPJ existing tetap berjalan terpisah dari pembuatan request. Approval Weekly Task tidak diubah.

## Verifikasi

| Pemeriksaan | Hasil |
| --- | --- |
| HTTP Express + JWT + PostgreSQL QA untuk pembuatan otomatis empat jenis request | Lulus |
| Tidak ada approval record/notifikasi approval baru | Lulus |
| Publikasi draft langsung aktif | Lulus |
| Aktivasi status lama hanya dalam company terkait | Lulus |
| PM/Executive hapus; Staff/OM/Finance dan company lain ditolak | Lulus |
| Meeting terhapus tidak muncul di daftar/detail/feed dashboard | Lulus |
| Notulensi, action item, dan hierarki Project/Weekly/Daily tetap utuh | Lulus |
| Browser Edge dengan komponen React nyata dan API fixture: buat, hak role, batal/konfirmasi hapus, kartu dashboard, pesan sukses | Lulus |
| Integrasi HTTP Project/Weekly/Daily existing dan tiga suite authority/input/financial Project | 4/4 lulus |
| Meeting recurring, Q11, integration hardening, Marbot native/native HTTP/security/resources | 7/7 lulus |
| TypeScript backend/frontend, lint frontend, build Next.js | Lulus; warning lint existing masih ada |
| Audit kontrak API dan pengecekan catalog Marbot | Lulus; 0 temuan audit, 204 resource canonical |
| `git diff --check` | Lulus |

Tes tersimpan di `backend-express/tests/request-auto-create.integration.ts` dan `backend-express/tests/request-auto-create.browser.js`. Bukti lokal berada di `.tmp/request-auto-create-20261006/`. Route fixture browser dihapus setelah tes dan tidak masuk build akhir. Tes browser menggunakan mount client; runtime SSR hosting belum diverifikasi.

Catatan existing: uji Leave tanpa assignee mencatat error validasi enum pada lookup role HR lama. Logic existing menangkap error tersebut dan memakai fallback Executive; pembuatan request tetap berhasil HTTP 201. Lookup HR tidak diubah dalam pekerjaan ini.

Semua penulisan pengujian hanya memakai database QA lokal `marka_qa_20261005`, bukan database hosting. Server QA sudah dihentikan. Perubahan belum di-deploy, belum di-commit, dan belum diuji pada hosting. Aktivasi request pending pada hosting baru berlaku setelah kode backend ini dirilis dan company terkait mengakses modul.
