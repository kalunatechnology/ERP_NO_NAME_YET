/**
 * File: frontend-next/components/finance/FixedAssetsWorkspace.tsx
 *
 * Purpose: Enterprise Fixed Assets Register & Straight-Line Depreciation Engine.
 * Features:
 *   - Executive Asset Portfolio KPIs (Cost Basis, Net Book Value, Accumulated Depr, Active Units)
 *   - Register Asset Modal with live IDR preview & category selector
 *   - Depreciation Schedule Preview across useful life
 *   - Single & Chunked Batch Depreciation with Idempotency Guard
 *   - Asset Disposal Engine with real-time Gain/Loss projection & GL Journal mapping
 */
"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import api from "@/lib/api/axios";
import { getUserFacingApiError } from "@/lib/api/error-message";
import { formatMoney, localDateKey, cn } from "@/lib/utils";
import { normalizeList } from "@/lib/api/auth.api";
import { Modal } from "@/components/ui/Modal";
import { IDRInput } from "@/components/ui/IDRInput";
import { CollapsibleGuideline } from "@/components/ui/CollapsibleGuideline";
import { FinanceSummarySection } from "@/components/finance/FinanceSummarySection";
import toast from "react-hot-toast";
import {
  Package,
  Plus,
  Search,
  Calendar,
  Layers,
  TrendingDown,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  Sparkles,
} from "lucide-react";

interface AssetCategory {
  id: string;
  category_code: string;
  category_name: string;
}

const DEFAULT_CATEGORIES: AssetCategory[] = [
  { id: "52584a1d-3527-42d3-a5b6-0b336da49124", category_code: "CAT-PROYEK", category_name: "Peralatan & Mesin Operasional Proyek" },
  { id: "ca60d25f-1f75-48bd-9b54-d943f8780afd", category_code: "CAT-IT", category_name: "Peralatan Komputer & Infrastruktur IT" },
  { id: "e59e8039-18b3-4f6a-b9eb-8902c4947f14", category_code: "CAT-KNDRN", category_name: "Kendaraan Operasional Perusahaan" },
  { id: "74ed9075-5f36-40ad-9886-83e45b505310", category_code: "CAT-FURN", category_name: "Perabot, Mebel & Peralatan Kantor" },
  { id: "97c5b37a-ab84-4df4-b4b7-f64f6363de8b", category_code: "CAT-BLD", category_name: "Bangunan & Prasarana Kantor" },
];

interface Asset {
  id: string;
  asset_code: string;
  asset_name: string;
  serial_number: string;
  status: string;
  acquisition_cost?: number;
  salvage_value?: number;
  useful_life_months?: number;
  acquisition_date?: string;
  available_for_use_date?: string;
  category_id?: string;
}

interface AssetBook {
  id: string;
  asset_id: string;
  net_book_value?: number;
  accumulated_depreciation?: number;
  cost_basis?: number;
  useful_life_periods?: number;
}

interface DepreciationLine {
  period_number: number;
  period_date: string;
  opening_book_value: number;
  depreciation_amount: number;
  accumulated_depreciation: number;
  closing_book_value: number;
  is_residual_adjustment: boolean;
}

interface BatchResult {
  total_assets: number;
  processed: number;
  skipped: number;
  errors: number;
  period_date: string;
  executed_at: string;
  details: Array<{ asset_id: string; asset_name: string; status: string; reason?: string }>;
}

export default function FixedAssetsWorkspace() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [books, setBooks] = useState<Record<string, AssetBook>>({});
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [activeTab, setActiveTab] = useState<"register" | "schedule" | "batch" | "categories">("register");

  // Modal: Add / Manage Category
  const [isAddCategoryModalOpen, setIsAddCategoryModalOpen] = useState(false);
  const [categoryForm, setCategoryForm] = useState({ category_code: "", category_name: "" });
  const [isSubmittingCategory, setIsSubmittingCategory] = useState(false);

  // Schedule View State
  const [scheduleAssetId, setScheduleAssetId] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<DepreciationLine[] | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  // Depreciation Period & Batch State
  const [depreciationPeriod, setDepreciationPeriod] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);
  const [batchLoading, setBatchLoading] = useState(false);
  const [singleDepAssetId, setSingleDepAssetId] = useState<string | null>(null);
  const [singleDepLoading, setSingleDepLoading] = useState(false);

  // Modal: Register Asset
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [registerForm, setRegisterForm] = useState({
    asset_code: "",
    asset_name: "",
    serial_number: "",
    category_id: "",
    acquisition_cost: 0,
    salvage_value: 0,
    useful_life_months: 48,
    acquisition_date: localDateKey(),
  });
  const [isSubmittingAsset, setIsSubmittingAsset] = useState(false);

  // Modal: Asset Disposal
  const [disposeAssetId, setDisposeAssetId] = useState<string | null>(null);
  const [disposeProceeds, setDisposeProceeds] = useState<number>(0);
  const [disposeDate, setDisposeDate] = useState(() => localDateKey());
  const [disposeLoading, setDisposeLoading] = useState(false);

  // Load Data
  const loadAssetsAndCategories = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: assetRes }, { data: catRes }] = await Promise.all([
        api.get("/api/v1/assets/assets?page=1&page_size=200"),
        api.get("/api/v1/assets/asset-categories?page=1&page_size=100"),
      ]);

      const assetList: Asset[] = normalizeList<Asset>(assetRes.data ?? assetRes).rows;
      const parsedCats = normalizeList<AssetCategory>(catRes.data ?? catRes).rows;
      const catList: AssetCategory[] = parsedCats.length > 0 ? parsedCats : DEFAULT_CATEGORIES;
      setAssets(assetList);
      setCategories(catList);
      setRegisterForm((prev) => (prev.category_id ? prev : { ...prev, category_id: catList[0]?.id ?? "" }));

      // Load books for each asset
      const bookMap: Record<string, AssetBook> = {};
      await Promise.allSettled(
        assetList.map(async (a) => {
          const { data: j } = await api.get(`/api/v1/assets/books?asset_id=${a.id}&page_size=1`);
          const book = normalizeList<AssetBook>(j?.data ?? j).rows[0];
          if (book) bookMap[a.id] = book;
        })
      );
      setBooks(bookMap);
    } catch (error) {
      toast.error(getUserFacingApiError(error, "Data aset tetap belum dapat dimuat. Periksa akses modul Aset dan coba lagi."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAssetsAndCategories();
  }, [loadAssetsAndCategories]);

  // Load Schedule for selected asset
  const buildLocalSchedule = (assetId: string): DepreciationLine[] => {
    const asset = assets.find((a) => a.id === assetId);
    if (!asset) return [];
    const book = books[assetId];
    const cost = Number(book?.cost_basis ?? asset.acquisition_cost ?? 0);
    const salvage = Number(asset.salvage_value ?? 0);
    const life = Number(book?.useful_life_periods ?? asset.useful_life_months ?? 0);
    const start = new Date(asset.available_for_use_date ?? asset.acquisition_date ?? new Date());
    if (!life || cost <= 0) return [];
    const monthly = Math.round(((cost - salvage) / life) * 100) / 100;
    const rows: DepreciationLine[] = [];
    let opening = cost;
    let accumulated = 0;
    for (let i = 0; i < life; i++) {
      const d = new Date(start);
      d.setMonth(d.getMonth() + i);
      const last = i === life - 1;
      const amount = last ? Math.max(opening - salvage, 0) : monthly;
      accumulated += amount;
      const closing = opening - amount;
      rows.push({
        period_number: i + 1,
        period_date: d.toISOString(),
        opening_book_value: opening,
        depreciation_amount: amount,
        accumulated_depreciation: accumulated,
        closing_book_value: closing,
        is_residual_adjustment: last,
      });
      opening = closing;
    }
    return rows;
  };

  const handleOpenSchedule = async (assetId: string) => {
    setScheduleAssetId(assetId);
    setScheduleLoading(true);
    setSchedule(null);
    setScheduleError(null);
    setActiveTab("schedule");
    try {
      const { data: json } = await api.get(`/api/v1/assets/assets/${assetId}/depreciation-schedule`);
      const payload = json?.schedule ? json : (json?.data ?? json);
      const serverRows: DepreciationLine[] = Array.isArray(payload?.schedule) ? payload.schedule : [];
      if (serverRows.length > 0) {
        setSchedule(serverRows);
      } else {
        setSchedule(buildLocalSchedule(assetId));
        setScheduleError("Server tidak mengembalikan jadwal; ditampilkan simulasi garis lurus dari data aset.");
      }
    } catch (err: any) {
      const reason = err?.response?.data?.detail || err?.response?.data?.message || err?.message || "Tidak diketahui";
      setSchedule(buildLocalSchedule(assetId));
      setScheduleError(`Jadwal dari server gagal dimuat (${reason}). Ditampilkan simulasi garis lurus dari data aset.`);
    } finally {
      setScheduleLoading(false);
    }
  };

  // Run Monthly Depreciation for Single Asset
  const handleRunSingleDepreciation = async (assetId: string) => {
    setSingleDepAssetId(assetId);
    setSingleDepLoading(true);
    try {
      const { data: json } = await api.post(`/api/v1/assets/assets/${assetId}/depreciate`, {
        period_date: depreciationPeriod,
      });
      const resData = json?.data ?? json;
      if (resData?.skipped) {
        toast((t) => (
          <span className="text-xs">
            <b>Info:</b> {resData.reason}
          </span>
        ), { icon: "ℹ️" });
      } else {
        toast.success(`Penyusutan berhasil diposting ke Jurnal GL.`);
        await loadAssetsAndCategories();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.detail || err.response?.data?.message || "Gagal menjalankan penyusutan aset.");
    } finally {
      setSingleDepLoading(false);
      setSingleDepAssetId(null);
    }
  };

  // Run Batch Depreciation
  const handleRunBatchDepreciation = async () => {
    setBatchLoading(true);
    setBatchResult(null);
    try {
      const { data: json } = await api.post("/api/v1/assets/assets/batch-depreciate", {
        period_date: depreciationPeriod,
      });
      const resData = json?.data ?? json;
      setBatchResult(resData);
      toast.success(`Batch selesai: ${resData?.processed ?? 0} diproses, ${resData?.skipped ?? 0} dilewati.`);
      setActiveTab("batch");
      await loadAssetsAndCategories();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || err.response?.data?.message || "Gagal menjalankan batch penyusutan.");
    } finally {
      setBatchLoading(false);
    }
  };

  // Add / Create Asset Category
  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryForm.category_code.trim() || !categoryForm.category_name.trim()) {
      toast.error("Kode dan nama kategori wajib diisi.");
      return;
    }
    setIsSubmittingCategory(true);
    try {
      const code = categoryForm.category_code.trim().toUpperCase();
      const res = await api.post("/api/v1/assets/asset-categories", {
        category_code: code,
        category_name: categoryForm.category_name.trim(),
      });
      const created = res.data?.data ?? res.data;
      toast.success(`Kategori ${categoryForm.category_name} berhasil ditambahkan!`);
      setIsAddCategoryModalOpen(false);
      setCategoryForm({ category_code: "", category_name: "" });
      await loadAssetsAndCategories();
      if (created?.id) {
        setRegisterForm((prev) => ({ ...prev, category_id: created.id }));
      }
    } catch (error) {
      toast.error(getUserFacingApiError(error, "Kategori aset belum dapat ditambahkan. Periksa kode dan nama kategori, lalu coba lagi."));
    } finally {
      setIsSubmittingCategory(false);
    }
  };

  // Create New Asset
  const handleCreateAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!registerForm.asset_name.trim() || !registerForm.asset_code.trim()) {
      toast.error("Kode dan nama aset wajib diisi.");
      return;
    }
    if (registerForm.acquisition_cost <= 0) {
      toast.error("Harga perolehan harus lebih dari Rp 0.");
      return;
    }

    setIsSubmittingAsset(true);
    try {
      await api.post("/api/v1/assets/assets", {
        asset_code: registerForm.asset_code.trim().toUpperCase(),
        asset_name: registerForm.asset_name.trim(),
        serial_number: registerForm.serial_number.trim() || "-",
        category_id: registerForm.category_id || (categories[0]?.id ?? null),
        acquisition_cost: Number(registerForm.acquisition_cost),
        salvage_value: Number(registerForm.salvage_value || 0),
        useful_life_months: Number(registerForm.useful_life_months || 48),
        acquisition_date: registerForm.acquisition_date,
        available_for_use_date: registerForm.acquisition_date,
        status: "ACTIVE",
      });

      toast.success("Aset tetap baru berhasil didaftarkan.");
      setIsRegisterModalOpen(false);
      setRegisterForm({
        asset_code: "",
        asset_name: "",
        serial_number: "",
        category_id: "",
        acquisition_cost: 0,
        salvage_value: 0,
        useful_life_months: 48,
        acquisition_date: localDateKey(),
      });
      await loadAssetsAndCategories();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Gagal mendaftarkan aset tetap.");
    } finally {
      setIsSubmittingAsset(false);
    }
  };

  // Execute Disposal
  const handleExecuteDisposal = async () => {
    if (!disposeAssetId) return;
    setDisposeLoading(true);
    try {
      const { data: json } = await api.post(`/api/v1/assets/assets/${disposeAssetId}/dispose`, {
        disposal_date: disposeDate,
        proceeds_amount: Number(disposeProceeds || 0),
      });
      const gl = json.data?.is_gain ? "Laba" : "Rugi";
      const amount = Math.abs(json.data?.gain_or_loss ?? 0);
      toast.success(`Aset berhasil dilepas. ${gl}: ${formatMoney(amount)}`);
      setDisposeAssetId(null);
      setDisposeProceeds(0);
      await loadAssetsAndCategories();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Gagal melakukan pelepasan aset.");
    } finally {
      setDisposeLoading(false);
    }
  };

  // Filtered Assets
  const filteredAssets = useMemo(() => {
    return assets.filter((asset) => {
      const q = searchQuery.toLowerCase();
      const matchQuery =
        asset.asset_code.toLowerCase().includes(q) ||
        asset.asset_name.toLowerCase().includes(q) ||
        (asset.serial_number && asset.serial_number.toLowerCase().includes(q));
      const matchCategory =
        categoryFilter === "ALL" || asset.category_id === categoryFilter;
      return matchQuery && matchCategory;
    });
  }, [assets, searchQuery, categoryFilter]);

  // Aggregate Metrics
  const totalCostBasis = useMemo(() => {
    return assets.reduce((sum, a) => {
      const b = books[a.id];
      return sum + Number(b?.cost_basis ?? a.acquisition_cost ?? 0);
    }, 0);
  }, [assets, books]);

  const totalNetBookValue = useMemo(() => {
    return assets.reduce((sum, a) => {
      const b = books[a.id];
      return sum + Number(b?.net_book_value ?? a.acquisition_cost ?? 0);
    }, 0);
  }, [assets, books]);

  const totalAccumulatedDepr = useMemo(() => {
    return assets.reduce((sum, a) => {
      const b = books[a.id];
      return sum + Number(b?.accumulated_depreciation ?? 0);
    }, 0);
  }, [assets, books]);

  const activeAssetsCount = useMemo(() => {
    return assets.filter((a) => a.status === "ACTIVE" || a.status.startsWith("ACTIVE_")).length;
  }, [assets]);

  const selectedScheduleAsset = assets.find((a) => a.id === scheduleAssetId);
  const selectedDisposeAsset = assets.find((a) => a.id === disposeAssetId);
  const disposeBook = selectedDisposeAsset ? books[selectedDisposeAsset.id] : null;
  const disposeNetBook = Number(disposeBook?.net_book_value ?? selectedDisposeAsset?.acquisition_cost ?? 0);
  const projectedGainLoss = Number(disposeProceeds || 0) - disposeNetBook;
  const assetTabOrder: Array<typeof activeTab> = ["register", "schedule", "batch", "categories"];
  const handleAssetTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const currentIndex = assetTabOrder.indexOf(activeTab);
    const nextIndex = event.key === "ArrowRight" ? (currentIndex + 1) % assetTabOrder.length
      : event.key === "ArrowLeft" ? (currentIndex - 1 + assetTabOrder.length) % assetTabOrder.length
        : event.key === "Home" ? 0
          : event.key === "End" ? assetTabOrder.length - 1 : -1;
    if (nextIndex < 0) return;
    event.preventDefault();
    const nextTab = assetTabOrder[nextIndex];
    setActiveTab(nextTab);
    requestAnimationFrame(() => document.getElementById(`fixed-assets-tab-${nextTab}`)?.focus());
  };

  const renderStatusBadge = (status: string) => {
    const s = status.toUpperCase();
    if (s === "ACTIVE" || s.startsWith("ACTIVE_") || s.includes("STUDIO") || s.includes("ONLINE")) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-2xs font-bold text-emerald-700">
          <CheckCircle2 size={11} /> Aktif Operasional
        </span>
      );
    }
    if (s === "DISPOSED") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-2xs font-bold text-rose-700">
          <Trash2 size={11} /> Dilepas (Disposed)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-2xs font-bold text-amber-700">
        <AlertTriangle size={11} /> {status}
      </span>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      {/* ── HEADER & TOOLBAR ───────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight text-[#0F172A]">
              Register & Penyusutan Aset Tetap
            </h2>
            <span className="inline-flex items-center gap-1 rounded-md bg-[#E7F2FF] px-2 py-0.5 text-2xs font-extrabold uppercase text-[#163D64]">
              <Sparkles size={11} /> Auto Straight-Line
            </span>
          </div>
          <p className="mt-0.5 text-xs text-[#6B7280]">
            Pencatatan aset, jadwal penyusutan garis lurus, eksekusi batch bulanan, dan auto-jurnal pelepasan (GL).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              const codeSuggestion = `AST-SMA-${String(assets.length + 1).padStart(3, "0")}`;
              setRegisterForm((f) => ({
                ...f,
                asset_code: codeSuggestion,
                category_id: categories[0]?.id ?? "",
              }));
              setIsRegisterModalOpen(true);
            }}
            className="btn-primary flex items-center gap-1.5 py-2 px-3.5 text-xs font-bold"
          >
            <Plus size={15} /> Register Aset Baru
          </button>

          <div className="flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white p-1 shadow-2xs">
            <span className="pl-2 text-2xs font-bold uppercase text-[#6B7280]">Periode:</span>
            <input
              type="date"
              value={depreciationPeriod}
              onChange={(e) => setDepreciationPeriod(e.target.value)}
              className="rounded-lg border-0 bg-transparent px-2 py-1 text-xs font-semibold text-[#0F172A] focus:outline-none"
            />
            <button
              type="button"
              onClick={handleRunBatchDepreciation}
              disabled={batchLoading}
              className="flex items-center gap-1 rounded-lg bg-[#163D64] px-3 py-1.5 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <RefreshCw size={13} className={batchLoading ? "animate-spin" : ""} />
              {batchLoading ? "Memproses..." : "Batch Susutkan"}
            </button>
          </div>
        </div>
      </div>

      <FinanceSummarySection
        title="Ringkasan Aset Tetap"
        subtitle="Nilai perolehan, nilai buku, penyusutan, dan jumlah aset terdaftar."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="card rounded-2xl border-l-4 border-blue-600 p-4 shadow-xs">
            <div className="flex items-center justify-between gap-2"><span className="text-xs font-bold uppercase tracking-wide text-text-secondary">Total Perolehan</span><Package size={16} className="shrink-0 text-blue-600" /></div>
            <div className="mt-1.5 break-words font-mono text-xl font-black tabular-nums text-blue-800">{formatMoney(totalCostBasis)}</div>
            <span className="mt-1 block text-xs text-text-secondary">Akumulasi nilai beli aset kapital</span>
          </div>

          <div className="card rounded-2xl border-l-4 border-brand-primary p-4 shadow-xs">
            <div className="flex items-center justify-between gap-2"><span className="text-xs font-bold uppercase tracking-wide text-text-secondary">Nilai Buku Bersih (NBV)</span><ArrowUpRight size={16} className="shrink-0 text-brand-primary" /></div>
            <div className="mt-1.5 break-words font-mono text-xl font-black tabular-nums text-brand-deep-green">{formatMoney(totalNetBookValue)}</div>
            <span className="mt-1 block text-xs text-text-secondary">Nilai aset bersih setelah penyusutan</span>
          </div>

          <div className="card rounded-2xl border-l-4 border-amber-500 p-4 shadow-xs">
            <div className="flex items-center justify-between gap-2"><span className="text-xs font-bold uppercase tracking-wide text-text-secondary">Akumulasi Penyusutan</span><TrendingDown size={16} className="shrink-0 text-amber-600" /></div>
            <div className="mt-1.5 break-words font-mono text-xl font-black tabular-nums text-amber-700">{formatMoney(totalAccumulatedDepr)}</div>
            <span className="mt-1 block text-xs text-text-secondary">Akun kontra aset (COA 1210)</span>
          </div>

          <div className="card rounded-2xl border-l-4 border-violet-600 p-4 shadow-xs">
            <div className="flex items-center justify-between gap-2"><span className="text-xs font-bold uppercase tracking-wide text-text-secondary">Aset Aktif Terdaftar</span><Layers size={16} className="shrink-0 text-violet-600" /></div>
            <div className="mt-1.5 font-mono text-xl font-black tabular-nums text-text-primary">{activeAssetsCount} Unit</div>
            <span className="mt-1 block text-xs text-text-secondary">Dari total {assets.length} inventaris</span>
          </div>
        </div>
      </FinanceSummarySection>

      {/* ── TABS NAVIGATION ─────────────────────────── */}
      <div role="tablist" aria-label="Bagian aset tetap" className="flex items-end gap-1 overflow-x-auto border-b border-slate-200">
        <button
          type="button"
          id="fixed-assets-tab-register"
          onClick={() => setActiveTab("register")}
          role="tab"
          aria-selected={activeTab === "register"}
          aria-controls="fixed-assets-panel-register"
          onKeyDown={handleAssetTabKeyDown}
          className={cn(
            "-mb-px inline-flex shrink-0 items-center rounded-t-xl border px-4 py-2.5 text-xs font-semibold transition-colors",
            activeTab === "register"
              ? "border-slate-200 border-b-white bg-white text-[#203D91] shadow-sm"
              : "border-transparent bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          )}
        >
          Daftar Aset ({assets.length})
        </button>

        <button
          type="button"
          id="fixed-assets-tab-schedule"
          onClick={() => setActiveTab("schedule")}
          role="tab"
          aria-selected={activeTab === "schedule"}
          aria-controls="fixed-assets-panel-schedule"
          onKeyDown={handleAssetTabKeyDown}
          className={cn(
            "-mb-px inline-flex shrink-0 items-center rounded-t-xl border px-4 py-2.5 text-xs font-semibold transition-colors",
            activeTab === "schedule"
              ? "border-slate-200 border-b-white bg-white text-[#203D91] shadow-sm"
              : "border-transparent bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          )}
        >
          Jadwal Penyusutan {selectedScheduleAsset ? `— ${selectedScheduleAsset.asset_code}` : ""}
        </button>

        <button
          type="button"
          id="fixed-assets-tab-batch"
          onClick={() => setActiveTab("batch")}
          role="tab"
          aria-selected={activeTab === "batch"}
          aria-controls="fixed-assets-panel-batch"
          onKeyDown={handleAssetTabKeyDown}
          className={cn(
            "-mb-px inline-flex shrink-0 items-center rounded-t-xl border px-4 py-2.5 text-xs font-semibold transition-colors",
            activeTab === "batch"
              ? "border-slate-200 border-b-white bg-white text-[#203D91] shadow-sm"
              : "border-transparent bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          )}
        >
          Hasil Batch {batchResult ? `(${batchResult.processed} Selesai)` : ""}
        </button>

        <button
          type="button"
          id="fixed-assets-tab-categories"
          onClick={() => setActiveTab("categories")}
          role="tab"
          aria-selected={activeTab === "categories"}
          aria-controls="fixed-assets-panel-categories"
          onKeyDown={handleAssetTabKeyDown}
          className={cn(
            "-mb-px inline-flex shrink-0 items-center rounded-t-xl border px-4 py-2.5 text-xs font-semibold transition-colors",
            activeTab === "categories"
              ? "border-slate-200 border-b-white bg-white text-[#203D91] shadow-sm"
              : "border-transparent bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          )}
        >
          Kategori Aset ({categories.length})
        </button>
      </div>

      {/* ── TAB 1: ASSET REGISTER TABLE ──────────────── */}
      {activeTab === "register" && (
        <div role="tabpanel" id="fixed-assets-panel-register" aria-labelledby="fixed-assets-tab-register" className="card rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-2xs">
          {/* Search & Filter Toolbar */}
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:w-72">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7280]" />
              <input
                type="text"
                placeholder="Cari kode, nama aset, nomor seri..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input pl-9 text-xs"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-2xs font-bold uppercase text-[#6B7280]">Kategori:</span>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="input w-auto text-xs font-semibold"
              >
                <option value="ALL">Semua Kategori ({categories.length})</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.category_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Data Table */}
          <div className="table-scroll-wrapper overflow-x-auto rounded-xl border border-gray-200">
            {loading ? (
              <div className="py-12 text-center text-xs text-[#6B7280] animate-pulse">
                Memuat data aset tetap dan saldo nilai buku...
              </div>
            ) : filteredAssets.length === 0 ? (
              <div className="py-12 text-center text-xs text-[#6B7280]">
                {searchQuery ? "Tidak ada aset yang cocok dengan pencarian." : "Belum ada aset tetap terdaftar. Klik '+ Register Aset Baru' untuk memulai."}
              </div>
            ) : (
              <table className="w-full data-table min-w-[1050px] text-left text-xs">
                <thead>
                  <tr className="border-b border-[#EFEFEF] text-[11px] font-extrabold uppercase tracking-wider text-[#6B7280]">
                    <th className="py-2.5 px-3">Kode</th>
                    <th className="py-2.5 px-3">Nama Aset & Kategori</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Harga Perolehan</th>
                    <th className="py-2.5 px-3 text-right">Nilai Buku (NBV)</th>
                    <th className="py-2.5 px-3 text-right">Akm. Penyusutan</th>
                    <th className="py-2.5 px-3 text-center">UE (Bulan)</th>
                    <th className="py-2.5 px-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EFEFEF]">
                  {filteredAssets.map((asset) => {
                    const book = books[asset.id];
                    const cat = categories.find((c) => c.id === asset.category_id);
                    const cost = Number(book?.cost_basis ?? asset.acquisition_cost ?? 0);
                    const nbv = Number(book?.net_book_value ?? asset.acquisition_cost ?? 0);
                    const akm = Number(book?.accumulated_depreciation ?? 0);
                    const ue = book?.useful_life_periods ?? asset.useful_life_months ?? 48;
                    const isOperating = asset.status === "ACTIVE" || asset.status.startsWith("ACTIVE_") || asset.status.includes("STUDIO") || asset.status.includes("ONLINE");

                    return (
                      <tr key={asset.id} className="transition-colors hover:bg-slate-50/70">
                        <td className="py-3 px-3 font-mono font-bold text-[#163D64]">
                          {asset.asset_code}
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-bold text-[#0F172A]">{asset.asset_name}</div>
                          <div className="text-2xs text-[#6B7280]">
                            {cat ? cat.category_name : "Peralatan Operasional"} · SN: {asset.serial_number || "—"}
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          {renderStatusBadge(asset.status)}
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-[#0F172A]">
                          {formatMoney(cost)}
                        </td>
                        <td className="py-3 px-3 text-right font-extrabold text-brand-deep-green">
                          {formatMoney(nbv)}
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-amber-600">
                          {formatMoney(akm)}
                        </td>
                        <td className="py-3 px-3 text-center font-bold text-[#64748B]">
                          {ue} bln
                        </td>
                        <td className="py-3 px-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenSchedule(asset.id)}
                              className="rounded-lg border border-[#BCDFFF] bg-[#E7F2FF] px-2.5 py-1 text-2xs font-bold text-[#163D64] hover:bg-[#d8edff] transition-colors"
                              title="Buka jadwal penyusutan"
                            >
                              Jadwal
                            </button>

                            {isOperating && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleRunSingleDepreciation(asset.id)}
                                  disabled={singleDepLoading && singleDepAssetId === asset.id}
                                  className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-2xs font-bold text-emerald-700 hover:bg-emerald-100 transition-colors disabled:opacity-50"
                                  title="Posting penyusutan bulan ini ke GL"
                                >
                                  {singleDepLoading && singleDepAssetId === asset.id ? "..." : "Susutkan"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDisposeAssetId(asset.id);
                                    setDisposeProceeds(0);
                                  }}
                                  className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-2xs font-bold text-rose-700 hover:bg-rose-100 transition-colors"
                                  title="Pelepasan aset (Disposal)"
                                >
                                  Lepas
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 2: DEPRECIATION SCHEDULE ─────────────── */}
      {activeTab === "schedule" && (
        <div role="tabpanel" id="fixed-assets-panel-schedule" aria-labelledby="fixed-assets-tab-schedule" className="card rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-2xs">
          {!scheduleAssetId ? (
            <div className="py-12 text-center text-xs text-[#6B7280]">
              Silakan pilih salah satu aset dari tab <b>Daftar Aset</b> dan klik tombol <b>Jadwal</b> untuk melihat simulasi penyusutan.
            </div>
          ) : scheduleLoading ? (
            <div className="py-12 text-center text-xs text-[#6B7280] animate-pulse">
              Menghitung jadwal penyusutan sepanjang umur ekonomis aset...
            </div>
          ) : schedule && schedule.length > 0 ? (
            <div>
              <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between border-b border-[#EFEFEF] pb-3">
                <div>
                  <h3 className="text-sm font-bold text-[#0F172A]">
                    Jadwal Penyusutan Garis Lurus: <span className="text-[#163D64]">{selectedScheduleAsset?.asset_name}</span>
                  </h3>
                  <p className="text-2xs text-[#6B7280]">
                    Kode: <b>{selectedScheduleAsset?.asset_code}</b> · Total Periode: <b>{schedule.length} Bulan</b>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab("register")}
                  className="rounded-lg bg-slate-100 px-3 py-1.5 text-2xs font-bold text-[#64748B] hover:bg-slate-200"
                >
                  ← Kembali ke Daftar
                </button>
              </div>

              {scheduleError && (
                <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-2xs font-semibold text-amber-800">
                  {scheduleError}
                </div>
              )}

              <div className="table-scroll-wrapper max-h-[500px] overflow-auto rounded-xl border border-gray-200">
                <table className="w-full data-table min-w-[800px] text-left text-xs">
                  <thead className="sticky top-0 bg-white shadow-2xs">
                    <tr className="border-b border-[#E2E8F0] text-[11px] font-extrabold uppercase tracking-wider text-[#6B7280]">
                      <th className="py-2 px-3 text-center">Bulan Ke-</th>
                      <th className="py-2 px-3">Periode</th>
                      <th className="py-2 px-3 text-right">Nilai Buku Awal</th>
                      <th className="py-2 px-3 text-right">Beban Penyusutan</th>
                      <th className="py-2 px-3 text-right">Akm. Penyusutan</th>
                      <th className="py-2 px-3 text-right">Nilai Buku Akhir</th>
                      <th className="py-2 px-3 text-center">Catatan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EFEFEF]">
                    {schedule.map((row) => (
                      <tr key={row.period_number} className="transition-colors hover:bg-slate-50">
                        <td className="py-2 px-3 text-center font-mono font-bold text-[#6B7280]">
                          {row.period_number}
                        </td>
                        <td className="py-2 px-3 font-semibold text-[#0F172A]">
                          {new Date(row.period_date).toLocaleDateString("id-ID", { month: "short", year: "numeric" })}
                        </td>
                        <td className="py-2 px-3 text-right font-medium text-[#64748B]">
                          {formatMoney(row.opening_book_value)}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-amber-600">
                          {formatMoney(row.depreciation_amount)}
                        </td>
                        <td className="py-2 px-3 text-right font-medium text-rose-600">
                          {formatMoney(row.accumulated_depreciation)}
                        </td>
                        <td className="py-2 px-3 text-right font-extrabold text-brand-deep-green">
                          {formatMoney(row.closing_book_value)}
                        </td>
                        <td className="py-2 px-3 text-center">
                          {row.is_residual_adjustment ? (
                            <span className="rounded bg-yellow-100 px-1.5 py-0.5 text-3xs font-extrabold text-yellow-800">
                              Residual Adj.
                            </span>
                          ) : (
                            <span className="text-3xs text-[#6B7280]">Reguler</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-xs text-[#6B7280]">
              {scheduleError || "Tidak ada data jadwal tersedia untuk aset ini."}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 3: BATCH RESULT ─────────────────────── */}
      {activeTab === "batch" && (
        <div role="tabpanel" id="fixed-assets-panel-batch" aria-labelledby="fixed-assets-tab-batch" className="card rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-2xs">
          {!batchResult ? (
            <div className="py-12 text-center text-xs text-[#6B7280]">
              Pilih periode di kanan atas dan klik <b>Batch Susutkan</b> untuk menjalankan eksekusi massal.
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <FinanceSummarySection title="Ringkasan Hasil Batch" subtitle={`Eksekusi penyusutan periode ${new Date(batchResult.period_date).toLocaleDateString("id-ID", { month: "long", year: "numeric" })}.`}>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="card rounded-2xl border-l-4 border-blue-600 p-4 shadow-xs"><span className="text-xs font-bold uppercase tracking-wide text-text-secondary">Total Aset</span><div className="mt-1.5 font-mono text-xl font-black tabular-nums text-blue-800">{batchResult.total_assets}</div></div>
                  <div className="card rounded-2xl border-l-4 border-emerald-600 p-4 shadow-xs"><span className="text-xs font-bold uppercase tracking-wide text-text-secondary">Diproses</span><div className="mt-1.5 font-mono text-xl font-black tabular-nums text-emerald-700">{batchResult.processed}</div></div>
                  <div className="card rounded-2xl border-l-4 border-amber-500 p-4 shadow-xs"><span className="text-xs font-bold uppercase tracking-wide text-text-secondary">Dilewati</span><div className="mt-1.5 font-mono text-xl font-black tabular-nums text-amber-700">{batchResult.skipped}</div><span className="mt-1 block text-xs text-text-secondary">Aset sudah diproses</span></div>
                  <div className="card rounded-2xl border-l-4 border-rose-600 p-4 shadow-xs"><span className="text-xs font-bold uppercase tracking-wide text-text-secondary">Gagal / Error</span><div className="mt-1.5 font-mono text-xl font-black tabular-nums text-rose-700">{batchResult.errors}</div></div>
                </div>
              </FinanceSummarySection>

              <div className="table-scroll-wrapper max-h-72 overflow-auto rounded-xl border border-gray-200">
                <table className="w-full data-table min-w-[580px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] text-[11px] font-extrabold uppercase tracking-wider text-[#6B7280]">
                      <th className="py-2 px-3">Nama Aset</th>
                      <th className="py-2 px-3">Status Batch</th>
                      <th className="py-2 px-3">Keterangan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EFEFEF]">
                    {batchResult.details.map((d, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-semibold text-[#0F172A]">{d.asset_name}</td>
                        <td className="py-2 px-3">
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-2xs font-bold",
                              d.status === "PROCESSED"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : d.status === "SKIPPED"
                                ? "bg-amber-50 text-amber-700 border border-amber-200"
                                : "bg-rose-50 text-rose-700 border border-rose-200"
                            )}
                          >
                            {d.status}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-[#6B7280]">{d.reason ?? "Penyusutan berhasil dicatat."}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 4: ASSET CATEGORIES ──────────────────── */}
      {activeTab === "categories" && (
        <div role="tabpanel" id="fixed-assets-panel-categories" aria-labelledby="fixed-assets-tab-categories" className="card rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-2xs">
          <div className="flex items-center justify-between flex-wrap gap-3 pb-4 border-b border-gray-100 mb-4">
            <div>
              <h3 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                <Layers size={16} className="text-[#163D64]" /> Master Kategori Aset Tetap
              </h3>
              <p className="text-xs text-[#6B7280] mt-0.5">
                Kategori aset mengelompokkan aktiva kapital dan menghubungkan akun buku besar aset tetap &amp; akumulasi depresiasi.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsAddCategoryModalOpen(true)}
              className="btn-primary flex items-center gap-1.5 py-2 px-3.5 text-xs font-bold"
            >
              <Plus size={14} /> Tambah Kategori Baru
            </button>
          </div>

          <div className="table-scroll-wrapper border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full data-table text-xs text-left">
              <thead>
                <tr className="bg-gray-50 text-2xs uppercase tracking-wider text-[#6B7280] border-b">
                  <th className="py-3 px-4 font-bold">Kode Kategori</th>
                  <th className="py-3 px-4 font-bold">Nama Kategori</th>
                  <th className="py-3 px-4 font-bold">Akun Aset (COA)</th>
                  <th className="py-3 px-4 font-bold">Akun Akum. Penyusutan</th>
                  <th className="py-3 px-4 font-bold text-center">Unit Terdaftar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {categories.map((c) => {
                  const count = assets.filter((a) => a.category_id === c.id || a.category_id === c.category_code).length;
                  return (
                    <tr key={c.id} className="hover:bg-slate-50/60">
                      <td className="py-3 px-4 font-mono font-bold text-[#163D64]">
                        {c.category_code}
                      </td>
                      <td className="py-3 px-4 font-semibold text-[#0F172A]">
                        {c.category_name}
                      </td>
                      <td className="py-3 px-4 font-mono text-2xs text-[#6B7280]">
                        1200 · Aset Tetap (Fixed Assets)
                      </td>
                      <td className="py-3 px-4 font-mono text-2xs text-[#6B7280]">
                        1210 · Akumulasi Penyusutan
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="badge badge-neutral text-2xs font-bold py-0.5 px-2">
                          {count} Unit
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── MODAL: REGISTER ASET TETAP ────────────────── */}
      <Modal
        isOpen={isRegisterModalOpen}
        onClose={() => setIsRegisterModalOpen(false)}
        title="Register Aset Tetap Baru"
        subtitle="Input data perolehan aset kapital dan otomatis buat GAAP Asset Book"
        size="lg"
      >
        <form onSubmit={handleCreateAsset} className="flex flex-col gap-4">
          <CollapsibleGuideline title="Informasi pembentukan aset otomatis">
              Aset akan otomatis dibuatkan Commercial Asset Book dengan metode garis lurus (Straight-Line)
              dan terhubung ke akun COA Aset Tetap (1200) & Akumulasi Penyusutan (1210).
          </CollapsibleGuideline>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-[#0F172A] block mb-1">
                Kode Aset *
              </label>
              <input
                type="text"
                required
                value={registerForm.asset_code}
                onChange={(e) => setRegisterForm({ ...registerForm, asset_code: e.target.value })}
                placeholder="Contoh: AST-SMA-006"
                className="input font-mono font-bold text-xs"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-[#0F172A]">
                  Kategori Aset *
                </label>
                <button
                  type="button"
                  onClick={() => setIsAddCategoryModalOpen(true)}
                  className="text-2xs font-bold text-[#163D64] hover:underline flex items-center gap-1"
                >
                  <Plus size={11} /> Tambah Kategori
                </button>
              </div>
              <select
                value={registerForm.category_id}
                onChange={(e) => {
                  if (e.target.value === "__NEW__") {
                    setIsAddCategoryModalOpen(true);
                  } else {
                    setRegisterForm({ ...registerForm, category_id: e.target.value });
                  }
                }}
                className="input text-xs font-semibold"
                required
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.category_name} ({c.category_code})
                  </option>
                ))}
                <option value="__NEW__">➕ Tambah Kategori Baru...</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-[#0F172A] block mb-1">
              Nama Aset / Inventaris *
            </label>
            <input
              type="text"
              required
              value={registerForm.asset_name}
              onChange={(e) => setRegisterForm({ ...registerForm, asset_name: e.target.value })}
              placeholder="Contoh: Kamera Sony FX3 Cinema Line Full Kit"
              className="input text-xs font-semibold"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-[#0F172A] block mb-1">
                Nomor Seri / Serial Number
              </label>
              <input
                type="text"
                value={registerForm.serial_number}
                onChange={(e) => setRegisterForm({ ...registerForm, serial_number: e.target.value })}
                placeholder="Contoh: SN-88234-JKT"
                className="input text-xs font-mono"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[#0F172A] block mb-1">
                Tanggal Perolehan *
              </label>
              <input
                type="date"
                required
                value={registerForm.acquisition_date}
                onChange={(e) => setRegisterForm({ ...registerForm, acquisition_date: e.target.value })}
                className="input text-xs font-semibold"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-bold text-[#0F172A] block mb-1">
                Harga Perolehan *
              </label>
              <IDRInput
                required
                value={registerForm.acquisition_cost === 0 ? "" : registerForm.acquisition_cost}
                onChange={(amount) =>
                  setRegisterForm({
                    ...registerForm,
                    acquisition_cost: amount === "" ? 0 : Number(amount),
                  })
                }
                placeholder="150.000.000"
                className="input text-xs font-bold text-[#0F172A]"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[#0F172A] block mb-1">
                Nilai Residu / Salvage
              </label>
              <IDRInput
                value={registerForm.salvage_value === 0 ? "" : registerForm.salvage_value}
                onChange={(amount) =>
                  setRegisterForm({
                    ...registerForm,
                    salvage_value: amount === "" ? 0 : Number(amount),
                  })
                }
                placeholder="0"
                className="input text-xs font-bold text-[#0F172A]"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[#0F172A] block mb-1">
                Umur Ekonomis (Bulan) *
              </label>
              <select
                value={registerForm.useful_life_months}
                onChange={(e) => setRegisterForm({ ...registerForm, useful_life_months: Number(e.target.value) })}
                className="input text-xs font-semibold"
              >
                <option value={12}>12 Bulan (1 Tahun)</option>
                <option value={24}>24 Bulan (2 Tahun)</option>
                <option value={36}>36 Bulan (3 Tahun)</option>
                <option value={48}>48 Bulan (4 Tahun - Kelompok 1)</option>
                <option value={60}>60 Bulan (5 Tahun)</option>
                <option value={96}>96 Bulan (8 Tahun - Kelompok 2)</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-[#EFEFEF] pt-3 mt-2">
            <button
              type="button"
              onClick={() => setIsRegisterModalOpen(false)}
              className="rounded-xl border border-[#E2E8F0] px-4 py-2 text-xs font-semibold text-[#64748B] hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmittingAsset}
              className="btn-primary py-2 px-5 text-xs font-bold disabled:opacity-50"
            >
              {isSubmittingAsset ? "Mendaftarkan..." : "Simpan & Daftarkan Aset"}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── MODAL: PELEPASAN ASET (DISPOSAL) ─────────── */}
      <Modal
        isOpen={Boolean(disposeAssetId)}
        onClose={() => setDisposeAssetId(null)}
        title="Pelepasan Aset Tetap (Asset Disposal)"
        subtitle={`Aset: ${selectedDisposeAsset?.asset_name} (${selectedDisposeAsset?.asset_code})`}
        size="md"
      >
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3 text-xs text-rose-800 flex items-start gap-2">
            <Trash2 size={16} className="shrink-0 mt-0.5 text-rose-600" />
            <span>
              Pelepasan aset akan menghentikan jadwal penyusutan dan secara otomatis menerbitkan Jurnal GL
              pengakuan <b>Laba / Rugi Pelepasan Aset</b> berdasarkan selisih harga jual dan nilai buku.
            </span>
          </div>

          <div className="rounded-xl border border-[#E2E8F0] bg-slate-50 p-3 grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-2xs text-[#6B7280] block">Harga Perolehan Awal</span>
              <strong className="text-[#0F172A]">
                {formatMoney(Number(selectedDisposeAsset?.acquisition_cost || 0))}
              </strong>
            </div>
            <div>
              <span className="text-2xs text-[#6B7280] block">Nilai Buku Saat Ini (NBV)</span>
              <strong className="text-brand-deep-green font-black">
                {formatMoney(disposeNetBook)}
              </strong>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-[#0F172A] block mb-1">
                Tanggal Pelepasan *
              </label>
              <input
                type="date"
                required
                value={disposeDate}
                onChange={(e) => setDisposeDate(e.target.value)}
                className="input text-xs font-semibold"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[#0F172A] block mb-1">
                Hasil Penjualan / Proceeds *
              </label>
              <IDRInput
                required
                value={disposeProceeds === 0 ? "" : disposeProceeds}
                onChange={(amount) => setDisposeProceeds(amount === "" ? 0 : Number(amount))}
                placeholder="150.000.000"
                className="input text-xs font-bold text-[#0F172A]"
              />
            </div>
          </div>

          {/* Real-time Gain/Loss Simulation */}
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-3 text-xs">
            <div className="text-2xs font-extrabold uppercase text-[#6B7280] mb-1">
              Proyeksi Pengakuan GL:
            </div>
            <div className="flex items-center justify-between font-bold">
              <span>Status Hasil Pelepasan:</span>
              <span
                className={cn(
                  "px-2 py-0.5 rounded-full text-2xs font-black",
                  projectedGainLoss >= 0
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-rose-50 text-rose-700 border border-rose-200"
                )}
              >
                {projectedGainLoss >= 0 ? "LABA PELEPASAN ASET (4200)" : "RUGI PELEPASAN ASET (6200)"}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs font-black">
              <span>Nominal Selisih:</span>
              <span className={projectedGainLoss >= 0 ? "text-emerald-700" : "text-rose-700"}>
                {formatMoney(Math.abs(projectedGainLoss))}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-[#EFEFEF] pt-3 mt-2">
            <button
              type="button"
              onClick={() => setDisposeAssetId(null)}
              className="rounded-xl border border-[#E2E8F0] px-4 py-2 text-xs font-semibold text-[#64748B] hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleExecuteDisposal}
              disabled={disposeLoading}
              className="rounded-xl bg-rose-600 px-5 py-2 text-xs font-bold text-white hover:bg-rose-700 transition-colors disabled:opacity-50"
            >
              {disposeLoading ? "Memproses Pelepasan..." : "Konfirmasi Pelepasan Aset"}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── MODAL: TAMBAH KATEGORI ASET ──────────────── */}
      <Modal
        isOpen={isAddCategoryModalOpen}
        onClose={() => setIsAddCategoryModalOpen(false)}
        title="Tambah Kategori Aset Baru"
        subtitle="Buat klasifikasi aset baru untuk pengelompokan inventaris dan depresiasi"
        size="md"
      >
        <form onSubmit={handleCreateCategory} className="flex flex-col gap-4">
          <CollapsibleGuideline title="Informasi akun untuk kategori aset">
              Kategori baru akan otomatis dihubungkan ke akun buku besar standar Aset Tetap (1200),
              Akumulasi Penyusutan (1210), dan Beban Operasional (6200).
          </CollapsibleGuideline>

          <div>
            <label className="text-xs font-bold text-[#0F172A] block mb-1">
              Kode Kategori *
            </label>
            <input
              type="text"
              required
              placeholder="Contoh: CAT-ELEKTRONIK"
              value={categoryForm.category_code}
              onChange={(e) => setCategoryForm({ ...categoryForm, category_code: e.target.value })}
              className="input font-mono font-bold text-xs uppercase"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-[#0F172A] block mb-1">
              Nama Kategori *
            </label>
            <input
              type="text"
              required
              placeholder="Contoh: Peralatan Elektronik & Dokumentasi"
              value={categoryForm.category_name}
              onChange={(e) => setCategoryForm({ ...categoryForm, category_name: e.target.value })}
              className="input text-xs font-semibold"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setIsAddCategoryModalOpen(false)}
              className="btn-ghost py-2 px-4 text-xs font-semibold"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmittingCategory}
              className="btn-primary py-2 px-5 text-xs font-bold"
            >
              {isSubmittingCategory ? "Menyimpan..." : "Simpan Kategori"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
