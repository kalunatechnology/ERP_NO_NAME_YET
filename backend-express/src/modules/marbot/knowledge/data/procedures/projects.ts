import type { ProcedureRule } from '../../schemas/procedure.schema';

export const projectProcedures: ProcedureRule[] = [
  {
    id: 'project.lifecycle',
    topic: 'project',
    operation: 'edit',
    title: 'Pembaruan Tahapan Lifecycle Proyek',
    targetPath: '/projects',
    version: '2026-10-15',
    keywords: /life\s*scycel|life\s*cycle|lifecycle|lifecyle|siklus\s*hidup|stage|tahapan/i,
    authorization: {
      allowedRoles: ['SUPER_ADMIN', 'COMPANY_ADMIN', 'DIRECTOR', 'PROJECT_MANAGER', 'OPERATIONAL_MANAGER', 'CRM_LEAD', 'SALES'],
      requiredModules: ['PROJECTS'],
      requiresWriteAccess: true,
      roleDeniedMessage: (role) => `Peran aktif Anda ${role} tidak memiliki wewenang untuk memajukan stage lifecycle proyek. Hanya role manajerial (PM, Ops Manager, Director, Admin) atau tim komersial (Sales, CRM Lead) yang dapat mengubah tahapan siklus hidup proyek.`,
      moduleBlockedMessage: (role) => `Peran aktif Anda ${role} memenuhi syarat role, tetapi akses perubahan Projects belum tersedia dalam konteks asisten.`,
      roleMatchMessage: (role) => `Peran aktif Anda ${role} memenuhi syarat role untuk memperbarui tahapan siklus hidup proyek.`,
      denialMessage: 'Pembaruan lifecycle proyek memerlukan wewenang manajerial atau komersial pada company aktif.',
    },
    content: {
      summary: 'Pembaruan siklus hidup (lifecycle stage) proyek dilakukan pada halaman Proyek melalui panel Project Lifecycle Stage Flow. Hak transisi dibedakan antara fase komersial dan fase operasional:\n\n1. Buka menu **Proyek** (`/projects`) dan pilih proyek yang ingin diubah dari daftar.\n2. Di panel detail proyek, periksa alur **Project Lifecycle Stage Flow** (tahapan: INCOMING → DISCOVERY → PITCHING → NEGOTIATION → VERIFIED → RESERVED → ACTIVE → CLOSED, atau LOST).\n3. Jika role aktif Anda memiliki hak akses untuk memajukan stage saat ini, klik tombol **Majukan Stage Lifecycle** di atas flow diagram.\n   - **Fase Sales/Pre-deal** (INCOMING, DISCOVERY, PITCHING, NEGOTIATION): dapat dimajukan oleh role **Sales**, **CRM Lead**, **Project Manager**, **Director**, atau **Admin**.\n   - **Fase Delivery/Operasional** (VERIFIED, RESERVED, ACTIVE): dapat dimajukan oleh role **Operational Manager**, **Project Manager**, **Director**, atau **Admin**.\n   - **Staff Biasa** tidak dapat memajukan tahapan lifecycle secara langsung.\n4. Pada formulir konfirmasi:\n   - Jika melangkah ke **VERIFIED** (Deal Menang), wajib mengisikan **Nomor PO / Kontrak** (`po_contract_number`).\n   - Jika memilih status **LOST** (Batal/Gugur), wajib mengisikan **Alasan Pembatalan** (`reason`).\n5. Klik konfirmasi untuk menyimpan pembaruan. Tahapan lifecycle proyek akan langsung diperbarui di database dan tampilan flow stage.\n\nCatatan: Status lifecycle berbeda dari status operasional (seperti ON_HOLD). Asisten tidak mengubah tahapan proyek secara otomatis melalui percakapan ini.',
    },
  },
  {
    id: 'project.create',
    topic: 'project',
    operation: 'create',
    title: 'Membuat Proyek Baru',
    targetPath: '/projects',
    version: '2026-10-15',
    authorization: {
      allowedRoles: ['SUPER_ADMIN', 'COMPANY_ADMIN', 'DIRECTOR', 'PROJECT_MANAGER', 'SALES'],
      requiredModules: ['PROJECTS'],
      requiresWriteAccess: true,
      roleDeniedMessage: (role) => `Peran aktif Anda ${role} tidak memiliki wewenang untuk membuat proyek baru. Hubungi Sales, PM, atau Admin.`,
      moduleBlockedMessage: (role) => `Peran aktif Anda ${role} memenuhi syarat role, tetapi akses penambahan Projects dibatasi.`,
      roleMatchMessage: (role) => `Peran aktif Anda ${role} memenuhi syarat role untuk membuat proyek baru.`,
      denialMessage: 'Pembuatan proyek baru memerlukan wewenang manajerial atau sales pada company aktif.',
    },
    content: {
      summary: 'Pembuatan proyek baru dilakukan melalui menu Proyek (`/projects`). Klik tombol **Tambah Proyek** (atau **Buat Proyek Baru**), lalu lengkapi informasi nama proyek, klien (customer party), tanggal periode, dan Project Manager penanggung jawab. Status siklus hidup awal adalah INCOMING. Setelah proyek tersimpan, Anda dapat menyusun Main Task dan WBS.',
    },
  },
  {
    id: 'project.default',
    topic: 'project',
    title: 'Panduan Modul Proyek',
    targetPath: '/projects',
    version: '2026-10-15',
    keywords: /proyek|project|pipeline/i,
    content: {
      summary: 'Modul Proyek (`/projects`) mengelola siklus hidup proyek (INCOMING hingga CLOSED/LOST) dan hierarki eksekusi: Project → Main Task → Weekly Task → Daily Task. Untuk memperbarui tahapan siklus hidup (lifecycle), pilih proyek lalu gunakan tombol **Majukan Stage Lifecycle** pada panel Stage Flow sesuai kewenangan role Anda (Sales/CRM untuk tahap pra-kontrak, PM/Ops Manager untuk tahap eksekusi).',
    },
  },
];
