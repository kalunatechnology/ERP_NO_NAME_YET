/**
 * Curated ERP vocabulary layered over the generated route/Prisma catalogue.
 * Physical tables, columns, types, relationships, and enum values remain
 * derived from the live application schema; this file supplies business
 * meaning so the LLM can map user language onto that verified metadata.
 */
type FieldMeaning = { label: string; description: string; terms: string[]; codebook?: string };

const RESOURCE_MEANINGS: Record<string, { description: string; terms?: string[] }> = {
  'crm.opportunities': {
    description: 'Peluang atau deal penjualan yang dikelola melalui pipeline CRM.',
    terms: ['peluang penjualan', 'deal penjualan', 'prospek penjualan'],
  },
  'crm.customer-inquiries': {
    description: 'Inquiry atau permintaan awal dari calon maupun pelanggan.',
    terms: ['inquiry pelanggan', 'permintaan calon pelanggan', 'lead masuk'],
  },
  'crm.opportunity-products': {
    description: 'Produk atau item yang terkait dengan sebuah opportunity CRM.',
    terms: ['produk opportunity', 'produk deal'],
  },
  'crm.pipeline-stages': {
    description: 'Definisi tahap pipeline CRM, termasuk kode dan nama tahap.',
    terms: ['tahap pipeline', 'stage pipeline', 'tahapan penjualan'],
  },
  'crm.activities': {
    description: 'Aktivitas CRM seperti follow up, panggilan, atau pertemuan pelanggan.',
    terms: ['aktivitas crm', 'follow up pelanggan'],
  },
  'sales.quotations': {
    description: 'Dokumen penawaran harga untuk pelanggan.',
    terms: ['penawaran harga', 'quotation penjualan'],
  },
  'sales.orders': {
    description: 'Pesanan penjualan yang dibuat dari proses komersial.',
    terms: ['pesanan pelanggan', 'sales order'],
  },
};

/** Few-shot routing examples are plans for the LLM, not canned user answers. */
export const ROUTING_EXAMPLES = [
  {
    request: 'Tampilkan opportunity CRM yang dapat saya akses.',
    intent: 'Read the visible CRM opportunity records.',
    resource: 'crm.opportunities',
    operation: 'list',
    filters: {},
    rule: 'Use the authenticated API scope; do not infer owner_user_id.',
  },
  {
    request: 'Tampilkan definisi kode tahap pipeline CRM.',
    intent: 'Read CRM pipeline stage codes and their display names.',
    resource: 'crm.pipeline-stages',
    operation: 'list',
    filters: {},
    rule: 'Map stage_code to stage_name using the stage resource; do not invent meanings.',
  },
  {
    request: 'Berapa jumlah opportunity CRM?',
    intent: 'Count CRM opportunity records.',
    resource: 'crm.opportunities',
    operation: 'count',
    filters: {},
    rule: 'Return a count query; do not infer status, owner, or date filters.',
  },
] as const;

export function routingExamplesFor(resources: Array<{ key: string }>) {
  const allowed = new Set(resources.map(resource => resource.key));
  return ROUTING_EXAMPLES.filter(example => allowed.has(example.resource));
}

const FIELD_MEANINGS: Record<string, Record<string, FieldMeaning>> = {
  'crm.opportunities': {
    opportunity_name: { label: 'Nama opportunity', description: 'Nama atau judul peluang penjualan.', terms: ['nama opportunity', 'nama peluang', 'nama deal'] },
    pipeline_stage: { label: 'Tahap pipeline', description: 'Kode tahap pipeline CRM saat ini.', terms: ['tahap', 'stage', 'tahapan pipeline'], codebook: 'Lookup terpisah pada crm.pipeline-stages: stage_code → stage_name; jangan menganggapnya relasi query tanpa relasi schema.' },
    status: { label: 'Status opportunity', description: 'Status proses opportunity.', terms: ['status deal', 'status peluang'] },
    owner_user_id: { label: 'Pemilik opportunity', description: 'ID pengguna yang menjadi pemilik opportunity.', terms: ['pemilik opportunity', 'sales penanggung jawab'] },
    customer_party_id: { label: 'Pelanggan', description: 'ID business party pelanggan pada opportunity.', terms: ['pelanggan opportunity', 'customer opportunity'] },
    expected_amount: { label: 'Nilai perkiraan', description: 'Nilai penjualan yang diperkirakan.', terms: ['nilai peluang', 'estimasi nilai', 'expected amount'] },
    expected_margin: { label: 'Margin perkiraan', description: 'Margin yang diperkirakan untuk opportunity.', terms: ['estimasi margin', 'margin peluang'] },
    probability_percent: { label: 'Probabilitas', description: 'Peluang keberhasilan dalam persen.', terms: ['probabilitas menang', 'peluang menang'] },
    expected_close_date: { label: 'Tanggal penutupan perkiraan', description: 'Tanggal target opportunity diperkirakan ditutup.', terms: ['tanggal closing', 'target penutupan', 'estimasi closing'] },
    opened_at: { label: 'Tanggal dibuka', description: 'Tanggal opportunity mulai dibuka.', terms: ['tanggal dibuat', 'tanggal opportunity dibuka'] },
    closed_at: { label: 'Tanggal ditutup', description: 'Tanggal opportunity ditutup.', terms: ['tanggal ditutup', 'tanggal closing aktual'] },
    lost_reason: { label: 'Alasan kalah', description: 'Alasan opportunity dinyatakan kalah atau hilang.', terms: ['alasan kalah', 'alasan lost'] },
  },
  'crm.pipeline-stages': {
    stage_code: { label: 'Kode tahap', description: 'Kode sistem untuk sebuah tahap pipeline.', terms: ['kode tahap', 'stage code'] },
    stage_name: { label: 'Nama tahap', description: 'Nama yang ditampilkan untuk tahap pipeline.', terms: ['nama tahap', 'stage name'] },
    position_order: { label: 'Urutan tahap', description: 'Posisi tahap di dalam pipeline.', terms: ['urutan tahap', 'posisi stage'] },
    closed_won: { label: 'Tahap menang', description: 'Menandai tahap sebagai deal menang.', terms: ['tahap won', 'deal menang'] },
    closed_lost: { label: 'Tahap kalah', description: 'Menandai tahap sebagai deal kalah.', terms: ['tahap lost', 'deal kalah'] },
  },
  'crm.customer-inquiries': {
    inquiry_number: { label: 'Nomor inquiry', description: 'Nomor referensi inquiry pelanggan.', terms: ['nomor inquiry', 'nomor lead'] },
    subject: { label: 'Subjek inquiry', description: 'Ringkasan topik permintaan pelanggan.', terms: ['subjek inquiry', 'judul inquiry'] },
    customer_name: { label: 'Nama pelanggan', description: 'Nama pelanggan yang tercatat pada inquiry.', terms: ['nama pelanggan', 'nama customer'] },
    owner_user_id: { label: 'Penanggung jawab', description: 'ID pengguna yang menangani inquiry.', terms: ['sales penanggung jawab', 'pemilik inquiry'] },
  },
};

export function resourceMeaning(key: string) {
  const meaning = RESOURCE_MEANINGS[key] ?? {
    description: `Record ERP untuk resource ${key}. Gunakan nama kolom dan tipe dari schema terverifikasi.`,
    terms: [],
  };
  return { description: meaning.description, terms: meaning.terms ?? [] };
}

export function fieldMeaning(resourceKey: string, fieldName: string, enumValues: string[] = []) {
  const curated = FIELD_MEANINGS[resourceKey]?.[fieldName];
  return {
    label: curated?.label ?? fieldName.replace(/_/g, ' '),
    description: curated?.description ?? `Kolom ${fieldName.replace(/_/g, ' ')} pada ${resourceKey}.`,
    terms: curated?.terms ?? [],
    ...(curated?.codebook ? { codebook: curated.codebook } : {}),
    ...(enumValues.length ? { allowedCodes: enumValues } : {}),
  };
}
