import type { ReactNode } from "react";

interface FinanceSummarySectionProps {
  title: string;
  subtitle: string;
  children: ReactNode;
}

export function FinanceSummarySection({ title, subtitle, children }: FinanceSummarySectionProps) {
  return (
    <section className="rounded-2xl border border-blue-200 bg-[#E7F2FF]/70 p-3.5 font-sans sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-brand-deep-green">{title}</h3>
          <p className="mt-0.5 text-xs text-text-secondary">{subtitle}</p>
        </div>
        <span className="rounded-full border border-blue-200 bg-white/80 px-2.5 py-1 text-2xs font-semibold text-blue-800">
          Informasi saja
        </span>
      </div>
      {children}
    </section>
  );
}
