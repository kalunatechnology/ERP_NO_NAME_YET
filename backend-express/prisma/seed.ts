import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const DUMMY_PASSWORD = 'DummyPass123!';

async function main() {
  console.log('🌱 Starting comprehensive universal ERP domain dataset seeding...');

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(DUMMY_PASSWORD, salt);

  // ===========================================================================
  // 1. CORE MULTI-TENANT & COMPANIES
  // ===========================================================================
  console.log('  -> [1/7] Seeding Tenants & Companies...');
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

  // ===========================================================================
  // 2. IAM ROLES & DOMAIN USER PROFILES
  // ===========================================================================
  console.log('  -> [2/7] Seeding Roles & Standard Demo Users (DummyPass123!)...');
  const rolesData = [
    { code: 'ROLE-ADMIN', name: 'System Administrator', desc: 'Full System Access' },
    { code: 'ROLE-DIRECTOR', name: 'Executive Director', desc: 'Executive Oversight & Approval' },
    { code: 'ROLE-PM', name: 'Project Manager', desc: 'Project & Task Management' },
    { code: 'ROLE-SUPERVISOR', name: 'Field Supervisor', desc: 'Site Operations & Task Verification' },
    { code: 'ROLE-CRM-LEAD', name: 'CRM & Commercial Lead', desc: 'Inquiries, Estimates, & Deals' },
    { code: 'ROLE-SALES', name: 'Sales Representative', desc: 'Sales Quotations & Customer Relations' },
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

  const demoUsers = [
    { email: 'admin@arsalynk.id', username: 'admin', name: 'Sutanto Admin', isSuper: true, roleCode: 'ROLE-ADMIN' },
    { email: 'director@arsalynk.id', username: 'director', name: 'Bambang Director', isSuper: false, roleCode: 'ROLE-DIRECTOR' },
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

  const userMap = new Map<string, any>();
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
          tenant_id: tenant.id,
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
    userMap.set(u.username, user);

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
            company_id: company.id,
            organization_id: orgHQ.id,
          },
        });
      }
    }
  }

  // ===========================================================================
  // 3. MASTER DATA (Currencies, UOMs, Parties, Warehouses, Products)
  // ===========================================================================
  console.log('  -> [3/7] Seeding Master Data (Currencies, Parties, Warehouses, Products)...');
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

  const partiesData = [
    { code: 'CUST-001', name: 'PT Mega Konstruksi Nusantara', type: 'CUSTOMER' },
    { code: 'CUST-002', name: 'PT Industri Otomasi Nusantara', type: 'CUSTOMER' },
    { code: 'CUST-003', name: 'PT Sinar Surya Manufaktur', type: 'CUSTOMER' },
    { code: 'VEND-001', name: 'PT Jaya Teknik Mandiri', type: 'VENDOR' },
  ];

  const partyMap = new Map<string, any>();
  for (const p of partiesData) {
    let party = await prisma.master_party.findFirst({ where: { party_code: p.code } });
    if (!party) {
      party = await prisma.master_party.create({
        data: {
          id: crypto.randomUUID(),
          tenant_id: tenant.id,
          party_code: p.code,
          party_type: p.type,
          legal_name: p.name,
          display_name: p.name,
          tax_number: '01.234.567.8-001.000',
          status: 'ACTIVE',
          default_currency_id: currencyIDR.id,
        },
      });
    }
    partyMap.set(p.code, party);
  }

  let warehouseMain = await prisma.master_warehouse.findFirst({ where: { warehouse_code: 'WH-MAIN' } });
  if (!warehouseMain) {
    warehouseMain = await prisma.master_warehouse.create({
      data: {
        id: crypto.randomUUID(),
        company_id: company.id,
        warehouse_code: 'WH-MAIN',
        warehouse_name: 'Gudang Utama Cikarang',
        warehouse_type: 'CENTRAL',
        status: 'ACTIVE',
      },
    });
  }

  // Products
  const productsData = [
    { code: 'PROD-SRV-001', name: 'Motor Servo Industrial 5.5kW' },
    { code: 'PROD-PLC-001', name: 'PLC Logic Controller FX5U' },
    { code: 'PROD-OPT-001', name: 'Optical Photoelectric Sensor D12' },
  ];
  for (const pr of productsData) {
    const existing = await prisma.master_product.findFirst({ where: { product_code: pr.code } });
    if (!existing) {
      await prisma.master_product.create({
        data: {
          id: crypto.randomUUID(),
          tenant_id: tenant.id,
          product_code: pr.code,
          product_name: pr.name,
          product_type: 'STOCK',
          costing_method: 'FIFO',
          stock_item: true,
          purchase_item: true,
          sales_item: true,
          manufactured_item: false,
          lot_controlled: false,
          serial_controlled: false,
          status: 'ACTIVE',
        },
      });
    }
  }

  // ===========================================================================
  // 4. CHART OF ACCOUNTS (FINANCE COA)
  // ===========================================================================
  console.log('  -> [4/7] Seeding Chart of Accounts (Finance COA)...');
  const coaData = [
    { code: '1101', name: 'Kas dan Rekening Bank Operasional', type: 'ASSET', balance: 'DEBIT' },
    { code: '1103', name: 'Piutang Usaha Proyek (AR)', type: 'ASSET', balance: 'DEBIT' },
    { code: '1105', name: 'Persediaan Material & Komponen', type: 'ASSET', balance: 'DEBIT' },
    { code: '1108', name: 'Pekerjaan Dalam Proses (WIP Proyek)', type: 'ASSET', balance: 'DEBIT' },
    { code: '2101', name: 'Hutang Usaha Supplier (AP)', type: 'LIABILITY', balance: 'CREDIT' },
    { code: '2103', name: 'Hutang Pajak PPN Keluaran', type: 'LIABILITY', balance: 'CREDIT' },
    { code: '3101', name: 'Modal Disetor & Ekuitas', type: 'EQUITY', balance: 'CREDIT' },
    { code: '4101', name: 'Pendapatan Kontrak Proyek & Jasa', type: 'REVENUE', balance: 'CREDIT' },
    { code: '5101', name: 'Beban Pokok Proyek (HPP Material & Upah)', type: 'EXPENSE', balance: 'DEBIT' },
    { code: '6101', name: 'Beban Operasional & Lapangan', type: 'EXPENSE', balance: 'DEBIT' },
  ];

  for (const c of coaData) {
    const existing = await prisma.fin_account.findFirst({
      where: { company_id: company.id, account_code: c.code },
    });
    if (!existing) {
      await prisma.fin_account.create({
        data: {
          id: crypto.randomUUID(),
          company_id: company.id,
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

  // ===========================================================================
  // 5. CRM & SALES PIPELINE
  // ===========================================================================
  console.log('  -> [5/7] Seeding CRM & Commercial Opportunities...');
  const customer1 = partyMap.get('CUST-001');
  const customer2 = partyMap.get('CUST-002');
  const adminUser = userMap.get('admin');

  let opp1 = await prisma.crm_opportunity.findFirst({ where: { opportunity_name: 'Implementasi Sistem Otomasi Conveyor Line 1' } });
  if (!opp1) {
    opp1 = await prisma.crm_opportunity.create({
      data: {
        id: crypto.randomUUID(),
        tenant_id: tenant.id,
        company_id: company.id,
        customer_party_id: customer1.id,
        opportunity_name: 'Implementasi Sistem Otomasi Conveyor Line 1',
        expected_amount: 850000000,
        probability_percent: 100,
        pipeline_stage: 'WON',
        status: 'WON',
        opened_at: new Date(Date.now() - 30 * 86400000),
        closed_at: new Date(Date.now() - 5 * 86400000),
        lost_reason: '',
      },
    });
  }

  let opp2 = await prisma.crm_opportunity.findFirst({ where: { opportunity_name: 'Pembangunan Gardu Induk 150kV Cikarang' } });
  if (!opp2) {
    opp2 = await prisma.crm_opportunity.create({
      data: {
        id: crypto.randomUUID(),
        tenant_id: tenant.id,
        company_id: company.id,
        customer_party_id: customer2.id,
        opportunity_name: 'Pembangunan Gardu Induk 150kV Cikarang',
        expected_amount: 1250000000,
        probability_percent: 85,
        pipeline_stage: 'PROPOSAL_SENT',
        status: 'OPEN',
        opened_at: new Date(Date.now() - 15 * 86400000),
        lost_reason: '',
      },
    });
  }

  // ===========================================================================
  // 6. PROJECTS & 5-LEVEL WBS HIERARCHY DATA
  // ===========================================================================
  console.log('  -> [6/7] Seeding Projects & Complete 5-Level WBS Task Trees...');
  const pmUser = userMap.get('pm');
  const supervisorUser = userMap.get('supervisor');

  // Project 1
  let project1 = await prisma.project_project.findFirst({ where: { project_code: 'PRJ-2026-001' } });
  if (!project1) {
    project1 = await prisma.project_project.create({
      data: {
        id: crypto.randomUUID(),
        tenant_id: tenant.id,
        company_id: company.id,
        customer_party_id: customer1.id,
        customer_name: customer1.display_name,
        description: 'Pemasangan Conveyor Otomatis, Motor Servo, dan SCADA Integration',
        project_manager_id: pmUser?.id,
        manager_name: pmUser?.full_name ?? 'Rina Sari PM',
        project_code: 'PRJ-2026-001',
        project_name: 'Implementasi Sistem Otomasi Conveyor Line 1',
        budget_amount: 850000000,
        contract_amount: 943500000,
        target_margin_percent: 25.0,
        progress_percent: 65.0,
        status: 'ACTIVE',
        lifecycle_status: 'STARTED',
        health_status: 'GOOD',
        source_type: 'MANUAL',
        planned_start_date: new Date('2026-01-15'),
        planned_end_date: new Date('2026-08-30'),
        started_at: new Date('2026-01-15'),
      },
    });
  }

  // Milestones for Project 1
  const milestonesData = [
    { name: 'Site Assessment & Engineering Design', weight: 20, status: 'COMPLETED' },
    { name: 'Pabrikasi Struktur & Instalasi Motor Servo', weight: 45, status: 'COMPLETED' },
    { name: 'Integrasi PLC SCADA & Quality Gate Handover', weight: 35, status: 'PENDING' },
  ];
  for (const m of milestonesData) {
    const existing = await prisma.project_milestone.findFirst({
      where: { project_id: project1.id, milestone_name: m.name },
    });
    if (!existing) {
      await prisma.project_milestone.create({
        data: {
          id: crypto.randomUUID(),
          project_id: project1.id,
          milestone_name: m.name,
          planned_date: new Date('2026-06-30'),
          weight_percent: m.weight,
          status: m.status,
        },
      });
    }
  }

  // Main Tasks for Project 1
  const mainTasksData = [
    { name: 'L1: Fabrikasi Rangka Conveyor & Mekanikal', weight: 40, progress: 100, status: 'COMPLETED' },
    { name: 'L1: Instalasi Motor Servo & Wiring Elektrikal', weight: 35, progress: 60, status: 'IN_PROGRESS' },
    { name: 'L1: Pemrograman PLC SCADA & Commissioning', weight: 25, progress: 0, status: 'PLANNED' },
  ];

  for (let i = 0; i < mainTasksData.length; i++) {
    const m = mainTasksData[i];
    let mt = await prisma.project_main_task.findFirst({
      where: { project_id: project1.id, name: m.name },
    });
    if (!mt) {
      mt = await prisma.project_main_task.create({
        data: {
          id: crypto.randomUUID(),
          project_id: project1.id,
          name: m.name,
          description: m.name,
          priority: 'MEDIUM',
          weight: m.weight,
          progress: m.progress,
          status: m.status,
          is_progress_overridden: false,
          override_reason: '',
          created_by_id: pmUser?.id,
          created_at: new Date(),
          updated_at: new Date(),
        },
      });
    }

    // Weekly Tasks
    let wt = await prisma.project_weekly_task.findFirst({ where: { main_task_id: mt.id } });
    if (!wt) {
      wt = await prisma.project_weekly_task.create({
        data: {
          id: crypto.randomUUID(),
          main_task_id: mt.id,
          assignee_id: supervisorUser?.id,
          week_number: i + 1,
          target_description: `Target Eksekusi Mingguan - ${m.name}`,
          progress: m.progress,
          status: m.status === 'COMPLETED' ? 'COMPLETED' : m.progress > 0 ? 'IN_PROGRESS' : 'PLANNED',
          is_progress_overridden: false,
          override_reason: '',
          created_at: new Date(),
          updated_at: new Date(),
        },
      });
    }

    // Daily Tasks
    let dt = await prisma.project_daily_task.findFirst({ where: { weekly_task_id: wt.id } });
    if (!dt) {
      await prisma.project_daily_task.create({
        data: {
          id: crypto.randomUUID(),
          weekly_task_id: wt.id,
          owner_id: supervisorUser?.id ?? '00000000-0000-0000-0000-000000000001',
          title: `Aktivitas Harian Lapangan (${m.name})`,
          description: 'Pengerjaan sesuai instruksi kerja safety & QA',
          time_slot: '09.00 - 16.00',
          output_result: m.status === 'COMPLETED' ? 'Selesai 100%' : 'Sedang berjalan',
          notes: '',
          progress: m.progress,
          status: m.status === 'COMPLETED' ? 'COMPLETED' : m.progress > 0 ? 'IN_PROGRESS' : 'NOT_STARTED',
          is_blocked: false,
          block_reason: '',
          created_at: new Date(),
          updated_at: new Date(),
        },
      });
    }
  }

  // Project 2: Pembangunan Gardu Induk
  let project2 = await prisma.project_project.findFirst({ where: { project_code: 'PRJ-2026-002' } });
  if (!project2) {
    project2 = await prisma.project_project.create({
      data: {
        id: crypto.randomUUID(),
        tenant_id: tenant.id,
        company_id: company.id,
        customer_party_id: customer2.id,
        customer_name: customer2.display_name,
        description: 'Pekerjaan pondasi tapak gardu, transformator 150kV dan panel proteksi',
        project_manager_id: pmUser?.id,
        manager_name: pmUser?.full_name ?? 'Rina Sari PM',
        project_code: 'PRJ-2026-002',
        project_name: 'Pembangunan Gardu Induk 150kV Cikarang',
        budget_amount: 1250000000,
        contract_amount: 1420000000,
        target_margin_percent: 22.0,
        progress_percent: 45.0,
        status: 'ACTIVE',
        lifecycle_status: 'IN_PROGRESS',
        health_status: 'GOOD',
        source_type: 'MANUAL',
        planned_start_date: new Date('2026-02-01'),
        planned_end_date: new Date('2026-10-15'),
        started_at: new Date('2026-02-01'),
      },
    });
  }

  // ===========================================================================
  // 7. FINANCIAL EXPENSES & FUNDING REQUESTS
  // ===========================================================================
  console.log('  -> [7/7] Seeding Financial Expenses & Funding Requests...');
  const expensesData = [
    { desc: 'Pengadaan Motor Servo & Optical Sensors', elem: 'Material Pengadaan', amt: 280000000 },
    { desc: 'Upah Direct Labor & Teknisi Lapangan Sprint 1', elem: 'Upah Tenaga Kerja', amt: 95000000 },
    { desc: 'Sewa Alat Crane & Logistik Staging', elem: 'Logistik & Alat Berat', amt: 25000000 },
  ];

  for (const c of expensesData) {
    const existing = await prisma.project_expense.findFirst({
      where: { project_id: project1.id, title: c.desc },
    });
    if (!existing) {
      await prisma.project_expense.create({
        data: {
          id: crypto.randomUUID(),
          project_id: project1.id,
          title: c.desc,
          category: c.elem,
          vendor_name: 'PT Jaya Teknik Mandiri',
          expense_date: new Date(),
          amount: c.amt,
          description: c.desc,
          created_at: new Date(),
          updated_at: new Date(),
        },
      });
    }
  }

  // Funding Request
  let funding = await prisma.fin_project_funding.findFirst({ where: { project_id: project1.id } });
  if (!funding) {
    await prisma.fin_project_funding.create({
      data: {
        id: crypto.randomUUID(),
        tenant_id: tenant.id,
        company_id: company.id,
        project_id: project1.id,
        funding_type: 'INTERNAL',
        requested_amount: 150000000,
        approved_limit: 150000000,
        purpose: 'Dana Operasional Lapangan & Pengadaan Sparepart Tambahan',
        status: 'APPROVED',
        requested_by_id: pmUser?.id,
        submitted_at: new Date(),
        approved_by_id: adminUser?.id,
        approved_at: new Date(),
        review_note: 'Disetujui untuk kelancaran eksekusi milestone tahap 2',
      },
    });
  }

  console.log('🎉 Universal ERP Database Seeding completed successfully with 100% domain alignment!');
}

main()
  .catch((e) => {
    console.error('❌ Seeder execution error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
