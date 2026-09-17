import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..');

function absolute(rel) {
  return path.join(repoRoot, rel);
}

function read(rel) {
  return fs.readFileSync(absolute(rel), 'utf8');
}

function write(rel, content) {
  const target = absolute(rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const previous = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
  if (previous !== content) {
    fs.writeFileSync(target, content);
    console.log(`[updated] ${rel}`);
  } else {
    console.log(`[unchanged] ${rel}`);
  }
}

function replaceExact(rel, oldText, newText, alreadyAppliedMarker = newText) {
  const source = read(rel);
  if (source.includes(alreadyAppliedMarker)) {
    console.log(`[skip] ${rel} already contains requested change`);
    return;
  }
  if (!source.includes(oldText)) {
    throw new Error(`Patch anchor not found in ${rel}: ${oldText.slice(0, 140)}`);
  }
  write(rel, source.replace(oldText, newText));
}

function replaceRegex(rel, regex, replacement, alreadyAppliedMarker) {
  const source = read(rel);
  if (alreadyAppliedMarker && source.includes(alreadyAppliedMarker)) {
    console.log(`[skip] ${rel} already contains requested change`);
    return;
  }
  const next = source.replace(regex, replacement);
  if (next === source) {
    throw new Error(`Regex patch anchor not found in ${rel}: ${regex}`);
  }
  write(rel, next);
}

// -----------------------------------------------------------------------------
// 1. Employee provisioning service
// -----------------------------------------------------------------------------
write(
  'backend-express/src/modules/master_data/employee-provisioning.service.ts',
`/**
 * Central user -> employee provisioning boundary.
 *
 * Every active non-Super Admin company user must have exactly one
 * master_employee mapping for the active company. Super Admin remains a
 * platform identity and is intentionally not materialized as an employee.
 */
import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { ForbiddenError, NotFoundError } from '../../utils/errors';
import { RoleCode } from '../../types/roles';

type EnsureEmployeeInput = {
  userId: string;
  tenantId: string;
  companyId: string;
  actorId?: string | null;
};

export class EmployeeProvisioningService {
  static async ensureForUser(
    input: EnsureEmployeeInput,
    tx?: Prisma.TransactionClient,
  ) {
    if (tx) return this.ensureWithinTransaction(input, tx);
    return prisma.$transaction((transaction) =>
      this.ensureWithinTransaction(input, transaction),
    );
  }

  private static async ensureWithinTransaction(
    input: EnsureEmployeeInput,
    db: Prisma.TransactionClient,
  ) {
    const { userId, tenantId, companyId, actorId } = input;

    const user = await db.iam_user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        tenant_id: true,
        is_active: true,
        is_superuser: true,
      },
    });
    if (!user) throw new NotFoundError('User');
    if (!user.is_active) throw new ForbiddenError('User tidak aktif.');
    if (user.tenant_id && user.tenant_id !== tenantId) {
      throw new ForbiddenError('User berada pada tenant yang berbeda.');
    }

    if (user.is_superuser) return null;

    const superAdminRole = await db.iam_role.findFirst({
      where: { tenant_id: tenantId, role_code: RoleCode.SUPER_ADMIN },
      select: { id: true },
    });
    if (superAdminRole) {
      const assignment = await db.iam_user_role.findFirst({
        where: { user_id: userId, role_id: superAdminRole.id },
        select: { id: true },
      });
      if (assignment) return null;
    }

    const membership = await db.iam_user_company_membership.findFirst({
      where: {
        user_id: userId,
        tenant_id: tenantId,
        company_id: companyId,
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    if (!membership) {
      throw new ForbiddenError('User tidak memiliki membership aktif pada company ini.');
    }

    const existing = await db.master_employee.findFirst({
      where: { tenant_id: tenantId, company_id: companyId, user_id: userId },
    });
    if (existing) {
      await this.syncProjectMemberships(db, tenantId, companyId, userId, existing.id);
      return existing;
    }

    // Transitional compatibility: claim only an explicit legacy employee_id
    // already stored on this user's active project membership. Never infer
    // identity from names, usernames, emails, or coincidentally equal IDs.
    const projectMember = await db.project_member.findFirst({
      where: {
        tenant_id: tenantId,
        company_id: companyId,
        user_id: userId,
        employee_id: { not: null },
        status: 'ACTIVE',
      },
      select: { employee_id: true },
      orderBy: { assigned_at: 'desc' },
    });

    if (projectMember?.employee_id) {
      const legacy = await db.master_employee.findFirst({
        where: {
          id: projectMember.employee_id,
          tenant_id: tenantId,
          company_id: companyId,
        },
      });
      if (legacy?.user_id === userId) return legacy;
      if (legacy && !legacy.user_id) {
        const linked = await db.master_employee.update({
          where: { id: legacy.id },
          data: { user_id: userId },
        });
        await this.syncProjectMemberships(db, tenantId, companyId, userId, linked.id);
        return linked;
      }
      if (legacy?.user_id && legacy.user_id !== userId) {
        throw new ForbiddenError('Employee yang terhubung ke project sudah dimiliki user lain.');
      }
    }

    const employeeNumber = 'EMP-' + userId.replace(/-/g, '').slice(0, 12).toUpperCase();
    const employee = await db.master_employee.upsert({
      where: {
        company_id_user_id: {
          company_id: companyId,
          user_id: userId,
        },
      },
      update: {
        tenant_id: tenantId,
        employment_status: 'ACTIVE',
      },
      create: {
        tenant_id: tenantId,
        company_id: companyId,
        user_id: userId,
        employee_number: employeeNumber,
        employment_status: 'ACTIVE',
        created_by_id: actorId ?? userId,
      },
    });

    await this.syncProjectMemberships(db, tenantId, companyId, userId, employee.id);
    return employee;
  }

  private static async syncProjectMemberships(
    db: Prisma.TransactionClient,
    tenantId: string,
    companyId: string,
    userId: string,
    employeeId: string,
  ) {
    await db.project_member.updateMany({
      where: {
        tenant_id: tenantId,
        company_id: companyId,
        user_id: userId,
        status: 'ACTIVE',
        employee_id: null,
      },
      data: { employee_id: employeeId },
    });
  }
}
`,
);

// -----------------------------------------------------------------------------
// 2. Backfill scripts
// -----------------------------------------------------------------------------
write(
  'backend-express/scripts/backfill_task_company_scope.ts',
`import { PrismaClient } from '@prisma/client';

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
`,
);

write(
  'backend-express/scripts/backfill_employee_profiles.ts',
`import prisma from '../src/config/database';
import { EmployeeProvisioningService } from '../src/modules/master_data/employee-provisioning.service';

async function main() {
  const memberships = await prisma.iam_user_company_membership.findMany({
    where: { status: 'ACTIVE' },
    select: { user_id: true, tenant_id: true, company_id: true },
  });

  let linked = 0;
  let skipped = 0;
  let failed = 0;

  for (const membership of memberships) {
    try {
      const employee = await EmployeeProvisioningService.ensureForUser({
        userId: membership.user_id,
        tenantId: membership.tenant_id,
        companyId: membership.company_id,
        actorId: null,
      });
      if (employee) linked += 1;
      else skipped += 1;
    } catch (error) {
      failed += 1;
      console.error('[failed] user=' + membership.user_id, error);
    }
  }

  console.log({ memberships: memberships.length, linked, skippedSuperAdmin: skipped, failed });
  if (failed) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
`,
);

// -----------------------------------------------------------------------------
// 3. Seeder task scope repair
// -----------------------------------------------------------------------------
const seedPath = 'backend-express/scripts/seed_sinergi_muda_arsa.ts';
replaceExact(
  seedPath,
  `        data: {\n          company_id: companySMA.id,`,
  `        data: {\n          tenant_id: tenantSMA.id,\n          company_id: companySMA.id,`,
  `          tenant_id: tenantSMA.id,\n          company_id: companySMA.id,\n          project_name: pd.name,`,
);
replaceExact(
  seedPath,
  `          data: {\n            id: crypto.randomUUID(),\n            project_id: proj.id,`,
  `          data: {\n            id: crypto.randomUUID(),\n            tenant_id: proj.tenant_id ?? tenantSMA.id,\n            company_id: proj.company_id ?? companySMA.id,\n            project_id: proj.id,`,
  `            tenant_id: proj.tenant_id ?? tenantSMA.id,\n            company_id: proj.company_id ?? companySMA.id,\n            project_id: proj.id,`,
);
replaceExact(
  seedPath,
  `          data: {\n            id: crypto.randomUUID(),\n            main_task_id: mainTask.id,\n            assignee_id: mt.assignee.id,\n            assigned_at: new Date(),`,
  `          data: {\n            id: crypto.randomUUID(),\n            tenant_id: proj.tenant_id ?? tenantSMA.id,\n            company_id: proj.company_id ?? companySMA.id,\n            main_task_id: mainTask.id,\n            assignee_id: mt.assignee.id,\n            assigned_at: new Date(),`,
  `            company_id: proj.company_id ?? companySMA.id,\n            main_task_id: mainTask.id,\n            assignee_id: mt.assignee.id,`,
);
replaceExact(
  seedPath,
  `          data: {\n            id: crypto.randomUUID(),\n            main_task_id: mainTask.id,\n            assignee_id: mt.assignee.id,\n            week_number: 1,`,
  `          data: {\n            id: crypto.randomUUID(),\n            tenant_id: proj.tenant_id ?? tenantSMA.id,\n            company_id: proj.company_id ?? companySMA.id,\n            main_task_id: mainTask.id,\n            assignee_id: mt.assignee.id,\n            week_number: 1,`,
  `            company_id: proj.company_id ?? companySMA.id,\n            main_task_id: mainTask.id,\n            assignee_id: mt.assignee.id,\n            week_number: 1,`,
);
replaceExact(
  seedPath,
  `            data: {\n              id: crypto.randomUUID(),\n              weekly_task_id: weeklyTask.id,\n              owner_id: dt.assignee.id,`,
  `            data: {\n              id: crypto.randomUUID(),\n              tenant_id: proj.tenant_id ?? tenantSMA.id,\n              company_id: proj.company_id ?? companySMA.id,\n              weekly_task_id: weeklyTask.id,\n              owner_id: dt.assignee.id,`,
  `              company_id: proj.company_id ?? companySMA.id,\n              weekly_task_id: weeklyTask.id,\n              owner_id: dt.assignee.id,`,
);

// -----------------------------------------------------------------------------
// 4. Accounts: provision employee atomically on user invite/link
// -----------------------------------------------------------------------------
const accountsPath = 'backend-express/src/modules/accounts/accounts.service.ts';
replaceExact(
  accountsPath,
  `import { Prisma } from '@prisma/client';`,
  `import { Prisma } from '@prisma/client';\nimport { EmployeeProvisioningService } from '../master_data/employee-provisioning.service';`,
  `EmployeeProvisioningService } from '../master_data/employee-provisioning.service'`,
);
replaceExact(
  accountsPath,
  `      if (!created.active_role_id && roles.length > 0) {\n        await tx.iam_user.update({\n          where: { id: created.id },\n          data: { active_role_id: roles[0].id },\n        });\n      }\n\n      return created;`,
  `      if (!created.active_role_id && roles.length > 0) {\n        await tx.iam_user.update({\n          where: { id: created.id },\n          data: { active_role_id: roles[0].id },\n        });\n      }\n\n      await EmployeeProvisioningService.ensureForUser(\n        {\n          userId: created.id,\n          tenantId,\n          companyId,\n          actorId: actorId ?? null,\n        },\n        tx,\n      );\n\n      return created;`,
  `await EmployeeProvisioningService.ensureForUser(\n        {\n          userId: created.id,`,
);

// -----------------------------------------------------------------------------
// 5. Projects service: broaden read visibility without broadening mutation rights
// -----------------------------------------------------------------------------
const projectServicePath = 'backend-express/src/modules/projects/projects.service.ts';
const accessBlock = `  private static async operationalTaskVisibility(user: any, companyId: string, db: any = prisma) {\n    const userId = user?.id as string | undefined;\n    if (!userId || !this.isOperationalAssignee(user)) {\n      return {\n        memberProjectIds: [] as string[],\n        readableProjectIds: [] as string[],\n        readableMainTaskIds: [] as string[],\n        readableWeeklyTaskIds: [] as string[],\n        teamWeeklyTaskIds: [] as string[],\n        hasTeamRelation: false,\n      };\n    }\n\n    const tenantWhere = user?.tenant_id ? { tenant_id: user.tenant_id } : {};\n    const scoped = { company_id: companyId, ...tenantWhere };\n\n    const [memberships, assignments, weeklyAssignments, ownedDailyTasks] = await Promise.all([\n      db.project_member.findMany({\n        where: { ...scoped, user_id: userId, status: 'ACTIVE' },\n        select: { project_id: true },\n      }),\n      db.project_task_assignment.findMany({\n        where: { ...scoped, assignee_id: userId },\n        select: { main_task_id: true },\n      }),\n      db.project_weekly_task.findMany({\n        where: { ...scoped, assignee_id: userId },\n        select: { id: true, main_task_id: true },\n      }),\n      db.project_daily_task.findMany({\n        where: { ...scoped, owner_id: userId },\n        select: { weekly_task_id: true },\n      }),\n    ]);\n\n    const unique = (values: Array<string | null | undefined>) => [...new Set(values.filter((value): value is string => Boolean(value)))];\n    const memberProjectIds = unique(memberships.map((item: { project_id: string | null }) => item.project_id));\n    const assignedMainTaskIds = unique(assignments.map((item: { main_task_id: string }) => item.main_task_id));\n    const assignedWeeklyTaskIds = unique(weeklyAssignments.map((item: { id: string }) => item.id));\n    const ownedWeeklyTaskIds = unique(ownedDailyTasks.map((item: { weekly_task_id: string }) => item.weekly_task_id));\n\n    const hierarchyWeeklyIds = unique([...assignedWeeklyTaskIds, ...ownedWeeklyTaskIds]);\n    const hierarchyWeeklyRows = hierarchyWeeklyIds.length\n      ? await db.project_weekly_task.findMany({\n          where: { ...scoped, id: { in: hierarchyWeeklyIds } },\n          select: { id: true, main_task_id: true },\n        })\n      : [];\n    const parentMainTaskIds = unique(hierarchyWeeklyRows.map((item: { main_task_id: string }) => item.main_task_id));\n\n    const relatedMainTaskIds = unique([...assignedMainTaskIds, ...parentMainTaskIds]);\n    const relatedMainRows = relatedMainTaskIds.length\n      ? await db.project_main_task.findMany({\n          where: { ...scoped, id: { in: relatedMainTaskIds } },\n          select: { id: true, project_id: true },\n        })\n      : [];\n    const memberMainRows = memberProjectIds.length\n      ? await db.project_main_task.findMany({\n          where: { ...scoped, project_id: { in: memberProjectIds } },\n          select: { id: true, project_id: true },\n        })\n      : [];\n\n    const memberMainTaskIds = unique(memberMainRows.map((item: { id: string }) => item.id));\n    const readableMainTaskIds = unique([...relatedMainTaskIds, ...memberMainTaskIds]);\n    const teamMainTaskIds = unique([...assignedMainTaskIds, ...memberMainTaskIds]);\n\n    const teamWeeklyRows = teamMainTaskIds.length\n      ? await db.project_weekly_task.findMany({\n          where: { ...scoped, main_task_id: { in: teamMainTaskIds } },\n          select: { id: true },\n        })\n      : [];\n    const teamWeeklyTaskIds = unique([\n      ...assignedWeeklyTaskIds,\n      ...teamWeeklyRows.map((item: { id: string }) => item.id),\n    ]);\n    const readableWeeklyTaskIds = unique([...teamWeeklyTaskIds, ...ownedWeeklyTaskIds]);\n    const readableProjectIds = unique([\n      ...memberProjectIds,\n      ...relatedMainRows.map((item: { project_id: string }) => item.project_id),\n    ]);\n\n    return {\n      memberProjectIds,\n      readableProjectIds,\n      readableMainTaskIds,\n      readableWeeklyTaskIds,\n      teamWeeklyTaskIds,\n      hasTeamRelation: Boolean(memberProjectIds.length || assignedMainTaskIds.length || assignedWeeklyTaskIds.length),\n    };\n  }\n\n  static async projectAccessWhere(user: any, companyId: string, db: any = prisma): Promise<Record<string, unknown>> {\n    if (this.hasPortfolioRead(user)) return {};\n    if (this.activeRole(user) === RoleCode.PROJECT_MANAGER) {\n      return { id: { in: await this.managedProjectIds(user, companyId, db) } };\n    }\n    if (!this.isOperationalAssignee(user) || !user?.id) return { id: { in: [] } };\n    const visibility = await this.operationalTaskVisibility(user, companyId, db);\n    return { id: { in: visibility.readableProjectIds } };\n  }\n\n`;
replaceRegex(
  projectServicePath,
  /  static async projectAccessWhere\(user: any, companyId: string, db: any = prisma\): Promise<Record<string, unknown>> \{[\s\S]*?\n  \}\n\n  static async assertCanViewProject/,
  `${accessBlock}  static async assertCanViewProject`,
  'private static async operationalTaskVisibility',
);

const taskAccessBlock = `  static async dailyTaskAccessWhere(user: any, companyId: string, db: any = prisma): Promise<Record<string, unknown>> {\n    if (this.isOperationalAssignee(user)) {\n      if (!user?.id) return { id: { in: [] } };\n      const visibility = await this.operationalTaskVisibility(user, companyId, db);\n      if (!visibility.hasTeamRelation || !visibility.teamWeeklyTaskIds.length) {\n        return { owner_id: user.id };\n      }\n      return {\n        OR: [\n          { owner_id: user.id },\n          { weekly_task_id: { in: visibility.teamWeeklyTaskIds } },\n        ],\n      };\n    }\n    if (this.hasPortfolioRead(user)) return {};\n    if (this.activeRole(user) !== RoleCode.PROJECT_MANAGER) return { id: { in: [] } };\n\n    const projectIds = await this.managedProjectIds(user, companyId, db);\n    if (!projectIds.length) return { id: { in: [] } };\n    const mainTasks = await db.project_main_task.findMany({\n      where: { company_id: companyId, project_id: { in: projectIds } },\n      select: { id: true },\n    });\n    const mainTaskIds = mainTasks.map((task: { id: string }) => task.id);\n    if (!mainTaskIds.length) return { id: { in: [] } };\n    const weeklyTasks = await db.project_weekly_task.findMany({\n      where: { company_id: companyId, main_task_id: { in: mainTaskIds } },\n      select: { id: true },\n    });\n    return { weekly_task_id: { in: weeklyTasks.map((task: { id: string }) => task.id) } };\n  }\n\n  static async mainTaskAccessWhere(user: any, companyId: string, db: any = prisma): Promise<Record<string, unknown>> {\n    if (this.isOperationalAssignee(user)) {\n      const visibility = await this.operationalTaskVisibility(user, companyId, db);\n      return { id: { in: visibility.readableMainTaskIds } };\n    }\n    if (this.hasPortfolioRead(user)) return {};\n    if (this.activeRole(user) !== RoleCode.PROJECT_MANAGER) return { id: { in: [] } };\n    return { project_id: { in: await this.managedProjectIds(user, companyId, db) } };\n  }\n\n  static async weeklyTaskAccessWhere(user: any, companyId: string, db: any = prisma): Promise<Record<string, unknown>> {\n    if (this.isOperationalAssignee(user)) {\n      const visibility = await this.operationalTaskVisibility(user, companyId, db);\n      return { id: { in: visibility.readableWeeklyTaskIds } };\n    }\n    if (this.hasPortfolioRead(user)) return {};\n    if (this.activeRole(user) !== RoleCode.PROJECT_MANAGER) return { id: { in: [] } };\n    const mainWhere = await this.mainTaskAccessWhere(user, companyId, db);\n    const mainTasks = await db.project_main_task.findMany({\n      where: { company_id: companyId, ...mainWhere },\n      select: { id: true },\n    });\n    return { main_task_id: { in: mainTasks.map((task: { id: string }) => task.id) } };\n  }\n\n`;
replaceRegex(
  projectServicePath,
  /  static async dailyTaskAccessWhere\(user: any, companyId: string, db: any = prisma\): Promise<Record<string, unknown>> \{[\s\S]*?\n  \}\n\n  static async taskAssignmentAccessWhere/,
  `${taskAccessBlock}  static async taskAssignmentAccessWhere`,
  'visibility.teamWeeklyTaskIds',
);

// -----------------------------------------------------------------------------
// 6. Projects routes: JIT employee mapping, task participants, search & scope
// -----------------------------------------------------------------------------
const projectRoutesPath = 'backend-express/src/modules/projects/projects.routes.ts';
replaceExact(
  projectRoutesPath,
  `import { isSuperAdmin, RoleCode } from '../../types/roles';`,
  `import { isSuperAdmin, RoleCode } from '../../types/roles';\nimport { EmployeeProvisioningService } from '../master_data/employee-provisioning.service';`,
  `EmployeeProvisioningService } from '../master_data/employee-provisioning.service'`,
);

const currentEmployeeReplacement = `async function currentEmployee(req: Request) {\n  const companyId = activeCompanyId(req);\n  const tenantId = activeTenantId(req);\n  const userId = activeUserId(req);\n\n  const employee = await EmployeeProvisioningService.ensureForUser({\n    userId,\n    tenantId,\n    companyId,\n    actorId: userId,\n  });\n\n  if (!employee) {\n    throw new ForbiddenError('Super Admin tidak memiliki profil employee.');\n  }\n\n  return employee;\n}\n\n// =============================================================================\n// 0. CUSTOMERS / CLIENTS LIST (Strict Company & Tenant Isolated)`;
replaceRegex(
  projectRoutesPath,
  /async function currentEmployee\(req: Request\) \{[\s\S]*?\n\}\n\n\/\/ =============================================================================\n\/\/ 0\. CUSTOMERS \/ CLIENTS LIST \(Strict Company & Tenant Isolated\)/,
  currentEmployeeReplacement,
  'const employee = await EmployeeProvisioningService.ensureForUser({',
);

const participantsEndpoint = `\n// Project-scoped identity catalog used only to label task owners/assignees.\n// It returns users referenced by task rows already visible to the caller; this\n// is intentionally not a replacement for the Accounts administration API.\nprojectsRouter.get('/task-participants', async (req: Request, res: Response, next: NextFunction) => {\n  try {\n    const companyId = activeCompanyId(req);\n    const tenantId = activeTenantId(req);\n    const [mainScope, weeklyScope, dailyScope] = await Promise.all([\n      ProjectsService.mainTaskAccessWhere(req.user, companyId),\n      ProjectsService.weeklyTaskAccessWhere(req.user, companyId),\n      ProjectsService.dailyTaskAccessWhere(req.user, companyId),\n    ]);\n\n    const [mainTasks, weeklyTasks, dailyTasks] = await Promise.all([\n      prisma.project_main_task.findMany({\n        where: { tenant_id: tenantId, company_id: companyId, ...mainScope },\n        select: { id: true },\n      }),\n      prisma.project_weekly_task.findMany({\n        where: { tenant_id: tenantId, company_id: companyId, ...weeklyScope },\n        select: { assignee_id: true },\n      }),\n      prisma.project_daily_task.findMany({\n        where: { tenant_id: tenantId, company_id: companyId, ...dailyScope },\n        select: { owner_id: true },\n      }),\n    ]);\n\n    const mainTaskIds = mainTasks.map((task) => task.id);\n    const assignments = mainTaskIds.length\n      ? await prisma.project_task_assignment.findMany({\n          where: { tenant_id: tenantId, company_id: companyId, main_task_id: { in: mainTaskIds } },\n          select: { assignee_id: true },\n        })\n      : [];\n\n    const participantIds = [...new Set([\n      ...weeklyTasks.map((task) => task.assignee_id),\n      ...dailyTasks.map((task) => task.owner_id),\n      ...assignments.map((assignment) => assignment.assignee_id),\n    ].filter((id): id is string => Boolean(id)))];\n\n    const users = participantIds.length\n      ? await prisma.iam_user.findMany({\n          where: { id: { in: participantIds }, tenant_id: tenantId, is_active: true },\n          select: { id: true, email: true, username: true, full_name: true },\n          orderBy: { full_name: 'asc' },\n        })\n      : [];\n\n    res.json({ count: users.length, results: users });\n  } catch (err) {\n    next(err);\n  }\n});\n`;
replaceExact(
  projectRoutesPath,
  `// =============================================================================\n// 1. WBS 5-LEVEL HIERARCHY ENDPOINT\n// =============================================================================`,
  `${participantsEndpoint}\n// =============================================================================\n// 1. WBS 5-LEVEL HIERARCHY ENDPOINT\n// =============================================================================`,
  `projectsRouter.get('/task-participants'`,
);

replaceExact(
  projectRoutesPath,
  `  searchFields: ['title', 'description', 'notes'],`,
  `  searchFields: ['title', 'description', 'notes', 'output_result', 'time_slot'],`,
  `searchFields: ['title', 'description', 'notes', 'output_result', 'time_slot']`,
);
replaceExact(
  projectRoutesPath,
  `    const mainTask = await prisma.project_main_task.findFirst({\n      where: { id: weeklyTask.main_task_id, company_id: companyId },\n      select: { id: true, project_id: true },\n    });`,
  `    const mainTask = await prisma.project_main_task.findFirst({\n      where: { id: weeklyTask.main_task_id, company_id: companyId },\n      select: { id: true, project_id: true, tenant_id: true, company_id: true },\n    });`,
  `where: { id: weeklyTask.main_task_id, company_id: companyId },\n      select: { id: true, project_id: true, tenant_id: true, company_id: true }`,
);
replaceExact(
  projectRoutesPath,
  `    if (!mainTask) throw new ValidationError('Main Task induk tidak valid.');\n\n    const isOperationalAssignee`,
  `    if (!mainTask) throw new ValidationError('Main Task induk tidak valid.');\n\n    // Parent hierarchy is authoritative for write scope. Never trust tenant or\n    // company values supplied by the browser.\n    data.tenant_id = mainTask.tenant_id ?? weeklyTask.tenant_id ?? activeTenantId(req);\n    data.company_id = mainTask.company_id ?? weeklyTask.company_id ?? companyId;\n\n    const isOperationalAssignee`,
  `data.tenant_id = mainTask.tenant_id ?? weeklyTask.tenant_id ?? activeTenantId(req);`,
);

// -----------------------------------------------------------------------------
// 7. Reporting: use the same employee provisioning boundary
// -----------------------------------------------------------------------------
const reportingPath = 'backend-express/src/modules/reporting/reporting.routes.ts';
replaceExact(
  reportingPath,
  `import { isSuperAdmin, RoleCode } from '../../types/roles';`,
  `import { isSuperAdmin, RoleCode } from '../../types/roles';\nimport { EmployeeProvisioningService } from '../master_data/employee-provisioning.service';`,
  `EmployeeProvisioningService } from '../master_data/employee-provisioning.service'`,
);
const personalEmployeeReplacement = `async function personalEmployeeId(req: Request): Promise<string> {\n  const companyId = activeCompanyId(req);\n  const tenantId = req.user?.tenant_id;\n  const userId = req.user?.id;\n  if (!tenantId || !userId) {\n    throw new ForbiddenError('Identitas tenant atau user tidak tersedia.');\n  }\n\n  const employee = await EmployeeProvisioningService.ensureForUser({\n    userId,\n    tenantId,\n    companyId,\n    actorId: userId,\n  });\n  if (!employee) {\n    throw new ForbiddenError('Super Admin tidak memiliki profil employee.');\n  }\n  return employee.id;\n}\n\n// Reporting is a projection boundary`;
replaceRegex(
  reportingPath,
  /async function personalEmployeeId\(req: Request\): Promise<string> \{[\s\S]*?\n\}\n\n\/\/ Reporting is a projection boundary/,
  personalEmployeeReplacement,
  'const employee = await EmployeeProvisioningService.ensureForUser({',
);

// -----------------------------------------------------------------------------
// 8. Frontend project adapter: project-scoped participant labels
// -----------------------------------------------------------------------------
const projectApiPath = 'frontend-next/lib/api/project.api.ts';
replaceExact(
  projectApiPath,
  `        // User administration is not part of the PROJECTS contract. Names are\n        // supplied by the dashboard bundle or project-scoped assignee catalog.\n        emptyResponse(),`,
  `        // Task participant names come from a project-scoped read-only catalog,\n        // never from the admin-only Accounts user listing.\n        api.get('/api/v1/projects/task-participants/'),`,
  `api.get('/api/v1/projects/task-participants/')`,
);
replaceExact(
  projectApiPath,
  `        owner_name: d.owner_name || d.owner_username || d.assignee_name || "Member",`,
  `        owner_name: d.owner_name || d.owner_username || d.assignee_name || userMap[String(d.owner_id || d.owner || d.assigned_to || "")] || "Member",`,
  `userMap[String(d.owner_id || d.owner || d.assigned_to || "")]`,
);
replaceExact(
  projectApiPath,
  `        assignee_name: w.assignee_name || w.assignee_username || w.owner_name || "",`,
  `        assignee_name: w.assignee_name || w.assignee_username || w.owner_name || userMap[String(w.assignee_id || w.assignee || w.assigned_to || "")] || "",`,
  `userMap[String(w.assignee_id || w.assignee || w.assigned_to || "")]`,
);

// -----------------------------------------------------------------------------
// 9. Tasks UI: comprehensive search + owner-only mutation copy
// -----------------------------------------------------------------------------
const tasksClientPath = 'frontend-next/app/(app)/tasks/TasksClient.tsx';
replaceExact(
  tasksClientPath,
  `    return allTasks.filter(item => {\n      const matchSearch = q\n        ? (item.task.title || item.task.activity_input || "").toLowerCase().includes(q) ||\n          item.projectName.toLowerCase().includes(q) ||\n          item.projectCode.toLowerCase().includes(q)\n        : true;\n      if (!matchSearch) return false;\n      const taskDate = normalizeDateKey(item.task.planned_date);`,
  `    return allTasks.filter(item => {\n      const searchableText = [\n        item.task.title,\n        item.task.activity_input,\n        item.projectCode,\n        item.projectName,\n        item.mainTaskName,\n        item.task.output_result,\n        item.task.notes,\n        item.task.block_reason,\n        item.task.owner_name,\n        item.task.owner_id,\n      ]\n        .filter(value => value !== null && value !== undefined)\n        .map(value => String(value).toLowerCase())\n        .join(' ');\n      const matchSearch = q ? searchableText.includes(q) : true;\n      if (!matchSearch) return false;\n\n      // Search is intentionally global across all accessible tasks. Quick\n      // filters resume when the search box is empty.\n      if (q) return true;\n\n      const taskDate = normalizeDateKey(item.task.planned_date);`,
  `const searchableText = [`,
);
replaceExact(
  tasksClientPath,
  `if (activeFilter === "ACTIVE") return ["ON_PROGRESS","PENDING"].includes(item.task.status || "");`,
  `if (activeFilter === "ACTIVE") return ["ON_PROGRESS", "IN_PROGRESS", "PENDING"].includes(item.task.status || "");`,
  `["ON_PROGRESS", "IN_PROGRESS", "PENDING"]`,
);
replaceExact(
  tasksClientPath,
  `title={!isAllowed ? "Hanya PIC, Owner, atau PM yang dapat mengubah status" : (isDone ? "Buka kembali" : "Tandai selesai")}`,
  `title={!isAllowed ? "Hanya pemilik task yang dapat mengubah status" : (isDone ? "Buka kembali" : "Tandai selesai")}`,
  `Hanya pemilik task yang dapat mengubah status`,
);
replaceExact(
  tasksClientPath,
  `title="Hanya PIC / Owner atau PM yang dapat mengedit"`,
  `title="Hanya pemilik task yang dapat mengedit"`,
  `Hanya pemilik task yang dapat mengedit`,
);
replaceExact(
  tasksClientPath,
  `Daftar seluruh tugas harian Anda dari semua proyek (Cross-Project Daily View)`,
  `Daftar task yang dapat Anda akses dari proyek terkait. Task rekan tampil read-only.`,
  `Task rekan tampil read-only.`,
);
replaceExact(
  tasksClientPath,
  `placeholder="Cari task atau proyek..."`,
  `placeholder="Cari task, proyek, WBS, output, catatan, atau owner..."`,
  `Cari task, proyek, WBS, output, catatan, atau owner...`,
);

// -----------------------------------------------------------------------------
// 10. Q11 guardrails: update expected employee identity contract
// -----------------------------------------------------------------------------
const q11Path = 'backend-express/tests/q11-system-guardrails.ts';
replaceExact(
  q11Path,
  `    assert(projectRoutes.includes('existingProjectMember?.employee_id'), 'Timesheet identity must retain the explicit project-member migration fallback.');\n    assert(projectRoutes.includes("'Akun user belum terhubung dengan data employee.'"), 'Missing employee identity must fail closed with an actionable message.');`,
  `    assert(projectRoutes.includes('EmployeeProvisioningService.ensureForUser'), 'Timesheet identity must use centralized employee provisioning.');\n    assert(projectRoutes.includes("'Super Admin tidak memiliki profil employee.'"), 'Super Admin must remain a platform identity without a synthetic employee.');\n    assert(projectRoutes.includes("searchFields: ['title', 'description', 'notes', 'output_result', 'time_slot']"), 'Daily Task API search must cover operational text fields.');\n    assert(tasksClient.includes('item.mainTaskName') && tasksClient.includes('item.task.output_result') && tasksClient.includes('item.task.owner_name'), 'Task workspace search must cover WBS, output, and owner labels.');`,
  `Timesheet identity must use centralized employee provisioning.`,
);


replaceExact(
  q11Path,
  `    const staff = { id: 'staff-a', roles: [RoleCode.STAFF], active_role_code: RoleCode.STAFF };\n    assert.deepEqual(await ProjectsService.dailyTaskAccessWhere(staff, 'company-a'), { owner_id: 'staff-a' });`,
  `    const staff = { id: 'staff-a', roles: [RoleCode.STAFF], active_role_code: RoleCode.STAFF };\n    const staffNoRelationsDb = {\n      project_member: { findMany: async () => [] },\n      project_task_assignment: { findMany: async () => [] },\n      project_weekly_task: { findMany: async () => [] },\n      project_daily_task: { findMany: async () => [] },\n    };\n    assert.deepEqual(await ProjectsService.dailyTaskAccessWhere(staff, 'company-a', staffNoRelationsDb), { owner_id: 'staff-a' });`,
  `const staffNoRelationsDb = {`,
);

replaceExact(
  q11Path,
  `    assert(reportingAccessRoutes.includes('user_id: userId') && reportingAccessRoutes.includes('employee_id: employeeId'), 'Attendance projection must use an explicit user-to-employee identity.');`,
  `    assert(reportingAccessRoutes.includes('EmployeeProvisioningService.ensureForUser') && reportingAccessRoutes.includes('employee_id: employeeId'), 'Attendance projection must use centralized explicit user-to-employee identity.');`,
  `Attendance projection must use centralized explicit user-to-employee identity.`,
);

console.log('Task multi-tenant integrity patch applied successfully.');
