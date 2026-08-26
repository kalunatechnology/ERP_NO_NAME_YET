import Link from "next/link";
import Image from "next/image";

export const metadata = {
  title: "404 Not Found — Marka+",
  description: "Oops! We think the page you are looking for doesn't exist or has been moved.",
};

export default function NotFound() {
  return (
    <main className="relative flex h-screen w-screen flex-col items-center justify-center overflow-hidden bg-[#fafcfa] p-6 text-center select-none">
      {/* Background SVG Full Screen */}
      <div className="absolute inset-0 -z-10 h-full w-full">
        <Image
          src="/Background_not_found.svg"
          alt="Error Background"
          fill
          priority
          className="object-cover object-center pointer-events-none"
        />
      </div>

      {/* Konten Utama 404 (Persis Desain Referensi) */}
      <div className="relative z-10 flex max-w-md flex-col items-center">
        {/* Angka Status 404 */}
        <h1 className="text-8xl font-extrabold tracking-tight text-[#4d7c0f] md:text-9xl">
          404
        </h1>

        {/* Judul Status */}
        <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#2d4a0b] md:text-4xl">
          Page Not Found!
        </h2>

        {/* Deskripsi Singkat */}
        <p className="mt-3 max-w-sm text-sm text-[#4d7c0f]/80 md:text-base">
          Oops! We think the page you are looking for doesn't exist or has been moved.
        </p>

        {/* Tombol Kembali (Pill Button) */}
        <Link
          href="/dashboard"
          className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#558b2f] px-7 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-[#436e24] hover:shadow-md active:scale-95"
        >
          Back to the Homepage
          <span aria-hidden="true" className="text-base font-bold leading-none">
            &rarr;
          </span>
        </Link>
      </div>
    </main>
  );
}
