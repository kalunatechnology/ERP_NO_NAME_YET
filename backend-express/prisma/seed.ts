import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const DUMMY_PASSWORD = 'DummyPass123!';

async function main() {
  console.log('🌱 Starting universal ERP database seeding...');

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(DUMMY_PASSWORD, salt);

  // 1. Tenants
  console.log('  -> Seeding Tenants...');
  let tenantArsalynk = await prisma.core_tenant.findFirst({ where: { code: 'ARSALYNK' } });
  if (!tenantArsalynk) {
    tenantArsalynk = await prisma.core_tenant.create({
      data: {
        id: '00000000-0000-0000-0000-000000000001',
        code: 'ARSALYNK',
        name: 'PT. Arsalynk Technology',
        status: 'ACTIVE',
      },
    });
  }

  let tenantDefault = await prisma.core_tenant.findFirst({ where: { code: 'DEFAULT' } });
  if (!tenantDefault) {
    tenantDefault = await prisma.core_tenant.create({
      data: {
        id: '00000000-0000-0000-0000-000000000002',
        code: 'DEFAULT',
        name: 'Default Company Group',
        status: 'ACTIVE',
      },
    });
  }

  // 2. Companies
  console.log('  -> Seeding Companies...');
  let companyArsalynk = await prisma.core_company.findFirst({ where: { company_code: 'ARSALYNK' } });
  if (!companyArsalynk) {
    companyArsalynk = await prisma.core_company.create({
      data: {
        id: '00000000-0000-0000-0000-000000000010',
        tenant_id: tenantArsalynk.id,
        company_code: 'ARSALYNK',
        legal_name: 'PT. Arsalynk Technology',
        tax_number: '01.234.567.8-001.000',
        fiscal_year_start: new Date('2026-01-01'),
        status: 'ACTIVE',
      },
    });
  }

  // 3. Organization Units
  console.log('  -> Seeding Organizations...');
  let orgHQ = await prisma.core_organization.findFirst({ where: { organization_code: 'ORG-HQ' } });
  if (!orgHQ) {
    orgHQ = await prisma.core_organization.create({
      data: {
        id: '00000000-0000-0000-0000-000000000100',
        tenant_id: tenantArsalynk.id,
        company_id: companyArsalynk.id,
        organization_code: 'ORG-HQ',
        organization_name: 'Headquarter Division',
        organization_type: 'DIVISION',
        status: 'ACTIVE',
      },
    });
  }

  // 4. Roles
  console.log('  -> Seeding Roles...');
  const rolesData = [
    { code: 'ROLE-ADMIN', name: 'System Administrator', desc: 'Full System Access' },
    { code: 'ROLE-DIRECTOR', name: 'Executive Director', desc: 'Executive Oversight & Approval' },
    { code: 'ROLE-PM', name: 'Project Manager', desc: 'Project & Task Management' },
    { code: 'ROLE-SUPERVISOR', name: 'Field Supervisor', desc: 'Site Operations & Task Verification' },
    { code: 'ROLE-CRM-LEAD', name: 'CRM & Commercial Lead', desc: 'Inquiries, Estimates, & Deals' },
    { code: 'ROLE-SALES', name: 'Sales Representative', desc: 'Sales Quotations & Customer Relations' },
    { code: 'ROLE-FINANCE', name: 'Finance & Accounting Lead', desc: 'General Ledger, Billing, & Payments' },
    { code: 'ROLE-STAFF', name: 'Operational Staff', desc: 'Daily Task Execution' },
  ];

  const roleMap = new Map<string, any>();
  for (const r of rolesData) {
    let role = await prisma.iam_role.findFirst({ where: { role_code: r.code } });
    if (!role) {
      role = await prisma.iam_role.create({
        data: {
          id: crypto.randomUUID(),
          tenant_id: tenantArsalynk.id,
          role_code: r.code,
          role_name: r.name,
          description: r.desc,
        },
      });
    }
    roleMap.set(r.code, role);
  }

  // 5. Demo Users
  console.log('  -> Seeding 10 Demo Accounts with DummyPass123! ...');
  const demoUsers = [
    { email: 'admin@arsalynk.id', username: 'admin', name: 'Admin System', isSuper: true, roleCode: 'ROLE-ADMIN' },
    { email: 'director@arsalynk.id', username: 'director', name: 'Executive Director', isSuper: false, roleCode: 'ROLE-DIRECTOR' },
    { email: 'pm@arsalynk.id', username: 'pm', name: 'Rina Sari PM', isSuper: false, roleCode: 'ROLE-PM' },
    { email: 'supervisor@arsalynk.id', username: 'supervisor', name: 'Ahmad Rizki Supervisor', isSuper: false, roleCode: 'ROLE-SUPERVISOR' },
    { email: 'manager@arsalynk.id', username: 'manager', name: 'Dewi Kurnia CRM Lead', isSuper: false, roleCode: 'ROLE-CRM-LEAD' },
    { email: 'sales@arsalynk.id', username: 'sales', name: 'Hendra Sales', isSuper: false, roleCode: 'ROLE-SALES' },
    { email: 'finance@arsalynk.id', username: 'finance', name: 'Budi Santoso Finance', isSuper: false, roleCode: 'ROLE-FINANCE' },
    { email: 'dummy.admin@example.com', username: 'dummy.admin', name: 'Dummy Administrator', isSuper: true, roleCode: 'ROLE-ADMIN' },
    { email: 'dummy.pm@example.com', username: 'dummy.pm', name: 'Dummy Project Manager', isSuper: false, roleCode: 'ROLE-PM' },
    { email: 'dummy.finance@example.com', username: 'dummy.finance', name: 'Dummy Finance', isSuper: false, roleCode: 'ROLE-FINANCE' },
    { email: 'project.manager.demo@erp.local', username: 'project.manager.demo@erp.local', name: 'Demo Project Manager', isSuper: false, roleCode: 'ROLE-PM' },
  ];

  for (const u of demoUsers) {
    const existing = await prisma.iam_user.findFirst({
      where: { OR: [{ email: u.email }, { username: u.username }] },
    });

    let user;
    if (existing) {
      user = await prisma.iam_user.update({
        where: { id: existing.id },
        data: {
          password_hash: passwordHash,
          full_name: u.name,
          is_active: true,
          is_staff: u.isSuper,
          is_superuser: u.isSuper,
          status: 'ACTIVE',
        },
      });
    } else {
      user = await prisma.iam_user.create({
        data: {
          id: crypto.randomUUID(),
          tenant_id: tenantArsalynk.id,
          email: u.email,
          username: u.username,
          full_name: u.name,
          password_hash: passwordHash,
          is_active: true,
          is_staff: u.isSuper,
          is_superuser: u.isSuper,
          status: 'ACTIVE',
          date_joined: new Date(),
        },
      });
    }

    const role = roleMap.get(u.roleCode);
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
            company_id: companyArsalynk.id,
            organization_id: orgHQ.id,
          },
        });
      }
    }
  }

  // 6. Master Data (Currencies, UOMs, Parties, Warehouses)
  console.log('  -> Seeding Master Data...');
  let currencyIDR = await prisma.master_currency.findFirst({ where: { currency_code: 'IDR' } });
  if (!currencyIDR) {
    currencyIDR = await prisma.master_currency.create({
      data: {
        id: crypto.randomUUID(),
        currency_code: 'IDR',
        currency_name: 'Indonesian Rupiah',
        symbol: 'Rp',
        decimal_places: 2,
      },
    });
  }

  let uomPCS = await prisma.master_uom.findFirst({ where: { uom_code: 'PCS' } });
  if (!uomPCS) {
    uomPCS = await prisma.master_uom.create({
      data: {
        id: crypto.randomUUID(),
        uom_code: 'PCS',
        uom_name: 'Pieces',
        dimension_type: 'UNIT',
        base_uom: true,
      },
    });
  }

  let partyCustomer = await prisma.master_party.findFirst({ where: { party_code: 'CUST-001' } });
  if (!partyCustomer) {
    partyCustomer = await prisma.master_party.create({
      data: {
        id: crypto.randomUUID(),
        tenant_id: tenantArsalynk.id,
        party_code: 'CUST-001',
        party_type: 'CUSTOMER',
        legal_name: 'PT Mega Konstruksi Nusantara',
        display_name: 'Mega Konstruksi',
        tax_number: '01.234.567.8-001.000',
        status: 'ACTIVE',
        default_currency_id: currencyIDR.id,
      },
    });
  }

  let custProfile = await prisma.master_customer_profile.findFirst({ where: { party_id: partyCustomer.id } });
  if (!custProfile) {
    await prisma.master_customer_profile.create({
      data: {
        id: crypto.randomUUID(),
        party_id: partyCustomer.id,
        customer_code: 'CUST-001',
        credit_limit: 1000000000,
        risk_category: 'LOW',
        credit_hold: false,
      },
    });
  }

  let warehouseMain = await prisma.master_warehouse.findFirst({ where: { warehouse_code: 'WH-MAIN' } });
  if (!warehouseMain) {
    await prisma.master_warehouse.create({
      data: {
        id: crypto.randomUUID(),
        company_id: companyArsalynk.id,
        warehouse_code: 'WH-MAIN',
        warehouse_name: 'Gudang Utama Cikarang',
        warehouse_type: 'CENTRAL',
        status: 'ACTIVE',
      },
    });
  }

  // 7. Chart of Accounts (COA)
  console.log('  -> Seeding Chart of Accounts & Journals...');
  const coaData = [
    { code: '1101', name: 'Kas dan Rekening Bank', type: 'ASSET', balance: 'DEBIT' },
    { code: '1103', name: 'Piutang Usaha (AR)', type: 'ASSET', balance: 'DEBIT' },
    { code: '1105', name: 'Persediaan Bahan & Barang', type: 'ASSET', balance: 'DEBIT' },
    { code: '1108', name: 'Pekerjaan Dalam Proses (WIP Proyek)', type: 'ASSET', balance: 'DEBIT' },
    { code: '2101', name: 'Hutang Usaha (AP)', type: 'LIABILITY', balance: 'CREDIT' },
    { code: '2103', name: 'Hutang Pajak Pertambahan Nilai (PPN)', type: 'LIABILITY', balance: 'CREDIT' },
    { code: '3101', name: 'Modal Disetor / Ekuitas', type: 'EQUITY', balance: 'CREDIT' },
    { code: '3102', name: 'Laba Ditahan', type: 'EQUITY', balance: 'CREDIT' },
    { code: '4101', name: 'Pendapatan Proyek & Jasa', type: 'REVENUE', balance: 'CREDIT' },
    { code: '5101', name: 'Beban Pokok Proyek (HPP / COGS)', type: 'EXPENSE', balance: 'DEBIT' },
    { code: '6101', name: 'Beban Operasional & Umum', type: 'EXPENSE', balance: 'DEBIT' },
  ];

  for (const c of coaData) {
    const existing = await prisma.fin_account.findFirst({
      where: { company_id: companyArsalynk.id, account_code: c.code },
    });
    if (!existing) {
      await prisma.fin_account.create({
        data: {
          id: crypto.randomUUID(),
          company_id: companyArsalynk.id,
          account_code: c.code,
          account_name: c.name,
          account_type: c.type,
          normal_balance: c.balance,
          allow_manual_posting: true,
          reconciliation_required: false,
          status: 'ACTIVE',
        },
      });
    }
  }

  // 8. Projects with WBS Task Hierarchy
  console.log('  -> Seeding Projects with WBS Tasks & Milestones...');
  const pmUser = await prisma.iam_user.findFirst({ where: { username: 'pm' } });

  let project1 = await prisma.project_project.findFirst({ where: { project_code: 'PRJ-2026-001' } });
  if (!project1) {
    project1 = await prisma.project_project.create({
      data: {
        id: crypto.randomUUID(),
        tenant_id: tenantArsalynk.id,
        company_id: companyArsalynk.id,
        customer_party_id: partyCustomer.id,
        customer_name: '',
        description: '',
        project_manager_id: pmUser?.id,
        manager_name: pmUser?.full_name ?? 'Rina Sari PM',
        project_code: 'PRJ-2026-001',
        project_name: 'Pembangunan Gardu Induk 150kV Cikarang',
        budget_amount: 850000000,
        progress_percent: 45.0,
        status: 'ACTIVE',
        lifecycle_status: 'IN_PROGRESS',
        health_status: 'GOOD',
        source_type: 'MANUAL',
        planned_start_date: new Date('2026-01-15'),
        planned_end_date: new Date('2026-08-30'),
        started_at: new Date('2026-01-15'),
      },
    });
  }

  // Milestone
  let milestone = await prisma.project_milestone.findFirst({ where: { project_id: project1.id } });
  if (!milestone) {
    await prisma.project_milestone.create({
      data: {
        id: crypto.randomUUID(),
        project_id: project1.id,
        milestone_name: 'Penyelesaian Struktur Pondasi Utama',
        planned_date: new Date('2026-04-30'),
        weight_percent: 30,
        status: 'COMPLETED',
      },
    });
  }

  // Main Task
  let mainTask = await prisma.project_main_task.findFirst({ where: { project_id: project1.id } });
  if (!mainTask) {
    mainTask = await prisma.project_main_task.create({
      data: {
        id: crypto.randomUUID(),
        project_id: project1.id,
        name: 'Pekerjaan Sipil & Pondasi Gardu',
        description: 'Pekerjaan Sipil & Pondasi Gardu',
        priority: 'MEDIUM',
        weight: 40.0,
        progress: 60.0,
        status: 'IN_PROGRESS',
        is_progress_overridden: false,
        override_reason: '',
        created_at: new Date(),
        updated_at: new Date(),
      },
    });
  }

  // Weekly Task
  let weeklyTask = await prisma.project_weekly_task.findFirst({ where: { main_task_id: mainTask.id } });
  if (!weeklyTask) {
    weeklyTask = await prisma.project_weekly_task.create({
      data: {
        id: crypto.randomUUID(),
        main_task_id: mainTask.id,
        week_number: 3,
        target_description: 'Pengecoran Tapak Transformer Week 3',
        progress: 75.0,
        status: 'IN_PROGRESS',
        is_progress_overridden: false,
        override_reason: '',
        created_at: new Date(),
        updated_at: new Date(),
      },
    });
  }

  // Daily Task
  const supervisorUser = await prisma.iam_user.findFirst({ where: { username: 'supervisor' } });
  let dailyTask = await prisma.project_daily_task.findFirst({ where: { weekly_task_id: weeklyTask.id } });
  if (!dailyTask) {
    await prisma.project_daily_task.create({
      data: {
        id: crypto.randomUUID(),
        weekly_task_id: weeklyTask.id,
        owner_id: supervisorUser?.id ?? '00000000-0000-0000-0000-000000000001',
        title: 'Pemasangan Bekisting & Besi Tulang D16',
        description: 'Pemasangan bekisting',
        time_slot: 'MORNING',
        output_result: 'Done',
        notes: '',
        progress: 100.0,
        status: 'COMPLETED',
        is_blocked: false,
        block_reason: '',
        created_at: new Date(),
        updated_at: new Date(),
      },
    });
  }

  // 9. CRM Opportunity
  console.log('  -> Seeding CRM Inquiries & Opportunities...');
  let opp = await prisma.crm_opportunity.findFirst({ where: { opportunity_name: 'Pengadaan Trafo Distribusi 2500kVA' } });
  if (!opp) {
    await prisma.crm_opportunity.create({
      data: {
        id: crypto.randomUUID(),
        tenant_id: tenantArsalynk.id,
        company_id: companyArsalynk.id,
        customer_party_id: partyCustomer.id,
        opportunity_name: 'Pengadaan Trafo Distribusi 2500kVA',
        expected_amount: 450000000,
        probability_percent: 75,
        pipeline_stage: 'NEGOTIATION',
        status: 'OPEN',
        opened_at: new Date(),
        lost_reason: '',
      },
    });
  }

  console.log('✅ Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeder error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
