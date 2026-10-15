"use client";

import { useState } from "react";
import { ArrowLeft, Globe2, MessageCircle, Route } from "lucide-react";
import Link from "next/link";
import LandingPageIntegrationSettings from "./LandingPageIntegrationSettings";
import CRMIntegrationGuide from "./CRMIntegrationGuide";
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
      {active === "guide" && <CRMIntegrationGuide/>}
    </div>
  </div>;
}
