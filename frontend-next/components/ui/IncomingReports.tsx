"use client";

import { useState } from "react";
import { Archive, Trash2, Reply, Forward, Printer, Tag } from "lucide-react";

const MOCK_REPORTS = [
  {
    id: "r1",
    sender: "Rina Sari",
    title: "Project Manager · Divisi IT",
    subject: "Update Progress — Sprint 12 Project Alpha",
    preview: "Tim telah menyelesaikan 85% task Sprint 12...",
    message: "Tim telah menyelesaikan 85% task Sprint 12. Sisa task mencakup integrasi API payment gateway dan UAT final. Estimasi selesai tanggal 22 Agustus 2026. Mohon konfirmasi jadwal review dengan klien.",
    timestamp: "19 Aug 2026, 10:30",
    dotColor: "#66D575",
    unread: true,
  },
  {
    id: "r2",
    sender: "Budi Santoso",
    title: "Finance Controller",
    subject: "Budget Report — Project Alpha Q3",
    preview: "Laporan anggaran Q3 sudah tersedia...",
    message: "Laporan anggaran Q3 sudah tersedia untuk review. Total pengeluaran saat ini berada di 72% dari anggaran yang disetujui. Harap review sebelum akhir minggu ini.",
    timestamp: "19 Aug 2026, 09:15",
    dotColor: "#F59E0B",
    unread: true,
  },
  {
    id: "r3",
    sender: "Dewi Kurnia",
    title: "CRM Lead",
    subject: "New Lead — PT. Maju Bersama",
    preview: "Ada lead baru yang masuk dari PT. Maju Bersama...",
    message: "Ada lead baru yang masuk dari PT. Maju Bersama dengan estimasi nilai kontrak Rp 450 juta. Mohon konfirmasi tim sales untuk follow-up.",
    timestamp: "18 Aug 2026, 16:45",
    dotColor: "#CACACA",
    unread: false,
  },
];

export function IncomingReports() {
  const [active, setActive] = useState(MOCK_REPORTS[0]);

  return (
    <div className="flex flex-row h-full" style={{ minHeight: 300 }}>
      {/* ── Left: List pane ─────────────────── */}
      <div
        className="flex flex-col border-r border-text-tertiary flex-shrink-0 overflow-y-auto"
        style={{ width: 237 }}
        role="list"
        aria-label="Daftar laporan"
      >
        {/* Vertical progress bar decoration */}
        <div className="relative pl-8 pr-2 py-4 flex flex-col gap-2">
          <div className="absolute left-4 top-4 bottom-4 w-1 bg-text-tertiary rounded-full" aria-hidden="true" />
          <div className="absolute left-4 top-4 w-1 bg-brand-green rounded-full" style={{ height: "45%" }} aria-hidden="true" />

          {MOCK_REPORTS.map((report) => (
            <button
              key={report.id}
              role="listitem"
              onClick={() => setActive(report)}
              className={`text-left p-3 rounded-md transition-colors ${
                active.id === report.id ? "bg-brand-light-green" : "hover:bg-gray-50"
              }`}
              aria-current={active.id === report.id ? "true" : undefined}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: report.dotColor }}
                    aria-hidden="true"
                  />
                  <span className="text-xs font-medium text-text-primary truncate max-w-[100px]">
                    {report.sender}
                  </span>
                </div>
                <span className="text-2xs text-text-secondary flex-shrink-0">
                  {report.timestamp.split(",")[0]}
                </span>
              </div>
              <p className="text-xs font-medium text-text-primary truncate">{report.subject}</p>
              <p className="text-2xs text-text-secondary line-clamp-2 mt-0.5">{report.preview}</p>
            </button>
          ))}
        </div>
      </div>

      {/* ── Right: Detail pane ──────────────── */}
      <div className="flex-1 min-w-0 flex flex-col p-5 gap-3">
        {/* Toolbar */}
        <div className="flex items-center gap-3">
          {[
            { Icon: Archive, label: "Arsipkan" },
            { Icon: Trash2,   label: "Hapus"    },
            { Icon: Reply,    label: "Balas"    },
            { Icon: Forward,  label: "Teruskan" },
            { Icon: Printer,  label: "Cetak"    },
            { Icon: Tag,      label: "Label"    },
          ].map(({ Icon, label }) => (
            <button
              key={label}
              className="text-text-secondary hover:text-text-primary transition-colors"
              aria-label={label}
            >
              <Icon size={18} />
            </button>
          ))}
        </div>

        <div className="h-px bg-text-tertiary" aria-hidden="true" />

        {/* Sender meta */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-brand-light-green flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-medium text-brand-deep-green">
                {active.sender[0]}
              </span>
            </div>
            <div>
              <p className="text-sm font-medium text-text-primary">{active.sender}</p>
              <p className="text-2xs text-text-secondary">{active.title}</p>
            </div>
          </div>
          <span className="text-2xs text-text-secondary">{active.timestamp}</span>
        </div>

        <div className="h-px bg-text-tertiary" aria-hidden="true" />

        {/* Body */}
        <div className="flex flex-col gap-2 flex-1">
          <h3 className="text-base font-medium text-text-primary">{active.subject}</h3>
          <p className="text-xs text-text-primary leading-relaxed">{active.message}</p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 mt-auto">
          <button className="btn-outline text-xs py-1.5 px-4">Reply Later</button>
          <button className="btn-primary text-xs py-1.5 px-4">Open Project</button>
        </div>
      </div>
    </div>
  );
}
