import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== STRUCTURING EXACTLY 2 COMPANIES: PT SINERGI MUDA ARSA & GHOST COMPANY ===');

  // =========================================================================
  // 1. TENANTS
  // =========================================================================
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

  let tenantGhost = await prisma.core_tenant.findFirst({ where: { code: 'GHOST_TENANT' } });
  if (!tenantGhost) {
    tenantGhost = await prisma.core_tenant.create({
      data: {
        id: '00000000-0000-0000-0000-000000000099',
        code: 'GHOST_TENANT',
        name: 'Ghost / Demo Tenant Workspace',
        status: 'GHOST',
      },
    });
  }

  // =========================================================================
  // 2. COMPANY 1: PT SINERGI MUDA ARSA (PRIMARY ACTIVE)
  // =========================================================================
  let companySMA = await prisma.core_company.findFirst({ where: { company_code: 'SMA' } });
  if (!companySMA) {
    companySMA = await prisma.core_company.create({
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
  } else {
    companySMA = await prisma.core_company.update({
      where: { id: companySMA.id },
      data: {
        tenant_id: tenantSMA.id,
        company_code: 'SMA',
        legal_name: 'PT Sinergi Muda Arsa',
        tax_number: '03.881.992.1-512.000',
        status: 'ACTIVE',
      },
    });
  }

  let orgSMA = await prisma.core_organization.findFirst({
    where: { organization_code: 'ORG-SMA-HQ' },
  });
  if (!orgSMA) {
    orgSMA = await prisma.core_organization.create({
      data: {
        id: '20000000-0000-0000-0000-000000000001',
        tenant_id: tenantSMA.id,
        company_id: companySMA.id,
        organization_code: 'ORG-SMA-HQ',
        organization_name: 'Kantor Pusat PT Sinergi Muda Arsa',
        organization_type: 'HEADQUARTER',
        status: 'ACTIVE',
      },
    });
  }

  // =========================================================================
  // 3. COMPANY 2: PT COBA ARSALYNK (GHOST / DEMO COMPANY)
  // =========================================================================
  // Update all other companies to point to Ghost Company
  await prisma.core_company.updateMany({
    where: { id: { not: companySMA.id } },
    data: {
      tenant_id: tenantGhost.id,
      company_code: 'GHOST-ARSALYNK',
      legal_name: 'PT Coba Arsalynk (Ghost Company)',
      tax_number: '00.000.000.0-000.000',
      status: 'GHOST',
    },
  });

  const ghostCompanies = await prisma.core_company.findMany({
    where: { id: { not: companySMA.id } },
  });
  const companyGhost = ghostCompanies[0];

  let orgGhost = await prisma.core_organization.findFirst({
    where: { organization_code: 'ORG-GHOST-HQ' },
  });
  if (!orgGhost && companyGhost) {
    orgGhost = await prisma.core_organization.create({
      data: {
        id: '20000000-0000-0000-0000-000000000099',
        tenant_id: tenantGhost.id,
        company_id: companyGhost.id,
        organization_code: 'ORG-GHOST-HQ',
        organization_name: 'Divisi Uji Coba Ghost Arsalynk',
        organization_type: 'DEMO',
        status: 'GHOST',
      },
    });
  }

  // =========================================================================
  // 4. SEPARATE USERS: OFFICIAL TEAM -> SMA, DUMMY USERS -> GHOST
  // =========================================================================
  const officialEmails = [
    'rian.destianto@arsalynk.id',
    'melika.citra@arsalynk.id',
    'melika.ops@arsalynk.id',
    'arof.fudding@arsalynk.id',
    'arof.finance@arsalynk.id',
    'laode.fahmi@arsalynk.id',
    'jundy.isham@arsalynk.id',
    'noorman.perdana@arsalynk.id',
  ];

  // Link official users to PT Sinergi Muda Arsa
  const officialUsers = await prisma.iam_user.findMany({
    where: { email: { in: officialEmails } },
  });

  for (const u of officialUsers) {
    await prisma.iam_user.update({
      where: { id: u.id },
      data: { tenant_id: tenantSMA.id, status: 'ACTIVE' },
    });
    await prisma.iam_user_role.updateMany({
      where: { user_id: u.id },
      data: { company_id: companySMA.id, organization_id: orgSMA.id },
    });
  }

  // Link dummy/ghost users to Ghost Company
  const ghostUsers = await prisma.iam_user.findMany({
    where: { email: { notIn: officialEmails } },
  });

  for (const u of ghostUsers) {
    await prisma.iam_user.update({
      where: { id: u.id },
      data: { tenant_id: tenantGhost.id, status: 'GHOST' },
    });
    if (companyGhost && orgGhost) {
      await prisma.iam_user_role.updateMany({
        where: { user_id: u.id },
        data: { company_id: companyGhost.id, organization_id: orgGhost.id },
      });
    }
  }

  // =========================================================================
  // 5. SEPARATE PROJECTS: 3 REAL PROJECTS -> SMA, PROTOTYPE PROJECTS -> GHOST
  // =========================================================================
  const officialProjectCodes = ['PRJ-SMA-2026-001', 'PRJ-SMA-2026-002', 'PRJ-SMA-2026-003'];

  // Map 3 real projects to PT Sinergi Muda Arsa
  await prisma.project_project.updateMany({
    where: { project_code: { in: officialProjectCodes } },
    data: {
      tenant_id: tenantSMA.id,
      company_id: companySMA.id,
      status: 'STARTED',
      lifecycle_status: 'STARTED',
    },
  });

  // Map all prototype/demo projects to Ghost Company
  if (companyGhost) {
    await prisma.project_project.updateMany({
      where: { project_code: { notIn: officialProjectCodes } },
      data: {
        tenant_id: tenantGhost.id,
        company_id: companyGhost.id,
        status: 'GHOST_ARCHIVED',
        lifecycle_status: 'CLOSED',
      },
    });
  }

  // =========================================================================
  // 6. VERIFICATION
  // =========================================================================
  const allCompanies = await prisma.core_company.findMany();
  const smaProjects = await prisma.project_project.findMany({ where: { company_id: companySMA.id } });
  const ghostProjects = await prisma.project_project.findMany({ where: { company_id: companyGhost?.id } });

  console.log('\n--- VERIFICATION RESULT ---');
  console.log('Companies in DB:', allCompanies.map((c) => ({ id: c.id, code: c.company_code, name: c.legal_name, status: c.status })));
  console.log('PT Sinergi Muda Arsa Official Projects (Count: ' + smaProjects.length + '):', smaProjects.map((p) => `[${p.project_code}] ${p.project_name}`));
  console.log('Ghost Company Demo Projects Count:', ghostProjects.length);
  console.log('=== CONFIGURATION COMPLETE! ===');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
