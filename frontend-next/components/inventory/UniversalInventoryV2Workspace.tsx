"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  Layers,
  Lock,
  PackageCheck,
  Plus,
  RefreshCw,
  ShieldCheck,
  Truck,
  UserCheck,
} from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api/axios";
import { getUserFacingApiError } from "@/lib/api/error-message";
import { formatMoney } from "@/lib/utils";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { TablePagination, TableSearchBar, useTablePagination } from "@/components/ui/TablePagination";

interface UniversalInventoryV2Props {
  mode: "overview" | "transfers" | "reservations" | "assets";
  users?: Array<{ id: string; full_name?: string; email: string }>;
  onRefreshParent?: () => void;
}

export function UniversalInventoryV2Workspace({
  mode,
  onRefreshParent,
}: UniversalInventoryV2Props) {
  const [perspective, setPerspective] = useState<"executive" | "operational">("executive");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [reconciliation, setReconciliation] = useState<any>(null);
  const [verifyingRec, setVerifyingRec] = useState(false);

  // Quick Stock Move (Receipt / Issue)
  const [moveForm, setMoveForm] = useState({
    move_type: "RECEIPT",
    product_id: "",
    source_location_id: "",
    destination_location_id: "",
    quantity: "10",
    unit_cost: "100000",
    condition_status: "GOOD",
  });
  const [submittingMove, setSubmittingMove] = useState(false);

  // 3-Event Transfer Form
  const [transferForm, setTransferForm] = useState({
    source_location_id: "",
    destination_location_id: "",
    product_id: "",
    requested_quantity: "5",
    notes: "",
  });
  const [submittingTransfer, setSubmittingTransfer] = useState(false);

  // Receive Modal / Inline state per transfer
  const [receiveInputs, setReceiveInputs] = useState<
    Record<string, { good: string; damaged: string }>
  >({});

  // 2-Stage Reservation Form
  const [resvForm, setResvForm] = useState({
    product_id: "",
    warehouse_location_id: "",
    quantity: "2",
    source_type: "PROJECT_MATERIAL",
    source_reference_id: "",
  });
  const [submittingResv, setSubmittingResv] = useState(false);

  // Asset Capitalization & Custodian Form
  const [capForm, setCapForm] = useState({
    product_id: "",
    serial_number: "",
    warehouse_location_id: "",
    acquisition_cost: "15000000",
    useful_life_months: "48",
  });
  const [custodianForm, setCustodianForm] = useState({
    asset_id: "",
    assignment_type: "HANDOVER",
    custodian_user_id: "",
    location_id: "",
    condition_status: "GOOD",
    notes: "",
  });

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/api/v1/inventory/overview");
      setData(res.data || {});
    } catch (error) {
      toast.error(getUserFacingApiError(error, "Gagal memuat data Universal Inventory V2."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const handleVerifyReconciliation = async () => {
    setVerifyingRec(true);
    try {
      const res = await api.post("/api/v1/inventory/reconcile/verify", {});
      setReconciliation(res.data);
      if (res.data?.reconciled) {
        toast.success("Rekonsiliasi 3-Arah (Ledger == Balance == Valuation Layer) 100% Konsisten!");
      } else {
        toast.error(`Ditemukan ${res.data?.discrepancy_count || 0} selisih rekonsiliasi.`);
      }
    } catch (error) {
      toast.error(getUserFacingApiError(error, "Gagal menjalankan verifikasi rekonsiliasi."));
    } finally {
      setVerifyingRec(false);
    }
  };

  const handleQuickMoveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!moveForm.product_id) return toast.error("Pilih produk terlebih dahulu.");
    setSubmittingMove(true);
    try {
      const moveRes = await api.post("/api/v1/inventory/stock-moves", {
        move_type: moveForm.move_type,
        source_location_id: moveForm.move_type === "RECEIPT" ? null : moveForm.source_location_id || null,
        destination_location_id: moveForm.move_type === "ISSUE" ? null : moveForm.destination_location_id || null,
        scheduled_at: new Date().toISOString(),
        status: "DRAFT",
      });
      const moveId = moveRes.data?.data?.id ?? moveRes.data?.id;
      const prod = (data?.products || []).find((p: any) => p.id === moveForm.product_id);
      await api.post("/api/v1/inventory/stock-move-lines", {
        stock_move_id: moveId,
        product_id: moveForm.product_id,
        quantity: Number(moveForm.quantity),
        uom_id: prod?.base_uom_id || null,
        unit_cost: Number(moveForm.unit_cost || 0),
      });
      await api.post(`/api/v1/inventory/movements/${moveId}/post`, {
        condition_status: moveForm.condition_status,
      });
      toast.success(`Mutasi stok (${moveForm.move_type}) berhasil diposting ke Ledger & Saldo K.`);
      await loadOverview();
      onRefreshParent?.();
    } catch (error) {
      toast.error(getUserFacingApiError(error, "Gagal memposting mutasi stok."));
    } finally {
      setSubmittingMove(false);
    }
  };

  const handleCreateTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferForm.source_location_id || !transferForm.destination_location_id || !transferForm.product_id) {
      return toast.error("Lengkapi lokasi asal, lokasi tujuan, dan produk.");
    }
    setSubmittingTransfer(true);
    try {
      await api.post("/api/v1/inventory/transfers", {
        source_location_id: transferForm.source_location_id,
        destination_location_id: transferForm.destination_location_id,
        notes: transferForm.notes,
        lines: [
          {
            product_id: transferForm.product_id,
            requested_quantity: Number(transferForm.requested_quantity),
          },
        ],
      });
      toast.success("Dokumen Transfer Antar-Gudang berhasil dibuat.");
      setTransferForm((p) => ({ ...p, notes: "" }));
      await loadOverview();
    } catch (error) {
      toast.error(getUserFacingApiError(error, "Gagal membuat dokumen transfer."));
    } finally {
      setSubmittingTransfer(false);
    }
  };

  const handleTransferAction = async (
    transferId: string,
    action: "approve" | "dispatch" | "receive" | "resolve-discrepancy",
    lineId?: string,
    defaultRemaining?: number,
  ) => {
    try {
      let payload: any = {};
      if (action === "receive" && lineId) {
        const inp = receiveInputs[lineId] || {
          good: String(defaultRemaining ?? 0),
          damaged: "0",
        };
        payload = {
          receipt_lines: [
            {
              line_id: lineId,
              received_good_quantity: Number(inp.good || 0),
              received_damaged_quantity: Number(inp.damaged || 0),
            },
          ],
        };
      }
      await api.post(`/api/v1/inventory/transfers/${transferId}/${action}`, payload);
      toast.success(`Aksi transfer '${action.toUpperCase()}' berhasil dijalankan.`);
      await loadOverview();
    } catch (error) {
      toast.error(getUserFacingApiError(error, `Gagal menjalankan aksi ${action}.`));
    }
  };

  const handleCreateReservation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resvForm.product_id || !resvForm.warehouse_location_id) {
      return toast.error("Pilih produk dan lokasi gudang.");
    }
    setSubmittingResv(true);
    try {
      await api.post("/api/v1/inventory/reservations/reserve", {
        ...resvForm,
        quantity: Number(resvForm.quantity),
      });
      toast.success("Tahap 1 (Soft-Lock Reservation) berhasil mengunci kuota Available(K).");
      await loadOverview();
    } catch (error) {
      toast.error(getUserFacingApiError(error, "Gagal membuat reservasi stok."));
    } finally {
      setSubmittingResv(false);
    }
  };

  const handleReservationAction = async (
    id: string,
    action: "allocate" | "fulfill" | "release",
  ) => {
    try {
      await api.post(`/api/v1/inventory/reservations/${id}/${action}`, {});
      toast.success(`Status reservasi diperbarui (${action.toUpperCase()}).`);
      await loadOverview();
    } catch (error) {
      toast.error(getUserFacingApiError(error, `Gagal memproses ${action} reservasi.`));
    }
  };

  const handleCapitalizeAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!capForm.product_id) return toast.error("Pilih produk terlebih dahulu.");
    try {
      const res = await api.post("/api/v1/inventory/assets/capitalize", {
        product_id: capForm.product_id,
        serial_number: capForm.serial_number,
        warehouse_location_id: capForm.warehouse_location_id || null,
        acquisition_cost: Number(capForm.acquisition_cost || 0),
        useful_life_months: Number(capForm.useful_life_months || 48),
      });
      toast.success(
        res.data?.idempotentReplay
          ? "Idempotent Replay: Aset dengan nomor seri ini sudah terdaftar."
          : "Aset Tetap berhasil dikapitalisasi dari Inventori!",
      );
      await loadOverview();
    } catch (error) {
      toast.error(getUserFacingApiError(error, "Gagal mengkapitalisasi aset."));
    }
  };

  const handleAssignCustodian = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!custodianForm.asset_id) return toast.error("Pilih aset terlebih dahulu.");
    try {
      await api.post(`/api/v1/inventory/assets/${custodianForm.asset_id}/assign-custodian`, {
        assignment_type: custodianForm.assignment_type,
        custodian_user_id: custodianForm.custodian_user_id || null,
        location_id: custodianForm.location_id || null,
        condition_status: custodianForm.condition_status,
        notes: custodianForm.notes,
      });
      toast.success("Serah-terima Custodian Aset berhasil dicatat.");
      await loadOverview();
    } catch (error) {
      toast.error(getUserFacingApiError(error, "Gagal mencatat perubahan custodian aset."));
    }
  };

  const kpis = data?.kpis || {};
  const aging = data?.aging_buckets || {};
  const balances: any[] = useMemo(() => data?.balances || [], [data?.balances]);
  const transfers: any[] = useMemo(() => data?.transfers || [], [data?.transfers]);
  const reservations: any[] = useMemo(() => data?.reservations || [], [data?.reservations]);
  const assets: any[] = useMemo(() => data?.assets || [], [data?.assets]);
  const assetHistory: any[] = data?.asset_assignment_history || [];
  const products: any[] = useMemo(() => data?.products || [], [data?.products]);
  const locations: any[] = useMemo(() => data?.locations || [], [data?.locations]);
  const lowStockAlerts: any[] = data?.low_stock_alerts || [];

  const balancesTable = useTablePagination(
    balances,
    useCallback(
      (b, q) =>
        `${b.product_code || ""} ${b.product_name || ""} ${b.location_code || ""} ${b.location_name || ""} ${b.location_purpose || ""} ${b.condition_status || ""} ${b.stock_status || ""}`
          .toLowerCase()
          .includes(q),
      []
    )
  );
  const transfersTable = useTablePagination(
    transfers,
    useCallback(
      (trf, q) =>
        `${trf.transfer_number || ""} ${trf.source_location_name || ""} ${trf.destination_location_name || ""} ${trf.product_code || ""} ${trf.product_name || ""} ${trf.status || ""}`
          .toLowerCase()
          .includes(q),
      []
    )
  );
  const reservationsTable = useTablePagination(
    reservations,
    useCallback(
      (r, q) => {
        const prod = products.find((p: any) => p.id === r.product_id);
        return `${prod?.product_code || ""} ${prod?.product_name || ""} ${r.source_type || ""} ${r.status || ""}`
          .toLowerCase()
          .includes(q);
      },
      [products]
    )
  );
  const assetsTable = useTablePagination(
    assets,
    useCallback(
      (a, q) =>
        `${a.asset_code || ""} ${a.asset_name || ""} ${a.serial_number || ""} ${a.status || ""}`
          .toLowerCase()
          .includes(q),
      []
    )
  );

  if (mode === "overview") {
    return (
      <div className="space-y-6">
        {/* Perspective Switcher & Reconciliation Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#DCE8F8] bg-gradient-to-r from-[#F0F7FF] via-white to-[#F8FAFC] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setPerspective("executive")}
              className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                perspective === "executive"
                  ? "bg-[#163D64] text-white shadow-sm"
                  : "bg-white text-[#475569] border border-[#CBD5E1]"
              }`}
            >
              Executive Perspective (GM / Director / Head)
            </button>
            <button
              type="button"
              onClick={() => setPerspective("operational")}
              className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                perspective === "operational"
                  ? "bg-[#163D64] text-white shadow-sm"
                  : "bg-white text-[#475569] border border-[#CBD5E1]"
              }`}
            >
              Operational Warehouse Perspective (SPV / Staff)
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleVerifyReconciliation()}
              disabled={verifyingRec}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100"
            >
              <ShieldCheck size={14} />
              {verifyingRec ? "Memverifikasi..." : "Verifikasi Rekonsiliasi Ledger == Balance"}
            </button>
            <button
              type="button"
              onClick={() => void loadOverview()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#CBD5E1] bg-white px-3 py-2 text-xs font-semibold text-[#163D64]"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
            </button>
          </div>
        </div>

        {reconciliation && (
          <div
            className={`rounded-2xl border p-4 text-xs ${
              reconciliation.reconciled
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-amber-200 bg-amber-50 text-amber-900"
            }`}
          >
            <div className="font-bold">
              Status Rekonsiliasi 3-Arah (∑ Ledger == ∑ Balance == ∑ Valuation Layer):{" "}
              {reconciliation.reconciled ? "TERVERIFIKASI 100% KONSISTEN" : `${reconciliation.discrepancy_count} Selisih Ditemukan`}
            </div>
            <div className="mt-1">
              Total Produk Diperiksa: {reconciliation.total_products_checked} • Waktu Cek:{" "}
              {new Date(reconciliation.checked_at).toLocaleString("id-ID")}
            </div>
          </div>
        )}

        {/* KPI Cards Based on Perspective */}
        {perspective === "executive" ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="rounded-2xl border border-[#E2E8F0] bg-white p-4">
              <span className="text-[11px] font-semibold uppercase text-[#64748B]">Total Nilai Persediaan</span>
              <div className="mt-1 text-xl font-extrabold text-[#163D64]">
                {formatMoney(Number(kpis.total_inventory_value || 0))}
              </div>
              <span className="text-[11px] text-[#64748B]">Berdasarkan FIFO / Moving Avg</span>
            </div>
            <div className="rounded-2xl border border-[#E2E8F0] bg-white p-4">
              <span className="text-[11px] font-semibold uppercase text-[#64748B]">Aging 0–30 Hari (Fresh)</span>
              <div className="mt-1 text-xl font-extrabold text-emerald-700">
                {formatMoney(Number(aging.days_0_30_value || 0))}
              </div>
              <span className="text-[11px] text-[#64748B]">90+ Hari (Dead Stock): {formatMoney(Number(aging.days_90_plus_value || 0))}</span>
            </div>
            <div className="rounded-2xl border border-[#E2E8F0] bg-white p-4">
              <span className="text-[11px] font-semibold uppercase text-[#64748B]">Nilai Aset Tetap Terkapitalisasi</span>
              <div className="mt-1 text-xl font-extrabold text-[#0F172A]">
                {formatMoney(Number(kpis.total_fixed_asset_value || 0))}
              </div>
              <span className="text-[11px] text-[#64748B]">{kpis.total_fixed_assets || 0} unit aset terdaftar</span>
            </div>
            <div className="rounded-2xl border border-[#E2E8F0] bg-white p-4">
              <span className="text-[11px] font-semibold uppercase text-[#64748B]">Stok Rusak / Karantina</span>
              <div className="mt-1 text-xl font-extrabold text-amber-700">
                {Number(kpis.damaged_quantity || 0) + Number(kpis.quarantined_quantity || 0)} Unit
              </div>
              <span className="text-[11px] text-[#64748B]">Otomatis dikecualikan dari EligibleOnHand</span>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
            <div className="rounded-2xl border border-[#E2E8F0] bg-white p-3.5">
              <span className="text-[10px] font-bold uppercase text-[#64748B]">Physical On Hand</span>
              <div className="mt-1 text-lg font-extrabold text-[#0F172A]">{Number(kpis.physical_on_hand || 0)}</div>
              <span className="text-[10px] text-[#64748B]">Total semua kondisi</span>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-3.5">
              <span className="text-[10px] font-bold uppercase text-emerald-800">Eligible On Hand</span>
              <div className="mt-1 text-lg font-extrabold text-emerald-700">{Number(kpis.eligible_on_hand || 0)}</div>
              <span className="text-[10px] text-emerald-700">GOOD & Allocatable</span>
            </div>
            <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-3.5">
              <span className="text-[10px] font-bold uppercase text-blue-800">Available(K)</span>
              <div className="mt-1 text-lg font-extrabold text-blue-700">{Number(kpis.available_stock || 0)}</div>
              <span className="text-[10px] text-blue-700">Siap di-reserve</span>
            </div>
            <div className="rounded-2xl border border-[#E2E8F0] bg-white p-3.5">
              <span className="text-[10px] font-bold uppercase text-[#64748B]">Reserved / Allocated</span>
              <div className="mt-1 text-lg font-extrabold text-indigo-700">
                {Number(kpis.reserved_quantity || 0)} / {Number(kpis.allocated_quantity || 0)}
              </div>
              <span className="text-[10px] text-[#64748B]">Soft / Hard Lock</span>
            </div>
            <div className="rounded-2xl border border-[#E2E8F0] bg-white p-3.5">
              <span className="text-[10px] font-bold uppercase text-[#64748B]">In-Transit</span>
              <div className="mt-1 text-lg font-extrabold text-amber-700">{Number(kpis.in_transit_quantity || 0)}</div>
              <span className="text-[10px] text-[#64748B]">{kpis.active_transfer_count || 0} transfer aktif</span>
            </div>
            <div className="rounded-2xl border border-[#E2E8F0] bg-white p-3.5">
              <span className="text-[10px] font-bold uppercase text-[#64748B]">Damaged / Hold</span>
              <div className="mt-1 text-lg font-extrabold text-red-600">
                {Number(kpis.damaged_quantity || 0)} / {Number(kpis.quarantined_quantity || 0)}
              </div>
              <span className="text-[10px] text-[#64748B]">Ineligible</span>
            </div>
          </div>
        )}

        {/* Quick Stock Posting & Canonical Stock Balance Table */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <form
            onSubmit={handleQuickMoveSubmit}
            className="lg:col-span-4 rounded-2xl border border-[#E2E8F0] bg-white p-4 space-y-3 self-start"
          >
            <h3 className="text-sm font-bold text-[#163D64]">
              + Posting Mutasi Stok (Ledger & Saldo K)
            </h3>
            <p className="text-xs text-[#64748B]">
              Eksekusi Goods Receipt atau Goods Issue dengan proteksi konkurensi `FOR UPDATE` dan kalkulasi biaya otomatis.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs font-semibold">
                Tipe Mutasi
                <select
                  value={moveForm.move_type}
                  onChange={(e) => setMoveForm((p) => ({ ...p, move_type: e.target.value }))}
                  className="input mt-1 w-full text-xs"
                >
                  <option value="RECEIPT">RECEIPT (Masuk)</option>
                  <option value="ISSUE">ISSUE (Keluar)</option>
                </select>
              </label>
              <label className="text-xs font-semibold">
                Kondisi Fisik
                <select
                  value={moveForm.condition_status}
                  onChange={(e) => setMoveForm((p) => ({ ...p, condition_status: e.target.value }))}
                  className="input mt-1 w-full text-xs"
                >
                  <option value="GOOD">GOOD (Layak)</option>
                  <option value="DAMAGED">DAMAGED (Rusak)</option>
                  <option value="DEFECTIVE">DEFECTIVE (Cacat)</option>
                </select>
              </label>
            </div>
            <div className="block text-xs font-semibold">
              <span className="mb-1 block">Produk</span>
              <SearchableSelect
                value={moveForm.product_id}
                onChange={(val) => setMoveForm((p) => ({ ...p, product_id: val }))}
                placeholder="-- Pilih Produk --"
                searchPlaceholder="Cari kode atau nama produk..."
                options={products.map((p: any) => ({
                  value: String(p.id),
                  label: `${p.product_code} · ${p.product_name} (${p.costing_method})`,
                  sublabel: p.product_type,
                }))}
              />
            </div>
            {moveForm.move_type === "RECEIPT" ? (
              <div className="block text-xs font-semibold">
                <span className="mb-1 block">Lokasi Tujuan (Receiving)</span>
                <SearchableSelect
                  value={moveForm.destination_location_id}
                  onChange={(val) => setMoveForm((p) => ({ ...p, destination_location_id: val }))}
                  placeholder="-- Pilih Lokasi Tujuan --"
                  searchPlaceholder="Cari kode atau nama lokasi..."
                  options={locations.map((l: any) => ({
                    value: String(l.id),
                    label: `${l.location_code} · ${l.location_name}`,
                    sublabel: l.location_type,
                  }))}
                />
              </div>
            ) : (
              <div className="block text-xs font-semibold">
                <span className="mb-1 block">Lokasi Asal (Issuing)</span>
                <SearchableSelect
                  value={moveForm.source_location_id}
                  onChange={(val) => setMoveForm((p) => ({ ...p, source_location_id: val }))}
                  placeholder="-- Pilih Lokasi Asal --"
                  searchPlaceholder="Cari kode atau nama lokasi..."
                  options={locations.map((l: any) => ({
                    value: String(l.id),
                    label: `${l.location_code} · ${l.location_name}`,
                    sublabel: l.location_type,
                  }))}
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs font-semibold">
                Kuantitas
                <input
                  type="number"
                  step="any"
                  value={moveForm.quantity}
                  onChange={(e) => setMoveForm((p) => ({ ...p, quantity: e.target.value }))}
                  className="input mt-1 w-full text-xs"
                  required
                />
              </label>
              <label className="text-xs font-semibold">
                Harga Per Unit (Rp)
                <input
                  type="number"
                  step="any"
                  value={moveForm.unit_cost}
                  onChange={(e) => setMoveForm((p) => ({ ...p, unit_cost: e.target.value }))}
                  className="input mt-1 w-full text-xs"
                />
              </label>
            </div>
            <button
              type="submit"
              disabled={submittingMove}
              className="btn-primary w-full justify-center py-2 text-xs font-bold"
            >
              {submittingMove ? "Memposting..." : "Posting ke Stock Ledger"}
            </button>
          </form>

          {/* Canonical Stock Identity (K) Table */}
          <div className="lg:col-span-8 rounded-2xl border border-[#E2E8F0] bg-white p-4">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-[#0F172A]">
                  Posisi Saldo Stok Kanonis — Tuple Identitas `K` (`inv_stock_balance`)
                </h3>
                <p className="text-xs text-[#64748B]">
                  Setiap baris direpresentasikan oleh `K = (company, product, location, owner, condition, lot, serial)` bebas hitung-ganda.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <TableSearchBar
                  query={balancesTable.query}
                  onQueryChange={balancesTable.setQuery}
                  onSearchSubmit={balancesTable.applySearch}
                  onReset={balancesTable.resetSearch}
                  placeholder="Cari produk, lokasi, atau kondisi..."
                  totalItems={balances.length}
                  filteredCount={balancesTable.totalItems}
                />
                <span className="rounded-full bg-[#F1F5F9] px-3 py-1 text-xs font-bold text-[#163D64]">
                  {balances.length} Baris K
                </span>
              </div>
            </div>

            {balancesTable.paginatedItems.length === 0 ? (
              <div className="py-10 text-center text-xs text-[#64748B]">
                {balances.length
                  ? "Tidak ada saldo stok yang cocok dengan pencarian."
                  : "Belum ada saldo stok. Gunakan formulir di kiri untuk memposting Goods Receipt pertama."}
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#E2E8F0] text-[10px] uppercase text-[#64748B]">
                        <th className="py-2 pr-2">Produk</th>
                        <th className="py-2 px-2">Lokasi & Purpose</th>
                        <th className="py-2 px-2">Kondisi & Eligibility</th>
                        <th className="py-2 px-2 text-right">On Hand</th>
                        <th className="py-2 px-2 text-right">Rsv / Alloc</th>
                        <th className="py-2 px-2 text-right">Available(K)</th>
                        <th className="py-2 pl-2 text-right">Nilai Buku</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F1F5F9]">
                      {balancesTable.paginatedItems.map((b: any) => (
                      <tr key={b.id} className="hover:bg-[#F8FAFC]">
                        <td className="py-2.5 pr-2">
                          <div className="font-bold text-[#0F172A]">
                            {b.product_code} · {b.product_name}
                          </div>
                          <div className="font-mono text-[10px] text-[#64748B]">
                            Key: {(b.balance_identity_key || b.id).slice(0, 12)}… · v{b.version || 1}
                          </div>
                        </td>
                        <td className="py-2.5 px-2">
                          <div className="font-semibold text-[#163D64]">{b.location_name || b.location_code}</div>
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
                            {b.location_purpose} · {b.owner_type}
                          </span>
                        </td>
                        <td className="py-2.5 px-2">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              b.is_eligible
                                ? "bg-emerald-50 text-emerald-700"
                                : b.stock_status === "IN_TRANSIT"
                                  ? "bg-amber-50 text-amber-700"
                                  : "bg-red-50 text-red-700"
                            }`}
                          >
                            {b.condition_status} • {b.stock_status}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-right font-bold">
                          {Number(b.on_hand_quantity ?? 0)}
                        </td>
                        <td className="py-2.5 px-2 text-right text-[#64748B]">
                          {Number(b.reserved_quantity ?? 0)} / {Number(b.allocated_quantity ?? 0)}
                        </td>
                        <td className="py-2.5 px-2 text-right font-extrabold text-blue-700">
                          {Number(b.computed_available_quantity ?? b.available_quantity ?? 0)}
                        </td>
                        <td className="py-2.5 pl-2 text-right font-semibold text-[#0F172A]">
                          {formatMoney(Number(b.inventory_value ?? 0))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <TablePagination
                page={balancesTable.page}
                totalPages={balancesTable.totalPages}
                pageSize={balancesTable.pageSize}
                totalItems={balancesTable.totalItems}
                onPageChange={balancesTable.setPage}
                onPageSizeChange={balancesTable.setPageSize}
              />
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (mode === "transfers") {
    return (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <form
          onSubmit={handleCreateTransfer}
          className="lg:col-span-4 rounded-2xl border border-[#E2E8F0] bg-white p-4 space-y-3 self-start"
        >
          <h3 className="text-sm font-bold text-[#163D64]">
            + Buat Transfer Antar-Gudang (3-Peristiwa)
          </h3>
          <p className="text-xs text-[#64748B]">
            Mendukung Dispatch ke Virtual Transit, Penerimaan Parsial/Rusak, dan Resolusi Selisih dengan persamaan konservasi stok.
          </p>
          <div className="block text-xs font-semibold">
            <span className="mb-1 block">Lokasi Gudang Asal</span>
            <SearchableSelect
              value={transferForm.source_location_id}
              onChange={(val) => setTransferForm((p) => ({ ...p, source_location_id: val }))}
              placeholder="-- Pilih Lokasi Asal --"
              searchPlaceholder="Cari kode atau nama lokasi..."
              options={locations
                .filter((l: any) => !l.is_virtual)
                .map((l: any) => ({
                  value: String(l.id),
                  label: `${l.location_code} · ${l.location_name}`,
                  sublabel: l.location_type,
                }))}
            />
          </div>
          <div className="block text-xs font-semibold">
            <span className="mb-1 block">Lokasi Gudang Tujuan</span>
            <SearchableSelect
              value={transferForm.destination_location_id}
              onChange={(val) =>
                setTransferForm((p) => ({ ...p, destination_location_id: val }))
              }
              placeholder="-- Pilih Lokasi Tujuan --"
              searchPlaceholder="Cari kode atau nama lokasi..."
              options={locations
                .filter((l: any) => !l.is_virtual)
                .map((l: any) => ({
                  value: String(l.id),
                  label: `${l.location_code} · ${l.location_name}`,
                  sublabel: l.location_type,
                }))}
            />
          </div>
          <div className="block text-xs font-semibold">
            <span className="mb-1 block">Produk</span>
            <SearchableSelect
              value={transferForm.product_id}
              onChange={(val) => setTransferForm((p) => ({ ...p, product_id: val }))}
              placeholder="-- Pilih Produk --"
              searchPlaceholder="Cari kode atau nama produk..."
              options={products.map((p: any) => ({
                value: String(p.id),
                label: `${p.product_code} · ${p.product_name}`,
                sublabel: p.product_type,
              }))}
            />
          </div>
          <label className="block text-xs font-semibold">
            Kuantitas Transfer
            <input
              type="number"
              step="any"
              value={transferForm.requested_quantity}
              onChange={(e) =>
                setTransferForm((p) => ({ ...p, requested_quantity: e.target.value }))
              }
              className="input mt-1 w-full text-xs"
              required
            />
          </label>
          <button
            type="submit"
            disabled={submittingTransfer}
            className="btn-primary w-full justify-center py-2 text-xs font-bold"
          >
            {submittingTransfer ? "Membuat..." : "Buat Dokumen Transfer"}
          </button>
        </form>

        <div className="lg:col-span-8 rounded-2xl border border-[#E2E8F0] bg-white p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-[#0F172A]">
              Daftar Transfer Antar-Gudang &amp; Konservasi Stok Transit
            </h3>
            <TableSearchBar
              query={transfersTable.query}
              onQueryChange={transfersTable.setQuery}
              onSearchSubmit={transfersTable.applySearch}
              onReset={transfersTable.resetSearch}
              placeholder="Cari nomor transfer, lokasi, status..."
              totalItems={transfers.length}
              filteredCount={transfersTable.totalItems}
            />
          </div>
          {transfersTable.paginatedItems.length === 0 ? (
            <div className="py-10 text-center text-xs text-[#64748B]">
              {transfers.length
                ? "Tidak ada transfer yang cocok dengan pencarian."
                : "Belum ada dokumen transfer antar-gudang."}
            </div>
          ) : (
            <>
            <div className="space-y-3">
              {transfersTable.paginatedItems.map((trf: any) => (
                <div key={trf.id} className="rounded-xl border border-[#E2E8F0] p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-mono text-xs font-bold text-[#163D64]">
                        {trf.transfer_number}
                      </span>{" "}
                      <span className="text-xs text-[#64748B]">
                        ({trf.source_location_name} → {trf.destination_location_name})
                      </span>
                    </div>
                    <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-bold text-blue-800">
                      {trf.status}
                    </span>
                  </div>

                  {trf.lines?.map((line: any) => {
                    const rem = Number(line.remaining_transit_qty ?? 0);
                    const inp = receiveInputs[line.id] || {
                      good: String(rem),
                      damaged: "0",
                    };
                    return (
                      <div
                        key={line.id}
                        className="rounded-lg bg-[#F8FAFC] p-3 text-xs flex flex-wrap items-center justify-between gap-3"
                      >
                        <div>
                          <div className="font-bold text-[#0F172A]">
                            {line.product_code} · {line.product_name}
                          </div>
                          <div className="mt-0.5 text-[11px] text-[#64748B]">
                            Req: <b>{Number(line.requested_quantity)}</b> • Shipped:{" "}
                            <b>{Number(line.shipped_quantity)}</b> • Good:{" "}
                            <b className="text-emerald-700">{Number(line.received_good_quantity)}</b> •
                            Damaged:{" "}
                            <b className="text-red-600">{Number(line.received_damaged_quantity)}</b> •
                            Write-Off: <b>{Number(line.written_off_quantity)}</b> • Sisa Transit:{" "}
                            <b className="text-amber-700">{rem}</b>
                          </div>
                        </div>

                        {["IN_TRANSIT", "PARTIALLY_RECEIVED"].includes(trf.status) && rem > 0 && (
                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              type="number"
                              value={inp.good}
                              onChange={(e) =>
                                setReceiveInputs((p) => ({
                                  ...p,
                                  [line.id]: { ...inp, good: e.target.value },
                                }))
                              }
                              className="h-8 w-20 rounded border border-[#CBD5E1] bg-white px-2 text-xs"
                              placeholder="Good"
                              title="Kuantitas Diterima Baik (GOOD)"
                            />
                            <input
                              type="number"
                              value={inp.damaged}
                              onChange={(e) =>
                                setReceiveInputs((p) => ({
                                  ...p,
                                  [line.id]: { ...inp, damaged: e.target.value },
                                }))
                              }
                              className="h-8 w-20 rounded border border-red-200 bg-white px-2 text-xs"
                              placeholder="Damaged"
                              title="Kuantitas Diterima Rusak (DAMAGED)"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                void handleTransferAction(trf.id, "receive", line.id, rem)
                              }
                              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
                            >
                              Terima (Receive)
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void handleTransferAction(trf.id, "resolve-discrepancy")
                              }
                              className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-100"
                            >
                              Write-Off Selisih
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <div className="flex flex-wrap gap-2">
                    {trf.status === "SUBMITTED" && (
                      <button
                        type="button"
                        onClick={() => void handleTransferAction(trf.id, "approve")}
                        className="rounded-lg border border-[#163D64] px-3 py-1.5 text-xs font-bold text-[#163D64]"
                      >
                        1. Approve Transfer
                      </button>
                    )}
                    {["SUBMITTED", "APPROVED"].includes(trf.status) && (
                      <button
                        type="button"
                        onClick={() => void handleTransferAction(trf.id, "dispatch")}
                        className="rounded-lg bg-[#163D64] px-3 py-1.5 text-xs font-bold text-white"
                      >
                        2. Dispatch ke Virtual Transit
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <TablePagination
              page={transfersTable.page}
              totalPages={transfersTable.totalPages}
              pageSize={transfersTable.pageSize}
              totalItems={transfersTable.totalItems}
              onPageChange={transfersTable.setPage}
              onPageSizeChange={transfersTable.setPageSize}
            />
            </>
          )}
        </div>
      </div>
    );
  }

  if (mode === "reservations") {
    return (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <form
          onSubmit={handleCreateReservation}
          className="lg:col-span-4 rounded-2xl border border-[#E2E8F0] bg-white p-4 space-y-3 self-start"
        >
          <h3 className="text-sm font-bold text-[#163D64]">
            + Buat Reservasi Stok 2-Tahap (`Reserve → Allocate`)
          </h3>
          <p className="text-xs text-[#64748B]">
            Tahap 1 (`Reserve`) mengunci `Available(K)`. Tahap 2 (`Allocate`) memindahkan `Reserved` ke `Allocated` secara eksklusif tanpa memotong `Available(K)` dua kali.
          </p>
          <div className="block text-xs font-semibold">
            <span className="mb-1 block">Produk</span>
            <SearchableSelect
              value={resvForm.product_id}
              onChange={(val) => setResvForm((p) => ({ ...p, product_id: val }))}
              placeholder="-- Pilih Produk --"
              searchPlaceholder="Cari kode atau nama produk..."
              options={products.map((p: any) => ({
                value: String(p.id),
                label: `${p.product_code} · ${p.product_name}`,
                sublabel: p.product_type,
              }))}
            />
          </div>
          <div className="block text-xs font-semibold">
            <span className="mb-1 block">Lokasi Gudang</span>
            <SearchableSelect
              value={resvForm.warehouse_location_id}
              onChange={(val) =>
                setResvForm((p) => ({ ...p, warehouse_location_id: val }))
              }
              placeholder="-- Pilih Lokasi --"
              searchPlaceholder="Cari kode atau nama lokasi..."
              options={locations
                .filter((l: any) => !l.is_virtual)
                .map((l: any) => ({
                  value: String(l.id),
                  label: `${l.location_code} · ${l.location_name}`,
                  sublabel: l.location_type,
                }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-semibold">
              Kuantitas
              <input
                type="number"
                step="any"
                value={resvForm.quantity}
                onChange={(e) => setResvForm((p) => ({ ...p, quantity: e.target.value }))}
                className="input mt-1 w-full text-xs"
                required
              />
            </label>
            <label className="text-xs font-semibold">
              Sumber Permintaan
              <select
                value={resvForm.source_type}
                onChange={(e) => setResvForm((p) => ({ ...p, source_type: e.target.value }))}
                className="input mt-1 w-full text-xs"
              >
                <option value="PROJECT_MATERIAL">PROJECT_MATERIAL</option>
                <option value="SALES_ORDER">SALES_ORDER</option>
                <option value="PRODUCTION_ORDER">PRODUCTION_ORDER</option>
                <option value="INTERNAL_REQUEST">INTERNAL_REQUEST</option>
              </select>
            </label>
          </div>
          <button
            type="submit"
            disabled={submittingResv}
            className="btn-primary w-full justify-center py-2 text-xs font-bold"
          >
            {submittingResv ? "Memproses..." : "1. Reserve Stok (Soft-Lock)"}
          </button>
        </form>

        <div className="lg:col-span-8 rounded-2xl border border-[#E2E8F0] bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-[#0F172A]">
              Daftar Reservasi &amp; Alokasi Aktif (`inv_stock_reservation`)
            </h3>
            <TableSearchBar
              query={reservationsTable.query}
              onQueryChange={reservationsTable.setQuery}
              onSearchSubmit={reservationsTable.applySearch}
              onReset={reservationsTable.resetSearch}
              placeholder="Cari produk, sumber, atau status..."
              totalItems={reservations.length}
              filteredCount={reservationsTable.totalItems}
            />
          </div>
          {reservationsTable.paginatedItems.length === 0 ? (
            <div className="py-10 text-center text-xs text-[#64748B]">
              {reservations.length
                ? "Tidak ada reservasi yang cocok dengan pencarian."
                : "Belum ada reservasi stok."}
            </div>
          ) : (
            <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#E2E8F0] text-[10px] uppercase text-[#64748B]">
                    <th className="py-2 pr-2">Produk</th>
                    <th className="py-2 px-2">Sumber</th>
                    <th className="py-2 px-2 text-right">Reserved</th>
                    <th className="py-2 px-2 text-right">Allocated</th>
                    <th className="py-2 px-2 text-right">Fulfilled</th>
                    <th className="py-2 px-2">Status</th>
                    <th className="py-2 pl-2 text-right">Aksi 2-Tahap</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9]">
                  {reservationsTable.paginatedItems.map((r: any) => {
                    const prod = products.find((p: any) => p.id === r.product_id);
                    return (
                      <tr key={r.id}>
                        <td className="py-2.5 pr-2 font-bold">
                          {prod?.product_code || r.product_id} · {prod?.product_name || ""}
                        </td>
                        <td className="py-2.5 px-2">{r.source_type || "INTERNAL"}</td>
                        <td className="py-2.5 px-2 text-right font-semibold text-amber-700">
                          {Number(r.reserved_quantity ?? 0)}
                        </td>
                        <td className="py-2.5 px-2 text-right font-semibold text-indigo-700">
                          {Number(r.allocated_quantity ?? 0)}
                        </td>
                        <td className="py-2.5 px-2 text-right font-semibold text-emerald-700">
                          {Number(r.fulfilled_quantity ?? 0)}
                        </td>
                        <td className="py-2.5 px-2">
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold">
                            {r.status}
                          </span>
                        </td>
                        <td className="py-2.5 pl-2 text-right space-x-1">
                          {r.status === "RESERVED" && (
                            <button
                              type="button"
                              onClick={() => void handleReservationAction(r.id, "allocate")}
                              className="rounded bg-indigo-600 px-2 py-1 text-[10px] font-bold text-white"
                            >
                              Allocate (Picking)
                            </button>
                          )}
                          {["RESERVED", "ALLOCATED", "PARTIALLY_ALLOCATED"].includes(r.status) && (
                            <>
                              <button
                                type="button"
                                onClick={() => void handleReservationAction(r.id, "fulfill")}
                                className="rounded bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white"
                              >
                                Fulfill (Issue)
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleReservationAction(r.id, "release")}
                                className="rounded border border-red-200 px-2 py-1 text-[10px] font-bold text-red-600"
                              >
                                Release
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <TablePagination
              page={reservationsTable.page}
              totalPages={reservationsTable.totalPages}
              pageSize={reservationsTable.pageSize}
              totalItems={reservationsTable.totalItems}
              onPageChange={reservationsTable.setPage}
              onPageSizeChange={reservationsTable.setPageSize}
            />
            </>
          )}
        </div>
      </div>
    );
  }

  // mode === "assets"
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Form Kapitalisasi Aset Idempoten */}
        <form
          onSubmit={handleCapitalizeAsset}
          className="rounded-2xl border border-[#E2E8F0] bg-white p-4 space-y-3"
        >
          <h3 className="text-sm font-bold text-[#163D64]">
            + Kapitalisasi Aset Tetap Idempoten (`asset-bridge.service`)
          </h3>
          <p className="text-xs text-[#64748B]">
            Konversi barang inventori bernilai tinggi / berseri menjadi Aset Tetap (`asset_asset`) secara idempoten tanpa duplikasi.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="text-xs font-semibold">
              <span className="mb-1 block">Produk Sumber</span>
              <SearchableSelect
                value={capForm.product_id}
                onChange={(val) => setCapForm((p) => ({ ...p, product_id: val }))}
                placeholder="-- Pilih Produk --"
                searchPlaceholder="Cari kode atau nama produk..."
                options={products.map((p: any) => ({
                  value: String(p.id),
                  label: `${p.product_code} · ${p.product_name}`,
                  sublabel: p.product_type,
                }))}
              />
            </div>
            <label className="text-xs font-semibold">
              Nomor Seri Aset
              <input
                type="text"
                value={capForm.serial_number}
                onChange={(e) => setCapForm((p) => ({ ...p, serial_number: e.target.value }))}
                placeholder="SN-ASSET-001"
                className="input mt-1 w-full text-xs"
              />
            </label>
            <label className="text-xs font-semibold">
              Nilai Perolehan (Rp)
              <input
                type="number"
                value={capForm.acquisition_cost}
                onChange={(e) => setCapForm((p) => ({ ...p, acquisition_cost: e.target.value }))}
                className="input mt-1 w-full text-xs"
                required
              />
            </label>
            <label className="text-xs font-semibold">
              Umur Ekonomis (Bulan)
              <input
                type="number"
                value={capForm.useful_life_months}
                onChange={(e) => setCapForm((p) => ({ ...p, useful_life_months: e.target.value }))}
                className="input mt-1 w-full text-xs"
              />
            </label>
          </div>
          <button type="submit" className="btn-primary w-full justify-center py-2 text-xs font-bold">
            Kapitalisasi ke Register Aset Tetap
          </button>
        </form>

        {/* Form Serah-Terima Custodian */}
        <form
          onSubmit={handleAssignCustodian}
          className="rounded-2xl border border-[#E2E8F0] bg-white p-4 space-y-3"
        >
          <h3 className="text-sm font-bold text-[#163D64]">
            + Serah-Terima Custodian & Lokasi Aset (`asset_assignment_history`)
          </h3>
          <p className="text-xs text-[#64748B]">
            Catat penugasan aset ke pemegang (Custodian), pemindahan lokasi, atau pengembalian ke gudang.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="text-xs font-semibold">
              <span className="mb-1 block">Pilih Aset</span>
              <SearchableSelect
                value={custodianForm.asset_id}
                onChange={(val) => setCustodianForm((p) => ({ ...p, asset_id: val }))}
                placeholder="-- Pilih Aset --"
                searchPlaceholder="Cari kode, nama, atau serial aset..."
                options={assets.map((a: any) => ({
                  value: String(a.id),
                  label: `${a.asset_code} · ${a.asset_name} (${a.status})`,
                  sublabel: a.serial_number ? `SN: ${a.serial_number}` : undefined,
                }))}
              />
            </div>
            <label className="text-xs font-semibold">
              Jenis Transaksi Custodian
              <select
                value={custodianForm.assignment_type}
                onChange={(e) =>
                  setCustodianForm((p) => ({ ...p, assignment_type: e.target.value }))
                }
                className="input mt-1 w-full text-xs"
              >
                <option value="HANDOVER">HANDOVER (Serah Terima Pemakai)</option>
                <option value="TRANSFER">TRANSFER (Pindah Lokasi/PIC)</option>
                <option value="RETURN">RETURN (Kembali ke Gudang)</option>
                <option value="MAINTENANCE_SEND">MAINTENANCE_SEND (Servis/Perbaikan)</option>
              </select>
            </label>
            <div className="text-xs font-semibold">
              <span className="mb-1 block">Lokasi Penempatan</span>
              <SearchableSelect
                value={custodianForm.location_id}
                onChange={(val) => setCustodianForm((p) => ({ ...p, location_id: val }))}
                placeholder="-- Pilih Lokasi --"
                emptyOptionLabel="Tanpa lokasi"
                searchPlaceholder="Cari kode atau nama lokasi..."
                options={locations.map((l: any) => ({
                  value: String(l.id),
                  label: `${l.location_code} · ${l.location_name}`,
                  sublabel: l.location_type,
                }))}
              />
            </div>
            <label className="text-xs font-semibold">
              Catatan Serah-Terima
              <input
                type="text"
                value={custodianForm.notes}
                onChange={(e) => setCustodianForm((p) => ({ ...p, notes: e.target.value }))}
                placeholder="BAST No / Kondisi fisik"
                className="input mt-1 w-full text-xs"
              />
            </label>
          </div>
          <button type="submit" className="btn-primary w-full justify-center py-2 text-xs font-bold">
            Simpan Riwayat Custodian Aset
          </button>
        </form>
      </div>

      {/* Register Aset Tetap */}
      <div className="rounded-2xl border border-[#E2E8F0] bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-[#0F172A]">
            Daftar Aset Tetap &amp; Riwayat Serah-Terima (`asset_asset`)
          </h3>
          <TableSearchBar
            query={assetsTable.query}
            onQueryChange={assetsTable.setQuery}
            onSearchSubmit={assetsTable.applySearch}
            onReset={assetsTable.resetSearch}
            placeholder="Cari kode aset, nama, atau serial..."
            totalItems={assets.length}
            filteredCount={assetsTable.totalItems}
          />
        </div>
        {assetsTable.paginatedItems.length === 0 ? (
          <div className="py-8 text-center text-xs text-[#64748B]">
            {assets.length
              ? "Tidak ada aset yang cocok dengan pencarian."
              : "Belum ada aset tetap yang dikapitalisasi."}
          </div>
        ) : (
          <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E2E8F0] text-[10px] uppercase text-[#64748B]">
                  <th className="py-2 pr-2">Kode Aset</th>
                  <th className="py-2 px-2">Nama Aset & Serial</th>
                  <th className="py-2 px-2">Status</th>
                  <th className="py-2 px-2 text-right">Nilai Perolehan</th>
                  <th className="py-2 pl-2">Umur Ekonomis</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {assetsTable.paginatedItems.map((a: any) => (
                  <tr key={a.id}>
                    <td className="py-2.5 pr-2 font-mono font-bold text-[#163D64]">
                      {a.asset_code}
                    </td>
                    <td className="py-2.5 px-2">
                      <div className="font-bold">{a.asset_name}</div>
                      <div className="text-[10px] text-[#64748B]">SN: {a.serial_number}</div>
                    </td>
                    <td className="py-2.5 px-2">
                      <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-bold text-blue-800">
                        {a.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-right font-semibold">
                      {formatMoney(Number(a.acquisition_cost ?? 0))}
                    </td>
                    <td className="py-2.5 pl-2">{a.useful_life_months || 48} Bulan</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination
            page={assetsTable.page}
            totalPages={assetsTable.totalPages}
            pageSize={assetsTable.pageSize}
            totalItems={assetsTable.totalItems}
            onPageChange={assetsTable.setPage}
            onPageSizeChange={assetsTable.setPageSize}
          />
          </>
        )}
      </div>
    </div>
  );
}
