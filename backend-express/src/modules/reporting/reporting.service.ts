import prisma from '../../config/database';

export interface OperationalSummaryData {
  generated_at: Date;
  projects: {
    total: number;
    active: number;
  };
  tasks: {
    total: number;
    in_progress: number;
    blocked: number;
  };
  milestones: {
    total: number;
    overdue: number;
  };
}

export class ReportingService {
  /**
   * Builds an operational summary snapshot of projects, daily tasks, and milestones.
   * Shared by live Reporting UI and Management Report document snapshots.
   */
  static async buildOperationalSummary(
    companyId: string,
    options?: { asOf?: Date },
  ): Promise<OperationalSummaryData> {
    const now = options?.asOf ?? new Date();
    const projectWhere = { company_id: companyId };
    const taskWhere = { company_id: companyId };
    const milestoneWhere = { company_id: companyId };

    const [
      projectsTotal,
      projectsActive,
      tasksTotal,
      tasksInProgress,
      tasksBlocked,
      milestonesTotal,
      milestonesOverdue,
    ] = await Promise.all([
      prisma.project_project.count({ where: projectWhere }),
      prisma.project_project.count({
        where: { ...projectWhere, status: { in: ['ACTIVE', 'IN_PROGRESS'] } },
      }),
      prisma.project_daily_task.count({ where: taskWhere }),
      prisma.project_daily_task.count({
        where: { ...taskWhere, status: 'IN_PROGRESS' },
      }),
      prisma.project_daily_task.count({
        where: { ...taskWhere, OR: [{ is_blocked: true }, { status: 'BLOCKED' }] },
      }),
      prisma.project_milestone.count({ where: milestoneWhere }),
      prisma.project_milestone.count({
        where: {
          ...milestoneWhere,
          planned_date: { lt: now },
          status: { notIn: ['COMPLETED', 'DONE'] },
        },
      }),
    ]);

    return {
      generated_at: now,
      projects: { total: projectsTotal, active: projectsActive },
      tasks: { total: tasksTotal, in_progress: tasksInProgress, blocked: tasksBlocked },
      milestones: { total: milestonesTotal, overdue: milestonesOverdue },
    };
  }
}
