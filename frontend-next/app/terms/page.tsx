import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6">
      <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 sm:p-10 shadow-xs text-slate-800">
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[#163D64]">
              Dokumen Legal MarkaSuite &bull; Versi 1.0
            </span>
            <h1 className="mt-1 text-2xl font-black text-[#0F172A]">
              Syarat &amp; Ketentuan Layanan
            </h1>
          </div>
          <Link href="/login" className="text-xs font-semibold text-[#0876CD] hover:underline">
            Kembali ke Login
          </Link>
        </div>

        <section className="mt-6 space-y-4 text-xs leading-6 text-slate-600">
          <div>
            <h2 className="text-sm font-bold text-[#163D64]">1. Ruang Lingkup Layanan</h2>
            <p>
              MarkaSuite adalah sistem perangkat lunak Enterprise Resource Planning (ERP) berbasis cloud yang disediakan oleh <strong>PT Arsalynk Teknologi Indonesia</strong> untuk pengelolaan proyek, CRM, keuangan, persediaan, dan pelaporan manajemen perusahaan.
            </p>
          </div>

          <div>
            <h2 className="text-sm font-bold text-[#163D64]">2. Kelayakan &amp; Keamanan Akun</h2>
            <p>
              Akun pengguna hanya dibuat melalui undangan resmi oleh Administrator Perusahaan atau Super Administrator. Pengguna wajib menjaga kerahasiaan kredensial, tidak membagikan akun kepada pihak lain, dan mengaktifkan Multi-Factor Authentication (MFA) apabila diwajibkan.
            </p>
          </div>

          <div>
            <h2 className="text-sm font-bold text-[#163D64]">3. Penggunaan yang Dilarang (Acceptable Use)</h2>
            <p>
              Pengguna dilarang melakukan akses tidak sah, penyalahgunaan API, otomasi scraping, pengunggahan konten melanggar hukum (UU ITE No. 1/2024), maupun tindakan yang mengganggu integritas data dan ketersediaan sistem.
            </p>
          </div>

          <div>
            <h2 className="text-sm font-bold text-[#163D64]">4. Penghentian &amp; Pembatasan Layanan</h2>
            <p>
              Administrator berhak menangguhkan atau menonaktifkan akses akun apabila ditemukan pelanggaran keamanan, percobaan akses berulang yang mencurigakan, atau berakhirnya penugasan pengguna pada perusahaan terkait.
            </p>
          </div>

          <div>
            <h2 className="text-sm font-bold text-[#163D64]">5. Hukum yang Berlaku</h2>
            <p>
              Syarat dan Ketentuan ini tunduk pada hukum Republik Indonesia (termasuk KUHPerdata, UU ITE, PP No. 71/2019, serta UU PDP No. 27/2022). Pengaduan layanan dapat disampaikan ke <span className="font-semibold">privacy@arsalynk.com</span>.
            </p>
          </div>
        </section>

        <div className="mt-8 flex flex-wrap gap-4 border-t border-slate-200 pt-4 text-xs text-slate-500">
          <Link href="/privacy-policy" className="text-[#0876CD] hover:underline">Kebijakan Privasi</Link>
          <Link href="/cookie-policy" className="text-[#0876CD] hover:underline">Kebijakan Cookie</Link>
        </div>
      </div>
    </main>
  );
}
