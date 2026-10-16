import crypto from 'node:crypto';
import prisma from '../../../../config/database';
import type { ProcedureTopic, ProcedureOperation } from '../../../marbot/brain/reasoning/intent';
import type { ProcedureRule, HelpContext } from '../../../marbot/knowledge/schemas/procedure.schema';
import type { ModuleKnowledge } from '../../../marbot/knowledge/schemas/module.schema';
import { findProcedureRule, allModules } from '../../../marbot/knowledge/knowledge.registry';
import { checkAbstention, type AbstentionResult } from './abstention-guard';

interface ActiveSnapshotCache {
  snapshot: {
    id: string;
    version_number: string;
    commit_sha: string;
    published_at: Date | null;
  } | null;
  cachedAt: number;
}

interface ActiveEntriesCache {
  snapshotId: string;
  entries: any[];
  cachedAt: number;
}

let snapshotCache: ActiveSnapshotCache | null = null;
let entriesCache: ActiveEntriesCache | null = null;
const queryCache = new Map<string, { result: any[]; cachedAt: number }>();
const CACHE_TTL_MS = 30_000;
const QUERY_CACHE_TTL_MS = 60_000;

export class RetrievalGatewayService {
  /**
   * Retrieves the currently published active knowledge snapshot from DB or cache.
   */
  static async getActiveSnapshot() {
    const now = Date.now();
    if (snapshotCache && now - snapshotCache.cachedAt < CACHE_TTL_MS) {
      return snapshotCache.snapshot;
    }

    try {
      const active = await (prisma as any).marbot_knowledge_snapshot.findFirst({
        where: { status: 'ACTIVE' },
        orderBy: { published_at: 'desc' },
        select: {
          id: true,
          version_number: true,
          commit_sha: true,
          published_at: true,
        },
      });
      snapshotCache = { snapshot: active ?? null, cachedAt: now };
      return snapshotCache.snapshot;
    } catch {
      // Fallback if table does not exist or database is offline
      snapshotCache = { snapshot: null, cachedAt: now };
      return null;
    }
  }

  /**
   * Invalidate the in-memory active snapshot cache (e.g. after publishing a new snapshot).
   */
  static invalidateCache() {
    snapshotCache = null;
    entriesCache = null;
    queryCache.clear();
  }

  /**
   * Resolves the authoritative ProcedureRule for a given topic and operation.
   * Checks the dynamic DB snapshot first; if not found, falls back to the baseline verified catalogue.
   */
  static async resolveProcedureRule(
    topic: ProcedureTopic,
    operation?: ProcedureOperation
  ): Promise<ProcedureRule | undefined> {
    const activeSnapshot = await this.getActiveSnapshot();

    if (activeSnapshot) {
      try {
        const entry = await (prisma as any).marbot_knowledge_entry.findFirst({
          where: {
            snapshot_id: activeSnapshot.id,
            topic,
            ...(operation ? { operation } : {}),
            lifecycle_status: { in: ['ACTIVE', 'QUARANTINED', 'RETIRED'] },
          },
        });

        if (entry) {
          const content = JSON.parse(entry.content_json || '{}');
          const actorPolicy = entry.actor_policy_json ? JSON.parse(entry.actor_policy_json) : undefined;
          const provenance = entry.provenance_json ? JSON.parse(entry.provenance_json) : undefined;

          return {
            id: entry.feature_id,
            topic: entry.topic as ProcedureTopic,
            operation: entry.operation as ProcedureOperation | undefined,
            title: entry.title,
            targetPath: entry.navigation_json ? JSON.parse(entry.navigation_json)?.targetPath : undefined,
            version: activeSnapshot.version_number,
            lifecycleStatus: entry.lifecycle_status as any,
            comparisonStatus: entry.comparison_status as any,
            sourcePriority: entry.source_priority as any,
            authorization: actorPolicy,
            provenance: {
              snapshotId: activeSnapshot.id,
              commitSha: activeSnapshot.commit_sha,
              verifiedAt: activeSnapshot.published_at?.toISOString() ?? new Date().toISOString(),
              astNodeHashes: provenance?.astNodeHashes ?? [],
              sourceFiles: provenance?.sourceFiles ?? [],
              sourcePriority: entry.source_priority as any,
              sourceType: provenance?.sourceType ?? 'BACKEND_ROUTE',
            },
            content: {
              summary: content.summary,
              steps: content.steps,
              importantNotes: content.importantNotes,
              body: content.body,
            },
          };
        }
      } catch {
        // Fallback to static baseline on DB query error
      }
    }

    // Baseline fallback
    return findProcedureRule(topic, operation);
  }

  static lastTelemetry?: {
    usedProvider: 'openrouter' | 'deterministic_fallback';
    model?: string;
    systemPrompt?: string;
    userPrompt?: string;
    factsCount: number;
  };

  static readonly PROTECTED_BASE_ROOTS = new Set([
    'kota', 'kopi', 'kaki', 'peta', 'pasar', 'beli', 'kerja', 'uang', 'data',
    'user', 'role', 'lead', 'deal', 'task', 'form', 'bank', 'kas', 'item',
    'menu', 'page', 'pos', 'core', 'crm', 'tax', 'view', 'list', 'cost',
    'file', 'mode', 'part', 'path', 'feed', 'chat', 'link', 'team', 'auth',
    'transaksi', 'informasi', 'notifikasi', 'integrasi', 'posisi', 'resolusi',
    'komunikasi', 'konfigurasi', 'kategori', 'distribusi', 'fungsi', 'aplikasi',
    'validasi', 'produksi', 'kwitansi', 'administrasi', 'organisasi', 'aktivitas',
    'restitusi', 'subsidi', 'komisi', 'asuransi', 'garansi', 'mutasi', 'revisi',
    'bukti', 'ganti', 'rugi', 'pasti', 'asli', 'resmi'
  ]);

  static readonly COLLOQUIAL_SLANG_MAP: Record<string, string> = {
    gimana: 'bagaimana',
    ngeliat: 'lihat',
    nyari: 'cari',
    ngatur: 'kelola',
    ngapus: 'hapus',
    bikin: 'buat',
    udah: 'sudah',
    nggak: 'tidak',
    ga: 'tidak',
    gak: 'tidak',
    pake: 'pakai',
    inbok: 'inbox',
    custmer: 'customer',
    transksi: 'transaksi',
    piutng: 'piutang',
    kwitansi: 'kwitansi',
  };

  /**
   * Morphological stemmer for Indonesian words that strips common prefixes and suffixes,
   * including nasalization assimilation rules (meng/peng->k, meny/peny->s, men/pen->t, mem/pem->p),
   * while protecting base roots and normalizing colloquial slang/typos.
   */
  static stemIndonesian(word: string): string {
    let w = word.toLowerCase().trim();
    if (this.COLLOQUIAL_SLANG_MAP[w]) {
      w = this.COLLOQUIAL_SLANG_MAP[w];
    }
    if (this.PROTECTED_BASE_ROOTS.has(w) || w.length <= 4) {
      return w;
    }

    // Nasalization assimilation rules:
    if (/^(?:meng|peng)[aeiou]/.test(w)) {
      w = 'k' + w.slice(4);
    } else if (/^(?:meny|peny)[aeiou]/.test(w)) {
      w = 's' + w.slice(4);
    } else if (/^(?:men|pen)[aeiou]/.test(w)) {
      w = 't' + w.slice(3);
    } else if (/^(?:mem|pem)[aeiou]/.test(w)) {
      w = 'p' + w.slice(3);
    } else {
      // Standard prefixes
      w = w.replace(/^(?:meng|meny|men|mem|me|peng|peny|pen|pem|per|pe|di|ter|ber|ke)/, '');
    }

    // Check protected roots again after prefix strip (e.g. mengelola -> kelola)
    if (this.PROTECTED_BASE_ROOTS.has(w) || w.length <= 4) {
      return w;
    }

    // Suffixes: -kan, -an, -nya
    w = w.replace(/(?:kan|an|nya)$/, '');

    // Suffix -i: NEVER strip if ending in -si, -ti, -ri, -gi, -ki, -li, -mi, -ni, -bi, -di, -pi, or loanword
    if (!/(?:[stgbkldmnp]i)$/.test(w)) {
      w = w.replace(/i$/, '');
    }

    return w.length >= 3 ? w : word.toLowerCase().trim();
  }

  /**
   * Tokenizes text and code identifiers (camelCase, snake_case, kebab-case, dots).
   */
  static tokenizeIdentifiers(str: string): string[] {
    return str
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[^a-zA-Z0-9]/g, ' ')
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2);
  }

  static readonly DYNAMIC_ROOT_CONCEPTS: Record<string, string[]> = {
    lihat: ['lihat', 'view', 'buka', 'open', 'tampil', 'show', 'browse', 'list'],
    kelola: ['kelola', 'manage', 'atur', 'admin', 'operation', 'crud', 'edit'],
    bayar: ['bayar', 'pay', 'payment', 'kas', 'bank', 'cashbank', 'disbursement'],
    tagih: ['tagih', 'invoice', 'billing', 'piutang', 'ar', 'termin', 'receivable'],
    beli: ['beli', 'procure', 'purchase', 'po', 'procurement', 'vendor', 'supplier'],
    jual: ['jual', 'sales', 'deals', 'leads', 'order', 'quotation', 'contract'],
    tanya: ['tanya', 'inquiry', 'inbox', 'lead', 'client', 'contact', 'pelanggan', 'customer'],
    dana: ['dana', 'fund', 'funding', 'costing', 'wip', 'biaya', 'pengeluaran', 'expense', 'cost'],
    tugas: ['tugas', 'task', 'tasks', 'daily', 'weekly', 'pekerjaan', 'milestone', 'proyek', 'project'],
    tabel: ['tabel', 'table', 'schema', 'model', 'database', 'kolom', 'prisma'],
    setuju: ['setuju', 'approve', 'approval', 'verifikasi', 'verify'],
    aset: ['aset', 'asset', 'fixed_asset', 'depresiasi', 'depreciation', 'penyusutan'],
    pajak: ['pajak', 'tax', 'ppn', 'pph', 'faktur'],
    lapor: ['lapor', 'report', 'reporting', 'pnl', 'gl', 'financial', 'statement'],
  };



  /**
   * Evaluates operational access policy for a knowledge entry matching the exact
   * authorization checks used by the backend application:
   * 1. Multi-tenant & Company scope validation (Hard isolation: NO role, including SUPER_ADMIN or DIRECTOR, can bypass)
   * 2. Blocked read modules enforcement (blockedReadModules)
   * 3. Module enablement (enabledModules)
   * 4. Privileged access for internal database schema models (SUPER_ADMIN, COMPANY_ADMIN, TECHNICAL_ADMIN, DIRECTOR)
   * 5. Fail-closed default-deny for sensitive domains (FINANCE, CRM, HR, PROCUREMENT, PAYROLL, ACCOUNTING):
   *    Missing/corrupt metadata is quarantined/denied. Valid metadata requires user to satisfy explicit policy.
   * 6. Granular operational permissions (permissions) e.g. VIEW_FINANCE, VIEW_CRM, READ_TASK, READ_PROJECT
   * 7. Actor policy role alignment (allowedRoles)
   * 8. Project scope boundaries (projectScope)
   */
  static validateEntryAuthorization(
    entry: {
      feature_id?: string;
      module_code: string;
      knowledge_category?: string;
      actor_policy_json?: string;
      actorPolicy?: any;
    },
    scope: {
      roleCode?: string;
      enabledModules: string[];
      permissions?: string[];
      blockedReadModules?: string[];
      projectScope?: { mode: 'ALL' | 'LIST'; projectIds: string[] };
      tenantId?: string;
      companyId?: string;
    }
  ): boolean {
    const modUpper = (entry.module_code || '').toUpperCase();

    // Parse actor policy
    let policy: any = entry.actorPolicy;
    if (!policy && entry.actor_policy_json) {
      try {
        policy = JSON.parse(entry.actor_policy_json);
      } catch {
        policy = undefined;
      }
    }

    // 1. Strict Multi-Tenant & Company Scope (Hard Physical Barrier)
    // NO role, including SUPER_ADMIN or DIRECTOR, can cross tenant/company boundaries.
    const entryTenantId = policy?.tenantId || (entry as any).tenant_id;
    const entryCompanyId = policy?.companyId || (entry as any).company_id;

    if (entryTenantId && (!scope.tenantId || entryTenantId !== scope.tenantId)) {
      return false;
    }
    if (entryCompanyId && (!scope.companyId || entryCompanyId !== scope.companyId)) {
      return false;
    }

    // 2. Blocked read modules (hard deny)
    if (scope.blockedReadModules && scope.blockedReadModules.map((m) => m.toUpperCase()).includes(modUpper)) {
      return false;
    }

    // 3. Module enablement check (must be in enabledModules or CORE/GENERAL)
    const allowedModules = [...(scope.enabledModules || []), 'GENERAL', 'CORE'].map((m) => m.toUpperCase());
    if (!allowedModules.includes(modUpper)) {
      return false;
    }

    const userRole = scope.roleCode ? scope.roleCode.toUpperCase() : undefined;
    const isSuperOrDirector = userRole ? ['SUPER_ADMIN', 'COMPANY_ADMIN', 'DIRECTOR'].includes(userRole) : false;

    // 4. Technical database schema models require privileged technical/director role
    const isSchema = (entry.feature_id || '').startsWith('schema.model.') || entry.knowledge_category === 'SCHEMA_MODEL';
    if (isSchema) {
      if (!userRole) return false;
      const isPrivileged = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'TECHNICAL_ADMIN', 'DIRECTOR'].includes(userRole);
      if (!isPrivileged) return false;
    }

    const userPermissions = (scope.permissions || []).map((p) => p.toUpperCase());
    const hasManageAll = userPermissions.includes('MANAGE_ALL');

    // 5. Fail-Closed Default-Deny on Missing/Incomplete Metadata for Sensitive Business Domains
    // Missing metadata on sensitive business modules must result in denial/quarantine for ALL users.
    // When metadata is present, user must actually satisfy the explicit policy (credentials match).
    const SENSITIVE_BUSINESS_DOMAINS = ['FINANCE', 'CRM', 'HR', 'PROCUREMENT', 'PAYROLL', 'ACCOUNTING'];
    const isSensitive = SENSITIVE_BUSINESS_DOMAINS.includes(modUpper);

    if (isSensitive) {
      const hasMetadata = policy && (
        (Array.isArray(policy.allowedRoles) && policy.allowedRoles.length > 0) ||
        (Array.isArray(policy.requiredPermissions) && policy.requiredPermissions.length > 0) ||
        (policy.backendPolicy && Object.keys(policy.backendPolicy).length > 0)
      );

      // Missing or unverified metadata -> Quarantine / Fail-closed for all roles
      if (!hasMetadata) {
        return false;
      }

      // Credential satisfaction check: User must actively satisfy either the allowedRoles or requiredPermissions
      const hasReqPerms = Array.isArray(policy.requiredPermissions) && policy.requiredPermissions.length > 0;
      const hasAllowedRoles = Array.isArray(policy.allowedRoles) && policy.allowedRoles.length > 0;

      const satisfiesPerm = hasReqPerms
        ? policy.requiredPermissions.some((req: string) => userPermissions.includes(req.toUpperCase()))
        : false;

      const satisfiesRole = hasAllowedRoles && userRole
        ? policy.allowedRoles.map((r: string) => r.toUpperCase()).includes(userRole)
        : false;

      if (hasReqPerms && hasAllowedRoles) {
        if (!satisfiesPerm && !satisfiesRole && !hasManageAll) return false;
      } else if (hasReqPerms) {
        if (!satisfiesPerm && !hasManageAll) return false;
      } else if (hasAllowedRoles) {
        if (!satisfiesRole && !hasManageAll) return false;
      }
    }

    // 6. Granular operational permission enforcement (for non-sensitive modules with explicit policy)
    if (!isSensitive && policy?.requiredPermissions && Array.isArray(policy.requiredPermissions) && policy.requiredPermissions.length > 0) {
      if (!hasManageAll && !isSuperOrDirector) {
        const hasReqPerm = policy.requiredPermissions.some((req: string) => userPermissions.includes(req.toUpperCase()));
        if (!hasReqPerm) return false;
      }
    }

    // 7. Check domain-level operational permissions if user has permissions defined
    if (scope.permissions && scope.permissions.length > 0 && !hasManageAll && !isSuperOrDirector) {
      if (modUpper === 'FINANCE') {
        const hasFin = userPermissions.some((p) =>
          ['VIEW_FINANCE', 'READ_COMPANY_FINANCE', 'READ_PROJECT_FINANCE', 'MANAGE_FINANCE'].includes(p)
        );
        if (!hasFin) return false;
      } else if (modUpper === 'CRM') {
        const hasCrm = userPermissions.some((p) =>
          ['VIEW_CRM', 'READ_CRM_DEALS', 'READ_TICKET', 'MANAGE_CRM'].includes(p)
        );
        if (!hasCrm) return false;
      } else if (modUpper === 'PROJECTS') {
        const hasProj = userPermissions.some((p) =>
          ['READ_PROJECT', 'READ_TASK', 'MANAGE_PROJECT'].includes(p)
        );
        if (!hasProj) return false;
      }
    }

    // 8. Role-based actor policy check (for non-sensitive modules)
    if (!isSensitive && policy?.allowedRoles && Array.isArray(policy.allowedRoles) && policy.allowedRoles.length > 0) {
      if (!userRole) return false;
      if (!isSuperOrDirector) {
        const roleAllowed = policy.allowedRoles.some((r: string) => r.toUpperCase() === userRole);
        if (!roleAllowed) return false;
      }
    }

    // 9. Project Scope boundary
    if (scope.projectScope && scope.projectScope.mode === 'LIST') {
      const allowedProjects = scope.projectScope.projectIds || [];
      const entryProjectId = policy?.projectId || policy?.project_id;
      if (entryProjectId && !allowedProjects.includes(entryProjectId)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Constructs a deterministic, canonical cryptographic cache key incorporating:
   * 1. Schema version
   * 2. Active Snapshot ID / version (to automatically bust cache on new crawl/promotion)
   * 3. Tenant ID & Company ID
   * 4. User Role (canonicalized)
   * 5. Granular permissions (deduplicated & lexicographically sorted)
   * 6. Blocked read modules (deduplicated & lexicographically sorted)
   * 7. Project scope (mode + sorted project IDs)
   * 8. Canonical query string (normalized whitespace & casing)
   *
   * Uses SHA-256 to guarantee consistent 64-char key length, mathematical collision resistance,
   * and complete isolation across tenants, companies, and roles.
   */
  static buildScopedCacheKey(
    query: string,
    scope: {
      tenantId?: string;
      companyId?: string;
      userId?: string;
      roleCode?: string;
      permissions?: string[];
      blockedReadModules?: string[];
      projectScope?: { mode: 'ALL' | 'LIST'; projectIds: string[] };
    },
    snapshotId?: string
  ): string {
    const canonicalContext = {
      v: 2,
      snap: snapshotId || 'active',
      tid: (scope.tenantId || 'none').trim().toLowerCase(),
      cid: (scope.companyId || 'none').trim().toLowerCase(),
      role: (scope.roleCode || 'USER').trim().toUpperCase(),
      perms: Array.from(new Set((scope.permissions || []).map((p) => p.trim().toUpperCase()))).sort(),
      blocked: Array.from(new Set((scope.blockedReadModules || []).map((m) => m.trim().toUpperCase()))).sort(),
      proj: scope.projectScope
        ? {
            mode: scope.projectScope.mode,
            ids: Array.from(new Set((scope.projectScope.projectIds || []).map((id) => id.trim()))).sort(),
          }
        : { mode: 'ALL', ids: [] },
      q: query.toLowerCase().replace(/\s+/g, ' ').trim(),
    };

    const hash = crypto
      .createHash('sha256')
      .update(JSON.stringify(canonicalContext))
      .digest('hex');

    return `mkie:cache:v2:${hash}`;
  }

  /**
   * Searches relevant active MKIE knowledge entries using dynamic concept normalization,
   * morphological stemming, category boosts, and fine-grained operational access policy.
   */
  static async searchRelevantKnowledge(
    query: string,
    scope: {
      roleCode?: string;
      enabledModules: string[];
      permissions?: string[];
      blockedReadModules?: string[];
      projectScope?: { mode: 'ALL' | 'LIST'; projectIds: string[] };
      tenantId?: string;
      companyId?: string;
    }
  ): Promise<
    Array<{
      feature_id: string;
      title: string;
      module_code: string;
      knowledge_category?: string;
      summary: string;
      steps?: string[];
      targetPath?: string;
      provenance: string;
      actorPolicy?: any;
    }>
  > {
    const activeSnapshot = await this.getActiveSnapshot();
    if (!activeSnapshot) return [];

    const cacheKey = this.buildScopedCacheKey(query, scope, activeSnapshot.id);
    const cachedQuery = queryCache.get(cacheKey);
    if (cachedQuery && Date.now() - cachedQuery.cachedAt < QUERY_CACHE_TTL_MS) {
      // Re-verify authorization defense-in-depth on every single request
      // Guarantees that mid-session permission revocations or tenant boundaries are enforced immediately
      const verifiedResults = cachedQuery.result.filter((e) =>
        this.validateEntryAuthorization(e, scope)
      );
      return verifiedResults;
    }

    try {
      const normalizedQuery = query.toLowerCase().replace(/[?.,!]/g, '').trim();
      const rawTerms = normalizedQuery.split(/\s+/).filter((t) => t.length > 2);
      if (!rawTerms.length) return [];

      const ERP_SYNONYM_MAP: Record<string, string[]> = {
        pelanggan: ['customer', 'inbox', 'lead', 'contact', 'crm', 'deals', 'klien'],
        customer: ['pelanggan', 'inbox', 'lead', 'client', 'contact'],
        sales: ['penjualan', 'deals', 'leads', 'inquiry', 'crm', 'order'],
        penjualan: ['sales', 'deals', 'order', 'quotation', 'contracts'],
        inbox: ['customer', 'pesan', 'chat', 'incoming', 'inquiry', 'whatsapp'],
        tagihan: ['invoice', 'billing', 'piutang', 'ar', 'termin'],
        invoice: ['tagihan', 'billing', 'piutang', 'ar'],
        billing: ['tagihan', 'invoice', 'termin'],
        piutang: ['ar', 'receivable', 'tagihan', 'invoice'],
        hutang: ['ap', 'payable', 'vendor', 'tagihan'],
        vendor: ['supplier', 'pemasok', 'ap', 'tagihan'],
        pembayaran: ['payment', 'kas', 'bank', 'cashbank'],
        kas: ['cash', 'bank', 'cashbank', 'pembayaran'],
        bank: ['banking', 'reconciliation', 'rekonsiliasi', 'cashbank'],
        pajak: ['tax', 'ppn', 'pph', 'faktur'],
        tax: ['pajak', 'ppn', 'pph', 'faktur'],
        aset: ['asset', 'fixed_asset', 'penyusutan', 'depresiasi', 'aktiva'],
        asset: ['aset', 'fixed_asset', 'depreciation', 'penyusutan'],
        penyusutan: ['depreciation', 'depresiasi', 'aset', 'schedule'],
        dana: ['funding', 'fundings', 'costing', 'wip', 'biaya'],
        funding: ['dana', 'pengajuan', 'costing', 'project'],
        biaya: ['cost', 'costing', 'expense', 'pengeluaran'],
        tugas: ['task', 'tasks', 'daily', 'weekly', 'pekerjaan'],
        task: ['tugas', 'daily', 'weekly', 'main_task'],
        proyek: ['project', 'projects', 'milestone', 'pekerjaan'],
        project: ['proyek', 'projects', 'active', 'completed'],
        tiket: ['ticket', 'tickets', 'case', 'support', 'garansi'],
        support: ['tiket', 'service', 'garansi', 'case'],
        notulensi: ['minutes', 'catatan', 'meeting', 'rapat'],
        meeting: ['notulensi', 'rapat', 'agenda'],
        cuti: ['leave', 'timeoff', 'izin'],
        persetujuan: ['approval', 'approve', 'verifikasi'],
        laporan: ['report', 'reporting', 'pnl', 'gl', 'financial'],
        jurnal: ['journal', 'journal-entries', 'gl', 'buku besar', 'ledger'],
        journal: ['jurnal', 'journal-entries', 'gl', 'ledger'],
        neraca: ['balance', 'trial-balance', 'balance-sheet', 'saldo'],
        saldo: ['balance', 'trial-balance', 'neraca'],
        laba: ['profit', 'pnl', 'loss', 'profit-and-loss'],
        rugi: ['loss', 'pnl', 'profit', 'profit-and-loss'],
        skema: ['schema', 'model', 'tabel', 'database', 'kolom'],
        tabel: ['table', 'model', 'schema', 'database', 'prisma'],
      };

      const STOPWORDS = new Set([
        'bagaimana', 'cara', 'panduan', 'buka', 'lihat', 'view', 'menu', 'tab', 'halaman', 'dimana', 'di mana',
        'how', 'dan', 'atau', 'ini', 'itu', 'pada', 'untuk', 'dengan', 'dari', 'ke', 'di', 'yang', 'apa', 'apakah',
        'saya', 'kami', 'kita', 'kamu', 'anda', 'bulan', 'tahun', 'hari', 'perusahaan', 'tolong', 'mohon',
        'bisa', 'dapat', 'ada', 'rincian', 'daftar'
      ]);

      const substantiveTerms = rawTerms.filter((t) => !STOPWORDS.has(t));

      const queryStems = new Set<string>();
      const expandedTerms = new Set<string>(rawTerms);

      for (const term of rawTerms) {
        const stem = this.stemIndonesian(term);
        if (stem.length > 2) {
          queryStems.add(stem);
          expandedTerms.add(stem);
        }

        // Dynamic concept expansion
        for (const [conceptKey, conceptWords] of Object.entries(this.DYNAMIC_ROOT_CONCEPTS)) {
          if (
            conceptWords.includes(term) ||
            conceptWords.includes(stem) ||
            term.includes(conceptKey) ||
            stem.includes(conceptKey)
          ) {
            for (const cw of conceptWords) expandedTerms.add(cw);
          }
        }

        // Fallback synonym expansion
        const syns = ERP_SYNONYM_MAP[term] || (stem !== term ? ERP_SYNONYM_MAP[stem] : undefined);
        if (syns) {
          for (const s of syns) expandedTerms.add(s);
        }
      }

      const isSchemaQuery = /\b(?:tabel|table|skema|schema|database|model|kolom|prisma)\b/i.test(normalizedQuery);

      let allEntries: any[] = [];
      const now = Date.now();
      if (entriesCache && entriesCache.snapshotId === activeSnapshot.id && (now - entriesCache.cachedAt < CACHE_TTL_MS)) {
        allEntries = entriesCache.entries;
      } else {
        allEntries = await (prisma as any).marbot_knowledge_entry.findMany({
          where: {
            snapshot_id: activeSnapshot.id,
            lifecycle_status: 'ACTIVE',
          },
          select: {
            feature_id: true,
            module_code: true,
            title: true,
            topic: true,
            knowledge_category: true,
            content_json: true,
            navigation_json: true,
            provenance_json: true,
            actor_policy_json: true,
          },
        });
        entriesCache = {
          snapshotId: activeSnapshot.id,
          entries: allEntries,
          cachedAt: now,
        };
      }

      // Strict operational access authorization
      const allowedModules = [...(scope.enabledModules || []), 'GENERAL', 'CORE'].map((m) => m.toUpperCase());
      const roleAuthorizedEntries = allEntries
        .filter((e: any) => allowedModules.includes((e.module_code || '').toUpperCase()))
        .filter((e: any) => this.validateEntryAuthorization(e, scope));

      const scored = roleAuthorizedEntries
        .map((e: any) => {
          const titleLower = (e.title || '').toLowerCase();
          const topicLower = (e.topic || '').toLowerCase();
          const featureLower = (e.feature_id || '').toLowerCase();
          const contentStr = (e.content_json || '').toLowerCase();
          let score = 0;
          let substantiveMatches = 0;

          // 1. Exact query or phrase match bonus
          if (titleLower.includes(normalizedQuery)) {
            score += 35;
            substantiveMatches += 2;
          }
          if (contentStr.includes(normalizedQuery)) {
            score += 15;
            substantiveMatches += 1;
          }

          // 2. Direct term match
          for (const term of rawTerms) {
            const isSubstantive = substantiveTerms.includes(term);
            const weight = isSubstantive ? 1 : 0.2;
            let matched = false;

            if (titleLower.includes(term)) { score += Math.round(8 * weight); matched = true; }
            if (topicLower.includes(term)) { score += Math.round(6 * weight); matched = true; }
            if (featureLower.includes(term)) { score += Math.round(5 * weight); matched = true; }
            if (contentStr.includes(term)) { score += Math.round(3 * weight); matched = true; }

            if (matched && isSubstantive) substantiveMatches++;
          }

          // 3. Dynamic concept & stem match
          const entryTokens = this.tokenizeIdentifiers(`${e.title} ${e.topic} ${e.feature_id}`);
          for (const qStem of queryStems) {
            const isSubstantiveStem = !STOPWORDS.has(qStem);
            for (const eTok of entryTokens) {
              const eStem = this.stemIndonesian(eTok);
              if (eStem === qStem || eTok === qStem) {
                score += isSubstantiveStem ? 8 : 2;
                if (isSubstantiveStem) substantiveMatches++;
              }
            }
          }

          for (const exp of expandedTerms) {
            const isSubstantiveExp = !STOPWORDS.has(exp);
            if (!isSubstantiveExp) continue;
            let expMatched = false;
            if (titleLower.includes(exp)) { score += 5; expMatched = true; }
            if (topicLower.includes(exp)) { score += 4; expMatched = true; }
            if (featureLower.includes(exp)) { score += 3; expMatched = true; }
            if (contentStr.includes(exp)) { score += 2; expMatched = true; }
            if (expMatched) substantiveMatches++;
          }

          // Strict topic grounding: If the query contains substantive terms (e.g. jurnal, neraca, inbox),
          // an entry MUST match at least one substantive term to be considered relevant.
          if (substantiveTerms.length > 0 && substantiveMatches === 0) {
            return { entry: e, score: 0 };
          }

          // 4. Category-based boosts
          const isUserGuidanceQuery = /\b(how|cara|bagaimana|panduan|buka|lihat|view|menu|tab|halaman|dimana|di mana)\b/i.test(normalizedQuery);
          if (isUserGuidanceQuery) {
            if (e.feature_id.startsWith('frontend.tab.')) score += 35;
            if (e.feature_id.startsWith('frontend.view.')) score += 20;
            if (e.knowledge_category === 'USER_PROCEDURE') score += 15;
          } else {
            if (e.feature_id.startsWith('frontend.tab.')) score += 15;
            if (e.feature_id.startsWith('frontend.view.')) score += 8;
          }
          if (isSchemaQuery && e.feature_id.startsWith('schema.model.')) score += 30;

          return { entry: e, score };
        })
        .filter((item: { entry: any; score: number }) => item.score >= 10);

      scored.sort((a: { score: number }, b: { score: number }) => b.score - a.score);

      const finalResult = scored.slice(0, 4).map(({ entry: e }: { entry: any; score: number }) => {
        const content = JSON.parse(e.content_json || '{}');
        const navigation = e.navigation_json ? JSON.parse(e.navigation_json) : {};
        const actorPolicy = e.actor_policy_json ? JSON.parse(e.actor_policy_json) : undefined;
        return {
          feature_id: e.feature_id,
          title: e.title,
          module_code: e.module_code,
          knowledge_category: e.knowledge_category,
          summary: content.summary || '',
          steps: content.steps,
          targetPath: navigation.targetPath,
          provenance: `ERP:mkie:${e.module_code}:${e.topic}:v${activeSnapshot.version_number}`,
          actorPolicy,
        };
      });

      queryCache.set(cacheKey, { result: finalResult, cachedAt: Date.now() });
      return finalResult;
    } catch {
      return [];
    }
  }

  /**
   * Synthesizes an authoritative answer grounded in retrieved MKIE facts.
   * Utilizes OpenRouter LLM when available, falling back gracefully to deterministic synthesis.
   */
  static async generateGroundedAnswer(
    query: string,
    entries: Array<{
      feature_id: string;
      title: string;
      module_code: string;
      knowledge_category?: string;
      summary: string;
      steps?: string[];
      targetPath?: string;
      provenance: string;
      actorPolicy?: any;
    }>,
    scope: {
      roleCode?: string;
      enabledModules: string[];
      permissions?: string[];
      blockedReadModules?: string[];
      projectScope?: { mode: 'ALL' | 'LIST'; projectIds: string[] };
      tenantId?: string;
      companyId?: string;
    }
  ): Promise<string> {
    // Defense-in-depth: Ensure NO unauthorized facts leak through cache/fallback/direct entry injection
    const authorizedEntries = entries.filter((e) => this.validateEntryAuthorization(e, scope));

    if (!authorizedEntries.length) {
      this.lastTelemetry = {
        usedProvider: 'deterministic_fallback',
        factsCount: 0,
      };
      return 'Referensi fitur atau data teknis tersebut tidak ditemukan dalam bukti kode sistem terverifikasi saat ini. Saya belum memiliki bukti kode yang cukup untuk menjawab pertanyaan ini secara akurat.';
    }

    // Check OpenRouter LLM availability from environment
    const apiKey = process.env.MARBOT_AI_API_KEY;
    const model = process.env.MARBOT_AI_MODEL;

    const systemPrompt = `Anda adalah Marka Plus, asisten cerdas untuk sistem Arsalynt ERP.
Tugas Anda adalah menjawab pertanyaan pengguna secara ringkas, akurat, dan ramah dalam Bahasa Indonesia berdasarkan HANYA bukti kode (Code Evidence) yang disediakan.

ATURAN GROUNDING KETAT:
1. Jawab HANYA berdasarkan Fakta Kode Terverifikasi yang diberikan. JANGAN berhalusinasi atau mengarang logika bisnis baru.
2. Jika rute atau path navigasi tersedia, sertakan link markdown [Buka ...] untuk mempermudah pengguna.
3. Bila ada detail teknis atau formula khusus yang tidak disebutkan dalam bukti kode, nyatakan dengan jujur bahwa hal tersebut belum tercatat pada bukti kode sistem saat ini.
4. Anda HANYA memberikan bantuan pengetahuan dan panduan sistem. JANGAN mengeksekusi mutasi atau merencanakan perubahan data operasional.`;

    const factsPayload = authorizedEntries.map((e) => ({
      title: e.title,
      module: e.module_code,
      category: e.knowledge_category || 'USER_PROCEDURE',
      summary: e.summary,
      steps: e.steps,
      path: e.targetPath,
      allowedRoles: e.actorPolicy?.allowedRoles,
    }));

    const userPrompt = `Pertanyaan pengguna: "${query}"\nPeran pengguna: ${scope.roleCode || 'USER'} (Modul Aktif: ${scope.enabledModules.join(', ')})\n\nBukti Fitur Kode Sistem Terverifikasi:\n${JSON.stringify(factsPayload, null, 2)}`;

    if (apiKey && model) {
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: model,
            temperature: 0.2,
            max_tokens: 800,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
          }),
          signal: AbortSignal.timeout(12000),
        });

        if (response.ok) {
          const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
          const reply = body.choices?.[0]?.message?.content?.trim();
          if (reply && reply.length > 20) {
            this.lastTelemetry = {
              usedProvider: 'openrouter',
              model,
              systemPrompt,
              userPrompt,
              factsCount: authorizedEntries.length,
            };
            return reply;
          }
        }
      } catch {
        // Fallback to deterministic synthesis if API call fails or times out
      }
    }

    this.lastTelemetry = {
      usedProvider: 'deterministic_fallback',
      systemPrompt,
      userPrompt,
      factsCount: authorizedEntries.length,
    };

    // Deterministic fallback synthesis
    return (
      authorizedEntries
        .map((e) => {
          const stepsText =
            e.steps && e.steps.length > 0
              ? `\n\nLangkah-langkah:\n${e.steps.map((s, idx) => `${idx + 1}. ${s}`).join('\n')}`
              : '';
          const navText = e.targetPath ? `\n\n[Buka ${e.title}](${e.targetPath})` : '';
          return `### ${e.title}\n${e.summary}${stepsText}${navText}`;
        })
        .join('\n\n---\n\n') + '\n\nSumber: Arsalynt ERP Code Knowledge Engine (MKIE).'
    );
  }

  /**
   * Resolves active modules, applying active snapshot overrides if available.
   */
  static async resolveModules(enabledModules: string[]): Promise<readonly ModuleKnowledge[]> {
    const baseline = allModules.filter((item) => enabledModules.includes(item.module));
    const active = await this.getActiveSnapshot();
    if (!active) return baseline;

    try {
      const tabEntries = await (prisma as any).marbot_knowledge_entry.findMany({
        where: {
          snapshot_id: active.id,
          module_code: { in: enabledModules },
          feature_id: { startsWith: 'frontend.tab.' },
          lifecycle_status: 'ACTIVE',
        },
        select: {
          module_code: true,
          title: true,
          topic: true,
        },
      });

      if (!tabEntries.length) return baseline;

      const tabsByModule = new Map<string, string[]>();
      for (const t of tabEntries) {
        const list = tabsByModule.get(t.module_code) || [];
        const cleanTitle = t.title.replace(/^Tab:\s*/i, '').replace(/\s*\([^)]*\)$/, '');
        if (!list.includes(cleanTitle)) list.push(cleanTitle);
        tabsByModule.set(t.module_code, list);
      }

      return baseline.map((mod) => {
        const discoveredTabs = tabsByModule.get(mod.module);
        if (!discoveredTabs || !discoveredTabs.length) return mod;

        const enrichedContent = `${mod.content} Tab aktif terdeteksi: ${discoveredTabs.join(', ')}.`;
        const tabKeywords = discoveredTabs.map((t) => t.toLowerCase()).join('|');
        const enrichedKeywords = new RegExp(
          `${mod.keywords.source}|${tabKeywords}`,
          'i'
        );

        return {
          ...mod,
          content: enrichedContent,
          keywords: enrichedKeywords,
        };
      });
    } catch {
      return baseline;
    }
  }

  /**
   * Evaluates if a given rule triggers an abstention guard.
   */
  static evaluateAbstention(
    rule: ProcedureRule,
    topicName: string,
    operation?: ProcedureOperation
  ): AbstentionResult {
    return checkAbstention(rule, topicName, operation);
  }

  /**
   * Retrieves active provenance metadata string for orchestrator citations.
   */
  static async getActiveProvenanceString(
    topic: string,
    operation?: string
  ): Promise<string> {
    const active = await this.getActiveSnapshot();
    if (active) {
      return `ERP:procedure:${topic}:${operation ?? 'overview'}:v${active.version_number}:${active.commit_sha.slice(0, 7)}`;
    }
    return `ERP:procedure:${topic}:${operation ?? 'overview'}:2026-10-07`;
  }
}
