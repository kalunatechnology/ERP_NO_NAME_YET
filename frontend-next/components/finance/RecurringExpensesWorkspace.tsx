"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarClock,
  Check,
  Download,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Table2,
  Trash2,
} from "lucide-react";
import api from "@/lib/api/axios";
import { cn, formatMoney } from "@/lib/utils";
import { getApiErrorDetail } from "@/lib/api/project.api";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import {
  TablePagination,
  TableSearchBar,
  useTablePagination,
} from "@/components/ui/TablePagination";
import {
  ExcelStatusBar,
  evaluateFormulaInput,
  exportSheetsToXlsx,
  moveGridCell,
  parseClipboardMatrix,
} from "@/components/finance/ExcelGridShell";

type Row = Record<string, any>;
const rowsOf = (value: any) =>
  Array.isArray(value)
    ? value
    : value?.data?.results ?? value?.results ?? value?.data ?? [];
const inputClass =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs";
const gridInputClass =
  "w-full rounded-md border border-[#E2E8F0] bg-white px-2 py-1.5 text-xs outline-none focus:border-[#163D64]";
const today = new Date();
const dateValue = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;

const makeEmptyRule = () => ({
  rule_code: "",
  description: "",
  party_id: "",
  budget_scope: "OPERATIONAL",
  project_id: "",
  cost_center_id: "",
  expense_account_id: "",
  budget_allocation_id: "",
  input_tax_code_id: "",
  amount: "",
  recurrence_rule: "MONTHLY",
  next_run_date: dateValue(new Date(today.getFullYear(), today.getMonth() + 1, 1)),
  end_date: "",
  status: "ACTIVE",
});

export function RecurringExpensesWorkspace({
  canOperate = false,
}: {
  canOperate?: boolean;
}) {
  const [rules, setRules] = useState<Row[]>([]);
  const [runs, setRuns] = useState<Row[]>([]);
  const [vendors, setVendors] = useState<Row[]>([]);
  const [projects, setProjects] = useState<Row[]>([]);
  const [accounts, setAccounts] = useState<Row[]>([]);
  const [allocations, setAllocations] = useState<Row[]>([]);
  const [taxes, setTaxes] = useState<Row[]>([]);
  const [form, setForm] = useState<any>(makeEmptyRule);
  const [entryMode, setEntryMode] = useState<"single" | "grid">("single");
  const [gridRows, setGridRows] = useState<any[]>([makeEmptyRule()]);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const actionLock = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const [
        rulesRes,
        runsRes,
        vendorsRes,
        projectsRes,
        accountsRes,
        allocationsRes,
        taxesRes,
      ] = await Promise.all([
        api.get("/api/v1/finance/recurring-expenses/rules"),
        api.get("/api/v1/finance/recurring-expenses/runs"),
        api.get("/api/v1/finance/party-options?role=VENDOR"),
        api.get("/api/v1/finance/project-options"),
        api.get("/api/v1/finance/accounts/?page_size=1000"),
        api.get("/api/v1/finance/budget-lines/?page_size=500"),
        api.get("/api/v1/master-data/tax-codes/?page_size=500"),
      ]);
      setRules(rowsOf(rulesRes.data));
      setRuns(rowsOf(runsRes.data));
      setVendors(rowsOf(vendorsRes.data));
      setProjects(rowsOf(projectsRes.data));
      setAccounts(rowsOf(accountsRes.data));
      setAllocations(
        rowsOf(allocationsRes.data).filter(
          (row: Row) => String(row.budget?.status ?? "").toUpperCase() === "ACTIVE"
        )
      );
      setTaxes(rowsOf(taxesRes.data).filter((row: Row) => row.status !== "INACTIVE"));
    } catch (cause) {
      setError(getApiErrorDetail(cause, "Data biaya berulang gagal dimuat."));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const availableAllocations = useMemo(
    () =>
      allocations.filter((row) =>
        form.budget_scope === "PROJECT"
          ? Boolean(form.project_id) && String(row.project_id ?? "") === String(form.project_id)
          : !row.project_id
      ),
    [allocations, form.budget_scope, form.project_id]
  );

  const selectedInputTax = taxes.find((tax) => tax.id === form.input_tax_code_id);
  const base = Number(form.amount || 0);
  const tax = selectedInputTax
    ? (base * Number(selectedInputTax.tax_rate ?? 0)) / 100
    : 0;

  const saveRule = async (event: React.FormEvent) => {
    event.preventDefault();
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { budget_scope, ...ruleData } = form;
      const payload = {
        ...ruleData,
        amount: Number(form.amount),
        cost_center_id: form.cost_center_id || null,
        project_id: budget_scope === "PROJECT" ? form.project_id || null : null,
        input_tax_code_id: form.input_tax_code_id || null,
        end_date: form.end_date || null,
      };
      if (editing)
        await api.put(`/api/v1/finance/recurring-expenses/rules/${editing}`, payload);
      else await api.post("/api/v1/finance/recurring-expenses/rules", payload);
      setForm(makeEmptyRule());
      setEditing(null);
      setNotice(
        "Aturan biaya berulang tersimpan. Tagihan belum dibuat sampai Anda menekan Generate."
      );
      await load();
    } catch (cause) {
      setError(getApiErrorDetail(cause, "Aturan biaya berulang gagal disimpan."));
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  };

  const saveGridBatch = async (event: React.FormEvent) => {
    event.preventDefault();
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      let savedCount = 0;
      for (const row of gridRows) {
        if (!row.rule_code?.trim() || !row.description?.trim()) continue;
        const evaluatedAmount = Number(
          evaluateFormulaInput(String(row.amount || "")) ?? row.amount ?? 0
        );
        if (evaluatedAmount <= 0) continue;
        const { budget_scope, ...ruleData } = row;
        const payload = {
          ...ruleData,
          amount: evaluatedAmount,
          cost_center_id: row.cost_center_id || null,
          project_id: budget_scope === "PROJECT" ? row.project_id || null : null,
          input_tax_code_id: row.input_tax_code_id || null,
          end_date: row.end_date || null,
        };
        await api.post("/api/v1/finance/recurring-expenses/rules", payload);
        savedCount++;
      }
      if (savedCount === 0) {
        setError("Isi minimal 1 baris dengan Kode Aturan, Nama Biaya, dan DPP > 0.");
      } else {
        setGridRows([makeEmptyRule()]);
        setNotice(`${savedCount} aturan biaya berulang berhasil disimpan.`);
        await load();
      }
    } catch (cause) {
      setError(getApiErrorDetail(cause, "Sebagian atau seluruh baris gagal disimpan."));
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  };

  const handleGridPaste = (
    event: React.ClipboardEvent<HTMLInputElement>,
    startRow: number,
    startCol: number
  ) => {
    const text = event.clipboardData.getData("text");
    if (!text.includes("\t") && !text.includes("\n")) return;
    const matrix = parseClipboardMatrix(text);
    if (!matrix.length) return;
    event.preventDefault();

    setGridRows((current) => {
      const next = [...current];
      while (next.length < startRow + matrix.length) next.push(makeEmptyRule());
      matrix.forEach((cells, rOffset) => {
        const rIdx = startRow + rOffset;
        const row = { ...next[rIdx] };
        cells.forEach((val, cOffset) => {
          const cIdx = startCol + cOffset;
          if (cIdx === 0) row.rule_code = val;
          else if (cIdx === 1) row.description = val;
          else if (cIdx === 7) {
            const num = evaluateFormulaInput(val.replace(/,/g, ""));
            if (num !== null) row.amount = String(num);
          }
        });
        next[rIdx] = row;
      });
      return next;
    });
  };

  const generate = async () => {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await api.post("/api/v1/finance/recurring-expenses/generate", {
        through_date: dateValue(new Date()),
      });
      const generated = rowsOf(response.data);
      setNotice(
        generated.length
          ? `${generated.length} tagihan DRAFT dibuat. Periksa di menu Tagihan Vendor sebelum disetujui.`
          : "Tidak ada tagihan baru yang jatuh tempo untuk dibuat."
      );
      await load();
    } catch (cause) {
      setError(getApiErrorDetail(cause, "Tagihan berulang gagal dibuat."));
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  };

  const activeProjects = projects.filter(
    (project) => project.lifecycle_status !== "CANCELLED"
  );
  const activeAccounts = accounts.filter(
    (account) => account.status === "ACTIVE" && account.account_type === "EXPENSE"
  );

  const rulesTable = useTablePagination(
    rules,
    useCallback(
      (rule, q) => {
        const vendor = vendors.find((row) => row.id === rule.party_id);
        const project = projects.find((row) => row.id === rule.project_id);
        return `${rule.rule_code} ${rule.description} ${
          vendor?.display_name || vendor?.legal_name || ""
        } ${project?.project_code || ""} ${project?.project_name || ""} ${
          rule.status
        }`
          .toLowerCase()
          .includes(q);
      },
      [vendors, projects]
    )
  );

  const runsTable = useTablePagination(
    runs,
    useCallback(
      (run, q) =>
        `${run.scheduled_date || ""} ${run.billing_document?.invoice_number || run.id} ${
          run.billing_document?.status || run.run_status || ""
        }`
          .toLowerCase()
          .includes(q),
      []
    )
  );

  const exportRulesXlsx = () => {
    exportSheetsToXlsx("biaya-tetap-berulang.xlsx", [
      {
        name: "Aturan Biaya",
        rows: rulesTable.filteredItems.map((rule) => {
          const vendor = vendors.find((v) => v.id === rule.party_id);
          const project = projects.find((p) => p.id === rule.project_id);
          return {
            Kode: rule.rule_code,
            Deskripsi: rule.description,
            Lingkup: project ? `Project (${project.project_code})` : "Operational",
            Vendor: vendor?.display_name || vendor?.legal_name || "",
            DPP: Number(rule.amount ?? 0),
            Frekuensi: rule.recurrence_rule,
            "Tagihan Berikutnya": String(rule.next_run_date ?? "").slice(0, 10),
            Status: rule.status,
          };
        }),
      },
    ]);
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-2xl border bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-black">
              <CalendarClock className="text-[#163D64]" /> Biaya Tetap & Tagihan Berulang
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Aturan bisa untuk proyek atau kantor internal. Sistem hanya membuat tagihan DRAFT;
              Finance memeriksa lalu melanjutkan approval dan posting di Tagihan Vendor.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canOperate && !editing && (
              <div className="inline-flex rounded-lg border border-[#E2E8F0] bg-slate-50 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setEntryMode("single")}
                  className={cn(
                    "rounded-md px-3 py-1.5 font-bold",
                    entryMode === "single"
                      ? "bg-[#163D64] text-white"
                      : "text-slate-600 hover:text-[#163D64]"
                  )}
                >
                  Form Satuan
                </button>
                <button
                  type="button"
                  onClick={() => setEntryMode("grid")}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md px-3 py-1.5 font-bold",
                    entryMode === "grid"
                      ? "bg-[#163D64] text-white"
                      : "text-slate-600 hover:text-[#163D64]"
                  )}
                >
                  <Table2 size={13} /> Mode Grid Excel
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={exportRulesXlsx}
              className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-bold text-[#163D64] hover:bg-slate-50"
            >
              <Download size={13} /> Export .xlsx
            </button>
            <button
              onClick={() => void load()}
              disabled={busy}
              className="rounded-lg border p-2"
            >
              <RefreshCw size={14} className={cn(busy && "animate-spin")} />
            </button>
            {canOperate && (
              <button
                onClick={() => void generate()}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-lg bg-[#163D64] px-3 py-2 text-xs font-bold text-white"
              >
                <Send size={13} /> Generate Tagihan Jatuh Tempo
              </button>
            )}
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">
            {error}
          </p>
        )}
        {notice && (
          <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-700">
            {notice}
          </p>
        )}

        {canOperate && (entryMode === "single" || editing) && (
          <form
            onSubmit={saveRule}
            className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 md:grid-cols-4"
          >
            <label className="text-[10px] font-bold">
              Kode aturan
              <input
                required
                value={form.rule_code}
                onChange={(e) => setForm({ ...form, rule_code: e.target.value })}
                className={inputClass}
                placeholder="RENT-HEAD-OFFICE"
              />
            </label>
            <label className="text-[10px] font-bold">
              Nama biaya
              <input
                required
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className={inputClass}
                placeholder="Sewa kantor pusat"
              />
            </label>
            <div className="text-[10px] font-bold">
              <span className="mb-1 block">Vendor</span>
              <SearchableSelect
                value={form.party_id}
                onChange={(val) => setForm({ ...form, party_id: val })}
                placeholder="Pilih vendor"
                searchPlaceholder="Cari nama vendor..."
                options={vendors.map((vendor) => ({
                  value: String(vendor.id),
                  label: vendor.display_name || vendor.legal_name || vendor.party_code,
                }))}
              />
            </div>
            <label className="text-[10px] font-bold">
              Lingkup biaya
              <select
                value={form.budget_scope}
                onChange={(e) =>
                  setForm({
                    ...form,
                    budget_scope: e.target.value,
                    project_id: "",
                    cost_center_id: "",
                    budget_allocation_id: "",
                  })
                }
                className={inputClass}
              >
                <option value="OPERATIONAL">Operational Budget</option>
                <option value="PROJECT">Project Budget</option>
              </select>
            </label>
            {form.budget_scope === "PROJECT" ? (
              <div className="text-[10px] font-bold">
                <span className="mb-1 block">Proyek</span>
                <SearchableSelect
                  value={form.project_id}
                  onChange={(val) =>
                    setForm({
                      ...form,
                      project_id: val,
                      budget_allocation_id: "",
                      cost_center_id: "",
                    })
                  }
                  placeholder="Pilih proyek"
                  searchPlaceholder="Cari kode atau nama proyek..."
                  options={activeProjects.map((project) => ({
                    value: String(project.id),
                    label: `${project.project_code} — ${project.project_name}`,
                  }))}
                />
              </div>
            ) : (
              <div className="flex items-center rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] text-blue-900">
                Biaya operasional perusahaan · tidak terkait proyek
              </div>
            )}
            <div className="text-[10px] font-bold">
              <span className="mb-1 block">COA beban</span>
              <SearchableSelect
                value={form.expense_account_id}
                onChange={(val) =>
                  setForm({
                    ...form,
                    expense_account_id: val,
                    budget_allocation_id: "",
                    cost_center_id: "",
                  })
                }
                placeholder="Pilih akun beban"
                searchPlaceholder="Cari kode atau nama COA..."
                options={activeAccounts.map((account) => ({
                  value: String(account.id),
                  label: `${account.account_code} — ${account.account_name}`,
                }))}
              />
            </div>
            <div className="text-[10px] font-bold">
              <span className="mb-1 block">Alokasi anggaran</span>
              <SearchableSelect
                value={form.budget_allocation_id}
                onChange={(val) => {
                  const allocation = availableAllocations.find(
                    (row) => String(row.id) === val
                  );
                  setForm({
                    ...form,
                    budget_allocation_id: val,
                    expense_account_id:
                      allocation?.account_id ?? form.expense_account_id,
                    cost_center_id: allocation?.cost_center_id ?? "",
                  });
                }}
                placeholder={
                  form.budget_scope === "PROJECT"
                    ? "Pilih pagu aktif proyek"
                    : "Pilih pagu aktif operasional"
                }
                searchPlaceholder="Cari alokasi anggaran..."
                options={availableAllocations.map((row) => {
                  const account = activeAccounts.find(
                    (item) => item.id === row.account_id
                  );
                  return {
                    value: String(row.id),
                    label: `${
                      account ? `${account.account_code} — ${account.account_name} · ` : "COA · "
                    }${row.allocation_name || row.budget?.budget_name} · ${formatMoney(
                      row.budget_amount ?? 0
                    )}`,
                  };
                })}
              />
            </div>
            <label className="text-[10px] font-bold">
              DPP per tagihan (Rp)
              <input
                required
                type="number"
                min="1"
                step="1"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className={inputClass}
              />
            </label>
            <label className="text-[10px] font-bold">
              Frekuensi
              <select
                value={form.recurrence_rule}
                onChange={(e) => setForm({ ...form, recurrence_rule: e.target.value })}
                className={inputClass}
              >
                <option value="MONTHLY">Bulanan</option>
                <option value="QUARTERLY">Triwulanan</option>
                <option value="YEARLY">Tahunan</option>
              </select>
            </label>
            <label className="text-[10px] font-bold">
              Tagihan berikutnya
              <input
                required
                type="date"
                value={form.next_run_date}
                onChange={(e) => setForm({ ...form, next_run_date: e.target.value })}
                className={inputClass}
              />
            </label>
            <label className="text-[10px] font-bold">
              Tanggal akhir (opsional)
              <input
                type="date"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                className={inputClass}
              />
            </label>
            <label className="text-[10px] font-bold">
              PPN masukan
              <select
                value={form.input_tax_code_id}
                onChange={(e) => setForm({ ...form, input_tax_code_id: e.target.value })}
                className={inputClass}
              >
                <option value="">Tanpa PPN</option>
                {taxes
                  .filter((tax) => tax.tax_direction === "INPUT_VAT")
                  .map((tax) => (
                    <option key={tax.id} value={tax.id}>
                      {tax.tax_code} · {tax.tax_rate}%
                    </option>
                  ))}
              </select>
            </label>
            <div className="flex items-center text-[10px] text-slate-600 md:col-span-2">
              PPN {formatMoney(tax)} · Total tagihan {formatMoney(base + tax)}
            </div>
            <div className="flex justify-end gap-2 md:col-span-2">
              {editing && (
                <button
                  type="button"
                  onClick={() => {
                    setEditing(null);
                    setForm(makeEmptyRule());
                  }}
                  className="rounded-lg border px-3 py-2 text-xs"
                >
                  Batal
                </button>
              )}
              <button
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-lg bg-[#163D64] px-4 py-2 text-xs font-bold text-white"
              >
                <Check size={13} />
                {editing ? "Simpan perubahan" : "Simpan aturan"}
              </button>
            </div>
          </form>
        )}

        {canOperate && entryMode === "grid" && !editing && (
          <form onSubmit={saveGridBatch} className="mt-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-slate-600">
                Ketik banyak baris sekaligus atau{" "}
                <code className="rounded bg-slate-100 px-1">Ctrl+V</code> dari Excel. Kolom
                DPP mendukung rumus (<code className="rounded bg-slate-100 px-1">=2500000*2</code>).
              </p>
              <button
                type="button"
                onClick={() => setGridRows((prev) => [...prev, makeEmptyRule()])}
                className="inline-flex items-center gap-1 rounded-lg bg-[#E7F2FF] px-3 py-1.5 text-xs font-bold text-[#163D64]"
              >
                <Plus size={13} /> Tambah Baris
              </button>
            </div>
            <div className="overflow-x-auto rounded-xl border border-[#E2E8F0]">
              <table className="w-full min-w-[1200px] text-left text-xs">
                <thead className="bg-slate-50 text-[10px] uppercase text-slate-500">
                  <tr>
                    <th className="p-2">Kode</th>
                    <th className="p-2">Nama Biaya</th>
                    <th className="p-2">Vendor</th>
                    <th className="p-2">Lingkup</th>
                    <th className="p-2">Proyek</th>
                    <th className="p-2">COA Beban</th>
                    <th className="p-2">Alokasi</th>
                    <th className="p-2 text-right">DPP (Rp)</th>
                    <th className="p-2">PPN</th>
                    <th className="p-2 text-right">Total</th>
                    <th className="p-2">Jadwal</th>
                    <th className="p-2" />
                  </tr>
                </thead>
                <tbody>
                  {gridRows.map((row, idx) => {
                    const rowAllocations = allocations.filter((a) =>
                      row.budget_scope === "PROJECT"
                        ? Boolean(row.project_id) &&
                          String(a.project_id ?? "") === String(row.project_id)
                        : !a.project_id
                    );
                    const rowTax = taxes.find((t) => t.id === row.input_tax_code_id);
                    const rowBase = Number(
                      evaluateFormulaInput(String(row.amount || "")) ?? row.amount ?? 0
                    );
                    const rowTotal =
                      rowBase + (rowTax ? (rowBase * Number(rowTax.tax_rate ?? 0)) / 100 : 0);

                    const updateRow = (patch: Record<string, any>) =>
                      setGridRows((prev) =>
                        prev.map((item, i) => (i === idx ? { ...item, ...patch } : item))
                      );

                    return (
                      <tr key={idx} className="border-t border-[#EFEFEF]">
                        <td className="p-1.5">
                          <input
                            data-rec-row={idx}
                            data-rec-col={0}
                            onKeyDown={(e) => moveGridCell(e, idx, 0, "rec")}
                            onPaste={(e) => handleGridPaste(e, idx, 0)}
                            value={row.rule_code}
                            onChange={(e) => updateRow({ rule_code: e.target.value })}
                            placeholder="RENT-01"
                            className={cn(gridInputClass, "text-[#1D4ED8]")}
                          />
                        </td>
                        <td className="p-1.5">
                          <input
                            data-rec-row={idx}
                            data-rec-col={1}
                            onKeyDown={(e) => moveGridCell(e, idx, 1, "rec")}
                            onPaste={(e) => handleGridPaste(e, idx, 1)}
                            value={row.description}
                            onChange={(e) => updateRow({ description: e.target.value })}
                            placeholder="Sewa..."
                            className={cn(gridInputClass, "text-[#1D4ED8]")}
                          />
                        </td>
                        <td className="p-1.5">
                          <select
                            data-rec-row={idx}
                            data-rec-col={2}
                            onKeyDown={(e) => moveGridCell(e, idx, 2, "rec")}
                            value={row.party_id}
                            onChange={(e) => updateRow({ party_id: e.target.value })}
                            className={gridInputClass}
                          >
                            <option value="">Vendor...</option>
                            {vendors.map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.display_name || v.legal_name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-1.5">
                          <select
                            data-rec-row={idx}
                            data-rec-col={3}
                            onKeyDown={(e) => moveGridCell(e, idx, 3, "rec")}
                            value={row.budget_scope}
                            onChange={(e) =>
                              updateRow({
                                budget_scope: e.target.value,
                                project_id: "",
                                budget_allocation_id: "",
                              })
                            }
                            className={gridInputClass}
                          >
                            <option value="OPERATIONAL">Operational</option>
                            <option value="PROJECT">Project</option>
                          </select>
                        </td>
                        <td className="p-1.5">
                          <select
                            disabled={row.budget_scope !== "PROJECT"}
                            data-rec-row={idx}
                            data-rec-col={4}
                            onKeyDown={(e) => moveGridCell(e, idx, 4, "rec")}
                            value={row.project_id}
                            onChange={(e) =>
                              updateRow({
                                project_id: e.target.value,
                                budget_allocation_id: "",
                              })
                            }
                            className={gridInputClass}
                          >
                            <option value="">—</option>
                            {activeProjects.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.project_code}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-1.5">
                          <select
                            data-rec-row={idx}
                            data-rec-col={5}
                            onKeyDown={(e) => moveGridCell(e, idx, 5, "rec")}
                            value={row.expense_account_id}
                            onChange={(e) =>
                              updateRow({ expense_account_id: e.target.value })
                            }
                            className={gridInputClass}
                          >
                            <option value="">COA...</option>
                            {activeAccounts.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.account_code} — {a.account_name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-1.5">
                          <select
                            data-rec-row={idx}
                            data-rec-col={6}
                            onKeyDown={(e) => moveGridCell(e, idx, 6, "rec")}
                            value={row.budget_allocation_id}
                            onChange={(e) => {
                              const alloc = rowAllocations.find(
                                (a) => String(a.id) === e.target.value
                              );
                              updateRow({
                                budget_allocation_id: e.target.value,
                                expense_account_id:
                                  alloc?.account_id ?? row.expense_account_id,
                                cost_center_id: alloc?.cost_center_id ?? "",
                              });
                            }}
                            className={gridInputClass}
                          >
                            <option value="">Pagu...</option>
                            {rowAllocations.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.allocation_name || a.budget?.budget_name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-1.5">
                          <input
                            data-rec-row={idx}
                            data-rec-col={7}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                const val = evaluateFormulaInput(String(row.amount || ""));
                                if (val !== null) updateRow({ amount: String(val) });
                              }
                              moveGridCell(e, idx, 7, "rec");
                            }}
                            onBlur={() => {
                              const val = evaluateFormulaInput(String(row.amount || ""));
                              if (val !== null) updateRow({ amount: String(val) });
                            }}
                            onPaste={(e) => handleGridPaste(e, idx, 7)}
                            value={row.amount}
                            onChange={(e) => updateRow({ amount: e.target.value })}
                            placeholder="0"
                            className={cn(
                              gridInputClass,
                              "text-right font-bold text-[#1D4ED8]"
                            )}
                          />
                        </td>
                        <td className="p-1.5">
                          <select
                            data-rec-row={idx}
                            data-rec-col={8}
                            onKeyDown={(e) => moveGridCell(e, idx, 8, "rec")}
                            value={row.input_tax_code_id}
                            onChange={(e) =>
                              updateRow({ input_tax_code_id: e.target.value })
                            }
                            className={gridInputClass}
                          >
                            <option value="">0%</option>
                            {taxes
                              .filter((t) => t.tax_direction === "INPUT_VAT")
                              .map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.tax_rate}%
                                </option>
                              ))}
                          </select>
                        </td>
                        <td className="whitespace-nowrap p-1.5 text-right font-bold text-[#0F172A]">
                          {formatMoney(rowTotal)}
                        </td>
                        <td className="p-1.5">
                          <input
                            type="date"
                            value={row.next_run_date}
                            onChange={(e) => updateRow({ next_run_date: e.target.value })}
                            className={gridInputClass}
                          />
                        </td>
                        <td className="p-1.5">
                          {gridRows.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                setGridRows((prev) => prev.filter((_, i) => i !== idx))
                              }
                              className="rounded p-1 text-red-600 hover:bg-red-50"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-600">
                Total Estimasi DPP Grid:{" "}
                {formatMoney(
                  gridRows.reduce(
                    (s, r) =>
                      s +
                      Number(evaluateFormulaInput(String(r.amount || "")) ?? r.amount ?? 0),
                    0
                  )
                )}
              </span>
              <button
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#163D64] px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
              >
                <Check size={14} /> Simpan Semua Baris
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="overflow-auto rounded-2xl border bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
          <h3 className="text-sm font-extrabold">Aturan biaya berulang</h3>
          <TableSearchBar
            query={rulesTable.query}
            onQueryChange={rulesTable.setQuery}
            onSearchSubmit={rulesTable.applySearch}
            onReset={rulesTable.resetSearch}
            placeholder="Cari kode, biaya, vendor, proyek..."
            totalItems={rules.length}
            filteredCount={rulesTable.totalItems}
          />
        </div>
        <table className="w-full min-w-[800px] text-left text-xs">
          <thead className="bg-slate-50 text-[10px] uppercase text-slate-500">
            <tr>
              <th className="p-3">Kode / biaya</th>
              <th className="p-3">Lingkup anggaran</th>
              <th className="p-3">Vendor</th>
              <th className="p-3">Nominal / jadwal</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rulesTable.paginatedItems.map((rule) => {
              const vendor = vendors.find((row) => row.id === rule.party_id);
              const project = projects.find((row) => row.id === rule.project_id);
              return (
                <tr key={rule.id} className="border-t">
                  <td className="p-3">
                    <b>{rule.rule_code}</b>
                    <div>{rule.description}</div>
                  </td>
                  <td className="p-3">
                    {project ? (
                      <>
                        <span className="font-bold text-[#163D64]">Project Budget</span>
                        <div className="text-[10px] text-slate-500">
                          {project.project_code} · {project.project_name}
                        </div>
                      </>
                    ) : (
                      <span className="font-bold text-emerald-700">
                        Operational Budget · Kantor internal
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    {vendor?.display_name || vendor?.legal_name || "—"}
                  </td>
                  <td className="p-3">
                    {formatMoney(rule.amount)}
                    <div className="text-[10px] text-slate-500">
                      {rule.recurrence_rule} · berikutnya{" "}
                      {String(rule.next_run_date).slice(0, 10)}
                    </div>
                  </td>
                  <td className="p-3">{rule.status}</td>
                  <td className="p-3 text-right">
                    {canOperate && (
                      <button
                        onClick={() => {
                          setEditing(rule.id);
                          setEntryMode("single");
                          setForm({
                            ...makeEmptyRule(),
                            ...rule,
                            budget_scope: rule.project_id ? "PROJECT" : "OPERATIONAL",
                            amount: String(rule.amount ?? ""),
                            next_run_date: String(rule.next_run_date ?? "").slice(0, 10),
                            end_date: rule.end_date
                              ? String(rule.end_date).slice(0, 10)
                              : "",
                          });
                        }}
                        className="rounded border p-1.5 text-[#163D64]"
                      >
                        <Pencil size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {!rulesTable.paginatedItems.length && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-slate-500">
                  Belum ada aturan biaya berulang.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {rulesTable.filteredItems.length > 0 && (
          <ExcelStatusBar
            label="Ringkasan DPP Aturan"
            values={rulesTable.filteredItems.map((r) => Number(r.amount ?? 0))}
          />
        )}
        <div className="px-4 pb-3 pt-2">
          <TablePagination
            page={rulesTable.page}
            totalPages={rulesTable.totalPages}
            pageSize={rulesTable.pageSize}
            totalItems={rulesTable.totalItems}
            onPageChange={rulesTable.setPage}
            onPageSizeChange={rulesTable.setPageSize}
          />
        </div>
      </section>

      <section className="overflow-auto rounded-2xl border bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
          <div>
            <h3 className="text-sm font-extrabold">Tagihan yang dihasilkan</h3>
            <p className="text-[10px] text-slate-500">
              Semua tagihan baru berstatus DRAFT dan muncul di menu Tagihan Vendor.
            </p>
          </div>
          <TableSearchBar
            query={runsTable.query}
            onQueryChange={runsTable.setQuery}
            onSearchSubmit={runsTable.applySearch}
            onReset={runsTable.resetSearch}
            placeholder="Cari invoice atau status..."
            totalItems={runs.length}
            filteredCount={runsTable.totalItems}
          />
        </div>
        <table className="w-full min-w-[700px] text-left text-xs">
          <thead className="bg-slate-50 text-[10px] uppercase text-slate-500">
            <tr>
              <th className="p-3">Jadwal</th>
              <th className="p-3">Invoice vendor</th>
              <th className="p-3">Nominal</th>
              <th className="p-3">Status invoice</th>
              <th className="p-3">Proses</th>
            </tr>
          </thead>
          <tbody>
            {runsTable.paginatedItems.map((run) => (
              <tr key={run.id} className="border-t">
                <td className="p-3">{String(run.scheduled_date ?? "").slice(0, 10)}</td>
                <td className="p-3 font-mono">
                  {run.billing_document?.invoice_number || run.id}
                </td>
                <td className="p-3">
                  {formatMoney(run.billing_document?.total_amount ?? 0)}
                </td>
                <td className="p-3">
                  {run.billing_document?.status || run.run_status}
                </td>
                <td className="p-3">Review di Tagihan Vendor</td>
              </tr>
            ))}
            {!runsTable.paginatedItems.length && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-slate-500">
                  Belum ada tagihan yang dihasilkan.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="px-4 pb-3">
          <TablePagination
            page={runsTable.page}
            totalPages={runsTable.totalPages}
            pageSize={runsTable.pageSize}
            totalItems={runsTable.totalItems}
            onPageChange={runsTable.setPage}
            onPageSizeChange={runsTable.setPageSize}
          />
        </div>
      </section>

      <p className="text-[10px] text-slate-500">
        Generate idempoten per aturan dan periode; menekan tombol kembali tidak membuat invoice
        duplikat. Aturan tidak melakukan pembayaran otomatis.
      </p>
    </div>
  );
}