import crypto from 'crypto';
import { NextFunction, Request, Response, Router } from 'express';
import prisma from '../../config/database';
import { requireCompanyAdmin, requireSuperAdminForWrite } from '../../middlewares/rbac.middleware';
import { ForbiddenError, NotFoundError, ValidationError } from '../../utils/errors';

export const publicGovernanceRouter = Router();
export const governanceRouter = Router();

const ALLOWED_WEBSITE_STATUSES = [
  'development',
  'testing',
  'staging',
  'ready_to_launch',
  'published',
  'maintenance',
  'suspended',
] as const;

let governanceInitialized = false;

export async function ensureGovernanceTables(): Promise<void> {
  if (governanceInitialized) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "gov_website_state" (
        "id" TEXT PRIMARY KEY,
        "status" TEXT NOT NULL DEFAULT 'staging',
        "legal_entity_name" TEXT NOT NULL DEFAULT 'PT Arsalynk Teknologi Indonesia',
        "legal_entity_address" TEXT NOT NULL DEFAULT '',
        "contact_email" TEXT NOT NULL DEFAULT 'privacy@arsalynk.com',
        "pic_name" TEXT NOT NULL DEFAULT 'Data Protection Officer',
        "tdpse_number" TEXT NOT NULL DEFAULT '',
        "canonical_domain" TEXT NOT NULL DEFAULT 'https://marka.arsalynk.com',
        "server_region" TEXT NOT NULL DEFAULT 'Indonesia / Asia-Pacific',
        "feature_flags_json" JSONB NOT NULL DEFAULT '{}'::jsonb,
        "updated_by_id" TEXT,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "gov_legal_document_version" (
        "id" TEXT PRIMARY KEY,
        "doc_type" TEXT NOT NULL,
        "version" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "summary_of_changes" TEXT NOT NULL DEFAULT '',
        "content_hash" TEXT NOT NULL DEFAULT '',
        "is_material" BOOLEAN NOT NULL DEFAULT false,
        "is_active" BOOLEAN NOT NULL DEFAULT true,
        "effective_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE("doc_type", "version")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "gov_consent_ledger" (
        "id" TEXT PRIMARY KEY,
        "user_id" TEXT,
        "email" TEXT NOT NULL DEFAULT '',
        "consent_type" TEXT NOT NULL,
        "document_version" TEXT NOT NULL,
        "document_hash" TEXT NOT NULL DEFAULT '',
        "granted" BOOLEAN NOT NULL DEFAULT true,
        "ip_address" TEXT NOT NULL DEFAULT '',
        "user_agent" TEXT NOT NULL DEFAULT '',
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "gov_dsr_request" (
        "id" TEXT PRIMARY KEY,
        "ticket_number" TEXT NOT NULL UNIQUE,
        "user_id" TEXT,
        "requester_email" TEXT NOT NULL,
        "request_type" TEXT NOT NULL,
        "description" TEXT NOT NULL DEFAULT '',
        "status" TEXT NOT NULL DEFAULT 'OPEN',
        "due_at" TIMESTAMP(3) NOT NULL,
        "assigned_to_id" TEXT,
        "resolution_note" TEXT NOT NULL DEFAULT '',
        "resolved_at" TIMESTAMP(3),
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const stateRows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT "id" FROM "gov_website_state" LIMIT 1`,
    );
    if (!stateRows.length) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "gov_website_state" ("id", "status", "legal_entity_name", "contact_email", "pic_name", "canonical_domain")
         VALUES ($1, 'staging', 'PT Arsalynk Teknologi Indonesia', 'privacy@arsalynk.com', 'Data Protection Officer', 'https://marka.arsalynk.com')`,
        crypto.randomUUID(),
      );
    }

    const defaultDocs = [
      { type: 'PRIVACY_POLICY', version: '1.0', title: 'Kebijakan Privasi MarkaSuite (UU PDP Pasal 21)' },
      { type: 'TERMS', version: '1.0', title: 'Syarat & Ketentuan Layanan MarkaSuite' },
      { type: 'COOKIE_POLICY', version: '1.0', title: 'Pemberitahuan Cookie & Penyimpanan Browser' },
    ];
    for (const doc of defaultDocs) {
      const hash = crypto.createHash('sha256').update(`${doc.type}:${doc.version}:${doc.title}`).digest('hex').slice(0, 16);
      await prisma.$executeRawUnsafe(
        `INSERT INTO "gov_legal_document_version" ("id", "doc_type", "version", "title", "content_hash", "is_active")
         VALUES ($1, $2, $3, $4, $5, true)
         ON CONFLICT ("doc_type", "version") DO NOTHING`,
        crypto.randomUUID(),
        doc.type,
        doc.version,
        doc.title,
        hash,
      );
    }
    governanceInitialized = true;
  } catch {
    // Allow graceful degradation if DDL is restricted
  }
}

export interface LaunchGateCheck {
  key: string;
  label: string;
  passed: boolean;
  blocker: boolean;
  detail: string;
}

export async function evaluateLaunchReadiness() {
  await ensureGovernanceTables();
  const [stateRows, activeDocs] = await Promise.all([
    prisma.$queryRawUnsafe<Array<any>>(`SELECT * FROM "gov_website_state" LIMIT 1`).catch(() => []),
    prisma.$queryRawUnsafe<Array<any>>(`SELECT * FROM "gov_legal_document_version" WHERE "is_active" = true`).catch(() => []),
  ]);
  const state = stateRows[0] ?? {
    status: 'staging',
    legal_entity_name: 'PT Arsalynk Teknologi Indonesia',
    contact_email: 'privacy@arsalynk.com',
    tdpse_number: '',
    canonical_domain: 'https://marka.arsalynk.com',
  };
  const docTypes = new Set(activeDocs.map((d: any) => String(d.doc_type).toUpperCase()));

  const adminMfaEnforced = process.env.ERP_ENFORCE_ADMIN_MFA === 'true';
  const secureCookiesActive =
    process.env.NODE_ENV === 'production' ||
    String(process.env.COOKIE_SECURE || '').trim().toLowerCase() === 'true';
  const missingSecurityControls: string[] = [];
  if (!adminMfaEnforced) {
    missingSecurityControls.push('ERP_ENFORCE_ADMIN_MFA=true (MFA wajib untuk Admin)');
  }
  if (!secureCookiesActive) {
    missingSecurityControls.push('NODE_ENV=production atau COOKIE_SECURE=true (Cookie Secure aktif)');
  }
  const securityControlsPassed = missingSecurityControls.length === 0;

  const checks: LaunchGateCheck[] = [
    {
      key: 'entity_identity',
      label: 'Identitas Badan Hukum & Kontak Resmi',
      passed: Boolean(String(state.legal_entity_name || '').trim() && String(state.contact_email || '').trim()),
      blocker: true,
      detail: 'Nama badan usaha dan email kontak/pengaduan resmi wajib terisi.',
    },
    {
      key: 'tdpse',
      label: 'Nomor Tanda Daftar PSE (TDPSE / Komdigi)',
      passed: Boolean(String(state.tdpse_number || '').trim()),
      blocker: true,
      detail: 'Wajib diisi sebelum status website diubah ke published (PP 71/2019 & Permenkominfo 5/2020).',
    },
    {
      key: 'privacy_policy',
      label: 'Kebijakan Privasi Aktif (7 Unsur Pasal 21 UU PDP)',
      passed: docTypes.has('PRIVACY_POLICY'),
      blocker: true,
      detail: 'Dokumen PRIVACY_POLICY versi aktif tersedia di /privacy-policy.',
    },
    {
      key: 'terms',
      label: 'Syarat & Ketentuan Aktif (PP 71/2019 & UU 1/2024)',
      passed: docTypes.has('TERMS'),
      blocker: true,
      detail: 'Dokumen TERMS versi aktif tersedia di /terms.',
    },
    {
      key: 'cookie_policy',
      label: 'Pemberitahuan Cookie & Penyimpanan Sesi',
      passed: docTypes.has('COOKIE_POLICY'),
      blocker: false,
      detail: 'Dokumen COOKIE_POLICY tersedia di /cookie-policy.',
    },
    {
      key: 'security_controls',
      label: 'Keamanan Sesi HttpOnly, Cookie Secure & MFA Admin',
      passed: securityControlsPassed,
      blocker: true,
      detail: securityControlsPassed
        ? 'ERP_ENFORCE_ADMIN_MFA aktif, cookie HttpOnly/SameSite/Secure aktif, auth rate limiter + lockout, dan Cache-Control no-store aktif.'
        : `Syarat keamanan belum terpenuhi: ${missingSecurityControls.join('; ')}.`,
    },
  ];

  const blockers = checks.filter((c) => c.blocker && !c.passed);
  return {
    can_publish: blockers.length === 0,
    blockers,
    checks,
    website_state: state,
    active_documents: activeDocs,
  };
}

export interface PendingReconsentDocument {
  id: string;
  doc_type: string;
  version: string;
  title: string;
  summary_of_changes: string;
  content_hash: string;
  effective_at: string;
}

const CONSENT_TYPE_ALIASES: Record<string, string[]> = {
  PRIVACY_POLICY: ['PRIVACY_POLICY', 'PRIVACY_NOTICE'],
  TERMS: ['TERMS'],
  COOKIE_POLICY: ['COOKIE_POLICY'],
};

let materialDocsCache: { fetchedAt: number; docs: Array<any> } | null = null;
const MATERIAL_DOCS_CACHE_TTL_MS = 60 * 1000;

async function getActiveMaterialDocs(): Promise<Array<any>> {
  const now = Date.now();
  if (materialDocsCache && now - materialDocsCache.fetchedAt < MATERIAL_DOCS_CACHE_TTL_MS) {
    return materialDocsCache.docs;
  }
  await ensureGovernanceTables();
  const docs = await prisma.$queryRawUnsafe<Array<any>>(
    `SELECT DISTINCT ON ("doc_type") "id", "doc_type", "version", "title", "summary_of_changes", "content_hash", "effective_at"
     FROM "gov_legal_document_version"
     WHERE "is_active" = true AND "is_material" = true
     ORDER BY "doc_type", "effective_at" DESC, "created_at" DESC`,
  );
  materialDocsCache = { fetchedAt: now, docs };
  return docs;
}

/**
 * Evaluates whether a user must re-consent to the latest active material legal
 * documents (`is_material = true`) by comparing against `gov_consent_ledger`.
 */
export async function evaluateUserReconsent(
  userId: string,
  email?: string,
): Promise<{ reconsent_required: boolean; pending_documents: PendingReconsentDocument[] }> {
  try {
    const materialDocs = await getActiveMaterialDocs();
    if (!materialDocs.length) {
      return { reconsent_required: false, pending_documents: [] };
    }

    const normalizedEmail = String(email || '').trim().toLowerCase();
    const userConsents = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT "consent_type", "document_version", "document_hash"
       FROM "gov_consent_ledger"
       WHERE "granted" = true AND ("user_id" = $1 OR ($2 <> '' AND LOWER("email") = $2))`,
      String(userId),
      normalizedEmail,
    );

    const pendingDocuments: PendingReconsentDocument[] = [];
    for (const doc of materialDocs) {
      const docType = String(doc.doc_type || '').trim().toUpperCase();
      const docVersion = String(doc.version || '').trim();
      const docHash = String(doc.content_hash || '').trim();
      const acceptedAliases = CONSENT_TYPE_ALIASES[docType] ?? [docType];

      const hasValidConsent = userConsents.some((consent) => {
        const cType = String(consent.consent_type || '').trim().toUpperCase();
        const cVer = String(consent.document_version || '').trim();
        const cHash = String(consent.document_hash || '').trim();
        if (!acceptedAliases.includes(cType)) return false;
        if (cVer !== docVersion) return false;
        if (docHash && cHash && cHash !== docHash) return false;
        return true;
      });

      if (!hasValidConsent) {
        pendingDocuments.push({
          id: String(doc.id),
          doc_type: docType,
          version: docVersion,
          title: String(doc.title || docType),
          summary_of_changes: String(doc.summary_of_changes || ''),
          content_hash: docHash,
          effective_at: doc.effective_at ? new Date(doc.effective_at).toISOString() : new Date().toISOString(),
        });
      }
    }

    return {
      reconsent_required: pendingDocuments.length > 0,
      pending_documents: pendingDocuments,
    };
  } catch {
    return { reconsent_required: false, pending_documents: [] };
  }
}

export const ROPA_RECORDS = [
  {
    id: 'ROPA-01',
    activity_name: 'Autentikasi & Pengelolaan Akses Akun (IAM)',
    controller: 'PT Arsalynk Teknologi Indonesia',
    dpo_contact: 'privacy@arsalynk.com',
    purpose: 'Verifikasi identitas pengguna, kontrol akses berbasis modul (RBAC), dan keamanan sesi.',
    legal_basis: 'Pelaksanaan Perjanjian & Kewajiban Hukum (UU PDP Pasal 20 ayat (2) huruf b & c)',
    data_subject_categories: 'Karyawan, Admin Perusahaan, Pengguna Terundang',
    personal_data_categories: 'Nama lengkap, email, username, hash kata sandi, IP address, user-agent, log MFA',
    recipients: 'Internal Admin Perusahaan & Infrastruktur Hosting Terikat DPA',
    cross_border_transfer: 'Cloud hosting & API AI (bila diaktifkan) mengikuti evaluasi Pasal 56 UU PDP',
    retention_period: 'Selama akun aktif + 2 tahun setelah penonaktifan (log audit keamanan 5 tahun)',
    deletion_method: 'Anonimisasi akun & penghapusan kredensial terjadwal',
    security_measures: 'TLS, bcrypt/scrypt password hash, HttpOnly/Secure JWT cookie, AES-256-GCM MFA secret, audit trail',
    owner_role: 'Super Admin / DPO',
  },
  {
    id: 'ROPA-02',
    activity_name: 'Pengelolaan Proyek, CRM & Penagihan Keuangan (ERP)',
    controller: 'Perusahaan Tenant (Pengendali) & PT Arsalynk Teknologi Indonesia (Prosesor/Pengendali Bersama)',
    dpo_contact: 'privacy@arsalynk.com',
    purpose: 'Operasional proyek, penawaran harga, faktur, penerimaan pembayaran, dan pelaporan pajak.',
    legal_basis: 'Pelaksanaan Kontrak & Kewajiban Perpajakan/Akuntansi (UU KUP / UU PDP Pasal 20)',
    data_subject_categories: 'PIC Klien B2B, Vendor/Supplier, Karyawan Pelaksana',
    personal_data_categories: 'Nama PIC, email/telepon bisnis, NPWP/identitas pajak, catatan transaksi & tagihan',
    recipients: 'Tim Finance, PM, CRM Perusahaan Terkait (isolasi tenant/company)',
    cross_border_transfer: 'Tidak dilakukan kecuali integrasi webhook/email yang diaktifkan tenant',
    retention_period: '10 tahun untuk dokumen faktur, pajak, dan buku besar sesuai ketentuan perpajakan Indonesia',
    deletion_method: 'Arsip terkunci sesuai masa retensi wajib, lalu pemusnahan aman',
    security_measures: 'Multi-tenant isolation, SoD Maker-Checker, Cache-Control no-store, backup terenkripsi',
    owner_role: 'Company Admin & Finance',
  },
  {
    id: 'ROPA-03',
    activity_name: 'Asisten AI (Marbot) & Knowledge Engine',
    controller: 'Perusahaan Tenant (Pengendali) & PT Arsalynk Teknologi Indonesia (Pengelola Platform)',
    dpo_contact: 'privacy@arsalynk.com',
    purpose: 'Membantu pencarian informasi operasional, ringkasan tugas/proyek, dan otomasi alur kerja internal berbasis peran (RBAC).',
    legal_basis: 'Pelaksanaan Perjanjian Layanan & Kepentingan yang Sah dengan Pembatasan Akses (UU PDP Pasal 20)',
    data_subject_categories: 'Karyawan, Staff, Supervisor, Project Manager, Admin Perusahaan',
    personal_data_categories: 'Identitas pengguna (user_id, peran, company_id), riwayat prompt/percakapan operasional, konteks tugas terkait',
    recipients: 'Pengguna terautentikasi sesuai RBAC & penyedia model AI (bila runtime eksternal/LLM diaktifkan)',
    cross_border_transfer: 'Bila menggunakan penyedia LLM eksternal di luar Indonesia, tunduk pada klausul DPA dan evaluasi Pasal 56 UU PDP',
    retention_period: 'Riwayat percakapan & log interaksi AI disimpan maksimal 1 tahun (log audit keamanan 5 tahun)',
    deletion_method: 'Purge otomatis terjadwal & anonimisasi identifier pengguna pada log analitik',
    security_measures: 'Validasi scope RBAC per tenant/company, HMAC signature internal, enkripsi TLS, pembatasan read-only view DB',
    owner_role: 'Engineering Lead & DPO',
  },
  {
    id: 'ROPA-04',
    activity_name: 'Integrasi WhatsApp CRM & Komunikasi Pelanggan',
    controller: 'Perusahaan Tenant (Pengendali) & PT Arsalynk Teknologi Indonesia (Prosesor)',
    dpo_contact: 'privacy@arsalynk.com',
    purpose: 'Pencatatan lead otomatis, korespondensi layanan pelanggan, dan sinkronisasi percakapan ke pipeline CRM perusahaan.',
    legal_basis: 'Pelaksanaan Perjanjian/Pra-Kontrak Komersial & Persetujuan Komunikasi (UU PDP Pasal 20)',
    data_subject_categories: 'Prospek/Leads, PIC Pelanggan, Kontak Bisnis Eksternal',
    personal_data_categories: 'Nama kontak, nomor WhatsApp/telepon, isi pesan inbound/outbound, metadata webhook, status tiket',
    recipients: 'Tim Sales, CRM Lead, & Admin Perusahaan Tenant terkait',
    cross_border_transfer: 'Melalui infrastruktur gateway WhatsApp/Meta sesuai perjanjian pemrosesan data (DPA) tenant',
    retention_period: 'Selama relasi bisnis/lead aktif + 3 tahun setelah interaksi terakhir (kecuali diminta hapus melalui DSR)',
    deletion_method: 'Penghapusan/anonimisasi kontak dan arsip pesan pada database tenant',
    security_measures: 'Verifikasi HMAC webhook, enkripsi AES-256-GCM signing secret, isolasi company_id, audit trail',
    owner_role: 'CRM Lead & Company Admin',
  },
  {
    id: 'ROPA-05',
    activity_name: 'Procurement & Pengelolaan Vendor / Pemasok',
    controller: 'Perusahaan Tenant (Pengendali)',
    dpo_contact: 'privacy@arsalynk.com',
    purpose: 'Registrasi pemasok, pembuatan Purchase Order (PO), verifikasi penerimaan barang/jasa, dan pembayaran vendor.',
    legal_basis: 'Pelaksanaan Kontrak Pengadaan & Kewajiban Hukum Perpajakan/Audit (UU PDP Pasal 20 & UU KUP)',
    data_subject_categories: 'PIC Vendor/Supplier, Pemilik Usaha Perorangan, Karyawan Bagian Pengadaan',
    personal_data_categories: 'Nama PIC vendor, email, nomor telepon, alamat usaha, NPWP, nomor rekening bank pembayaran',
    recipients: 'Tim Procurement, Finance, Operational Manager, Auditor Internal',
    cross_border_transfer: 'Tidak dilakukan (pemrosesan terisolasi pada server aplikasi & database perusahaan)',
    retention_period: '10 tahun untuk dokumen PO, faktur vendor, dan bukti pembayaran sesuai kewajiban retensi fiskal',
    deletion_method: 'Pengarsipan terkunci selama masa wajib pajak lalu penghapusan/penimpaan aman',
    security_measures: 'Kontrol akses modul PROCUREMENT, SoD persetujuan PO-pembayaran, enkripsi database at-rest',
    owner_role: 'Procurement & Finance Lead',
  },
  {
    id: 'ROPA-06',
    activity_name: 'Inventory, Gudang & Pengelolaan Aset Tetap (Custodian)',
    controller: 'Perusahaan Tenant (Pengendali)',
    dpo_contact: 'privacy@arsalynk.com',
    purpose: 'Pelacakan mutasi stok, transfer antar gudang, reservasi material proyek, serta pencatatan pemegang aset (custodian).',
    legal_basis: 'Pelaksanaan Perjanjian Kerja & Pengawasan Aset Perusahaan (UU PDP Pasal 20)',
    data_subject_categories: 'Karyawan Pemegang Aset (Custodian), Petugas Gudang, PIC Proyek',
    personal_data_categories: 'Nama karyawan custodian, ID pengguna, departemen, lokasi penugasan, riwayat serah terima aset',
    recipients: 'Tim Inventory/Gudang, Project Manager, Asset & Finance Controller',
    cross_border_transfer: 'Tidak dilakukan',
    retention_period: 'Selama aset aktif digunakan + 5 tahun setelah penghapusan buku (disposal) aset untuk audit',
    deletion_method: 'Anonimisasi identitas custodian pada catatan historis aset setelah masa retensi berakhir',
    security_measures: 'Kontrol akses modul INVENTORY/ASSETS, ledger mutasi idempoten, audit log serah terima',
    owner_role: 'Warehouse / Asset Lead & Company Admin',
  },
  {
    id: 'ROPA-07',
    activity_name: 'Pengelolaan Persetujuan (Consent Ledger) & Hak Subjek Data (DSR)',
    controller: 'PT Arsalynk Teknologi Indonesia',
    dpo_contact: 'privacy@arsalynk.com',
    purpose: 'Pencatatan bukti persetujuan UU PDP Pasal 20 serta pemenuhan permintaan akses, koreksi, salinan, dan penghapusan data (SLA 3×24 jam).',
    legal_basis: 'Pemenuhan Kewajiban Hukum Pengendali Data Pribadi (UU PDP Pasal 20, 21, 30-35 & PP 33/2026)',
    data_subject_categories: 'Seluruh Pengguna Platform, Admin Tenant, dan Pemohon Publik DSR',
    personal_data_categories: 'User ID, email pemohon, jenis/status persetujuan, versi & hash dokumen legal, IP address, user-agent, rincian tiket DSR',
    recipients: 'Data Protection Officer (DPO), Super Admin, Company Admin berwenang',
    cross_border_transfer: 'Tidak dilakukan',
    retention_period: '5 tahun sejak penutupan tiket DSR atau pencabutan persetujuan sebagai bukti kepatuhan hukum',
    deletion_method: 'Penghapusan aman atau anonimisasi permanen setelah masa pembuktian kepatuhan berakhir',
    security_measures: 'Append-only ledger dengan SHA-256 document hash, SLA tracking 72 jam, RBAC Admin/DPO, no-store headers',
    owner_role: 'Data Protection Officer (DPO)',
  },
];

// --- PUBLIC ENDPOINTS ---
publicGovernanceRouter.get('/public/status', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const readiness = await evaluateLaunchReadiness();
    res.json({
      success: true,
      website_status: readiness.website_state.status,
      legal_entity_name: readiness.website_state.legal_entity_name,
      contact_email: readiness.website_state.contact_email,
      tdpse_number: readiness.website_state.tdpse_number,
      canonical_domain: readiness.website_state.canonical_domain,
      active_documents: readiness.active_documents,
    });
  } catch (err) {
    next(err);
  }
});

publicGovernanceRouter.post('/public/consent', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await ensureGovernanceTables();
    const email = String(req.body.email || '').trim().toLowerCase();
    const consents = Array.isArray(req.body.consents) ? req.body.consents : [];
    if (!email || !consents.length) {
      throw new ValidationError('Email dan daftar persetujuan wajib diisi.');
    }
    const ip = String(req.ip || req.socket?.remoteAddress || '').slice(0, 128);
    const ua = String(req.headers['user-agent'] || '').slice(0, 255);
    const validItems = consents.filter((item: any) => String(item?.consent_type || '').trim());
    const recorded: string[] = [];
    await Promise.all(
      validItems.map((item: any) => {
        const id = crypto.randomUUID();
        recorded.push(id);
        return prisma.$executeRawUnsafe(
          `INSERT INTO "gov_consent_ledger" ("id", "user_id", "email", "consent_type", "document_version", "document_hash", "granted", "ip_address", "user_agent")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          id,
          item?.user_id ? String(item.user_id) : null,
          email,
          String(item.consent_type).trim().toUpperCase(),
          String(item?.document_version || '1.0').trim(),
          String(item?.document_hash || ''),
          Boolean(item?.granted),
          ip,
          ua,
        );
      }),
    );
    res.status(201).json({ success: true, recorded_ids: recorded });
  } catch (err) {
    next(err);
  }
});

publicGovernanceRouter.post('/public/dsr', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await ensureGovernanceTables();
    const requesterEmail = String(req.body.requester_email || '').trim().toLowerCase();
    const requestType = String(req.body.request_type || '').trim().toUpperCase();
    const description = String(req.body.description || '').trim();
    if (!requesterEmail || !requestType) {
      throw new ValidationError('Email pemohon dan jenis permintaan hak subjek data wajib diisi.');
    }
    const id = crypto.randomUUID();
    const ticketNumber = `DSR-${Date.now().toString().slice(-6)}`;
    const dueAt = new Date(Date.now() + 72 * 60 * 60 * 1000); // 3x24 jam continuous SLA
    await prisma.$executeRawUnsafe(
      `INSERT INTO "gov_dsr_request" ("id", "ticket_number", "requester_email", "request_type", "description", "status", "due_at")
       VALUES ($1, $2, $3, $4, $5, 'OPEN', $6)`,
      id,
      ticketNumber,
      requesterEmail,
      requestType,
      description,
      dueAt,
    );
    res.status(201).json({
      success: true,
      ticket_number: ticketNumber,
      due_at: dueAt.toISOString(),
      sla_hours: 72,
    });
  } catch (err) {
    next(err);
  }
});

// --- ADMIN GOVERNANCE ENDPOINTS ---
governanceRouter.get('/readiness', requireCompanyAdmin, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, ...(await evaluateLaunchReadiness()) });
  } catch (err) {
    next(err);
  }
});

governanceRouter.put('/website-state', requireSuperAdminForWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const readiness = await evaluateLaunchReadiness();
    const nextStatus = String(req.body.status || readiness.website_state.status).trim().toLowerCase();
    if (!(ALLOWED_WEBSITE_STATUSES as readonly string[]).includes(nextStatus)) {
      throw new ValidationError(`Status website tidak valid: ${nextStatus}`);
    }
    const nextEntityName = req.body.legal_entity_name !== undefined ? String(req.body.legal_entity_name).trim() : readiness.website_state.legal_entity_name;
    const nextContactEmail = req.body.contact_email !== undefined ? String(req.body.contact_email).trim() : readiness.website_state.contact_email;
    const nextTdpse = req.body.tdpse_number !== undefined ? String(req.body.tdpse_number).trim() : readiness.website_state.tdpse_number;

    await prisma.$executeRawUnsafe(
      `UPDATE "gov_website_state"
       SET "status" = $1, "legal_entity_name" = $2, "contact_email" = $3, "tdpse_number" = $4, "updated_by_id" = $5, "updated_at" = NOW()
       WHERE "id" = $6`,
      nextStatus === 'published' && (!nextEntityName || !nextContactEmail || !nextTdpse) ? readiness.website_state.status : nextStatus,
      nextEntityName,
      nextContactEmail,
      nextTdpse,
      req.user?.id ?? null,
      readiness.website_state.id,
    );

    const updatedReadiness = await evaluateLaunchReadiness();
    if (nextStatus === 'published' && !updatedReadiness.can_publish) {
      res.status(422).json({
        success: false,
        error_code: 'LAUNCH_GATE_BLOCKED',
        message: 'Website belum dapat dipublikasikan (published) karena masih ada syarat wajib yang belum terpenuhi.',
        blockers: updatedReadiness.blockers,
      });
      return;
    }
    res.json({ success: true, ...updatedReadiness });
  } catch (err) {
    next(err);
  }
});

governanceRouter.get('/ropa', requireCompanyAdmin, (_req: Request, res: Response) => {
  res.json({ success: true, records: ROPA_RECORDS });
});

governanceRouter.get('/consents', requireCompanyAdmin, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    await ensureGovernanceTables();
    const rows = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT * FROM "gov_consent_ledger" ORDER BY "created_at" DESC LIMIT 100`,
    );
    res.json({ success: true, results: rows });
  } catch (err) {
    next(err);
  }
});

governanceRouter.get('/dsr', requireCompanyAdmin, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    await ensureGovernanceTables();
    const rows = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT * FROM "gov_dsr_request" ORDER BY "due_at" ASC LIMIT 100`,
    );
    const now = Date.now();
    const enriched = rows.map((row) => {
      const dueMs = new Date(row.due_at).getTime();
      const hoursRemaining = Math.round(((dueMs - now) / (60 * 60 * 1000)) * 10) / 10;
      return {
        ...row,
        hours_remaining: hoursRemaining,
        sla_breached: row.status !== 'COMPLETED' && hoursRemaining < 0,
      };
    });
    res.json({ success: true, results: enriched });
  } catch (err) {
    next(err);
  }
});

governanceRouter.patch('/dsr/:id', requireCompanyAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await ensureGovernanceTables();
    const existing = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT * FROM "gov_dsr_request" WHERE "id" = $1 LIMIT 1`,
      req.params.id,
    );
    if (!existing.length) throw new NotFoundError('DSRRequest');
    const nextStatus = String(req.body.status || existing[0].status).trim().toUpperCase();
    const note = String(req.body.resolution_note ?? existing[0].resolution_note ?? '').trim();
    const resolvedAt = nextStatus === 'COMPLETED' ? new Date() : null;
    await prisma.$executeRawUnsafe(
      `UPDATE "gov_dsr_request" SET "status" = $1, "resolution_note" = $2, "resolved_at" = $3, "updated_at" = NOW() WHERE "id" = $4`,
      nextStatus,
      note,
      resolvedAt,
      req.params.id,
    );
    res.json({ success: true, id: req.params.id, status: nextStatus });
  } catch (err) {
    next(err);
  }
});

// --- AUTHENTICATED USER SELF-SERVICE DSR & CONSENT PORTAL ---
governanceRouter.get('/my/data-export', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await ensureGovernanceTables();
    const userId = String(req.user!.id);
    const userEmail = String(req.user!.email || '').trim().toLowerCase();

    const [profile, consents, dsrRequests] = await Promise.all([
      prisma.iam_user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          email: true,
          full_name: true,
          job_title: true,
          status: true,
          is_active: true,
          date_joined: true,
          last_login_at: true,
        },
      }),
      prisma.$queryRawUnsafe<Array<any>>(
        `SELECT "id", "consent_type", "document_version", "document_hash", "granted", "created_at"
         FROM "gov_consent_ledger"
         WHERE "user_id" = $1 OR ($2 <> '' AND LOWER("email") = $2)
         ORDER BY "created_at" DESC LIMIT 200`,
        userId,
        userEmail,
      ),
      prisma.$queryRawUnsafe<Array<any>>(
        `SELECT "id", "ticket_number", "request_type", "description", "status", "due_at", "resolution_note", "resolved_at", "created_at"
         FROM "gov_dsr_request"
         WHERE "user_id" = $1 OR ($2 <> '' AND LOWER("requester_email") = $2)
         ORDER BY "created_at" DESC LIMIT 100`,
        userId,
        userEmail,
      ),
    ]);

    res.json({
      success: true,
      exported_at: new Date().toISOString(),
      legal_basis: 'UU No. 27 Tahun 2022 (UU PDP) Pasal 5 & Pasal 13',
      profile,
      consents,
      dsr_requests: dsrRequests,
    });
  } catch (err) {
    next(err);
  }
});

governanceRouter.get('/my/consents', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await ensureGovernanceTables();
    const userId = String(req.user!.id);
    const userEmail = String(req.user!.email || '').trim().toLowerCase();
    const rows = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT "id", "consent_type", "document_version", "document_hash", "granted", "created_at"
       FROM "gov_consent_ledger"
       WHERE "user_id" = $1 OR ($2 <> '' AND LOWER("email") = $2)
       ORDER BY "created_at" DESC LIMIT 100`,
      userId,
      userEmail,
    );
    const latestMarketing = rows.find((r) => String(r.consent_type || '').toUpperCase() === 'MARKETING');
    res.json({
      success: true,
      marketing_granted: Boolean(latestMarketing?.granted),
      results: rows,
    });
  } catch (err) {
    next(err);
  }
});

governanceRouter.post('/my/consents/withdraw', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await ensureGovernanceTables();
    const userId = String(req.user!.id);
    const userEmail = String(req.user!.email || '').trim().toLowerCase();
    const consentType = String(req.body?.consent_type || 'MARKETING').trim().toUpperCase();
    if (consentType !== 'MARKETING') {
      throw new ValidationError('Hanya persetujuan opsional (MARKETING) yang dapat dicabut langsung tanpa menonaktifkan kontrak layanan.');
    }
    const id = crypto.randomUUID();
    const ip = String(req.ip || req.socket?.remoteAddress || '').slice(0, 128);
    const ua = String(req.headers['user-agent'] || '').slice(0, 255);
    await prisma.$executeRawUnsafe(
      `INSERT INTO "gov_consent_ledger" ("id", "user_id", "email", "consent_type", "document_version", "document_hash", "granted", "ip_address", "user_agent")
       VALUES ($1, $2, $3, $4, '1.0', '', false, $5, $6)`,
      id,
      userId,
      userEmail,
      consentType,
      ip,
      ua,
    );
    res.status(201).json({ success: true, id, consent_type: consentType, granted: false });
  } catch (err) {
    next(err);
  }
});

governanceRouter.get('/my/dsr', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await ensureGovernanceTables();
    const userId = String(req.user!.id);
    const userEmail = String(req.user!.email || '').trim().toLowerCase();
    const rows = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT * FROM "gov_dsr_request"
       WHERE "user_id" = $1 OR ($2 <> '' AND LOWER("requester_email") = $2)
       ORDER BY "created_at" DESC LIMIT 50`,
      userId,
      userEmail,
    );
    const now = Date.now();
    const enriched = rows.map((row) => {
      const dueMs = new Date(row.due_at).getTime();
      const hoursRemaining = Math.round(((dueMs - now) / (60 * 60 * 1000)) * 10) / 10;
      return {
        ...row,
        hours_remaining: hoursRemaining,
        sla_breached: row.status !== 'COMPLETED' && hoursRemaining < 0,
      };
    });
    res.json({ success: true, results: enriched });
  } catch (err) {
    next(err);
  }
});
