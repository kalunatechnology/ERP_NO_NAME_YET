/**
 * Dashboard BFF client.
 *
 * Fetches one role-aware, company-scoped bootstrap package from Express. The
 * domain adapters remain responsible for converting raw records into existing
 * UI view models, keeping calculations consistent with their module pages.
 */
import api from './axios';
import type { ProjectDashboardBundle } from './project.api';
import type { FinanceDashboardBundle } from './finance.api';
import type { CRMData, CRMDashboard } from './crm.api';
import { canRequestDashboardSection, DashboardSection, FrontendAccessContext } from '@/lib/access/module-contract';

export interface DashboardBootstrap {
  projects?: ProjectDashboardBundle;
  finance?: FinanceDashboardBundle;
  crm?: { data: Partial<CRMData>; dashboard: CRMDashboard };
}

/** Requests only the sections needed for the currently visible dashboard role. */
export async function loadDashboardBootstrap(sections: DashboardSection[], access: FrontendAccessContext = {}): Promise<DashboardBootstrap> {
  if (!sections.length) return {};
  const denied = sections.filter((section) => !canRequestDashboardSection(section, access));
  if (denied.length) {
    throw new Error(`Section dashboard tidak sesuai kontrak akses aktif: ${denied.join(', ')}.`);
  }
  const response = await api.get('/api/v1/dashboard/bootstrap', {
    params: { sections: sections.join(',') },
    timeout: 30_000,
  });
  return response.data?.data || response.data || {};
}
