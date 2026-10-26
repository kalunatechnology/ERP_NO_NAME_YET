# Marka Headless CRM Integration

Marka tetap menjadi sumber data utama. Sistem eksternal mengirim event ke API Marka, sedangkan perubahan yang perlu disebarkan ke sistem eksternal dikirim melalui outbound webhook yang memiliki antrean, retry, dan riwayat delivery.

Company Admin mengelola koneksi melalui **Company & Access → Integrasi CRM**. Panel Landing Page mendaftarkan sumber, memilih event yang diizinkan, lalu menampilkan webhook URL, integration ID, key ID, dan signing secret satu kali. Secret harus disimpan di server landing page; jangan pernah ditanam di browser. Panel WhatsApp Cloud mengelola kredensial Meta untuk koneksi langsung.

Pada source Landing Page, Company Admin juga dapat mengatur **Domain website yang diizinkan**. Masukkan hostname publik satu per baris atau pisahkan dengan koma; source tanpa allowlist harus mengirim event tanpa `origin_domain`. Event dengan domain yang tidak terdaftar ditolak. Daftar domain dapat diperbarui dari tombol **Domain** pada source yang sudah ada.

## WhatsApp Business Cloud API (inbound awal)

Marka menyediakan halaman **CRM → Koneksi WhatsApp** khusus Company Admin/Super Admin. Administrator menyimpan WABA ID, Phone Number ID, Graph API version, permanent access token, Meta App Secret, dan Verify Token di layar tersebut. Access token, App Secret, dan Verify Token dienkripsi memakai `CRM_INTEGRATION_ENCRYPTION_KEY`; endpoint daftar koneksi hanya mengembalikan status konfigurasi, bukan rahasianya. Tombol **Uji koneksi Meta** memeriksa Phone Number ID melalui Graph API.

Callback bersama untuk semua nomor: `https://<domain-backend-marka>/api/v1/integrations/whatsapp/webhook`. Daftarkan URL itu pada Meta Developers, gunakan Verify Token yang sama seperti di Marka, dan aktifkan subscription `messages` untuk WABA. Callback `GET` menjalankan verifikasi challenge Meta; callback `POST` memvalidasi `X-Hub-Signature-256` menggunakan App Secret. Marka memetakan pesan ke nomor berdasarkan WABA ID dan Phone Number ID. Pesan teks yang sah dikonversi ke event CRM standar dan dimasukkan ke antrean `crm_integration_event`, sehingga pemrosesan Inbox tetap memakai worker, deduplikasi, dan retry yang sama. Pesan media/status belum diproses.

Konektor ini memusatkan konfigurasi dan penerimaan pesan di Marka, tetapi pendaftaran aplikasi, nomor bisnis/WABA, izin/token, HTTPS publik, dan subscription webhook tetap perlu disiapkan pada akun Meta. Fitur balas pesan dari Inbox dan pengiriman template/media belum termasuk tahap ini. Jangan deploy sebelum migration koneksi diterapkan, `CRM_INTEGRATION_ENCRYPTION_KEY` tersedia, URL callback publik memakai HTTPS, dan webhook diuji dengan nomor Meta yang benar-benar terdaftar.

## Menyiapkan

1. Pastikan modul CRM aktif untuk company dan `CRM_INTEGRATION_ENCRYPTION_KEY` tersedia sebagai base64 dari 32 byte acak.
2. Jalankan migrasi database backend:

   ```sh
   cd backend-express
   npx prisma migrate deploy
   npx prisma generate
   ```

3. Buat Integration Source dari `POST /api/v1/core/integration-sources`. Simpan `signing_secret` yang hanya dikembalikan saat source dibuat atau secret dirotasi. Batasi `allowed_event_types` pada event yang memang akan dikirim.
4. Buat outbound subscription di `POST /api/v1/core/integration-sources/outbound-subscriptions`. Endpoint ini mengembalikan `signing_secret` satu kali. Tujuan harus URL HTTPS pada host publik.

## Inbound API

Kirim envelope JSON ke `POST /api/v1/integrations/webhooks/events`. Header autentikasi: `X-Integration-Id`, `X-Integration-Key-Id`, `X-Integration-Timestamp` (Unix seconds), `X-Integration-Nonce` (unik), dan `X-Integration-Signature`.

Signature inbound adalah HMAC-SHA256 hex dari gabungan berikut, lalu diikuti byte body HTTP persis seperti dikirim:

```text
v1\nPOST\n/api/v1/integrations/webhooks/events\n{timestamp}\n{nonce}\n{raw_body}
```

Envelope selalu memiliki `event_id` unik, `event_type`, `schema_version: 1`, `occurred_at` (ISO 8601) atau `timestamp` (Unix seconds), dan `data`. `company_id` boleh disertakan oleh pengirim, tetapi Marka mengabaikannya dan selalu mengambil company dari Integration Source yang terautentikasi. `data.origin_domain` opsional untuk event inquiry, pesan, dan tiket; jika dikirim, hostname/URL dasarnya dinormalisasi dan harus cocok dengan allowlist source. Gunakan konfigurasi server website, bukan nilai domain dari input browser. Domain disimpan pada record CRM dan ditampilkan sebagai badge/filter pada Incoming Inquiry, Inbox CRM, dan Tickets. Event tanpa domain tetap dapat diproses tanpa attribution. Event yang tersedia:

Contoh payload inquiry yang direkomendasikan:

```json
{
  "event_id": "evt_01J9EXAMPLE",
  "event_type": "inquiry.submitted",
  "timestamp": 1728904230,
  "data": {
    "customer": { "name": "PT Maju Bersama", "email": "klien@perusahaan.com", "phone": "+628123456789" },
    "requirements": { "subject": "Kebutuhan pengadaan server", "description": "5 unit server rackmount", "target_budget": 250000000 }
  }
}
```

| Event | Data minimum |
| --- | --- |
| `message.received` | `thread_id`, `message_id`, `message.text`, `message.type: "TEXT"` |
| `inquiry.submitted` | `customer: { name, email, phone? }`, `requirements: { subject, description?, target_budget? }`. Format lama yang menaruh field customer dan subject di root tetap diterima. |
| `ticket.created` | `subject`, `description`; `serial_number` opsional dan harus terdaftar pada company |
| `feedback.submitted` | `customer_code` (`party_code` Marka) customer aktif pada company source, `rating` integer 1–5, `feedback_text`; `feedback_type` opsional, `sales_order_id` opsional tetapi harus milik customer yang sama |
| `quotation.decision` | `quotation_code` (kode dokumen `QUO-...` yang ditampilkan Marka; disarankan untuk website), `decision: "ACCEPTED"` atau `"REJECTED"`. UUID internal lama `quotation_id` tetap diterima untuk kompatibilitas. |
| `quotation.accepted` | `quotation_code` atau UUID internal lama `quotation_id`; hanya quotation berstatus `SENT` dan terhubung ke opportunity |

Untuk mengirim keputusan dari website, gunakan kode quotation yang terlihat di Marka dan dapat dicantumkan pada email klien. Event outbound `quotation.ready` menyertakan `quotation_code` setelah quotation dikirim. Marka tetap menggunakan UUID hanya sebagai identitas internal.

Contoh `inquiry.submitted` di atas mencakup `data.origin_domain`. Untuk `message.received`, `ticket.created`, dan `feedback.submitted`, kirim field yang sama di object `data` jika ingin atribusi domain tampil pada inbox, tiket, atau feedback. Konfigurasikan hostname terlebih dahulu pada allowlist source; domain yang tidak cocok menghasilkan `ORIGIN_DOMAIN_NOT_ALLOWED`. Event `feedback.submitted` membuat review pada Engagement berdasarkan `customer_code` (nilai `party_code`) customer aktif yang berada pada company source.

Penerimaan mengembalikan `202` setelah event disimpan untuk diproses. Event duplikat dengan payload sama mengembalikan `200`; `event_id` yang sama dengan payload berbeda mengembalikan `409`.

## Mengelola Outbound Webhook

Semua endpoint admin berikut memakai autentikasi Marka dan konteks company:

| Method dan path | Kegunaan |
| --- | --- |
| `GET /api/v1/core/integration-sources/outbound-subscriptions` | Daftar subscription dan event outbound yang tersedia |
| `POST /api/v1/core/integration-sources/outbound-subscriptions` | Membuat subscription dengan `name`, `target_url`, dan array `events` |
| `PATCH /api/v1/core/integration-sources/outbound-subscriptions/:id/status` | Mengaktifkan atau menangguhkan subscription |
| `GET /api/v1/core/integration-sources/outbound-subscriptions/:id/deliveries` | Melihat 100 delivery terbaru dan status retry |
| `POST /api/v1/core/integration-sources/outbound-subscriptions/:id/deliveries/:deliveryId/retry` | Memasukkan ulang delivery dead-letter ke antrean |

Event outbound: `quotation.ready` (saat penawaran dikirim), `quotation.accepted`, `quotation.approved`, `quotation.rejected`, `ticket.status_updated` (saat status tiket berubah melalui aksi resolusi), `ticket.resolved`, `deal.won`, dan `crm.executive_approval.decided`. Setiap POST membawa envelope event pada body serta header `X-Marka-Event-Id`, `X-Marka-Timestamp`, dan `X-Marka-Signature`. Envelope outbound menyertakan `company_id`, `occurred_at`, dan `timestamp`. Signature adalah `sha256=` diikuti HMAC-SHA256 hex dari teks `v1\nPOST\n{timestamp}\n{raw_body}` menggunakan `signing_secret` subscription.

Penerimaan event menggunakan `event_id` sebagai idempotency key, ditambah nonce HMAC yang hanya dapat dipakai sekali. Event diproses dalam transaksi sehingga pengulangan dengan ID dan payload sama tidak membuat inquiry, tiket, atau order ganda.

Delivery diproses oleh worker Marka. Respons HTTP 2xx dianggap sukses; kegagalan dicoba ulang dengan jeda bertambah sampai 5 percobaan, lalu status menjadi `DEAD_LETTER`. Admin dapat memeriksa status dan meminta retry melalui endpoint di atas. `quotation.accepted` memanggil alur Deal Won Marka yang sudah ada: pemeriksaan kredit dan pembuatan order/project mengikuti hasil aturan bisnis tersebut.

Worker inbound/outbound dijalankan otomatis oleh proses backend setelah koneksi database siap, dengan polling setiap 2 detik. Endpoint `POST /internal/crm-integration-worker/run` tersedia untuk pemanggilan worker terproteksi, tetapi cron eksternal tidak diperlukan pada deployment satu proses backend. Deployment multi-instance aman menggunakan klaim antrean `FOR UPDATE SKIP LOCKED`.

## Portal Pelanggan

Admin dapat menerbitkan token scoped untuk satu customer. Nilai rahasia hanya ditampilkan sekali saat dibuat; database hanya menyimpan hash.

| Method dan path | Kegunaan |
| --- | --- |
| `POST /api/v1/crm/portal-tokens` | Membuat token untuk `party_id`; scope `quotation:read` dan `ticket:read`; masa aktif maksimal 365 hari |
| `GET /api/v1/crm/portal-tokens` | Melihat token tanpa nilai rahasianya |
| `POST /api/v1/crm/portal-tokens/:id/revoke` | Mencabut token |
| `GET /api/v1/portal/quotations/:id` | Membaca penawaran milik party pemegang token |
| `GET /api/v1/portal/tickets/:id` | Membaca tiket milik party pemegang token |

Sertakan `Authorization: Bearer <token>` atau `X-Api-Key: <token>`. Endpoint portal membatasi pencarian ke company dan party token, serta hanya mengembalikan field yang aman untuk customer. Tiket harus sudah ditautkan ke customer agar dapat dibaca.

## Operasional CRM dan Service

- Aktivitas sales dicatat melalui `/api/v1/crm/activities/` dan terhubung ke opportunity/customer. Antarmuka CRM mendukung telepon, meeting, catatan, dan follow-up terjadwal.
- Opportunity kalah ditutup lewat `POST /api/v1/crm/opportunities/:id/mark-lost` dengan alasan `PRICE_TOO_HIGH`, `LOST_FEATURES`, `BUDGET_CANCELLED`, `COMPETITOR`, `NO_RESPONSE`, atau `OTHER` (pilihan `OTHER` wajib dijelaskan).
- Saat staf mengonfirmasi external identity, party ditautkan ke conversation dan inquiry yang telah dibuat. Jika identitas sudah dikonfirmasi sebelum conversation dieskalasi, inquiry baru mewarisi `customer_party_id` conversation.
- Pemeriksaan garansi menggunakan `POST /api/v1/service/cases/:id/check-warranty`. Marka mencocokkan serial number ke pengiriman company dan kontrak garansi. Untuk status `WARRANTY_ACTIVE`, teknisi dapat dibuatkan Work Order melalui `POST /api/v1/service/cases/:id/work-orders`.
- Untuk melepas Credit Hold setelah DP lunas, receipt Finance harus dialokasikan ke Proforma Invoice terkait. Setelah receipt terverifikasi dan saldo proforma nol, sistem melanjutkan handoff Deal Won dan membuat Sales Order serta Project Workspace dalam transaksi Finance yang sama.
- Endpoint `/api/v1/crm/opportunities/:id/customer-360` menyajikan LTV dari nilai Sales Order, proyek aktif, kontrak, pengiriman, piutang terbuka, dan indikator invoice lewat jatuh tempo.
- Tab **Accounts** menyediakan tambah dan edit nama, kode, tipe, serta status rekanan. Tab **Contracts & Orders** menampilkan transaksi dan mengarahkan staf ke Quotation/Deals; Sales Order mengikuti konversi quotation accepted atau proses Deal Won dengan pemeriksaan kredit.
- Tab **Engagement** memisahkan feedback umum dari CSAT pasca transaksi. Feedback umum mencatat pelanggan, rating 1–5, dan catatan; sistem luar dapat mengirim event `feedback.submitted` dengan ID party Marka yang sudah dipetakan. CSAT tersedia untuk Sales Order berstatus `FULFILLED`, satu respons per order. Saat ini CSAT dicatat staf berdasarkan jawaban pelanggan; pengiriman undangan dan form publik pelanggan belum termasuk.

Perubahan database tambahan mencakup token portal, warranty state pada service case, dan service work order. Terapkan migrasi Prisma sebelum menjalankan backend baru.
