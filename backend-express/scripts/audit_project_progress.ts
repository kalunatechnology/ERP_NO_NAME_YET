/**
 * Audits the persisted WBS progress hierarchy without modifying database data.
 *
 * The report identifies projects that display non-zero progress without a real
 * Main Task and legacy Main/Weekly records that can bypass automatic roll-up.
 */
import prisma from '../src/config/database';

/** Reads progress-integrity indicators and emits a credential-free JSON report. */
async function main(): Promise<void> {
  const projects = await prisma.project_project.findMany({
    select: {
      id: true,
      project_name: true,
      progress_percent: true,
    },
    orderBy: { project_name: 'asc' },
  });

  const [mainOverrides, weeklyOverrides, mainCount, weeklyCount, dailyCount, mainTaskGroups] = await prisma.$transaction([
    prisma.project_main_task.count({ where: { is_progress_overridden: true } }),
    prisma.project_weekly_task.count({ where: { is_progress_overridden: true } }),
    prisma.project_main_task.count(),
    prisma.project_weekly_task.count(),
    prisma.project_daily_task.count(),
    prisma.project_main_task.findMany({ select: { project_id: true } }),
  ]);

  const projectIdsWithMainTasks = new Set(mainTaskGroups.map((task) => task.project_id));

  const orphanProgress = projects
    .filter((project) => !projectIdsWithMainTasks.has(project.id) && Number(project.progress_percent ?? 0) !== 0)
    .map((project) => ({
      id: project.id,
      name: project.project_name,
      persisted_progress: Number(project.progress_percent ?? 0),
      main_tasks: 0,
    }));

  console.log(JSON.stringify({
    status: orphanProgress.length === 0 && mainOverrides === 0 && weeklyOverrides === 0 ? 'PASS' : 'VIOLATION_FOUND',
    totals: { projects: projects.length, main_tasks: mainCount, weekly_tasks: weeklyCount, daily_tasks: dailyCount },
    orphan_project_progress: orphanProgress,
    active_manual_overrides: { main_tasks: mainOverrides, weekly_tasks: weeklyOverrides },
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
