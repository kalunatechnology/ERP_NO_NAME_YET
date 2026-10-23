# Panduan Developer: Menghubungkan Website / Aplikasi ke CRM Marka

> **Untuk Developer Website & Aplikasi**: Marka ERP & CRM Anda sudah aktif dan berjalan. Panduan ini menjelaskan secara langsung bagaimana Anda menghubungkan website, landing page, widget chatbox, form tiket, atau portal pelanggan Anda ke CRM Marka melalui Webhook & API.
>
> **Anda TIDAK PERLU melakukan instalasi, migrasi database, atau konfigurasi server Marka.** Anda hanya butuh kredensial dari dashboard CRM Marka dan menulis kode pemanggil di aplikasi Anda.

---

## Daftar Isi

1. [Langkah 0: Ambil Kredensial dari Dashboard Marka](#1-langkah-0-ambil-kredensial-dari-dashboard-marka)
2. [Arsitektur Komunikasi & Keamanan (HMAC)](#2-arsitektur-komunikasi--keamanan-hmac)
3. [Helper Function Siap Pakai (Node.js / Python / PHP)](#3-helper-function-siap-pakai)
4. [Fitur 1: Form "Hubungi Kami" / Landing Page (`inquiry.submitted`)](#4-fitur-1-form-hubungi-kami--landing-page-inquirysubmitted)
5. [Fitur 2: Chatbox / Live Chat Website (`message.received`)](#5-fitur-2-chatbox--live-chat-website-messagereceived)
6. [Fitur 3: Form Tiket Dukungan & Garansi (`ticket.created`)](#6-fitur-3-form-tiket-dukungan--garansi-ticketcreated)
7. [Fitur 4: Form Review & Feedback Pelanggan (`feedback.submitted`)](#7-fitur-4-form-review--feedback-pelanggan-feedbacksubmitted)
8. [Fitur 5: Approval Penawaran Harga (`quotation.decision`)](#8-fitur-5-approval-penawaran-harga-quotationdecision)
9. [Fitur 6: Menerima Webhook Balik dari Marka (Outbound)](#9-fitur-6-menerima-webhook-balik-dari-marka-outbound)
10. [Fitur 7: Portal Pelanggan Baca Data (Quotation & Tiket)](#10-fitur-7-portal-pelanggan-baca-data-quotation--tiket)
11. [Tabel Status HTTP & Troubleshooting](#11-tabel-status-http--troubleshooting)

---

## 1. Langkah 0: Ambil Kredensial dari Dashboard Marka

Karena sistem Marka Anda sudah aktif (developing / production), Anda cukup login ke Marka untuk mengambil 4 kredensial integrasi:

1. Buka Marka: **Company and Access > Integrasi CRM > Tab "Landing page / aplikasi"**.
2. Klik **Buat koneksi baru** (atau gunakan koneksi yang sudah ada):
   - **Kode Sumber**: misal `web-landing-utama`
   - **Nama**: misal `Website Utama & Chatbox`
   - **Event yang diizinkan**: centang event yang akan dipakai (`inquiry.submitted`, `message.received`, `ticket.created`, dll.)
   - **Domain**: masukkan domain website Anda (misal `arsalynk.com` atau `localhost:3000` saat development).
3. Salin nilai yang tampil (karena Secret hanya tampil sekali):

Simpan di file environment aplikasi Anda (`.env` di server website Anda):

```env
# Di server website / backend aplikasi Anda:
MARKA_CRM_WEBHOOK_URL=https://api.marka-anda.com/api/v1/integrations/webhooks/events
MARKA_CRM_INTEGRATION_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
MARKA_CRM_KEY_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
MARKA_CRM_SIGNING_SECRET=kunci-secret-panjang-dari-dashboard-marka
PUBLIC_ORIGIN_DOMAIN=arsalynk.com
```

> ⚠️ **PENTING**: Simpan secret ini di **Server-Side** (Next.js API route, Express, Laravel, FastAPI). **JANGAN PERNAH** meletakkan secret di JavaScript browser/frontend publik!

---

## 2. Arsitektur Komunikasi & Keamanan (HMAC)

### Alur Data

```
Browser Klien (User) ──POST──► Server Website Anda ──HMAC-SHA256 POST──► Marka CRM Webhook (Port 202)
                                (punya secret)                             └─► Masuk Antrian CRM
```

1. Pengunjung website mengisi form kontak atau mengirim chat.
2. Form dikirim ke **Server Backend Website Anda** (misal `/api/contact` atau `/api/chat`).
3. Server Anda membungkus payload event, menandatanganinya dengan `HMAC-SHA256`, lalu mengirimkannya ke endpoint Marka:
   `POST /api/v1/integrations/webhooks/events`
4. Marka mengembalikan **HTTP 202 Accepted** jika signature cocok dan data tervalidasi. Data langsung masuk antrean CRM.

### Format Signature Header Marka

Setiap request dari website Anda ke Marka harus menyertakan **6 header**:

| Header | Nilai |
|---|---|
| `X-Integration-Id` | Nilai `MARKA_CRM_INTEGRATION_ID` |
| `X-Integration-Key-Id` | Nilai `MARKA_CRM_KEY_ID` |
| `X-Integration-Timestamp` | Unix timestamp saat ini dalam detik (`Math.floor(Date.now() / 1000)`) |
| `X-Integration-Nonce` | 16-byte hex acak unik untuk mencegah replay attack |
| `X-Integration-Signature` | Hash HMAC-SHA256 dalam format hex |
| `Content-Type` | `application/json` |

Rumus Signature:
```
signature = HMAC-SHA256(
  secret  = MARKA_CRM_SIGNING_SECRET,
  message = "v1\nPOST\n/api/v1/integrations/webhooks/events\n{timestamp}\n{nonce}\n" + raw_json_body
)
```

---

## 3. Helper Function Siap Pakai

Salin fungsi ini ke dalam codebase server website Anda. Anda tidak perlu menghitung HMAC secara manual di setiap fitur.

### A. TypeScript / Node.js (Next.js, Express, NestJS)

Simpan di file `lib/marka-crm.ts`:

```typescript
import { createHmac, randomBytes } from "node:crypto";

const MARKA_URL = process.env.MARKA_CRM_WEBHOOK_URL!;
const INTEGRATION_ID = process.env.MARKA_CRM_INTEGRATION_ID!;
const KEY_ID = process.env.MARKA_CRM_KEY_ID!;
const SIGNING_SECRET = process.env.MARKA_CRM_SIGNING_SECRET!;
const PATH = "/api/v1/integrations/webhooks/events";

export interface MarkaEventPayload {
  eventId: string;
  eventType: string;
  data: Record<string, unknown>;
}

export async function sendMarkaEvent(
  eventId: string,
  eventType: string,
  data: Record<string, unknown>
) {
  const body = JSON.stringify({
    event_id: eventId,
    event_type: eventType,
    schema_version: 1,
    occurred_at: new Date().toISOString(),
    timestamp: Math.floor(Date.now() / 1000),
    data,
  });

  // Retry otomatis hingga 3 kali jika terjadi network glitch
  for (let attempt = 1; attempt <= 3; attempt++) {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = randomBytes(16).toString("hex");
    const prefix = `v1\nPOST\n${PATH}\n${timestamp}\n${nonce}\n`;
    
    const signature = createHmac("sha256", SIGNING_SECRET)
      .update(Buffer.from(prefix, "utf8"))
      .update(Buffer.from(body, "utf8"))
      .digest("hex");

    try {
      const response = await fetch(MARKA_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Integration-Id": INTEGRATION_ID,
          "X-Integration-Key-Id": KEY_ID,
          "X-Integration-Timestamp": timestamp,
          "X-Integration-Nonce": nonce,
          "X-Integration-Signature": signature,
        },
        body,
        signal: AbortSignal.timeout(8000),
      });

      if (response.status === 200 || response.status === 202) {
        return await response.json();
      }

      // Jangan retry jika ditolak karena validasi data / autentikasi (4xx)
      if (response.status < 500 && response.status !== 408 && response.status !== 429) {
        const errText = await response.text();
        throw new Error(`Marka CRM rejected (HTTP ${response.status}): ${errText}`);
      }

      if (attempt === 3) throw new Error(`Marka CRM gagal setelah 3x retry (HTTP ${response.status})`);
    } catch (err) {
      if (attempt === 3) throw err;
    }

    // Exponential backoff: 300ms, 600ms
    await new Promise((resolve) => setTimeout(resolve, 300 * Math.pow(2, attempt - 1)));
  }
}
```

### B. Python (FastAPI / Django / Flask)

```python
import hashlib, hmac, json, secrets, time, requests

def send_marka_event(event_id: str, event_type: str, data: dict, config: dict):
    payload = {
        "event_id": event_id,
        "event_type": event_type,
        "schema_version": 1,
        "occurred_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "timestamp": int(time.time()),
        "data": data
    }
    body = json.dumps(payload, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
    timestamp = str(int(time.time()))
    nonce = secrets.token_hex(16)
    prefix = f"v1\nPOST\n/api/v1/integrations/webhooks/events\n{timestamp}\n{nonce}\n".encode('utf-8')
    
    signature = hmac.new(config["SIGNING_SECRET"].encode('utf-8'), prefix + body, hashlib.sha256).hexdigest()
    
    res = requests.post(
        config["WEBHOOK_URL"],
        data=body,
        headers={
            "Content-Type": "application/json",
            "X-Integration-Id": config["INTEGRATION_ID"],
            "X-Integration-Key-Id": config["KEY_ID"],
            "X-Integration-Timestamp": timestamp,
            "X-Integration-Nonce": nonce,
            "X-Integration-Signature": signature
        },
        timeout=8
    )
    if res.status_code not in (200, 202):
        raise Exception(f"Marka Error {res.status_code}: {res.text}")
    return res.json()
```

### C. PHP (Laravel / WordPress / Native)

```php
function sendMarkaEvent(string $eventId, string $eventType, array $data, array $config): array {
    $payload = [
        'event_id' => $eventId,
        'event_type' => $eventType,
        'schema_version' => 1,
        'occurred_at' => gmdate('Y-m-d\TH:i:s\Z'),
        'timestamp' => time(),
        'data' => $data
    ];
    $body = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    $timestamp = (string) time();
    $nonce = bin2hex(random_bytes(16));
    $prefix = "v1\nPOST\n/api/v1/integrations/webhooks/events\n{$timestamp}\n{$nonce}\n";
    $signature = hash_hmac('sha256', $prefix . $body, $config['SIGNING_SECRET']);

    $ch = curl_init($config['WEBHOOK_URL']);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $body,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 8,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'X-Integration-Id: ' . $config['INTEGRATION_ID'],
            'X-Integration-Key-Id: ' . $config['KEY_ID'],
            'X-Integration-Timestamp: ' . $timestamp,
            'X-Integration-Nonce: ' . $nonce,
            'X-Integration-Signature: ' . $signature,
        ]
    ]);
    $res = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);

    if (!in_array($status, [200, 202])) {
        throw new Exception("Marka Error {$status}: {$res}");
    }
    return json_decode($res, true);
}
```

---

## 4. Fitur 1: Form "Hubungi Kami" / Landing Page (`inquiry.submitted`)

Gunakan ini saat prospek mengisi form kontak di website Anda. Data akan langsung muncul di **CRM > Incoming Inquiry** Marka.

### Contoh API Route Handler (Next.js App Router)

```typescript
// app/api/contact/route.ts
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { sendMarkaEvent } from "@/lib/marka-crm";

export async function POST(req: NextRequest) {
  try {
    const { name, email, phone, subject, message, targetBudget } = await req.json();

    if (!name || !email || !subject) {
      return NextResponse.json({ error: "Nama, email, dan subjek wajib diisi" }, { status: 400 });
    }

    // ID unik submission (simpan ID ini jika Anda menyimpan riwayat form di database lokal)
    const eventId = `inq-${Date.now()}-${randomUUID().slice(0, 8)}`;

    const result = await sendMarkaEvent(eventId, "inquiry.submitted", {
      origin_domain: process.env.PUBLIC_ORIGIN_DOMAIN || "arsalynk.com",
      customer: {
        name: String(name).trim(),
        email: String(email).trim().toLowerCase(),
        phone: phone ? String(phone).trim() : undefined,
      },
      requirements: {
        subject: String(subject).trim(),
        description: message ? String(message).trim() : "",
        ...(targetBudget ? { target_budget: Number(targetBudget) } : {}),
      },
    });

    return NextResponse.json({ success: true, eventId: result.event_id });
  } catch (error: any) {
    console.error("Gagal mengirim inquiry ke Marka:", error);
    return NextResponse.json({ error: error.message || "Gagal memproses formulir" }, { status: 500 });
  }
}
```

---

## 5. Fitur 2: Chatbox / Live Chat Website (`message.received`)

Gunakan ini saat pengunjung website mengetikkan pesan di widget live chat. Pesan langsung masuk ke **CRM > Customer Inbox** Marka.

### Aturan Data Chat
- `thread_id`: ID unik untuk satu sesi chat visitor (simpan di `localStorage` atau session browser agar obrolan visitor yang sama masuk ke percakapan yang sama).
- `message_id`: ID unik untuk setiap bubble chat.
- `message.type`: Saat ini gunakan `"TEXT"`.

### Contoh API Handler Chatbox

```typescript
// app/api/chat/send/route.ts
import { NextRequest, NextResponse } from "next/server";
import { sendMarkaEvent } from "@/lib/marka-crm";

export async function POST(req: NextRequest) {
  try {
    const { visitorId, visitorName, messageId, messageText } = await req.json();

    if (!visitorId || !messageText) {
      return NextResponse.json({ error: "visitorId dan messageText wajib" }, { status: 400 });
    }

    // thread_id stabil per visitor, misal "webchat:visitor-12345"
    const threadId = `webchat:${visitorId}`;
    const eventId = `msg-${messageId || Date.now()}`;

    await sendMarkaEvent(eventId, "message.received", {
      origin_domain: process.env.PUBLIC_ORIGIN_DOMAIN || "arsalynk.com",
      thread_id: threadId,
      message_id: messageId || `m-${Date.now()}`,
      sender: {
        type: "EXTERNAL",
        value: visitorId,
        display_name: visitorName || "Pengunjung Website",
      },
      message: {
        type: "TEXT",
        text: messageText,
      },
    });

    return NextResponse.json({ success: true, threadId });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

---

## 6. Fitur 3: Form Tiket Dukungan & Garansi (`ticket.created`)

Gunakan saat pelanggan melaporkan kendala teknis atau klaim garansi. Tiket langsung muncul di **CRM > Support & Garansi** Marka.

### Contoh API Handler Tiket

```typescript
// app/api/support/ticket/route.ts
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { sendMarkaEvent } from "@/lib/marka-crm";

export async function POST(req: NextRequest) {
  try {
    const { subject, description, serialNumber, customerEmail } = await req.json();

    if (!subject || !description) {
      return NextResponse.json({ error: "Subjek dan keluhan wajib diisi" }, { status: 400 });
    }

    const eventId = `tkt-${Date.now()}-${randomUUID().slice(0, 8)}`;

    await sendMarkaEvent(eventId, "ticket.created", {
      origin_domain: process.env.PUBLIC_ORIGIN_DOMAIN || "arsalynk.com",
      subject: String(subject),
      description: String(description),
      ...(serialNumber ? { serial_number: String(serialNumber).trim() } : {}),
    });

    return NextResponse.json({ success: true, message: "Tiket berhasil dibuat di CRM" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

> 💡 **Tips Garansi**: Jika Anda mengirimkan `serial_number`, Marka akan otomatis memvalidasi apakah nomor seri tersebut pernah dibeli di sistem Marka dan status garansinya aktif.

---

## 7. Fitur 4: Form Review & Feedback Pelanggan (`feedback.submitted`)

Gunakan untuk form review rating bintang (1-5) atau survei kepuasan pelanggan. Data otomatis masuk ke **CRM > Engagement**.

### Format Payload Event
Anda dapat mengidentifikasi customer menggunakan **`customer_code`** (kode customer yang terdaftar di Marka) atau **`customer_party_id`** (UUID database Marka).

```json
{
  "event_id": "fb-20261023-001",
  "event_type": "feedback.submitted",
  "schema_version": 1,
  "occurred_at": "2026-10-23T10:00:00.000Z",
  "data": {
    "origin_domain": "arsalynk.com",
    "customer_code": "CUST-001",
    "rating": 5,
    "feedback_text": "Pelayanan sangat cepat dan tim support sangat membantu.",
    "feedback_type": "CUSTOMER_REVIEW"
  }
}
```

> ⚠️ **Aturan Penting Mengenai ID**:
> 1. **Identifikasi Customer (`customer_code` vs `customer_party_id`)**:
>    - **Disarankan**: Gunakan `customer_code` (misal `"CUST-001"` atau kode klien Anda yang sesuai dengan `party_code` di Marka). Website Anda tidak perlu menyimpan atau mengetahui UUID internal database Marka.
>    - Jika menggunakan `customer_party_id`, nilainya harus berupa string UUID yang valid.
> 2. **Sales Order (`sales_order_id`)**:
>    - Field ini **opsional**. Jika form website Anda tidak memiliki UUID internal Sales Order Marka, **kosongkan saja** (jangan dikirim / `undefined`).
>    - **JANGAN** mengirimkan nomor dokumen/tampilan seperti `"SO-2026-0042"` ke field `sales_order_id`, karena Marka memerlukan format UUID internal. Jika nomor dokumen dikirim, Marka akan menolak dengan error `INVALID_FEEDBACK_EVENT`.

### Contoh API Handler Feedback (Next.js)

```typescript
// app/api/feedback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { sendMarkaEvent } from "@/lib/marka-crm";

export async function POST(req: NextRequest) {
  try {
    const { customerCode, rating, feedbackText, salesOrderId } = await req.json();

    if (!customerCode || rating === undefined || rating === null) {
      return NextResponse.json(
        { error: "Kode Customer (customerCode) dan rating wajib diisi" },
        { status: 400 }
      );
    }

    if (!feedbackText || String(feedbackText).trim().length === 0) {
      return NextResponse.json(
        { error: "Ulasan feedback wajib diisi" },
        { status: 400 }
      );
    }

    const eventId = `fb-${Date.now()}-${randomUUID().slice(0, 8)}`;

    // Kirim sales_order_id HANYA jika valid UUID, selain itu biarkan undefined
    const isValidUuid = salesOrderId && /^[0-9a-f-]{36}$/i.test(String(salesOrderId));

    await sendMarkaEvent(eventId, "feedback.submitted", {
      origin_domain: process.env.PUBLIC_ORIGIN_DOMAIN || "arsalynk.com",
      customer_code: String(customerCode).trim(), // Kode customer (party_code) di Marka
      rating: Number(rating),                     // Angka integer 1 sampai 5
      feedback_text: String(feedbackText).trim(),
      feedback_type: "CUSTOMER_REVIEW",
      ...(isValidUuid ? { sales_order_id: String(salesOrderId).trim() } : {}),
    });

    return NextResponse.json({ success: true, message: "Feedback berhasil disimpan ke CRM" });
  } catch (err: any) {
    console.error("Gagal mengirim feedback ke Marka:", err);
    return NextResponse.json({ error: err.message || "Gagal memproses feedback" }, { status: 500 });
  }
}
```

---

## 8. Fitur 5: Approval Penawaran Harga (`quotation.decision`)

Jika Anda memiliki portal di mana pelanggan bisa mereview Surat Penawaran (Quotation) dan menekan tombol **"Setuju"** atau **"Tolak"**.

```typescript
// app/api/portal/quotation/decision/route.ts
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { sendMarkaEvent } from "@/lib/marka-crm";

export async function POST(req: NextRequest) {
  try {
    const { quotationId, decision, reason } = await req.json(); // decision: "ACCEPTED" | "REJECTED"

    const eventId = `qdec-${Date.now()}-${randomUUID().slice(0, 8)}`;

    await sendMarkaEvent(eventId, "quotation.decision", {
      quotation_id: quotationId,
      decision: decision, // "ACCEPTED" atau "REJECTED"
      ...(reason ? { reason } : {}),
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

---

## 9. Fitur 6: Menerima Webhook Balik dari Marka (Outbound)

Bagaimana jika staf CRM Marka membalas chat pelanggan, mengupdate status tiket, atau menyetujui quotation, dan website Anda ingin mengetahuinya secara real-time?

Gunakan **Outbound Webhook Subscription**:
1. Buka Marka: **Company & Access > Integrasi CRM > Tab "Langganan Webhook Keluar"**.
2. Masukkan URL endpoint website Anda (misal `https://website-anda.com/api/webhooks/marka`).
3. Pilih event (misal `ticket.status_updated`, `quotation.approved`, `message.reply_requested`).
4. Dapatkan **Subscription Secret**.

### Contoh Endpoint Penerima di Website Anda (Next.js)

```typescript
// app/api/webhooks/marka/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";

const OUTBOUND_SECRET = process.env.MARKA_OUTBOUND_SECRET!;

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signatureHeader = req.headers.get("x-marka-signature") || "";
  const timestamp = req.headers.get("x-marka-timestamp") || "";

  // 1. Verifikasi Signature dari Marka
  // Format: "v1\nPOST\n{timestamp}\n{rawBody}"
  const prefix = `v1\nPOST\n${timestamp}\n`;
  const expectedSignature = "sha256=" + createHmac("sha256", OUTBOUND_SECRET)
    .update(Buffer.from(prefix + rawBody, "utf8"))
    .digest("hex");

  try {
    const valid = timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expectedSignature));
    if (!valid) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: "Signature mismatch" }, { status: 401 });
  }

  // 2. Olah Data Event dari Marka
  const event = JSON.parse(rawBody);
  console.log("Menerima event dari Marka CRM:", event.event_type, event.data);

  if (event.event_type === "message.reply_requested") {
    // Staf Marka membalas chatbox! Teruskan balasan ke widget chat visitor
    // event.data = { thread_id, reply_text, replied_by }
  } else if (event.event_type === "ticket.status_updated") {
    // Status tiket berubah (misal RESOLVED, IN_PROGRESS)
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
```

---

## 10. Fitur 7: Portal Pelanggan Baca Data (Quotation & Tiket)

Jika website Anda memiliki portal login pelanggan dan Anda ingin menampilkan detail Quotation atau Tiket tanpa perlu menyimpan ulang data tersebut di database Anda:

Marka menyediakan endpoint portal publik yang diamankan dengan **Portal Scoped Token** (hanya bisa membaca data milik pelanggan tersebut):

```
GET https://api.marka-anda.com/api/v1/portal/quotations/:id
Headers:
  Authorization: Bearer <PORTAL_TOKEN>
```

```
GET https://api.marka-anda.com/api/v1/portal/tickets/:id
Headers:
  Authorization: Bearer <PORTAL_TOKEN>
```

Token ini dapat digenerate oleh backend Anda atau saat pelanggan membuka link penawaran yang dikirim via email.

---

## 11. Tabel Status HTTP & Troubleshooting

Saat server website Anda mengirim request ke `POST /api/v1/integrations/webhooks/events`, berikut arti responsnya:

| Status Code | Arti | Solusi untuk Developer |
|---|---|---|
| **`202 Accepted`** | **Sukses!** Payload valid dan masuk queue CRM Marka. | Lanjutkan alur aplikasi Anda. Tampilkan pesan sukses ke pengguna. |
| **`400 INVALID_FEEDBACK_EVENT`** | Payload feedback belum memenuhi kontrak. | Kirim `customer_code` (party_code customer Marka), rating integer 1–5, dan `feedback_text` (maksimal 2.000 karakter). Jika `sales_order_id` dikirim, harus format UUID. |
| **`400 CUSTOMER_PARTY_NOT_FOUND`** | Kode customer tidak ditemukan di Marka. | Pastikan `customer_code` sesuai dengan `party_code` customer aktif di company Marka terkait. |
| **`400 FEEDBACK_SALES_ORDER_NOT_FOUND`** | Sales Order ID tidak cocok dengan customer. | Pastikan `sales_order_id` adalah UUID valid dari Sales Order milik customer tersebut. Jika tidak tahu UUID-nya, kosongkan field ini. |
| **`400 Bad Request` (Umum)** | Data JSON tidak lengkap / schema salah. | Cek response body. Pastikan field wajib seperti `customer.name`, `customer.email`, `subject` terisi. |
| **`401 Unauthorized`** | Key ID atau Signature salah. | Cek `MARKA_CRM_SIGNING_SECRET`. Pastikan tidak ada spasi di `.env`. Pastikan urutan string prefix HMAC sama persis dengan rumus. |
| **`403 Forbidden`** | Domain website ditolak atau event dilarang. | Buka dashboard Marka > Integrasi CRM. Pastikan domain Anda ada di allowlist dan jenis event sudah dicentang. |
| **`429 Too Many Requests`** | Melebihi batas rate limit (burst request). | Lakukan retry dengan exponential backoff (sudah otomatis jika pakai helper di Bagian 3). |
| **`500 Internal Error`** | Kendala sementara di server Marka. | Helper function akan otomatis retry hingga 3x. |

---

## Ringkasan Alur Kerja Cepat Developer

1. Salin **4 variabel environment** dari dashboard Marka ke `.env` server website Anda.
2. Salin file helper `lib/marka-crm.ts` ke project Anda.
3. Hubungkan form/fitur website Anda:
   - Panggil `sendMarkaEvent(eventId, "inquiry.submitted", ...)` untuk form kontak.
   - Panggil `sendMarkaEvent(eventId, "message.received", ...)` untuk live chat.
   - Panggil `sendMarkaEvent(eventId, "ticket.created", ...)` untuk keluhan/tiket.
4. Uji coba kirim 1 data dari website Anda, lalu buka menu terkait di Marka (**Incoming Inquiry / Inbox / Tiket**) untuk melihat datanya langsung muncul!
