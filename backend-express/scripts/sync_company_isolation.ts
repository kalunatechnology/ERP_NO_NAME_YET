import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== STRICT COMPANY & TENANT ISOLATION SYNC ===');

  // 1. TENANT 1: PT SINERGI MUDA ARSA
  let tenantSMA = await prisma.core_tenant.findFirst({ where: { code: 'SINERGI_MUDA_ARSA' } });
  if (!tenantSMA) {
    tenantSMA = await prisma.core_tenant.create({
      data: {
        id: '00000000-0000-0000-0000-000000000001',
        code: 'SINERGI_MUDA_ARSA',
        name: 'PT Sinergi Muda Arsa',
        status: 'ACTIVE',
      },
    });
  }

  // 2. TENANT 2: GHOST COMPANY (PT COBA ARSALYNK)
  let tenantGhost = await prisma.core_tenant.findFirst({ where: { code: 'GHOST_TENANT' } });
  if (!tenantGhost) {
    tenantGhost = await prisma.core_tenant.create({
      data: {
        id: '00000000-0000-0000-0000-000000000099',
        code: 'GHOST_TENANT',
        name: 'Ghost Company Workspace',
        status: 'GHOST',
      },
    });
  }

  // 3. COMPANY 1: PT SINERGI MUDA ARSA
  let compSMA = await prisma.core_company.findFirst({ where: { company_code: 'SMA' } });
  if (!compSMA) {
    compSMA = await prisma.core_company.create({
      data: {
        id: '10000000-0000-0000-0000-000000000001',
        tenant_id: tenantSMA.id,
        company_code: 'SMA',
        legal_name: 'PT Sinergi Muda Arsa',
        tax_number: '03.881.992.1-512.000',
        fiscal_year_start: new Date('2026-01-01'),
        status: 'ACTIVE',
      },
    });
  }

  // 4. COMPANY 2: PT COBA ARSALYNK
  let compGhost = await prisma.core_company.findFirst({ where: { company_code: 'GHOST-ARSALYNK' } });
  if (!compGhost) {
    compGhost = await prisma.core_company.create({
      data: {
        id: '10000000-0000-0000-0000-000000000099',
        tenant_id: tenantGhost.id,
        company_code: 'GHOST-ARSALYNK',
        legal_name: 'PT Coba Arsalynk (Ghost Company)',
        tax_number: '00.000.000.0-000.000',
        fiscal_year_start: new Date('2026-01-01'),
        status: 'GHOST',
      },
    });
  }

  // 5. OFFICIAL TEAM USERS (DOMAIN .COM) -> LOCKED TO PT SINERGI MUDA ARSA
  const officialEmails = [
    'rian@arsalynk.com',
    'melika@arsalynk.com',
    'melika.ops@arsalynk.com',
    'arof@arsalynk.com',
    'arof.finance@arsalynk.com',
    'laode@arsalynk.com',
    'jundy@arsalynk.com',
    'noorman@arsalynk.com',
  ];

  for (const email of officialEmails) {
    const u = await prisma.iam_user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });
    if (u) {
      await prisma.iam_user.update({
        where: { id: u.id },
        data: {
          tenant_id: tenantSMA.id,
          status: 'ACTIVE',
        },
      });
      await prisma.iam_user_role.updateMany({
        where: { user_id: u.id },
        data: {
          company_id: compSMA.id,
        },
      });
      console.log(`[SMA LOCKED] ${u.username} (${u.email}) -> PT Sinergi Muda Arsa`);
    }
  }

  // 6. GHOST DUMMY USERS -> LOCKED TO PT COBA ARSALYNK
  const ghostEmails = [
    'admin.director@arsalynk.id',
    'director@arsalynk.id',
    'pm.lead@arsalynk.id',
    'supervisor@arsalynk.id',
    'crm.lead@arsalynk.id',
    'sales@arsalynk.id',
    'finance.lead@arsalynk.id',
    'dummy.finance@example.com',
    'estimator@arsalynk.id',
    'staff.dev@arsalynk.id',
    'admin@arsalynk.id',
    'pm@arsalynk.id',
    'finance@arsalynk.id',
    'sales@arsalynk.id',
  ];

  for (const email of ghostEmails) {
    const u = await prisma.iam_user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });
    if (u) {
      await prisma.iam_user.update({
        where: { id: u.id },
        data: {
          tenant_id: tenantGhost.id,
          status: 'GHOST',
        },
      });
      await prisma.iam_user_role.updateMany({
        where: { user_id: u.id },
        data: {
          company_id: compGhost.id,
        },
      });
      console.log(`[GHOST LOCKED] ${u.username} (${u.email}) -> PT Coba Arsalynk (Ghost Company)`);
    }
  }

  // 7. REAL 3 PROJECTS -> LOCKED TO PT SINERGI MUDA ARSA
  await prisma.project_project.updateMany({
    where: {
      OR: [
        { project_name: { contains: 'Perilaku' } },
        { project_name: { contains: 'GIK' } },
        { project_name: { contains: 'Padel' } },
      ],
    },
    data: {
      tenant_id: tenantSMA.id,
      company_id: compSMA.id,
    },
  });

  console.log('=== STRICT COMPANY ISOLATION COMPLETE ===');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
