"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import api from "@/lib/api/axios";
import { RETENTION_POLICY_META, RETENTION_SCHEDULE } from "@/lib/governance/retention-policy";

export default function RetentionPolicyPage() {
  const [statusData, setStatusData] = useState<{
    legal_entity_name?: string;
    contact_email?: string;
    tdpse_number?: string;
  }>({});

  useEffect(() => {
    let active = true;
    api
      .get("/api/v1/governance/public/status")
      .then((res) => {
        if (!active) return;
        setStatusData({
          legal_entity_name: res.data?.legal_entity_name,
          contact_email: res.data?.contact_email,
          tdpse_number: res.data?.tdpse_number,
        });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const entityName = statusData.legal_entity_name || "PT Arsalynk Teknologi Indonesia";
  const contactEmail = statusData.contact_email || "privacy@arsalynk.com";
  const tdpseNumber = statusData.tdpse_number?.trim() || "Dalam Proses Registrasi Komdigi";

  return (
    <main className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6">
      <div className="mx-auto max-w-5xl rounded-2xl border border-slate-200 bg-white p-6 sm:p-10 shadow-xs text-slate-800 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[#163D64]">
              Dokumen Tata Kelola {RETENTION_POLICY_META.documentId} &bull; PP 33/2026 Pasal 74–75
            </span>
            <h1 className="mt-1 text-2xl font-black text-[#0F172A]">
              {RETENTION_POLICY_META.title}
            </h1>
            <p className="mt-1 text-xs text-slate-500">
              Dasar Hukum: {RETENTION_POLICY_META.legalReferences}
            </p>
          </div>
          <Link href="/login" className="text-xs font-semibold text-[#0876CD] hover:underline">
            Kembali ke Login
          </Link>
        </div>

        <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-2 text-xs leading-6 text-slate-700">
          <h2 className="text-sm font-bold text-[#163D64]">1. Prinsip Umum Retensi (PP 33/2026 Pasal 74–75)</h2>
          <ul className="list-disc pl-5 space-y-1">
            {RETENTION_POLICY_META.principles.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-bold text-[#163D64]">2. Jadwal Masa Retensi &amp; Metode Pemusnahan per Kategori</h2>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[920px] text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-bold">Kategori Data &amp; ROPA</th>
                  <th className="px-4 py-3 font-bold">Subjek Data</th>
                  <th className="px-4 py-3 font-bold">Periode Retensi</th>
                  <th className="px-4 py-3 font-bold">Metode Pemusnahan</th>
                  <th className="px-4 py-3 font-bold">Penanggung Jawab &amp; Dasar Hukum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {RETENTION_SCHEDULE.map((row) => (
                  <tr key={row.id} className="align-top">
                    <td className="px-4 py-3.5">
                      <span className="font-mono text-[11px] font-bold text-[#0876CD]">{row.ropaRef}</span>
                      <div className="font-semibold text-slate-900 mt-0.5">{row.category}</div>
                    </td>
                    <td className="px-4 py-3.5 text-slate-600">{row.subjectCategories}</td>
                    <td className="px-4 py-3.5 font-medium text-slate-800">{row.retentionPeriod}</td>
                    <td className="px-4 py-3.5 text-slate-600">{row.deletionMethod}</td>
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-slate-800">{row.ownerRole}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">{row.legalBasis}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-xs leading-6 text-amber-950">
          <h2 className="text-sm font-bold text-amber-900">3. Pengecualian &amp; Penahanan Hukum (Legal Hold)</h2>
          <p className="mt-1">{RETENTION_POLICY_META.legalHoldNote}</p>
        </section>

        <div className="border-t border-slate-200 pt-4 space-y-2 text-xs text-slate-500">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
            <span>
              Pengendali Data: <strong className="text-slate-800">{entityName}</strong> &bull; DPO: <strong>{contactEmail}</strong>
            </span>
            <span>
              Nomor TDPSE: <strong className="font-mono text-slate-800">{tdpseNumber}</strong>
            </span>
          </div>
          <div className="flex flex-wrap gap-4">
            <Link href="/privacy-policy" className="text-[#0876CD] hover:underline">Kebijakan Privasi</Link>
            <Link href="/terms" className="text-[#0876CD] hover:underline">Syarat &amp; Ketentuan</Link>
            <Link href="/cookie-policy" className="text-[#0876CD] hover:underline">Kebijakan Cookie</Link>
            <Link href="/dsr" className="text-[#0876CD] hover:underline">Ajukan Hak Subjek Data (DSR)</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
