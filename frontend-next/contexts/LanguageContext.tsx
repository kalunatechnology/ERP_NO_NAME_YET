"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type AppLanguage = "id" | "en";

interface LanguageContextValue {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  toggleLanguage: () => void;
  t: (text: string) => string;
}

const STORAGE_KEY = "arsalynk.language";

const idToEnglish: Record<string, string> = {
  "Linimasa Proyek": "Project Timeline",
  "Timeline Proyek": "Project Timeline",
  "Timeline Eksekusi Proyek": "Project Execution Timeline",
  "Paket Kerja / Task": "Work Package / Task",
  "Company tidak tersedia": "Company unavailable",
  "Pilih Context Company": "Select Company Context",
  "Ganti Password & Ubah Profil": "Change Password & Edit Profile",
  "Log Out Sesi": "Log Out",
  "Laporan Kehadiran": "Attendance Report",
  "Buka laporan kehadiran": "Open attendance report",
  "Buka Notifikasi & Feed Tim": "Open Notifications & Team Feed",
  "Pencarian Cepat & Navigasi": "Quick Search & Navigation",
  "Cari data, proyek, menu…": "Search data, projects, menus…",
  "Cari…": "Search…",
  "Konten": "Contents",
  "Beranda": "Home",
  "Proyek": "Projects",
  "Tugas": "Tasks",
  "Keuangan": "Finance",
  "Penjualan": "Sales",
  "Laporan": "Reports",
  "Pengaturan": "Settings",
  "Sumber Daya": "Resources",
  "Data Explorer": "Data Explorer",
  "Dashboard": "Dashboard",
  "Notifikasi": "Notifications",
  "Aktivitas": "Activities",
  "Kontak": "Contacts",
  "Peringatan": "Alert",
  "Waktu Nyata": "Real Time",
  "Performance Proyek": "Project Performance",
  "Kelola semua proyek": "Manage all projects",
  "Ringkasan Perusahaan": "Company Overview",
  "Total Proyek": "Total Projects",
  "Progres Keseluruhan": "Overall Progress",
  "Total Anggaran": "Total Budget",
  "Perlu Keputusan": "Decision Required",
  "Selesai": "Completed",
  "Berjalan": "In Progress",
  "Terlambat": "Delayed",
  "Lainnya": "Others",
  "proyek telah selesai": "projects completed",
  "proyek sedang aktif": "active projects",
  "perlu perhatian": "requires attention",
  "draft atau belum dimulai": "draft or not started",
  "rata-rata": "average",
  "digunakan": "used",
  "pending approval": "pending approval",
  "Ringkasan Keuangan": "Financial Summary",
  "Ringkasan": "Summary",
  "Operasional Proyek": "Project Operations",
  "Akuntansi": "Accounting",
  "Administrasi": "Administration",
  "Menu Finance": "Finance Menu",
  "Menu Modul": "Module Menu",
  "Buka Menu": "Open Menu",
  "Tutup menu Finance": "Close Finance menu",
  "Perluas sidebar Finance": "Expand Finance sidebar",
  "Ciutkan sidebar Finance": "Collapse Finance sidebar",
  "Perluas sidebar": "Expand sidebar",
  "Ciutkan sidebar": "Collapse sidebar",
  "Navigasi modul Finance": "Finance module navigation",
  "Master Perusahaan": "Company Master",
  "Profitabilitas": "Profitability",
  "Funding Proyek": "Project Funding",
  "Tagihan Vendor": "Vendor Bills",
  "Billing Termin": "Progress Billing",
  "Piutang": "Receivables",
  "Kas & Bank": "Cash & Bank",
  "Buku Besar": "General Ledger",
  "Laporan Keuangan": "Financial Statements",
  "Rekonsiliasi": "Reconciliation",
  "Perpajakan": "Taxation",
  "Aset Tetap": "Fixed Assets",
  "Tutup Buku": "Period Closing",
  "Detail finance": "Finance details",
  "Terpakai": "Used",
  "Sisa Anggaran": "Remaining Budget",
  "Pemantauan Kehadiran": "Attendance Monitoring",
  "Belum ada proyek.": "No projects yet.",
  "Belum ada alert baru.": "No new alerts.",
  "Belum ada anggota tim aktif.": "No active team members.",
  "Semua kontak ditampilkan": "All contacts are displayed",
  "Tampilkan lebih sedikit": "Show less",
  "Lihat semua kontak": "View all contacts",
  "Detail Anggota Tim": "Team Member Details",
  "Salin email": "Copy email",
  "Kirim Email": "Send Email",
  "Tutup": "Close",
  "Segarkan alert": "Refresh alerts",
  "Tutup panel kanan": "Close right panel",
  "Bahasa": "Language",
  "Indonesia": "Indonesian",
  "Inggris": "English",
  "Minggu": "Week",
  "Pelaksana": "Assignee",
  "Progres Realisasi": "Actual Progress",
  "Progres": "Progress",
  "Status": "Status",
  "Aktif": "Active",
  "Tidak Aktif": "Inactive",
  "Tambah": "Add",
  "Simpan": "Save",
  "Batal": "Cancel",
  "Hapus": "Delete",
  "Ubah": "Edit",
  "Lihat": "View",
  "Kembali": "Back",
  "Selanjutnya": "Next",
  "Sebelumnya": "Previous",
  "Nama": "Name",
  "Deskripsi": "Description",
  "Tanggal": "Date",
  "Mulai": "Start",
  "Berakhir": "End",
  "Semua": "All",
  "Hari ini": "Today",
  "Memuat…": "Loading…",
  "Tidak ada data": "No data",
  "Akses Dibatasi": "Access Restricted",
  "Kembali ke Dashboard": "Back to Dashboard",
  "Proyek Ditugaskan": "Assigned Projects",
  "Tugas Harian": "Daily Tasks",
  "Baru Dibuka": "Recently Opened",
  "Pengajuan Tugas": "Task Submission",
  "Kirim Timesheet": "Submit Timesheet",
  "Dikelompokkan": "Grouped",
  "Daftar": "List",
  "Hanya baca": "Read only",
  "Daftar Proyek": "Project List",
  "Ringkasan Eksekutif": "Executive Summary",
  "Status Saldo": "Balance Status",
  "Belum Tersedia": "Unavailable",
  "Cari task atau proyek...": "Search tasks or projects...",
  "Utilisasi Anggaran per Proyek": "Budget Utilization by Project",
  "Per halaman": "Per page",
  "Tampilkan": "Show",
  "menunggu persetujuan": "awaiting approval",
};

const englishToId = Object.fromEntries(
  Object.entries(idToEnglish).map(([id, en]) => [en, id])
) as Record<string, string>;

function translateText(text: string, language: AppLanguage): string {
  if (!text.trim()) return text;
  const dictionary = language === "en" ? idToEnglish : englishToId;
  const leading = text.match(/^\s*/)?.[0] || "";
  const trailing = text.match(/\s*$/)?.[0] || "";
  const core = text.trim();
  if (dictionary[core]) return `${leading}${dictionary[core]}${trailing}`;

  const templates: Array<[RegExp, (match: RegExpMatchArray) => string]> = language === "en"
    ? [
        [/^(\d+) proyek aktif$/i, (match) => `${match[1]} active projects`],
        [/^Minggu (\d+) – Minggu (\d+)$/i, (match) => `Week ${match[1]} – Week ${match[2]}`],
        [/^Lihat semua kontak \((\d+)\)$/i, (match) => `View all contacts (${match[1]})`],
        [/^(\d+) perlu dilengkapi$/i, (match) => `${match[1]} need completion`],
      ]
    : [
        [/^(\d+) active projects$/i, (match) => `${match[1]} proyek aktif`],
        [/^Week (\d+) – Week (\d+)$/i, (match) => `Minggu ${match[1]} – Minggu ${match[2]}`],
        [/^View all contacts \((\d+)\)$/i, (match) => `Lihat semua kontak (${match[1]})`],
        [/^(\d+) need completion$/i, (match) => `${match[1]} perlu dilengkapi`],
      ];
  for (const [pattern, render] of templates) {
    const match = core.match(pattern);
    if (match) return `${leading}${render(match)}${trailing}`;
  }
  return text;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>("id");

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "id") setLanguageState(saved);
  }, []);

  const setLanguage = useCallback((next: AppLanguage) => {
    setLanguageState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguage(language === "id" ? "en" : "id");
  }, [language, setLanguage]);

  const t = useCallback((text: string) => translateText(text, language), [language]);
  const value = useMemo(() => ({ language, setLanguage, toggleLanguage, t }), [language, setLanguage, toggleLanguage, t]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
      <DocumentLanguageRuntime language={language} />
    </LanguageContext.Provider>
  );
}

function DocumentLanguageRuntime({ language }: { language: AppLanguage }) {
  useEffect(() => {
    document.documentElement.lang = language;
    const textState = new WeakMap<Text, { source: string; rendered: string }>();
    const attributeState = new WeakMap<Element, Map<string, { source: string; rendered: string }>>();
    const attributes = ["placeholder", "title", "aria-label"];

    const isExcluded = (element: Element | null) => Boolean(
      element?.closest("[data-no-translate], script, style, code, pre, textarea, [contenteditable='true']")
    );

    const translateNode = (node: Text) => {
      if (isExcluded(node.parentElement)) return;
      const current = node.nodeValue || "";
      const previous = textState.get(node);
      const source = previous && current === previous.rendered ? previous.source : current;
      const rendered = translateText(source, language);
      textState.set(node, { source, rendered });
      if (current !== rendered) node.nodeValue = rendered;
    };

    const translateAttributes = (element: Element) => {
      if (isExcluded(element)) return;
      const state = attributeState.get(element) || new Map();
      for (const attribute of attributes) {
        const current = element.getAttribute(attribute);
        if (!current) continue;
        const previous = state.get(attribute);
        const source = previous && current === previous.rendered ? previous.source : current;
        const rendered = translateText(source, language);
        state.set(attribute, { source, rendered });
        if (current !== rendered) element.setAttribute(attribute, rendered);
      }
      attributeState.set(element, state);
    };

    const translateTree = (root: Node) => {
      if (root.nodeType === Node.TEXT_NODE) {
        translateNode(root as Text);
        return;
      }
      if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
      if (root instanceof Element) translateAttributes(root);
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node) {
        if (node.nodeType === Node.TEXT_NODE) translateNode(node as Text);
        else translateAttributes(node as Element);
        node = walker.nextNode();
      }
    };

    translateTree(document.body);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") translateNode(mutation.target as Text);
        mutation.addedNodes.forEach(translateTree);
        if (mutation.type === "attributes") translateAttributes(mutation.target as Element);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: attributes });
    return () => observer.disconnect();
  }, [language]);
  return null;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used within LanguageProvider");
  return context;
}
