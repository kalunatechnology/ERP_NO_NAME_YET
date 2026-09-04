/**
 * Repairs Melika's canonical PM/OM access without reseeding unrelated data.
 *
 * The script is intentionally narrow: it only updates melika@arsalynk.com,
 * preserves her existing company membership, removes stale role assignments,
 * assigns Project Manager and Operational Manager in that company, and makes
 * Project Manager the active role.
 */
import prisma from '../src/config/database';
import { RoleCode, toExternalRoleCode } from '../src/types/roles';

/** Applies and verifies the targeted role correction as one database transaction. */
async function repairMelikaAccess(): Promise<void> {
  const email = 'melika@arsalynk.com';
  const user = await prisma.iam_user.findUnique({ where: { email } });
  if (!user) throw new Error(`User ${email} tidak ditemukan.`);

  const membership = await prisma.iam_user_company_membership.findUnique({
    where: { user_id: user.id },
  });
  if (!membership || membership.status !== 'ACTIVE') {
    throw new Error(`Membership company aktif untuk ${email} tidak ditemukan.`);
  }

  const requiredCodes = [RoleCode.PROJECT_MANAGER, RoleCode.OPERATIONAL_MANAGER];
  const roles = await prisma.iam_role.findMany({
    where: { tenant_id: membership.tenant_id, role_code: { in: requiredCodes } },
  });
  if (roles.length !== requiredCodes.length) {
    throw new Error('Role Project Manager/Operational Manager canonical belum lengkap pada tenant Melika.');
  }

  const projectManager = roles.find((role) => role.role_code === RoleCode.PROJECT_MANAGER)!;
  await prisma.$transaction(async (tx) => {
    // Remove legacy Supervisor or other assignments so access cannot silently
    // expand beyond the PM/OM roles approved for this account.
    await tx.iam_user_role.deleteMany({
      where: { user_id: user.id, role_id: { notIn: roles.map((role) => role.id) } },
    });

    for (const role of roles) {
      const assignment = await tx.iam_user_role.findFirst({
        where: { user_id: user.id, role_id: role.id },
      });
      if (assignment) {
        await tx.iam_user_role.update({
          where: { id: assignment.id },
          data: {
            tenant_id: membership.tenant_id,
            company_id: membership.company_id,
          },
        });
      } else {
        await tx.iam_user_role.create({
          data: {
            user_id: user.id,
            role_id: role.id,
            tenant_id: membership.tenant_id,
            company_id: membership.company_id,
          },
        });
      }
    }

    await tx.iam_user.update({
      where: { id: user.id },
      data: { active_role_id: projectManager.id, is_staff: true },
    });
  });

  const verifiedAssignments = await prisma.iam_user_role.findMany({
    where: { user_id: user.id, company_id: membership.company_id },
    select: { role_id: true },
  });
  const assignedRoles = roles
    .filter((role) => verifiedAssignments.some((assignment) => assignment.role_id === role.id))
    .map((role) => toExternalRoleCode(role.role_code));
  console.log(JSON.stringify({
    email,
    company_id: membership.company_id,
    active_role: toExternalRoleCode(projectManager.role_code),
    assigned_roles: assignedRoles.sort(),
  }, null, 2));
}

repairMelikaAccess()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
