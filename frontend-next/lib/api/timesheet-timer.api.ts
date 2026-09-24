import api from './axios';

export interface StaffTimerSession {
  id: string;
  project_id: string | null;
  task_id: string | null;
  work_date: string | null;
  hours: number | string | null;
  overtime_hours: number | string | null;
  overtime_reason?: string | null;
  work_started_at?: string | null;
  work_ended_at?: string | null;
  last_activity_at?: string | null;
  attendance_source?: 'WEB' | 'MOBILE_WEB' | string | null;
  overtime_started_at?: string | null;
  overtime_ended_at?: string | null;
  evidence_url?: string | null;
  approval_status: string;
}

export interface StaffTimerSnapshot {
  session: StaffTimerSession | null;
  server_now: string;
}

export interface StartStaffTimerPayload {
  project_id: string;
  task_id?: string;
  work_date: string;
}

export interface SubmitStaffTimerPayload {
  overtime_reason?: string;
  evidence_url?: string;
}

export async function getActiveStaffTimer(): Promise<StaffTimerSnapshot> {
  const { data } = await api.get('/api/v1/projects/timesheets/timer/active');
  return data;
}

export async function startStaffTimer(payload: StartStaffTimerPayload): Promise<StaffTimerSnapshot> {
  const { data } = await api.post('/api/v1/projects/timesheets/timer/start', payload);
  return data;
}

export async function stopStaffTimer(): Promise<StaffTimerSnapshot> {
  const { data } = await api.post('/api/v1/projects/timesheets/timer/stop', {});
  return data;
}

export async function startStaffOvertimeTimer(): Promise<StaffTimerSnapshot> {
  const { data } = await api.post('/api/v1/projects/timesheets/timer/overtime/start', {});
  return data;
}

export async function stopStaffOvertimeTimer(): Promise<StaffTimerSnapshot> {
  const { data } = await api.post('/api/v1/projects/timesheets/timer/overtime/stop', {});
  return data;
}

export async function submitStaffTimer(payload: SubmitStaffTimerPayload): Promise<StaffTimerSnapshot> {
  const { data } = await api.post('/api/v1/projects/timesheets/timer/submit', payload);
  return data;
}

export async function cancelActiveStaffTimer(): Promise<void> {
  await api.delete('/api/v1/projects/timesheets/timer/active');
}
