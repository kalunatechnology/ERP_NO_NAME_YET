"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeftRight, Check, ChevronDown, CircleDollarSign, FilePlus2, History, Plus, RefreshCw, Send, ShieldCheck, Pencil, Trash2, X } from "lucide-react";
import api from "@/lib/api/axios";
import { cn, formatMoney } from "@/lib/utils";
import { useAsyncAction } from "@/hooks/useAsyncAction";

type AnyRow = Record<string, any>;
type DraftAllocation = { id?: string; account_id: string; cost_center_id: string; project_id: string; department_id: string; amount: string; allocation_name: string; description: string; periods: Record<string, string> };

const blankAllocation = (): DraftAllocation => ({ account_id: "", cost_center_id: "", project_id: "", department_id: "", amount: "", allocation_name: "", description: "", periods: {} });
const base = "/api/v1/finance";
const unwrap = (value: any) => value?.data ?? value;
const optionRows = (value: any) => Array.isArray(value) ? value : Array.isArray(value?.results) ? value.results : Array.isArray(value?.rows) ? value.rows : [];
const fmt = (value: unknown) => formatMoney(Number(value ?? 0));
const dateLabel = (value?: string | null) => value ? new Date(value).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export function BudgetingWorkspace({ canOperate = false }: { canOperate?: boolean }) {
  const [options, setOptions] = useState<{ fiscal_years: AnyRow[]; fiscal_periods: AnyRow[]; accounts: AnyRow[]; cost_centers: AnyRow[]; projects: AnyRow[]; departments: AnyRow[]; fund_requests: AnyRow[]; purchase_orders: AnyRow[]; supplier_invoices: AnyRow[] }>({ fiscal_years: [], fiscal_periods: [], accounts: [], cost_centers: [], projects: [], departments: [], fund_requests: [], purchase_orders: [], supplier_invoices: [] });
  const [plans, setPlans] = useState<AnyRow[]>([]);
  const [dashboard, setDashboard] = useState<AnyRow | null>(null);
  const [queue, setQueue] = useState<{ plans: AnyRow[]; revisions: AnyRow[]; transfers: AnyRow[]; reservations: AnyRow[] }>({ plans: [], revisions: [], transfers: [], reservations: [] });
  const [reservations, setReservations] = useState<AnyRow[]>([]);
  const [ledger, setLedger] = useState<AnyRow[]>([]);
  const [yearId, setYearId] = useState("");
  const [budgetScope, setBudgetScope] = useState<"PROJECT" | "COMPANY">("PROJECT");
  const [tab, setTab] = useState<"overview" | "plans" | "workflow" | "ledger">("overview");
  const [loading, setLoading] = useState(true);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const { run: runOnce } = useAsyncAction();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [editingPlanIsActive, setEditingPlanIsActive] = useState(false);
  const [editingPlanCanChangePeriodMode, setEditingPlanCanChangePeriodMode] = useState(true);
  const [planForm, setPlanForm] = useState({ budget_name: "", fiscal_year_id: "", budget_type: "OPERATING", control_policy: "HARD_STOP", period_mode: "ANNUAL", carry_forward: false, allocations: [blankAllocation()] as DraftAllocation[] });
  const [action, setAction] = useState<"RESERVATION" | "REVISION" | "TRANSFER" | null>(null);
  const [actionForm, setActionForm] = useState<AnyRow>({});
  const [ledgerAllocationId, setLedgerAllocationId] = useState("");
  const [rejecting, setRejecting] = useState<{ kind: string; id: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [closingPlanId, setClosingPlanId] = useState<string | null>(null);
  const [closeReason, setCloseReason] = useState("");
  const [settling, setSettling] = useState<{ row: AnyRow; kind: "release" | "recognize" } | null>(null);
  const [settlementForm, setSettlementForm] = useState({ amount: "", reason: "" });

  const selectedPeriods = useMemo(() => options.fiscal_periods.filter((period) => String(period.fiscal_year_id) === String(planForm.fiscal_year_id)).sort((a, b) => Number(a.period_number) - Number(b.period_number)), [options.fiscal_periods, planForm.fiscal_year_id]);
  const allocationRows: AnyRow[] = dashboard?.allocations ?? [];
  const scopedAllocationRows = allocationRows.filter((row) => budgetScope === "PROJECT" ? Boolean(row.project_id) : !row.project_id);
  const scopedAllocationIds = new Set(scopedAllocationRows.map((row) => String(row.id)));
  const scopedReservations = reservations.filter((row) => scopedAllocationIds.has(String(row.allocation_id)));
  const scopedPlans: AnyRow[] = plans.map((plan: AnyRow): AnyRow => ({
    ...plan,
    allocations: (plan.allocations ?? []).filter((row: AnyRow) => budgetScope === "PROJECT" ? Boolean(row.project_id) : !row.project_id),
  })).filter((plan: AnyRow) => plan.allocations.length > 0 || (plan.allocations?.length === 0 && budgetScope === "COMPANY" && plan.budget_type !== "PROJECT"));
  const scopedTotals = scopedAllocationRows.reduce((totals, row) => ({
    allocated: totals.allocated + Number(row.allocated ?? 0),
    committed: totals.committed + Number(row.committed ?? 0),
    actual: totals.actual + Number(row.actual ?? 0),
    available: totals.available + Number(row.available ?? 0),
  }), { allocated: 0, committed: 0, actual: 0, available: 0 });
  const fiscalPeriodLabel = (allocationPeriod: AnyRow) => {
    const fiscalPeriod = options.fiscal_periods.find((period) => String(period.id) === String(allocationPeriod.fiscal_period_id));
    const periodNumber = fiscalPeriod?.period_number ?? allocationPeriod.period_number;
    const numberLabel = periodNumber != null ? String(periodNumber).padStart(2, "0") : "fiskal";
    const dateRange = fiscalPeriod?.start_date && fiscalPeriod?.end_date
      ? ` (${dateLabel(fiscalPeriod.start_date)} - ${dateLabel(fiscalPeriod.end_date)})`
      : "";
    return `Periode ${numberLabel}${dateRange}`;
  };

  const load = useCallback(async (selectedYear = yearId) => {
    setLoading(true); setOptionsLoading(true); setError("");
    try {
      const [optionRes, deptRes, planRes, queueRes, reservationRes] = await Promise.all([
        api.get(`${base}/budgeting/options`),
        api.get("/api/v1/master-data/departments").catch(() => ({ data: { data: [] } })),
        api.get(`${base}/budgets`),
        api.get(`${base}/budgeting/workflow`),
        api.get(`${base}/budgeting/reservations`),
      ]);
      const rawOptions = unwrap(optionRes.data) ?? {};
      const dynDepts = optionRows(unwrap(deptRes.data));
      const rawCostCenters = optionRows(rawOptions.cost_centers);
      const rawDepartments = optionRows(rawOptions.departments);

      const seenCcCodes = new Set(rawCostCenters.map((c: AnyRow) => String(c.cost_center_code || c.code || "").toUpperCase()));
      const mergedCostCenters = [
        ...rawCostCenters,
        ...dynDepts
          .filter((d: AnyRow) => d.is_cost_center !== false && !seenCcCodes.has(String(d.code || d.department_code || "").toUpperCase()))
          .map((d: AnyRow) => ({
            id: d.id,
            cost_center_code: d.code || d.department_code,
            cost_center_name: d.name || d.department_name,
            code: d.code || d.department_code,
            name: d.name || d.department_name,
          })),
      ];

      const seenDeptCodes = new Set(rawDepartments.map((d: AnyRow) => String(d.department_code || d.code || "").toUpperCase()));
      const mergedDepartments = [
        ...rawDepartments,
        ...dynDepts
          .filter((d: AnyRow) => !seenDeptCodes.has(String(d.code || d.department_code || "").toUpperCase()))
          .map((d: AnyRow) => ({
            id: d.id,
            department_code: d.code || d.department_code,
            department_name: d.name || d.department_name,
            code: d.code || d.department_code,
            name: d.name || d.department_name,
            is_cost_center: d.is_cost_center !== false,
          })),
      ];

      const nextOptions = {
        fiscal_years: optionRows(rawOptions.fiscal_years),
        fiscal_periods: optionRows(rawOptions.fiscal_periods),
        accounts: optionRows(rawOptions.accounts),
        cost_centers: mergedCostCenters,
        projects: optionRows(rawOptions.projects),
        departments: mergedDepartments,
        fund_requests: optionRows(rawOptions.fund_requests),
        purchase_orders: optionRows(rawOptions.purchase_orders),
        supplier_invoices: optionRows(rawOptions.supplier_invoices),
      };
      const nextPlans = unwrap(planRes.data);
      setOptions(nextOptions);
      setOptionsLoading(false);
      setPlans(Array.isArray(nextPlans) ? nextPlans : nextPlans?.results ?? []);
      setQueue(unwrap(queueRes.data));
      setReservations(unwrap(reservationRes.data) ?? []);
      const fiscalYear = selectedYear || nextOptions.fiscal_years?.[0]?.id || "";
      if (!selectedYear && fiscalYear) setYearId(fiscalYear);
      const dashboardRes = await api.get(`${base}/budgeting/dashboard`, { params: fiscalYear ? { fiscal_year_id: fiscalYear } : {} });
      setDashboard(unwrap(dashboardRes.data));
      const ledgerRes = await api.get(`${base}/budgeting/ledger`, { params: ledgerAllocationId ? { allocation_id: ledgerAllocationId } : {} });
      const nextLedger = unwrap(ledgerRes.data);
      setLedger(Array.isArray(nextLedger) ? nextLedger : []);
      setPlanForm((current) => ({ ...current, fiscal_year_id: current.fiscal_year_id || fiscalYear }));
    } catch (cause: any) {
      setError(cause?.response?.data?.detail || cause?.response?.data?.message || "Data budgeting gagal dimuat.");
    } finally { setLoading(false); setOptionsLoading(false); }
  }, [yearId, ledgerAllocationId]);

  useEffect(() => { void load(); }, [load]);

  const refresh = async () => load(yearId);
  const notifyError = (cause: any) => setError(cause?.response?.data?.detail || cause?.response?.data?.message || "Permintaan tidak dapat diproses.");
  const postAction = async (url: string, payload: AnyRow = {}) => runOnce(url, async () => {
    setBusy(true); setError(""); setNotice("");
    try { await api.post(`${base}${url}`, payload); setNotice("Perubahan berhasil disimpan."); await load(yearId); return true; }
    catch (cause: any) { notifyError(cause); return false; }
    finally { setBusy(false); }
  });

  const setAllocation = (index: number, key: keyof DraftAllocation, value: any) => setPlanForm((current) => ({ ...current, allocations: current.allocations.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row) }));
  const setPeriodAmount = (index: number, periodId: string, value: string) => setPlanForm((current) => ({ ...current, allocations: current.allocations.map((row, rowIndex) => rowIndex === index ? { ...row, periods: { ...row.periods, [periodId]: value } } : row) }));
  const moveAllocationCell = (event: React.KeyboardEvent<HTMLElement>, row: number, column: number) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    const nextCell = document.querySelector<HTMLElement>(`[data-budget-row="${row + 1}"][data-budget-column="${column}"]`);
    if (nextCell) { event.preventDefault(); nextCell.focus(); }
  };

  const startEditPlan = (plan: AnyRow) => {
    setEditingPlanId(String(plan.id));
    setEditingPlanIsActive(plan.status === "ACTIVE");
    setEditingPlanCanChangePeriodMode(Boolean(plan.can_change_period_mode));
    setPlanForm({
      budget_name: plan.budget_name ?? "",
      fiscal_year_id: plan.fiscal_year_id ?? "",
      budget_type: plan.budget_type ?? "OPERATING",
      control_policy: plan.control_policy ?? "HARD_STOP",
      period_mode: plan.period_mode ?? "ANNUAL",
      carry_forward: Boolean(plan.carry_forward),
      allocations: (plan.allocations ?? []).map((allocation: AnyRow) => ({
        id: allocation.id,
        account_id: allocation.account_id ?? "",
        cost_center_id: allocation.cost_center_id ?? "",
        project_id: allocation.project_id ?? "",
        department_id: allocation.department_id ?? "",
        amount: String(allocation.budget_amount ?? ""),
        allocation_name: allocation.allocation_name ?? "",
        description: allocation.description ?? "",
        periods: Object.fromEntries((allocation.period_allocations ?? []).map((period: AnyRow) => [period.fiscal_period_id, String(period.amount ?? "")])),
      })),
    });
    setShowPlanForm(true);
  };

  const deleteDraftPlan = async (planId: string) => {
    if (!window.confirm("Hapus Budget Plan draft ini? Tindakan ini tidak dapat dibatalkan.")) return;
    return runOnce(`delete-plan:${planId}`, async () => {
    setBusy(true); setError(""); setNotice("");
    try {
      await api.delete(`${base}/budgets/${planId}`);
      setNotice("Budget Plan draft berhasil dihapus.");
      await load(yearId);
    } catch (cause: any) { notifyError(cause); }
    finally { setBusy(false); }
    });
  };

  const savePlan = async (event: React.FormEvent) => {
    event.preventDefault();
    return runOnce("save-plan", async () => {
    setBusy(true); setError("");
    try {
      const payload = {
        ...planForm,
        allocations: planForm.allocations.map((row) => ({
          id: row.id,
          account_id: row.account_id, cost_center_id: row.cost_center_id, project_id: row.project_id || null, department_id: row.department_id || null,
          allocation_name: row.allocation_name, description: row.description, amount: Number(row.amount),
          periods: planForm.period_mode === "ANNUAL" ? [] : selectedPeriods.map((period) => ({ fiscal_period_id: period.id, amount: Number(row.periods[period.id] ?? 0) })),
        })),
      };
      if (editingPlanId) await api.put(`${base}/budgets/${editingPlanId}`, payload);
      else await api.post(`${base}/budgets`, payload);
      setShowPlanForm(false); setEditingPlanId(null); setEditingPlanIsActive(false); setEditingPlanCanChangePeriodMode(true); setNotice(editingPlanId ? "Budget Plan draft berhasil diperbarui." : "Rencana anggaran tersimpan sebagai draft.");
      setPlanForm((current) => ({ ...current, budget_name: "", allocations: [blankAllocation()] }));
      await load(yearId);
    } catch (cause: any) { notifyError(cause); }
    finally { setBusy(false); }
    });
  };

  const runApproval = (kind: "plans" | "revisions" | "transfers" | "reservations", id: string, approved: boolean) => {
    const paths: Record<string, string> = { plans: "budgets", revisions: "budget-revisions", transfers: "budget-transfers", reservations: "budget-reservations" };
    if (!approved) { setRejecting({ kind, id }); setRejectReason(""); return; }
    void postAction(`/${paths[kind]}/${id}/approve`);
  };

  const confirmReject = async () => {
    if (!rejecting) return;
    const paths: Record<string, string> = { plans: "budgets", revisions: "budget-revisions", transfers: "budget-transfers", reservations: "budget-reservations" };
    const saved = await postAction(`/${paths[rejecting.kind]}/${rejecting.id}/reject`, { reason: rejectReason });
    if (!saved) return;
    setRejecting(null); setRejectReason("");
  };

  const submitSettlement = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!settling) return;
    const saved = await postAction(`/budget-reservations/${settling.row.id}/${settling.kind}`, { amount: Number(settlementForm.amount), reason: settlementForm.reason });
    if (!saved) return;
    setSettling(null); setSettlementForm({ amount: "", reason: "" });
  };

  const confirmClosePlan = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!closingPlanId) return;
    const saved = await postAction(`/budgets/${closingPlanId}/close`, { reason: closeReason });
    if (!saved) return;
    setClosingPlanId(null); setCloseReason("");
  };

  const submitAction = async (event: React.FormEvent) => {
    event.preventDefault();
    if (action === "RESERVATION" && actionForm.source_type === "REQUEST" && !actionForm.source_id) {
      setError("Masukkan nomor/ID Request yang cocok dengan data pengajuan yang tersedia.");
      return;
    }
    let saved = false;
    if (action === "RESERVATION") saved = (await postAction("/budget-reservations", { ...actionForm, amount: Number(actionForm.amount) })) ?? false;
    if (action === "REVISION") saved = (await postAction("/budget-revisions", { ...actionForm, amount: Number(actionForm.amount) })) ?? false;
    if (action === "TRANSFER") saved = (await postAction("/budget-transfers", { ...actionForm, amount: Number(actionForm.amount) })) ?? false;
    if (saved) { setAction(null); setActionForm({}); }
  };

  const titleOf = (row: AnyRow) => row.allocation_name || `${row.account_id?.slice(0, 8) ?? "Alokasi"} · ${row.cost_center_id?.slice(0, 8) ?? "Cost center"}`;
  const requestConcept = (request: AnyRow) => [request.request_number, request.title, request.description && request.description !== request.title ? request.description : ""].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-2xl border border-[#D9D9D9] bg-white p-5 shadow-2xs">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xl font-black text-[#090909]"><CircleDollarSign className="text-[#2649B3]" size={24} /> Budgetary Control</div>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-[#6B7280]">Rencanakan pagu per cost center dan akun beban; kendalikan commitment, realisasi accrual, revisi, transfer, dan audit ledger.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select aria-label="Tahun fiskal Budgeting" value={yearId} onChange={(event) => { setYearId(event.target.value); void load(event.target.value); }} className="rounded-xl border border-[#D9D9D9] bg-white px-3 py-2 text-xs font-bold">
              <option value="">Semua tahun fiskal</option>{options.fiscal_years.map((year) => <option key={year.id} value={year.id}>{year.fiscal_year_name}</option>)}
            </select>
            {canOperate && <button type="button" onClick={() => { setEditingPlanId(null); setEditingPlanIsActive(false); setEditingPlanCanChangePeriodMode(true); setPlanForm({ budget_name: "", fiscal_year_id: yearId || options.fiscal_years[0]?.id || "", budget_type: budgetScope === "PROJECT" ? "PROJECT" : "OPERATING", control_policy: "HARD_STOP", period_mode: "ANNUAL", carry_forward: false, allocations: [blankAllocation()] }); setShowPlanForm(true); }} className="inline-flex items-center gap-2 rounded-xl bg-[#2649B3] px-4 py-2 text-xs font-bold text-white hover:bg-[#1E3A8A]"><Plus size={15} /> Rencana baru</button>}
            <button type="button" onClick={() => void refresh()} disabled={loading} className="rounded-xl border border-[#D9D9D9] p-2 text-[#4F5050] hover:bg-slate-50" aria-label="Muat ulang"><RefreshCw size={16} className={cn(loading && "animate-spin")} /></button>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-1 border-b border-[#EFEFEF]">
          {([ ["overview", "Ikhtisar"], ["plans", `Rencana (${plans.length})`], ["workflow", `Persetujuan (${queue.plans.length + queue.revisions.length + queue.transfers.length + queue.reservations.length})`], ["ledger", "Ledger audit"] ] as const).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setTab(id)} className={cn("border-b-2 px-3 py-2 text-xs font-bold", tab === id ? "border-[#2649B3] text-[#2649B3]" : "border-transparent text-[#6B7280] hover:text-[#090909]")}>{label}</button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-2">
          <span className="px-2 text-[10px] font-bold uppercase tracking-wide text-[#6B7280]">Lingkup anggaran</span>
          {([["PROJECT", "Budget Proyek"], ["COMPANY", "Budget Perusahaan / Operasional"]] as const).map(([scope, label]) => <button key={scope} type="button" onClick={() => setBudgetScope(scope)} className={cn("rounded-lg px-3 py-2 text-xs font-bold", budgetScope === scope ? "bg-[#2649B3] text-white" : "bg-white text-[#4F5050] hover:bg-blue-50")}>{label}</button>)}
          <span className="ml-auto text-[10px] text-[#6B7280]">{budgetScope === "PROJECT" ? "Alokasi dengan proyek terpilih" : "Alokasi kantor/internal tanpa proyek"} · ikhtisar & rencana</span>
        </div>
      </section>

      {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800"><AlertTriangle size={16} className="mt-0.5 shrink-0" />{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">{notice}</div>}
      {busy && <div role="status" aria-live="polite" className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/20 p-4 backdrop-blur-[1px]"><div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-white px-5 py-4 text-sm font-semibold text-blue-900 shadow-xl"><RefreshCw size={18} className="animate-spin" />Sedang memproses perubahan anggaran. Tunggu sampai server merespons…</div></div>}
      {loading ? <div className="rounded-2xl border border-[#D9D9D9] bg-white p-10 text-center text-sm text-[#6B7280]">Memuat data budgeting…</div> : null}

      {!loading && tab === "overview" && <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[["Allocated", scopedTotals.allocated, "Dana yang disahkan", "text-[#2649B3]"], ["Committed", scopedTotals.committed, "Komitmen terbuka", "text-amber-700"], ["Actual", scopedTotals.actual, "Beban yang diposting", "text-violet-700"], ["Available", scopedTotals.available, "Sisa setelah komitmen & actual", Number(scopedTotals.available ?? 0) < 0 ? "text-red-700" : "text-emerald-700"]].map(([label, amount, hint, color]) => (
            <div key={String(label)} className="rounded-2xl border border-[#D9D9D9] bg-white p-4 shadow-2xs"><div className="text-[10px] font-extrabold uppercase tracking-wider text-[#6B7280]">{label}</div><div className={cn("mt-2 text-xl font-black", String(color))}>{fmt(amount)}</div><div className="mt-1 text-[10px] text-[#6B7280]">{hint}</div></div>
          ))}
        </div>
        {canOperate && <div className="flex flex-wrap gap-2">
          <button onClick={() => { setAction("RESERVATION"); setActionForm({ allocation_id: scopedAllocationRows[0]?.id ?? "", source_type: "REQUEST", source_id: "", source_line_id: "", fiscal_period_id: "", amount: "", description: "", request_query: "", invoice_query: "" }); }} className="inline-flex items-center gap-2 rounded-xl border border-[#D9D9D9] bg-white px-3 py-2 text-xs font-bold text-[#2649B3] hover:bg-[#F7FBFF]"><ShieldCheck size={14} /> Catat komitmen</button>
          <button onClick={() => { setAction("REVISION"); setActionForm({ allocation_id: scopedAllocationRows[0]?.id ?? "", revision_type: "INCREASE", amount: "", reason: "", fiscal_period_id: "" }); }} className="inline-flex items-center gap-2 rounded-xl border border-[#D9D9D9] bg-white px-3 py-2 text-xs font-bold text-[#2649B3] hover:bg-[#F7FBFF]"><FilePlus2 size={14} /> Ajukan revisi</button>
          <button onClick={() => { setAction("TRANSFER"); setActionForm({ from_allocation_id: scopedAllocationRows[0]?.id ?? "", to_allocation_id: scopedAllocationRows[1]?.id ?? "", amount: "", reason: "" }); }} className="inline-flex items-center gap-2 rounded-xl border border-[#D9D9D9] bg-white px-3 py-2 text-xs font-bold text-[#2649B3] hover:bg-[#F7FBFF]"><ArrowLeftRight size={14} /> Ajukan transfer</button>
        </div>}
        <AllocationTable rows={scopedAllocationRows} plans={plans} canOperate={canOperate} onEditPlan={(budgetId) => { const plan = plans.find((row) => String(row.id) === String(budgetId)); if (plan?.can_edit) startEditPlan(plan); }} onSelectLedger={(id) => { setLedgerAllocationId(id); setTab("ledger"); void load(yearId); }} />
        <ReservationTable rows={scopedReservations} busy={busy} onSettle={(row, kind) => { setSettling({ row, kind }); setSettlementForm({ amount: String(row.remaining_amount ?? ""), reason: kind === "recognize" ? "Pengakuan beban akrual" : "Pelepasan komitmen" }); }} />
      </>}

      {!loading && tab === "plans" && <div className="grid gap-3">{scopedPlans.length === 0 ? <Empty text={budgetScope === "PROJECT" ? "Belum ada alokasi Budget Plan untuk proyek." : "Belum ada alokasi Budget Plan untuk perusahaan/internal."} /> : scopedPlans.map((plan) => <PlanCard key={plan.id} plan={plan} canOperate={canOperate} busy={busy} onEdit={() => startEditPlan(plan)} onDelete={() => void deleteDraftPlan(plan.id)} onSubmit={() => void postAction(`/budgets/${plan.id}/submit`)} onApprove={() => runApproval("plans", plan.id, true)} onReject={() => runApproval("plans", plan.id, false)} onClose={() => { setClosingPlanId(plan.id); setCloseReason(""); }} />)}</div>}

      {!loading && tab === "workflow" && <WorkflowQueue queue={queue} busy={busy} onApprove={runApproval} onReject={runApproval} />}

      {!loading && tab === "ledger" && <section className="overflow-hidden rounded-2xl border border-[#D9D9D9] bg-white shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EFEFEF] p-4"><div><h3 className="text-sm font-extrabold text-[#090909]">Budget Ledger</h3><p className="mt-1 text-[10px] text-[#6B7280]">Entri posted bersifat append-only; koreksi dicatat dengan reversal.</p></div><select value={ledgerAllocationId} onChange={(event) => { setLedgerAllocationId(event.target.value); void load(yearId); }} className="max-w-full rounded-lg border border-[#D9D9D9] px-3 py-2 text-xs"><option value="">Semua alokasi</option>{allocationRows.map((row) => <option key={row.id} value={row.id}>{titleOf(row)}</option>)}</select></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase text-[#6B7280]"><tr>{["Waktu", "Jenis", "Sumber", "Pagu ±", "Committed ±", "Actual ±", "Keterangan"].map((header) => <th key={header} className="px-3 py-3">{header}</th>)}</tr></thead><tbody>{ledger.map((row) => <tr key={row.id} className="border-t border-[#EFEFEF]"><td className="px-3 py-3">{dateLabel(row.posted_at)}</td><td className="px-3 py-3"><span className="rounded-full bg-[#EAF6FF] px-2 py-1 text-[9px] font-bold text-[#2649B3]">{row.entry_type}</span></td><td className="px-3 py-3">{row.source_type} · {String(row.source_id).slice(0, 8)}</td><td className="px-3 py-3">{signedMoney(row.allocated_delta)}</td><td className="px-3 py-3">{signedMoney(row.committed_delta)}</td><td className="px-3 py-3">{signedMoney(row.actual_delta)}</td><td className="max-w-[300px] truncate px-3 py-3" title={row.description}>{row.description || "—"}</td></tr>)}</tbody></table>{ledger.length === 0 && <Empty text="Belum ada mutasi ledger." />}</div>
      </section>}

      {showPlanForm && <Modal title={editingPlanId ? "Edit Budget Plan" : "Buat Budget Plan"} onClose={() => { setShowPlanForm(false); setEditingPlanId(null); setEditingPlanIsActive(false); setEditingPlanCanChangePeriodMode(true); }}>
        <form onSubmit={savePlan} className="flex max-h-[78vh] flex-col gap-4 overflow-y-auto pr-1">
          {editingPlanIsActive && <p className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-[11px] leading-relaxed text-blue-900">Budget Plan aktif dapat diedit sampai pencairan direalisasi. Penyesuaian pagu dicatat di ledger; akun, cost center, proyek, departemen, dan tahun fiskal tetap.{editingPlanCanChangePeriodMode ? " Mode periode dapat diubah selama aturan alokasi tetap terpenuhi." : " Mode periode terkunci karena sudah ada transaksi anggaran."}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nama rencana"><input required value={planForm.budget_name} onChange={(event) => setPlanForm({ ...planForm, budget_name: event.target.value })} placeholder="Anggaran Operasional 2027" className={inputClass} /></Field>
            <Field label="Tahun fiskal"><select required value={planForm.fiscal_year_id} onChange={(event) => { const yearId = event.target.value; const periods = options.fiscal_periods.filter((period) => String(period.fiscal_year_id) === yearId).sort((a, b) => Number(a.period_number) - Number(b.period_number)); setPlanForm((current) => ({ ...current, fiscal_year_id: yearId, allocations: current.allocations.map((row) => ({ ...row, periods: current.period_mode === "ANNUAL" ? {} : autoSplit(row.amount, periods) })) })); }} disabled={editingPlanIsActive} className={inputClass}><option value="">Pilih tahun</option>{options.fiscal_years.map((year) => <option key={year.id} value={year.id}>{year.fiscal_year_name}</option>)}</select></Field>
            <Field label="Jenis anggaran"><select value={planForm.budget_type} onChange={(event) => setPlanForm({ ...planForm, budget_type: event.target.value })} className={inputClass}><option value="OPERATING">Operasional</option><option value="CAPITAL">Investasi / Capital</option><option value="PROJECT">Proyek</option></select></Field>
            <Field label="Kebijakan kontrol"><select value={planForm.control_policy} onChange={(event) => setPlanForm({ ...planForm, control_policy: event.target.value })} className={inputClass}><option value="HARD_STOP">Hard stop</option><option value="SOFT_WARNING">Peringatan</option><option value="APPROVAL_ESCALATION">Eskalasi persetujuan saat over-budget</option></select></Field>
            <Field label="Pembagian periode"><select disabled={editingPlanIsActive && !editingPlanCanChangePeriodMode} value={planForm.period_mode} onChange={(event) => setPlanForm({ ...planForm, period_mode: event.target.value, allocations: event.target.value === "ANNUAL" ? planForm.allocations : planForm.allocations.map((row) => ({ ...row, periods: autoSplit(row.amount, selectedPeriods) })) })} className={inputClass}><option value="ANNUAL">Tahunan</option><option value="MONTHLY">Bulanan</option><option value="QUARTERLY">Per periode fiskal</option></select></Field>
            <label className="flex items-center gap-2 self-end rounded-lg border border-[#D9D9D9] px-3 py-2 text-xs font-semibold"><input type="checkbox" checked={planForm.carry_forward} onChange={(event) => setPlanForm({ ...planForm, carry_forward: event.target.checked })} />Bawa saldo periode ke depan</label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#EFEFEF] pt-3"><div><h4 className="text-xs font-extrabold">Alokasi anggaran</h4><p className="mt-0.5 text-[10px] text-[#6B7280]">Isi per baris. Tekan Enter untuk turun ke kolom yang sama.</p></div><div className="flex items-center gap-3"><span className="text-[10px] font-bold text-[#6B7280]">{planForm.allocations.length} baris · Total {fmt(planForm.allocations.reduce((sum, row) => sum + Number(row.amount || 0), 0))}</span>{!editingPlanIsActive && <button type="button" onClick={() => setPlanForm({ ...planForm, allocations: [...planForm.allocations, blankAllocation()] })} className="rounded-lg border border-[#D9D9D9] px-3 py-2 text-[10px] font-bold text-[#2649B3] hover:bg-blue-50">+ Tambah baris</button>}</div></div>
          <div className="overflow-x-auto rounded-xl border border-[#D9D9D9]">
            <table className="w-full min-w-[1050px] border-collapse text-left text-[10px]">
              <thead className="sticky top-0 bg-slate-50 text-[9px] uppercase tracking-wide text-[#6B7280]"><tr>{["Akun beban / COA", "Cost center", "Proyek", "Departemen", "Nama alokasi", "Total pagu", ""].map((label) => <th key={label} className="border-b border-[#D9D9D9] px-2.5 py-2">{label}</th>)}</tr></thead>
              <tbody>{planForm.allocations.map((row, index) => <Fragment key={index}>
                <tr className="border-b border-[#EFEFEF] align-top hover:bg-blue-50/30">
                  <td className="min-w-[210px] p-1.5"><select aria-label={`Baris ${index + 1}: akun beban`} data-budget-row={index} data-budget-column={0} onKeyDown={(event) => moveAllocationCell(event, index, 0)} required disabled={editingPlanIsActive} value={row.account_id} onChange={(event) => setAllocation(index, "account_id", event.target.value)} className={inputClass}><option value="">Pilih akun COA</option>{options.accounts.map((account) => <option key={account.id} value={account.id}>{account.account_code} — {account.account_name}</option>)}</select></td>
                  <td className="min-w-[175px] p-1.5"><select aria-label={`Baris ${index + 1}: cost center`} data-budget-row={index} data-budget-column={1} onKeyDown={(event) => moveAllocationCell(event, index, 1)} required={planForm.budget_type !== "PROJECT"} disabled={editingPlanIsActive || optionsLoading} value={row.cost_center_id} onChange={(event) => { const nextCcId = event.target.value; setAllocation(index, "cost_center_id", nextCcId); if (!row.department_id && nextCcId) { const selectedCc = options.cost_centers.find((c) => c.id === nextCcId); const matchingDept = selectedCc ? options.departments.find((d) => String(d.department_code || d.code || "").toUpperCase() === String(selectedCc.cost_center_code || selectedCc.code || "").toUpperCase()) : null; if (matchingDept) setAllocation(index, "department_id", matchingDept.id); } }} className={inputClass}><option value="">{optionsLoading ? "Memuat…" : planForm.budget_type === "PROJECT" ? "Opsional" : options.cost_centers.length ? "Pilih cost center" : "Belum ada cost center"}</option>{options.cost_centers.map((center) => <option key={center.id} value={center.id}>{center.cost_center_code || center.code} — {center.cost_center_name || center.name}</option>)}</select></td>
                  <td className="min-w-[190px] p-1.5"><select aria-label={`Baris ${index + 1}: proyek`} data-budget-row={index} data-budget-column={2} onKeyDown={(event) => moveAllocationCell(event, index, 2)} required={planForm.budget_type === "PROJECT"} disabled={editingPlanIsActive} value={row.project_id} onChange={(event) => setAllocation(index, "project_id", event.target.value)} className={inputClass}><option value="">{planForm.budget_type === "PROJECT" ? "Pilih proyek" : "Kantor / tanpa proyek"}</option>{options.projects.map((project) => <option key={project.id} value={project.id}>{project.project_code} — {project.project_name}</option>)}</select></td>
                  <td className="min-w-[170px] p-1.5"><select aria-label={`Baris ${index + 1}: departemen`} data-budget-row={index} data-budget-column={3} onKeyDown={(event) => moveAllocationCell(event, index, 3)} disabled={editingPlanIsActive || optionsLoading} value={row.department_id} onChange={(event) => { const nextDeptId = event.target.value; setAllocation(index, "department_id", nextDeptId); if (!row.cost_center_id && nextDeptId) { const selectedDept = options.departments.find((d) => d.id === nextDeptId); const matchingCc = selectedDept ? options.cost_centers.find((c) => String(c.cost_center_code || c.code || "").toUpperCase() === String(selectedDept.department_code || selectedDept.code || "").toUpperCase()) : null; if (matchingCc) setAllocation(index, "cost_center_id", matchingCc.id); } }} className={inputClass}><option value="">Semua departemen</option>{options.departments.map((department) => <option key={department.id} value={department.id}>{department.department_code || department.code} — {department.department_name || department.name}</option>)}</select></td>
                  <td className="min-w-[145px] p-1.5"><input aria-label={`Baris ${index + 1}: nama alokasi`} data-budget-row={index} data-budget-column={4} onKeyDown={(event) => moveAllocationCell(event, index, 4)} value={row.allocation_name} onChange={(event) => setAllocation(index, "allocation_name", event.target.value)} placeholder="Opsional" className={inputClass} /></td>
                  <td className="min-w-[125px] p-1.5"><input aria-label={`Baris ${index + 1}: total pagu`} data-budget-row={index} data-budget-column={5} onKeyDown={(event) => moveAllocationCell(event, index, 5)} required min="0.01" step="0.01" type="number" value={row.amount} onChange={(event) => { setAllocation(index, "amount", event.target.value); if (planForm.period_mode !== "ANNUAL") setAllocation(index, "periods", autoSplit(event.target.value, selectedPeriods)); }} className={inputClass} /></td>
                  <td className="whitespace-nowrap p-1.5 text-center">{!editingPlanIsActive && planForm.allocations.length > 1 && <button type="button" onClick={() => setPlanForm({ ...planForm, allocations: planForm.allocations.filter((_, rowIndex) => rowIndex !== index) })} className="rounded-md px-2 py-2 font-bold text-red-700 hover:bg-red-50" aria-label={`Hapus baris alokasi ${index + 1}`}>Hapus</button>}</td>
                </tr>
                {planForm.period_mode !== "ANNUAL" && <tr className="border-b border-[#EFEFEF] bg-slate-50/70"><td colSpan={7} className="px-2.5 py-2"><details className="rounded-lg"><summary className="flex cursor-pointer list-none items-center gap-1 text-[9px] font-bold text-[#2649B3]"><ChevronDown size={12} />Pembagian pagu per periode</summary><div className="mt-2 flex flex-wrap gap-2">{selectedPeriods.map((period) => <label key={period.id} className="w-32 text-[9px] font-semibold text-[#6B7280]">Periode {period.period_number}<input type="number" min="0" step="0.01" value={row.periods[period.id] ?? ""} onChange={(event) => setPeriodAmount(index, period.id, event.target.value)} className={cn(inputClass, "mt-1")} /></label>)}</div></details></td></tr>}
              </Fragment>)}</tbody>
            </table>
          </div>
          <div className="flex justify-end gap-2 border-t border-[#EFEFEF] pt-3"><button type="button" onClick={() => { setShowPlanForm(false); setEditingPlanId(null); setEditingPlanIsActive(false); setEditingPlanCanChangePeriodMode(true); }} className="rounded-lg border border-[#D9D9D9] px-4 py-2 text-xs font-bold">Batal</button><button disabled={busy} className="rounded-lg bg-[#2649B3] px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{busy ? "Menyimpan…" : editingPlanId ? "Simpan perubahan" : "Simpan draft"}</button></div>
        </form>
      </Modal>}

      {action && <Modal title={action === "RESERVATION" ? "Catat komitmen anggaran" : action === "REVISION" ? "Ajukan budget revision" : "Ajukan budget transfer"} onClose={() => setAction(null)}>
        <form onSubmit={submitAction} className="grid gap-3">
          {action === "RESERVATION" && <>
            <Field label="Alokasi"><AllocationSelect rows={allocationRows} value={actionForm.allocation_id} onChange={(value) => setActionForm({ ...actionForm, allocation_id: value })} /></Field>
            <div className="grid grid-cols-2 gap-3"><Field label="Sumber"><select required value={actionForm.source_type} onChange={(event) => setActionForm({ ...actionForm, source_type: event.target.value, source_id: "", request_query: "", invoice_query: "", amount: "", description: "" })} className={inputClass}><option value="REQUEST">Request Dana</option><option value="PURCHASE_ORDER">Purchase Order</option><option value="INVOICE">Invoice pemasok</option><option value="OTHER">Lainnya</option></select></Field><Field label="Nominal"><input required type="number" min="0.01" step="0.01" value={actionForm.amount} onChange={(event) => setActionForm({ ...actionForm, amount: event.target.value })} className={inputClass} /></Field></div>
            {actionForm.source_type === "REQUEST" && <Field label="Nomor atau ID Request"><input required list="budget-fund-request-options" value={actionForm.request_query ?? ""} onChange={(event) => { const value = event.target.value.trim(); const request = options.fund_requests.find((row) => !row.has_active_commitment && !["DRAFT", "CANCELLED", "REJECTED", "DISBURSED", "PENDING_LPJ_VERIFICATION", "COMPLETED", "CLOSED"].includes(String(row.status).toUpperCase()) && (String(row.id) === value || String(row.request_number) === value)); setActionForm({ ...actionForm, request_query: value, source_id: request?.id ?? "", amount: request ? String(request.amount) : "", description: request ? requestConcept(request) : "", allocation_id: request?.budget_allocation_id && allocationRows.some((row) => String(row.id) === String(request.budget_allocation_id)) ? request.budget_allocation_id : actionForm.allocation_id }); }} placeholder="Ketik nomor Request atau tempel ID Request" className={inputClass} /><datalist id="budget-fund-request-options">{options.fund_requests.filter((row) => !row.has_active_commitment && !["DRAFT", "CANCELLED", "REJECTED", "DISBURSED", "PENDING_LPJ_VERIFICATION", "COMPLETED", "CLOSED"].includes(String(row.status).toUpperCase())).map((row) => <Fragment key={row.id}><option value={row.request_number} label={`${row.title} · ${fmt(row.amount)} · ${row.status}`} /><option value={row.id} label={`${row.legacy_funding ? "Funding Proyek" : "ID Request"} · ${row.title} · ${fmt(row.amount)}`} /></Fragment>)}</datalist><span className="text-[9px] font-normal text-[#6B7280]">Pilih saran yang cocok agar nominal, konsep, dan ID sumber mengikuti data Request.{actionForm.request_query && !actionForm.source_id ? <b className="ml-1 text-red-600">Request tidak ditemukan.</b> : null}</span></Field>}
            {actionForm.source_type === "PURCHASE_ORDER" && <Field label="Pilih Purchase Order"><select required value={actionForm.source_id} onChange={(event) => { const order = options.purchase_orders.find((row) => String(row.id) === event.target.value); setActionForm({ ...actionForm, source_id: event.target.value, amount: order ? String(order.total_amount) : "", description: order ? `PO ${order.order_number}` : "" }); }} className={inputClass}><option value="">Pilih purchase order disetujui</option>{options.purchase_orders.map((row) => <option key={row.id} value={row.id}>{row.order_number} · {fmt(row.total_amount)} · {row.status}</option>)}</select></Field>}
            {actionForm.source_type === "INVOICE" && <Field label="Nomor Invoice Vendor"><input required list="budget-supplier-invoice-options" value={actionForm.invoice_query ?? ""} onChange={(event) => { const value = event.target.value.trim(); const invoice = options.supplier_invoices.find((row) => !row.has_active_commitment && (String(row.id) === value || String(row.invoice_number) === value)); const matchingAllocations = invoice ? allocationRows.filter((row) => String(row.project_id ?? "") === String(invoice.project_id ?? "")) : []; setActionForm({ ...actionForm, invoice_query: value, source_id: invoice?.id ?? "", amount: invoice ? String(invoice.amount) : "", description: invoice ? `Invoice ${invoice.invoice_number} · ${invoice.supplier_name}` : "", allocation_id: invoice?.budget_allocation_id && allocationRows.some((row) => String(row.id) === String(invoice.budget_allocation_id)) ? invoice.budget_allocation_id : matchingAllocations.length === 1 ? matchingAllocations[0].id : actionForm.allocation_id }); }} placeholder="Ketik nomor invoice atau tempel ID invoice" className={inputClass} /><datalist id="budget-supplier-invoice-options">{options.supplier_invoices.filter((row) => !row.has_active_commitment).map((row) => <Fragment key={row.id}><option value={row.invoice_number} label={`${row.supplier_name} · ${fmt(row.amount)} · ${row.status}`} /><option value={row.id} label={`${row.supplier_name} · ${row.invoice_number} · ID Invoice`} /></Fragment>)}</datalist><span className="text-[9px] font-normal text-[#6B7280]">Pilih invoice terdaftar agar ID, nominal, dan keterangan terisi otomatis.{actionForm.invoice_query && !actionForm.source_id ? <b className="ml-1 text-red-600">Invoice tidak ditemukan.</b> : null}</span></Field>}
            {actionForm.source_type === "OTHER" && <Field label="ID sumber transaksi"><input required value={actionForm.source_id} onChange={(event) => setActionForm({ ...actionForm, source_id: event.target.value })} className={inputClass} /></Field>}
            {actionForm.source_id && <Field label={actionForm.source_type === "REQUEST" ? "ID Request (tersimpan sebagai referensi)" : actionForm.source_type === "PURCHASE_ORDER" ? "ID Purchase Order (tersimpan sebagai referensi)" : "ID sumber transaksi"}><input readOnly value={actionForm.source_id} className={cn(inputClass, "bg-slate-50 font-mono text-[10px]")} /></Field>}
            {allocationRows.find((row) => row.id === actionForm.allocation_id)?.periods?.length > 0 && <Field label="Periode"><select required value={actionForm.fiscal_period_id} onChange={(event) => setActionForm({ ...actionForm, fiscal_period_id: event.target.value })} className={inputClass}><option value="">Pilih periode</option>{allocationRows.find((row) => row.id === actionForm.allocation_id)?.periods.map((period: AnyRow) => <option key={period.fiscal_period_id} value={period.fiscal_period_id}>{fiscalPeriodLabel(period)}</option>)}</select></Field>}
            <Field label={actionForm.source_type === "REQUEST" ? "Keterangan / konsep" : "Keterangan"}><input value={actionForm.description} onChange={(event) => setActionForm({ ...actionForm, description: event.target.value })} className={inputClass} /></Field>
          </>}
          {action === "REVISION" && <>
            <Field label="Alokasi"><AllocationSelect rows={allocationRows} value={actionForm.allocation_id} onChange={(value) => setActionForm({ ...actionForm, allocation_id: value })} /></Field>
            <div className="grid grid-cols-2 gap-3"><Field label="Jenis revisi"><select value={actionForm.revision_type} onChange={(event) => setActionForm({ ...actionForm, revision_type: event.target.value })} className={inputClass}><option value="INCREASE">Tambah pagu</option><option value="DECREASE">Kurangi pagu</option></select></Field><Field label="Nominal"><input required type="number" min="0.01" step="0.01" value={actionForm.amount} onChange={(event) => setActionForm({ ...actionForm, amount: event.target.value })} className={inputClass} /></Field></div>
            {allocationRows.find((row) => row.id === actionForm.allocation_id)?.periods?.length > 0 && <Field label="Periode"><select required value={actionForm.fiscal_period_id} onChange={(event) => setActionForm({ ...actionForm, fiscal_period_id: event.target.value })} className={inputClass}><option value="">Pilih periode</option>{allocationRows.find((row) => row.id === actionForm.allocation_id)?.periods.map((period: AnyRow) => <option key={period.fiscal_period_id} value={period.fiscal_period_id}>{fiscalPeriodLabel(period)}</option>)}</select></Field>}
            <Field label="Alasan wajib"><textarea required minLength={5} value={actionForm.reason} onChange={(event) => setActionForm({ ...actionForm, reason: event.target.value })} className={inputClass} rows={3} /> </Field>
          </>}
          {action === "TRANSFER" && <>
            <Field label="Alokasi sumber"><AllocationSelect rows={allocationRows} value={actionForm.from_allocation_id} onChange={(value) => setActionForm({ ...actionForm, from_allocation_id: value })} /></Field>
            <Field label="Alokasi tujuan"><AllocationSelect rows={allocationRows} value={actionForm.to_allocation_id} onChange={(value) => setActionForm({ ...actionForm, to_allocation_id: value })} /></Field>
            <Field label="Nominal"><input required type="number" min="0.01" step="0.01" value={actionForm.amount} onChange={(event) => setActionForm({ ...actionForm, amount: event.target.value })} className={inputClass} /></Field>
            <Field label="Alasan wajib"><textarea required minLength={5} value={actionForm.reason} onChange={(event) => setActionForm({ ...actionForm, reason: event.target.value })} className={inputClass} rows={3} /></Field>
          </>}
          <div className="flex justify-end gap-2 border-t border-[#EFEFEF] pt-3"><button type="button" onClick={() => setAction(null)} className="rounded-lg border border-[#D9D9D9] px-4 py-2 text-xs font-bold">Batal</button><button disabled={busy || (action === "RESERVATION" && actionForm.source_type === "REQUEST" && !actionForm.source_id)} className="rounded-lg bg-[#2649B3] px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{busy ? "Menyimpan…" : action === "RESERVATION" ? "Simpan komitmen" : "Ajukan"}</button></div>
        </form>
      </Modal>}

      {rejecting && <Modal title="Tolak pengajuan" onClose={() => setRejecting(null)}><div className="grid gap-3"><Field label="Alasan penolakan"><textarea required minLength={5} value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} className={inputClass} rows={4} /></Field><div className="flex justify-end gap-2"><button onClick={() => setRejecting(null)} className="rounded-lg border border-[#D9D9D9] px-4 py-2 text-xs font-bold">Batal</button><button disabled={busy || rejectReason.trim().length < 5} onClick={() => void confirmReject()} className="rounded-lg bg-red-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">Tolak</button></div></div></Modal>}

      {closingPlanId && <Modal title="Tutup Budget Plan" onClose={() => setClosingPlanId(null)}><form onSubmit={confirmClosePlan} className="grid gap-3"><p className="text-xs text-[#6B7280]">Anggaran hanya dapat ditutup setelah semua komitmen selesai. Penutupan dicatat permanen pada ledger.</p><Field label="Alasan penutupan"><textarea required minLength={5} value={closeReason} onChange={(event) => setCloseReason(event.target.value)} className={inputClass} rows={3} /></Field><div className="flex justify-end gap-2"><button type="button" onClick={() => setClosingPlanId(null)} className="rounded-lg border border-[#D9D9D9] px-4 py-2 text-xs font-bold">Batal</button><button disabled={busy || closeReason.trim().length < 5} className="rounded-lg bg-amber-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">Tutup anggaran</button></div></form></Modal>}

      {settling && <Modal title={settling.kind === "recognize" ? "Akui beban & lepaskan komitmen" : "Lepaskan komitmen"} onClose={() => setSettling(null)}><form onSubmit={submitSettlement} className="grid gap-3"><p className="text-xs text-[#6B7280]">Saldo komitmen saat ini: <b>{fmt(settling.row.remaining_amount)}</b>. Pengakuan actual hanya dipakai jika transaksi akrual belum otomatis diposting lewat jurnal.</p><Field label="Nominal"><input required type="number" min="0.01" max={settling.row.remaining_amount} step="0.01" value={settlementForm.amount} onChange={(event) => setSettlementForm({ ...settlementForm, amount: event.target.value })} className={inputClass} /></Field><Field label="Alasan / referensi"><input required minLength={5} value={settlementForm.reason} onChange={(event) => setSettlementForm({ ...settlementForm, reason: event.target.value })} className={inputClass} /></Field><div className="flex justify-end gap-2"><button type="button" onClick={() => setSettling(null)} className="rounded-lg border border-[#D9D9D9] px-4 py-2 text-xs font-bold">Batal</button><button disabled={busy} className="rounded-lg bg-[#2649B3] px-4 py-2 text-xs font-bold text-white">Simpan</button></div></form></Modal>}
    </div>
  );
}

function AllocationTable({ rows, plans, canOperate, onEditPlan, onSelectLedger }: { rows: AnyRow[]; plans: AnyRow[]; canOperate: boolean; onEditPlan: (budgetId: string) => void; onSelectLedger: (id: string) => void }) {
  return <section className="overflow-hidden rounded-2xl border border-[#D9D9D9] bg-white shadow-2xs">
    <div className="border-b border-[#EFEFEF] p-4"><h3 className="text-sm font-extrabold text-[#090909]">Saldo alokasi aktif</h3><p className="mt-1 text-[10px] text-[#6B7280]">Available = Allocated − Committed − Actual. Funding dan pembayaran tidak diperlakukan sebagai beban.</p></div>
    <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase text-[#6B7280]"><tr>{["Alokasi", "Allocated", "Committed", "Actual", "Available", "Pemakaian", "Aksi"].map((header) => <th key={header} className="px-3 py-3">{header}</th>)}</tr></thead>
      <tbody>{rows.map((row) => {
        const plan = plans.find((item) => String(item.id) === String(row.budget_id));
        return <tr key={row.id} className="border-t border-[#EFEFEF]"><td className="px-3 py-3"><div className="font-bold text-[#090909]">{row.allocation_name || row.budget_name}</div><div className="mt-1 text-[10px] text-[#6B7280]">{row.budget_name} · {row.control_policy?.replaceAll("_", " ")}</div>{row.periods?.length > 0 && <details className="mt-2"><summary className="cursor-pointer text-[10px] font-bold text-[#2649B3]">Rincian periode</summary><div className="mt-2 grid gap-1">{row.periods.map((period: AnyRow) => <div key={period.fiscal_period_id} className="grid grid-cols-5 gap-2 text-[9px] text-[#6B7280]"><span>Periode {period.period_number ?? "—"}</span><span>Anggaran {fmt(period.allocated)}</span><span>Comm. {fmt(period.committed)}</span><span>Actual {fmt(period.actual)}</span><b className={period.available < 0 ? "text-red-700" : "text-emerald-700"}>Sisa {fmt(period.available)}</b></div>)}</div></details>}</td>
          <td className="px-3 py-3 font-semibold">{fmt(row.allocated)}</td><td className="px-3 py-3 text-amber-700">{fmt(row.committed)}</td><td className="px-3 py-3 text-violet-700">{fmt(row.actual)}</td><td className={cn("px-3 py-3 font-extrabold", row.available < 0 ? "text-red-700" : "text-emerald-700")}>{fmt(row.available)}</td>
          <td className="px-3 py-3"><div className="flex items-center gap-2"><div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100"><div className={cn("h-full rounded-full", row.utilization_percent > 100 ? "bg-red-600" : row.utilization_percent > 80 ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${Math.max(0, Math.min(Number(row.utilization_percent), 100))}%` }} /></div><span>{Number(row.utilization_percent).toFixed(1)}%</span></div></td>
          <td className="px-3 py-3"><div className="flex items-center gap-2">{canOperate && plan && (plan.can_edit ? <button onClick={() => onEditPlan(String(plan.id))} className="inline-flex items-center gap-1 font-bold text-[#2649B3]"><Pencil size={13} />Edit</button> : <button type="button" disabled title={plan.edit_lock_reason || "Budget Plan ini terkunci."} className="inline-flex cursor-not-allowed items-center gap-1 font-bold text-[#9CA3AF]"><Pencil size={13} />Terkunci</button>)}<button onClick={() => onSelectLedger(row.id)} className="inline-flex items-center gap-1 font-bold text-[#2649B3]"><History size={13} />Ledger</button></div></td>
        </tr>;
      })}</tbody></table>{rows.length === 0 && <Empty text="Belum ada Budget Plan aktif pada tahun fiskal ini." />}</div>
  </section>;
}

function ReservationTable({ rows, busy, onSettle }: { rows: AnyRow[]; busy: boolean; onSettle: (row: AnyRow, kind: "release" | "recognize") => void }) {
  return <section className="overflow-hidden rounded-2xl border border-[#D9D9D9] bg-white shadow-2xs"><div className="border-b border-[#EFEFEF] p-4"><h3 className="text-sm font-extrabold text-[#090909]">Komitmen terbuka</h3><p className="mt-1 text-[10px] text-[#6B7280]">Saat beban diakui, komitmen berkurang dan actual bertambah dalam satu mutasi ledger.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[750px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase text-[#6B7280]"><tr>{["Sumber dan ID", "Status", "Nominal awal", "Sisa komitmen", "Keterangan", "Aksi"].map((header) => <th key={header} className="px-3 py-3">{header}</th>)}</tr></thead><tbody>{rows.filter((row) => row.status !== "PENDING_APPROVAL").map((row) => <tr key={row.id} className="border-t border-[#EFEFEF]"><td className="max-w-[240px] px-3 py-3"><div className="font-bold">{row.source_type}</div><div className="mt-1 break-all font-mono text-[9px] text-[#6B7280]" title={row.source_id}>{row.source_id}</div></td><td className="px-3 py-3">{row.status}</td><td className="px-3 py-3">{fmt(row.amount)}</td><td className="px-3 py-3 font-extrabold text-amber-700">{fmt(row.remaining_amount)}</td><td className="max-w-[200px] truncate px-3 py-3" title={row.description}>{row.description || "—"}</td><td className="px-3 py-3"><div className="flex gap-1"><button disabled={busy} onClick={() => onSettle(row, "release")} className="rounded-lg border border-[#D9D9D9] px-2 py-1.5 text-[9px] font-bold disabled:opacity-50">Lepas</button><button disabled={busy} onClick={() => onSettle(row, "recognize")} className="rounded-lg bg-violet-700 px-2 py-1.5 text-[9px] font-bold text-white disabled:opacity-50">Akui Actual</button></div></td></tr>)}</tbody></table>{rows.filter((row) => row.status !== "PENDING_APPROVAL").length === 0 && <Empty text="Belum ada komitmen aktif." />}</div></section>;
}

function PlanCard({ plan, canOperate, busy, onEdit, onDelete, onSubmit, onApprove, onReject, onClose }: { plan: AnyRow; canOperate: boolean; busy: boolean; onEdit: () => void; onDelete: () => void; onSubmit: () => void; onApprove: () => void; onReject: () => void; onClose: () => void }) {
  const amount = (plan.allocations ?? []).reduce((sum: number, row: AnyRow) => sum + Number(row.budget_amount ?? 0), 0);
  return <article className="rounded-2xl border border-[#D9D9D9] bg-white p-4 shadow-2xs"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-extrabold text-[#090909]">{plan.budget_name}</h3><span className={cn("rounded-full px-2 py-1 text-[9px] font-extrabold", plan.status === "ACTIVE" ? "bg-emerald-100 text-emerald-800" : plan.status === "PENDING_APPROVAL" ? "bg-amber-100 text-amber-800" : plan.status === "REJECTED" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-700")}>{plan.status}</span></div><p className="mt-1 text-[10px] text-[#6B7280]">{plan.budget_type} · {plan.period_mode} · {plan.control_policy?.replaceAll("_", " ")} · {plan.allocations?.length ?? 0} alokasi</p><p className="mt-2 text-lg font-black text-[#2649B3]">{fmt(amount)}</p>{plan.approval_note && <p className="mt-1 text-xs text-red-700">Catatan: {plan.approval_note}</p>}</div><div className="flex flex-wrap gap-2">{canOperate && plan.can_edit && <button disabled={busy} onClick={onEdit} className="inline-flex items-center gap-1 rounded-lg border border-[#D9D9D9] px-3 py-2 text-[10px] font-bold text-[#2649B3] disabled:opacity-50"><Pencil size={12} />Edit</button>}{canOperate && plan.can_delete && <button disabled={busy} onClick={onDelete} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-[10px] font-bold text-red-700 disabled:opacity-50"><Trash2 size={12} />{busy ? "Memproses…" : "Hapus"}</button>}{canOperate && plan.status === "DRAFT" && <button disabled={busy} onClick={onSubmit} className="inline-flex items-center gap-1 rounded-lg bg-[#2649B3] px-3 py-2 text-[10px] font-bold text-white disabled:opacity-50"><Send size={12} />{busy ? "Memproses…" : "Ajukan"}</button>}{plan.status === "PENDING_APPROVAL" && <><button disabled={busy} onClick={onReject} className="rounded-lg border border-red-200 px-3 py-2 text-[10px] font-bold text-red-700 disabled:opacity-50">Tolak</button><button disabled={busy} onClick={onApprove} className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-2 text-[10px] font-bold text-white disabled:opacity-50"><Check size={12} />{busy ? "Memproses…" : "Setujui"}</button></>}{plan.status === "ACTIVE" && <button disabled={busy} onClick={onClose} className="rounded-lg border border-amber-200 px-3 py-2 text-[10px] font-bold text-amber-800 disabled:opacity-50">Tutup anggaran</button>}</div></div><div className="mt-3 grid gap-2 border-t border-[#EFEFEF] pt-3 sm:grid-cols-2 lg:grid-cols-3">{(plan.allocations ?? []).map((allocation: AnyRow) => <div key={allocation.id} className="rounded-lg bg-slate-50 p-2"><div className="text-[10px] font-bold text-[#090909]">{allocation.allocation_name || "Alokasi"}</div><div className="mt-1 text-[10px] text-[#6B7280]">{allocation.account_id?.slice(0, 8)} · {allocation.cost_center_id?.slice(0, 8)}{allocation.project_id ? ` · Project ${allocation.project_id.slice(0, 8)}` : ""}</div><div className="mt-1 text-xs font-extrabold">{fmt(allocation.budget_amount)}</div></div>)}</div></article>;
}

function WorkflowQueue({ queue, busy, onApprove, onReject }: { queue: { plans: AnyRow[]; revisions: AnyRow[]; transfers: AnyRow[]; reservations: AnyRow[] }; busy: boolean; onApprove: (kind: "plans" | "revisions" | "transfers" | "reservations", id: string, approved: boolean) => void; onReject: (kind: "plans" | "revisions" | "transfers" | "reservations", id: string, approved: boolean) => void }) {
  const sections = [["plans", "Budget Plan", queue.plans], ["revisions", "Budget Revision", queue.revisions], ["transfers", "Budget Transfer", queue.transfers], ["reservations", "Komitmen", queue.reservations]] as const;
  const count = sections.reduce((sum, [, , rows]) => sum + rows.length, 0);
  if (!count) return <Empty text="Tidak ada pengajuan Budgetary yang menunggu persetujuan." />;
  return <div className="grid gap-4">{sections.map(([kind, title, rows]) => rows.length > 0 && <section key={kind} className="rounded-2xl border border-[#D9D9D9] bg-white p-4"><h3 className="mb-3 text-sm font-extrabold">{title} · {rows.length}</h3><div className="grid gap-2">{rows.map((row) => <div key={row.id} className="flex flex-col justify-between gap-3 rounded-xl border border-[#EFEFEF] p-3 sm:flex-row sm:items-center"><div><div className="text-xs font-bold">{row.budget_name || row.reason || row.description || `${row.source_type ?? title} · ${row.id.slice(0, 8)}`}</div><div className="mt-1 text-[10px] text-[#6B7280]">{row.revision_type || row.status} · {row.amount ? fmt(row.amount) : ""} · {dateLabel(row.created_at || row.submitted_at)}</div>{row.approval_note && <div className="mt-1 text-[10px] text-red-700">{row.approval_note}</div>}</div><div className="flex gap-2"><button disabled={busy} onClick={() => onReject(kind, row.id, false)} className="rounded-lg border border-red-200 px-3 py-2 text-[10px] font-bold text-red-700 disabled:opacity-50">Tolak</button><button disabled={busy} onClick={() => onApprove(kind, row.id, true)} className="rounded-lg bg-emerald-700 px-3 py-2 text-[10px] font-bold text-white disabled:opacity-50">{busy ? "Memproses…" : "Setujui"}</button></div></div>)}</div></section>)}</div>;
}

function AllocationSelect({ rows, value, onChange }: { rows: AnyRow[]; value: string; onChange: (value: string) => void }) { return <select required value={value} onChange={(event) => onChange(event.target.value)} className={inputClass}><option value="">Pilih alokasi</option>{rows.map((row) => <option key={row.id} value={row.id}>{row.allocation_name || row.budget_name} · {fmt(row.available)} tersedia</option>)}</select>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="grid gap-1 text-[10px] font-bold text-[#4F5050]"><span>{label}</span>{children}</label>; }
function Empty({ text }: { text: string }) { return <div className="rounded-2xl border border-dashed border-[#D9D9D9] bg-white p-8 text-center text-xs text-[#6B7280]">{text}</div>; }
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-3" role="dialog" aria-modal="true" aria-label={title}><div className="max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl"><div className="flex items-center justify-between border-b border-[#EFEFEF] px-5 py-4"><h2 className="text-sm font-extrabold text-[#090909]">{title}</h2><button type="button" onClick={onClose} className="rounded-lg p-1.5 text-[#6B7280] hover:bg-slate-100" aria-label="Tutup"><X size={17} /></button></div><div className="p-5">{children}</div></div></div>; }
function autoSplit(total: string, periods: AnyRow[]) { const amount = Math.round(Number(total || 0) * 100); const baseAmount = periods.length ? Math.floor(amount / periods.length) : 0; let remainder = periods.length ? amount - baseAmount * periods.length : 0; return Object.fromEntries(periods.map((period) => { const current = baseAmount + (remainder-- > 0 ? 1 : 0); return [period.id, (current / 100).toFixed(2)]; })); }
function signedMoney(value: unknown) { const amount = Number(value ?? 0); return <span className={amount > 0 ? "text-emerald-700" : amount < 0 ? "text-red-700" : "text-[#6B7280]"}>{amount > 0 ? "+" : ""}{fmt(amount)}</span>; }
const inputClass = "w-full rounded-lg border border-[#D9D9D9] bg-white px-3 py-2 text-xs text-[#090909] outline-none focus:border-[#2649B3] focus:ring-2 focus:ring-[#2649B3]/10";
