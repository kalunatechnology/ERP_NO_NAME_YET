/**
 * Dashboard BFF client.
 *
 * Fetches one role-aware, company-scoped bootstrap package from Express.
 * The domain adapters remain responsible for converting raw records into
 * existing UI view models, keeping calculations consistent with their
 * module pages.
 */
import api from './axios';

import type { ProjectDashboardBundle } from './project.api';
import type { FinanceDashboardBundle } from './finance.api';
import type { CRMData, CRMDashboard } from './crm.api';

import {
  canRequestDashboardSection,
  DashboardSection,
  FrontendAccessContext,
} from '@/lib/access/module-contract';

/**
 * Summary lembur khusus Staff.
 *
 * Nilai dihitung di backend/BFF.
 * Frontend hanya menerima dan menampilkannya.
 */
export interface StaffOvertimeSummary {
  /**
   * Total jam lembur sejak awal minggu berjalan.
   */
  thisWeekHours: number;

  /**
   * Total jam lembur sejak awal bulan berjalan.
   */
  thisMonthHours: number;

  /**
   * Total jam lembur yang masih menunggu approval.
   */
  pendingHours: number;

  /**
   * Total jam lembur yang sudah disetujui.
   */
  approvedHours: number;

  /**
   * Tanggal lembur terakhir milik Staff.
   */
  lastOvertimeDate: string | null;
}

/**
 * Extension dari ProjectDashboardBundle khusus kebutuhan Dashboard BFF.
 *
 * Project module tetap menjadi canonical contract untuk data project.
 * Dashboard hanya menambahkan projection/read-model khusus dashboard,
 * salah satunya overtimeSummary.
 */
export type DashboardProjectBundle = ProjectDashboardBundle & {
  overtimeSummary?: StaffOvertimeSummary | null;
};

/**
 * Bootstrap package yang dapat dikembalikan oleh Express Dashboard BFF.
 *
 * Section bersifat optional karena frontend hanya meminta section yang
 * memang dibutuhkan role aktif.
 */
export interface DashboardBootstrap {
  projects?: DashboardProjectBundle;

  finance?: FinanceDashboardBundle;

  crm?: {
    data: Partial<CRMData>;
    dashboard: CRMDashboard;
  };
}

/**
 * Envelope response dari:
 *
 * GET /api/v1/dashboard/bootstrap
 */
interface DashboardBootstrapResponse {
  success?: boolean;

  data?: DashboardBootstrap;

  meta?: {
    sections?: DashboardSection[];
    request_id?: string;
  };
}

const BOOTSTRAP_BROWSER_CACHE_MS = 15_000;
const bootstrapCache = new Map<string, { expiresAt: number; value: DashboardBootstrap }>();
const bootstrapRequests = new Map<string, Promise<DashboardBootstrap>>();
let mutationListenerInstalled = false;
let bootstrapCacheRevision = 0;

function browserBootstrapScopeKey(sections: DashboardSection[], access: FrontendAccessContext): string {
  if (typeof window === 'undefined') return `server:${sections.join(',')}`;
  const token = localStorage.getItem('erp.access') || localStorage.getItem('access_token') || '';
  const company = localStorage.getItem('erp.company') || localStorage.getItem('active_company_id') || '';
  return JSON.stringify({
    sections: [...sections].sort(),
    token,
    company,
    activeRoleCode: access.activeRoleCode || '',
    enabledModules: [...(access.enabledModules || [])].map(String).sort(),
    delegatedModules: [...(access.delegatedModules || [])].map(String).sort(),
    isSuperAdmin: Boolean(access.isSuperAdmin),
  });
}

function ensureBootstrapMutationListener(): void {
  if (mutationListenerInstalled || typeof window === 'undefined') return;
  mutationListenerInstalled = true;
  window.addEventListener('erp:data-mutated', () => {
    bootstrapCacheRevision += 1;
    bootstrapCache.clear();
    bootstrapRequests.clear();
  });
}

/**
 * Requests only the sections needed for the currently visible dashboard role.
 *
 * Contoh:
 *
 * STAFF
 *   -> projects
 *
 * FINANCE
 *   -> finance
 *
 * PROJECT_MANAGER
 *   -> projects, crm (tergantung module access)
 *
 * DIRECTOR
 *   -> projects, finance, crm
 */
export async function loadDashboardBootstrap(
  sections: DashboardSection[],
  access: FrontendAccessContext = {},
  options: { fresh?: boolean } = {},
): Promise<DashboardBootstrap> {
  /**
   * Tidak ada section yang dibutuhkan.
   */
  if (!sections.length) {
    return {};
  }

  /**
   * Hindari request:
   *
   * projects,projects,projects
   *
   * menjadi:
   *
   * projects
   */
  const requestedSections = Array.from(new Set(sections));
  ensureBootstrapMutationListener();

  /**
   * Frontend contract check.
   *
   * Ini bukan pengganti authorization backend.
   * Backend tetap menjadi authority terakhir.
   */
  const denied = requestedSections.filter(
    (section) => !canRequestDashboardSection(section, access),
  );

  if (denied.length) {
    throw new Error(
      `Section dashboard tidak sesuai kontrak akses aktif: ${denied.join(', ')}.`,
    );
  }

  /**
   * Dashboard BFF endpoint.
   *
   * Axios interceptor tetap menangani:
   * - Authorization
   * - X-Company-ID
   * - token/session handling
   */
  const cacheKey = browserBootstrapScopeKey(requestedSections, access);
  if (!options.fresh) {
    const cached = bootstrapCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const pending = bootstrapRequests.get(cacheKey);
    if (pending) return pending;
  }

  const requestRevision = bootstrapCacheRevision;
  const request = api.get<DashboardBootstrapResponse>(
      '/api/v1/dashboard/bootstrap',
      {
        params: {
          sections: requestedSections.join(','),
          ...(options.fresh ? { fresh: '1' } : {}),
        },
        timeout: 30_000,
      },
    )
    .then((response) => (
      response.data?.data ??
      (response.data as DashboardBootstrap) ??
      {}
    ));

  if (!options.fresh) bootstrapRequests.set(cacheKey, request);
  try {
    const value = await request;
    if (options.fresh || requestRevision === bootstrapCacheRevision) {
      bootstrapCache.set(cacheKey, { expiresAt: Date.now() + BOOTSTRAP_BROWSER_CACHE_MS, value });
    }
    return value;
  } finally {
    bootstrapRequests.delete(cacheKey);
  }

  /**
   * Response Express saat ini:
   *
   * {
   *   success: true,
   *   data: {
   *     projects?: {},
   *     finance?: {},
   *     crm?: {}
   *   },
   *   meta: {}
   * }
   *
   * Fallback kedua dipertahankan untuk kompatibilitas apabila
   * endpoint lama masih mengembalikan bootstrap secara langsung.
   */
  // Response normalization is performed by the request promise above so both
  // cache hits and network reads share the exact same contract.
}
