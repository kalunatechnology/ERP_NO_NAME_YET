import { NextFunction, Request, Response } from 'express';
import prisma from '../../config/database';
import { RoleCode } from '../../types/roles';
import { ForbiddenError, NotFoundError, UnauthorizedError } from '../../utils/errors';
import { ProjectsService } from './projects.service';

const SELF_SERVICE_MUTATIONS: Array<{ path: RegExp; methods?: string[] }> = [
  { path: /^\/daily-tasks\/[^/]+\/(update[-_]progress|report[-_]blocked|request[-_]transfer)\/?$/ },
  { path: /^\/daily-tasks\/?$/, methods: ['POST'] },
  { path: /^\/daily-tasks\/[^/]+\/?$/, methods: ['PUT', 'PATCH', 'DELETE'] },
  { path: /^\/task-transfers\/[^/]+\/cancel\/?$/, methods: ['POST'] },
  { path: /^\/timesheets(?:\/[^/]+)?\/?$/ },
];

function matchesSelfService(path: string, method: string): boolean {
  return SELF_SERVICE_MUTATIONS.some((rule) => rule.path.test(path) && (!rule.methods || rule.methods.includes(method)));
}

async function projectIdForMutation(path: string, req: Request, companyId: string): Promise<string | null> {
  let match = path.match(/^\/projects\/([^/]+)(?:\/.*)?$/);
  if (match) {
    if (['funding_requests', 'update_financials', 'advance_stage', 'advance-stage'].some((segment) => path.includes(`/${segment}`))) return null;
    if (path === `/projects/${match[1]}` || path === `/projects/${match[1]}/`) return req.method === 'DELETE' ? null : match[1];
    return match[1];
  }

  match = path.match(/^\/main-tasks\/([^/]+)/);
  if (match) {
    const task = await prisma.project_main_task.findFirst({ where: { id: match[1], company_id: companyId }, select: { project_id: true } });
    if (!task) throw new NotFoundError('MainTask');
    return task.project_id;
  }
  if (/^\/main-tasks\/?$/.test(path) && req.method === 'POST') return String(req.body.project_id ?? req.body.project ?? '') || null;

  match = path.match(/^\/weekly-tasks\/([^/]+)/);
  if (match) {
    const weekly = await prisma.project_weekly_task.findFirst({ where: { id: match[1], company_id: companyId }, select: { main_task_id: true } });
    if (!weekly) throw new NotFoundError('WeeklyTask');
    const main = await prisma.project_main_task.findFirst({ where: { id: weekly.main_task_id, company_id: companyId }, select: { project_id: true } });
    return main?.project_id ?? null;
  }
  if (/^\/weekly-tasks\/?$/.test(path) && req.method === 'POST') {
    const mainTaskId = String(req.body.main_task_id ?? req.body.main_task ?? '');
    const main = await prisma.project_main_task.findFirst({ where: { id: mainTaskId, company_id: companyId }, select: { project_id: true } });
    return main?.project_id ?? null;
  }

  match = path.match(/^\/daily-tasks\/([^/]+)\/direct[-_]reassign\/?$/);
  if (match) return (await ProjectsService.assertCanManageDailyTask(match[1], req.user, companyId)).projectId;

  match = path.match(/^\/task-transfers\/([^/]+)\/(approve|reject)\/?$/);
  if (match) {
    const transfer = await prisma.project_task_transfer_request.findFirst({ where: { id: match[1], company_id: companyId }, select: { daily_task_id: true } });
    if (!transfer?.daily_task_id) throw new NotFoundError('TaskTransferRequest');
    return (await ProjectsService.assertCanManageDailyTask(transfer.daily_task_id, req.user, companyId)).projectId;
  }

  match = path.match(/^\/milestones\/([^/]+)/);
  if (match) {
    const milestone = await prisma.project_milestone.findFirst({ where: { id: match[1], company_id: companyId }, select: { project_id: true } });
    if (!milestone) throw new NotFoundError('Milestone');
    return milestone.project_id;
  }
  if (/^\/milestones\/?$/.test(path) && req.method === 'POST') return String(req.body.project_id ?? req.body.project ?? '') || null;

  match = path.match(/^\/task-assignments\/([^/]+)/);
  if (match) {
    const assignment = await prisma.project_task_assignment.findFirst({ where: { id: match[1], company_id: companyId }, select: { main_task_id: true } });
    if (!assignment) throw new NotFoundError('TaskAssignment');
    const main = await prisma.project_main_task.findFirst({ where: { id: assignment.main_task_id, company_id: companyId }, select: { project_id: true } });
    return main?.project_id ?? null;
  }
  return null;
}

/** Defense-in-depth bridge for Staff/Supervisor with project-scoped Acting PM authority. */
export async function restrictProjectMutationsByAuthority(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.user) return next(new UnauthorizedError());
    const method = req.method.toUpperCase();
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return next();
    const role = req.user.active_role_code ?? req.user.roles?.[0] ?? '';
    if (!([RoleCode.STAFF, RoleCode.SUPERVISOR] as RoleCode[]).includes(role as RoleCode)) return next();

    const path = req.path.replace(/\/+$/, '') || '/';
    if (matchesSelfService(path, method)) return next();
    if (!req.companyId) throw new ForbiddenError('Pilih company sebelum mengubah data proyek.');
    if (/^\/projects\/?$/.test(path) && method === 'POST') {
      throw new ForbiddenError('Project Supervisor tidak dapat membuat project.');
    }

    const projectId = await projectIdForMutation(path, req, req.companyId);
    if (!projectId) {
      throw new ForbiddenError('Mutation ini tidak termasuk kewenangan operasional Project Supervisor.');
    }
    await ProjectsService.assertCanManageProject(req.user, projectId, req.companyId);
    return next();
  } catch (error) {
    return next(error);
  }
}
