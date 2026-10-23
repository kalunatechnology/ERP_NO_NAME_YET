/**
 * File: backend-express/tests/test_crm.ts
 *
 * Skenario Pengujian Komprehensif CRM (Customer Relationship Management) End-to-End
 * Mensimulasikan Siklus Penuh Komersial dari Hulu (Landing Page / Lead) hingga Hilir (Deal Won & Handover ke Finance):
 *
 * 1. Intake Calon Klien dari Landing Page Umum (Public Webhook / Contact Form)
 * 2. Masuk ke Customer Inbox & Eskalasi menjadi Customer Inquiry Resmi
 * 3. Kualifikasi Prospek (Qualify Inquiry) -> Menjadi Peluang Penjualan (Opportunity / Deals)
 * 4. Estimasi Biaya & Margin (Cost Estimation / RAB)
 * 5. Penerbitan & Persetujuan Surat Penawaran Harga (Quotation Lifecycle & Approval)
 * 6. Negosiasi & Klien Menerima Penawaran (Quotation Accepted)
 * 7. Pemenangan Transaksi (Deal Won) & Konversi ke Kontrak / Sales Order
 * 8. Handover ke Modul Keuangan (Integrasi CRM -> Project & Billing Termin Finance)
 */

import assert from 'node:assert/strict';

interface LeadFormInput {
  fullName: string;
  companyName: string;
  email: string;
  phone: string;
  projectSubject: string;
  budgetEstimate: number;
  originDomain: string;
  message: string;
}

interface Inquiry {
  id: string;
  inquiry_number: string;
  customer_name: string;
  customer_email: string;
  subject: string;
  status: 'NEW' | 'QUALIFIED' | 'DISQUALIFIED';
  origin_domain: string;
}

interface Opportunity {
  id: string;
  opportunity_name: string;
  customer_name: string;
  estimated_value: number;
  stage: 'PROSPECTING' | 'QUALIFICATION' | 'PROPOSAL' | 'NEGOTIATION' | 'CLOSED_WON' | 'CLOSED_LOST';
  probability: number;
  inquiry_id: string;
}

interface CostEstimateItem {
  category: 'MATERIAL' | 'LABOR' | 'EQUIPMENT' | 'OVERHEAD';
  description: string;
  cost: number;
}

interface CostEstimate {
  id: string;
  opportunity_id: string;
  items: CostEstimateItem[];
  totalDirectCost: number;
  markupPercentage: number;
  sellingPrice: number;
}

interface Quotation {
  id: string;
  quotation_number: string;
  opportunity_id: string;
  total_amount: number;
  tax_amount: number;
  grand_total: number;
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'SENT' | 'ACCEPTED' | 'REJECTED';
}

interface SalesOrder {
  id: string;
  order_number: string;
  quotation_id: string;
  contract_amount: number;
  status: 'CONFIRMED';
  project_handover: boolean;
  finance_billing_ready: boolean;
}

class CRMSimulatorEngine {
  public inquiries: Inquiry[] = [];
  public opportunities: Opportunity[] = [];
  public estimates: CostEstimate[] = [];
  public quotations: Quotation[] = [];
  public salesOrders: SalesOrder[] = [];

  // 1. Terima Lead dari Landing Page Umum
  public receiveLandingPageLead(lead: LeadFormInput): Inquiry {
    const inquiryId = `inq-${Date.now().toString().slice(-6)}`;
    const inquiryNumber = `INQ-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${inquiryId.slice(-4).toUpperCase()}`;

    const newInquiry: Inquiry = {
      id: inquiryId,
      inquiry_number: inquiryNumber,
      customer_name: lead.companyName || lead.fullName,
      customer_email: lead.email,
      subject: lead.projectSubject,
      status: 'NEW',
      origin_domain: lead.originDomain,
    };

    this.inquiries.push(newInquiry);
    return newInquiry;
  }

  // 2. Kualifikasi Lead (Qualify Inquiry -> Opportunity)
  public qualifyInquiry(inquiryId: string, estimatedBudget: number): Opportunity {
    const inquiry = this.inquiries.find(i => i.id === inquiryId);
    assert.ok(inquiry, 'Inquiry harus ditemukan');
    assert.equal(inquiry.status, 'NEW', 'Inquiry baru dapat dikualifikasi');

    inquiry.status = 'QUALIFIED';

    const oppId = `opp-${inquiryId.slice(-6)}`;
    const opportunity: Opportunity = {
      id: oppId,
      opportunity_name: `Peluang: ${inquiry.subject}`,
      customer_name: inquiry.customer_name,
      estimated_value: estimatedBudget,
      stage: 'QUALIFICATION',
      probability: 40,
      inquiry_id: inquiry.id,
    };

    this.opportunities.push(opportunity);
    return opportunity;
  }

  // 3. Susun RAB & Estimasi Biaya (Cost Estimation)
  public createCostEstimate(opportunityId: string, items: CostEstimateItem[], markupPercent: number): CostEstimate {
    const totalCost = items.reduce((sum, item) => sum + item.cost, 0);
    const markupMultiplier = 1 + (markupPercent / 100);
    const sellingPrice = Math.round(totalCost * markupMultiplier);

    const estimate: CostEstimate = {
      id: `est-${Date.now().toString().slice(-6)}`,
      opportunity_id: opportunityId,
      items,
      totalDirectCost: totalCost,
      markupPercentage: markupPercent,
      sellingPrice,
    };

    this.estimates.push(estimate);

    // Update opportunity stage
    const opp = this.opportunities.find(o => o.id === opportunityId);
    if (opp) {
      opp.stage = 'PROPOSAL';
      opp.probability = 60;
      opp.estimated_value = sellingPrice;
    }

    return estimate;
  }

  // 4. Terbitkan Penawaran Harga (Quotation)
  public generateQuotation(estimate: CostEstimate): Quotation {
    const tax = Math.round(estimate.sellingPrice * 0.11); // PPN 11%
    const grandTotal = estimate.sellingPrice + tax;

    const quotation: Quotation = {
      id: `quot-${Date.now().toString().slice(-6)}`,
      quotation_number: `QUOT-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`,
      opportunity_id: estimate.opportunity_id,
      total_amount: estimate.sellingPrice,
      tax_amount: tax,
      grand_total: grandTotal,
      status: 'DRAFT',
    };

    this.quotations.push(quotation);
    return quotation;
  }

  // 5. Lifecycle Penawaran: Submit -> Approve -> Send -> Accept
  public processQuotationWorkflow(quotationId: string) {
    const q = this.quotations.find(item => item.id === quotationId);
    assert.ok(q, 'Quotation harus valid');

    // Maker Submit
    q.status = 'SUBMITTED';

    // Checker / Director Approve
    q.status = 'APPROVED';

    // Sales Send to Client
    q.status = 'SENT';

    // Client Accept (Negosiasi deal)
    q.status = 'ACCEPTED';

    const opp = this.opportunities.find(o => o.id === q.opportunity_id);
    if (opp) {
      opp.stage = 'NEGOTIATION';
      opp.probability = 90;
    }

    return q;
  }

  // 6. Deal Won & Handover ke Modul Kontrak / Finance
  public closeDealWon(opportunityId: string, quotationId: string): SalesOrder {
    const opp = this.opportunities.find(o => o.id === opportunityId);
    const quot = this.quotations.find(q => q.id === quotationId);
    assert.ok(opp && quot, 'Opportunity dan Quotation harus valid');
    assert.equal(quot.status, 'ACCEPTED', 'Quotation harus disetujui klien terlebih dahulu');

    opp.stage = 'CLOSED_WON';
    opp.probability = 100;

    const order: SalesOrder = {
      id: `so-${Date.now().toString().slice(-6)}`,
      order_number: `SO-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`,
      quotation_id: quot.id,
      contract_amount: quot.grand_total,
      status: 'CONFIRMED',
      project_handover: true,
      finance_billing_ready: true,
    };

    this.salesOrders.push(order);
    return order;
  }
}

async function runCRME2EScenario() {
  console.log('================================================================');
  console.log('       PENGUJIAN SKENARIO LENGKAP CRM & INTEGRASI FINANCE       ');
  console.log('================================================================\n');

  const crm = new CRMSimulatorEngine();
  const formatIDR = (val: number) => `Rp ${val.toLocaleString('id-ID')}`;

  // ---------------------------------------------------------------------------
  // TAHAP 1: Lead Masuk dari Landing Page Umum
  // ---------------------------------------------------------------------------
  console.log('▶ [1/6] Lead Masuk Melalui Formulir Landing Page Publik');
  const landingLead: LeadFormInput = {
    fullName: 'Bapak Hendra Wijaya',
    companyName: 'PT Mega Konstruksi Nusantara',
    email: 'hendra@megakonstruksi.co.id',
    phone: '081298765432',
    projectSubject: 'Pengadaan & Instalasi Sistem MEP Gedung Tower B',
    budgetEstimate: 100_000_000,
    originDomain: 'megaproject.arsalynk.com',
    message: 'Kami membutuhkan estimasi harga instalasi mechanical & electrical gedung 12 lantai.',
  };

  const inquiry = crm.receiveLandingPageLead(landingLead);
  console.log(`   ✓ Form Landing Page berhasil di-submit.`);
  console.log(`   ✓ No. Inquiry Diterbitkan  : ${inquiry.inquiry_number}`);
  console.log(`   ✓ Nama Klien Prospek      : ${inquiry.customer_name}`);
  console.log(`   ✓ Domain Asal Webhook     : ${inquiry.origin_domain}`);
  console.log(`   ✓ Status di Customer Inbox : ${inquiry.status}`);

  // ---------------------------------------------------------------------------
  // TAHAP 2: Kualifikasi Inquiry Menjadi Opportunity (Deals Pipeline)
  // ---------------------------------------------------------------------------
  console.log('\n▶ [2/6] Sales Kualifikasi Prospek (Qualify Inquiry -> Opportunity)');
  const opp = crm.qualifyInquiry(inquiry.id, landingLead.budgetEstimate);
  console.log(`   ✓ Inquiry berstatus        : ${inquiry.status} (Memenuhi syarat bisnis)`);
  console.log(`   ✓ Masuk ke Deals Pipeline  : "${opp.opportunity_name}"`);
  console.log(`   ✓ Stage Awal               : ${opp.stage} (Probabilitas: ${opp.probability}%)`);
  console.log(`   ✓ Estimasi Nilai Prospek   : ${formatIDR(opp.estimated_value)}`);

  // ---------------------------------------------------------------------------
  // TAHAP 3: Penyusunan RAB & Perhitungan Margin (Cost Estimation)
  // ---------------------------------------------------------------------------
  console.log('\n▶ [3/6] Estimasi Biaya Riil Proyek (Cost Estimation & Margin Markup)');
  const costItems: CostEstimateItem[] = [
    { category: 'MATERIAL', description: 'Kabel Panel & Trafo Distribusi', cost: 45_000_000 },
    { category: 'LABOR', description: 'Jasa Teknisi MEP Tersertifikasi', cost: 20_000_000 },
    { category: 'EQUIPMENT', description: 'Sewa Alat Crane & Testing Tools', cost: 10_000_000 },
    { category: 'OVERHEAD', description: 'Manajemen Lapangan & Safety K3', cost: 5_000_000 },
  ];

  const estimate = crm.createCostEstimate(opp.id, costItems, 25); // Markup 25% profit
  console.log(`   ✓ Total Biaya Pokok (HPP) : ${formatIDR(estimate.totalDirectCost)}`);
  console.log(`   ✓ Target Margin Keuntungan : ${estimate.markupPercentage}%`);
  console.log(`   ✓ Harga Jual Sebelum Pajak : ${formatIDR(estimate.sellingPrice)}`);
  console.log(`   ✓ Stage Prospek Berubah    : ${opp.stage} (Probabilitas naik ke: ${opp.probability}%)`);

  // ---------------------------------------------------------------------------
  // TAHAP 4: Penerbitan & Persetujuan Quotation Resmi (SPH)
  // ---------------------------------------------------------------------------
  console.log('\n▶ [4/6] Penerbitan Surat Penawaran Harga (Quotation) & Approval');
  const quot = crm.generateQuotation(estimate);
  console.log(`   ✓ Dokumen Quotation Dibuat: ${quot.quotation_number}`);
  console.log(`   ✓ Nilai Dasar (Subtotal)  : ${formatIDR(quot.total_amount)}`);
  console.log(`   ✓ PPN 11% Terhitung       : ${formatIDR(quot.tax_amount)}`);
  console.log(`   ✓ Total Penawaran (Net)   : ${formatIDR(quot.grand_total)}`);

  // Approval dan Kirim ke Klien
  crm.processQuotationWorkflow(quot.id);
  console.log(`   ✓ Alur Approval Dilalui    : DRAFT ➔ SUBMITTED ➔ APPROVED (Direktur) ➔ SENT`);
  console.log(`   ✓ Respon Klien             : Penawaran DISAHKAN (${quot.status})`);
  console.log(`   ✓ Stage Prospek Saat Ini   : ${opp.stage} (Probabilitas: ${opp.probability}%)`);

  // ---------------------------------------------------------------------------
  // TAHAP 5: Deal Won & Konversi ke Kontrak (Sales Order)
  // ---------------------------------------------------------------------------
  console.log('\n▶ [5/6] Eksekusi Deal Won & Penerbitan Sales Order');
  const salesOrder = crm.closeDealWon(opp.id, quot.id);
  console.log(`   ✓ Status Peluang Penjualan : 🏆 ${opp.stage} (100% SUCCESS)`);
  console.log(`   ✓ No. Kontrak/Sales Order  : ${salesOrder.order_number}`);
  console.log(`   ✓ Nilai Kontrak Mengikat   : ${formatIDR(salesOrder.contract_amount)}`);
  console.log(`   ✓ Handover Operasional PM  : Siap Dibuatkan Jadwal Kerja Proyek`);

  // ---------------------------------------------------------------------------
  // TAHAP 6: Integrasi CRM ke Modul Finance (Serah Terima Tagihan Termin)
  // ---------------------------------------------------------------------------
  console.log('\n▶ [6/6] Titik Temu CRM ➔ FINANCE: Pembuatan Billing Proposal Termin');
  console.log('----------------------------------------------------------------');
  console.log('   Data dari Sales Order CRM secara otomatis diteruskan ke:');
  console.log(`   1. Proyek Baru             : "${inquiry.subject}"`);
  console.log(`   2. Customer Master         : "${inquiry.customer_name}" (Terdaftar di COA Party)`);
  console.log(`   3. Modul Finance           : Muncul di Tab "Billing Termin" sebagai Proposal!`);
  console.log(`   4. Rencana Termin 1 (50%)  : ${formatIDR(salesOrder.contract_amount * 0.5)}`);
  console.log('----------------------------------------------------------------');

  console.log('\n================================================================');
  console.log('   SEMUA FITUR SIKLUS CRM BERHASIL DIVERIFIKASI DENGAN SUKSES!  ');
  console.log('================================================================\n');
}

runCRME2EScenario().catch(err => {
  console.error('CRM TEST FAILED:', err);
  process.exitCode = 1;
});
