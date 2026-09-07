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

export interface DashboardBootstrap {
  projects?: ProjectDashboardBundle;
  finance?: FinanceDashboardBundle;
  crm?: { data: Partial<CRMData>; dashboard: CRMDashboard };
}

/** Requests only the sections needed for the currently visible dashboard role. */
export async function loadDashboardBootstrap(sections: Array<'projects' | 'finance' | 'crm'>): Promise<DashboardBootstrap> {
  if (!sections.length) return {};
  const response = await api.get('/api/v1/dashboard/bootstrap', {
    params: { sections: sections.join(',') },
    timeout: 30_000,
  });
  return response.data?.data || response.data || {};
}
