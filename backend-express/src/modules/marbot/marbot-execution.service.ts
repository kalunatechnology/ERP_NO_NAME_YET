import type { Request } from 'express';
import type { MarbotAction } from './marbot-action.service';
import { ValidationError } from '../../utils/errors';

/** Calls the same authenticated HTTP pipeline as the ERP UI. No caller-selected origin or route. */
export async function executeCanonicalAction(req: Request, action: MarbotAction, ticketId: string) {
  const routes: Record<string, string> = {
    'project.create': 'projects', 'task.create': 'main-tasks',
    'weekly.create': 'weekly-tasks', 'daily.create': 'daily-tasks',
  };
  const port = req.socket.localPort;
  if (!port || !req.headers.authorization) throw new ValidationError('Koneksi API lokal tidak tersedia.');
  const base = `http://127.0.0.1:${port}/api/v1/projects/`;
  const headers = { Authorization: req.headers.authorization, 'X-Company-ID': req.companyId!,
    'Content-Type': 'application/json', 'Idempotency-Key': `marbot-${ticketId}` };
  const call = async (path: string, method = 'GET', body?: unknown) => {
    const response = await fetch(base + path, { method, headers, redirect: 'error',
      signal: AbortSignal.timeout(30000), ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    if (!response.ok) throw new Error(`API ERP menolak/gagal (${response.status}). Hasil belum terverifikasi; periksa modul terkait sebelum mengulang.`);
    return await response.json() as Record<string, any>;
  };
  let path: string;
  let record: Record<string, any>;
  if (action.kind === 'task.assign') {
    const { id, user_ids } = action.payload;
    if (typeof id !== 'string' || !Array.isArray(user_ids)) throw new ValidationError('Assignment tidak valid.');
    await call(`main-tasks/${encodeURIComponent(id)}/assign_members`, 'POST', { user_ids });
    // Read each intended assignment with a bounded, scoped query. Never infer success from POST alone.
    for (const userId of user_ids) {
      const result = await call(`task-assignments/?main_task_id=${encodeURIComponent(id)}&assignee_id=${encodeURIComponent(String(userId))}&page_size=1`);
      if (!Array.isArray(result.results) || !result.results.some((row: any) => row.main_task_id === id && row.assignee_id === userId)) throw new Error('Assignment belum dapat diverifikasi.');
    }
    return `Assignment ${user_ids.length} user pada Main Task ${id} terverifikasi melalui pembacaan ulang ERP.`;
  } else if (Object.prototype.hasOwnProperty.call(routes, action.kind)) {
    path = `${routes[action.kind]}/`;
    record = await call(path, 'POST', action.payload);
    if (typeof record.id !== 'string') throw new Error('API belum mengembalikan identitas hasil.');
    path += encodeURIComponent(record.id) + '/';
  } else if (action.kind === 'task.update' && typeof action.payload.id === 'string') {
    const { id, ...payload } = action.payload;
    path = `daily-tasks/${encodeURIComponent(id)}/`;
    record = await call(path + 'update_progress', 'PATCH', payload);
  } else throw new ValidationError('Operasi tidak didukung.');
  const actual = await call(path);
  if (!actual.id || actual.id !== record.id) throw new Error('Identitas pembacaan ulang tidak cocok.');
  const fields = action.kind === 'project.create' ? ['project_name', 'customer_name', 'manager_name']
    : action.kind === 'task.create' ? ['project_id', 'name', 'weight']
    : action.kind === 'weekly.create' ? ['main_task_id', 'assignee_id', 'target_description', 'week_number', 'start_date', 'end_date']
    : action.kind === 'daily.create' ? ['weekly_task_id', 'title', 'output_target', 'time_slot']
    : ['output_result', 'notes', 'block_reason'];
  for (const field of fields) {
    const actualValue = action.kind === 'weekly.create' && ['start_date', 'end_date'].includes(field)
      && typeof actual[field] === 'string' ? actual[field].slice(0, 10) : actual[field];
    if (action.payload[field] !== undefined && String(actualValue) !== String(action.payload[field])) {
      throw new Error(`Pembacaan ulang field ${field} belum cocok. Periksa hasil di ERP sebelum mengulang.`);
    }
  }
  return `Hasil tersimpan dan dibaca ulang dari ERP: ${actual.id}.\nStatus aktual: ${String(actual.status ?? 'tidak tersedia')}.\n${String(actual.project_name ?? actual.name ?? actual.title ?? actual.target_description ?? '')}`;
}
