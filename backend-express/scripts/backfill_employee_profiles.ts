import prisma from '../src/config/database';
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
