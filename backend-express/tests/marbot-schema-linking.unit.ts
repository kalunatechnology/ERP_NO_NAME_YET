import assert from 'node:assert/strict';
import { RoleCode } from '@prisma/client';
import catalog from '../src/modules/marbot/knowledge/resource-catalog.generated.json';
import type { NativeScope } from '../src/modules/marbot/brain/reasoning/native.service';
import { resourceCatalog, validateResourcePlan } from '../src/modules/marbot/knowledge/resource.service';
import { resolveResourceIntent } from '../src/modules/marbot/knowledge/resource-semantics';
import { searchMarbotSchema } from '../src/modules/marbot/knowledge/schema.service';
import prisma from '../src/config/database';

const scope: NativeScope = { tenantId: 'tenant-a', companyId: 'company-a', userId: 'user-a', roleId: 'role-a', roleCode: RoleCode.DIRECTOR,
  enabledModules: [...new Set(catalog.resources.map(resource => resource.module))],
  permissions: ['USE_MARBOT', 'READ_PROJECT', 'READ_TASK', 'READ_COMPANY_FINANCE', 'READ_CRM_DEALS'],
  projectScope: { mode: 'ALL', projectIds: [] } };

const golden: Array<[string, string]> = [
  ['customer inquiry', 'crm.customer-inquiries'],
  ['permintaan pelanggan masuk', 'crm.customer-inquiries'],
  ['inquiry requirements', 'crm.inquiry-requirements'],
  ['estimasi hpp', 'crm.cost-estimates'],
  ['opportunity', 'crm.opportunities'],
  ['deal', 'crm.opportunities'],
  ['crm activities', 'crm.activities'],
  ['customer inbox', 'crm.conversations'],
  ['customer feedback', 'crm.customer-feedbacks'],
  ['customer review', 'crm.customer-feedbacks'],
  ['feedback crm', 'crm.feedbacks'],
  ['survey responses', 'crm.survey-responses'],
  ['quotation', 'sales.quotations'],
  ['rincian penawaran', 'sales.quotation-lines'],
  ['hpp quotation', 'sales.quotation-costs'],
  ['sales order', 'sales.orders'],
  ['baris sales order', 'sales.order-lines'],
  ['sales contract', 'sales.contracts'],
  ['sales delivery', 'sales.deliveries'],
  ['support ticket', 'service.cases'],
  ['pesan tiket', 'service.case-messages'],
  ['penyelesaian tiket', 'service.resolutions'],
  ['data pelanggan', 'master_data.parties'],
  ['profil pelanggan', 'master_data.customer-profiles'],
  ['kontak pelanggan', 'master_data.contacts'],
  ['karyawan', 'master_data.employees'],
  ['invoice', 'finance.billing-documents'],
  ['pembayaran', 'finance.payments'],
  ['penerimaan pelanggan', 'finance.customer-receipts'],
  ['jurnal umum', 'finance.journals'],
  ['entri jurnal', 'finance.journal-entries'],
  ['permintaan pembelian', 'procurement.purchase-requisitions'],
  ['pesanan pembelian', 'procurement.purchase-orders'],
  ['penawaran vendor', 'procurement.supplier-quotations'],
  ['RFQ', 'procurement.rfqs'],
  ['penerimaan barang', 'procurement.goods-receipts'],
  ['saldo stok', 'inventory.stock-balances'],
  ['mutasi stok', 'inventory.stock-moves'],
  ['kartu stok', 'inventory.stock-ledgers'],
  ['perintah produksi', 'manufacturing.production-orders'],
  ['perintah kerja produksi', 'manufacturing.work-orders'],
  ['bill of materials', 'manufacturing.boms'],
  ['inspeksi kualitas', 'quality.inspections'],
  ['ketidaksesuaian mutu', 'quality.nonconformances'],
  ['tindakan korektif', 'quality.corrective-actions'],
  ['aset tetap', 'assets.assets'],
  ['penyusutan aset', 'assets.depreciation-lines'],
  ['akun keuangan', 'finance.accounts'],
  ['periode fiskal', 'finance.fiscal-periods'],
  ['pembayaran vendor', 'finance.vendor-payments'],
  ['mutasi rekening', 'finance.bank-statements'],
  ['risiko proyek', 'projects.risks'],
  ['masalah proyek', 'projects.issues'],
  ['milestone proyek', 'projects.milestones'],
  ['pengeluaran proyek', 'projects.expenses'],
  ['project expenses', 'projects.expenses'],
  ['target KPI', 'analytics.kpi-targets'],
  ['pelacakan pengiriman', 'logistics.tracking-events'],
  ['produk master', 'master_data.products'],
  ['gudang', 'master_data.warehouses'],
  ['mata uang', 'master_data.currencies'],
  ['departemen', 'master_data.departments'],
  ['daftar proyek', 'projects.projects'],
  ['tugas utama', 'projects.main-tasks'],
  ['target mingguan', 'projects.weekly-tasks'],
  ['tugas harian', 'projects.daily-tasks'],
  ['timesheet', 'projects.timesheets'],
  ['rilis implementasi', 'implementation.releases'],
  ['siklus pengujian', 'implementation.test-cycles'],
  ['pekerjaan implementasi', 'implementation.work-items'],
  ['quatation', 'sales.quotations'],
];

async function main() {
  const resources = resourceCatalog(scope);
  let recallAtThree = 0;
  const misses: string[] = [];
  for (const [question, expected] of golden) {
    const resolved = resolveResourceIntent(question, resources);
    assert.equal(resolved.status, 'matched', `${question}: resolver should be unambiguous`);
    assert.equal(resolved.candidates[0]?.key, expected, `${question}: wrong primary resource`);
    const shortlist = searchMarbotSchema(scope, question, 3);
    if (shortlist.candidates.some(candidate => candidate.key === expected)) recallAtThree++;
    else misses.push(`${question} → expected ${expected}; got ${shortlist.candidates.map(candidate => candidate.key).join(', ')}`);
  }
  assert.equal(recallAtThree, golden.length, `schema search Recall@3 ${recallAtThree}/${golden.length}: ${misses.join('; ')}`);

  const ambiguous = resolveResourceIntent('order', resources);
  assert.equal(ambiguous.status, 'ambiguous', 'generic order must not silently choose sales or procurement');
  const topThree = searchMarbotSchema(scope, 'invoice warehouse region', 3);
  assert(topThree.candidates.length <= 3, 'schema discovery is bounded to three candidates');
  assert(topThree.candidates.every(candidate => candidate.fields.length <= 8));

  const crmOnly = { ...scope, enabledModules: ['CRM'], permissions: ['USE_MARBOT', 'READ_CRM_DEALS'] };
  const deniedSearch = searchMarbotSchema(crmOnly, 'invoice', 3);
  assert(!deniedSearch.candidates.some(candidate => candidate.module === 'FINANCE'), 'schema search must honor module scope');

  const quotations = resources.find(resource => resource.key === 'sales.quotations')!;
  const parties = resources.find(resource => resource.key === 'master_data.parties')!;
  const path = (await import('../src/modules/marbot/knowledge/resource-semantics')).shortestResourcePaths(
    quotations.key, parties.key, resources, 3, 1,
  )[0];
  if (path) {
    const partyName = parties.fields.find(field => /name/i.test(field.name) && field.type === 'String');
    if (partyName) {
      const valid = validateResourcePlan({ resource: quotations.key, operation: 'list', relatedFilter: {
        path: path.resources, field: partyName.name, value: 'Acme',
      } }, scope);
      assert.equal(valid.relatedFilter?.path.at(-1), parties.key);
      assert.throws(() => validateResourcePlan({ resource: quotations.key, operation: 'list', relatedFilter: {
        path: [quotations.key, 'accounts.users'], field: 'email', value: 'a@b.test',
      } }, scope));
    }
  }

  assert.equal(golden.length, 71, 'golden dataset should cover at least 50 utterances');
  console.log(`Schema-linking dry-run passed: Recall@3 ${recallAtThree}/${golden.length}, ambiguity abstention, three-result cap, scope filtering, and validated graph paths.`);
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
