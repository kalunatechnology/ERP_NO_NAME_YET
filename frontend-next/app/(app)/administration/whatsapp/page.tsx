import Link from "next/link";
import { ArrowLeft, Settings } from "lucide-react";
import WhatsAppSettings from "@/app/(app)/crm/WhatsAppSettings";

export const metadata = {
  title: "WhatsApp CRM — Marka+ ERP",
  description: "Kelola koneksi WhatsApp Business Cloud API untuk CRM Marka.",
};

export default function WhatsAppAdministrationPage() {
  return <div className="space-y-5">
    <div>
      <Link href="/administration" className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-text-secondary hover:text-text-primary"><ArrowLeft size={14}/> Company & Access</Link>
      <div className="flex items-center gap-2"><Settings size={20} className="text-brand-deep-green"/><h1 className="text-2xl font-bold text-text-primary">Integrasi WhatsApp CRM</h1></div>
      <p className="mt-1 text-sm text-text-secondary">Kelola nomor WhatsApp, kredensial Meta, dan aliran pesan masuk ke Customer Inbox Marka.</p>
    </div>
    <WhatsAppSettings />
  </div>;
}
