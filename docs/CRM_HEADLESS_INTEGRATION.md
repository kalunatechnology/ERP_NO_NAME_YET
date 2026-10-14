# Marka Headless CRM Integration

Marka tetap menjadi sumber data utama. Sistem eksternal mengirim event ke API Marka, sedangkan perubahan yang perlu disebarkan ke sistem eksternal dikirim melalui outbound webhook yang memiliki antrean, retry, dan riwayat delivery.

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

Envelope selalu memiliki `event_id` unik, `event_type`, `schema_version: 1`, `occurred_at` (ISO 8601) atau `timestamp` (Unix seconds), dan `data`. `company_id` boleh disertakan oleh pengirim, tetapi Marka mengabaikannya dan selalu mengambil company dari Integration Source yang terautentikasi. Event yang tersedia:

| Event | Data minimum |
| --- | --- |
| `message.received` | `thread_id`, `message_id`, `message.text`, `message.type: "TEXT"` |
| `inquiry.submitted` | `subject`, `customer_name`, `customer_email`; `description` opsional |
| `ticket.created` | `subject`, `description`; `serial_number` opsional dan harus terdaftar pada company |
| `quotation.decision` | `quotation_id`, `decision: "ACCEPTED"` atau `"REJECTED"` |
| `quotation.accepted` | `quotation_id`; hanya quotation berstatus `SENT` dan terhubung ke opportunity |

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

Event outbound: `quotation.ready` (saat penawaran dikirim), `quotation.accepted`, `quotation.approved`, `quotation.rejected`, `ticket.resolved`, `deal.won`, dan `crm.executive_approval.decided`. Setiap POST membawa envelope event pada body serta header `X-Marka-Event-Id`, `X-Marka-Timestamp`, dan `X-Marka-Signature`. Envelope outbound menyertakan `company_id`, `occurred_at`, dan `timestamp`. Signature adalah `sha256=` diikuti HMAC-SHA256 hex dari teks `v1\nPOST\n{timestamp}\n{raw_body}` menggunakan `signing_secret` subscription.

Penerimaan event menggunakan `event_id` sebagai idempotency key, ditambah nonce HMAC yang hanya dapat dipakai sekali. Event diproses dalam transaksi sehingga pengulangan dengan ID dan payload sama tidak membuat inquiry, tiket, atau order ganda.

Delivery diproses oleh worker Marka. Respons HTTP 2xx dianggap sukses; kegagalan dicoba ulang dengan jeda bertambah sampai 5 percobaan, lalu status menjadi `DEAD_LETTER`. Admin dapat memeriksa status dan meminta retry melalui endpoint di atas. `quotation.accepted` memanggil alur Deal Won Marka yang sudah ada: pemeriksaan kredit dan pembuatan order/project mengikuti hasil aturan bisnis tersebut.
