"use client";

import { useState, useEffect } from "react";
import { Search, RefreshCw, Database, ChevronRight, Eye, Layers, Filter } from "lucide-react";
import api from "@/lib/api/axios";
import { normalizeList } from "@/lib/api/auth.api";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";
import toast from "react-hot-toast";

const RESOURCES = [
  { id: "projects",      name: "Projects",              endpoint: "/api/v1/projects/projects/",         category: "Project" },
  { id: "tasks",         name: "Project Tasks (WBS)",   endpoint: "/api/v1/projects/tasks/",            category: "Project" },
  { id: "costs",         name: "Project Cost Entries",  endpoint: "/api/v1/finance/project-cost-entries/", category: "Finance" },
  { id: "fundings",      name: "Project Fundings",      endpoint: "/api/v1/finance/project-fundings/",  category: "Finance" },
  { id: "proposals",     name: "Billing Proposals",     endpoint: "/api/v1/finance/billing-proposals/", category: "Finance" },
  { id: "deals",         name: "Opportunities / Deals", endpoint: "/api/v1/crm/opportunities/",         category: "CRM" },
  { id: "customers",     name: "Customers & Accounts",  endpoint: "/api/v1/crm/customers/",             category: "CRM" },
  { id: "tickets",       name: "Tickets & Warranty",    endpoint: "/api/v1/crm/tickets/",               category: "CRM" },
  { id: "users",         name: "Users & Personas",      endpoint: "/api/v1/auth/users/",                category: "Core" },
];

export default function ResourcesClient() {
  const [selectedRes, setSelectedRes] = useState(RESOURCES[0]);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const fetchRows = async (res = selectedRes) => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      q.set("page_size", "50");
      if (search) q.set("search", search);
      const resp = await api.get(`${res.endpoint}?${q.toString()}`);
      setRows(normalizeList(resp.data).rows);
    } catch {
      toast.error(`Gagal memuat resource ${res.name}`);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRows(selectedRes);
  }, [selectedRes]);

  // Extract top columns
  const sample = rows[0] || {};
  const columns = Object.keys(sample).slice(0, 6);

  return (
    <div className="flex flex-col gap-6">

      {/* Header */}
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
            <Database size={22} className="text-brand-green" /> OpenAPI Data Explorer
          </h1>
          <p className="text-xs text-text-secondary mt-0.5">Jelajahi dan inspeksi seluruh entitas data mentah (Raw API Resources) dari backend ERP</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchRows(selectedRes)}
            className="btn-ghost py-1.5 px-3 text-xs gap-1.5"
          >
            <RefreshCw size={14} /> Refresh Data
          </button>
        </div>
      </div>

      {/* Resource selector chips */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {RESOURCES.map(r => (
          <button
            key={r.id}
            onClick={() => {
              setSelectedRes(r);
              setSearch("");
            }}
            className={cn(
              "px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border flex items-center gap-2",
              selectedRes.id === r.id
                ? "bg-brand-deep-green text-white border-brand-deep-green shadow-sm"
                : "bg-white text-text-secondary border-text-tertiary hover:border-brand-green"
            )}
          >
            <span className="text-2xs px-1.5 py-0.5 rounded bg-white/20">{r.category}</span>
            <span>{r.name}</span>
          </button>
        ))}
      </div>

      {/* Search & Filter Toolbar */}
      <div className="card p-4 rounded-2xl flex justify-between items-center flex-wrap gap-4">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <input
            type="text"
            placeholder={`Cari dalam ${selectedRes.name}…`}
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === "Enter" && fetchRows()}
            className="input text-xs py-1.5"
          />
          <button onClick={() => fetchRows()} className="btn-primary py-1.5 px-3 text-xs">
            Cari
          </button>
        </div>

        <span className="badge badge-info text-xs">
          {rows.length} Records Ditemukan
        </span>
      </div>

      {/* Table Data Container */}
      <div className="card rounded-2xl overflow-hidden p-1">
        {loading ? (
          <div className="p-8 text-center text-xs text-text-secondary animate-pulse">
            Memuat resource data dari backend…
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-xs text-text-secondary">
            Belum ada record data pada endpoint {selectedRes.endpoint}.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full data-table text-xs">
              <thead>
                <tr>
                  {columns.map(c => (
                    <th key={c} className="uppercase font-bold tracking-wider text-2xs">
                      {c.replace(/_/g, " ")}
                    </th>
                  ))}
                  <th className="text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={row.id || idx} className="hover:bg-brand-light-green/20">
                    {columns.map(c => {
                      const val = row[c];
                      return (
                        <td key={c} className="max-w-[200px] truncate">
                          {typeof val === "object" && val !== null ? JSON.stringify(val) : String(val ?? "-")}
                        </td>
                      );
                    })}
                    <td className="text-right">
                      <button
                        onClick={() => {
                          setSelectedRecord(row);
                          setIsDetailOpen(true);
                        }}
                        className="btn-outline py-1 px-2.5 text-2xs gap-1"
                      >
                        <Eye size={12} /> Inspect JSON
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Raw JSON Inspector */}
      <Modal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        title={`Inspect Raw Record: ${selectedRes.name}`}
        subtitle={`ID / UUID: ${selectedRecord?.id || "-"}`}
        size="lg"
      >
        <div className="flex flex-col gap-3">
          <pre className="p-4 rounded-xl bg-gray-900 text-green-400 font-mono text-xs overflow-x-auto max-h-96">
            {JSON.stringify(selectedRecord, null, 2)}
          </pre>
          <button
            onClick={() => setIsDetailOpen(false)}
            className="btn-primary w-full justify-center py-2"
          >
            Tutup Inspektor
          </button>
        </div>
      </Modal>

    </div>
  );
}
