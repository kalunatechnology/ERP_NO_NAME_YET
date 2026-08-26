import Link from "next/link";
import { ArrowRight } from "lucide-react";

export const metadata = {
  title: "404 Not Found — Marka+",
  description: "Halaman tidak ditemukan",
};

export default function NotFoundPage() {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden font-sans"
      style={{
        background: "radial-gradient(circle at 50% 50%, #E8F5D8 0%, #F5FAF0 60%, #FFFFFF 100%)",
      }}
    >
      {/* Background Soft Mesh Glow */}
      <div
        className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full blur-[140px] opacity-40 pointer-events-none"
        style={{ background: "#9CCD52" }}
      />
      <div
        className="absolute bottom-1/4 right-1/4 w-[450px] h-[450px] rounded-full blur-[130px] opacity-30 pointer-events-none"
        style={{ background: "#C5E89B" }}
      />

      {/* Centered Content */}
      <div className="relative z-10 flex flex-col items-center justify-center text-center max-w-md mx-auto">
        <h1
          className="text-7xl sm:text-8xl font-black tracking-tight leading-none mb-2"
          style={{ color: "#547E20" }}
        >
          404
        </h1>

        <h2
          className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-2"
          style={{ color: "#2E4D12" }}
        >
          Page Not Found!
        </h2>

        <p className="text-sm font-normal text-slate-600 mb-6">
          Halaman yang Anda cari tidak tersedia atau telah dipindahkan.
        </p>

        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-xs font-bold text-white shadow-[0_8px_20px_rgba(83,121,31,0.28)] hover:shadow-[0_12px_26px_rgba(83,121,31,0.36)] transition-all hover:scale-[1.02] active:scale-[0.98]"
          style={{ background: "#53791F" }}
        >
          <span>Kembali ke Dashboard</span>
          <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}
