/** Curated business language mapped to canonical ERP resources. Keep this
 * registry small and explicit; the Prisma schema remains the authority for
 * fields and relations, while these aliases only help identify user intent.
 */
export const MODULE_TERMS: Record<string, string[]> = {
  CRM: ['crm', 'commercial', 'komersial', 'customer relationship'],
  SALES: ['sales', 'penjualan', 'komersial sales'],
  SERVICE: ['service', 'support', 'layanan', 'dukungan', 'garansi'],
  PROJECTS: ['project', 'projects', 'proyek', 'wbs', 'eksekusi proyek'],
  FINANCE: ['finance', 'financial', 'keuangan', 'accounting', 'akuntansi', 'pembukuan'],
  PROCUREMENT: ['procurement', 'pengadaan', 'purchasing', 'pembelian'],
  INVENTORY: ['inventory', 'inventori', 'persediaan', 'stok', 'gudang'],
  MANUFACTURING: ['manufacturing', 'manufaktur', 'produksi', 'production'],
  QUALITY: ['quality', 'kualitas', 'inspeksi mutu'],
  ASSETS: ['asset', 'assets', 'aset', 'aktiva'],
  LOGISTICS: ['logistics', 'logistik', 'pengiriman'],
  MASTER_DATA: ['master data', 'data master', 'referensi'],
  ANALYTICS: ['analytics', 'analitik', 'repository', 'arsip digital'],
  REPORTING: ['reporting', 'laporan', 'dashboard'],
  IMPLEMENTATION: ['implementation', 'implementasi', 'deployment'],
};

const RESOURCE_TERMS: Record<string, string[]> = {
  'crm.customer-inquiries': ['customer inquiry', 'customer inquiries', 'inquiry', 'inquiries', 'permintaan pelanggan', 'permintaan masuk', 'lead masuk', 'prospek masuk'],
  'crm.inquiry-requirements': ['inquiry requirement', 'inquiry requirements', 'kebutuhan inquiry', 'kebutuhan pelanggan'],
  'crm.cost-estimates': ['cost estimate', 'estimasi biaya', 'estimasi hpp', 'hpp'],
  'crm.opportunities': ['opportunity', 'opportunities', 'peluang penjualan', 'deal', 'deals', 'kesempatan penjualan'],
  'crm.opportunity-products': ['opportunity product', 'produk opportunity', 'produk deal'],
  'crm.activities': ['crm activity', 'crm activities', 'aktivitas crm', 'follow up', 'aktivitas pelanggan'],
  'crm.opportunity-stage-histories': ['opportunity history', 'riwayat opportunity', 'riwayat deal', 'perubahan tahap deal'],
  'crm.executive-approvals': ['crm executive approval', 'persetujuan direktur crm', 'approval direktur crm'],
  'crm.conversations': ['customer conversation', 'conversations', 'percakapan pelanggan', 'customer inbox', 'inbox pelanggan'],
  'crm.messages': ['crm message', 'crm messages', 'pesan percakapan crm'],
  'crm.feedbacks': ['crm feedback', 'feedback crm', 'evaluasi layanan crm'],
  'crm.customer-feedbacks': ['customer feedback', 'customer review', 'ulasan pelanggan', 'feedback pelanggan', 'tinjauan pelanggan'],
  'crm.survey-responses': ['survey response', 'survey responses', 'jawaban survei', 'hasil survei'],
  'sales.quotations': ['quotation', 'quotations', 'quatiation', 'quatation', 'quitation', 'quote', 'quotes', 'sales quotation', 'sales quotations', 'penawaran', 'surat penawaran'],
  'sales.quotation-lines': ['quotation line', 'quotation lines', 'baris quotation', 'rincian penawaran'],
  'sales.quotation-costs': ['quotation cost', 'biaya quotation', 'hpp quotation'],
  'sales.orders': ['sales order', 'sales orders', 'pesanan penjualan', 'order penjualan'],
  'sales.order-lines': ['sales order line', 'sales order lines', 'baris sales order', 'rincian order'],
  'sales.contracts': ['sales contract', 'sales contracts', 'kontrak penjualan', 'kontrak pelanggan'],
  'sales.deliveries': ['sales delivery', 'sales deliveries', 'pengiriman sales', 'pengiriman pesanan'],
  'service.cases': ['service case', 'support case', 'ticket', 'tickets', 'tiket', 'keluhan pelanggan', 'kasus garansi', 'garansi'],
  'service.case-messages': ['case message', 'pesan tiket', 'pesan keluhan'],
  'service.resolutions': ['case resolution', 'penyelesaian tiket', 'solusi keluhan'],
  'master_data.parties': ['business party', 'party', 'parties', 'customer', 'customers', 'pelanggan', 'client', 'klien', 'vendor', 'supplier', 'mitra bisnis', 'pelanggan atau vendor', 'data pelanggan dan vendor', 'master customer', 'customer master'],
  'master_data.customer-profiles': ['customer profile', 'profil pelanggan', 'data profil pelanggan'],
  'master_data.contacts': ['contact', 'contacts', 'kontak', 'kontak pelanggan', 'narahubung'],
  'master_data.employees': ['employee', 'employees', 'karyawan', 'pegawai'],
  'finance.billing-documents': ['billing document', 'billing documents', 'invoice', 'invoices', 'faktur', 'tagihan'],
  'finance.payments': ['payment', 'payments', 'pembayaran'],
  'finance.customer-receipts': ['customer receipt', 'penerimaan pelanggan', 'penerimaan piutang'],
  'finance.journals': ['journal', 'journals', 'jurnal umum'],
  'finance.journal-entries': ['journal entry', 'journal entries', 'entri jurnal', 'transaksi jurnal'],
  'procurement.purchase-requisitions': ['purchase requisition', 'purchase requisitions', 'permintaan pembelian', 'requisition'],
  'procurement.purchase-orders': ['purchase order', 'purchase orders', 'pesanan pembelian', 'po pembelian', 'po'],
  'procurement.supplier-quotations': ['supplier quotation', 'supplier quotations', 'penawaran supplier', 'penawaran vendor'],
  'procurement.rfqs': ['request for quotation', 'rfq', 'permintaan penawaran vendor'],
  'procurement.goods-receipts': ['goods receipt', 'goods receipts', 'penerimaan barang'],
  'inventory.stock-balances': ['stock balance', 'stock balances', 'saldo stok', 'jumlah stok', 'stok tersedia'],
  'inventory.stock-moves': ['stock move', 'stock moves', 'pergerakan stok', 'mutasi stok'],
  'inventory.stock-ledgers': ['stock ledger', 'stock ledgers', 'buku stok', 'kartu stok'],
  'manufacturing.production-orders': ['production order', 'production orders', 'perintah produksi'],
  'manufacturing.work-orders': ['work order', 'work orders', 'perintah kerja produksi'],
  'manufacturing.boms': ['bill of materials', 'bom', 'daftar material produksi'],
  'quality.inspections': ['quality inspection', 'quality inspections', 'inspeksi', 'pemeriksaan kualitas'],
  'quality.nonconformances': ['nonconformance', 'nonconformances', 'ncr', 'ketidaksesuaian mutu'],
  'quality.corrective-actions': ['corrective action', 'corrective actions', 'capa', 'tindakan korektif'],
  'assets.assets': ['fixed asset', 'fixed assets', 'asset register', 'daftar aset', 'aset tetap'],
  'assets.depreciation-lines': ['depreciation', 'depreciation lines', 'penyusutan aset'],
  'finance.accounts': ['chart of accounts', 'akun buku besar', 'akun keuangan'],
  'finance.fiscal-periods': ['fiscal period', 'fiscal periods', 'periode fiskal', 'periode akuntansi'],
  'finance.vendor-payments': ['vendor payment', 'vendor payments', 'pembayaran vendor'],
  'finance.bank-statements': ['bank statement', 'bank statements', 'mutasi rekening'],
  'projects.risks': ['project risk', 'project risks', 'risiko proyek'],
  'projects.issues': ['project issue', 'project issues', 'kendala proyek', 'masalah proyek'],
  'projects.milestones': ['project milestone', 'project milestones', 'milestone proyek', 'tonggak proyek'],
  'projects.expenses': ['project expense', 'project expenses', 'pengeluaran proyek', 'biaya proyek'],
  'analytics.kpis': ['kpi', 'indikator kinerja'],
  'analytics.kpi-results': ['kpi result', 'kpi results', 'hasil kpi', 'realisasi kpi'],
  'analytics.kpi-targets': ['kpi target', 'kpi targets', 'target kpi'],
  'logistics.shipments': ['shipment', 'shipments', 'pengiriman barang'],
  'logistics.tracking-events': ['tracking event', 'tracking events', 'pelacakan pengiriman', 'status tracking'],
  'master_data.products': ['product master', 'produk', 'barang master'],
  'master_data.warehouses': ['warehouse', 'warehouses', 'gudang'],
  'master_data.currencies': ['currency', 'currencies', 'mata uang'],
  'master_data.departments': ['department', 'departments', 'departemen', 'divisi'],
  'projects.projects': ['project record', 'project list', 'daftar proyek', 'data proyek', 'proyek'],
  'projects.main-tasks': ['main task', 'main tasks', 'tugas utama'],
  'projects.weekly-tasks': ['weekly task', 'weekly tasks', 'weekly target', 'weekly targets', 'tugas mingguan', 'target mingguan'],
  'projects.daily-tasks': ['daily task', 'daily tasks', 'tugas harian', 'target harian'],
  'projects.timesheets': ['timesheet', 'timesheets', 'lembar waktu', 'jam kerja'],
  'implementation.releases': ['software release', 'releases', 'rilis implementasi'],
  'implementation.test-cycles': ['test cycle', 'test cycles', 'siklus pengujian'],
  'implementation.work-items': ['work item', 'work items', 'implementation work item', 'pekerjaan implementasi', 'item pekerjaan implementasi'],
};

function normalize(text: string): string {
  return text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/\b(?:quatiation|quatation|quitation)\b/g, 'quotation')
    .replace(/[._/-]+/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

function containsPhrase(text: string, phrase: string): boolean {
  const haystack = ` ${normalize(text)} `;
  return haystack.includes(` ${normalize(phrase)} `);
}

function inferredResourceTerms(resource: { key: string; model: string }): string[] {
  const modulelessKey = resource.key.split('.').slice(1).join(' ');
  const modelName = resource.model.replace(/^(crm|sales|service|fin|project|procurement|inventory|manufacturing|quality|asset|logistics|analytics|implementation|master)_/i, '');
  return [modulelessKey, modelName].map(normalize).flatMap(value => {
    const terms = [value, ...value.split(' ').filter(token => token.length > 3)];
    return terms.flatMap(term => term.endsWith('ies') ? [term, `${term.slice(0, -3)}y`]
      : term.endsWith('s') && term.length > 4 ? [term, term.slice(0, -1)] : [term]);
  });
}

export function resourceIntentTerms(key: string): string[] {
  return RESOURCE_TERMS[key] ?? [];
}

export type ResourceCandidate = { key: string; module: string; model: string; score: number; matchedTerms: string[] };
export type ResourceGraphEdge = { resource: string; relation: string; sourceField: string; targetField: string; direction: 'forward' | 'reverse'; cardinality: 'one' | 'many' };

export function shortestResourcePaths<T extends { key: string; relationships: ResourceGraphEdge[] }>(
  from: string, to: string, resources: T[], maxHops = 3, maxPaths = 3,
) {
  if (from === to) return [{ resources: [from], edges: [] as ResourceGraphEdge[] }];
  const byKey = new Map(resources.map(resource => [resource.key, resource]));
  let frontier = [{ key: from, resources: [from], edges: [] as ResourceGraphEdge[] }];
  for (let depth = 0; depth < maxHops; depth++) {
    const next: typeof frontier = [];
    const found: typeof frontier = [];
    for (const current of frontier) {
      for (const edge of byKey.get(current.key)?.relationships ?? []) {
        if (current.resources.includes(edge.resource) || !byKey.has(edge.resource)) continue;
        const state = { key: edge.resource, resources: [...current.resources, edge.resource], edges: [...current.edges, edge] };
        if (edge.resource === to) found.push(state);
        else next.push(state);
      }
    }
    if (found.length) return found.slice(0, maxPaths).map(({ resources: path, edges }) => ({ resources: path, edges }));
    frontier = next;
  }
  return [];
}

export function rankResourceCandidates<T extends { key: string; module: string; model: string }>(question: string, resources: T[]): ResourceCandidate[] {
  const ranked = resources.map(resource => {
    const matches: string[] = [];
    let score = 0;
    const normalizedKey = normalize(resource.key);
    if (containsPhrase(question, resource.key) || containsPhrase(question, normalizedKey)) {
      score += 100;
      matches.push(resource.key);
    }
    for (const term of RESOURCE_TERMS[resource.key] ?? []) {
      if (containsPhrase(question, term)) {
        const termScore = 4 + Math.min(normalize(term).split(' ').length, 4) * 0.75;
        if (termScore > score) score = termScore;
        matches.push(term);
      }
    }
    for (const term of inferredResourceTerms(resource)) {
      if (term.length >= 4 && containsPhrase(question, term)) {
        score = Math.max(score, 3.5);
        matches.push(term);
      }
    }
    for (const term of MODULE_TERMS[resource.module] ?? []) {
      if (containsPhrase(question, term)) {
        score += 1.25;
        matches.push(term);
      }
    }
    return { key: resource.key, module: resource.module, model: resource.model, score, matchedTerms: matches };
  }).filter(candidate => candidate.score > 0);
  return ranked.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
}

/** Strong matches narrow the model's resource choices. Ties are intentionally
 * preserved so callers can ask the user instead of querying the wrong entity.
 */
export function resolveResourceIntent<T extends { key: string; module: string; model: string }>(question: string, resources: T[]) {
  const ranked = rankResourceCandidates(question, resources);
  const top = ranked[0];
  if (!top || top.score < 3.4) return { status: 'unresolved' as const, ranked: ranked.slice(0, 8) };
  let tied = ranked.filter(item => top.score - item.score < 0.5);
  const dataClause = question.split(/\b(?:dan|serta|lalu|kemudian)\b/i)
    .find(part => /^\s*(?:(?:tolong|mohon)\s+)?(?:tampilkan|daftar|list|show|lihat|cari|berapa|jumlah|total|sebutkan)\b/i.test(part));
  const listRequest = Boolean(dataClause) || /^\s*(?:(?:tolong|mohon)\s+)?(?:tampilkan|daftar|list|show|lihat|cari|berapa|jumlah|total|sebutkan)\b/i.test(question);
  if (tied.length > 1 && listRequest) {
    const normalizedQuestion = ` ${normalize(dataClause ?? question)} `;
    const entityPosition = (candidate: ResourceCandidate) => candidate.matchedTerms
      .filter(term => !(MODULE_TERMS[candidate.module] ?? []).includes(term))
      .map(term => normalizedQuestion.indexOf(` ${normalize(term)} `))
      .filter(index => index >= 0)
      .reduce((earliest, index) => Math.min(earliest, index), Number.POSITIVE_INFINITY);
    const ordered = tied.map(item => ({ item, position: entityPosition(item) })).sort((a, b) => a.position - b.position);
    if (Number.isFinite(ordered[0]?.position) && ordered[0].position < ordered[1].position) tied = [ordered[0].item];
  }
  return { status: tied.length === 1 ? 'matched' as const : 'ambiguous' as const, ranked: ranked.slice(0, 8), candidates: tied };
}
