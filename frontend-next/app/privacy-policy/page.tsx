import Link from "next/link";

export default function PrivacyPolicyPage() {
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
          Dokumen ini disusun sesuai <strong>Pasal 21 Undang-Undang Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi (UU PDP)</strong> dan berlaku bagi seluruh pengguna platform <strong>MarkaSuite</strong> yang dikelola oleh <strong>PT Arsalynk Teknologi Indonesia</strong> (kontak resmi &amp; DPO: <span className="font-semibold">privacy@arsalynk.com</span>).
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
            <h2 className="text-sm font-bold text-[#163D64]">7. Hak Subjek Data Pribadi (SLA 3&times;24 Jam)</h2>
            <p className="text-slate-600">
              Anda berhak meminta akses, salinan, koreksi/pembaruan, pembatasan pemrosesan, penarikan persetujuan opsional, maupun penghapusan data pribadi dengan mengirimkan permintaan ke <span className="font-semibold">privacy@arsalynk.com</span>. Setiap permintaan akan diproses dalam tenggat paling lambat <strong>3&times;24 jam</strong> sesuai ketentuan regulasi yang berlaku.
            </p>
          </div>
        </section>

        <div className="mt-8 flex flex-wrap gap-4 border-t border-slate-200 pt-4 text-xs text-slate-500">
          <Link href="/terms" className="text-[#0876CD] hover:underline">Syarat &amp; Ketentuan</Link>
          <Link href="/cookie-policy" className="text-[#0876CD] hover:underline">Kebijakan Cookie</Link>
        </div>
      </div>
    </main>
  );
}
