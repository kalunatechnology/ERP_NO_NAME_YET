import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('=== SEEDING 6 REAL TEAM USERS ===');

  let tenant = await prisma.core_tenant.findFirst({ where: { code: 'ARSALYNK' } });
  if (!tenant) {
    tenant = await prisma.core_tenant.create({
      data: {
        id: '00000000-0000-0000-0000-000000000001',
        code: 'ARSALYNK',
        name: 'PT. Arsalynk Technology',
        status: 'ACTIVE',
      },
    });
  }

  let company = await prisma.core_company.findFirst({ where: { company_code: 'ARSALYNK' } });
  if (!company) {
    company = await prisma.core_company.create({
      data: {
        id: '00000000-0000-0000-0000-000000000010',
        tenant_id: tenant.id,
        company_code: 'ARSALYNK',
        legal_name: 'PT. Arsalynk Technology Indonesia',
        tax_number: '01.234.567.8-001.000',
        fiscal_year_start: new Date('2026-01-01'),
        status: 'ACTIVE',
      },
    });
  }

  let orgHQ = await prisma.core_organization.findFirst({ where: { organization_code: 'ORG-HQ' } });
  if (!orgHQ) {
    orgHQ = await prisma.core_organization.create({
      data: {
        id: '00000000-0000-0000-0000-000000000100',
        tenant_id: tenant.id,
        company_id: company.id,
        organization_code: 'ORG-HQ',
        organization_name: 'Headquarter Division',
        organization_type: 'DIVISION',
        status: 'ACTIVE',
      },
    });
  }

  // 2. Ensure Roles exist
  const rolesData = [
    { code: 'ROLE-ADMIN', name: 'System Administrator', desc: 'Full System Access' },
    { code: 'ROLE-DIRECTOR', name: 'Executive Director', desc: 'Executive Oversight & Approval' },
    { code: 'ROLE-PM', name: 'Project Manager', desc: 'Project & Task Management' },
    { code: 'ROLE-SUPERVISOR', name: 'Field Supervisor', desc: 'Site Operations & Task Verification' },
    { code: 'ROLE-FINANCE', name: 'Finance Controller', desc: 'General Ledger, Billing, & Payments' },
    { code: 'ROLE-STAFF', name: 'Operational Staff', desc: 'Daily Task Execution' },
  ];

  const roleMap = new Map<string, any>();
  for (const r of rolesData) {
    let role = await prisma.iam_role.findFirst({ where: { role_code: r.code } });
    if (!role) {
      role = await prisma.iam_role.create({
        data: {
          id: crypto.randomUUID(),
          tenant_id: tenant.id,
          role_code: r.code,
          role_name: r.name,
          description: r.desc,
        },
      });
    }
    roleMap.set(r.code, role);
  }

  // 3. Password Hash (Default initial password: 'DummyPass123!' or 'Arsalynt2026!')
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash('DummyPass123!', salt);

  // 4. Define the 6 real users
  const teamUsers = [
    {
      name: 'Rian Destianto',
      email: 'rian.destianto@arsalynk.id',
      username: 'rian.destianto',
      isSuper: true,
      roles: ['ROLE-DIRECTOR', 'ROLE-ADMIN'],
      desc: 'Eksekutif / Direksi & Administrator',
    },
    {
      name: 'Melika Citra Tania',
      email: 'melika.citra@arsalynk.id',
      username: 'melika.citra',
      isSuper: false,
      roles: ['ROLE-PM', 'ROLE-SUPERVISOR'],
      desc: 'Project Manager & Operational Manager',
    },
    {
      name: 'Arof Fudding',
      email: 'arof.fudding@arsalynk.id',
      username: 'arof.fudding',
      isSuper: false,
      roles: ['ROLE-PM', 'ROLE-FINANCE'],
      desc: 'Project Manager & Finance',
    },
    {
      name: 'Laode Fahmi Hidayat',
      email: 'laode.fahmi@arsalynk.id',
      username: 'laode.fahmi',
      isSuper: false,
      roles: ['ROLE-SUPERVISOR', 'ROLE-STAFF'],
      desc: 'Project Assignee / Field Engineer',
    },
    {
      name: 'Jundy Isham Izzudin',
      email: 'jundy.isham@arsalynk.id',
      username: 'jundy.isham',
      isSuper: false,
      roles: ['ROLE-SUPERVISOR', 'ROLE-STAFF'],
      desc: 'Project Assignee / Field Engineer',
    },
    {
      name: 'M Noorman Perdana',
      email: 'noorman.perdana@arsalynk.id',
      username: 'noorman.perdana',
      isSuper: false,
      roles: ['ROLE-SUPERVISOR', 'ROLE-STAFF'],
      desc: 'Project Assignee / Field Engineer',
    },
  ];

  for (const tu of teamUsers) {
    const existing = await prisma.iam_user.findFirst({
      where: { OR: [{ email: tu.email }, { username: tu.username }] },
    });

    let user;
    if (existing) {
      user = await prisma.iam_user.update({
        where: { id: existing.id },
        data: {
          full_name: tu.name,
          email: tu.email,
          username: tu.username,
          password_hash: passwordHash,
          is_active: true,
          is_staff: tu.isSuper,
          is_superuser: tu.isSuper,
          status: 'ACTIVE',
        },
      });
      console.log(`Updated user: ${tu.name} (${tu.email})`);
    } else {
      user = await prisma.iam_user.create({
        data: {
          id: crypto.randomUUID(),
          tenant_id: tenant.id,
          email: tu.email,
          username: tu.username,
          full_name: tu.name,
          password_hash: passwordHash,
          is_active: true,
          is_staff: tu.isSuper,
          is_superuser: tu.isSuper,
          status: 'ACTIVE',
          date_joined: new Date(),
        },
      });
      console.log(`Created user: ${tu.name} (${tu.email})`);
    }

    // Assign roles
    for (const rCode of tu.roles) {
      const role = roleMap.get(rCode);
      if (role) {
        const existingUR = await prisma.iam_user_role.findFirst({
          where: { user_id: user.id, role_id: role.id },
        });
        if (!existingUR) {
          await prisma.iam_user_role.create({
            data: {
              id: crypto.randomUUID(),
              user_id: user.id,
              role_id: role.id,
              company_id: company.id,
              organization_id: orgHQ.id,
            },
          });
        }
      }
    }
  }

  console.log('=== SEEDING COMPLETED SUCCESSFULLY ===');
}

main()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
