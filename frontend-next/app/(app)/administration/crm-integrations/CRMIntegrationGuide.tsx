"use client";

import { useState, type ReactNode } from "react";
import { 
  Check, 
  Clipboard, 
  ExternalLink, 
  ShieldCheck, 
  Code2, 
  Send, 
  MessageSquare, 
  LifeBuoy, 
  Star, 
  FileCheck2, 
  Radio, 
  Lock, 
  AlertCircle,
  HelpCircle,
  Terminal,
  Layers
} from "lucide-react";

// ==========================================
// CODE SNIPPETS
// ==========================================

const envExample = `# Simpan di .env server website / aplikasi Anda (bukan di frontend/browser)
MARKA_CRM_WEBHOOK_URL=https://api.marka-anda.com/api/v1/integrations/webhooks/events
MARKA_CRM_INTEGRATION_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
MARKA_CRM_KEY_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
MARKA_CRM_SIGNING_SECRET=kunci-secret-panjang-dari-dashboard-marka
PUBLIC_ORIGIN_DOMAIN=arsalynk.com`;

const typescriptHelper = `// lib/marka-crm.ts (Server-side only)
import { createHmac, randomBytes } from "node:crypto";

const MARKA_URL = process.env.MARKA_CRM_WEBHOOK_URL!;
const INTEGRATION_ID = process.env.MARKA_CRM_INTEGRATION_ID!;
const KEY_ID = process.env.MARKA_CRM_KEY_ID!;
const SIGNING_SECRET = process.env.MARKA_CRM_SIGNING_SECRET!;
const PATH = "/api/v1/integrations/webhooks/events";

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

  // Retry otomatis hingga 3 kali jika terjadi network timeout/glitch
  for (let attempt = 1; attempt <= 3; attempt++) {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = randomBytes(16).toString("hex");
    const prefix = \`v1\\nPOST\\n\${PATH}\\n\${timestamp}\\n\${nonce}\\n\`;
    
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

      if (response.status < 500 && response.status !== 408 && response.status !== 429) {
        const errText = await response.text();
        throw new Error(\`Marka ditolak (HTTP \${response.status}): \${errText}\`);
      }

      if (attempt === 3) throw new Error(\`Marka gagal setelah 3x retry: HTTP \${response.status}\`);
    } catch (error) {
      if (attempt === 3) throw error;
    }

    await new Promise((resolve) => setTimeout(resolve, 300 * Math.pow(2, attempt - 1)));
  }
}`;

const pythonHelper = `# marka_crm.py
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
    prefix = f"v1\\nPOST\\n/api/v1/integrations/webhooks/events\\n{timestamp}\\n{nonce}\\n".encode('utf-8')
    
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
        raise RuntimeError(f"Marka Error {res.status_code}: {res.text}")
    return res.json()`;

const phpHelper = `<?php
// marka_crm.php
function sendMarkaEvent(string $eventId, string $eventType, array $data, array $config): array {
    $payload = [
        'event_id' => $eventId,
        'event_type' => $eventType,
        'schema_version' => 1,
        'occurred_at' => gmdate('Y-m-d\\TH:i:s\\Z'),
        'timestamp' => time(),
        'data' => $data
    ];
    $body = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    $timestamp = (string) time();
    $nonce = bin2hex(random_bytes(16));
    $prefix = "v1\\nPOST\\n/api/v1/integrations/webhooks/events\\n{$timestamp}\\n{$nonce}\\n";
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

    if (!in_array($status, [200, 202], true)) {
        throw new RuntimeException("Marka Error {$status}: {$res}");
    }
    return json_decode($res, true);
}`;

const csharpHelper = `// MarkaCrmClient.cs (.NET 6+)
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

public class MarkaCrmClient {
    public static async Task<string> SendEventAsync(string eventId, string eventType, object data, dynamic config) {
        var payload = new {
            event_id = eventId,
            event_type = eventType,
            schema_version = 1,
            occurred_at = DateTime.UtcNow.ToString("o"),
            timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
            data
        };
        var bodyBytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(payload));
        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString();
        var nonce = Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).ToLowerInvariant();
        var prefix = Encoding.UTF8.GetBytes($"v1\\nPOST\\n/api/v1/integrations/webhooks/events\\n{timestamp}\\n{nonce}\\n");
        var signatureInput = prefix.Concat(bodyBytes).ToArray();
        var signature = Convert.ToHexString(HMACSHA256.HashData(Encoding.UTF8.GetBytes(config.SigningSecret), signatureInput)).ToLowerInvariant();

        using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(8) };
        using var req = new HttpRequestMessage(HttpMethod.Post, config.WebhookUrl);
        req.Content = new ByteArrayContent(bodyBytes);
        req.Content.Headers.ContentType = new MediaTypeHeaderValue("application/json");
        req.Headers.Add("X-Integration-Id", config.IntegrationId);
        req.Headers.Add("X-Integration-Key-Id", config.KeyId);
        req.Headers.Add("X-Integration-Timestamp", timestamp);
        req.Headers.Add("X-Integration-Nonce", nonce);
        req.Headers.Add("X-Integration-Signature", signature);

        var res = await client.SendAsync(req);
        if (!res.IsSuccessStatusCode)
            throw new Exception($"Marka HTTP {(int)res.StatusCode}: {await res.Content.ReadAsStringAsync()}");
        return await res.Content.ReadAsStringAsync();
    }
}`;

// FEATURES CODE
const contactCode = `// app/api/contact/route.ts (Next.js App Router Server Route)
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { sendMarkaEvent } from "@/lib/marka-crm";

export async function POST(req: NextRequest) {
  try {
    const { name, email, phone, subject, message, targetBudget } = await req.json();

    if (!name || !email || !subject) {
      return NextResponse.json({ error: "Nama, email, dan subjek wajib diisi" }, { status: 400 });
    }

    const eventId = \`inq-\${Date.now()}-\${randomUUID().slice(0, 8)}\`;

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
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}`;

const chatCode = `// app/api/chat/send/route.ts
import { NextRequest, NextResponse } from "next/server";
import { sendMarkaEvent } from "@/lib/marka-crm";

export async function POST(req: NextRequest) {
  try {
    const { visitorId, visitorName, messageId, messageText } = await req.json();

    if (!visitorId || !messageText) {
      return NextResponse.json({ error: "visitorId dan messageText wajib" }, { status: 400 });
    }

    // thread_id konsisten per visitor agar pesan masuk ke percakapan yang sama
    const threadId = \`webchat:\${visitorId}\`;
    const eventId = \`msg-\${messageId || Date.now()}\`;

    await sendMarkaEvent(eventId, "message.received", {
      origin_domain: process.env.PUBLIC_ORIGIN_DOMAIN || "arsalynk.com",
      thread_id: threadId,
      message_id: messageId || \`m-\${Date.now()}\`,
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
}`;

const ticketCode = `// app/api/support/ticket/route.ts
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { sendMarkaEvent } from "@/lib/marka-crm";

export async function POST(req: NextRequest) {
  try {
    const { subject, description, serialNumber, priority } = await req.json();

    const allowedPriorities = ["LOW", "NORMAL", "HIGH", "URGENT"];
    const normalizedPriority = priority === undefined ? "NORMAL" : String(priority).trim().toUpperCase();
    if (!allowedPriorities.includes(normalizedPriority)) {
      return NextResponse.json({ error: "Prioritas harus LOW, NORMAL, HIGH, atau URGENT" }, { status: 400 });
    }

    if (!subject || !description) {
      return NextResponse.json({ error: "Subjek dan keluhan wajib diisi" }, { status: 400 });
    }

    const eventId = \`tkt-\${Date.now()}-\${randomUUID().slice(0, 8)}\`;

    await sendMarkaEvent(eventId, "ticket.created", {
      origin_domain: process.env.PUBLIC_ORIGIN_DOMAIN || "arsalynk.com",
      subject: String(subject),
      description: String(description),
      priority: normalizedPriority,
      // serial_number opsional: jika dikirim, Marka memverifikasi garansi
      ...(serialNumber ? { serial_number: String(serialNumber).trim() } : {}),
    });

    return NextResponse.json({ success: true, message: "Tiket terdaftar di CRM" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}`;

const feedbackCode = `// app/api/feedback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { sendMarkaEvent } from "@/lib/marka-crm";

export async function POST(req: NextRequest) {
  try {
    const { customerCode, rating, feedbackText, salesOrderId } = await req.json();

    if (!customerCode || rating === undefined || rating === null) {
      return NextResponse.json({ error: "Kode Customer (customerCode) dan rating wajib" }, { status: 400 });
    }

    const eventId = \`fb-\${Date.now()}-\${randomUUID().slice(0, 8)}\`;

    // sales_order_id hanya dikirim jika valid UUID database Marka; jika tidak ada, biarkan kosong!
    const isValidUuid = salesOrderId && /^[0-9a-f-]{36}$/i.test(String(salesOrderId));

    await sendMarkaEvent(eventId, "feedback.submitted", {
      origin_domain: process.env.PUBLIC_ORIGIN_DOMAIN || "arsalynk.com",
      customer_code: String(customerCode).trim(), // party_code customer di Marka
      rating: Number(rating),                     // 1 sampai 5
      feedback_text: String(feedbackText || "").trim(),
      feedback_type: "CUSTOMER_REVIEW",
      ...(isValidUuid ? { sales_order_id: String(salesOrderId).trim() } : {}),
    });

    return NextResponse.json({ success: true, message: "Feedback berhasil disimpan" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}`;

const quotationCode = `// app/api/portal/quotation/decision/route.ts
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { sendMarkaEvent } from "@/lib/marka-crm";

export async function POST(req: NextRequest) {
  try {
    const { quotationCode, decision } = await req.json(); // quotationCode seperti QUO-7A91C2F0; decision: "ACCEPTED" | "REJECTED"

    if (!quotationCode || !["ACCEPTED", "REJECTED"].includes(decision)) {
      return NextResponse.json({ error: "Kode quotation dan keputusan wajib diisi" }, { status: 400 });
    }

    const eventId = \`qdec-\${Date.now()}-\${randomUUID().slice(0, 8)}\`;

    await sendMarkaEvent(eventId, "quotation.decision", {
      quotation_code: String(quotationCode).trim(), // Kode dokumen QUO-... yang dikirim ke klien
      decision: decision,
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}`;

const outboundReceiverCode = `// app/api/webhooks/marka/route.ts (Receiver Outbound dari Marka)
import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";

const OUTBOUND_SECRET = process.env.MARKA_OUTBOUND_SECRET!;

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signatureHeader = req.headers.get("x-marka-signature") || "";
  const timestamp = req.headers.get("x-marka-timestamp") || "";

  // 1. Verifikasi Signature HMAC Marka
  const prefix = \`v1\\nPOST\\n\${timestamp}\\n\`;
  const expectedSignature = "sha256=" + createHmac("sha256", OUTBOUND_SECRET)
    .update(Buffer.from(prefix + rawBody, "utf8"))
    .digest("hex");

  try {
    const valid = timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expectedSignature));
    if (!valid) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  } catch {
    return NextResponse.json({ error: "Signature mismatch" }, { status: 401 });
  }

  // 2. Olah Event
  const event = JSON.parse(rawBody);
  console.log("Notifikasi dari Marka:", event.event_type, event.data);

  if (event.event_type === "message.reply_requested") {
    // Balasan chat dari staf Marka -> teruskan ke widget visitor
  } else if (event.event_type === "ticket.status_updated") {
    // Update status tiket
  }

  return NextResponse.json({ received: true }, { status: 200 });
}`;

// ==========================================
// COMPONENTS
// ==========================================

function CodeBlock({ title, code, language = "typescript" }: { title: string; code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-[#24324B] bg-[#0F172A] shadow-md">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-[#1E293B] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Terminal size={14} className="text-blue-400" />
          <span className="font-mono text-xs font-semibold text-slate-200">{title}</span>
        </div>
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex items-center gap-1.5 rounded-md bg-white/5 px-2.5 py-1 text-xs font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
        >
          {copied ? <Check size={13} className="text-emerald-400" /> : <Clipboard size={13} />}
          {copied ? "Tersalin!" : "Salin"}
        </button>
      </div>
      <pre className="max-h-[500px] overflow-auto p-4 font-mono text-xs leading-6 text-slate-100">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function NoteBox({ children, tone = "blue" }: { children: ReactNode; tone?: "blue" | "amber" | "green" }) {
  const styles = {
    blue: "border-blue-200 bg-blue-50/70 text-blue-950",
    amber: "border-amber-200 bg-amber-50/70 text-amber-950",
    green: "border-emerald-200 bg-emerald-50/70 text-emerald-950",
  };
  return <div className={`rounded-xl border p-4 text-sm leading-6 ${styles[tone]}`}>{children}</div>;
}

function RequirementPanel({
  status,
  statusLabel,
  groups,
  limitation,
}: {
  status: "ready" | "partial";
  statusLabel: string;
  groups: Array<{ title: string; items: string[] }>;
  limitation?: string;
}) {
  const ready = status === "ready";
  return (
    <section className="rounded-xl border border-[#DCE5F2] bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h5 className="text-sm font-bold text-[#172033]">Kebutuhan integrasi</h5>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${ready ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${ready ? "bg-emerald-500" : "bg-amber-500"}`} />{statusLabel}
        </span>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {groups.map((group) => (
          <div key={group.title} className="rounded-lg bg-[#F8FAFC] p-3">
            <p className="text-xs font-bold text-[#334155]">{group.title}</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs leading-5 text-[#526176]">
              {group.items.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        ))}
      </div>
      {limitation && <div className="mt-3"><NoteBox tone="amber"><strong>Catatan kesiapan:</strong> {limitation}</NoteBox></div>}
    </section>
  );
}

export default function CRMIntegrationGuide() {
  const [langTab, setLangTab] = useState<"ts" | "py" | "php" | "cs">("ts");
  const [featureTab, setFeatureTab] = useState<"contact" | "chat" | "ticket" | "feedback" | "quotation" | "outbound">("contact");

  return (
    <div className="space-y-6">
      {/* HEADER BANNER */}
      <section className="relative overflow-hidden rounded-2xl border border-[#DCE5F2] bg-gradient-to-br from-white via-[#F8FAFC] to-[#EFF6FF] p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-lg bg-[#EAF6FF] px-2.5 py-1 text-xs font-bold text-[#2649B3]">
              <ShieldCheck size={14} /> DOKUMENTASI DEVELOPER EKSTERNAL
            </div>
            <h2 className="mt-2 text-xl font-bold text-[#172033]">
              Hubungkan Website &amp; Aplikasi Anda ke CRM Marka
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-[#64748B]">
              Panduan ini menunjukkan prasyarat, data wajib, dan hasil di Marka untuk setiap jenis integrasi. Aktifkan CRM dan daftarkan sumber integrasi terlebih dahulu; pengiriman dilakukan dari server website melalui <strong>HMAC-SHA256</strong>.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
              HTTP 202 Accepted Queue
            </span>
          </div>
        </div>

        {/* FLOW GRAPH */}
        <div className="mt-5 grid grid-cols-1 gap-2 rounded-xl border border-[#E2E8F0] bg-white p-3 text-xs md:grid-cols-3">
          <div className="flex items-center gap-2.5 rounded-lg bg-slate-50 p-2.5 font-medium text-slate-700">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold">1</span>
            Pengunjung submit Form / Chat di Web
          </div>
          <div className="flex items-center gap-2.5 rounded-lg bg-blue-50/70 p-2.5 font-medium text-blue-900">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-200 text-[10px] font-bold">2</span>
            Server Web Anda menandatangani HMAC
          </div>
          <div className="flex items-center gap-2.5 rounded-lg bg-emerald-50/70 p-2.5 font-medium text-emerald-900">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-200 text-[10px] font-bold">3</span>
            Marka CRM memvalidasi &amp; memproses di antrean
          </div>
        </div>
      </section>

      {/* STEP 1: CREDENTIALS */}
      <section className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#2649B3] text-xs font-bold text-white">
            1
          </span>
          <h3 className="text-base font-bold text-[#172033]">Ambil Kredensial &amp; Konfigurasi Server Website</h3>
        </div>
        <p className="mt-2 text-sm text-[#64748B]">
          Buka tab <strong>&quot;Landing page / aplikasi&quot;</strong> di halaman ini untuk membuat atau menyalin kredensial koneksi. Simpan nilai ini di file environment backend website Anda:
        </p>
        <div className="mt-3">
          <CodeBlock title=".env — Konfigurasi Environment Server Website" code={envExample} language="env" />
        </div>
        <div className="mt-3">
          <NoteBox tone="amber">
            <strong>Keamanan Kritis:</strong> Kredensial <code>MARKA_CRM_SIGNING_SECRET</code> hanya boleh disimpan di <strong>server-side</strong> (Next.js API route, Express, Laravel, FastAPI). Jangan pernah mengekspos secret ini ke browser atau repository publik.
          </NoteBox>
        </div>
      </section>

      {/* STEP 2: HELPER CODE */}
      <section className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#2649B3] text-xs font-bold text-white">
              2
            </span>
            <h3 className="text-base font-bold text-[#172033]">Helper Pengirim Event (Copy-Paste ke Proyek Anda)</h3>
          </div>
          {/* LANGUAGE SELECTOR */}
          <div className="flex rounded-lg border border-[#E2E8F0] bg-slate-50 p-1">
            {[
              { id: "ts", label: "Node.js / TypeScript" },
              { id: "py", label: "Python" },
              { id: "php", label: "PHP" },
              { id: "cs", label: "C# .NET" },
            ].map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setLangTab(id as any)}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                  langTab === id ? "bg-[#2649B3] text-white shadow-xs" : "text-[#64748B] hover:text-[#172033]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <p className="mt-2 text-sm text-[#64748B]">
          Fungsi helper ini otomatis menangani serialisasi body, pembuatan nonce unik, pembuatan signature HMAC-SHA256, dan mekanisme retry jika terjadi gangguan jaringan.
        </p>

        <div className="mt-4">
          {langTab === "ts" && <CodeBlock title="lib/marka-crm.ts (TypeScript / Next.js)" code={typescriptHelper} />}
          {langTab === "py" && <CodeBlock title="marka_crm.py (Python requests)" code={pythonHelper} />}
          {langTab === "php" && <CodeBlock title="marka_crm.php (PHP cURL)" code={phpHelper} />}
          {langTab === "cs" && <CodeBlock title="MarkaCrmClient.cs (C# .NET 6+)" code={csharpHelper} />}
        </div>
      </section>

      {/* STEP 3: FEATURES CATALOG */}
      <section className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#2649B3] text-xs font-bold text-white">
            3
          </span>
          <h3 className="text-base font-bold text-[#172033]">Implementasi per Fitur Website</h3>
        </div>
        <p className="mt-1 text-sm text-[#64748B]">
          Pilih item untuk melihat kebutuhan datanya, persiapan di Marka, dan hasil yang akan muncul. Saat ini tersedia lima alur masuk—chat, inquiry, tiket, feedback, dan keputusan quotation (dua event)—serta webhook notifikasi balik. Ini belum berarti sinkronisasi seluruh master data CRM.
        </p>

        {/* FEATURE TABS */}
        <div className="mt-4 flex flex-wrap gap-2">
          {[
            { id: "contact", label: "Form Contact Us / Leads", icon: Send, event: "inquiry.submitted" },
            { id: "chat", label: "Live Chat / Chatbox", icon: MessageSquare, event: "message.received" },
            { id: "ticket", label: "Tiket & Klaim Garansi", icon: LifeBuoy, event: "ticket.created" },
            { id: "feedback", label: "Feedback & Review CSAT", icon: Star, event: "feedback.submitted" },
            { id: "quotation", label: "Approval Penawaran", icon: FileCheck2, event: "quotation.decision" },
            { id: "outbound", label: "Terima Update dari Marka", icon: Radio, event: "Outbound Webhook" },
          ].map(({ id, label, icon: Icon, event }) => (
            <button
              key={id}
              type="button"
              onClick={() => setFeatureTab(id as any)}
              className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-semibold transition ${
                featureTab === id
                  ? "border-[#2649B3] bg-[#2649B3] text-white shadow-sm"
                  : "border-[#E2E8F0] bg-white text-[#475569] hover:bg-[#F8FAFC]"
              }`}
            >
              <Icon size={14} />
              <span>{label}</span>
              <span className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] ${featureTab === id ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"}`}>
                {event}
              </span>
            </button>
          ))}
        </div>

        {/* FEATURE DETAILS CONTENT */}
        <div className="mt-5 rounded-xl border border-[#DCE5F2] bg-[#F8FAFC] p-5">
          {featureTab === "contact" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-[#172033]">Formulir Kontak / Landing Page Inquiry</h4>
                  <p className="text-xs text-[#64748B]">
                    Hasil di Marka: Record langsung masuk ke <strong>CRM &gt; Incoming Inquiry</strong> dengan status <code>NEW</code>.
                  </p>
                </div>
                <span className="rounded-lg bg-blue-100 px-2.5 py-1 font-mono text-xs font-bold text-blue-800">
                  inquiry.submitted
                </span>
              </div>
              <RequirementPanel status="ready" statusLabel="Dapat menerima inquiry" groups={[
                { title: "Siapkan di Marka", items: ["Aktifkan modul CRM untuk company.", "Buat sumber integrasi dan aktifkan event inquiry.submitted.", "Opsional: pilih penanggung jawab awal CRM Lead/Sales dan izinkan domain website."] },
                { title: "Wajib dari formulir website", items: ["Nama klien, email valid, dan subjek inquiry.", "Kirim dari backend website; jangan letakkan signing secret di browser."] },
                { title: "Opsional", items: ["Nomor telepon, uraian kebutuhan, dan target budget."] },
                { title: "Hasil di Marka", items: ["Masuk ke CRM > Incoming Inquiry dengan status NEW.", "HTTP 202 berarti masuk antrean; worker memproses setelahnya."] },
              ]} />
              <CodeBlock title="app/api/contact/route.ts" code={contactCode} />
            </div>
          )}

          {featureTab === "chat" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-[#172033]">Widget Live Chat / Chatbox Website</h4>
                  <p className="text-xs text-[#64748B]">
                    Hasil di Marka: Muncul secara real-time di <strong>CRM &gt; Customer Inbox</strong>.
                  </p>
                </div>
                <span className="rounded-lg bg-blue-100 px-2.5 py-1 font-mono text-xs font-bold text-blue-800">
                  message.received
                </span>
              </div>
              <RequirementPanel status="ready" statusLabel="Dapat menerima chat masuk" groups={[
                { title: "Siapkan di Marka", items: ["Aktifkan sumber integrasi dengan event message.received.", "Izinkan domain widget jika payload mengirim origin_domain."] },
                { title: "Wajib per pesan", items: ["thread_id stabil untuk percakapan yang sama.", "message_id unik, message.type TEXT, dan message.text tidak kosong."] },
                { title: "Identitas pengirim", items: ["sender dapat berisi tipe dan nilai identitas serta nama tampilan.", "Tanpa identitas terverifikasi, pesan tetap dapat masuk sebagai pengunjung eksternal dan belum tentu terhubung ke master klien."] },
                { title: "Hasil di Marka", items: ["Masuk ke CRM > Customer Inbox; balasan dari Marka dapat dikirim balik memakai outbound webhook message.reply_requested."] },
              ]} />
              <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3 text-xs leading-5 text-blue-900">
                <strong>Tips Chat:</strong> Simpan <code>visitorId</code> di browser session/localStorage agar <code>thread_id</code> tetap konsisten selama visitor yang sama mengobrol.
              </div>
              <CodeBlock title="app/api/chat/send/route.ts" code={chatCode} />
            </div>
          )}

          {featureTab === "ticket" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-[#172033]">Form Tiket Dukungan &amp; Garansi Pelanggan</h4>
                  <p className="text-xs text-[#64748B]">
                    Hasil di Marka: Tiket masuk ke <strong>CRM &gt; Support &amp; Garansi</strong>.
                  </p>
                </div>
                <span className="rounded-lg bg-blue-100 px-2.5 py-1 font-mono text-xs font-bold text-blue-800">
                  ticket.created
                </span>
              </div>
              <RequirementPanel status="partial" statusLabel="Pembuatan masuk tersedia; pelacakan publik belum siap" groups={[
                { title: "Wajib saat membuat tiket", items: ["Subjek dan uraian keluhan.", "Payload saat ini tidak mengharuskan kode klien dan tiket belum otomatis terhubung ke master klien."] },
                { title: "Opsional", items: ["priority: LOW, NORMAL, HIGH, atau URGENT; jika tidak dikirim default NORMAL.", "serial_number; jika dikirim harus cocok dengan unit di company Marka agar pemeriksaan garansi dapat dilakukan."] },
                { title: "Hasil saat ini", items: ["Tiket dibuat di CRM > Support & Garansi setelah diproses worker.", "Webhook hanya mengembalikan event_id/accepted, bukan ID tiket dan token akses klien."] },
                { title: "Yang diperlukan untuk form cek status", items: ["Tautkan tiket ke klien memakai kode klien.", "Terbitkan ID tiket publik dan token akses, lalu sediakan alur lookup yang memakainya."] },
              ]} limitation="Form publik pada gambar meminta ID tiket dan token, tetapi alur ticket.created di Marka belum menerbitkan keduanya. Jangan menganggap pencarian status publik sudah berfungsi end-to-end." />
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-xs leading-5 text-emerald-900">
                <strong>Verifikasi Garansi:</strong> Jika menyertakan <code>serial_number</code>, sistem Marka otomatis mengecek status masa aktif garansi dari riwayat transaksi penjualan.
              </div>
              <CodeBlock title="app/api/support/ticket/route.ts" code={ticketCode} />
            </div>
          )}

          {featureTab === "feedback" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-[#172033]">Form Rating &amp; Review Kepuasan Pelanggan</h4>
                  <p className="text-xs text-[#64748B]">
                    Hasil di Marka: Tersimpan pada menu <strong>CRM &gt; Engagement</strong>.
                  </p>
                </div>
                <span className="rounded-lg bg-blue-100 px-2.5 py-1 font-mono text-xs font-bold text-blue-800">
                  feedback.submitted
                </span>
              </div>
              <RequirementPanel status="partial" statusLabel="Butuh field kode klien pada formulir" groups={[
                { title: "Wajib dari formulir", items: ["Kode klien customer_code yang sama dengan party_code customer aktif di company Marka.", "Rating bilangan bulat 1–5 dan feedback_text tidak kosong (maksimal 2.000 karakter)."] },
                { title: "Opsional", items: ["feedback_type.", "sales_order_id hanya jika UUID Marka yang valid dan order tersebut milik klien yang sama."] },
                { title: "Yang perlu disiapkan di Marka", items: ["Daftarkan klien di Master Rekanan sebagai Customer dan catat party_code-nya.", "Aktifkan feedback.submitted pada sumber integrasi."] },
                { title: "Hasil di Marka", items: ["Feedback tercatat di CRM > Engagement dan terhubung ke klien berdasarkan kode.", "Nama/email saja tidak cukup untuk mencocokkan feedback ke data klien secara andal."] },
              ]} limitation="Formulir pada gambar belum menampilkan field kode klien. Tambahkan input kode klien dan kirim nilainya sebagai customer_code; backend Marka sudah memvalidasi kode tersebut." />
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
                <strong>Aturan Identifikasi Customer &amp; Order:</strong>
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  <li>
                    <strong>Gunakan `customer_code`</strong> (misal <code>&quot;CUST-001&quot;</code>) yang sesuai dengan <code>party_code</code> di Marka. Website Anda tidak perlu mengetahui UUID internal database Marka!
                  </li>
                  <li>
                    <strong>`sales_order_id` adalah opsional</strong>: Hanya sertakan jika bernilai UUID Marka yang sah. <strong>JANGAN</strong> mengirimkan nomor dokumen (seperti <code>&quot;SO-2026-0042&quot;</code>); kosongkan saja jika tidak memiliki UUID.
                  </li>
                </ul>
              </div>
              <CodeBlock title="app/api/feedback/route.ts" code={feedbackCode} />
            </div>
          )}

          {featureTab === "quotation" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-[#172033]">Persetujuan Penawaran Harga (Quotation Approval)</h4>
                  <p className="text-xs text-[#64748B]">
                    Hasil di Marka: Status quotation di <strong>Sales &gt; Quotations</strong> berubah menjadi <code>ACCEPTED</code> atau <code>REJECTED</code>.
                  </p>
                </div>
                <span className="rounded-lg bg-blue-100 px-2.5 py-1 font-mono text-xs font-bold text-blue-800">
                  quotation.decision
                </span>
              </div>
              <RequirementPanel status="ready" statusLabel="Keputusan quotation tersedia" groups={[
                { title: "Wajib dikirim website", items: ["quotation_code yang terlihat di daftar Sales Quotations, contohnya QUO-7A91C2F0.", "Untuk quotation.decision, kirim decision ACCEPTED atau REJECTED. Event quotation.accepted selalu berarti ACCEPTED."] },
                { title: "Siapkan di Marka", items: ["Aktifkan event quotation.decision dan/atau quotation.accepted pada sumber integrasi.", "Setelah quotation dikirim, Marka menyertakan kode pada event quotation.ready agar website dapat menaruhnya di email klien."] },
                { title: "Hasil di Marka", items: ["Status quotation ditemukan memakai kode dokumen dan berubah sesuai keputusan klien.", "Penerimaan dapat melanjutkan proses deal won dan pembuatan project sesuai alur CRM."] },
                { title: "Privasi dan validasi", items: ["Kode dibatasi pada company sumber integrasi dan quotation harus berstatus SENT.", "UUID tetap dipakai internal oleh Marka; website tidak perlu mengirim UUID tersebut."] },
              ]} />
              <CodeBlock title="app/api/portal/quotation/decision/route.ts" code={quotationCode} />
            </div>
          )}

          {featureTab === "outbound" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-[#172033]">Menerima Notifikasi Balik dari Marka (Outbound Webhook)</h4>
                  <p className="text-xs text-[#64748B]">
                    Dipakai saat staf Marka membalas chat (<code>message.reply_requested</code>) atau mengubah status tiket (<code>ticket.status_updated</code>).
                  </p>
                </div>
                <span className="rounded-lg bg-violet-100 px-2.5 py-1 font-mono text-xs font-bold text-violet-800">
                  X-Marka-Signature
                </span>
              </div>
              <RequirementPanel status="ready" statusLabel="Notifikasi balik tersedia" groups={[
                { title: "Siapkan di Marka", items: ["Daftarkan endpoint penerima HTTPS pada Outbound Webhook.", "Pilih jenis event yang ingin diterima dan simpan secret signing di server website."] },
                { title: "Endpoint eksternal", items: ["Harus dapat menerima POST JSON dan memvalidasi signature Marka.", "Balas sukses setelah event tersimpan agar Marka tidak mengulang pengiriman."] },
                { title: "Jenis notifikasi", items: ["Balasan chat, pembaruan/resolusi tiket, status quotation, deal won, dan keputusan approval."] },
                { title: "Hasil", items: ["Website dapat memperbarui UI atau mengirim notifikasi ke klien berdasarkan status yang diterima."] },
              ]} />
              <CodeBlock title="app/api/webhooks/marka/route.ts" code={outboundReceiverCode} />
            </div>
          )}
        </div>
      </section>

      {/* STEP 4: HTTP STATUS & TROUBLESHOOTING */}
      <section className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <HelpCircle size={20} className="text-[#2649B3]" />
          <h3 className="text-base font-bold text-[#172033]">Tabel Status HTTP &amp; Penanganan Masalah (Troubleshooting)</h3>
        </div>
        <p className="mt-1 text-sm text-[#64748B]">
          Respons yang dikembalikan oleh endpoint <code>POST /api/v1/integrations/webhooks/events</code>:
        </p>

        <div className="mt-4 overflow-x-auto rounded-xl border border-[#E2E8F0]">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-[#F8FAFC] text-[11px] uppercase tracking-wider text-[#64748B]">
              <tr>
                <th className="px-4 py-3">Status Code</th>
                <th className="px-4 py-3">Arti / Gejala</th>
                <th className="px-4 py-3">Penyebab &amp; Solusi Developer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0] text-[#334155]">
              <tr>
                <td className="px-4 py-3 font-mono font-bold text-emerald-600">202 Accepted</td>
                <td className="px-4 py-3 font-medium">Sukses diterima antrean</td>
                <td className="px-4 py-3 text-[#475569]">Signature valid dan payload diterima worker CRM. Tampilkan notifikasi berhasil ke pengguna website Anda.</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-mono font-bold text-emerald-600">200 OK</td>
                <td className="px-4 py-3 font-medium">Event Duplikat (Idempoten)</td>
                <td className="px-4 py-3 text-[#475569]"><code>event_id</code> sudah pernah diterima sebelumnya. Tidak membuat duplikat di CRM.</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-mono font-bold text-amber-600">400 INVALID_FEEDBACK_EVENT</td>
                <td className="px-4 py-3 font-medium">Skema feedback tidak sesuai</td>
                <td className="px-4 py-3 text-[#475569]">Kirim <code>customer_code</code>, rating integer 1–5, dan teks ulasan. Jika <code>sales_order_id</code> dikirim, pastikan berupa format UUID.</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-mono font-bold text-amber-600">400 CUSTOMER_PARTY_NOT_FOUND</td>
                <td className="px-4 py-3 font-medium">Kode customer tidak dikenal</td>
                <td className="px-4 py-3 text-[#475569]">Pastikan nilai <code>customer_code</code> cocok dengan <code>party_code</code> customer aktif pada company Marka yang sesuai.</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-mono font-bold text-amber-600">400 FEEDBACK_SALES_ORDER_NOT_FOUND</td>
                <td className="px-4 py-3 font-medium">Order tidak cocok dengan customer</td>
                <td className="px-4 py-3 text-[#475569]">Sales Order ID bukan milik customer ini. Jika tidak yakin, hilangkan field <code>sales_order_id</code> dari payload.</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-mono font-bold text-rose-600">401 INVALID_SIGNATURE</td>
                <td className="px-4 py-3 font-medium">Otentikasi HMAC gagal</td>
                <td className="px-4 py-3 text-[#475569]">Periksa <code>MARKA_CRM_SIGNING_SECRET</code>. Pastikan byte JSON yang di-hash sama persis dengan byte yang dikirim di body HTTP.</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-mono font-bold text-rose-600">403 ORIGIN_DOMAIN_NOT_ALLOWED</td>
                <td className="px-4 py-3 font-medium">Domain tidak diizinkan</td>
                <td className="px-4 py-3 text-[#475569]">Daftarkan hostname domain website Anda pada allowlist di tab <strong>&quot;Landing page / aplikasi&quot;</strong>.</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-mono font-bold text-blue-600">429 Too Many Requests</td>
                <td className="px-4 py-3 font-medium">Batas rate limit tercapai</td>
                <td className="px-4 py-3 text-[#475569]">Lakukan retry otomatis dengan exponential backoff (sudah otomatis jika menggunakan helper code).</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
