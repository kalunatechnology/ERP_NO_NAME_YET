import type { ProcedureRule } from '../../schemas/procedure.schema';

export const financeProcedures: ProcedureRule[] = [
  {
    id: 'invoice.default',
    topic: 'invoice',
    title: 'Invoice dan billing termin',
    targetPath: '/finance',
    version: '2026-10-07',
    keywords: /invoice|faktur|billing|tagihan/i,
    content: {
      summary: 'Untuk faktur penagihan klien, buka Finance lalu tab Billing Termin. Pilih Buat Proposal dan isi data yang diminta pada formulir. Proposal DRAFT diproses melalui Submit, lalu pihak yang berwenang melakukan Approve. Proposal APPROVED dapat diproses melalui Terbitkan Billing. Periksa dokumen dan status hasil sebelum mencatat pembayaran. Aksi yang tersedia mengikuti peran, entitlement, dan status dokumen; hubungi admin jika tab atau tombol tidak tersedia. Panduan ini tidak menyetujui atau menerbitkan invoice secara otomatis.',
    },
  },
];
