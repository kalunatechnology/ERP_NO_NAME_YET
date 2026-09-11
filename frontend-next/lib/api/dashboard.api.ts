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
  const response = await api.get<DashboardBootstrapResponse>(
    '/api/v1/dashboard/bootstrap',
    {
      params: {
        sections: requestedSections.join(','),
      },

      timeout: 30_000,
    },
  );

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
  return (
    response.data?.data ??
    (response.data as DashboardBootstrap) ??
    {}
  );
}