"use client";

import { useState, type ReactNode } from "react";
import { Check, Clipboard, ExternalLink, ShieldCheck } from "lucide-react";

const inboundSender = `import { createHmac, randomBytes } from "node:crypto";

const MARKA_URL = process.env.MARKA_CRM_WEBHOOK_URL!;
const INTEGRATION_ID = process.env.MARKA_CRM_INTEGRATION_ID!;
const KEY_ID = process.env.MARKA_CRM_KEY_ID!;
const SIGNING_SECRET = process.env.MARKA_CRM_SIGNING_SECRET!;
const PATH = "/api/v1/integrations/webhooks/events";

export async function sendMarkaEvent(eventId: string, eventType: string, data: object) {
  // eventId harus berasal dari ID submission/outbox yang disimpan; jangan ganti saat retry.
  const occurredAt = new Date().toISOString();
  const body = JSON.stringify({
    event_id: eventId,
    event_type: eventType,
    schema_version: 1,
    occurred_at: occurredAt,
    timestamp: Math.floor(Date.now() / 1000),
    data,
  });

  for (let attempt = 1; attempt <= 3; attempt++) {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = randomBytes(16).toString("hex");
    const prefix = \`v1\\nPOST\\n\${PATH}\\n\${timestamp}\\n\${nonce}\\n\`;
    const signature = createHmac("sha256", SIGNING_SECRET)
      .update(Buffer.from(prefix, "utf8"))
      .update(Buffer.from(body, "utf8"))
      .digest("hex");

    let response: Response;
    try {
      response = await fetch(MARKA_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-Integration-Id": INTEGRATION_ID,
          "X-Integration-Key-Id": KEY_ID,
          "X-Integration-Timestamp": timestamp,
          "X-Integration-Nonce": nonce,
          "X-Integration-Signature": signature,
        },
        body,
        signal: AbortSignal.timeout(8000),
      });
    } catch (error) {
      if (attempt === 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** (attempt - 1)));
      continue;
    }

    if (response.status === 200 || response.status === 202) return response.json();
    if (response.status < 500 && response.status !== 408 && response.status !== 429) {
      throw new Error(\`Marka rejected event: HTTP \${response.status} \${await response.text()}\`);
    }
    if (attempt === 3) throw new Error(\`Marka unavailable after retries: HTTP \${response.status}\`);
    await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** (attempt - 1)));
  }
}`;

const contactRoute = `// app/api/contact/route.ts (Next.js App Router, server-side)
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { sendMarkaEvent } from "@/lib/marka-webhook";

export async function POST(request: NextRequest) {
  const form = await request.json();
  // Validasi input, rate limit dan CAPTCHA dilakukan sebelum meneruskan ke CRM.
  if (!form.name || !form.email || !form.subject) {
    return NextResponse.json({ error: "Data wajib belum lengkap" }, { status: 400 });
  }

  // Production: browser mengirim Idempotency-Key yang dibuat saat form pertama kali
  // disubmit. Website menyimpan key + payload di database/outbox dan memakai ulang
  // keduanya saat retry; jangan membuat randomUUID baru untuk retry submission yang sama.
  const eventId = request.headers.get("idempotency-key") || randomUUID();
  const result = await sendMarkaEvent(eventId, "inquiry.submitted", {
    // Hostname ditentukan konfigurasi server dan harus ada di allowlist source Marka.
    origin_domain: process.env.PUBLIC_ORIGIN_DOMAIN,
    customer: {
      name: String(form.name).slice(0, 200),
      email: String(form.email).slice(0, 320),
      phone: form.phone ? String(form.phone).slice(0, 40) : undefined,
    },
    requirements: {
      subject: String(form.subject).slice(0, 300),
      description: String(form.message || "").slice(0, 20000),
      ...(form.targetBudget ? { target_budget: Number(form.targetBudget) } : {}),
    },
  });

  return NextResponse.json({ accepted: true, event_id: result.event_id }, { status: 202 });
}

// Browser hanya POST ke /api/contact milik website sendiri.
// Browser tidak pernah menerima signing secret atau memanggil endpoint Marka.
// Di production, persist eventId/payload di outbox dan kirim asynchronous agar
// outage Marka tidak membuat lead Contact Us hilang.`;

const eventExamples = `// Pesan baru dari web chat atau WhatsApp (teks saja)
await sendMarkaEvent("arsalynk-webchat-msg-unique-456", "message.received", {
    "origin_domain": "arsalynk.com",
    "thread_id": "webchat:visitor-123",
    "message_id": "msg-unique-456",
    "sender": {
      "type": "EXTERNAL",
      "value": "website:visitor-123",
      "display_name": "Pengunjung Arsalynk"
    },
    "message": { "type": "TEXT", "text": "Saya ingin konsultasi layanan." }
});

// Tiket baru. Jika serial_number dikirim, serial harus dikenal Marka.
await sendMarkaEvent("arsalynk-ticket-request-789", "ticket.created", {
    "origin_domain": "arsalynk.com",
    "subject": "Permintaan dukungan",
    "description": "Deskripsikan masalah pelanggan",
    "serial_number": "SN-ARS-001"
});

// Feedback dari interface eksternal. Gunakan customer_code (party_code di Marka)
// untuk customer aktif pada company Integration Source ini.
await sendMarkaEvent("arsalynk-feedback-unique-101", "feedback.submitted", {
    "origin_domain": "arsalynk.com",
    "customer_code": "CUST-BRIDAK-058769",
    "rating": 5,
    "feedback_text": "Layanan cepat dan informatif.",
    "feedback_type": "CUSTOMER_REVIEW"
});

// Keputusan penawaran. quotation_id adalah UUID quotation Marka berstatus SENT.
await sendMarkaEvent("arsalynk-quotation-decision-321", "quotation.decision", {
  "quotation_id": "00000000-0000-4000-8000-000000000000",
  "decision": "ACCEPTED"
});`;

const outboundReceiver = `import { createHmac, timingSafeEqual } from "node:crypto";
import express from "express";

const app = express();
// Daftarkan route ini SEBELUM app.use(express.json()), atau gunakan raw parser
// khusus route. Signature dihitung dari byte body persis yang dikirim Marka.
app.post("/webhooks/marka", express.raw({ type: "application/json", limit: "1mb" }), async (req, res) => {
  const rawBody = req.body as Buffer;
  const timestamp = String(req.header("x-marka-timestamp") || "");
  const received = String(req.header("x-marka-signature") || "");
  const secret = process.env.MARKA_OUTBOUND_SIGNING_SECRET!;
  if (!/^\\d{10}$/.test(timestamp) || Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > 300) return res.sendStatus(401);
  const expected = "sha256=" + createHmac("sha256", secret)
    .update(\`v1\\nPOST\\n\${timestamp}\\n\`)
    .update(rawBody)
    .digest("hex");

  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return res.sendStatus(401);

  const event = JSON.parse(rawBody.toString("utf8"));
  if (req.header("x-marka-event-id") !== event.event_id) return res.sendStatus(401);
  // Simpan event_id dengan unique constraint sebelum memproses; Marka dapat retry.
  await saveWebhookEventOnce(event.event_id, event);
  return res.sendStatus(204); // 2xx = diterima; kerjakan proses berat di queue lokal.
});`;

const pythonSender = `import hashlib, hmac, json, secrets, time, requests

def send_marka_event(url, integration_id, key_id, secret, event):
    # Serialize once. Sign and send these exact bytes.
    body = json.dumps(event, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    timestamp = str(int(time.time()))
    nonce = secrets.token_hex(16)
    prefix = f"v1\\nPOST\\n/api/v1/integrations/webhooks/events\\n{timestamp}\\n{nonce}\\n".encode()
    signature = hmac.new(secret.encode(), prefix + body, hashlib.sha256).hexdigest()
    response = requests.post(url, data=body, headers={
        "Content-Type": "application/json",
        "X-Integration-Id": integration_id,
        "X-Integration-Key-Id": key_id,
        "X-Integration-Timestamp": timestamp,
        "X-Integration-Nonce": nonce,
        "X-Integration-Signature": signature,
    }, timeout=8)
    if response.status_code not in (200, 202):
        raise RuntimeError(f"Marka HTTP {response.status_code}: {response.text}")
    return response.json()`;

const phpSender = `<?php
function sendMarkaEvent(string $url, string $integrationId, string $keyId, string $secret, array $event): array {
    // Encode once; hash and send this exact body string.
    $body = json_encode($event, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    $timestamp = (string) time();
    $nonce = bin2hex(random_bytes(16));
    $prefix = "v1\\nPOST\\n/api/v1/integrations/webhooks/events\\n{$timestamp}\\n{$nonce}\\n";
    $signature = hash_hmac('sha256', $prefix . $body, $secret);

    $curl = curl_init($url);
    curl_setopt_array($curl, [
        CURLOPT_POST => true, CURLOPT_POSTFIELDS => $body, CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 8, CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'X-Integration-Id: ' . $integrationId, 'X-Integration-Key-Id: ' . $keyId,
            'X-Integration-Timestamp: ' . $timestamp, 'X-Integration-Nonce: ' . $nonce,
            'X-Integration-Signature: ' . $signature,
        ],
    ]);
    $responseBody = curl_exec($curl);
    $status = curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    if ($responseBody === false || !in_array($status, [200, 202], true)) {
        throw new RuntimeException('Marka HTTP ' . $status . ': ' . curl_error($curl));
    }
    curl_close($curl);
    return json_decode($responseBody, true, flags: JSON_THROW_ON_ERROR);
}`;

const csharpSender = `using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

// eventJson is serialized exactly once and these bytes are both signed and sent.
var bodyBytes = Encoding.UTF8.GetBytes(eventJson);
var timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString();
var nonce = Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).ToLowerInvariant();
var prefix = Encoding.UTF8.GetBytes($"v1\\nPOST\\n/api/v1/integrations/webhooks/events\\n{timestamp}\\n{nonce}\\n");
var signatureInput = prefix.Concat(bodyBytes).ToArray();
var signature = Convert.ToHexString(HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), signatureInput)).ToLowerInvariant();

using var request = new HttpRequestMessage(HttpMethod.Post, webhookUrl);
request.Content = new ByteArrayContent(bodyBytes);
request.Content.Headers.ContentType = new MediaTypeHeaderValue("application/json");
request.Headers.Add("X-Integration-Id", integrationId);
request.Headers.Add("X-Integration-Key-Id", keyId);
request.Headers.Add("X-Integration-Timestamp", timestamp);
request.Headers.Add("X-Integration-Nonce", nonce);
request.Headers.Add("X-Integration-Signature", signature);
using var response = await httpClient.SendAsync(request);
if (response.StatusCode is not (System.Net.HttpStatusCode.OK or System.Net.HttpStatusCode.Accepted))
    throw new HttpRequestException($"Marka HTTP {(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");`;

function CodeBlock({ title, code }: { title: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };
  return <div className="overflow-hidden rounded-xl border border-[#24324B] bg-[#111827]">
    <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2.5">
      <span className="text-xs font-semibold text-slate-200">{title}</span>
      <button type="button" onClick={() => void copy()} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-slate-300 hover:bg-white/10">
        {copied ? <Check size={13}/> : <Clipboard size={13}/>} {copied ? "Tersalin" : "Salin kode"}
      </button>
    </div>
    <pre className="max-h-[520px] overflow-auto p-4 text-xs leading-5 text-slate-100"><code>{code}</code></pre>
  </div>;
}

function Note({ children, tone = "blue" }: { children: ReactNode; tone?: "blue" | "amber" | "green" }) {
  const styles = {
    blue: "border-blue-200 bg-blue-50 text-blue-950",
    amber: "border-amber-200 bg-amber-50 text-amber-950",
    green: "border-emerald-200 bg-emerald-50 text-emerald-950",
  };
  return <div className={`rounded-xl border p-4 text-sm leading-6 ${styles[tone]}`}>{children}</div>;
}

export default function CRMIntegrationGuide() {
  return <div className="space-y-5">
    <section className="rounded-2xl border border-[#DCE5F2] bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-[#EAF6FF] p-2 text-[#2649B3]"><ShieldCheck size={20}/></div>
        <div><h2 className="text-lg font-bold text-[#172033]">Panduan menghubungkan landing page ke Marka</h2>
          <p className="mt-1 max-w-4xl text-sm leading-6 text-[#64748B]">Ikuti langkah dari pendaftaran koneksi di Marka, pemasangan kredensial di server landing page, sampai pengujian inquiry yang tampil di CRM. Bagian setelah panduan cepat menjelaskan contoh kode server dan pilihan integrasi lain.</p>
        </div>
      </div>
      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-[#E2E8F0] p-4"><h3 className="font-semibold text-[#172033]">A. Landing page → Marka</h3><p className="mt-1 text-sm leading-6 text-[#64748B]">Backend website meneruskan inquiry atau pesan memakai kredensial dan signature yang dibuat di Marka. Event masuk diproses oleh worker sebelum muncul di CRM.</p><p className="mt-2 text-xs font-semibold text-[#2649B3]">Formulir → Incoming Inquiry · Web chat → Customer Inbox</p></div>
        <div className="rounded-xl border border-[#E2E8F0] p-4"><h3 className="font-semibold text-[#172033]">B. Marka → sistem eksternal</h3><p className="mt-1 text-sm leading-6 text-[#64748B]">Saat status bisnis berubah, worker Marka memanggil URL penerima Anda dengan HMAC. Sistem penerima memvalidasi dan menyimpan event secara idempoten sebelum memperbarui portal atau notifikasi.</p><p className="mt-2 text-xs font-semibold text-[#2649B3]">Quotation · Ticket · Deal · Persetujuan</p></div>
      </div>
      <Note tone="amber"><strong>Rahasia dan batas sistem:</strong> semua signing secret hanya boleh berada di server/secret manager. Jangan masukkan ke JavaScript browser, HTML, Git, screenshot, atau log. HMAC membuktikan identitas aplikasi pengirim; itu tidak otomatis membuktikan bahwa pelanggan cocok dengan master customer Marka.</Note>
    </section>

    <section id="crm-landing-quickstart" className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5 shadow-sm">
      <h2 className="text-base font-bold text-[#172033]">Panduan cepat: sambungkan landing page</h2>
      <p className="mt-1 text-sm leading-6 text-[#64748B]">Kerjakan empat tahap ini bersama admin Marka dan pengembang website. Pengaturan di Marka menyiapkan identitas koneksi; pengiriman data baru aktif setelah backend landing page dipasang dan diuji.</p>
      <ol className="mt-4 grid gap-3 lg:grid-cols-2">
        {[
          ["1. Daftarkan koneksi di Marka", "Buka tab Landing page / aplikasi di halaman Pengaturan Integrasi CRM. Isi Kode sumber, Nama integrasi, ID akun eksternal, dan routing unit bisnis bila diperlukan. Pilih event sesuai kebutuhan: Inquiry, Pesan masuk, Tiket, Feedback / review pelanggan, atau keputusan quotation."],
          ["2. Batasi domain dan pilih event", "Isi Domain website yang diizinkan dengan hostname yang tepat, misalnya promo.arsalynk.com. Pilih hanya event yang dipakai. Domain pada payload harus cocok dengan allowlist; bila domain tidak diatur, website harus mengirim event tanpa origin_domain."],
          ["3. Simpan kredensial di server website", "Klik Buat koneksi landing page, lalu salin Webhook URL, Integration ID, Key ID, dan Signing Secret ke secret manager/environment backend website. Secret tampil sekali. Jangan menaruh secret di browser atau repository."],
          ["4. Pasang kode dan uji dari website", "Minta pengembang meneruskan submit form dari backend website ke Marka memakai contoh kode di bagian Kirim event. Kirim satu inquiry uji, tunggu worker memprosesnya, lalu periksa tab Incoming Inquiry di CRM. Web chat diuji pada Customer Inbox."],
        ].map(([title, body]) => <li key={title} className="rounded-xl border border-emerald-100 bg-white p-4"><h3 className="text-sm font-semibold text-[#172033]">{title}</h3><p className="mt-1 text-sm leading-6 text-[#64748B]">{body}</p></li>)}
      </ol>
      <Note tone="blue"><strong>Pembagian tugas:</strong> Company Admin mendaftarkan source, memilih event/domain, dan menjaga kredensial. Pengembang website memasang pemanggilan webhook di server landing page. Marka tidak mengubah website secara otomatis.</Note>
    </section>

    <section id='crm-integration-results' className='rounded-2xl border border-[#DCE5F2] bg-white p-5 shadow-sm'>
      <h2 className='text-base font-bold text-[#172033]'>Hasil koneksi: domain asal, inquiry, pesan, tiket, dan CSAT</h2>
      <p className='mt-1 text-sm leading-6 text-[#64748B]'>Gunakan panduan ini untuk memastikan event landing page tampil di bagian CRM yang tepat dan mengetahui tindakan admin berikutnya.</p>
      <div className='mt-4 grid gap-3 lg:grid-cols-2'>
        <article className='rounded-xl border border-sky-200 bg-sky-50/50 p-4'><h3 className='text-sm font-semibold text-[#172033]'>Domain asal website</h3><ol className='mt-2 space-y-1.5 text-xs leading-5 text-[#475569]'><li>1. Isi allowlist pada field <strong>Domain website yang diizinkan</strong> atau perbarui lewat tombol <strong>Domain</strong> pada source tersimpan.</li><li>2. Backend landing page mengirim <code>origin_domain</code> di dalam <code>data</code> untuk event inquiry, pesan, atau tiket.</li><li>3. Marka mencocokkan domain dengan allowlist. Domain tak terdaftar ditolak; jika allowlist kosong, kirim event tanpa domain.</li></ol><p className='mt-2 rounded-lg bg-white p-2 text-xs text-[#475569]'>Contoh hostname <code>promo.arsalynk.com</code> dikirim sebagai <code>{`"origin_domain": "promo.arsalynk.com"`}</code>. Tentukan nilai ini di server website, bukan dari input bebas browser.</p></article>
        <article className='rounded-xl border border-blue-200 bg-blue-50/50 p-4'><h3 className='text-sm font-semibold text-[#172033]'>Inquiry dari formulir website</h3><p className='mt-2 text-xs leading-5 text-[#475569]'>Event <code>inquiry.submitted</code> muncul di tab <strong>Incoming Inquiry</strong>, lengkap dengan nama/email, ringkasan kebutuhan, dan badge domain bila dikirim.</p><p className='mt-2 text-xs leading-5 text-[#475569]'>Admin meninjau isi inquiry, menautkan customer dari <strong>Accounts</strong> bila identitas sudah dipastikan, lalu memilih <strong>Jadikan opportunity</strong>. Event inquiry tidak otomatis membuat master customer atau opportunity.</p></article>
        <article className='rounded-xl border border-violet-200 bg-violet-50/50 p-4'><h3 className='text-sm font-semibold text-[#172033]'>Pesan web chat</h3><p className='mt-2 text-xs leading-5 text-[#475569]'>Event <code>message.received</code> masuk ke <strong>Customer Inbox</strong>. Admin dapat memfilter domain, menetapkan PIC, memverifikasi identitas, lalu mengubah percakapan menjadi inquiry.</p><p className='mt-2 text-xs leading-5 text-[#475569]'>Balasan staf memakai event <code>message.reply_requested</code>; adapter website/provider perlu meneruskannya ke kanal chat. Payload pesan saat ini berupa teks.</p></article>
        <article className='rounded-xl border border-amber-200 bg-amber-50/50 p-4'><h3 className='text-sm font-semibold text-[#172033]'>Tiket dan klaim garansi</h3><p className='mt-2 text-xs leading-5 text-[#475569]'>Event <code>ticket.created</code> muncul di <strong>Support &amp; Garansi</strong>. Untuk pemeriksaan garansi, serial number harus terdaftar pada riwayat transaksi company Marka. Work Order dapat dibuat setelah hasil pemeriksaan <code>WARRANTY_ACTIVE</code>.</p></article>
        <article className='rounded-xl border border-emerald-200 bg-emerald-50/50 p-4'><h3 className='text-sm font-semibold text-[#172033]'>Accounts, quotation, order, dan kontrak</h3><p className='mt-2 text-xs leading-5 text-[#475569]'>Tab <strong>Accounts</strong> mengelola rekanan melalui Tambah Rekanan/Edit. Buat estimate dan quotation di <strong>Estimating &amp; Quoting</strong>; quotation accepted dapat dikonversi menjadi Sales Order. Deal Won menjalankan pemeriksaan kredit.</p><p className='mt-2 text-xs leading-5 text-[#475569]'><strong>Contracts &amp; Orders</strong> menampilkan transaksi yang terbentuk dan menyediakan jalan pintas ke quotation/deals. Tab ini tidak membuat order manual yang melewati alur komersial.</p></article>
        <article className='rounded-xl border border-rose-200 bg-rose-50/50 p-4'><h3 className='text-sm font-semibold text-[#172033]'>Feedback dan CSAT</h3><p className='mt-2 text-xs leading-5 text-[#475569]'>Di <strong>Engagement</strong>, Tambah Feedback mencatat customer, rating 1–5, dan komentar. Sistem eksternal juga dapat mengirim <code>feedback.submitted</code> untuk customer Marka yang sudah dipetakan dan diverifikasi.</p><p className='mt-2 text-xs leading-5 text-[#475569]'>Catat CSAT Transaksi tersedia untuk Sales Order <code>FULFILLED</code> yang belum punya respons; satu respons per order. Form publik dan undangan otomatis belum tersedia.</p></article>
      </div>
      <Note tone='blue'><strong>Badge domain tidak terlihat?</strong> Record tanpa <code>origin_domain</code> tetap dapat masuk, tetapi tidak memiliki badge. Pilih <strong>Semua domain</strong> untuk melihat record domain maupun tanpa domain. Respons <code>202</code> berarti event diterima antrean; tunggu worker lalu gunakan Refresh Data CRM.</Note>
    </section>

    <nav aria-label="Navigasi panduan koneksi CRM" className="rounded-xl border border-[#DCE5F2] bg-[#F8FAFC] p-4">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[#64748B]">Langsung ke bagian</p>
      <div className="flex flex-wrap gap-2 text-xs font-semibold">
        <a href="#crm-landing-quickstart" className="rounded-lg border border-[#DCE5F2] bg-white px-3 py-2 text-[#2649B3] hover:bg-blue-50">Panduan cepat landing page</a>
        <a href="#crm-integration-results" className="rounded-lg border border-[#DCE5F2] bg-white px-3 py-2 text-[#2649B3] hover:bg-blue-50">Hasil di CRM &amp; CSAT</a>
        <a href="#crm-developer-maintenance" className="rounded-lg border border-[#DCE5F2] bg-white px-3 py-2 text-[#2649B3] hover:bg-blue-50">Panduan update developer</a>
        {[["#crm-setup", "1. Setup"], ["#crm-sender", "2. Kirim event"], ["#crm-events", "3. Jenis event"], ["#crm-coverage", "4. Cakupan semua fitur"], ["#crm-outbound", "5. Update keluar"], ["#crm-portal", "6. Portal"], ["#crm-e2e", "7. Uji end-to-end"], ["#crm-troubleshooting", "8. Troubleshooting"]].map(([href, label]) => <a key={href} href={href} className="rounded-lg border border-[#DCE5F2] bg-white px-3 py-2 text-[#2649B3] hover:bg-blue-50">{label}</a>)}
      </div>
    </nav>

    <section id="crm-setup" className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
      <h2 className="text-base font-bold text-[#172033]">1. Siapkan koneksi di Marka</h2>
      <ol className="mt-3 grid gap-3 md:grid-cols-2">
        {[
          ["Pastikan backend siap", "Sebelum membuat source atau koneksi WhatsApp, jalankan migrasi database yang sesuai dan atur CRM_INTEGRATION_ENCRYPTION_KEY sebagai Base64 dari 32 byte acak di backend. Gunakan nilai tetap yang sama di setiap instance; jangan simpan di browser atau Git."],
          ["Daftarkan source", "Di tab Landing page / aplikasi, pilih hanya event yang akan digunakan dan isi allowlist domain website bila ingin atribusi sumber. Hostname di payload harus terdaftar; source tanpa domain harus menerima event tanpa origin_domain. Pesan web/WA perlu message.received; formulir Contact Us perlu inquiry.submitted."],
          ["Simpan kredensial", "Simpan Webhook URL, Integration ID, Key ID, dan Signing Secret sekali tampil ke environment Production dan Preview yang benar."],
          ["Atur routing", "Pilih unit bisnis serta penanggung jawab bila dibutuhkan. Data pelanggan dari identitas eksternal tetap UNMATCHED sampai diverifikasi."],
          ["Siapkan HTTPS publik", "Server website harus dapat mengakses backend Marka lewat HTTPS. URL harus tepat /api/v1/integrations/webhooks/events tanpa query string."],
        ].map(([title, body], index) => <li key={title} className="flex gap-3 rounded-xl bg-[#F8FAFC] p-4"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#EAF6FF] text-sm font-bold text-[#2649B3]">{index + 1}</span><div><h3 className="text-sm font-semibold text-[#172033]">{title}</h3><p className="mt-1 text-sm leading-6 text-[#64748B]">{body}</p></div></li>)}
      </ol>
      <div className="mt-4 rounded-xl border border-[#E2E8F0] bg-slate-50 p-4">
        <h3 className="text-sm font-semibold text-[#172033]">Environment server website</h3>
        <pre className="mt-2 overflow-auto text-xs leading-5 text-slate-700"><code>{`MARKA_CRM_WEBHOOK_URL=https://api.marka-anda.com/api/v1/integrations/webhooks/events
MARKA_CRM_INTEGRATION_ID=<UUID dari Marka>
MARKA_CRM_KEY_ID=<key ID dari Marka>
MARKA_CRM_SIGNING_SECRET=<secret yang tampil sekali>
PUBLIC_ORIGIN_DOMAIN=arsalynk.com`}</code></pre>
        <p className="mt-2 text-xs leading-5 text-[#64748B]">Nilai <code>PUBLIC_ORIGIN_DOMAIN</code> dipakai contoh route Contact Us untuk mengisi <code>data.origin_domain</code>. Atur nilainya pada konfigurasi server masing-masing website/subdomain dan daftarkan hostname yang sama pada allowlist source Marka. Jangan meminta pelanggan mengisi domain ini pada form.</p>
      </div>
      <Note tone="blue"><strong>Kelola source:</strong> tombol <strong>Event</strong> dan <strong>Domain</strong> pada source terdaftar dapat memperbarui izin event/domain tanpa membuat secret baru. Secret tidak dapat dibaca kembali setelah pembuatan. Jika hilang, gunakan POST <code>/api/v1/core/integration-sources/:id/rotate-secret/</code> lalu simpan secret baru; key lama hanya diterima selama 24 jam. Status <code>SUSPENDED</code> bisa diaktifkan kembali, sedangkan <code>REVOKED</code> terminal dan memerlukan source baru.</Note>
    </section>

    <section id="crm-sender" className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
      <h2 className="text-base font-bold text-[#172033]">2. Buat satu pengirim event di backend website</h2>
      <p className="mt-1 text-sm leading-6 text-[#64748B]">Contoh berikut untuk Node.js/Next.js. Letakkan helper di folder server, panggil dari API route server setelah validasi form. Fungsi memakai body yang sama pada retry, nonce baru per percobaan, dan menunggu respons Marka.</p>
      <div className="mt-4"><CodeBlock title="lib/marka-webhook.ts — HMAC signer di server" code={inboundSender}/></div>
      <div className="mt-4"><CodeBlock title="API route Contact Us — inquiry.submitted" code={contactRoute}/></div>
      <details className="mt-4 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
        <summary className="cursor-pointer text-sm font-semibold text-[#172033]">Backend memakai Python, PHP, atau C#? Lihat contoh pengirim</summary>
        <p className="mt-2 text-xs leading-5 text-[#64748B]">Contoh ini menerima object event yang sudah dibentuk dan konfigurasi dari environment server. Python memerlukan package <code>requests</code>; PHP memakai ekstensi cURL; contoh C# memakai .NET 6+ dan instance <code>HttpClient</code>. Simpan event ke outbox dan pertahankan event_id/body yang sama untuk retry produksi.</p>
        <div className="mt-3 grid gap-3 xl:grid-cols-2">
          <CodeBlock title="Python — kirim event dengan requests" code={pythonSender}/>
          <CodeBlock title="PHP — kirim event dengan cURL" code={phpSender}/>
          <div className="xl:col-span-2"><CodeBlock title="C# .NET 6+ — kirim raw body dengan HttpClient" code={csharpSender}/></div>
        </div>
        <Note tone="amber"><strong>Yang harus sama:</strong> body UTF-8 yang ditandatangani harus byte yang dikirim. Saat retry, gunakan event_id/body yang sama, tetapi buat timestamp, nonce, dan signature baru. Jangan pernah menaruh secret di frontend/browser.</Note>
      </details>
      <Note><strong>Jangan kirim dari browser langsung ke Marka.</strong> Browser mengirim ke API website Anda. API server yang membaca secret, menyusun event, menghitung HMAC, dan memanggil Marka.</Note>
      <Note tone="green"><strong>Form Contact Us tetap harus menyimpan lead di website.</strong> Buat satu Idempotency-Key per submission, simpan bersama lead/outbox, lalu pakai ulang jika pengiriman ke Marka harus dicoba kembali. Pola ini mencegah duplikasi dan lead hilang ketika salah satu server sedang bermasalah.</Note>
    </section>

    <section id="crm-events" className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
      <h2 className="text-base font-bold text-[#172033]">3. Event masuk yang dapat digunakan</h2>
      <p className="mt-1 text-sm leading-6 text-[#64748B]">Setiap event memiliki pembungkus standar: <code>event_id</code> stabil, <code>event_type</code>, <code>schema_version: 1</code>, waktu kejadian, dan <code>data</code>. Untuk inquiry, pesan, atau tiket website, isi <code>data.origin_domain</code> dengan hostname yang terdaftar di allowlist source. <code>company_id</code> tidak perlu dikirim; Marka mengambil company dari Integration Source yang menandatangani request.</p>
      <div className="mt-4 overflow-x-auto rounded-xl border border-[#E2E8F0]"><table className="min-w-full text-left text-sm"><thead className="bg-[#F8FAFC] text-xs uppercase text-[#64748B]"><tr><th className="px-4 py-3">Event</th><th className="px-4 py-3">Hasil di Marka</th><th className="px-4 py-3">Field wajib/aturan</th></tr></thead><tbody className="divide-y divide-[#E2E8F0] text-[#334155]">
        {[
          ["inquiry.submitted", "Membuat Inquiry CRM", "customer.name, customer.email, requirements.subject; phone, description, target_budget opsional."],
          ["message.received", "Membuat/memperbarui percakapan Customer Inbox", "thread_id dan message_id stabil, message.type TEXT, message.text; sender opsional. Hanya teks."],
          ["ticket.created", "Membuat tiket Support", "subject dan description; serial_number opsional tetapi jika dikirim harus terdaftar pada company."],
          ["feedback.submitted", "Mencatat feedback di Engagement", "customer_code (party_code Marka) harus cocok dengan customer aktif di company source; rating 1–5; feedback_text wajib; sales_order_id opsional harus milik customer yang sama."],
          ["quotation.decision", "Menerima keputusan pelanggan", "quotation_id UUID yang berstatus SENT; decision ACCEPTED atau REJECTED. Accept menjalankan aturan Deal Won Marka."],
          ["quotation.accepted", "Shortcut keputusan Accept", "quotation_id quotation Marka berstatus SENT dan terhubung ke Opportunity."],
        ].map(([event, result, rules]) => <tr key={event}><td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-semibold text-[#2649B3]">{event}</td><td className="px-4 py-3">{result}</td><td className="min-w-[300px] px-4 py-3 text-xs leading-5">{rules}</td></tr>)}
      </tbody></table></div>
      <div className="mt-4"><CodeBlock title="Contoh payload message.received, ticket.created, feedback.submitted, dan quotation.decision" code={eventExamples}/></div>
      <div className="mt-4 rounded-xl border border-[#E2E8F0] p-4">
        <h3 className="text-sm font-semibold text-[#172033]">Pilih event sesuai bidang dan proses</h3>
        <div className="mt-3 overflow-x-auto"><table className="min-w-full text-left text-xs"><thead className="bg-[#F8FAFC] uppercase text-[#64748B]"><tr><th className="px-3 py-2">Sumber / bidang</th><th className="px-3 py-2">Koneksi yang umum</th><th className="px-3 py-2">Yang perlu dipastikan</th></tr></thead><tbody className="divide-y divide-[#E2E8F0] text-[#475569]">
          {[
            ["Website, landing page, iklan", "inquiry.submitted", "Validasi form, persetujuan kontak, anti-spam, dan event_id per submission."],
            ["E-commerce / marketplace", "inquiry.submitted; update status via outbound subscription", "Mapping ID customer/order, mata uang, SKU, dan aturan kapan order menjadi opportunity."],
            ["Service / helpdesk", "ticket.created", "Serial number harus sudah dikenal Marka dalam company yang aktif."],
            ["Web chat / WhatsApp adapter", "message.received; balasan melalui message.reply_requested", "ID thread dan pesan harus stabil; saat ini payload percakapan hanya menerima teks."],
            ["ERP / Finance / Procurement", "Outbound quotation, deal, atau approval", "Webhook memberi notifikasi perubahan; transaksi akuntansi tetap dikelola modul terkait."],
            ["Portal pelanggan", "Portal API token scoped", "Terbitkan token per customer; cek hak akses quotation sebelum accept/reject."],
          ].map(([system, pattern, requirement]) => <tr key={system}><td className="px-3 py-2 font-semibold">{system}</td><td className="px-3 py-2 font-mono">{pattern}</td><td className="min-w-[260px] px-3 py-2">{requirement}</td></tr>)}
        </tbody></table></div>
      </div>
      <Note tone="green"><strong>Idempotensi:</strong> buat <code>event_id</code> unik per event dan <code>message_id</code> stabil per pesan sumber. Pada retry, pertahankan ID dan body yang persis sama; buat timestamp header dan nonce baru. Respons <code>202</code> berarti diterima antrean, bukan berarti Inquiry langsung tampil sebelum worker memproses.</Note>
    </section>

    <section id="crm-coverage" className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
      <h2 className="text-base font-bold text-[#172033]">4. Peta lengkap fitur CRM dan koneksi eksternalnya</h2>
      <p className="mt-1 text-sm leading-6 text-[#64748B]">Tidak semua tindakan di CRM adalah webhook. Gunakan matriks ini untuk memilih integrasi yang sesuai dan mengetahui fitur yang tetap dikelola melalui API CRM atau proses internal Marka.</p>
      <div className="mt-4 overflow-x-auto rounded-xl border border-[#E2E8F0]"><table className="min-w-full text-left text-sm"><thead className="bg-[#F8FAFC] text-xs uppercase text-[#64748B]"><tr><th className="px-4 py-3">Area CRM</th><th className="px-4 py-3">Masuk dari sistem luar</th><th className="px-4 py-3">Keluar / baca dari sistem luar</th><th className="px-4 py-3">Batas dan tindak lanjut</th></tr></thead><tbody className="divide-y divide-[#E2E8F0] text-[#334155]">
        {[
          ["Dashboard & laporan CRM", "Tidak ada event dashboard khusus.", "Aplikasi terotorisasi dapat membaca endpoint CRM terkait melalui REST API.", "Ringkasan dashboard bukan endpoint webhook. Tentukan data dan company scope yang memang boleh dibaca."],
          ["Inquiry & qualification", "inquiry.submitted membuat inquiry berstatus NEW dari web form/marketing.", "Tidak ada outbound event khusus saat inquiry dikualifikasi.", "Nama/email masuk ke field inquiry; phone, description, dan target_budget dicatat sebagai konteks/description, bukan customer party/field anggaran terstruktur. Qualification dilakukan via POST /api/v1/crm/customer-inquiries/:id/qualify/. Inquiry dari Inbox memakai /api/v1/crm/conversations/:id/create-inquiry/."],
          ["Customer / Accounts & Customer 360", "Payload inquiry boleh membawa nama, email, telepon; identitas tidak otomatis membuat/mencocokkan master customer.", "API terotorisasi dapat membaca Customer 360 di /api/v1/crm/opportunities/:id/customer-360/.", "Cocokkan party secara eksplisit dan company-scoped. Inbox identity hanya ditautkan setelah POST /api/v1/crm/external-identities/:id/confirm-customer/."],
          ["Customer Inbox & percakapan", "message.received untuk teks; percakapan dikelompokkan per source + thread_id.", "message.reply_requested meminta adapter eksternal meneruskan balasan staf ke kanal asal.", "Adapter pertahankan thread_id/message_id. Assign, ignore/reopen, reply, confirm-customer, dan create-inquiry tersedia di /api/v1/crm/conversations/* melalui API CRM."],
          ["Sales pipeline, opportunity & deal", "quotation.decision / quotation.accepted dapat menjalankan alur deal dari quotation yang SENT.", "deal.won dikirim setelah alur Deal Won diproses; keputusan executive juga menghasilkan event.", "Opportunity/stage dikelola melalui REST terautentikasi. Mark lost: POST /api/v1/crm/opportunities/:id/mark-lost/. Tidak ada webhook inbound generik untuk mengubah stage."],
          ["Cost estimate & quotation", "Tidak ada inbound event untuk membuat estimate/baris atau quotation; keputusan quotation adalah inbound event yang didukung.", "quotation.ready, quotation.approved, quotation.accepted, quotation.rejected.", "Hitung estimate: POST /api/v1/crm/cost-estimates/:id/calculate/; buat quotation: POST /api/v1/crm/cost-estimates/:id/create-quotation/. Keputusan inbound hanya untuk quotation SENT terkait opportunity."],
          ["Credit & executive approval", "Tidak ada inbound event generik untuk mengubah credit limit, snapshot, atau approval.", "crm.executive_approval.decided dan handoff deal.won memberi notifikasi keputusan.", "Hitung snapshot: POST /api/v1/crm/credit-status-snapshots/calculate/. Override/approval perlu role yang berwenang; webhook tidak melewati approval."],
          ["Support, ticket & warranty", "ticket.created membuat service case; serial_number opsional tetapi harus ada pada company Marka.", "ticket.status_updated dan ticket.resolved dikirim saat aksi resolve yang didukung dijalankan.", "ticket.created tidak otomatis menautkan customer. Untuk party/serial dan operasi lengkap, gunakan POST /api/v1/service/cases; warranty: POST /api/v1/service/cases/:id/check-warranty; work order: POST /api/v1/service/cases/:id/work-orders; selesai: POST /api/v1/service/cases/:id/resolve. Tidak ada event warranty/work-order khusus."],
            ["Engagement, activity, survey & feedback", "feedback.submitted mencatat review customer aktif dengan rating 1–5 dan catatan; aktivitas/survey response umum belum memiliki event inbound.", "Tidak tersedia event outbound khusus untuk activity/survey/feedback.", "Feedback event memerlukan customer_code (party_code Marka) yang sudah dipetakan dan diverifikasi; sales_order_id opsional harus cocok dengan customer. CSAT khusus order FULFILLED tetap dicatat lewat CRM/API terautentikasi, satu respons per order. Form publik/undangan otomatis belum tersedia."],
          ["Orders, contracts & project handoff", "Tidak dibuat lewat event inbound generik; quotation accepted dapat memulai handoff bisnis.", "deal.won membawa keputusan handoff dan ID order/project/proforma jika sudah dibuat.", "Jika kredit aman, alur dapat membuat Sales Order dan Project; jika tertahan, membuat Proforma/Credit Hold. Data rinci dibaca dari modul Sales/Finance/Projects."],
          ["Portal pelanggan", "Portal token tidak menerima event tulis.", "Portal API membaca quotation/tiket yang dimiliki party token.", "Token scoped, customer-specific, dapat kedaluwarsa/dicabut, dan tidak boleh ditanam di browser publik."],
          ["WhatsApp Business", "Callback Meta memvalidasi challenge dan X-Hub-Signature-256; pesan teks masuk ke Inbox.", "Balasan dari Inbox belum dikirim langsung oleh konektor WhatsApp Marka.", "Kirim balasan melalui adapter outbound message.reply_requested. Media/template belum diproses oleh konektor langsung."],
        ].map(([area, inbound, outbound, limits]) => <tr key={area}><td className="min-w-[180px] px-4 py-3 font-semibold">{area}</td><td className="min-w-[250px] px-4 py-3 text-xs leading-5">{inbound}</td><td className="min-w-[250px] px-4 py-3 text-xs leading-5">{outbound}</td><td className="min-w-[280px] px-4 py-3 text-xs leading-5">{limits}</td></tr>)}
      </tbody></table></div>

      <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50/40 p-4">
        <h3 className="text-sm font-semibold text-[#172033]">Panduan implementasi untuk Engagement dan sistem non-landing-page</h3>
        <p className="mt-1 text-xs leading-5 text-[#64748B]">Pilih jalur berdasarkan sistem sumber dan tindakan yang dibutuhkan. Field domain hanya relevan untuk web yang ingin melacak hostname asal; aplikasi marketplace, helpdesk, ERP, atau WhatsApp tidak perlu mengirim <code>origin_domain</code> kecuali event memang berasal dari website tertentu.</p>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <article className="rounded-lg border border-white bg-white p-3"><h4 className="text-xs font-bold text-[#172033]">Feedback dan CSAT pasca transaksi</h4><ol className="mt-2 space-y-1.5 text-xs leading-5 text-[#475569]"><li>1. Review/feedback umum dapat dikirim sebagai event <code>feedback.submitted</code> lewat HMAC atau dicatat ke <code>POST /api/v1/crm/feedbacks/</code> dengan JWT dan company context. Event memakai <code>customer_code</code> (party_code Marka) milik customer aktif, rating 1–5, dan <code>feedback_text</code>; <code>sales_order_id</code> opsional harus milik customer yang sama.</li><li>2. CSAT transaksi memakai <code>POST /api/v1/crm/csat/responses</code> dengan body <code>{`{ "sales_order_id": "<UUID>", "rating": 5, "comments": "Pengiriman tepat waktu" }`}</code>. Hanya order <code>FULFILLED</code> yang diterima dan satu respons per order.</li><li>3. Event feedback tidak menggantikan CSAT order. Form publik, token survey customer, dan undangan otomatis belum tersedia. Untuk integrasi web, kirim dari backend tepercaya; jangan buka signing secret/JWT ke browser dan batasi submit ke customer/order yang telah diverifikasi.</li></ol><p className="mt-2 text-[11px] leading-5 text-[#64748B]">Kirim <code>origin_domain</code> hanya jika domain sudah tercantum di allowlist source. Pertahankan <code>event_id</code> yang sama untuk retry submission yang sama.</p></article>
          <article className="rounded-lg border border-white bg-white p-3"><h4 className="text-xs font-bold text-[#172033]">Aplikasi di luar landing page</h4><ul className="mt-2 space-y-1.5 text-xs leading-5 text-[#475569]"><li><strong>Marketplace/e-commerce:</strong> backend adapter mengirim <code>inquiry.submitted</code> untuk prospek atau memakai REST API Sales yang berizin untuk sinkronisasi transaksi; simpan pemetaan ID eksternal ↔ ID Marka.</li><li><strong>Helpdesk/service:</strong> kirim <code>ticket.created</code> untuk tiket teks sederhana; gunakan Service REST API bila perlu memilih customer, serial number, warranty, atau work order.</li><li><strong>ERP/finance:</strong> daftarkan outbound subscription agar ERP menerima perubahan quotation, deal, tiket, atau approval; transaksi keuangan tetap diproses oleh modulnya.</li><li><strong>WhatsApp:</strong> pilih konektor WhatsApp Business Cloud langsung di Marka atau adapter/provider milik perusahaan yang meneruskan event. Jangan gunakan kedua jalur untuk pesan/provider yang sama karena dapat menggandakan pesan.</li><li><strong>Portal/customer app:</strong> baca quotation/tiket dengan token portal terbatas per party; jangan pakai Integration Source secret atau JWT staf di aplikasi klien.</li></ul></article>
        </div>
        <Note tone="blue"><strong>Pilih autentikasi yang tepat:</strong> HMAC Integration Source digunakan untuk event inbound yang diizinkan (inquiry, message, ticket, dan keputusan quotation). REST CRM/Sales/Service memerlukan JWT dan hak akses/company context. Outbound subscription memakai signing secret tersendiri. Token portal hanya untuk baca data milik customer. Jangan mencampur kredensial atau mengirim data langsung dari browser publik.</Note>
      </div>

      <details className="mt-4 rounded-xl border border-[#E2E8F0] p-4">
        <summary className="cursor-pointer text-sm font-semibold text-[#172033]">Alur end-to-end yang umum: dari prospek menjadi pelanggan</summary>
        <ol className="mt-3 space-y-2 text-sm leading-6 text-[#475569]">
          <li><strong>1. Tangkap prospek:</strong> website/iklan mengirim inquiry.submitted. Marka menyimpan inquiry; integrasi tidak perlu membuat opportunity pada waktu yang sama.</li>
          <li><strong>2. Qualify dan tautkan customer:</strong> staf memvalidasi detail inquiry, mencocokkan customer/party bila ada, lalu mengubah inquiry menjadi opportunity melalui CRM. Sistem eksternal yang memakai REST harus memakai kredensial user/service account berizin dan company context.</li>
          <li><strong>3. Buat penawaran:</strong> tim sales mengisi estimate dan quotation dalam Marka. Sistem luar dapat menerima quotation.ready / quotation.approved melalui outbound subscription untuk memperbarui portal atau ERP.</li>
          <li><strong>4. Terima keputusan:</strong> portal atau sistem penjualan mengirim quotation.decision dengan UUID quotation Marka. Keputusan ACCEPTED hanya sah saat quotation berstatus SENT dan terhubung dengan opportunity; quotation.accepted adalah shortcut ACCEPTED.</li>
          <li><strong>5. Jalankan pemeriksaan deal:</strong> Marka memeriksa limit kredit dan piutang lewat jatuh tempo. Deal Won mengirim event deal.won; hasil handoff dapat berupa order/project atau Proforma/Credit Hold.</li>
          <li><strong>6. Layani customer:</strong> kanal chat mengirim message.received dan tiket mengirim ticket.created. Staf verifikasi identitas, membalas lewat adapter, memeriksa garansi, dan menyelesaikan tiket sesuai hak aksesnya.</li>
          <li><strong>7. Sinkronkan hasil:</strong> subscription outbound menyampaikan perubahan quotation, tiket, persetujuan, dan deal ke receiver eksternal. Receiver memvalidasi signature dan deduplikasi event_id sebelum memproses.</li>
        </ol>
      </details>

      <details className="mt-3 rounded-xl border border-[#E2E8F0] p-4">
        <summary className="cursor-pointer text-sm font-semibold text-[#172033]">Setup WhatsApp Business Cloud langsung di Marka</summary>
        <ol className="mt-3 space-y-2 text-sm leading-6 text-[#475569]">
          <li><strong>1.</strong> Siapkan Meta Business/WABA, nomor WhatsApp yang aktif, aplikasi Meta, access token dengan izin yang sesuai, dan endpoint backend Marka yang dapat diakses publik lewat HTTPS.</li>
          <li><strong>2.</strong> Buka tab <strong>WhatsApp Business</strong> di Pengaturan Integrasi CRM. Isi WABA ID, Phone Number ID, Graph API version, access token, Meta App Secret, dan Verify Token. Simpan, lalu gunakan tombol <strong>Uji koneksi Meta</strong>.</li>
          <li><strong>3.</strong> Daftarkan callback URL <code>https://&lt;domain-backend-marka&gt;/api/v1/integrations/whatsapp/webhook</code> di Meta Developers. Isi callback dengan Verify Token yang sama dan aktifkan subscription <code>messages</code> untuk WABA.</li>
          <li><strong>4.</strong> Kirim pesan uji dari nomor WhatsApp lain. Callback GET Meta memverifikasi challenge; POST memverifikasi <code>X-Hub-Signature-256</code> memakai App Secret. Marka memetakan WABA + Phone Number ID ke koneksi company lalu membuat event pesan untuk Inbox.</li>
        </ol>
        <Note tone="amber"><strong>Batas konektor langsung:</strong> hanya pesan teks yang diteruskan ke Inbox pada implementasi ini. Media, status pesan, template, dan pengiriman balasan belum ditangani langsung. Jika balasan staf harus terkirim ke WhatsApp, bangun adapter outbound untuk <code>message.reply_requested</code> atau gunakan middleware kanal yang sudah dimiliki perusahaan.</Note>
      </details>

      <Note tone="amber"><strong>Pemisahan autentikasi:</strong> Integration Source HMAC hanya menerima enam event inbound yang diaktifkan pada source dan didukung di bagian 3. Endpoint /api/v1/crm/* serta modul Sales/Service memerlukan JWT dengan izin dan company context yang sesuai. Outbound subscription memakai signing secret penerima tersendiri; Customer Portal memakai token party-scoped yang hanya untuk baca quotation/tiket. Keempat jenis kredensial ini tidak saling menggantikan. Jangan memakai akun staf pribadi sebagai credential production jangka panjang.</Note>
      <div className="mt-4 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
        <h3 className="text-sm font-semibold text-[#172033]">REST CRM terautentikasi yang umum dipakai adapter</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <ul className="space-y-1 text-xs leading-5 text-[#475569]"><li><code>/api/v1/crm/customer-inquiries/</code> — inquiry dan qualification</li><li><code>/api/v1/crm/opportunities/</code> — pipeline dan opportunity</li><li><code>/api/v1/crm/activities/</code> — telepon, meeting, follow-up</li><li><code>/api/v1/crm/cost-estimates/</code> — kalkulasi estimate dan create quotation</li><li><code>/api/v1/crm/executive-approvals/</code> — baca/putuskan approval sesuai role</li></ul>
          <ul className="space-y-1 text-xs leading-5 text-[#475569]"><li><code>/api/v1/crm/inbox/</code> dan <code>/api/v1/crm/conversations/</code> — percakapan</li><li><code>/api/v1/service/cases/</code> — tiket; termasuk check-warranty dan work-orders</li><li><code>/api/v1/sales/quotations/</code>, <code>/api/v1/sales/orders/</code> — dokumen sales</li><li><code>/api/v1/crm/opportunities/:id/customer-360/</code> — ringkasan hubungan customer</li><li><code>/api/v1/crm/feedbacks/</code>, <code>/api/v1/crm/surveys/</code> — survey dan feedback</li></ul>
        </div>
        <p className="mt-3 text-xs leading-5 text-[#64748B]">Daftar ini adalah REST API aplikasi yang tetap tunduk pada autentikasi, company scope, akses modul, dan role. Untuk event otomatis antarsistem, gunakan webhook HMAC/ subscription yang dijelaskan di bagian lain. Jangan memakai kredensial staf pribadi sebagai secret permanen untuk integrasi production.</p>
      </div>
    </section>

    <section id="crm-outbound" className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
      <h2 className="text-base font-bold text-[#172033]">5. Jika sistem eksternal perlu menerima update dari Marka</h2>
      <p className="mt-1 text-sm leading-6 text-[#64748B]">Buat endpoint penerima HTTPS di website, lalu daftarkan outbound subscription. Saat ini subscription outbound dikelola melalui API admin (Company Administrator + JWT Marka + <code>X-Company-ID</code>); tab pengaturan ini menyiapkan source inbound.</p>
      <div className="mt-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 text-sm leading-6 text-[#475569]">
        <p><strong>Buat subscription:</strong> <code>POST /api/v1/core/integration-sources/outbound-subscriptions</code></p>
        <p><strong>Body:</strong> <code>{`{ "name": "Arsalynk portal", "target_url": "https://www.arsalynk.com/api/webhooks/marka", "events": ["quotation.ready", "ticket.resolved", "deal.won"] }`}</code></p>
        <p><strong>Respons:</strong> simpan <code>signing_secret</code> satu kali di server website sebagai <code>MARKA_OUTBOUND_SIGNING_SECRET</code>.</p>
      </div>
      <div className="mt-4"><CodeBlock title="Endpoint penerima — validasi signature outbound Marka" code={outboundReceiver}/></div>
      <div className="mt-4 overflow-x-auto rounded-xl border border-[#E2E8F0]"><table className="min-w-full text-left text-sm"><thead className="bg-[#F8FAFC] text-xs uppercase text-[#64748B]"><tr><th className="px-4 py-3">Outbound event</th><th className="px-4 py-3">Dikirim ketika</th></tr></thead><tbody className="divide-y divide-[#E2E8F0] text-[#334155]">
        {[
          ["quotation.ready", "Staf mengirim quotation dari Marka."],
          ["quotation.approved", "Quotation lolos persetujuan internal."],
          ["quotation.accepted / quotation.rejected", "Keputusan quotation selesai diproses."],
          ["ticket.status_updated / ticket.resolved", "Tiket di-resolve dari Marka."],
          ["deal.won", "Opportunity melewati alur Deal Won."],
          ["crm.executive_approval.decided", "Persetujuan eksekutif diputuskan."],
          ["message.reply_requested", "Staf meminta pengiriman balasan; adapter website/kanal tetap perlu meneruskan pesan ke provider chat."],
        ].map(([event, when]) => <tr key={event}><td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-semibold text-[#2649B3]">{event}</td><td className="px-4 py-3 text-xs leading-5">{when}</td></tr>)}
      </tbody></table></div>
      <Note tone="amber"><strong>Signature outbound berbeda dari inbound.</strong> Outbound dihitung atas teks <code>v1\nPOST\n{`{timestamp}`}\n</code> lalu raw body; header-nya <code>X-Marka-Timestamp</code> dan <code>X-Marka-Signature: sha256=…</code>. Endpoint website harus merespons 2xx setelah menyimpan event. Marka mencoba ulang sampai 5 kali, kemudian delivery masuk DEAD_LETTER.</Note>
      <Note tone="blue"><strong>Jalur WhatsApp Arsalynk:</strong> jika WhatsApp saat ini terhubung dan dikelola oleh Arsalynk, webhook/provider tetap mengarah ke server Arsalynk, lalu Arsalynk meneruskan pesan masuk ke Marka sebagai <code>message.received</code>. Jangan arahkan callback provider yang sama langsung ke Marka sekaligus meneruskannya dari Arsalynk; pilih satu jalur agar pesan tidak tercatat dua kali. Balasan staf dari Marka membutuhkan adapter outbound yang meneruskan event <code>message.reply_requested</code> ke provider WhatsApp.</Note>
    </section>

    <section id="crm-portal" className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
      <h2 className="text-base font-bold text-[#172033]">6. Portal pelanggan: baca quotation dan status tiket</h2>
      <p className="mt-1 text-sm leading-6 text-[#64748B]">Untuk portal klien, jangan memakai JWT staf atau Integration Source secret. Admin Marka membuat token terbatas untuk satu customer/party; token hanya dapat membaca data milik party tersebut dan dapat dicabut.</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-[#E2E8F0] p-4"><h3 className="text-sm font-semibold text-[#172033]">Buat token (admin Marka)</h3><p className="mt-2 text-xs leading-5 text-[#64748B]">POST <code>/api/v1/crm/portal-tokens</code> dengan JWT admin dan <code>X-Company-ID</code>. Body: <code>{`{ "party_id": "<customer UUID>", "scopes": ["quotation:read", "ticket:read"], "expires_in_days": 90 }`}</code>. Simpan <code>api_key</code> satu kali di backend portal, bukan browser.</p></div>
        <div className="rounded-xl border border-[#E2E8F0] p-4"><h3 className="text-sm font-semibold text-[#172033]">Baca data milik pelanggan</h3><p className="mt-2 text-xs leading-5 text-[#64748B]">GET <code>/api/v1/portal/quotations/:id</code> atau <code>/api/v1/portal/tickets/:id</code> dengan <code>Authorization: Bearer &lt;portal_token&gt;</code>. Akses hanya berhasil jika quotation/tiket sudah ditautkan ke party pemilik token.</p></div>
      </div>
      <Note tone="amber"><strong>Keputusan Accept/Reject tetap perlu otorisasi website.</strong> Sebelum mengirim <code>quotation.decision</code>, portal harus memastikan pengguna login memang berhak atas quotation tersebut, lalu meminta konfirmasi eksplisit. API webhook mengautentikasi integrasi website; API itu tidak menggantikan pemeriksaan hak customer.</Note>
      <div className="mt-4 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
        <h3 className="text-sm font-semibold text-[#172033]">Kelola dan pantau koneksi outbound</h3>
        <ul className="mt-2 space-y-1 text-xs leading-5 text-[#64748B]">
          <li>Daftar: <code>GET /api/v1/core/integration-sources/outbound-subscriptions</code></li>
          <li>Jeda/aktifkan: <code>PATCH /api/v1/core/integration-sources/outbound-subscriptions/:id/status</code></li>
          <li>Delivery terbaru: <code>GET /api/v1/core/integration-sources/outbound-subscriptions/:id/deliveries</code></li>
          <li>Retry delivery dead-letter: <code>POST /api/v1/core/integration-sources/outbound-subscriptions/:id/deliveries/:deliveryId/retry</code></li>
        </ul>
      </div>
    </section>

    <section id="crm-e2e" className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
      <h2 className="text-base font-bold text-[#172033]">7. Uji dari ujung ke ujung</h2>
      <ol className="mt-3 space-y-3 text-sm leading-6 text-[#475569]">
        <li><strong>1.</strong> Pastikan source di Marka berstatus ACTIVE dan event yang diuji dicentang.</li>
        <li><strong>2.</strong> Kirim satu Contact Us atau pesan chat dari website. API website harus menerima request form lalu memanggil <code>sendMarkaEvent</code> dari server.</li>
        <li><strong>3.</strong> Pastikan backend Marka membalas <code>202</code> (atau <code>200</code> untuk duplikat).</li>
        <li><strong>4.</strong> Tunggu worker inbound, lalu buka CRM → Customer Inbox untuk chat atau tab Incoming Inquiry untuk inquiry form.</li>
        <li><strong>5.</strong> Untuk jalur balik, daftar subscription outbound, jalankan aksi bisnis di Marka, lalu cek delivery log dan event penerima website.</li>
      </ol>
      <div className="mt-4 overflow-x-auto rounded-xl border border-[#E2E8F0]"><table className="min-w-full text-left text-sm"><thead className="bg-[#F8FAFC] text-xs uppercase text-[#64748B]"><tr><th className="px-4 py-3">Respons</th><th className="px-4 py-3">Makna / tindak lanjut</th></tr></thead><tbody className="divide-y divide-[#E2E8F0] text-[#334155]">
        {[
          ["202", "Event baru tersimpan di antrean Marka."], ["200", "event_id dan payload sama sudah pernah diterima; tidak membuat duplikat."], ["400 / 422", "Periksa schema_version, allowed_event_types, tipe event, dan field wajib."], ["401", "Periksa raw body, HMAC, key ID, timestamp ±5 menit, nonce unik, dan secret."], ["403", "Source integrasi dijeda atau tidak aktif."], ["409", "event_id dipakai ulang dengan body berbeda; buat ID baru untuk payload baru."], ["503", "Marka belum memastikan event tersimpan; retry dengan event_id/body sama dan nonce, timestamp, serta signature baru."],
        ].map(([status, meaning]) => <tr key={status}><td className="px-4 py-3 font-mono text-xs font-semibold text-[#2649B3]">{status}</td><td className="px-4 py-3 text-xs leading-5">{meaning}</td></tr>)}
      </tbody></table></div>
      <a href="/crm" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#2649B3] hover:underline">Buka CRM Marka <ExternalLink size={14}/></a>
    </section>

    <section id="crm-troubleshooting" className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
      <h2 className="text-base font-bold text-[#172033]">8. Diagnosis masalah koneksi</h2>
      <p className="mt-1 text-sm leading-6 text-[#64748B]">Mulai dari status HTTP, kemudian periksa source, waktu server, dan byte body. Jangan mengirim secret melalui chat atau log untuk mendiagnosis masalah.</p>
      <div className="mt-4 overflow-x-auto rounded-xl border border-[#E2E8F0]"><table className="min-w-full text-left text-sm"><thead className="bg-[#F8FAFC] text-xs uppercase text-[#64748B]"><tr><th className="px-4 py-3">Gejala</th><th className="px-4 py-3">Penyebab umum</th><th className="px-4 py-3">Langkah perbaikan</th></tr></thead><tbody className="divide-y divide-[#E2E8F0] text-[#334155]">
        {[
          ["401 INVALID_SIGNATURE", "Secret/key ID salah atau body berubah setelah HMAC dihitung.", "Cocokkan key ID dengan source aktif. Serialize JSON sekali; hitung HMAC dan kirim byte body yang sama."],
          ["401 STALE_TIMESTAMP", "Jam server integrasi meleset atau antrean pengiriman terlalu lama.", "Sinkronkan NTP; buat timestamp baru setiap percobaan. Toleransi server Marka ±300 detik."],
          ["401 INVALID_NONCE / NONCE_REPLAY", "Nonce dipakai kembali atau tidak sesuai format.", "Buat nonce acak 16–128 karakter setiap percobaan, termasuk saat retry."],
          ["400 EVENT_TYPE_NOT_ALLOWED", "Event yang dikirim tidak dicentang pada source.", "Company Admin gunakan source dengan event yang diperlukan atau kirim tipe yang sudah diizinkan."],
          ["400 ORIGIN_DOMAIN_NOT_ALLOWED", "Hostname yang dikirim tidak tercantum di allowlist source.", "Samakan PUBLIC_ORIGIN_DOMAIN pada server website dengan hostname di field Domain website yang diizinkan. Periksa setiap subdomain sebagai hostname tersendiri."],
          ["400 INVALID_ORIGIN_DOMAIN", "Nilai domain tidak valid atau menyertakan path, port, query, maupun fragment.", "Kirim hostname publik, misalnya arsalynk.com. Tentukan nilainya dari konfigurasi server; jangan kirim URL halaman/form atau nilai bebas dari browser."],
          ["400 INVALID_INQUIRY_EVENT", "Customer/email/subject wajib kosong atau tidak valid.", "Periksa customer.name, format customer.email, dan requirements.subject pada payload."],
          ["400 INVALID_FEEDBACK_EVENT", "Payload feedback belum memenuhi kontrak event.", "Kirim customer_code (party_code Marka), rating integer 1–5, feedback_text maksimal 2.000 karakter; pastikan optional feedback_type dan sales_order_id valid."],
          ["400 CUSTOMER_PARTY_NOT_FOUND / FEEDBACK_SALES_ORDER_NOT_FOUND", "Kode customer tidak aktif/tidak ditemukan pada company source, atau order bukan milik customer tersebut.", "Gunakan customer_code yang sama dengan party_code customer Marka pada company source ini dan pastikan order terhubung ke customer yang sama."],
          ["422 UNSUPPORTED_MESSAGE_TYPE", "Payload chat membawa media atau type selain TEXT.", "Kirim teks yang dinormalisasi. Simpan pemrosesan media di adapter kanal eksternal."],
          ["503 CRM_INTEGRATION_NOT_CONFIGURED", "Kunci enkripsi server tidak ada atau bukan Base64 dari 32 byte.", "Atur CRM_INTEGRATION_ENCRYPTION_KEY pada backend, pastikan sama di semua instance, lalu restart. Jangan mengganti key yang telah mengenkripsi secret aktif."],
          ["Tidak ada update outbound", "Subscription nonaktif, event belum dipilih, atau receiver tidak membalas 2xx.", "Periksa company scope, event subscription, delivery log, TLS/DNS, firewall, dan log endpoint penerima."],
          ["Event PENDING / DEAD_LETTER", "Worker berhenti atau pemrosesan terus gagal.", "Periksa GET /api/v1/core/integration-sources/:id/events/ dan log backend/database. Setelah memperbaiki penyebab, retry dengan POST /api/v1/core/integration-sources/:id/events/:eventId/retry/. Pada serverless, siapkan scheduler worker terproteksi."],
        ].map(([symptom, cause, fix]) => <tr key={symptom}><td className="min-w-[190px] px-4 py-3 font-mono text-xs font-semibold text-[#2649B3]">{symptom}</td><td className="min-w-[220px] px-4 py-3 text-xs leading-5">{cause}</td><td className="min-w-[300px] px-4 py-3 text-xs leading-5">{fix}</td></tr>)}
      </tbody></table></div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Note tone="blue"><strong>Retry yang aman:</strong> untuk gangguan jaringan atau HTTP 503/408/429, pertahankan event_id dan body, tetapi buat timestamp, nonce, dan signature baru. Simpan event ke outbox sebelum mengirim agar tidak hilang saat website restart.</Note>
        <Note tone="amber"><strong>Data yang perlu dicatat:</strong> simpan status HTTP, event_id, integration source, waktu percobaan, dan error code. Jangan catat signing secret, token akses, atau payload pribadi pelanggan secara penuh.</Note>
      </div>
    </section>

    <section id='crm-developer-maintenance' className='rounded-2xl border border-[#DCE5F2] bg-white p-5 shadow-sm'>
      <h2 className='text-base font-bold text-[#172033]'>Panduan developer: menyesuaikan dan memperbarui integrasi</h2>
      <p className='mt-1 text-sm leading-6 text-[#64748B]'>Gunakan aturan ini saat menambah domain, mengubah form website, atau mengembangkan event agar konfigurasi Marka, kode landing page, dan tampilan CRM tetap selaras.</p>
      <div className='mt-4 grid gap-3 lg:grid-cols-2'>
        <article className='rounded-xl border border-sky-200 bg-sky-50/50 p-4'><h3 className='text-sm font-semibold text-[#172033]'>Jika menambah domain/subdomain</h3><ol className='mt-2 space-y-1.5 text-xs leading-5 text-[#475569]'><li>1. Daftarkan hostname pada allowlist source Marka; tiap subdomain adalah nilai tersendiri.</li><li>2. Atur <code>PUBLIC_ORIGIN_DOMAIN</code> di environment server deployment yang sesuai.</li><li>3. Pastikan server mengirim hostname yang sama pada <code>data.origin_domain</code>.</li><li>4. Uji event dan pastikan badge domain tampil pada tab CRM yang tepat.</li></ol><p className='mt-2 text-xs leading-5 text-[#64748B]'>Satu backend yang melayani beberapa host harus memakai pemetaan host-ke-domain yang dikontrol server dan divalidasi terhadap allowlist; jangan mempercayai header/browser secara langsung.</p></article>
        <article className='rounded-xl border border-emerald-200 bg-emerald-50/50 p-4'><h3 className='text-sm font-semibold text-[#172033]'>Jika field form website berubah</h3><ul className='mt-2 space-y-1.5 text-xs leading-5 text-[#475569]'><li>Petakan nama/email/telepon ke <code>data.customer</code>.</li><li>Petakan judul ke <code>data.requirements.subject</code>; deskripsi dan target budget mengikuti kontrak event inquiry.</li><li>Bentuk payload dan HMAC di backend website setelah validasi form dan kontrol anti-spam.</li><li>Simpan submission dan <code>event_id</code> pada outbox agar retry tidak membuat record ganda.</li></ul></article>
      </div>
      <div className='mt-4 rounded-xl border border-[#E2E8F0] p-4'><h3 className='text-sm font-semibold text-[#172033]'>Checklist saat menambah event atau field CRM</h3><ol className='mt-2 grid gap-2 text-xs leading-5 text-[#475569] md:grid-cols-2'><li>1. Tentukan kontrak event, field wajib, validasi, dan source/company scope.</li><li>2. Tambahkan pilihan event pada <code>LandingPageIntegrationSettings.tsx</code> jika admin perlu mengaktifkannya.</li><li>3. Selaraskan allowlist dan validasi pada integration routes/service backend.</li><li>4. Implementasikan pemrosesan, deduplikasi, dan penyimpanan pada worker; tambahkan schema/migrasi bila perlu.</li><li>5. Hubungkan record ke API CRM dan tambahkan tampilan/filter/badge bila diperlukan.</li><li>6. Perbarui contoh payload, environment, tes end-to-end, dan troubleshooting dalam panduan ini.</li></ol></div>
      <Note tone='amber'><strong>Jangan hanya mengubah contoh dokumentasi.</strong> Event baru harus diizinkan oleh source, dikenali backend, dan diproses worker sebelum dapat dipakai. Pertahankan kontrak lama selama masa migrasi website, lalu uji di staging sebelum mengubah production.</Note>
    </section>
  </div>;
}
