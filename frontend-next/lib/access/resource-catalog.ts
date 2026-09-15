export interface ResourceEntity {
  id: string;
  name: string;
  endpoint: string;
  category: "Project" | "Finance" | "CRM" | "Master" | "Core";
  description: string;
  moduleLink?: string;
}

export const REPOSITORY_ENTITIES: readonly ResourceEntity[] = [
  { id: "projects", name: "Daftar Portofolio Proyek", endpoint: "/api/v1/projects/projects/", category: "Project", description: "Master project, timeline, kontrak & target penyelesaian", moduleLink: "/projects" },
  { id: "main-tasks", name: "WBS Level 1 (Main Tasks)", endpoint: "/api/v1/projects/main-tasks/", category: "Project", description: "Deliverable struktural utama dan fase pengerjaan proyek", moduleLink: "/projects" },
  { id: "weekly-tasks", name: "WBS Level 2 (Weekly Tasks)", endpoint: "/api/v1/projects/weekly-tasks/", category: "Project", description: "Paket kerja mingguan dan progres capaian berkala", moduleLink: "/projects" },
  { id: "daily-tasks", name: "WBS Level 3 (Daily Tasks)", endpoint: "/api/v1/projects/daily-tasks/", category: "Project", description: "Aktivitas harian lapangan, checklist dan issue blocking", moduleLink: "/projects" },
  { id: "milestones", name: "Project Milestones", endpoint: "/api/v1/projects/milestones/", category: "Project", description: "Titik capaian krusial dan dasar termin penagihan klien", moduleLink: "/projects" },
  { id: "costs", name: "Cost Entries (Beban WIP)", endpoint: "/api/v1/finance/project-cost-entries/", category: "Finance", description: "Realisasi pengeluaran dan akumulasi persediaan WIP", moduleLink: "/finance" },
  { id: "fundings", name: "Funding Proyek", endpoint: "/api/v1/finance/project-fundings/", category: "Finance", description: "Pencairan modal kerja dan drawdown kas proyek", moduleLink: "/finance" },
  { id: "proposals", name: "Proposal Billing Termin", endpoint: "/api/v1/finance/billing-proposals/", category: "Finance", description: "Pengajuan penagihan termin dan sertifikasi milestone", moduleLink: "/finance" },
  { id: "journals", name: "Buku Jurnal Umum", endpoint: "/api/v1/finance/journal-entries/", category: "Finance", description: "Pencatatan double-entry GL akuntansi perusahaan", moduleLink: "/finance" },
  { id: "inquiries", name: "Incoming Inquiries", endpoint: "/api/v1/crm/customer-inquiries/", category: "CRM", description: "Prospek masuk, brief kebutuhan dan inquiry klien", moduleLink: "/crm" },
  { id: "opportunities", name: "Deals & Opportunities", endpoint: "/api/v1/crm/opportunities/", category: "CRM", description: "Pipeline komersial, probabilitas dan estimasi deal", moduleLink: "/crm" },
  { id: "estimates", name: "Cost Estimates (HPP)", endpoint: "/api/v1/crm/cost-estimates/", category: "CRM", description: "Kalkulasi HPP, breakdown overhead, dan target margin", moduleLink: "/crm" },
  { id: "quotations", name: "Sales Quotations", endpoint: "/api/v1/sales/quotations/", category: "CRM", description: "Surat penawaran harga resmi dan status persetujuan", moduleLink: "/crm" },
  { id: "orders", name: "Sales Orders / Kontrak", endpoint: "/api/v1/sales/orders/", category: "CRM", description: "Pesanan terbit dan kontrak pengerjaan aktif", moduleLink: "/crm" },
  { id: "tickets", name: "Support & Klaim Garansi", endpoint: "/api/v1/service/cases/", category: "CRM", description: "Tiket penanganan purnajual, SLA dan klaim garansi", moduleLink: "/crm" },
  { id: "credit", name: "Credit Limit Snapshots", endpoint: "/api/v1/crm/credit-status-snapshots/", category: "CRM", description: "Plafon kredit, limit piutang, dan status AR customer", moduleLink: "/crm" },
  { id: "parties", name: "Katalog Klien & Vendor", endpoint: "/api/v1/master-data/parties/", category: "Master", description: "Database rekanan, principal, vendor, dan pelanggan", moduleLink: "/administration" },
  { id: "products", name: "Master Produk & Jasa", endpoint: "/api/v1/master-data/products/", category: "Master", description: "Daftar layanan jasa dan material operasional", moduleLink: "/administration" },
  { id: "companies", name: "Profil Entitas Bisnis", endpoint: "/api/v1/core/companies/", category: "Core", description: "Legalitas entitas dan unit bisnis terdaftar", moduleLink: "/administration" },
];

export function getResourceEntity(id: string): ResourceEntity | undefined {
  return REPOSITORY_ENTITIES.find((entity) => entity.id === id);
}
