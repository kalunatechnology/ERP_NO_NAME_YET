"use client";

import { useState } from "react";
import { ArrowLeft, CheckCircle2, Globe2, MessageCircle, Route } from "lucide-react";
import Link from "next/link";
import LandingPageIntegrationSettings from "./LandingPageIntegrationSettings";
import WhatsAppSettings from "@/app/(app)/crm/WhatsAppSettings";

const tabs = [
  { id: "landing", label: "Landing page / aplikasi", icon: Globe2 },
  { id: "whatsapp", label: "WhatsApp Business", icon: MessageCircle },
  { id: "guide", label: "Alur koneksi", icon: Route },
] as const;

export default function CRMIntegrationCenter() {
  const [active, setActive] = useState<(typeof tabs)[number]["id"]>("landing");
  return <div className="space-y-6">
    <div>
      <Link href="/administration" className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-[#64748B] hover:text-[#172033]"><ArrowLeft size={14}/> Company &amp; Access</Link>
      <h1 className="text-2xl font-bold text-[#172033]">Pengaturan Integrasi CRM</h1>
      <p className="mt-1 max-w-3xl text-sm leading-6 text-[#64748B]">Atur hubungan awal antara Marka dan kanal eksternal dari sini. Menyimpan pengaturan hanya menyiapkan koneksi di Marka; landing page belum berubah dan tidak akan mengirim data sebelum server luarnya dikonfigurasi.</p>
    </div>

    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950">
      <strong>Urutannya:</strong> pilih kanal → isi identitas dan routing → simpan → salin alamat/credential yang diberikan Marka → pasang konfigurasi di server kanal → kirim event uji.
    </div>

    <div className="overflow-x-auto rounded-2xl border border-[#E2E8F0] bg-white p-2 shadow-sm" role="tablist" aria-label="Pengaturan integrasi CRM">
      <div className="flex min-w-max gap-2">{tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" role="tab" aria-selected={active === id} onClick={() => setActive(id)} className={`inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition ${active === id ? "bg-[#2649B3] text-white shadow-sm" : "text-[#475569] hover:bg-[#F1F5F9]"}`}><Icon size={16}/>{label}</button>)}</div>
    </div>

    <div role="tabpanel">
      {active === "landing" && <LandingPageIntegrationSettings/>}
      {active === "whatsapp" && <WhatsAppSettings/>}
      {active === "guide" && <section className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-[#172033]">Bagaimana koneksi awal bekerja?</h2>
        <p className="mt-1 text-sm leading-6 text-[#64748B]">Marka menjadi tempat mengatur sumber, izin event, dan tujuan awal data. Sistem eksternal tetap perlu dikonfigurasi supaya benar-benar mengirim data.</p>
        <ol className="mt-5 space-y-4">{[
          ["1", "Daftarkan kanal", "Di tab Landing page / aplikasi, isi nama, kode unit bisnis, jenis event yang diizinkan, dan penanggung jawab CRM/Sales bila perlu."],
          ["2", "Simpan credential dengan aman", "Marka menampilkan URL webhook, Integration ID, Key ID, dan signing secret. Secret ditampilkan sekali; simpan di environment server landing page, jangan di browser."],
          ["3", "Atur server landing page", "Developer landing page perlu meneruskan formulir ke endpoint Marka dengan format event dan tanda tangan HMAC. Langkah ini belum otomatis dikerjakan oleh Marka."],
          ["4", "Uji alur dan pantau", "Kirim satu event uji dari server, lalu lihat percakapannya di CRM → Customer Inbox. Bila memakai WhatsApp Cloud API, atur callback Meta di tab WhatsApp Business."],
        ].map(([number, title, description]) => <li key={number} className="flex gap-3 rounded-xl border border-[#E2E8F0] p-4"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#EAF6FF] text-sm font-bold text-[#2649B3]">{number}</span><div><h3 className="font-semibold text-[#172033]">{title}</h3><p className="mt-1 text-sm leading-6 text-[#64748B]">{description}</p></div></li>)}</ol>
        <div className="mt-5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900"><CheckCircle2 size={17} className="mt-1 shrink-0"/><span><strong>Catatan:</strong> pengaturan ini menyiapkan sisi Marka. Koneksi baru dianggap aktif setelah konfigurasi sisi website/Meta selesai dan event uji berhasil masuk.</span></div>
      </section>}
    </div>
  </div>;
}
