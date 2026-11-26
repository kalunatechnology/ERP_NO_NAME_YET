import type { ReactNode } from "react";
import { Eye } from "lucide-react";

interface FinanceSummarySectionProps {
  title: string;
  subtitle: string;
  children: ReactNode;
}

/** Bagian ringkasan seragam. Badge "Hanya lihat" memakai ikon mata untuk menegaskan konten bersifat view-only. */
export function FinanceSummarySection({ title, subtitle, children }: FinanceSummarySectionProps) {
  return (
    <section className="fin-card bg-[#F8FAFF] p-3.5 sm:p-4" style={{ background: "#F8FAFF" }}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-brand-deep-green">{title}</h3>
          <p className="mt-0.5 text-xs text-text-secondary">{subtitle}</p>
        </div>
        <span
          title="Hanya untuk dilihat (tanpa aksi)"
          className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-white px-2.5 py-1 text-2xs font-semibold text-blue-800"
        >
          <Eye size={12} aria-hidden="true" />
          Hanya lihat
        </span>
      </div>
      {children}
    </section>
  );
}
