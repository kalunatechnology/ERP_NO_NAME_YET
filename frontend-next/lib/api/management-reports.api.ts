import api from './axios';

export interface ManagementReport {
  id: string;
  tenant_id: string;
  company_id: string;
  report_number: string;
  title: string;
  report_type: string;
  period_type: string;
  period_start: string;
  period_end: string;
  executive_summary?: string;
  achievements?: string;
  blockers?: string;
  risks?: string;
  decisions_needed?: string;
  next_plan?: string;
  snapshot_json?: any;
  status: 'DRAFT' | 'SUBMITTED' | 'REVISION_REQUESTED' | 'REVIEWED' | 'ARCHIVED';
  prepared_by_id: string;
  submitted_at?: string;
  reviewed_by_id?: string;
  reviewed_at?: string;
  review_note?: string;
  version_number: number;
  parent_report_id?: string;
  created_at: string;
  updated_at: string;
  prepared_by?: {
    id: string;
    full_name?: string;
    email?: string;
  };
  reviewed_by?: {
    id: string;
    full_name?: string;
    email?: string;
  };
}

export async function getManagementReports(params?: { status?: string }): Promise<ManagementReport[]> {
  const query = params?.status ? `?status=${params.status}` : '';
  const res = await api.get(`/api/v1/management-reports/${query}`);
  return res.data?.results || [];
}

export async function getManagementReport(id: string): Promise<ManagementReport> {
  const res = await api.get(`/api/v1/management-reports/${id}/`);
  return res.data;
}

export async function createManagementReport(data: {
  title: string;
  report_type?: string;
  period_type?: string;
  period_start: string;
  period_end: string;
  executive_summary?: string;
  achievements?: string;
  blockers?: string;
  risks?: string;
  decisions_needed?: string;
  next_plan?: string;
}): Promise<ManagementReport> {
  const res = await api.post('/api/v1/management-reports/', data);
  return res.data;
}

export async function updateManagementReport(id: string, data: Partial<{
  title: string;
  period_start: string;
  period_end: string;
  executive_summary: string;
  achievements: string;
  blockers: string;
  risks: string;
  decisions_needed: string;
  next_plan: string;
}>): Promise<ManagementReport> {
  const res = await api.patch(`/api/v1/management-reports/${id}/`, data);
  return res.data;
}

export async function submitManagementReport(id: string): Promise<ManagementReport> {
  const res = await api.post(`/api/v1/management-reports/${id}/submit/`);
  return res.data;
}

export async function requestManagementReportRevision(id: string, reviewNote: string): Promise<ManagementReport> {
  const res = await api.post(`/api/v1/management-reports/${id}/request-revision/`, { review_note: reviewNote });
  return res.data;
}

export async function markManagementReportReviewed(id: string, reviewNote?: string): Promise<ManagementReport> {
  const res = await api.post(`/api/v1/management-reports/${id}/mark-reviewed/`, { review_note: reviewNote });
  return res.data;
}

export async function archiveManagementReport(id: string): Promise<ManagementReport> {
  const res = await api.post(`/api/v1/management-reports/${id}/archive/`);
  return res.data;
}
