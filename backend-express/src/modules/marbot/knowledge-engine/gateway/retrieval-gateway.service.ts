import crypto from 'node:crypto';
import prisma from '../../../../config/database';
import type { ProcedureTopic, ProcedureOperation } from '../../../marbot/brain/reasoning/intent';
import type { ProcedureRule, HelpContext } from '../../../marbot/knowledge/schemas/procedure.schema';
import type { ModuleKnowledge } from '../../../marbot/knowledge/schemas/module.schema';
import { findProcedureRule, allModules } from '../../../marbot/knowledge/knowledge.registry';
import { checkAbstention, type AbstentionResult } from './abstention-guard';
import { MiniLlmClient } from '../minillm/model-client';

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

export interface RestrictedTopicHint {
  clusterId: string;
  label: string;
  moduleCode: string;
  matchedTitles: string[];
  requiredRoleHint: string;
}

export interface ConceptClusterDefinition {
  id: string;
  label: string;
  triggers: string[];
  entryMatchers: string[];
  defaultRestrictedModule?: string;
  requiredRoleHint?: string;
}

export interface QueryIntentAnalysis {
  isDataOrPeriodInquiry: boolean;
  isUserGuidanceQuery: boolean;
  isSchemaQuery: boolean;
  periodPhrase?: string;
  detectedClusters: ConceptClusterDefinition[];
}

let snapshotCache: ActiveSnapshotCache | null = null;
let entriesCache: ActiveEntriesCache | null = null;
const queryCache = new Map<string, { result: any[]; restrictedHints: RestrictedTopicHint[]; cachedAt: number }>();
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
            operation: operation ?? null,
            knowledge_category: 'USER_PROCEDURE',
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

  static readonly ALLOWED_SHORT_ACRONYMS = new Set([
    'gl', 'ar', 'ap', 'po', 'pr', 'hr', 'qc', 'so', 'do', 'ui', 'db',
  ]);

  static readonly PROTECTED_BASE_ROOTS = new Set([
    'kota', 'kopi', 'kaki', 'peta', 'pasar', 'beli', 'kerja', 'uang', 'data',
    'user', 'role', 'lead', 'deal', 'task', 'form', 'bank', 'kas', 'item',
    'menu', 'page', 'pos', 'core', 'crm', 'tax', 'view', 'list', 'cost',
    'file', 'mode', 'part', 'path', 'feed', 'chat', 'link', 'team', 'auth',
    'transaksi', 'informasi', 'notifikasi', 'integrasi', 'posisi', 'resolusi',
    'komunikasi', 'konfigurasi', 'kategori', 'distribusi', 'fungsi', 'aplikasi',
    'validasi', 'produksi', 'kwitansi', 'administrasi', 'organisasi', 'aktivitas',
    'restitusi', 'subsidi', 'komisi', 'asuransi', 'garansi', 'mutasi', 'revisi',
    'bukti', 'ganti', 'rugi', 'laba', 'neraca', 'saldo', 'jurnal', 'pasti', 'asli', 'resmi',
  ]);

  static readonly COLLOQUIAL_SLANG_MAP: Record<string, string> = {
    tikda: 'tidak',
    tdk: 'tidak',
    finace: 'finance',
    finansial: 'finance',
    keuagan: 'keuangan',
    laproan: 'laporan',
    lprn: 'laporan',
    jrunal: 'jurnal',
    nerca: 'neraca',
    projcet: 'project',
    brapa: 'berapa',
    gmna: 'bagaimana',
    gmn: 'bagaimana',
    knp: 'kenapa',
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
   * Normalizes compound accounting/ERP shorthand (such as P&L -> pnl) and colloquial slang/typos
   * so symbol stripping does not split or drop multi-character financial tokens.
   */
  static normalizeShorthandTokens(input: string): string {
    let text = input
      .replace(/\bp\s*&\s*l\b/gi, 'pnl')
      .replace(/\br\s*&\s*d\b/gi, 'rnd');
    for (const [slang, norm] of Object.entries(this.COLLOQUIAL_SLANG_MAP)) {
      text = text.replace(new RegExp(`\\b${slang}\\b`, 'gi'), norm);
    }
    return text;
  }

  /**
   * Morphological stemmer for Indonesian words that strips common prefixes and suffixes,
   * including nasalization assimilation rules (meng/peng->k, meny/peny->s, men/pen->t, mem/pem->p),
   * while protecting base roots and normalizing colloquial slang/typos.
   */
  static stemIndonesian(word: string): string {
    let w = this.normalizeShorthandTokens(word.toLowerCase().trim());
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
   * Tokenizes text and code identifiers (camelCase, snake_case, kebab-case, dots, P&L).
   */
  static tokenizeIdentifiers(str: string): string[] {
    return this.normalizeShorthandTokens(str)
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[^a-zA-Z0-9]/g, ' ')
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2 || this.ALLOWED_SHORT_ACRONYMS.has(t));
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
    lapor: ['lapor', 'report', 'reporting', 'pnl', 'p&l', 'gl', 'financial', 'statement'],
    jurnal: ['jurnal', 'journal', 'general ledger', 'buku besar', 'gl', 'ledger', 'journal-entries'],
    neraca: ['neraca', 'trial balance', 'trial-balance', 'balance sheet', 'balance-sheet', 'saldo'],
    laba: ['laba', 'rugi', 'pnl', 'p&l', 'profit', 'loss', 'profit-and-loss', 'project p&l'],
  };

  /**
   * Multi-topic ERP concept clusters used to ensure queries mentioning multiple distinct
   * business/accounting entities retrieve at least one authoritative entry per concept
   * and surface transparent access boundary explanations when a concept lives in a restricted module.
   */
  static readonly CONCEPT_CLUSTERS: ConceptClusterDefinition[] = [
    {
      id: 'general_ledger',
      label: 'Jurnal Umum & Buku Besar (General Ledger)',
      triggers: ['jurnal', 'jurnal umum', 'buku besar', 'general ledger', 'journal', 'gl', 'ledger'],
      entryMatchers: ['general ledger', 'journal', 'jurnal', 'buku besar', 'ledger', 'gl'],
      defaultRestrictedModule: 'FINANCE',
      requiredRoleHint: 'Finance Manager / Direksi',
    },
    {
      id: 'trial_balance',
      label: 'Neraca Saldo (Trial Balance)',
      triggers: ['neraca', 'neraca saldo', 'trial balance', 'trial-balance', 'balance sheet', 'posisi keuangan'],
      entryMatchers: ['trial balance', 'trial-balance', 'neraca', 'balance sheet', 'balance-sheet'],
      defaultRestrictedModule: 'FINANCE',
      requiredRoleHint: 'Finance Manager / Direksi',
    },
    {
      id: 'profit_loss',
      label: 'Laba Rugi (Profit & Loss / P&L)',
      triggers: ['laba', 'rugi', 'laba rugi', 'pnl', 'p&l', 'profit', 'loss', 'profitabilitas'],
      entryMatchers: ['p&l', 'pnl', 'profit', 'loss', 'laba', 'rugi', 'profit-and-loss'],
      defaultRestrictedModule: 'FINANCE',
      requiredRoleHint: 'Finance Manager / Direksi',
    },
    {
      id: 'accounts_receivable',
      label: 'Piutang & Penagihan (Accounts Receivable / Invoice)',
      triggers: ['piutang', 'tagihan', 'invoice', 'billing', 'receivable', 'termin'],
      entryMatchers: ['invoice', 'billing', 'piutang', 'receivable', 'tagihan', 'termin'],
      defaultRestrictedModule: 'FINANCE',
      requiredRoleHint: 'Finance / Accounting',
    },
    {
      id: 'accounts_payable',
      label: 'Hutang & Tagihan Vendor (Accounts Payable)',
      triggers: ['hutang', 'payable', 'tagihan vendor', 'supplier invoice'],
      entryMatchers: ['payable', 'hutang', 'vendor bill', 'ap'],
      defaultRestrictedModule: 'FINANCE',
      requiredRoleHint: 'Finance / Procurement',
    },
    {
      id: 'cash_bank',
      label: 'Kas, Bank & Pembayaran (Cash & Banking)',
      triggers: ['kas', 'bank', 'rekonsiliasi', 'pembayaran', 'cashbank', 'disbursement'],
      entryMatchers: ['cash', 'bank', 'kas', 'reconciliation', 'rekonsiliasi', 'payment', 'pembayaran'],
      defaultRestrictedModule: 'FINANCE',
      requiredRoleHint: 'Finance Manager / Kasir',
    },
    {
      id: 'tax_management',
      label: 'Manajemen Pajak (Tax / PPN / PPh)',
      triggers: ['pajak', 'tax', 'ppn', 'pph', 'faktur pajak'],
      entryMatchers: ['tax', 'pajak', 'ppn', 'pph', 'faktur'],
      defaultRestrictedModule: 'FINANCE',
      requiredRoleHint: 'Finance / Tax Specialist',
    },
    {
      id: 'fixed_assets',
      label: 'Aset Tetap & Penyusutan (Fixed Assets)',
      triggers: ['aset', 'asset', 'penyusutan', 'depresiasi', 'aktiva'],
      entryMatchers: ['asset', 'aset', 'depreciation', 'depresiasi', 'penyusutan'],
      defaultRestrictedModule: 'FINANCE',
      requiredRoleHint: 'Finance / Asset Management',
    },
  ];

  /**
   * Analyzes user query intent to distinguish between:
   * - Actual financial/operational data or period inquiries ("rincian ... bulan ini", "berapa saldo", etc.)
   * - Procedural UI navigation queries ("bagaimana cara membuka menu...")
   * - Multi-topic queries spanning several accounting/ERP entities.
   */
  static analyzeQueryIntent(query: string): QueryIntentAnalysis {
    const rawLower = query.toLowerCase().trim();
    const norm = this.normalizeShorthandTokens(rawLower).replace(/[?.,!]/g, ' ').replace(/\s+/g, ' ').trim();

    const periodMatch = rawLower.match(
      /\b(bulan ini|bulan lalu|tahun ini|tahun lalu|hari ini|minggu ini|kuartal ini|periode ini|saat ini|terbaru)\b/i
    );

    const hasDataSignal =
      /\b(rincian|detail|berapa|total|nilai|nominal|mutasi|posisi|kondisi|ringkasan|rekap|angka|jumlah|ikhtisar)\b/i.test(
        rawLower
      ) || Boolean(periodMatch);

    const hasExplicitNavigationSignal = /\b(cara|panduan|langkah|buka|klik|menu|tab|halaman|dimana|di mana|lokasi|navigasi)\b/i.test(
      rawLower
    );

    const isUserGuidanceQuery =
      hasExplicitNavigationSignal || (/\b(how|bagaimana)\b/i.test(rawLower) && !hasDataSignal);

    const isSchemaQuery = /\b(?:tabel|table|skema|schema|database|model|kolom|prisma)\b/i.test(norm);

    const detectedClusters = this.CONCEPT_CLUSTERS.filter((cluster) =>
      cluster.triggers.some((trigger) => {
        const normTrigger = this.normalizeShorthandTokens(trigger.toLowerCase());
        return rawLower.includes(trigger.toLowerCase()) || norm.includes(normTrigger);
      })
    );

    return {
      isDataOrPeriodInquiry: hasDataSignal,
      isUserGuidanceQuery,
      isSchemaQuery,
      periodPhrase: periodMatch ? periodMatch[1].toLowerCase() : undefined,
      detectedClusters,
    };
  }

  /**
   * Checks whether a knowledge entry matches a specific concept cluster.
   */
  private static entryMatchesCluster(entry: any, cluster: ConceptClusterDefinition): boolean {
    const hayRaw = `${entry.title || ''} ${entry.topic || ''} ${entry.feature_id || ''} ${entry.content_json || ''}`.toLowerCase();
    const hayNorm = this.normalizeShorthandTokens(hayRaw);
    return cluster.entryMatchers.some((matcher) => {
      const mLower = matcher.toLowerCase();
      const mNorm = this.normalizeShorthandTokens(mLower);
      return hayRaw.includes(mLower) || hayNorm.includes(mNorm);
    });
  }

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
   * Checks whether an entry belongs to the same tenant/company boundary (so we never leak
   * cross-tenant metadata even when generating high-level access restriction explanations).
   */
  private static isSameTenantAndCompany(
    entry: any,
    scope: { tenantId?: string; companyId?: string }
  ): boolean {
    let policy: any = entry.actorPolicy;
    if (!policy && entry.actor_policy_json) {
      try {
        policy = JSON.parse(entry.actor_policy_json);
      } catch {
        policy = undefined;
      }
    }
    const entryTenantId = policy?.tenantId || entry.tenant_id;
    const entryCompanyId = policy?.companyId || entry.company_id;
    if (entryTenantId && (!scope.tenantId || entryTenantId !== scope.tenantId)) {
      return false;
    }
    if (entryCompanyId && (!scope.companyId || entryCompanyId !== scope.companyId)) {
      return false;
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
   * morphological stemming, multi-topic cluster aggregation, and fine-grained operational access policy.
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
      const intent = this.analyzeQueryIntent(query);
      const normalizedQuery = this.normalizeShorthandTokens(query.toLowerCase())
        .replace(/[?.,!]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const rawTerms = normalizedQuery
        .split(/\s+/)
        .filter((t) => t.length > 2 || this.ALLOWED_SHORT_ACRONYMS.has(t));
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
        laporan: ['report', 'reporting', 'pnl', 'p&l', 'gl', 'financial'],
        jurnal: ['journal', 'journal-entries', 'general ledger', 'gl', 'buku besar', 'ledger'],
        journal: ['jurnal', 'journal-entries', 'general ledger', 'gl', 'ledger'],
        neraca: ['balance', 'trial-balance', 'trial balance', 'balance-sheet', 'balance sheet', 'saldo'],
        saldo: ['balance', 'trial-balance', 'trial balance', 'neraca'],
        laba: ['profit', 'pnl', 'p&l', 'loss', 'profit-and-loss', 'project p&l', 'laba rugi'],
        rugi: ['loss', 'pnl', 'p&l', 'profit', 'profit-and-loss', 'project p&l', 'laba rugi'],
        pnl: ['p&l', 'profit', 'loss', 'laba', 'rugi', 'profit-and-loss', 'project p&l'],
        skema: ['schema', 'model', 'tabel', 'database', 'kolom'],
        tabel: ['table', 'model', 'schema', 'database', 'prisma'],
      };

      const STOPWORDS = new Set([
        'bagaimana', 'cara', 'panduan', 'buka', 'lihat', 'view', 'menu', 'tab', 'halaman', 'dimana', 'di mana',
        'how', 'dan', 'atau', 'ini', 'itu', 'pada', 'untuk', 'dengan', 'dari', 'ke', 'di', 'yang', 'apa', 'apakah',
        'saya', 'kami', 'kita', 'kamu', 'anda', 'bulan', 'tahun', 'hari', 'minggu', 'perusahaan', 'tolong', 'mohon',
        'bisa', 'dapat', 'ada', 'rincian', 'daftar', 'detail', 'kondisi', 'posisi', 'umum',
      ]);

      const substantiveTerms = rawTerms.filter((t) => !STOPWORDS.has(t));

      const queryStems = new Set<string>();
      const expandedTerms = new Set<string>(rawTerms);

      for (const term of rawTerms) {
        const stem = this.stemIndonesian(term);
        if (stem.length > 2 || this.ALLOWED_SHORT_ACRONYMS.has(stem)) {
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

      // Also expand terms from any detected multi-word concept clusters
      for (const cluster of intent.detectedClusters) {
        for (const matcher of cluster.entryMatchers) {
          expandedTerms.add(matcher);
        }
      }

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

      // Score function reusable across authorized entries and restricted-topic detection
      const scoreEntry = (e: any): { score: number; matchedClusters: string[] } => {
        const titleRaw = (e.title || '').toLowerCase();
        const titleLower = this.normalizeShorthandTokens(titleRaw);
        const topicLower = this.normalizeShorthandTokens((e.topic || '').toLowerCase());
        const featureLower = this.normalizeShorthandTokens((e.feature_id || '').toLowerCase());
        const contentRaw = (e.content_json || '').toLowerCase();
        const contentStr = this.normalizeShorthandTokens(contentRaw);

        let score = 0;
        let substantiveMatches = 0;
        const matchedClusters: string[] = [];

        // 1. Exact query or phrase match bonus
        if (titleLower.includes(normalizedQuery) || titleRaw.includes(normalizedQuery)) {
          score += 35;
          substantiveMatches += 2;
        }
        if (contentStr.includes(normalizedQuery) || contentRaw.includes(normalizedQuery)) {
          score += 15;
          substantiveMatches += 1;
        }

        // 2. Concept cluster match bonus (vital for multi-topic queries like Jurnal + Neraca + P&L)
        for (const cluster of intent.detectedClusters) {
          if (this.entryMatchesCluster(e, cluster)) {
            matchedClusters.push(cluster.id);
            substantiveMatches += 2;
            const titleClusterHit = cluster.entryMatchers.some(
              (m) => titleRaw.includes(m) || titleLower.includes(this.normalizeShorthandTokens(m))
            );
            score += titleClusterHit ? 28 : 16;
          }
        }

        // 3. Direct term match
        for (const term of rawTerms) {
          const isSubstantive = substantiveTerms.includes(term);
          const weight = isSubstantive ? 1 : 0.2;
          let matched = false;

          if (titleLower.includes(term) || titleRaw.includes(term)) {
            score += Math.round(8 * weight);
            matched = true;
          }
          if (topicLower.includes(term)) {
            score += Math.round(6 * weight);
            matched = true;
          }
          if (featureLower.includes(term)) {
            score += Math.round(5 * weight);
            matched = true;
          }
          if (contentStr.includes(term) || contentRaw.includes(term)) {
            score += Math.round(3 * weight);
            matched = true;
          }

          if (matched && isSubstantive) substantiveMatches++;
        }

        // 4. Dynamic concept & stem match
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
          if (titleLower.includes(exp) || titleRaw.includes(exp)) {
            score += 5;
            expMatched = true;
          }
          if (topicLower.includes(exp)) {
            score += 4;
            expMatched = true;
          }
          if (featureLower.includes(exp)) {
            score += 3;
            expMatched = true;
          }
          if (contentStr.includes(exp) || contentRaw.includes(exp)) {
            score += 2;
            expMatched = true;
          }
          if (expMatched) substantiveMatches++;
        }

        // Strict topic grounding: If the query contains substantive terms (e.g. jurnal, neraca, inbox),
        // an entry MUST match at least one substantive term or concept cluster to be considered relevant.
        if (substantiveTerms.length > 0 && substantiveMatches === 0) {
          return { score: 0, matchedClusters: [] };
        }

        // 5. Category-based boosts
        if (intent.isUserGuidanceQuery) {
          if (e.feature_id.startsWith('frontend.tab.')) score += 35;
          if (e.feature_id.startsWith('frontend.view.')) score += 20;
          if (e.knowledge_category === 'USER_PROCEDURE') score += 15;
        } else {
          if (e.feature_id.startsWith('frontend.tab.')) score += 20;
          if (e.feature_id.startsWith('frontend.view.')) score += 12;
          if (e.knowledge_category === 'USER_PROCEDURE') score += 10;
        }
        if (intent.isSchemaQuery && e.feature_id.startsWith('schema.model.')) score += 30;

        return { score, matchedClusters };
      };

      // Strict operational access authorization
      const allowedModules = [...(scope.enabledModules || []), 'GENERAL', 'CORE'].map((m) => m.toUpperCase());
      const roleAuthorizedEntries: any[] = [];
      const restrictedEntriesSameTenant: any[] = [];

      for (const e of allEntries) {
        const modUpper = (e.module_code || '').toUpperCase();
        const isSchema =
          (e.feature_id || '').startsWith('schema.model.') || e.knowledge_category === 'SCHEMA_MODEL';
        const isAuthorized =
          allowedModules.includes(modUpper) && this.validateEntryAuthorization(e, scope);

        if (isAuthorized) {
          roleAuthorizedEntries.push(e);
        } else if (!isSchema && this.isSameTenantAndCompany(e, scope)) {
          restrictedEntriesSameTenant.push(e);
        }
      }

      const scored = roleAuthorizedEntries
        .map((e: any) => {
          const { score, matchedClusters } = scoreEntry(e);
          return { entry: e, score, matchedClusters };
        })
        .filter((item) => item.score >= 10);

      scored.sort((a, b) => b.score - a.score);

      // Multi-topic diversity selection:
      // Ensure at least the top-scoring entry for each detected query concept cluster is included first
      // before filling the remaining slots up to maxResults.
      const maxResults = Math.max(4, intent.detectedClusters.length + 1);
      const selectedItems: Array<{ entry: any; score: number; matchedClusters: string[] }> = [];
      const selectedFeatureIds = new Set<string>();
      const coveredClusterIds = new Set<string>();

      for (const cluster of intent.detectedClusters) {
        const bestForCluster = scored.find((item) => item.matchedClusters.includes(cluster.id));
        if (bestForCluster) {
          coveredClusterIds.add(cluster.id);
          if (!selectedFeatureIds.has(bestForCluster.entry.feature_id)) {
            selectedItems.push(bestForCluster);
            selectedFeatureIds.add(bestForCluster.entry.feature_id);
          }
        }
      }

      for (const item of scored) {
        if (selectedItems.length >= maxResults) break;
        if (!selectedFeatureIds.has(item.entry.feature_id)) {
          selectedItems.push(item);
          selectedFeatureIds.add(item.entry.feature_id);
        }
      }

      // Compute restricted topic hints for any concept cluster in the user query that had
      // restricted matches (or was uncovered or partially restricted under FINANCE/sensitive modules)
      const restrictedHints: RestrictedTopicHint[] = [];
      for (const cluster of intent.detectedClusters) {
        const restrictedMatches = restrictedEntriesSameTenant
          .map((e) => ({ entry: e, ...scoreEntry(e) }))
          .filter((item) => item.score >= 15 && item.matchedClusters.includes(cluster.id))
          .sort((a, b) => b.score - a.score);

        if (restrictedMatches.length > 0) {
          const topRestricted = restrictedMatches[0].entry;
          let policy: any;
          try {
            policy = topRestricted.actor_policy_json
              ? JSON.parse(topRestricted.actor_policy_json)
              : undefined;
          } catch {
            policy = undefined;
          }
          const roleHint =
            Array.isArray(policy?.allowedRoles) && policy.allowedRoles.length > 0
              ? policy.allowedRoles.join(' / ')
              : cluster.requiredRoleHint || 'Finance Manager / Direksi';

          restrictedHints.push({
            clusterId: cluster.id,
            label: cluster.label,
            moduleCode: (topRestricted.module_code || cluster.defaultRestrictedModule || 'FINANCE').toUpperCase(),
            matchedTitles: Array.from(
              new Set(restrictedMatches.slice(0, 2).map((m) => m.entry.title as string))
            ),
            requiredRoleHint: roleHint,
          });
        } else if (!coveredClusterIds.has(cluster.id) && cluster.defaultRestrictedModule) {
          restrictedHints.push({
            clusterId: cluster.id,
            label: cluster.label,
            moduleCode: cluster.defaultRestrictedModule,
            matchedTitles: [cluster.label],
            requiredRoleHint: cluster.requiredRoleHint || 'Finance Manager / Direksi',
          });
        }
      }

      const finalResult = selectedItems.slice(0, maxResults).map(({ entry: e }) => {
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

      queryCache.set(cacheKey, {
        result: finalResult,
        restrictedHints,
        cachedAt: Date.now(),
      });
      return finalResult;
    } catch {
      return [];
    }
  }

  /**
   * Resolves any restricted-access topic hints for a query and user scope so Marka Plus can
   * transparently explain when part of a multi-topic query falls under a restricted module (e.g. FINANCE).
   */
  private static resolveRestrictedHintsForAnswer(
    query: string,
    authorizedEntries: Array<{
      feature_id: string;
      title: string;
      module_code: string;
      summary: string;
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
  ): RestrictedTopicHint[] {
    const activeSnapshotId = snapshotCache?.snapshot?.id;
    const cacheKey = this.buildScopedCacheKey(query, scope, activeSnapshotId);
    const cached = queryCache.get(cacheKey);
    if (cached?.restrictedHints && cached.restrictedHints.length > 0) {
      return cached.restrictedHints;
    }

    const intent = this.analyzeQueryIntent(query);
    if (!intent.detectedClusters.length) return [];

    const userRole = (scope.roleCode || 'USER').toUpperCase();
    const isSuperOrDirector = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'DIRECTOR', 'FINANCE_MANAGER'].includes(userRole);
    const userPermissions = (scope.permissions || []).map((p) => p.toUpperCase());
    const hasFinanceAccess =
      isSuperOrDirector ||
      userPermissions.some((p) =>
        ['MANAGE_ALL', 'VIEW_FINANCE', 'READ_COMPANY_FINANCE', 'MANAGE_FINANCE'].includes(p)
      );

    const hints: RestrictedTopicHint[] = [];
    for (const cluster of intent.detectedClusters) {
      const isCoveredByAuthorized = authorizedEntries.some((e) =>
        this.entryMatchesCluster(
          {
            title: e.title,
            topic: '',
            feature_id: e.feature_id,
            content_json: e.summary,
          },
          cluster
        )
      );

      // If the concept is not covered by authorized entries (e.g. Trial Balance) or if the user
      // only has REPORTING-level P&L access without official FINANCE module access:
      if (!isCoveredByAuthorized && cluster.defaultRestrictedModule) {
        hints.push({
          clusterId: cluster.id,
          label: cluster.label,
          moduleCode: cluster.defaultRestrictedModule,
          matchedTitles: [cluster.label],
          requiredRoleHint: cluster.requiredRoleHint || 'Finance Manager / Direksi',
        });
      } else if (
        cluster.id === 'profit_loss' &&
        !hasFinanceAccess &&
        authorizedEntries.some((e) => e.module_code.toUpperCase() === 'REPORTING') &&
        !authorizedEntries.some((e) => e.module_code.toUpperCase() === 'FINANCE')
      ) {
        // User has Project P&L in REPORTING, but official company-wide P&L closing is in FINANCE
        hints.push({
          clusterId: 'profit_loss_official',
          label: 'Laporan Laba Rugi Resmi Perusahaan',
          moduleCode: 'FINANCE',
          matchedTitles: ['Laporan Laba Rugi Resmi Perusahaan'],
          requiredRoleHint: 'Finance Manager / Direksi',
        });
      }
    }

    return hints;
  }

  /**
   * Menggunakan MiniLLM untuk menyaring & memilah kandidat fakta RAG agar hanya menyisakan
   * fakta yang benar-benar relevan dengan intensi pengguna dan ramah pengguna (bukan noise/teknis).
   */
  static async filterFactsWithMiniLlm<T extends { title: string; module_code: string; summary: string }>(
    query: string,
    candidates: T[]
  ): Promise<T[]> {
    if (candidates.length <= 2) return candidates;

    try {
      const prompt = `Anda adalah filter informasi cerdas untuk sistem ERP.
Tugas Anda adalah memilih maksimal 3 fakta yang PALING RELEVAN dengan pertanyaan pengguna dari daftar kandidat berikut.
Buang kandidat yang tidak nyambung atau hanya kebetulan mengandung kata yang mirip.

Pertanyaan Pengguna: "${query}"

Kandidat Fakta:
${JSON.stringify(candidates.map((c, i) => ({ id: i, title: c.title, module: c.module_code, summary: c.summary })), null, 2)}

Kembalikan HANYA JSON berformat: { "selectedIds": [nomor_id_yang_relevan] }`;

      const response = await MiniLlmClient.complete({
        messages: [
          { role: 'system', content: 'Anda adalah information filter JSON generator.' },
          { role: 'user', content: prompt },
        ],
        responseFormatJson: true,
        timeoutMs: 6000,
      });

      if (response) {
        const parsed = JSON.parse(response);
        if (Array.isArray(parsed.selectedIds) && parsed.selectedIds.length > 0) {
          const filtered = parsed.selectedIds
            .map((id: number) => candidates[id])
            .filter(Boolean);
          if (filtered.length > 0) return filtered;
        }
      }
    } catch {
      // Fallback ke kandidat heuristik jika MiniLLM offline atau timeout
    }

    return candidates.slice(0, 4);
  }

  /**
   * Synthesizes an authoritative answer grounded in retrieved MKIE facts.
   * Utilizes OpenRouter LLM when available, falling back gracefully to intent-aware deterministic synthesis.
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

    // Filter out internal API endpoints (e.g. GET /api/v1/...) so technical developer routes never leak to end users
    const userFacingEntries = authorizedEntries.filter((e) =>
      !e.feature_id.startsWith('backend.api.') &&
      e.knowledge_category !== 'API_ENDPOINT' &&
      !/\b(?:GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+\/api\/v\d+\//i.test(e.title) &&
      !/\/api\/v\d+\//i.test(e.title)
    );
    // Never reintroduce developer API route records when all retrieved facts
    // were filtered. Empty user-facing evidence must abstain, not disclose APIs.
    const candidateEntries = userFacingEntries;

    if (!candidateEntries.length) {
      this.lastTelemetry = {
        usedProvider: 'deterministic_fallback',
        factsCount: 0,
      };
      return 'Referensi fitur atau data teknis tersebut tidak ditemukan dalam bukti kode sistem terverifikasi saat ini. Saya belum memiliki bukti kode yang cukup untuk menjawab pertanyaan ini secara akurat.';
    }

    // MiniLLM menyaring & memilah fakta RAG: hanya fakta yang benar-benar relevan yang diserahkan ke LLM Utama
    const filteredFacts = await this.filterFactsWithMiniLlm(query, candidateEntries);

    const intent = this.analyzeQueryIntent(query);
    const restrictedHints = this.resolveRestrictedHintsForAnswer(query, filteredFacts, scope);

    // Check OpenRouter LLM availability from environment
    const apiKey = (process.env.MARBOT_AI_API_KEY || process.env.OPENROUTER_API_KEY || '').trim();
    const model = (
      process.env.MARBOT_AI_MODEL ||
      process.env.OPENROUTER_MODEL ||
      'google/gemini-2.0-flash-001'
    ).trim();

    const systemPrompt = `Anda adalah Marka Plus, asisten cerdas untuk sistem Arsalynt ERP.
Tugas Anda adalah menjawab pertanyaan pengguna secara ringkas, akurat, profesional, dan ramah dalam Bahasa Indonesia berdasarkan HANYA bukti kode (Code Evidence) yang disediakan.

ATURAN GROUNDING & MULTI-TOPIK KETAT:
1. Jawab HANYA berdasarkan Fakta Kode Terverifikasi yang diberikan. JANGAN berhalusinasi atau mengarang angka/logika bisnis baru.
2. CAKUPAN MULTI-TOPIK: Jika pengguna menanyakan beberapa topik sekaligus (misalnya Jurnal Umum, Neraca Saldo, dan Laba Rugi), bahas SETIAP topik tersebut secara terstruktur dalam poin-poin yang jelas—jangan mengabaikan salah satu topik.
3. SERTAKAN LINK NAVIGASI: Jika rute atau path navigasi tersedia pada fakta, selalu sertakan link markdown [Buka Nama Fitur (MODUL)](path) untuk mempermudah pengguna.
4. TRANSPARANSI HAK AKSES: Jika sebagian topik yang ditanyakan pengguna berada pada modul terbatas (lihat "Konteks Batasan Hak Akses"), jelaskan secara sopan dan transparan fitur mana yang dapat diakses pengguna saat ini (misalnya pada modul REPORTING) dan fitur mana yang berada di bawah modul khusus (misalnya modul FINANCE yang memerlukan izin Finance Manager / Direksi).
5. DISAMBIGUASI DATA VS PROSEDUR: Jika pengguna menanyakan rincian angka/kondisi periode tertentu (misalnya "bulan ini"), jelaskan halaman laporan yang relevan beserta catatan untuk menerapkan filter periode/tanggal pada halaman tersebut guna melihat mutasi nominal aktual (jangan sekadar menyalin langkah klik tombol secara kaku).
6. Anda HANYA memberikan bantuan pengetahuan dan panduan sistem. JANGAN mengeksekusi mutasi atau merencanakan perubahan data operasional.`;

    const factsPayload = filteredFacts.map((e) => ({
      title: e.title,
      module: e.module_code,
      category: e.knowledge_category || 'USER_PROCEDURE',
      summary: e.summary,
      steps: e.steps,
      path: e.targetPath,
      allowedRoles: e.actorPolicy?.allowedRoles,
    }));

    const restrictionContext =
      restrictedHints.length > 0
        ? `\n\nKonteks Batasan Hak Akses (Topik yang ditanyakan namun memerlukan otorisasi lebih tinggi):\n${JSON.stringify(
          restrictedHints.map((h) => ({
            topic: h.label,
            module: h.moduleCode,
            requiredRole: h.requiredRoleHint,
          })),
          null,
          2
        )}`
        : '';

    const userPrompt = `Pertanyaan pengguna: "${query}"
Intensi terdeteksi: ${intent.isDataOrPeriodInquiry ? `Pertanyaan Rincian Data/Periode (${intent.periodPhrase || 'periode berjalan'})` : 'Panduan Prosedur/Navigasi'}
Peran pengguna: ${scope.roleCode || 'USER'} (Modul Aktif: ${scope.enabledModules.join(', ')})

Bukti Fitur Kode Sistem Terverifikasi (Sesuai Hak Akses Pengguna):
${JSON.stringify(factsPayload, null, 2)}${restrictionContext}`;

    if (apiKey && model) {
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://arsalynt.com',
            'X-Title': 'Arsalynt ERP - Marka Plus MKIE',
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
              factsCount: filteredFacts.length,
            };
            return reply;
          }
        } else {
          const errDetail = await response.text().catch(() => '');
          console.warn(`[MKIE] OpenRouter API error HTTP ${response.status}: ${errDetail}`);
        }
      } catch (err) {
        console.warn(`[MKIE] OpenRouter request failed: ${err instanceof Error ? err.message : String(err)}`);
        // Fallback to deterministic synthesis if API call fails or times out
      }
    }

    this.lastTelemetry = {
      usedProvider: 'deterministic_fallback',
      systemPrompt,
      userPrompt,
      factsCount: filteredFacts.length,
    };

    // Intent-aware deterministic fallback synthesis:
    // If the query asks for data/period details OR spans multiple topics/restricted hints,
    // produce a structured, user-friendly executive synthesis instead of raw manual steps.
    if (
      intent.isDataOrPeriodInquiry ||
      intent.detectedClusters.length > 1 ||
      restrictedHints.length > 0
    ) {
      const cleanEntryTitle = (rawTitle: string, mod: string) => {
        const stripped = rawTitle.replace(/^Tab:\s*/i, '').trim();
        return stripped.includes(`(${mod})`) ? stripped : `${stripped} (${mod})`;
      };

      const itemLines = filteredFacts.map((e, idx) => {
        const displayTitle = cleanEntryTitle(e.title, e.module_code);
        const linkPart = e.targetPath ? `**[Buka ${displayTitle}](${e.targetPath})**` : `**${displayTitle}**`;
        const summaryPart = e.summary ? `${e.summary.replace(/\.$/, '')}.` : '';
        const stepHint =
          !intent.isDataOrPeriodInquiry && e.steps && e.steps.length > 0
            ? ` Langkah: ${e.steps.join(' → ')}.`
            : '';
        return `${idx + 1}. **${e.title.replace(/^Tab:\s*/i, '').trim()}**: ${summaryPart} Akses langsung melalui ${linkPart}.${stepHint}`;
      });

      if (restrictedHints.length > 0) {
        const restrictedLabels = Array.from(new Set(restrictedHints.map((h) => h.label))).join(' & ');
        const restrictedModules = Array.from(new Set(restrictedHints.map((h) => h.moduleCode))).join('/');
        const requiredRoles = Array.from(new Set(restrictedHints.map((h) => h.requiredRoleHint))).join(' / ');
        itemLines.push(
          `${itemLines.length + 1}. **${restrictedLabels}**: Rincian menyeluruh dan penutupan buku resmi perusahaan berada di bawah modul **${restrictedModules}**. Sesuai kebijakan otorisasi untuk peran Anda saat ini (\`${scope.roleCode || 'USER'}\`), akses fitur tersebut memerlukan izin khusus (*${requiredRoles}*).`
        );
      }

      const periodNote = intent.isDataOrPeriodInquiry
        ? `\n\n*Catatan: Marka Plus menampilkan panduan akses berdasarkan bukti kode terverifikasi. Untuk melihat angka dan mutasi nominal aktual ${intent.periodPhrase || 'periode terkait'}, silakan buka halaman laporan di atas lalu terapkan filter periode/tanggal yang sesuai.*`
        : '';

      return (
        `Berdasarkan cakupan akses peran Anda (\`${scope.roleCode || 'USER'}\`) dan modul aktif saat ini:\n\n` +
        itemLines.join('\n') +
        periodNote +
        '\n\nSumber: Arsalynt ERP Code Knowledge Engine (MKIE).'
      );
    }

    // Standard single-procedure deterministic fallback
    return (
      filteredFacts
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
