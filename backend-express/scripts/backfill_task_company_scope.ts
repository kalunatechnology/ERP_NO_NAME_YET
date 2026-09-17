import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type Scope = { tenant_id: string | null; company_id: string | null };

function differs(child: Scope, parent: Scope): boolean {
  return child.tenant_id !== parent.tenant_id || child.company_id !== parent.company_id;
}

async function main() {
  console.log('=== BACKFILL TASK TENANT / COMPANY SCOPE ===');

  let mainUpdated = 0;
  let weeklyUpdated = 0;
  let dailyUpdated = 0;
  let assignmentUpdated = 0;
  let skipped = 0;

  const mainTasks = await prisma.project_main_task.findMany();
  for (const task of mainTasks) {
    const project = await prisma.project_project.findUnique({ where: { id: task.project_id } });
    if (!project?.tenant_id || !project.company_id) {
      skipped += 1;
      console.warn('[skip main] ' + task.id + ': parent project scope incomplete');
      continue;
    }
    if (differs(task, project)) {
      await prisma.project_main_task.update({
        where: { id: task.id },
        data: { tenant_id: project.tenant_id, company_id: project.company_id },
      });
      mainUpdated += 1;
    }
  }

  const weeklyTasks = await prisma.project_weekly_task.findMany();
  for (const task of weeklyTasks) {
    const parent = await prisma.project_main_task.findUnique({ where: { id: task.main_task_id } });
    if (!parent?.tenant_id || !parent.company_id) {
      skipped += 1;
      console.warn('[skip weekly] ' + task.id + ': parent main task scope incomplete');
      continue;
    }
    if (differs(task, parent)) {
      await prisma.project_weekly_task.update({
        where: { id: task.id },
        data: { tenant_id: parent.tenant_id, company_id: parent.company_id },
      });
      weeklyUpdated += 1;
    }
  }

  const dailyTasks = await prisma.project_daily_task.findMany();
  for (const task of dailyTasks) {
    const parent = await prisma.project_weekly_task.findUnique({ where: { id: task.weekly_task_id } });
    if (!parent?.tenant_id || !parent.company_id) {
      skipped += 1;
      console.warn('[skip daily] ' + task.id + ': parent weekly task scope incomplete');
      continue;
    }
    if (differs(task, parent)) {
      await prisma.project_daily_task.update({
        where: { id: task.id },
        data: { tenant_id: parent.tenant_id, company_id: parent.company_id },
      });
      dailyUpdated += 1;
    }
  }

  const assignments = await prisma.project_task_assignment.findMany();
  for (const assignment of assignments) {
    const parent = await prisma.project_main_task.findUnique({ where: { id: assignment.main_task_id } });
    if (!parent?.tenant_id || !parent.company_id) {
      skipped += 1;
      console.warn('[skip assignment] ' + assignment.id + ': parent main task scope incomplete');
      continue;
    }
    if (differs(assignment, parent)) {
      await prisma.project_task_assignment.update({
        where: { id: assignment.id },
        data: { tenant_id: parent.tenant_id, company_id: parent.company_id },
      });
      assignmentUpdated += 1;
    }
  }

  const [mainNull, weeklyNull, dailyNull, assignmentNull] = await Promise.all([
    prisma.project_main_task.count({ where: { OR: [{ tenant_id: null }, { company_id: null }] } }),
    prisma.project_weekly_task.count({ where: { OR: [{ tenant_id: null }, { company_id: null }] } }),
    prisma.project_daily_task.count({ where: { OR: [{ tenant_id: null }, { company_id: null }] } }),
    prisma.project_task_assignment.count({ where: { OR: [{ tenant_id: null }, { company_id: null }] } }),
  ]);

  console.log({ mainUpdated, weeklyUpdated, dailyUpdated, assignmentUpdated, skipped });
  console.log({ remainingNullScope: { mainNull, weeklyNull, dailyNull, assignmentNull } });

  if (mainNull || weeklyNull || dailyNull || assignmentNull) {
    throw new Error('Backfill selesai tetapi masih ada task dengan tenant/company scope null. Periksa record yang di-skip.');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
