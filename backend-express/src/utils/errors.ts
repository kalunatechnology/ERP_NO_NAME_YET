/**
 * Purpose: Defines shared utility contracts and their integration boundary for the backend application.
 * Responsibility: Documents and exposes only the behavior implemented in this file; function comments identify inputs, outputs, dependencies, and side effects.
 * Standard application error classes.
 * Used for centralized error handling in error.middleware.ts
 */

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly errors?: unknown;

  constructor(message: string, statusCode = 400, code = 'BAD_REQUEST', errors?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.errors = errors;
    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/** Converts common API field names and workflow codes into words users recognize. */
export function userFacingMessage(message: string): string {
  const sodAction = message.match(/aksi\s+["“]([^"”]+)["”]/i)?.[1]?.toLowerCase();
  if (/SoD Violation|maker\s*(?:dan|&|-)\s*checker|pengguna yang membuat dokumen/i.test(message)) {
    const actions: Record<string, string> = {
      approve: 'disetujui', verify: 'diverifikasi', reject: 'ditolak', post: 'dibukukan', execute: 'diproses',
    };
    const actionText = sodAction ? actions[sodAction] : undefined;
    return actionText
      ? `Dokumen ini tidak dapat ${actionText} oleh pembuatnya. Silakan minta pengguna lain yang berwenang untuk melanjutkan.`
      : 'Pembuat dokumen tidak dapat melanjutkan tindakan pada dokumen yang sama. Silakan minta pengguna lain yang berwenang.';
  }

  const replacements: Array<[RegExp, string]> = [
    [/from_bank_account_id/gi, 'rekening asal'],
    [/to_bank_account_id/gi, 'rekening tujuan'],
    [/matched_amount/gi, 'nominal yang dicocokkan'],
    [/match_type/gi, 'jenis pencocokan'],
    [/statement_date/gi, 'tanggal mutasi'],
    [/payment_reference/gi, 'nomor referensi pembayaran'],
    [/reference_number/gi, 'nomor referensi'],
    [/bank_account_id/gi, 'rekening bank'],
    [/payment_id/gi, 'pembayaran'],
    [/journal_line_id/gi, 'baris jurnal'],
    [/disburse_account_id/gi, 'rekening pencairan'],
    [/disburse_reference/gi, 'nomor bukti pencairan'],
    [/realization_amount/gi, 'nominal belanja riil'],
    [/disposal_date/gi, 'tanggal pelepasan aset'],
    [/proceeds_amount/gi, 'hasil penjualan aset'],
    [/period_date/gi, 'tanggal periode'],
    [/csv_content/gi, 'isi file CSV'],
    [/bupot_number/gi, 'nomor bukti potong'],
    [/bupot_date/gi, 'tanggal bukti potong'],
    [/payment_date/gi, 'tanggal pembayaran'],
    [/period_type/gi, 'jenis periode'],
    [/decision/gi, 'keputusan'],
    [/remarks/gi, 'catatan'],
    [/description/gi, 'keterangan'],
    [/\bids\b/gi, 'data yang dipilih'],
    [/\bpayload\b/gi, 'data yang dikirim'],
    [/\bamount\b/gi, 'nominal'],
    [/\bcompany_id\b/gi, 'perusahaan'],
    [/\btenant_id\b/gi, 'ruang kerja perusahaan'],
    [/customer_party_id/gi, 'pelanggan'],
    [/party_id/gi, 'pelanggan atau rekanan'],
    [/project_id/gi, 'proyek'],
    [/estimate_id/gi, 'estimasi biaya'],
    [/quotation_id/gi, 'quotation'],
    [/invoice_id/gi, 'invoice'],
    [/companyId/gi, 'perusahaan aktif'],
    [/company aktif/gi, 'perusahaan yang dipilih'],
    [/company/gi, 'perusahaan'],
    [/customer party/gi, 'data pelanggan'],
    [/CostEstimate/gi, 'estimasi biaya'],
    [/ProjectCostEntry/gi, 'catatan biaya proyek'],
    [/BillingProposal/gi, 'proposal tagihan'],
    [/BillingDocument/gi, 'dokumen tagihan'],
    [/BusinessDocument/gi, 'dokumen transaksi'],
    [/PurchaseRequisition/gi, 'permintaan pembelian'],
    [/PurchaseOrder/gi, 'pesanan pembelian'],
    [/TaskTransferRequest/gi, 'permintaan pemindahan tugas'],
    [/MainTask/gi, 'tugas utama'],
    [/WeeklyTask/gi, 'tugas mingguan'],
    [/DailyTask/gi, 'tugas harian'],
    [/\bOpportunity\b/gi, 'peluang penjualan'],
    [/\bEstimate\b/gi, 'estimasi biaya'],
    [/\bCustomer\b/gi, 'pelanggan'],
    [/\bclient\b/gi, 'pelanggan'],
    [/supplier invoice/gi, 'tagihan vendor'],
    [/\bproject\b/gi, 'proyek'],
    [/\bpayment\b/gi, 'pembayaran'],
    [/\bresource\b/gi, 'data'],
    [/\btenant\b/gi, 'ruang kerja perusahaan'],
    [/\bmutation\b/gi, 'perubahan'],
    [/\bPOSTED\b/g, 'sudah dibukukan'],
    [/\bSUBMITTED\b/g, 'sudah diajukan'],
    [/\bAPPROVED\b/g, 'sudah disetujui'],
    [/\bREJECTED\b/g, 'sudah ditolak'],
    [/\bCANCELLED\b/g, 'sudah dibatalkan'],
    [/\bVERIFIED\b/g, 'sudah diverifikasi'],
    [/\bACCEPTED\b/g, 'sudah diterima'],
    [/\bSENT\b/g, 'sudah dikirim'],
    [/\bPAID\b/g, 'sudah lunas'],
    [/\bAPPROVE\b/g, 'setujui'],
    [/\bRE_CHECK\b/g, 'periksa ulang'],
    [/\bREJECT\b/g, 'tolak'],
    [/\bREVISE\b/g, 'minta revisi'],
    [/\bDAILY\b/g, 'harian'],
    [/\bWEEKLY\b/g, 'mingguan'],
    [/\bMONTHLY\b/g, 'bulanan'],
    [/\bPROJECT_MANAGER\b/g, 'Manajer Proyek'],
    [/\bOPERATIONAL_MANAGER\b/g, 'Manajer Operasional'],
    [/\bCOMPANY_ADMIN\b/g, 'Admin perusahaan'],
    [/\bSUPER_ADMIN\b/g, 'Admin sistem'],
    [/\bDIRECTOR\b/g, 'Direktur'],
    [/\bFINANCE\b/g, 'Finance'],
    [/\bSTAFF\b/g, 'Staf'],
  ];
  let readable = message.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, 'data terkait');
  for (const [pattern, replacement] of replacements) readable = readable.replace(pattern, replacement);
  return /^[A-Z]/.test(message) ? readable.charAt(0).toLocaleUpperCase('id-ID') + readable.slice(1) : readable;
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    const resourceLabels: Record<string, string> = {
      Resource: 'Data',
      Document: 'Dokumen',
      'Workflow document': 'Dokumen proses',
      Quotation: 'Quotation',
      CostEstimate: 'Estimasi biaya',
      CustomerInquiry: 'Permintaan pelanggan',
      CustomerProfile: 'Profil pelanggan',
      Conversation: 'Percakapan pelanggan',
      Delivery: 'Pengiriman',
      ExecutiveApproval: 'Persetujuan pimpinan',
      'Internal Document': 'Dokumen internal',
      'Meeting Request': 'Permintaan meeting',
      'Management report': 'Laporan manajemen',
      Order: 'Pesanan',
      Request: 'Permintaan',
      'Request Ticket': 'Tiket permintaan',
      'Verified external identity': 'Identitas pelanggan terverifikasi',
      StockMove: 'Pergerakan stok',
      'Resource proyek': 'Data proyek',
      Rekanan: 'Rekanan',
      'Rekanan aktif': 'Rekanan aktif',
      Party: 'Pelanggan atau rekanan',
      User: 'Pengguna',
      ProjectCostEntry: 'Catatan biaya proyek',
      BillingProposal: 'Proposal tagihan',
      BillingDocument: 'Dokumen tagihan',
      BusinessDocument: 'Dokumen',
      Payment: 'Pembayaran',
      FiscalPeriod: 'Periode keuangan',
      FiscalYear: 'Tahun buku',
      'Period closing': 'Penutupan periode keuangan',
      JournalEntry: 'Jurnal transaksi',
      Account: 'Akun keuangan',
      BankAccount: 'Rekening bank',
      'Bank Account Pengirim': 'Rekening bank pengirim',
      'Bank Account Penerima': 'Rekening bank penerima',
      BankStatementLine: 'Baris mutasi bank',
      ProjectFunding: 'Pendanaan proyek',
      TaxTransaction: 'Transaksi pajak',
      PurchaseRequisition: 'Permintaan pembelian',
      PurchaseOrder: 'Pesanan pembelian',
      ProductionOrder: 'Perintah produksi',
      WorkOrder: 'Perintah kerja',
      Shipment: 'Pengiriman',
      ServiceCase: 'Kasus layanan',
      Asset: 'Aset',
      AssetBook: 'Buku aset',
      Inspection: 'Pemeriksaan barang',
      TaskTransferRequest: 'Permintaan pemindahan tugas',
      MainTask: 'Tugas utama',
      WeeklyTask: 'Tugas mingguan',
      DailyTask: 'Tugas harian',
      TaskAssignment: 'Penugasan tugas',
      Milestone: 'Tahapan proyek',
      ProjectSupervisor: 'Supervisor proyek',
      Project: 'Proyek',
      Opportunity: 'Peluang penjualan',
      Customer: 'Pelanggan',
    };
    const alreadyDescribesMissingData = /tidak ditemukan[.!]?$/i.test(resource);
    const resourceName = resource.replace(/\s+tidak ditemukan[.!]?$/i, '');
    const readableResource = resourceLabels[resourceName]
      ?? resourceName.replace(/([a-z])([A-Z])/g, '$1 $2').toLocaleLowerCase('id-ID');
    const message = `${readableResource} tidak ditemukan.${alreadyDescribesMissingData ? '' : ' Muat ulang halaman dan periksa apakah data tersebut masih tersedia.'}`;
    super(message, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Sesi Anda sudah berakhir atau tidak valid. Masuk kembali, lalu ulangi tindakan.') {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Akun Anda belum memiliki akses untuk melakukan tindakan ini. Hubungi administrator jika akses tersebut diperlukan.') {
    super(message, 403, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, errors?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', errors);
    this.name = 'ValidationError';
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Data berubah atau sudah digunakan sehingga tindakan ini belum dapat dilakukan. Muat ulang halaman dan periksa kembali.') {
    super(message, 409, 'CONFLICT');
    this.name = 'ConflictError';
  }
}

export class WorkflowError extends AppError {
  constructor(message: string) {
    super(message, 400, 'WORKFLOW_ERROR');
    this.name = 'WorkflowError';
  }
}

export class AccountingError extends AppError {
  constructor(message: string) {
    super(message, 400, 'ACCOUNTING_ERROR');
    this.name = 'AccountingError';
  }
}
