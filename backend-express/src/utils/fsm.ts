// =============================================================================
// FINITE STATE MACHINE (FSM) — Document Lifecycle Engine
// Mendefinisikan state transitions yang valid untuk setiap tipe dokumen keuangan.
// Mencegah perpindahan state yang tidak sah (e.g., POSTED → DRAFT).
// =============================================================================

export type DocumentState =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'VERIFIED'
  | 'APPROVED'
  | 'REJECTED'
  | 'POSTED'
  | 'REVERSED'
  | 'CANCELLED'
  | 'DRAWN';

export type DocumentEvent =
  | 'submit'
  | 'verify'
  | 'approve'
  | 'reject'
  | 'post'
  | 'reverse'
  | 'cancel'
  | 'draw';

export interface StateTransition {
  from: DocumentState;
  event: DocumentEvent;
  to: DocumentState;
  requiresSoD?: boolean;       // Apakah transisi ini membutuhkan penyetuju berbeda dari pembuat
  requiresRole?: string[];     // Role yang diperlukan untuk transisi ini
  description?: string;
}

// ---------------------------------------------------------------------------
// DEFINISI STATE MACHINE PER TIPE DOKUMEN
// ---------------------------------------------------------------------------

export const BILLING_DOCUMENT_FSM: StateTransition[] = [
  { from: 'DRAFT', event: 'submit', to: 'SUBMITTED', requiresSoD: false, description: 'Maker mengajukan dokumen' },
  { from: 'SUBMITTED', event: 'verify', to: 'VERIFIED', requiresSoD: true, requiresRole: ['FINANCE_STAFF', 'FINANCE_MANAGER'], description: 'Checker memverifikasi' },
  { from: 'VERIFIED', event: 'approve', to: 'APPROVED', requiresSoD: true, requiresRole: ['FINANCE_MANAGER', 'DIRECTOR'], description: 'Approver menyetujui' },
  { from: 'APPROVED', event: 'post', to: 'POSTED', requiresSoD: true, requiresRole: ['FINANCE_STAFF', 'FINANCE_MANAGER'], description: 'Posting ke General Ledger' },
  { from: 'SUBMITTED', event: 'reject', to: 'REJECTED', requiresSoD: true, description: 'Checker menolak dokumen' },
  { from: 'VERIFIED', event: 'reject', to: 'REJECTED', requiresSoD: true, description: 'Approver menolak dokumen' },
  { from: 'DRAFT', event: 'cancel', to: 'CANCELLED', requiresSoD: false, description: 'Pembuat membatalkan sebelum disubmit' },
  { from: 'REJECTED', event: 'cancel', to: 'CANCELLED', requiresSoD: false, description: 'Membatalkan dokumen yang ditolak' },
  { from: 'POSTED', event: 'reverse', to: 'REVERSED', requiresSoD: true, requiresRole: ['FINANCE_MANAGER', 'DIRECTOR'], description: 'Pembalikan jurnal (Storno)' },
];

export const PAYMENT_FSM: StateTransition[] = [
  { from: 'DRAFT', event: 'submit', to: 'SUBMITTED', requiresSoD: false, description: 'Maker mengajukan payment' },
  { from: 'SUBMITTED', event: 'approve', to: 'APPROVED', requiresSoD: true, requiresRole: ['FINANCE_MANAGER', 'DIRECTOR'], description: 'Approval pembayaran' },
  { from: 'APPROVED', event: 'post', to: 'POSTED', requiresSoD: true, requiresRole: ['FINANCE_STAFF'], description: 'Eksekusi pembayaran' },
  { from: 'SUBMITTED', event: 'reject', to: 'REJECTED', requiresSoD: true, description: 'Penolakan payment' },
  { from: 'DRAFT', event: 'cancel', to: 'CANCELLED', requiresSoD: false },
];

export const FUND_REQUEST_FSM: StateTransition[] = [
  { from: 'DRAFT', event: 'submit', to: 'SUBMITTED', requiresSoD: false, description: 'Pengajuan dana proyek' },
  { from: 'SUBMITTED', event: 'approve', to: 'APPROVED', requiresSoD: true, requiresRole: ['FINANCE_MANAGER', 'DIRECTOR'], description: 'Persetujuan dana proyek' },
  { from: 'APPROVED', event: 'draw', to: 'DRAWN', requiresSoD: true, requiresRole: ['FINANCE_STAFF'], description: 'Pencairan dana' },
  { from: 'SUBMITTED', event: 'reject', to: 'REJECTED', requiresSoD: true, description: 'Penolakan pengajuan dana' },
  { from: 'DRAFT', event: 'cancel', to: 'CANCELLED', requiresSoD: false },
];

// ---------------------------------------------------------------------------
// FSM ENGINE
// ---------------------------------------------------------------------------

export class DocumentFSM {
  private transitions: StateTransition[];

  constructor(documentType: 'BILLING' | 'PAYMENT' | 'FUND_REQUEST') {
    switch (documentType) {
      case 'BILLING': this.transitions = BILLING_DOCUMENT_FSM; break;
      case 'PAYMENT': this.transitions = PAYMENT_FSM; break;
      case 'FUND_REQUEST': this.transitions = FUND_REQUEST_FSM; break;
      default: throw new Error(`Tipe dokumen tidak dikenal: ${documentType}`);
    }
  }

  /**
   * Validasi apakah transisi event dari state saat ini diizinkan.
   * Throws Error jika transisi tidak valid.
   */
  validate(currentState: DocumentState, event: DocumentEvent): StateTransition {
    const transition = this.transitions.find(
      (t) => t.from === currentState && t.event === event,
    );

    if (!transition) {
      const allowedEvents = this.transitions
        .filter((t) => t.from === currentState)
        .map((t) => t.event);

      throw new Error(
        `[FSM] Transisi tidak valid: dokumen dalam status "${currentState}" tidak dapat diubah dengan event "${event}". ` +
        `Event yang diizinkan dari state ini: [${allowedEvents.join(', ')}].`,
      );
    }

    return transition;
  }

  /**
   * Terapkan transisi dan kembalikan state berikutnya.
   */
  apply(currentState: DocumentState, event: DocumentEvent): { nextState: DocumentState; transition: StateTransition } {
    const transition = this.validate(currentState, event);
    return { nextState: transition.to, transition };
  }

  /**
   * Dapatkan semua aksi yang tersedia dari state saat ini.
   */
  getAvailableEvents(currentState: DocumentState): DocumentEvent[] {
    return this.transitions
      .filter((t) => t.from === currentState)
      .map((t) => t.event);
  }

  /**
   * Cek apakah state adalah state terminal (tidak ada transisi keluar).
   */
  isTerminal(state: DocumentState): boolean {
    return this.transitions.filter((t) => t.from === state).length === 0;
  }
}
