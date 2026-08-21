"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { BarChart3, Download } from "lucide-react";

const REPORTING_TABS = [
  { id: "project-pnl", label: "📊 Project P&L (Laba/Rugi Proyek)" },
  { id: "executive",   label: "🏛️ Executive Dashboard & Revenue" },
  { id: "journals",    label: "📒 General Ledger & Jurnal Keuangan" },
];

export default function ReportingClient() {
  const [activeTab, setActiveTab] = useState("project-pnl");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-medium text-text-primary">Reporting & Observability</h1>
          <p className="text-sm text-text-secondary mt-0.5">Analisis kinerja lintas modul: Keuangan, Proyek, dan CRM</p>
        </div>
        <button className="btn-outline gap-1.5 text-xs">
          <Download size={14} /> Export Laporan (.xlsx)
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-text-tertiary overflow-x-auto no-scrollbar">
        {REPORTING_TABS.map(tab => (
          <button
            key={tab.id}
            className={cn("tab-btn", activeTab === tab.id && "active")}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="card rounded-xl p-8 flex flex-col items-center justify-center min-h-[350px] text-center gap-3">
        <div className="w-12 h-12 rounded-full bg-brand-light-green flex items-center justify-center text-brand-deep-green">
          <BarChart3 size={24} />
        </div>
        <h3 className="text-base font-medium text-text-primary">
          {REPORTING_TABS.find(t => t.id === activeTab)?.label}
        </h3>
        <p className="text-sm text-text-secondary max-w-md">
          Modul reporting ini terhubung langsung dengan double-entry bookkeeping di Finance dan Earned Value Management (EVM) di Project Management.
        </p>
      </div>
    </div>
  );
}
