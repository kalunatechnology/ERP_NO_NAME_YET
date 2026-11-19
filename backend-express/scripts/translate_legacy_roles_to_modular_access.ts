import { Prisma } from '@prisma/client';
import prisma from '../src/config/database';
import {
  DASHBOARD_WIDGET_CATALOG,
  deterministicUuid,
  mergeLegacyRoleTranslations,
} from '../src/modules/accounts/org-policy-sync.service';
import { parseRoleCode, RoleCode } from '../src/types/roles';

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const companyArg = args.find((a) => a.startsWith('--company-id='));
  const targetCompanyId = companyArg ? companyArg.split('=')[1]?.trim() : null;

  console.log('===================================================================');
  console.log(' LEGACY ROLE -> MODULAR ACCESS & DASHBOARD TRANSLATOR');
  console.log(` Mode       : ${isDryRun ? 'DRY-RUN (No DB writes)' : 'EXECUTE (Transactional DB writes)'}`);
  console.log(` Company ID : ${targetCompanyId || 'ALL ACTIVE COMPANIES'}`);
  console.log('===================================================================');

  const memberships = await prisma.iam_user_company_membership.findMany({
    where: {
      status: 'ACTIVE',
      ...(targetCompanyId ? { company_id: targetCompanyId } : {}),
    },
    orderBy: [{ company_id: 'asc' }, { user_id: 'asc' }],
  });

  if (memberships.length === 0) {
    console.log('No active company memberships found.');
    return;
  }

  const userIds = Array.from(new Set(memberships.map((m) => m.user_id)));
  const [users, userRoles, allRoles] = await Promise.all([
    prisma.iam_user.findMany({
      where: { id: { in: userIds }, is_active: true },
    }),
    prisma.iam_user_role.findMany({
      where: { user_id: { in: userIds } },
    }),
    prisma.iam_role.findMany(),
  ]);

  const userById = new Map(users.map((u) => [u.id, u]));
  const roleById = new Map(allRoles.map((r) => [r.id, r]));

  let processedCount = 0;
  let skippedSuperuserCount = 0;
  let multiRoleCount = 0;

  for (const membership of memberships) {
    const user = userById.get(membership.user_id);
    if (!user) continue;
    if (user.is_superuser) {
      skippedSuperuserCount++;
      continue;
    }

    const companyId = membership.company_id;
    const tenantId = membership.tenant_id;

    const assignedRoleRows = userRoles.filter(
      (ur) =>
        ur.user_id === user.id &&
        (ur.company_id === companyId || ur.company_id === null)
    );

    const roleCodes: RoleCode[] = [];
    for (const ur of assignedRoleRows) {
      const r = ur.role_id ? roleById.get(ur.role_id) : undefined;
      const parsed = r ? parseRoleCode(r.role_code) : null;
      if (parsed && !roleCodes.includes(parsed)) {
        roleCodes.push(parsed);
      }
    }

    if (roleCodes.length === 0) {
      roleCodes.push(RoleCode.STAFF);
    }

    const domainRoles = roleCodes.filter(
      (c) => c !== RoleCode.COMPANY_ADMIN && c !== RoleCode.SUPER_ADMIN
    );
    if (domainRoles.length > 1) {
      multiRoleCount++;
    }

    const merged = mergeLegacyRoleTranslations(roleCodes);

    console.log(
      `\n[User] ${user.full_name} <${user.email}> (company=${companyId})`
    );
    console.log(`  Legacy Roles (${roleCodes.length}) : ${roleCodes.join(' + ')}`);
    console.log(`  Effective Level  : ${merged.role_level}`);
    console.log(
      `  Merged Modules   : ${merged.modules
        .map(
          (m) =>
            `${m.module_code}(Tier ${m.tier_level}, ${m.data_scope}, R:${m.allow_read ? 'Y' : 'N'}/W:${m.allow_write ? 'Y' : 'N'})`
        )
        .join(', ')}`
    );
    console.log(`  Dashboard Widgets: ${merged.dashboard_widgets.join(', ')}`);

    processedCount++;

    if (isDryRun) {
      continue;
    }

    await prisma.$transaction(async (tx) => {
      // 1. Backfill core_user_org_membership if user has department_id
      if (user.department_id) {
        const deptExists = await tx.core_department.findFirst({
          where: { id: user.department_id, company_id: companyId },
          select: { id: true },
        });
        if (deptExists) {
          await tx.core_user_org_membership.upsert({
            where: {
              company_id_user_id_department_id: {
                company_id: companyId,
                user_id: user.id,
                department_id: user.department_id,
              },
            },
            update: {
              unit_role: merged.role_level,
              is_primary: true,
              is_active: true,
            },
            create: {
              id: deterministicUuid(`org-mem:${companyId}:${user.id}:${user.department_id}`),
              company_id: companyId,
              user_id: user.id,
              department_id: user.department_id,
              unit_role: merged.role_level,
              is_primary: true,
              allocation_pct: new Prisma.Decimal(100),
              is_active: true,
            },
          });
        }
      }

      // 2. Upsert all 6 widgets in iam_user_dashboard_access
      const enabledSet = new Set(merged.dashboard_widgets);
      for (const item of DASHBOARD_WIDGET_CATALOG) {
        const isEnabled = item.code === 'DASH_PERSONAL' ? true : enabledSet.has(item.code);
        await tx.iam_user_dashboard_access.upsert({
          where: {
            company_id_user_id_widget_code: {
              company_id: companyId,
              user_id: user.id,
              widget_code: item.code,
            },
          },
          update: { is_enabled: isEnabled },
          create: {
            id: deterministicUuid(`dash-acc:${companyId}:${user.id}:${item.code}`),
            tenant_id: tenantId,
            company_id: companyId,
            user_id: user.id,
            widget_code: item.code,
            is_enabled: isEnabled,
          },
        });
      }

      // 3. Upsert iam_user_module_assignment and iam_user_module_access
      for (const mod of merged.modules) {
        await tx.iam_user_module_access.upsert({
          where: {
            user_id_module_code: {
              user_id: user.id,
              module_code: mod.module_code,
            },
          },
          update: {
            company_id: companyId,
            tenant_id: tenantId,
            allow_read: mod.allow_read,
            allow_write: mod.allow_write,
          },
          create: {
            id: deterministicUuid(`mod-acc:${user.id}:${mod.module_code}`),
            tenant_id: tenantId,
            company_id: companyId,
            user_id: user.id,
            module_code: mod.module_code,
            allow_read: mod.allow_read,
            allow_write: mod.allow_write,
          },
        });

        await tx.iam_user_module_assignment.upsert({
          where: {
            company_id_user_id_module_code: {
              company_id: companyId,
              user_id: user.id,
              module_code: mod.module_code,
            },
          },
          update: {
            tier_level: mod.tier_level,
            data_scope: mod.data_scope,
            department_id: user.department_id,
            status: 'ACTIVE',
          },
          create: {
            id: deterministicUuid(`mod-asg:${companyId}:${user.id}:${mod.module_code}`),
            tenant_id: tenantId,
            company_id: companyId,
            user_id: user.id,
            module_code: mod.module_code,
            tier_level: mod.tier_level,
            data_scope: mod.data_scope,
            department_id: user.department_id,
            is_primary: mod.module_code === 'PROJECTS',
            status: 'ACTIVE',
          },
        });
      }

      // 4. Record audit snapshot in iam_assignment_history (keep iam_user_role intact)
      await tx.iam_assignment_history.create({
        data: {
          tenant_id: tenantId,
          company_id: companyId,
          target_user_id: user.id,
          module_code: 'LEGACY_ROLE_MIGRATION',
          change_type: 'TRANSLATE_LEGACY_ROLES',
          before_json: JSON.stringify({ roles: roleCodes, department_id: user.department_id }),
          after_json: JSON.stringify({
            role_level: merged.role_level,
            modules: merged.modules,
            dashboard_widgets: merged.dashboard_widgets,
          }),
          reason: 'Automated translation from legacy hardcoded roles to modular access',
        },
      });
    });
  }

  console.log('\n===================================================================');
  console.log(` Summary: ${processedCount} users processed (${multiRoleCount} multi-role, ${skippedSuperuserCount} superusers skipped).`);
  console.log('===================================================================');
}

main()
  .catch((err) => {
    console.error('[translate_legacy_roles_to_modular_access] Error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
