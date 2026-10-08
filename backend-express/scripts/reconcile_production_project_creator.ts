import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { postgresPoolConfig } from '../src/config/postgres';

const prisma = new PrismaClient({
  adapter: new PrismaPg(postgresPoolConfig(process.env.DATABASE_URL || '')),
});

const COMPANY_CODE = 'SMA';
const PROJECT_CREATOR_EMAIL = 'arof@arsalynk.com';

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required. Refusing to reconcile project creator without an explicit database target.');
  }

  const company = await prisma.core_company.findFirst({
    where: { company_code: COMPANY_CODE },
    select: { id: true, tenant_id: true, legal_name: true },
  });
  if (!company) {
    throw new Error(`Company ${COMPANY_CODE} was not found.`);
  }

  const creator = await prisma.iam_user.findFirst({
    where: {
      tenant_id: company.tenant_id,
      email: { equals: PROJECT_CREATOR_EMAIL, mode: 'insensitive' },
      status: 'ACTIVE',
      is_active: true,
    },
    select: { id: true, username: true, email: true, full_name: true },
  });
  if (!creator) {
    throw new Error(`Active user ${PROJECT_CREATOR_EMAIL} was not found in tenant ${company.tenant_id}.`);
  }

  const membership = await prisma.iam_user_company_membership.findFirst({
    where: {
      tenant_id: company.tenant_id,
      company_id: company.id,
      user_id: creator.id,
      status: 'ACTIVE',
    },
    select: { id: true },
  });
  if (!membership) {
    throw new Error(`${PROJECT_CREATOR_EMAIL} is not an active member of ${COMPANY_CODE}.`);
  }

  const before = await prisma.project_project.count({
    where: {
      tenant_id: company.tenant_id,
      company_id: company.id,
      created_by_id: { not: creator.id },
    },
  });

  const result = await prisma.project_project.updateMany({
    where: {
      tenant_id: company.tenant_id,
      company_id: company.id,
      created_by_id: { not: creator.id },
    },
    data: { created_by_id: creator.id },
  });

  const totalProjects = await prisma.project_project.count({
    where: { tenant_id: company.tenant_id, company_id: company.id },
  });
  const remaining = await prisma.project_project.count({
    where: {
      tenant_id: company.tenant_id,
      company_id: company.id,
      created_by_id: { not: creator.id },
    },
  });

  if (remaining !== 0) {
    throw new Error(`Project creator reconciliation incomplete: ${remaining} project(s) are still not owned by ${PROJECT_CREATOR_EMAIL}.`);
  }

  console.log(JSON.stringify({
    status: 'RECONCILED',
    company: company.legal_name,
    creator: { username: creator.username, email: creator.email, name: creator.full_name, id: creator.id },
    totalProjects,
    mismatchedBefore: before,
    updatedProjects: result.count,
    mismatchedAfter: remaining,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
