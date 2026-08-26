import prisma from '../../config/database';
import { NotFoundError } from '../../utils/errors';

export class ProjectsService {
  static async calculateProjectEVM(projectId: string, asOfDate: Date = new Date()) {
    const project = await prisma.project_project.findUnique({
      where: { id: projectId },
    });
    if (!project) throw new NotFoundError('Project');

    const bac = Number(project.budget_amount ?? 0);
    const rawProg = Number(project.progress_percent ?? 0);
    const actualProgress = rawProg / 100;

    const start = project.planned_start_date ?? project.started_at;
    const end = project.planned_end_date;
    let plannedProgress = actualProgress;

    if (start && end && new Date(end) > new Date(start)) {
      const totalDays = Math.max(1, (new Date(end).getTime() - new Date(start).getTime()) / (1000 * 3600 * 24));
      const elapsedDays = Math.max(0, Math.min(totalDays, (asOfDate.getTime() - new Date(start).getTime()) / (1000 * 3600 * 24)));
      plannedProgress = elapsedDays / totalDays;
    }

    const pv = Math.round(bac * plannedProgress * 100) / 100;
    const ev = Math.round(bac * actualProgress * 100) / 100;

    const [costEntries, expenses] = await Promise.all([
      prisma.fin_project_cost_entry.findMany({
        where: { project_id: projectId },
        select: { total_cost: true },
      }),
      prisma.project_expense.findMany({
        where: { project_id: projectId },
        select: { amount: true },
      }),
    ]);

    const costEntryTotal = costEntries.reduce((sum, c) => sum + Number(c.total_cost ?? 0), 0);
    const expenseTotal = expenses.reduce((sum, e) => sum + Number(e.amount ?? 0), 0);
    const acTotal = Math.max(costEntryTotal, expenseTotal);
    const ac = Math.round(acTotal * 100) / 100;

    const cv = ev - ac;
    const sv = ev - pv;

    const cpi = ac > 0 ? Math.round((ev / ac) * 10000) / 10000 : 1.0;
    const spi = pv > 0 ? Math.round((ev / pv) * 10000) / 10000 : 1.0;

    const eac = cpi > 0 ? Math.round((bac / cpi) * 100) / 100 : bac;
    const vac = bac - eac;

    const healthStatus =
      cpi >= 0.95 && spi >= 0.95
        ? 'GOOD'
        : cpi >= 0.85 || spi >= 0.85
          ? 'WARNING'
          : 'CRITICAL';

    return {
      as_of_date: asOfDate.toISOString().slice(0, 10),
      budget_at_completion: bac,
      planned_progress_pct: Math.round(plannedProgress * 10000) / 100,
      actual_progress_pct: Math.round(actualProgress * 10000) / 100,
      planned_value: pv,
      earned_value: ev,
      actual_cost: ac,
      cost_variance: cv,
      schedule_variance: sv,
      cost_performance_index: cpi,
      schedule_performance_index: spi,
      estimate_at_completion: eac,
      variance_at_completion: vac,
      health_status: healthStatus,
    };
  }

  static async recalculateTaskTree(params: {
    dailyTaskId?: string;
    weeklyTaskId?: string;
    mainTaskId?: string;
    projectId?: string;
  }) {
    return prisma.$transaction(async (tx) => {
      let weeklyId = params.weeklyTaskId;
      let mainId = params.mainTaskId;
      let projId = params.projectId;

      if (params.dailyTaskId) {
        const dt = await tx.project_daily_task.findUnique({
          where: { id: params.dailyTaskId },
        });
        if (dt?.weekly_task_id) weeklyId = dt.weekly_task_id;
      }

      if (weeklyId) {
        const wt = await tx.project_weekly_task.findUnique({
          where: { id: weeklyId },
        });
        if (wt) {
          mainId = wt.main_task_id ?? undefined;
          if (!wt.is_progress_overridden) {
            const dailyTasks = await tx.project_daily_task.findMany({
              where: { weekly_task_id: weeklyId },
            });
            if (dailyTasks.length > 0) {
              const avg =
                dailyTasks.reduce((sum, d) => sum + Number(d.progress ?? 0), 0) /
                dailyTasks.length;
              const rounded = Math.round(avg * 100) / 100;
              await tx.project_weekly_task.update({
                where: { id: weeklyId },
                data: { progress: rounded },
              });
            }
          }
        }
      }

      if (mainId) {
        const mt = await tx.project_main_task.findUnique({
          where: { id: mainId },
        });
        if (mt) {
          projId = mt.project_id ?? undefined;
          if (!mt.is_progress_overridden) {
            const weeklyTasks = await tx.project_weekly_task.findMany({
              where: { main_task_id: mainId },
            });
            if (weeklyTasks.length > 0) {
              const avg =
                weeklyTasks.reduce((sum, w) => sum + Number(w.progress ?? 0), 0) /
                weeklyTasks.length;
              const rounded = Math.round(avg * 100) / 100;
              await tx.project_main_task.update({
                where: { id: mainId },
                data: { progress: rounded },
              });
            }
          }
        }
      }

      if (projId) {
        const mainTasks = await tx.project_main_task.findMany({
          where: { project_id: projId },
        });
        let totalWeight = 0;
        let weightedSum = 0;
        for (const m of mainTasks) {
          const w = Number(m.weight ?? 1.0);
          const p = Number(m.progress ?? 0);
          totalWeight += w;
          weightedSum += p * w;
        }
        const overall = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) / 100 : 0;
        await tx.project_project.update({
          where: { id: projId },
          data: {
            progress_percent: overall,
          },
        });
        return overall;
      }

      return 0;
    });
  }

  static async advanceStage(projectId: string, targetStage?: string) {
    const STAGE_ORDER = ['PLANNED', 'ACTIVE', 'MONITORING', 'CLOSING', 'COMPLETED'];
    const project = await prisma.project_project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundError('Project');

    let nextStage = targetStage;
    if (!nextStage) {
      const currIdx = STAGE_ORDER.indexOf(project.status ?? 'PLANNED');
      nextStage = currIdx >= 0 && currIdx < STAGE_ORDER.length - 1 ? STAGE_ORDER[currIdx + 1] : project.status;
    }

    return prisma.project_project.update({
      where: { id: projectId },
      data: { status: nextStage },
    });
  }

  static async processTransferApproval(transferId: string, approved: boolean, pmUser: any, reviewNote = '') {
    return prisma.$transaction(async (tx) => {
      const transfer = await tx.project_task_transfer_request.findUnique({
        where: { id: transferId },
      });
      if (!transfer) throw new NotFoundError('TaskTransferRequest');

      if (approved) {
        await tx.project_task_transfer_request.update({
          where: { id: transferId },
          data: {
            status: 'APPROVED',
            reviewed_by_id: pmUser?.id,
            reviewed_at: new Date(),
            review_note: reviewNote,
          },
        });
        if (transfer.daily_task_id && transfer.target_user_id) {
          await tx.project_daily_task.update({
            where: { id: transfer.daily_task_id },
            data: { owner_id: transfer.target_user_id },
          });
        }
      } else {
        await tx.project_task_transfer_request.update({
          where: { id: transferId },
          data: {
            status: 'REJECTED',
            reviewed_by_id: pmUser?.id,
            reviewed_at: new Date(),
            review_note: reviewNote,
          },
        });
      }

      return tx.project_task_transfer_request.findUnique({ where: { id: transferId } });
    });
  }
}
