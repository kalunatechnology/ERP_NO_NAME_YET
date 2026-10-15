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
    "subject": "Permintaan dukungan",
    "description": "Deskripsikan masalah pelanggan",
    "serial_number": "SN-ARS-001"
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
        <div><h2 className="text-lg font-bold text-[#172033]">Panduan integrasi website eksternal ke CRM Marka</h2>
          <p className="mt-1 max-w-4xl text-sm leading-6 text-[#64748B]">Gunakan halaman ini sebagai acuan perubahan di Arsalynk atau website lain. Marka menerima event melalui endpoint yang sama; setiap aplikasi luar cukup membuat adapter kecil di servernya. Koneksi menjadi dua arah setelah endpoint penerima di website dan subscription outbound Marka juga disiapkan.</p>
        </div>
      </div>
      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-[#E2E8F0] p-4"><h3 className="font-semibold text-[#172033]">A. Website → Marka</h3><p className="mt-1 text-sm leading-6 text-[#64748B]">Website mengirim form, chat, tiket, atau keputusan quotation dengan HMAC. Marka memasukkan event ke antrean dan memprosesnya di CRM.</p><p className="mt-2 text-xs font-semibold text-[#2649B3]">Contact Us · ArsAI · WhatsApp · Support · Portal</p></div>
        <div className="rounded-xl border border-[#E2E8F0] p-4"><h3 className="font-semibold text-[#172033]">B. Marka → Website</h3><p className="mt-1 text-sm leading-6 text-[#64748B]">Saat status bisnis berubah, worker Marka memanggil URL penerima website dengan HMAC. Website memvalidasi, menyimpan event secara idempoten, lalu memperbarui portal/notifikasi.</p><p className="mt-2 text-xs font-semibold text-[#2649B3]">Quotation · Ticket · Deal · Persetujuan</p></div>
      </div>
      <Note tone="amber"><strong>Rahasia dan batas sistem:</strong> semua signing secret hanya boleh berada di server/secret manager. Jangan masukkan ke JavaScript browser, HTML, Git, screenshot, atau log. HMAC membuktikan identitas aplikasi pengirim; itu tidak otomatis membuktikan bahwa pelanggan cocok dengan master customer Marka.</Note>
    </section>

    <section className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
      <h2 className="text-base font-bold text-[#172033]">1. Siapkan koneksi di Marka</h2>
      <ol className="mt-3 grid gap-3 md:grid-cols-2">
        {[
          ["Daftarkan source", "Di tab Landing page / aplikasi, pilih hanya event yang akan digunakan. Pesan web/WA perlu message.received; formulir Contact Us perlu inquiry.submitted."],
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
MARKA_CRM_SIGNING_SECRET=<secret yang tampil sekali>`}</code></pre>
      </div>
    </section>

    <section className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
      <h2 className="text-base font-bold text-[#172033]">2. Buat satu pengirim event di backend website</h2>
      <p className="mt-1 text-sm leading-6 text-[#64748B]">Contoh berikut untuk Node.js/Next.js. Letakkan helper di folder server, panggil dari API route server setelah validasi form. Fungsi memakai body yang sama pada retry, nonce baru per percobaan, dan menunggu respons Marka.</p>
      <div className="mt-4"><CodeBlock title="lib/marka-webhook.ts — HMAC signer di server" code={inboundSender}/></div>
      <div className="mt-4"><CodeBlock title="API route Contact Us — inquiry.submitted" code={contactRoute}/></div>
      <Note><strong>Jangan kirim dari browser langsung ke Marka.</strong> Browser mengirim ke API website Anda. API server yang membaca secret, menyusun event, menghitung HMAC, dan memanggil Marka.</Note>
      <Note tone="green"><strong>Form Contact Us tetap harus menyimpan lead di website.</strong> Buat satu Idempotency-Key per submission, simpan bersama lead/outbox, lalu pakai ulang jika pengiriman ke Marka harus dicoba kembali. Pola ini mencegah duplikasi dan lead hilang ketika salah satu server sedang bermasalah.</Note>
    </section>

    <section className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
      <h2 className="text-base font-bold text-[#172033]">3. Event masuk yang dapat digunakan</h2>
      <p className="mt-1 text-sm leading-6 text-[#64748B]">Setiap event memiliki pembungkus standar: <code>event_id</code> stabil, <code>event_type</code>, <code>schema_version: 1</code>, waktu kejadian, dan <code>data</code>. <code>company_id</code> tidak perlu dikirim; Marka mengambil company dari Integration Source yang menandatangani request.</p>
      <div className="mt-4 overflow-x-auto rounded-xl border border-[#E2E8F0]"><table className="min-w-full text-left text-sm"><thead className="bg-[#F8FAFC] text-xs uppercase text-[#64748B]"><tr><th className="px-4 py-3">Event</th><th className="px-4 py-3">Hasil di Marka</th><th className="px-4 py-3">Field wajib/aturan</th></tr></thead><tbody className="divide-y divide-[#E2E8F0] text-[#334155]">
        {[
          ["inquiry.submitted", "Membuat Inquiry CRM", "customer.name, customer.email, requirements.subject; phone, description, target_budget opsional."],
          ["message.received", "Membuat/memperbarui percakapan Customer Inbox", "thread_id dan message_id stabil, message.type TEXT, message.text; sender opsional. Hanya teks."],
          ["ticket.created", "Membuat tiket Support", "subject dan description; serial_number opsional tetapi jika dikirim harus terdaftar pada company."],
          ["quotation.decision", "Menerima keputusan pelanggan", "quotation_id UUID yang berstatus SENT; decision ACCEPTED atau REJECTED. Accept menjalankan aturan Deal Won Marka."],
          ["quotation.accepted", "Shortcut keputusan Accept", "quotation_id quotation Marka berstatus SENT dan terhubung ke Opportunity."],
        ].map(([event, result, rules]) => <tr key={event}><td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-semibold text-[#2649B3]">{event}</td><td className="px-4 py-3">{result}</td><td className="min-w-[300px] px-4 py-3 text-xs leading-5">{rules}</td></tr>)}
      </tbody></table></div>
      <div className="mt-4"><CodeBlock title="Contoh payload message.received, ticket.created, dan quotation.decision" code={eventExamples}/></div>
      <Note tone="green"><strong>Idempotensi:</strong> buat <code>event_id</code> unik per event dan <code>message_id</code> stabil per pesan sumber. Pada retry, pertahankan ID dan body yang persis sama; buat timestamp header dan nonce baru. Respons <code>202</code> berarti diterima antrean, bukan berarti Inquiry langsung tampil sebelum worker memproses.</Note>
    </section>

    <section className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
      <h2 className="text-base font-bold text-[#172033]">4. Jika website perlu menerima update dari Marka</h2>
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

    <section className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
      <h2 className="text-base font-bold text-[#172033]">5. Portal pelanggan: baca quotation dan status tiket</h2>
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

    <section className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
      <h2 className="text-base font-bold text-[#172033]">6. Uji dari ujung ke ujung</h2>
      <ol className="mt-3 space-y-3 text-sm leading-6 text-[#475569]">
        <li><strong>1.</strong> Pastikan source di Marka berstatus ACTIVE dan event yang diuji dicentang.</li>
        <li><strong>2.</strong> Kirim satu Contact Us atau pesan chat dari website. API website harus menerima request form lalu memanggil <code>sendMarkaEvent</code> dari server.</li>
        <li><strong>3.</strong> Pastikan backend Marka membalas <code>202</code> (atau <code>200</code> untuk duplikat).</li>
        <li><strong>4.</strong> Tunggu worker inbound, lalu buka CRM → Customer Inbox untuk chat atau tab Incoming Inquiry untuk inquiry form.</li>
        <li><strong>5.</strong> Untuk jalur balik, daftar subscription outbound, jalankan aksi bisnis di Marka, lalu cek delivery log dan event penerima website.</li>
      </ol>
      <div className="mt-4 overflow-x-auto rounded-xl border border-[#E2E8F0]"><table className="min-w-full text-left text-sm"><thead className="bg-[#F8FAFC] text-xs uppercase text-[#64748B]"><tr><th className="px-4 py-3">Respons</th><th className="px-4 py-3">Makna / tindak lanjut</th></tr></thead><tbody className="divide-y divide-[#E2E8F0] text-[#334155]">
        {[
          ["202", "Event baru tersimpan di antrean Marka."], ["200", "event_id dan payload sama sudah pernah diterima; tidak membuat duplikat."], ["401", "Periksa raw body, HMAC, key ID, timestamp ±5 menit, nonce unik, dan secret."], ["403", "Source integrasi dijeda atau tidak aktif."], ["409", "event_id dipakai ulang dengan body berbeda; buat ID baru untuk payload baru."], ["400 / 422", "Periksa schema_version, allowed_event_types, event_type, dan field wajib."],
        ].map(([status, meaning]) => <tr key={status}><td className="px-4 py-3 font-mono text-xs font-semibold text-[#2649B3]">{status}</td><td className="px-4 py-3 text-xs leading-5">{meaning}</td></tr>)}
      </tbody></table></div>
      <a href="/crm" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#2649B3] hover:underline">Buka CRM Marka <ExternalLink size={14}/></a>
    </section>
  </div>;
}
