"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import api from "@/lib/api/axios";

interface PublicGovernanceStatus {
  legal_entity_name?: string;
  contact_email?: string;
  tdpse_number?: string;
  website_status?: string;
}

export default function PrivacyPolicyPage() {
  const [statusData, setStatusData] = useState<PublicGovernanceStatus>({});

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
          website_status: res.data?.website_status,
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
      <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 sm:p-10 shadow-xs text-slate-800">
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[#163D64]">
              Dokumen Legal MarkaSuite &bull; Versi 1.0
            </span>
            <h1 className="mt-1 text-2xl font-black text-[#0F172A]">
              Kebijakan Privasi (Pemberitahuan Privasi UU PDP)
            </h1>
          </div>
          <Link href="/login" className="text-xs font-semibold text-[#0876CD] hover:underline">
            Kembali ke Login
          </Link>
        </div>

        <p className="mt-4 text-xs leading-6 text-slate-600">
          Dokumen ini disusun sesuai <strong>Pasal 21 Undang-Undang Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi (UU PDP)</strong> dan berlaku bagi seluruh pengguna platform <strong>MarkaSuite</strong> yang dikelola oleh <strong>{entityName}</strong> (kontak resmi &amp; DPO: <span className="font-semibold">{contactEmail}</span>).
        </p>

        <section className="mt-6 space-y-4 text-xs leading-6">
          <div>
            <h2 className="text-sm font-bold text-[#163D64]">1. Legalitas / Dasar Pemrosesan Data Pribadi</h2>
            <p className="text-slate-600">
              Pemrosesan Data Pribadi dilakukan berdasarkan: (a) pelaksanaan perjanjian/kontrak layanan ERP dengan perusahaan tenant Anda, (b) pemenuhan kewajiban hukum (perpajakan, akuntansi, dan audit sistem elektronik), serta (c) persetujuan eksplisit yang sah untuk fitur atau komunikasi opsional.
            </p>
          </div>

          <div>
            <h2 className="text-sm font-bold text-[#163D64]">2. Tujuan Pemrosesan Data Pribadi</h2>
            <p className="text-slate-600">
              Autentikasi akun, otorisasi akses berbasis modul (RBAC), pengelolaan operasional proyek/CRM/keuangan/inventori, pencatatan jejak audit keamanan, serta pemenuhan kewajiban pelaporan resmi.
            </p>
          </div>

          <div>
            <h2 className="text-sm font-bold text-[#163D64]">3. Jenis dan Relevansi Data Pribadi</h2>
            <p className="text-slate-600">
              Data identitas akun (nama lengkap, alamat email kerja, jabatan, unit/departemen), data keamanan sesi (hash kata sandi, log autentikasi, alamat IP, metadata perangkat), serta data transaksi bisnis sesuai modul yang diaktifkan perusahaan Anda.
            </p>
          </div>

          <div>
            <h2 className="text-sm font-bold text-[#163D64]">4. Jangka Waktu Retensi Dokumen &amp; Data</h2>
            <p className="text-slate-600">
              Data akun disimpan selama akun aktif dan hingga 2 tahun setelah penonaktifan untuk keperluan audit. Dokumen faktur, buku besar, dan perpajakan disimpan minimal 10 tahun sesuai peraturan perundang-undangan perpajakan Indonesia.
            </p>
          </div>

          <div>
            <h2 className="text-sm font-bold text-[#163D64]">5. Rincian Informasi yang Dikumpulkan</h2>
            <p className="text-slate-600">
              Informasi yang Anda masukkan secara langsung, informasi yang diberikan oleh Administrator Perusahaan Anda saat undangan akun, serta catatan teknis akses otomatis (audit trail &amp; cookie sesi esensial).
            </p>
          </div>

          <div>
            <h2 className="text-sm font-bold text-[#163D64]">6. Jangka Waktu Pemrosesan</h2>
            <p className="text-slate-600">
              Pemrosesan berlangsung sepanjang masa berlakunya perjanjian langganan perusahaan Anda hingga pemrosesan dihentikan atau ditarik persetujuannya sesuai ketentuan retensi wajib.
            </p>
          </div>

          <div>
            <h2 className="text-sm font-bold text-[#163D64]">7. Transfer Data Lintas Negara &amp; Mekanisme Pelindungannya (Pasal 56 UU PDP)</h2>
            <p className="text-slate-600">
              Dalam penyelenggaraan layanan, {entityName} dapat memproses atau mentransfer Data Pribadi melalui penyedia infrastruktur pihak ketiga di luar wilayah Indonesia, meliputi: (a) penyedia cloud &amp; database hosting terkelola (Hostinger, Vercel, Supabase pada region Asia-Pacific/Global), (b) penyedia gateway AI/LLM untuk fitur asisten Marbot (OpenRouter / Google Gemini / OpenAI di Amerika Serikat apabila fitur AI diaktifkan), serta (c) Meta WhatsApp Cloud API (Amerika Serikat/Global) apabila tenant mengaktifkan integrasi CRM WhatsApp.
            </p>
            <p className="mt-1.5 text-slate-600">
              Sesuai <strong>Pasal 56 UU PDP</strong>, setiap transfer lintas negara dilindungi melalui: (i) perjanjian pemrosesan data (<em>Data Processing Agreement</em> / DPA) dan klausul kontraktual standar yang mewajibkan kerahasiaan, larangan pelatihan model AI atas data pelanggan, serta pelaporan insiden awal di bawah 72 jam; (ii) enkripsi transmisi (TLS) dan enkripsi penyimpanan (at-rest / AES-256-GCM); serta (iii) prinsip minimisasi data dan persetujuan eksplisit Anda.
            </p>
          </div>

          <div>
            <h2 className="text-sm font-bold text-[#163D64]">8. Hak Subjek Data Pribadi (SLA 3&times;24 Jam)</h2>
            <p className="text-slate-600">
              Anda berhak meminta akses, salinan, koreksi/pembaruan, pembatasan pemrosesan, penarikan persetujuan opsional, maupun penghapusan data pribadi dengan mengirimkan permintaan ke <span className="font-semibold">{contactEmail}</span> atau melalui{" "}
              <Link href="/dsr" className="font-semibold text-[#0876CD] hover:underline">
                Formulir Pengajuan Hak Subjek Data (DSR)
              </Link>
              . Setiap permintaan akan diproses dalam tenggat paling lambat <strong>3&times;24 jam</strong> sesuai ketentuan regulasi yang berlaku.
            </p>
          </div>
        </section>

        <div className="mt-8 border-t border-slate-200 pt-4 space-y-2 text-xs text-slate-500">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
            <span>
              Pengendali Data: <strong className="text-slate-800">{entityName}</strong> &bull; DPO: <strong>{contactEmail}</strong>
            </span>
            <span>
              Nomor TDPSE: <strong className="font-mono text-slate-800">{tdpseNumber}</strong>
            </span>
          </div>
          <div className="flex flex-wrap gap-4">
            <Link href="/terms" className="text-[#0876CD] hover:underline">Syarat &amp; Ketentuan</Link>
            <Link href="/cookie-policy" className="text-[#0876CD] hover:underline">Kebijakan Cookie</Link>
            <Link href="/retention-policy" className="text-[#0876CD] hover:underline">Kebijakan Masa Retensi</Link>
            <Link href="/dsr" className="text-[#0876CD] hover:underline">Ajukan Hak Subjek Data (DSR)</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
