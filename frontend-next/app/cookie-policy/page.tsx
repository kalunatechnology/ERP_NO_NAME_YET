import Link from "next/link";

export default function CookiePolicyPage() {
  return (
    <main className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6">
      <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 sm:p-10 shadow-xs text-slate-800">
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[#163D64]">
              Dokumen Legal MarkaSuite &bull; Versi 1.0
            </span>
            <h1 className="mt-1 text-2xl font-black text-[#0F172A]">
              Pemberitahuan Cookie &amp; Penyimpanan Browser
            </h1>
          </div>
          <Link href="/login" className="text-xs font-semibold text-[#0876CD] hover:underline">
            Kembali ke Login
          </Link>
        </div>

        <section className="mt-6 space-y-4 text-xs leading-6 text-slate-600">
          <div>
            <h2 className="text-sm font-bold text-[#163D64]">1. Cookie Sesi Esensial</h2>
            <p>
              MarkaSuite hanya menggunakan cookie esensial yang bersifat <em>strictly necessary</em> untuk autentikasi dan keamanan sesi:
            </p>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              <li><code>access_token</code> &amp; <code>refresh_token</code>: diterbitkan sebagai <strong>HttpOnly, Secure, SameSite=Lax</strong> dari server untuk memvalidasi sesi secara aman.</li>
              <li><code>erp_session</code>: penanda status sesi non-sensitif untuk pengalihan halaman login/dashboard.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-sm font-bold text-[#163D64]">2. Penyimpanan Preferensi Lokal</h2>
            <p>
              Preferensi antarmuka (seperti status sidebar kiri/kanan dan company aktif) disimpan di <code>localStorage</code> dan otomatis dibersihkan saat Anda keluar (<em>Log Out</em>).
            </p>
          </div>

          <div>
            <h2 className="text-sm font-bold text-[#163D64]">3. Tanpa Pelacakan Iklan Pihak Ketiga</h2>
            <p>
              MarkaSuite tidak menanam cookie pemasaran, iklan bertarget, maupun pelacak perilaku lintas situs pihak ketiga.
            </p>
          </div>
        </section>

        <div className="mt-8 flex flex-wrap gap-4 border-t border-slate-200 pt-4 text-xs text-slate-500">
          <Link href="/privacy-policy" className="text-[#0876CD] hover:underline">Kebijakan Privasi</Link>
          <Link href="/terms" className="text-[#0876CD] hover:underline">Syarat &amp; Ketentuan</Link>
        </div>
      </div>
    </main>
  );
}
