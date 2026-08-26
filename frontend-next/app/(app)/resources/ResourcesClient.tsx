"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Search, RefreshCw, Database, ChevronRight, Eye, Layers, Filter } from "lucide-react";
import api from "@/lib/api/axios";
import { normalizeList } from "@/lib/api/auth.api";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";
import toast from "react-hot-toast";
import { feedApi } from "@/lib/api/feed.api";

const RESOURCES = [
  /* ── Projects ────────── */
  { id: "projects",      name: "Projects",              endpoint: "/api/v1/projects/projects/",               category: "Project" },
  { id: "main-tasks",    name: "Main Tasks (WBS L1)",   endpoint: "/api/v1/projects/main-tasks/",             category: "Project" },
  { id: "weekly-tasks",  name: "Weekly Tasks (WBS L2)", endpoint: "/api/v1/projects/weekly-tasks/",           category: "Project" },
  { id: "daily-tasks",   name: "Daily Tasks (WBS L3)",  endpoint: "/api/v1/projects/daily-tasks/",            category: "Project" },
  { id: "milestones",    name: "Milestones",             endpoint: "/api/v1/projects/milestones/",             category: "Project" },
  /* ── Finance ─────────── */
  { id: "costs",         name: "Project Cost Entries (WIP)", endpoint: "/api/v1/finance/project-cost-entries/",    category: "Finance" },
  { id: "fundings",      name: "Project Fundings",       endpoint: "/api/v1/finance/project-fundings/",        category: "Finance" },
  { id: "proposals",     name: "Billing Proposals",      endpoint: "/api/v1/finance/billing-proposals/",       category: "Finance" },
  { id: "journals",      name: "Journal Entries",        endpoint: "/api/v1/finance/journal-entries/",         category: "Finance" },
  /* ── CRM ────────────── */
  { id: "inquiries",     name: "Customer Inquiries",     endpoint: "/api/v1/crm/customer-inquiries/",          category: "CRM" },
  { id: "opportunities", name: "Opportunities",          endpoint: "/api/v1/crm/opportunities/",               category: "CRM" },
  { id: "estimates",     name: "Cost Estimates",         endpoint: "/api/v1/crm/cost-estimates/",              category: "CRM" },
  { id: "quotations",    name: "Sales Quotations",       endpoint: "/api/v1/sales/quotations/",                category: "CRM" },
  { id: "orders",        name: "Sales Orders",           endpoint: "/api/v1/sales/orders/?page_size=50",       category: "CRM" },
  { id: "tickets",       name: "Service Cases",          endpoint: "/api/v1/service/cases/",                   category: "CRM" },
  { id: "credit",        name: "Credit Snapshots",       endpoint: "/api/v1/crm/credit-status-snapshots/",     category: "CRM" },
  /* ── Master Data ─────── */
  { id: "parties",       name: "Parties / Customers",    endpoint: "/api/v1/master-data/parties/",             category: "Master" },
  { id: "products",      name: "Products & Services",    endpoint: "/api/v1/master-data/products/",            category: "Master" },
  /* ── Core / IAM ─────── */
  { id: "users",         name: "Users & Personas",       endpoint: "/api/v1/auth/users/",                      category: "Core" },
  { id: "companies",     name: "Companies",              endpoint: "/api/v1/core/companies/",                  category: "Core" },
];

export default function ResourcesClient() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams?.get("search") || "";

  const [selectedRes, setSelectedRes] = useState(RESOURCES[0]);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(initialQuery);
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  useEffect(() => {
    if (initialQuery) {
      setSearch(initialQuery);
    }
  }, [initialQuery]);

  /* Track recently opened resource */
  useEffect(() => {
    if (selectedRes) {
      feedApi.trackRecentItem({
        item_type: "RESOURCE",
        object_id: selectedRes.id,
        title: `Data Explorer — ${selectedRes.name}`,
        target_url: "/resources",
      }).catch(() => {});
    }
  }, [selectedRes?.id]);

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
          <div className="table-scroll-wrapper">
            <table className="w-full data-table text-xs min-w-[650px]">
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
