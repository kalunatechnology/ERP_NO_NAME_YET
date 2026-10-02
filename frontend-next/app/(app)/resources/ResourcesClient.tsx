/**
 * File: frontend-next/app/(app)/resources/ResourcesClient.tsx
 *
 * Purpose: Enterprise Repository & Document Catalog for Marka+ ERP.
 * Overview: Provides unified digital archives across Project, Finance, CRM, and Master Data.
 * Access: Executive and standard roles view the structured business repository.
 *         Super Admin has access to toggle into the Technical Schema / Access Admin workspace.
 */
"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Search, RefreshCw, FolderArchive, ChevronRight, Eye, Layers, Filter,
  FileText, ShieldCheck, Database, Building, DollarSign, Briefcase, Users,
  Tag, Calendar, CheckCircle2, ArrowUpRight, ExternalLink, Code
} from "lucide-react";
import api from "@/lib/api/axios";
import { normalizeList } from "@/lib/api/auth.api";
import { cn, formatMoney, formatDate, getStatusColor } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";
import { feedApi } from "@/lib/api/feed.api";
import { useAuth } from "@/contexts/AuthContext";
import { canAccessRoute, canRequestApi } from "@/lib/access/module-contract";
import { REPOSITORY_ENTITIES, ResourceEntity } from "@/lib/access/resource-catalog";
import { MarkaWordmark } from "@/components/brand/MarkaWordmark";

const CATEGORIES = ["ALL", "Project", "Finance", "CRM", "Master", "Core"] as const;

export default function ResourcesClient() {
  const { user, userRole, company } = useAuth();
  const searchParams = useSearchParams();
  const initialQuery = searchParams?.get("search") || "";

  const canManageAccess = userRole === "super_admin" || userRole === "company_admin";

  const [activeCategory, setActiveCategory] = useState<string>("ALL");
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const requestSequence = useRef(0);
  const [rows, setRows] = useState<any[]>([]);
  const [loadedRowsKey, setLoadedRowsKey] = useState("");
  const [loadError, setLoadError] = useState<{ key: string; status: number; message: string } | null>(null);
  const lastTrackedKey = useRef("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(initialQuery);
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [showJsonRaw, setShowJsonRaw] = useState(false);

  const accessContext = {
    enabledModules: user?.enabled_modules,
    delegatedModules: user?.delegated_modules,
    activeRoleCode: user?.active_role_code,
    isSuperAdmin: Boolean(user?.is_superuser),
  };

  const accessibleEntities = useMemo(() => REPOSITORY_ENTITIES.filter((entity) => canRequestApi(entity.endpoint, accessContext)),
    [user?.active_role_code, user?.delegated_modules, user?.enabled_modules, user?.is_superuser]);
  const effectiveCategory = activeCategory === "ALL" || accessibleEntities.some((entity) => entity.category === activeCategory)
    ? activeCategory : "ALL";
  const visibleEntities = accessibleEntities.filter((entity) => effectiveCategory === "ALL" || entity.category === effectiveCategory);

  const selectedEntity = visibleEntities.find((entity) => entity.id === selectedEntityId) ?? visibleEntities[0];
  const accessKey = JSON.stringify([
    user?.id, company, user?.active_role_code,
    [...(user?.enabled_modules ?? [])].sort(), [...(user?.delegated_modules ?? [])].sort(), user?.is_superuser,
  ]);
  const selectedRowsKey = `${accessKey}:${selectedEntity?.id ?? ""}`;
  const visibleRows = loadedRowsKey === selectedRowsKey ? rows : [];
  const visibleLoadError = loadError?.key === selectedRowsKey ? loadError : null;

  useEffect(() => {
    if (initialQuery) setSearch(initialQuery);
  }, [initialQuery]);

  const fetchRows = async (entity = selectedEntity) => {
    if (!entity || !visibleEntities.some((item) => item.id === entity.id)) {
      setRows([]);
      setLoading(false);
      return;
    }
    const sequence = ++requestSequence.current;
    setLoading(true);
    setRows([]);
    setLoadError(null);
    try {
      const q = new URLSearchParams();
      q.set("page_size", "50");
      if (search) q.set("search", search);
      const resp = await api.get(`${entity.endpoint}?${q.toString()}`);
      if (sequence === requestSequence.current) {
        setRows(normalizeList(resp.data).rows);
        setLoadedRowsKey(`${accessKey}:${entity.id}`);
        const recentKey = `${accessKey}:${entity.id}`;
        if (lastTrackedKey.current !== recentKey) {
          lastTrackedKey.current = recentKey;
          void feedApi.trackRecentItem({
            item_type: "RESOURCE", object_id: entity.id,
            title: `Repository — ${entity.name}`, target_url: "/resources",
          }).catch(() => {});
        }
      }
    } catch (error) {
      if (sequence === requestSequence.current) {
        const response = (error as { response?: { status?: number; data?: { detail?: string; error?: string } } })?.response;
        const status = response?.status ?? 0;
        const message = status === 403
          ? response?.data?.detail || `Akses ke data ${entity.name} dibatasi untuk role atau company aktif.`
          : `Arsip data ${entity.name} belum dapat dimuat. Coba Refresh.`;
        setLoadError({ key: `${accessKey}:${entity.id}`, status, message });
        setRows([]);
      }
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedEntity) {
      void fetchRows(selectedEntity);
    } else {
      requestSequence.current += 1;
      setRows([]);
      setLoading(false);
    }
    return () => { requestSequence.current += 1; };
  }, [selectedEntity?.id, accessKey]);

  if (!selectedEntity) {
    return <div className="card p-8 text-center text-sm text-text-secondary">Tidak ada katalog yang tersedia untuk akses aktif Anda.</div>;
  }

  // Extract displayable preview columns
  const sample = visibleRows[0] || {};
  const allKeys = Object.keys(sample);
  const previewColumns = allKeys.filter(k => !k.startsWith("_") && !["password", "token"].includes(k)).slice(0, 5);

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* ── Header ─────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <FolderArchive size={22} className="text-brand-green" /> Enterprise Repository & Document Catalog
          </h1>
          <p className="page-description flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <span>Pusat arsip digital, katalog data transaksi, dan dokumentasi operasional terintegrasi</span>
            <MarkaWordmark className="h-auto w-14 text-[#2649B3]" />
            <span>ERP</span>
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="px-3 py-1.5 rounded-xl bg-brand-light-green border border-brand-green/20 text-brand-deep-green text-xs font-bold flex items-center gap-1.5">
            <ShieldCheck size={13} /> Enterprise Archive · Single Source of Truth
          </span>
          {canManageAccess && (
            <Link
              href="/administration"
              className="btn-outline py-1.5 px-3 text-xs gap-1.5 text-purple-700 border-purple-200 hover:bg-purple-50"
              title="Kelola company, modul, dan akses user"
            >
              <Code size={13} /> {userRole === "super_admin" ? "Company & Access" : "User & Access"}
            </Link>
          )}
          <button
            onClick={() => fetchRows(selectedEntity)}
            disabled={loading}
            className="btn-ghost py-1.5 px-3 text-xs gap-1.5"
          >
            <RefreshCw size={14} className={cn(loading && "animate-spin")} /> Refresh
          </button>
        </div>
      </div>

      {/* ── Category Tabs ───────────────────────────── */}
      <div className="flex gap-2 border-b border-gray-200 pb-2 overflow-x-auto no-scrollbar">
        {CATEGORIES.filter((cat) => cat === "ALL" || accessibleEntities.some((entity) => entity.category === cat)).map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={cn(
              "px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap",
              effectiveCategory === cat
                ? "bg-slate-900 text-white shadow-xs"
                : "bg-white text-text-secondary border border-gray-200 hover:bg-gray-50"
            )}
          >
            {cat === "ALL" ? "Semua Kategori" : cat}
          </button>
        ))}
      </div>

      {/* ── Entity Selection Chips ──────────────────── */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {visibleEntities.map((entity) => (
          <button
            key={entity.id}
            onClick={() => {
              setSelectedEntityId(entity.id);
              setSearch("");
            }}
            className={cn(
              "px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border flex items-center gap-2 shadow-2xs",
              selectedEntity.id === entity.id
                ? "bg-brand-deep-green text-white border-brand-deep-green"
                : "bg-white text-text-secondary border-gray-200 hover:border-brand-green/60 hover:text-text-primary"
            )}
          >
            <span className={cn(
              "text-3xs px-1.5 py-0.5 rounded font-bold uppercase",
              selectedEntity.id === entity.id ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600"
            )}>
              {entity.category}
            </span>
            <span>{entity.name}</span>
          </button>
        ))}
      </div>

      {/* ── Active Catalog Overview & Search Bar ────── */}
      <div className="card p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 border border-gray-100 shadow-xs">
        <div className="flex flex-col gap-1 max-w-xl">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-text-primary">{selectedEntity.name}</h2>
            <span className="badge badge-neutral text-2xs">{selectedEntity.category}</span>
          </div>
          <p className="text-2xs text-text-secondary">{selectedEntity.description}</p>
        </div>

        <div className="flex items-center gap-2 flex-1 md:max-w-md">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <input
              type="text"
              placeholder={`Cari dalam ${selectedEntity.name}…`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchRows()}
              className="input text-xs py-2 pl-8.5 w-full rounded-xl"
            />
          </div>
          <button onClick={() => fetchRows()} className="btn-primary py-2 px-3 text-xs gap-1">
            Cari
          </button>
          {selectedEntity.moduleLink && canAccessRoute({ pathname: selectedEntity.moduleLink, ...accessContext }) && (
            <a
              href={selectedEntity.moduleLink}
              className="btn-ghost p-2 text-text-secondary hover:text-brand-green rounded-xl"
              title={`Buka Modul ${selectedEntity.category}`}
            >
              <ExternalLink size={15} />
            </a>
          )}
        </div>
      </div>

      {/* ── Table Data Container ─────────────────────── */}
      <div className="card rounded-2xl overflow-hidden p-1 border border-gray-100 shadow-xs">
        <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center text-xs text-text-secondary font-medium">
          <span>Menampilkan catatan aktif dari katalog <b>{selectedEntity.name}</b></span>
          <span className="badge badge-info text-2xs font-bold">{visibleRows.length} Dokumen / Record</span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-xs text-text-secondary animate-pulse flex flex-col items-center gap-2">
            <RefreshCw size={24} className="animate-spin text-brand-green opacity-40" />
            <span>Memuat arsip data dari server...</span>
          </div>
        ) : visibleLoadError ? (
          <div className="p-12 text-center text-sm text-text-secondary flex flex-col items-center gap-2" role="alert">
            <FolderArchive size={32} className="text-gray-300" />
            <span className="font-semibold text-slate-700">{visibleLoadError.message}</span>
            {visibleLoadError.status !== 403 && <button type="button" onClick={() => fetchRows()} className="btn-outline py-2 px-3 text-xs">Coba lagi</button>}
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="p-12 text-center text-xs text-text-secondary flex flex-col items-center gap-2">
            <FolderArchive size={32} className="text-gray-300" />
            <span className="font-semibold text-slate-700">Belum ada dokumen atau entri tersimpan pada katalog ini.</span>
            <span className="text-2xs text-text-tertiary">Data baru akan otomatis diarsipkan setelah transaksi diselesaikan di modul terkait.</span>
          </div>
        ) : (
          <div className="table-scroll-wrapper">
            <table className="w-full data-table text-xs min-w-[700px]">
              <thead>
                <tr className="bg-gray-50/70 border-b border-gray-100">
                  <th className="py-2.5 px-3 font-bold text-2xs text-text-secondary uppercase">ID / Referensi</th>
                  {previewColumns.map((col) => (
                    <th key={col} className="py-2.5 px-3 font-bold text-2xs text-text-secondary uppercase tracking-wider">
                      {col.replace(/_/g, " ")}
                    </th>
                  ))}
                  <th className="py-2.5 px-3 text-right font-bold text-2xs text-text-secondary uppercase">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visibleRows.map((row, idx) => (
                  <tr key={row.id || idx} className="hover:bg-brand-light-green/20 transition-colors">
                    <td className="py-2.5 px-3 font-mono font-bold text-text-secondary whitespace-nowrap">
                      #{String(row.id || idx + 1).slice(0, 10)}
                    </td>
                    {previewColumns.map((col) => {
                      const val = row[col];
                      const isMoney = col.toLowerCase().includes("amount") || col.toLowerCase().includes("cost") || col.toLowerCase().includes("total") || col.toLowerCase().includes("budget") || col.toLowerCase().includes("price");
                      const isStatus = col.toLowerCase().includes("status") || col.toLowerCase().includes("stage");

                      return (
                        <td key={col} className="py-2.5 px-3 max-w-[220px] truncate">
                          {isStatus ? (
                            <span className={cn("badge text-2xs font-bold", getStatusColor(String(val || "DRAFT")))}>
                              {String(val || "—")}
                            </span>
                          ) : isMoney && typeof val === "number" ? (
                            <span className="font-semibold text-slate-800 font-mono">{formatMoney(val)}</span>
                          ) : typeof val === "object" && val !== null ? (
                            <span className="text-text-secondary italic text-2xs">[Objek Terkait]</span>
                          ) : (
                            <span className="text-text-primary">{String(val ?? "—")}</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedRecord(row);
                          setShowJsonRaw(false);
                          setIsDetailOpen(true);
                        }}
                        className="btn-outline py-1 px-3 text-2xs gap-1 rounded-lg border-gray-200 hover:border-brand-green hover:text-brand-deep-green"
                      >
                        <Eye size={12} /> Detail Arsip
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal: Detail Arsip Dokumen ─────────────── */}
      <Modal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        title={`Arsip: ${selectedEntity.name}`}
        subtitle={`Record ID: #${selectedRecord?.id || "-"}`}
        size="lg"
      >
        <div className="flex flex-col gap-4 p-1">
          {/* Metadata Header */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/70 flex items-center justify-between flex-wrap gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="badge badge-neutral text-2xs uppercase font-bold">{selectedEntity.category}</span>
              <span className="font-semibold text-slate-800">{selectedEntity.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowJsonRaw(!showJsonRaw)}
                className="text-2xs text-brand-green hover:underline font-semibold flex items-center gap-1"
              >
                <Code size={11} /> {showJsonRaw ? "Tampilan Terstruktur" : "Inspeksi Raw JSON"}
              </button>
            </div>
          </div>

          {/* Body Content */}
          {showJsonRaw ? (
            <pre className="p-4 rounded-xl bg-gray-900 text-brand-primary-soft font-mono text-2xs overflow-x-auto max-h-96">
              {JSON.stringify(selectedRecord, null, 2)}
            </pre>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[420px] overflow-y-auto pr-1">
              {Object.entries(selectedRecord || {}).map(([k, v]) => {
                const isStatus = k.toLowerCase().includes("status") || k.toLowerCase().includes("stage");
                const isMoney = (k.toLowerCase().includes("amount") || k.toLowerCase().includes("cost") || k.toLowerCase().includes("total") || k.toLowerCase().includes("price")) && typeof v === "number";

                return (
                  <div key={k} className="p-2.5 rounded-xl border border-gray-100 bg-white flex flex-col gap-0.5">
                    <span className="text-3xs font-bold uppercase text-text-tertiary tracking-wider">
                      {k.replace(/_/g, " ")}
                    </span>
                    <div className="text-xs font-semibold text-slate-800 break-words">
                      {isStatus ? (
                        <span className={cn("badge text-2xs font-bold", getStatusColor(String(v || "—")))}>
                          {String(v || "—")}
                        </span>
                      ) : isMoney ? (
                        <span className="text-brand-deep-green font-mono font-bold">{formatMoney(v as number)}</span>
                      ) : typeof v === "object" && v !== null ? (
                        <pre className="text-3xs bg-gray-50 p-1.5 rounded overflow-x-auto text-gray-700">
                          {JSON.stringify(v, null, 1)}
                        </pre>
                      ) : (
                        String(v ?? "—")
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Footer actions */}
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setIsDetailOpen(false)}
              className="btn-primary py-1.5 px-4 text-xs"
            >
              Tutup
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
