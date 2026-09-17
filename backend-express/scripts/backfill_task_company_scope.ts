import {
  Prisma,
  PrismaClient,
} from '@prisma/client';

const prisma = new PrismaClient();

const APPLY =
  process.argv.includes('--apply');

type DbClient =
  Prisma.TransactionClient;

type Scope = {
  tenant_id: string;
  company_id: string;
};

function sameScope(
  record: {
    tenant_id: string | null;
    company_id: string | null;
  },
  parent: Scope,
) {
  return (
    record.tenant_id === parent.tenant_id &&
    record.company_id === parent.company_id
  );
}

async function repairHierarchy(
  tx: DbClient,
  apply: boolean,
) {
  let mainTaskFixes = 0;
  let assignmentFixes = 0;
  let weeklyFixes = 0;
  let dailyFixes = 0;

  const resolvedMainScopes = new Map<string, Scope>();
  const resolvedWeeklyScopes = new Map<string, Scope>();

  // ============================================================
  // 1. MAIN TASK <- PROJECT
  // ============================================================

  const mainTasks =
    await tx.project_main_task.findMany({
      select: {
        id: true,
        project_id: true,
        tenant_id: true,
        company_id: true,
      },
    });

  for (const task of mainTasks) {
    const project =
      await tx.project_project.findUnique({
        where: {
          id: task.project_id,
        },
        select: {
          id: true,
          tenant_id: true,
          company_id: true,
        },
      });

    if (
      !project ||
      !project.tenant_id ||
      !project.company_id
    ) {
      throw new Error(
        `Main Task ${task.id} memiliki parent project tanpa scope yang valid.`,
      );
    }

    const expected: Scope = {
      tenant_id: project.tenant_id,
      company_id: project.company_id,
    };

    resolvedMainScopes.set(task.id, expected);

    if (!sameScope(task, expected)) {
      mainTaskFixes++;

      if (apply) {
        await tx.project_main_task.update({
          where: {
            id: task.id,
          },
          data: expected,
        });
      }
    }
  }

  // ============================================================
  // 2. TASK ASSIGNMENT <- MAIN TASK
  // ============================================================

  const assignments =
    await tx.project_task_assignment.findMany({
      select: {
        id: true,
        main_task_id: true,
        assignee_id: true,
        tenant_id: true,
        company_id: true,
      },
    });

  for (const assignment of assignments) {
    let expected = resolvedMainScopes.get(assignment.main_task_id);

    if (!expected) {
      const mainTask =
        await tx.project_main_task.findUnique({
          where: {
            id: assignment.main_task_id,
          },
          select: {
            tenant_id: true,
            company_id: true,
          },
        });

      if (mainTask?.tenant_id && mainTask.company_id) {
        expected = {
          tenant_id: mainTask.tenant_id,
          company_id: mainTask.company_id,
        };
      }
    }

    if (!expected) {
      throw new Error(
        `Task Assignment ${assignment.id} memiliki Main Task tanpa scope.`,
      );
    }

    if (!sameScope(assignment, expected)) {
      /**
       * Protect composite unique:
       * company_id + main_task_id + assignee_id
       */
      const duplicate =
        await tx.project_task_assignment.findFirst({
          where: {
            id: {
              not: assignment.id,
            },

            company_id:
              expected.company_id,

            main_task_id:
              assignment.main_task_id,

            assignee_id:
              assignment.assignee_id,
          },

          select: {
            id: true,
          },
        });

      if (duplicate) {
        throw new Error(
          `Duplicate assignment terdeteksi: ${assignment.id} bentrok dengan ${duplicate.id}.`,
        );
      }

      assignmentFixes++;

      if (apply) {
        await tx.project_task_assignment.update({
          where: {
            id: assignment.id,
          },
          data: expected,
        });
      }
    }
  }

  // ============================================================
  // 3. WEEKLY TASK <- MAIN TASK
  // ============================================================

  const weeklyTasks =
    await tx.project_weekly_task.findMany({
      select: {
        id: true,
        main_task_id: true,
        tenant_id: true,
        company_id: true,
      },
    });

  for (const weekly of weeklyTasks) {
    let expected = resolvedMainScopes.get(weekly.main_task_id);

    if (!expected) {
      const mainTask =
        await tx.project_main_task.findUnique({
          where: {
            id: weekly.main_task_id,
          },
          select: {
            tenant_id: true,
            company_id: true,
          },
        });

      if (mainTask?.tenant_id && mainTask.company_id) {
        expected = {
          tenant_id: mainTask.tenant_id,
          company_id: mainTask.company_id,
        };
      }
    }

    if (!expected) {
      throw new Error(
        `Weekly Task ${weekly.id} memiliki Main Task tanpa scope.`,
      );
    }

    resolvedWeeklyScopes.set(weekly.id, expected);

    if (!sameScope(weekly, expected)) {
      weeklyFixes++;

      if (apply) {
        await tx.project_weekly_task.update({
          where: {
            id: weekly.id,
          },
          data: expected,
        });
      }
    }
  }

  // ============================================================
  // 4. DAILY TASK <- WEEKLY TASK
  // ============================================================

  const dailyTasks =
    await tx.project_daily_task.findMany({
      select: {
        id: true,
        weekly_task_id: true,
        tenant_id: true,
        company_id: true,
      },
    });

  for (const daily of dailyTasks) {
    let expected = resolvedWeeklyScopes.get(daily.weekly_task_id);

    if (!expected) {
      const weekly =
        await tx.project_weekly_task.findUnique({
          where: {
            id: daily.weekly_task_id,
          },
          select: {
            tenant_id: true,
            company_id: true,
          },
        });

      if (weekly?.tenant_id && weekly.company_id) {
        expected = {
          tenant_id: weekly.tenant_id,
          company_id: weekly.company_id,
        };
      }
    }

    if (!expected) {
      throw new Error(
        `Daily Task ${daily.id} memiliki Weekly Task tanpa scope.`,
      );
    }

    if (!sameScope(daily, expected)) {
      dailyFixes++;

      if (apply) {
        await tx.project_daily_task.update({
          where: {
            id: daily.id,
          },
          data: expected,
        });
      }
    }
  }

  return {
    mainTaskFixes,
    assignmentFixes,
    weeklyFixes,
    dailyFixes,

    total:
      mainTaskFixes +
      assignmentFixes +
      weeklyFixes +
      dailyFixes,
  };
}

async function main() {
  console.log(
    APPLY
      ? '=== APPLY TASK COMPANY/TENANT BACKFILL ==='
      : '=== DRY RUN TASK COMPANY/TENANT BACKFILL ===',
  );

  const result =
    await prisma.$transaction(
      async (tx) =>
        repairHierarchy(
          tx,
          APPLY,
        ),
      { maxWait: 20000, timeout: 60000 },
    );

  console.table(result);

  if (!APPLY) {
    console.log('');
    console.log(
      'Dry-run selesai. Tidak ada data yang diubah.',
    );
    console.log(
      'Jika hasilnya benar, jalankan kembali dengan --apply',
    );

    return;
  }

  const [
    invalidMain,
    invalidAssignment,
    invalidWeekly,
    invalidDaily,
  ] = await Promise.all([
    prisma.project_main_task.count({
      where: {
        OR: [
          { tenant_id: null },
          { company_id: null },
        ],
      },
    }),

    prisma.project_task_assignment.count({
      where: {
        OR: [
          { tenant_id: null },
          { company_id: null },
        ],
      },
    }),

    prisma.project_weekly_task.count({
      where: {
        OR: [
          { tenant_id: null },
          { company_id: null },
        ],
      },
    }),

    prisma.project_daily_task.count({
      where: {
        OR: [
          { tenant_id: null },
          { company_id: null },
        ],
      },
    }),
  ]);

  console.table({
    invalidMain,
    invalidAssignment,
    invalidWeekly,
    invalidDaily,
  });

  if (
    invalidMain ||
    invalidAssignment ||
    invalidWeekly ||
    invalidDaily
  ) {
    throw new Error(
      'Backfill selesai tetapi masih terdapat task tanpa scope.',
    );
  }

  console.log(
    '✓ Seluruh task hierarchy sudah memiliki tenant/company scope.',
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
