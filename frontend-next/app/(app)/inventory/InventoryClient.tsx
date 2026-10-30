"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Archive, Barcode, Download, FileSpreadsheet, FileText, LoaderCircle, Package, Plus, RefreshCw, Save, Search, Upload } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";
import { canAccessRoute } from "@/lib/access/module-contract";
import { AccessDeniedState } from "@/components/ui/AccessDeniedState";
import {
  createSerialNumber,
  downloadInventoryDocument,
  InventoryDocument,
  loadInventoryDocuments,
  loadInventoryProducts,
  InventoryProductCategory,
  loadInventoryProductCategories,
  loadSerialNumbers,
  saveInventoryProduct,
  saveInventoryProductCategory,
  uploadInventoryDocument,
} from "@/lib/api/inventory.api";

type TabKey = "products" | "serials" | "documents";
type ProductForm = {
  product_code: string; product_name: string; product_type: string; category_id: string; costing_method: string;
  stock_item: boolean; purchase_item: boolean; sales_item: boolean; manufactured_item: boolean;
  lot_controlled: boolean; serial_controlled: boolean; status: string;
};

const blankProduct: ProductForm = {
  product_code: "", product_name: "", product_type: "GOODS", category_id: "", costing_method: "FIFO",
  stock_item: true, purchase_item: true, sales_item: true, manufactured_item: false,
  lot_controlled: false, serial_controlled: false, status: "ACTIVE",
};

const PRODUCT_HEADERS = ["product_code", "product_name", "category_code", "product_type", "costing_method", "stock_item", "purchase_item", "sales_item", "manufactured_item", "lot_controlled", "serial_controlled", "status"];

function boolValue(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["true", "1", "yes", "y", "ya", "aktif"].includes(normalized)) return true;
  if (["false", "0", "no", "n", "tidak", "nonaktif"].includes(normalized)) return false;
  return fallback;
}

function base64FromFile(file: File) {
  return file.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...Array.from(bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length))));
    }
    return btoa(binary);
  });
}

function inferMime(file: File) {
  if (file.type) return file.type;
  const extension = file.name.split(".").pop()?.toLowerCase();
  const mimeByExtension: Record<string, string> = {
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xls: "application/vnd.ms-excel", pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    doc: "application/msword", csv: "text/csv", txt: "text/plain",
  };
  return mimeByExtension[extension || ""] || "";
}

function downloadProductTemplate() {
  const sheet = XLSX.utils.aoa_to_sheet([PRODUCT_HEADERS, ["PRD-001", "Contoh Produk", "HARDWARE", "GOODS", "FIFO", true, true, true, false, false, true, "ACTIVE"]]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Products");
  XLSX.writeFile(book, "template-master-produk.xlsx");
}

export default function InventoryClient() {
  const { user, userRole, isLoading: authLoading } = useAuth();
  const isAllowed = !authLoading && canAccessRoute({
    pathname: "/inventory", enabledModules: user?.enabled_modules, delegatedModules: user?.delegated_modules,
    moduleAccess: user?.module_access, activeRoleCode: user?.active_role_code, isSuperAdmin: userRole === "super_admin",
  });
  const [tab, setTab] = useState<TabKey>("products");
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<InventoryProductCategory[]>([]);
  const [serials, setSerials] = useState<any[]>([]);
  const [documents, setDocuments] = useState<InventoryDocument[]>([]);
  const [search, setSearch] = useState("");
  const [productForm, setProductForm] = useState<ProductForm>(blankProduct);
  const [categoryForm, setCategoryForm] = useState({ category_code: "", category_name: "", serial_controlled: false });
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [serialForm, setSerialForm] = useState({ serial_number: "", product_id: "", status: "IN_STOCK" });
  const [documentForm, setDocumentForm] = useState({ title: "", category: "GENERAL", description: "" });
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [productRows, serialRows, documentRows, categoryRows] = await Promise.all([loadInventoryProducts(), loadSerialNumbers(), loadInventoryDocuments(), loadInventoryProductCategories()]);
      setProducts(productRows); setSerials(serialRows); setDocuments(documentRows); setCategories(categoryRows);
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || "Data inventori tidak dapat dimuat. Periksa akses modul Inventory.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (isAllowed) void reload(); }, [isAllowed, reload]);

  const visibleProducts = useMemo(() => products.filter((row) => `${row.product_code} ${row.product_name}`.toLowerCase().includes(search.toLowerCase())), [products, search]);
  const visibleSerials = useMemo(() => serials.filter((row) => {
    const product = products.find((item) => String(item.id) === String(row.product_id));
    return `${row.serial_number} ${product?.product_code || ""} ${product?.product_name || ""}`.toLowerCase().includes(search.toLowerCase());
  }), [serials, products, search]);
  const visibleDocuments = useMemo(() => documents.filter((row) => `${row.title} ${row.category} ${row.file_name}`.toLowerCase().includes(search.toLowerCase())), [documents, search]);

  if (authLoading) return <div className="p-8 text-sm text-text-secondary">Memeriksa akses…</div>;
  if (!isAllowed) return <AccessDeniedState title="Akses Inventory dibutuhkan" description="Aktifkan modul Inventory & Stock untuk mengelola produk, nomor seri, dan dokumen internal." section="INVENTORY" />;

  const saveProduct = async () => {
    if (!productForm.product_code.trim() || !productForm.product_name.trim()) return toast.error("Kode dan nama produk wajib diisi.");
    setBusy(true);
    try {
      const payload = { ...productForm, product_code: productForm.product_code.trim(), product_name: productForm.product_name.trim() };
      await saveInventoryProduct(payload, editingProductId || undefined);
      toast.success(editingProductId ? "Produk diperbarui." : "Produk ditambahkan.");
      setProductForm(blankProduct); setEditingProductId(null); await reload();
    } catch (error: any) { toast.error(error?.response?.data?.detail || "Produk tidak berhasil disimpan."); }
    finally { setBusy(false); }
  };

  const saveCategory = async () => {
    const code = categoryForm.category_code.trim().toUpperCase();
    const name = categoryForm.category_name.trim();
    if (!code || !name) return toast.error("Kode dan nama kategori wajib diisi.");
    setBusy(true);
    try {
      const category = await saveInventoryProductCategory({ ...categoryForm, category_code: code, category_name: name, status: "ACTIVE" });
      setCategoryForm({ category_code: "", category_name: "", serial_controlled: false });
      setProductForm((form) => ({ ...form, category_id: category.id, serial_controlled: category.serial_controlled }));
      toast.success("Kategori produk ditambahkan."); await reload();
    } catch (error: any) { toast.error(error?.response?.data?.detail || "Kategori tidak berhasil disimpan."); }
    finally { setBusy(false); }
  };

  const addCommonCategories = async () => {
    const presets = [
      { category_code: "HARDWARE", category_name: "Hardware", serial_controlled: true },
      { category_code: "SOFTWARE", category_name: "Software", serial_controlled: false },
      { category_code: "SERVICE", category_name: "Jasa", serial_controlled: false },
      { category_code: "GROCERIES", category_name: "Groceries", serial_controlled: false },
    ];
    const missing = presets.filter((preset) => !categories.some((category) => category.category_code.toLowerCase() === preset.category_code.toLowerCase()));
    if (!missing.length) return toast("Kategori umum sudah tersedia.");
    setBusy(true);
    try {
      for (const category of missing) await saveInventoryProductCategory({ ...category, status: "ACTIVE" });
      toast.success(`${missing.length} kategori umum ditambahkan.`); await reload();
    } catch (error: any) { toast.error(error?.response?.data?.detail || "Kategori umum tidak berhasil ditambahkan."); await reload(); }
    finally { setBusy(false); }
  };

  const selectProductCategory = (categoryId: string) => {
    const category = categories.find((item) => item.id === categoryId);
    setProductForm((form) => ({ ...form, category_id: categoryId, serial_controlled: category ? category.serial_controlled : form.serial_controlled }));
  };

  const startEditProduct = (product: any) => {
    setEditingProductId(String(product.id));
    setProductForm({ ...blankProduct, ...product, category_id: String(product.category_id || "") });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const saveSerial = async () => {
    if (!serialForm.serial_number.trim() || !serialForm.product_id) return toast.error("Produk dan nomor seri wajib dipilih.");
    setBusy(true);
    try {
      await createSerialNumber({ ...serialForm, serial_number: serialForm.serial_number.trim() });
      toast.success("Nomor seri tersimpan di inventori."); setSerialForm({ serial_number: "", product_id: "", status: "IN_STOCK" }); await reload();
    } catch (error: any) { toast.error(error?.response?.data?.detail || "Nomor seri gagal disimpan. Pastikan nomor seri belum digunakan."); }
    finally { setBusy(false); }
  };

  const uploadDocument = async (file = documentFile, category = documentForm.category, title = documentForm.title, description = documentForm.description): Promise<boolean> => {
    if (!file) { toast.error("Pilih file terlebih dahulu."); return false; }
    if (file.size > 7 * 1024 * 1024) { toast.error("Ukuran file maksimum 7 MB."); return false; }
    if (!title.trim()) { toast.error("Judul dokumen wajib diisi."); return false; }
    setBusy(true);
    try {
      const content_base64 = await base64FromFile(file);
      await uploadInventoryDocument({ title: title.trim(), category, description, file_name: file.name, mime_type: inferMime(file), content_base64 });
      toast.success("Dokumen disimpan di ruang data internal.");
      setDocumentFile(null); setDocumentForm({ title: "", category: "GENERAL", description: "" }); await reload();
      return true;
    } catch (error: any) { toast.error(error?.response?.data?.detail || "Dokumen tidak berhasil diunggah."); }
    finally { setBusy(false); }
    return false;
  };

  const importProducts = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    if (file.size > 7 * 1024 * 1024) return toast.error("Ukuran XLSX maksimum 7 MB.");
    setBusy(true);
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw new Error("Workbook tidak memiliki sheet.");
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: "", raw: false });
      const existingCodes = new Set(products.map((item) => String(item.product_code || "").trim().toLowerCase()));
      const seenCodes = new Set<string>();
      const prepared = rows.map((row) => {
        const normalized = Object.fromEntries(Object.entries(row).map(([key, value]) => [key.toLowerCase().replace(/[\s-]+/g, "_").trim(), value]));
        const categoryKey = String(normalized.category_code ?? normalized.category_name ?? "").trim().toLowerCase();
        const category = categories.find((item) => item.category_code.toLowerCase() === categoryKey || item.category_name.toLowerCase() === categoryKey);
        const payload: ProductForm = {
          product_code: String(normalized.product_code ?? normalized.code ?? "").trim(),
          product_name: String(normalized.product_name ?? normalized.name ?? "").trim(),
          category_id: category?.id || "",
          product_type: String(normalized.product_type ?? "GOODS").trim().toUpperCase(),
          costing_method: String(normalized.costing_method ?? "FIFO").trim().toUpperCase(),
          stock_item: boolValue(normalized.stock_item, true), purchase_item: boolValue(normalized.purchase_item, true),
          sales_item: boolValue(normalized.sales_item, true), manufactured_item: boolValue(normalized.manufactured_item, false),
          lot_controlled: boolValue(normalized.lot_controlled, false), serial_controlled: boolValue(normalized.serial_controlled, category?.serial_controlled ?? false),
          status: String(normalized.status ?? "ACTIVE").trim().toUpperCase(),
        };
        return payload;
      }).filter((row) => row.product_code && row.product_name);
      const valid = prepared.filter((row) => {
        const code = row.product_code.toLowerCase();
        if (existingCodes.has(code) || seenCodes.has(code)) return false;
        seenCodes.add(code); return true;
      });
      if (!valid.length) throw new Error("Tidak ada produk baru yang valid. Pastikan kolom product_code dan product_name terisi.");
      const archived = await uploadDocument(file, "PRODUCT_IMPORT", `Impor produk — ${file.name}`, `File sumber impor produk (${valid.length} baris diproses).`);
      if (!archived) throw new Error("File sumber impor belum tersimpan; produk belum diubah.");
      let imported = 0; const errors: string[] = [];
      for (const row of valid) {
        try { await saveInventoryProduct(row); imported += 1; }
        catch (error: any) { errors.push(`${row.product_code}: ${error?.response?.data?.detail || "gagal"}`); }
      }
      await reload();
      toast.success(`${imported} produk berhasil diimpor${errors.length ? `; ${errors.length} baris gagal` : ""}. File sumber disimpan di Dokumen Internal.`);
      if (errors.length) toast.error(errors.slice(0, 3).join(" · "));
    } catch (error: any) { toast.error(error?.message || error?.response?.data?.detail || "File XLSX tidak dapat diproses."); }
    finally { setBusy(false); }
  };

  const handleDocumentPick = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setDocumentFile(file);
    if (file && !documentForm.title) setDocumentForm((form) => ({ ...form, title: file.name.replace(/\.[^.]+$/, "") }));
  };

  const tabs: Array<{ id: TabKey; label: string; icon: typeof Package }> = [
    { id: "products", label: `Produk (${products.length})`, icon: Package },
    { id: "serials", label: `Nomor Seri (${serials.length})`, icon: Barcode },
    { id: "documents", label: `Dokumen Internal (${documents.length})`, icon: Archive },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
      <div className="flex flex-col gap-3 rounded-2xl border border-[#DCE3EB] bg-white p-5 md:flex-row md:items-center md:justify-between">
        <div><p className="text-xs font-bold uppercase tracking-wide text-blue-700">Inventory & Internal Data</p><h1 className="mt-1 text-xl font-extrabold text-[#172033]">Produk, serial number & dokumen</h1><p className="mt-1 max-w-2xl text-sm text-text-secondary">Kelola katalog produk, catat serial untuk pemeriksaan garansi, dan simpan XLSX serta dokumen internal per company.</p></div>
        <button onClick={() => void reload()} className="btn-ghost flex items-center gap-2 self-start text-xs md:self-auto"><RefreshCw size={14} /> Muat ulang</button>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-[#DCE3EB]">
        {tabs.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => { setTab(id); setSearch(""); }} className={`inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold ${tab === id ? "border-blue-700 text-blue-800" : "border-transparent text-text-secondary hover:text-text-primary"}`}><Icon size={15} />{label}</button>)}
      </div>

      {tab === "products" && <>
        <section className="rounded-xl border border-[#DCE3EB] bg-white p-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2"><div><h2 className="text-sm font-bold">Kategori produk dinamis</h2><p className="mt-1 text-xs text-text-secondary">Gunakan kategori umum atau buat sendiri. Hardware memakai kontrol serial sebagai nilai awal; kategori lain dapat diatur sesuai kebutuhan.</p></div><button onClick={() => void addCommonCategories()} disabled={busy} className="btn-ghost text-xs">Tambah kategori umum</button></div>
          <div className="grid gap-3 sm:grid-cols-[1fr_1.5fr_auto_auto] sm:items-end">
            <label className="text-xs font-medium">Kode kategori<input className="input mt-1 w-full" maxLength={100} placeholder="HARDWARE" value={categoryForm.category_code} onChange={(e) => setCategoryForm({ ...categoryForm, category_code: e.target.value })} /></label>
            <label className="text-xs font-medium">Nama kategori<input className="input mt-1 w-full" maxLength={150} placeholder="Hardware" value={categoryForm.category_name} onChange={(e) => setCategoryForm({ ...categoryForm, category_name: e.target.value })} /></label>
            <label className="inline-flex items-center gap-2 pb-2 text-xs"><input type="checkbox" checked={categoryForm.serial_controlled} onChange={(e) => setCategoryForm({ ...categoryForm, serial_controlled: e.target.checked })} /> Serial aktif secara default</label>
            <button onClick={() => void saveCategory()} disabled={busy} className="btn-primary flex items-center justify-center gap-1 text-xs"><Plus size={13} /> Tambah kategori</button>
          </div>
          {categories.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{categories.filter((category) => category.status === "ACTIVE").map((category) => <span key={category.id} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs">{category.category_name} <span className="text-text-secondary">({category.category_code}){category.serial_controlled ? " · serial default" : ""}</span></span>)}</div>}
        </section>
        <section className="rounded-xl border border-[#DCE3EB] bg-white p-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2"><div><h2 className="text-sm font-bold">{editingProductId ? "Ubah produk" : "Tambah produk"}</h2><p className="mt-1 text-xs text-text-secondary">Isi katalog satu per satu atau impor banyak produk dengan XLSX.</p></div><div className="flex flex-wrap gap-2"><button onClick={downloadProductTemplate} className="btn-ghost flex items-center gap-1 text-xs"><Download size={13} /> Template XLSX</button><label className={`btn-ghost flex cursor-pointer items-center gap-1 text-xs ${busy ? "pointer-events-none opacity-50" : ""}`}><Upload size={13} /> Impor XLSX<input className="hidden" type="file" accept=".xlsx,.xls" onChange={(event) => void importProducts(event)} /></label></div></div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-xs font-medium">Kode produk *<input className="input mt-1 w-full" value={productForm.product_code} onChange={(e) => setProductForm({ ...productForm, product_code: e.target.value })} /></label>
            <label className="text-xs font-medium">Nama produk *<input className="input mt-1 w-full" value={productForm.product_name} onChange={(e) => setProductForm({ ...productForm, product_name: e.target.value })} /></label>
            <label className="text-xs font-medium">Kategori<select className="input mt-1 w-full" value={productForm.category_id} onChange={(e) => selectProductCategory(e.target.value)}><option value="">Tanpa kategori</option>{categories.filter((category) => category.status === "ACTIVE").map((category) => <option key={category.id} value={category.id}>{category.category_name} ({category.category_code})</option>)}</select></label>
            <label className="text-xs font-medium">Tipe<select className="input mt-1 w-full" value={productForm.product_type} onChange={(e) => setProductForm({ ...productForm, product_type: e.target.value })}><option value="GOODS">Barang</option><option value="SERVICE">Jasa</option><option value="RAW_MATERIAL">Bahan baku</option><option value="FINISHED_GOOD">Barang jadi</option></select></label>
            <label className="text-xs font-medium">Metode biaya<select className="input mt-1 w-full" value={productForm.costing_method} onChange={(e) => setProductForm({ ...productForm, costing_method: e.target.value })}><option value="FIFO">FIFO</option><option value="WEIGHTED_AVERAGE">Rata-rata tertimbang</option><option value="STANDARD">Biaya standar</option></select></label>
            <label className="text-xs font-medium">Status<select className="input mt-1 w-full" value={productForm.status} onChange={(e) => setProductForm({ ...productForm, status: e.target.value })}><option value="ACTIVE">Aktif</option><option value="INACTIVE">Nonaktif</option></select></label>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs sm:col-span-2 lg:col-span-3">{(["stock_item", "purchase_item", "sales_item", "manufactured_item", "lot_controlled", "serial_controlled"] as const).map((key) => <label key={key} className="inline-flex items-center gap-1.5"><input type="checkbox" checked={productForm[key]} onChange={(e) => setProductForm({ ...productForm, [key]: e.target.checked })} />{{ stock_item: "Barang stok", purchase_item: "Dapat dibeli", sales_item: "Dapat dijual", manufactured_item: "Diproduksi", lot_controlled: "Kontrol lot", serial_controlled: "Kontrol serial" }[key]}</label>)}</div>
          </div>
          <div className="mt-3 flex gap-2"><button onClick={() => void saveProduct()} disabled={busy} className="btn-primary flex items-center gap-1 text-xs"><Save size={13} />{busy ? "Menyimpan…" : editingProductId ? "Simpan perubahan" : "Tambah produk"}</button>{editingProductId && <button onClick={() => { setEditingProductId(null); setProductForm(blankProduct); }} className="btn-ghost text-xs">Batal ubah</button>}</div>
        </section>
        <section className="rounded-xl border border-[#DCE3EB] bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-bold">Katalog produk</h2><label className="relative"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-secondary" /><input className="input pl-8 text-xs" placeholder="Cari kode atau nama" value={search} onChange={(e) => setSearch(e.target.value)} /></label></div>
          {loading ? <Loading /> : <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-xs"><thead className="bg-slate-50 text-text-secondary"><tr>{["Kode", "Produk", "Kategori", "Tipe", "Kontrol", "Status", "Aksi"].map((label) => <th key={label} className="p-2.5 font-semibold">{label}</th>)}</tr></thead><tbody>{visibleProducts.map((product) => <tr key={product.id} className="border-t border-slate-100"><td className="p-2.5 font-mono">{product.product_code}</td><td className="p-2.5 font-semibold">{product.product_name}</td><td className="p-2.5">{categories.find((category) => category.id === product.category_id)?.category_name || "—"}</td><td className="p-2.5">{product.product_type}</td><td className="p-2.5">{product.serial_controlled ? "Serial" : "—"}{product.lot_controlled ? " · Lot" : ""}</td><td className="p-2.5">{product.status}</td><td className="p-2.5"><button onClick={() => startEditProduct(product)} className="text-blue-700 hover:underline">Ubah</button></td></tr>)}</tbody></table>{!visibleProducts.length && <Empty>No product ditemukan.</Empty>}</div>}
        </section>
      </>}

      {tab === "serials" && <>
        <section className="rounded-xl border border-[#DCE3EB] bg-white p-4">
          <h2 className="text-sm font-bold">Catat nomor seri produk</h2><p className="mt-1 text-xs leading-5 text-text-secondary">Nomor seri dibuat dan dikelola di sini pada Inventory → Nomor Seri. Hubungkan dengan produk yang memiliki kontrol serial agar dapat dipakai saat tiket dan pemeriksaan garansi.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <label className="text-xs font-medium">Produk *<select className="input mt-1 w-full" value={serialForm.product_id} onChange={(e) => setSerialForm({ ...serialForm, product_id: e.target.value })}><option value="">Pilih produk</option>{products.filter((product) => product.serial_controlled).map((product) => <option key={product.id} value={product.id}>{product.product_code} · {product.product_name}</option>)}</select></label>
            <label className="text-xs font-medium">Nomor seri *<input className="input mt-1 w-full" value={serialForm.serial_number} onChange={(e) => setSerialForm({ ...serialForm, serial_number: e.target.value })} placeholder="Contoh: SN-2026-0001" /></label>
            <button onClick={() => void saveSerial()} disabled={busy} className="btn-primary mt-auto flex items-center justify-center gap-1 text-xs"><Plus size={13} /> Simpan serial</button>
          </div>
        </section>
        <section className="rounded-xl border border-[#DCE3EB] bg-white p-4"><div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-sm font-bold">Daftar nomor seri</h2><label className="relative"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-secondary" /><input className="input pl-8 text-xs" placeholder="Cari serial atau produk" value={search} onChange={(e) => setSearch(e.target.value)} /></label></div>{loading ? <Loading /> : <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left text-xs"><thead className="bg-slate-50 text-text-secondary"><tr><th className="p-2.5">Nomor seri</th><th className="p-2.5">Produk</th><th className="p-2.5">Status</th><th className="p-2.5">Lokasi</th></tr></thead><tbody>{visibleSerials.map((serial) => { const product = products.find((item) => String(item.id) === String(serial.product_id)); return <tr key={serial.id} className="border-t border-slate-100"><td className="p-2.5 font-mono font-semibold">{serial.serial_number}</td><td className="p-2.5">{product?.product_code || "—"} · {product?.product_name || "Produk tidak ditemukan"}</td><td className="p-2.5">{serial.status}</td><td className="p-2.5">{serial.current_location_id || "—"}</td></tr>; })}</tbody></table>{!visibleSerials.length && <Empty>Belum ada nomor seri.</Empty>}</div>}</section>
      </>}

      {tab === "documents" && <>
        <section className="rounded-xl border border-[#DCE3EB] bg-white p-4">
          <h2 className="text-sm font-bold">Simpan dokumen internal</h2><p className="mt-1 text-xs leading-5 text-text-secondary">File disimpan pada company aktif dan hanya dapat diunduh oleh pengguna yang memiliki akses Inventory. Format: XLSX, XLS, PDF, DOCX, DOC, CSV, TXT. Maksimum 7 MB per file.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs font-medium">Judul *<input className="input mt-1 w-full" value={documentForm.title} onChange={(e) => setDocumentForm({ ...documentForm, title: e.target.value })} /></label>
            <label className="text-xs font-medium">Kategori<select className="input mt-1 w-full" value={documentForm.category} onChange={(e) => setDocumentForm({ ...documentForm, category: e.target.value })}><option value="GENERAL">Umum</option><option value="PRODUCT_IMPORT">Impor produk</option><option value="PRODUCT_SPEC">Spesifikasi produk</option><option value="POLICY">Kebijakan / SOP</option><option value="CONTRACT">Kontrak / komersial</option><option value="WARRANTY">Garansi / manual</option></select></label>
            <label className="text-xs font-medium">Pilih file *<input className="input mt-1 w-full" type="file" accept=".xlsx,.xls,.pdf,.docx,.doc,.csv,.txt" onChange={handleDocumentPick} /></label>
            <div className="flex items-end"><button onClick={() => void uploadDocument()} disabled={busy || !documentFile} className="btn-primary flex w-full items-center justify-center gap-1 text-xs"><Upload size={13} /> Unggah ke Data Internal</button></div>
            <label className="text-xs font-medium sm:col-span-2 lg:col-span-4">Keterangan<textarea className="input mt-1 w-full" rows={2} maxLength={2000} value={documentForm.description} onChange={(e) => setDocumentForm({ ...documentForm, description: e.target.value })} /></label>
          </div>
        </section>
        <section className="rounded-xl border border-[#DCE3EB] bg-white p-4"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-bold">Ruang dokumen internal</h2><label className="relative"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-secondary" /><input className="input pl-8 text-xs" placeholder="Cari dokumen" value={search} onChange={(e) => setSearch(e.target.value)} /></label></div>{loading ? <Loading /> : visibleDocuments.length ? <div className="divide-y divide-slate-100">{visibleDocuments.map((document) => <DocumentRow key={document.id} document={document} onDownload={() => void downloadInventoryDocument(document.id, document.file_name).catch(() => toast.error("File tidak dapat diunduh."))} />)}</div> : <Empty>Belum ada dokumen yang diunggah.</Empty>}</section>
      </>}
    </div>
  );
}

function DocumentRow({ document, onDownload }: { document: InventoryDocument; onDownload: () => void }) {
  const Icon = document.mime_type.includes("sheet") || document.mime_type.includes("excel") || document.mime_type.includes("csv") ? FileSpreadsheet : FileText;
  return <div className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="flex min-w-0 items-center gap-3"><span className="rounded-lg bg-blue-50 p-2 text-blue-700"><Icon size={16} /></span><div className="min-w-0"><p className="truncate text-xs font-semibold">{document.title}</p><p className="truncate text-2xs text-text-secondary">{document.file_name} · {document.category} · {Math.max(1, Math.round(Number(document.file_size) / 1024))} KB · {new Date(document.created_at).toLocaleDateString("id-ID")}</p>{document.description && <p className="mt-0.5 truncate text-2xs text-text-secondary">{document.description}</p>}</div></div><button onClick={onDownload} className="btn-ghost inline-flex items-center gap-1 text-xs"><Download size={13} /> Unduh</button></div>;
}

function Loading() { return <div className="flex items-center gap-2 py-8 text-sm text-text-secondary"><LoaderCircle size={16} className="animate-spin" /> Memuat data…</div>; }
function Empty({ children }: { children: React.ReactNode }) { return <div className="py-7 text-center text-xs text-text-secondary">{children}</div>; }
