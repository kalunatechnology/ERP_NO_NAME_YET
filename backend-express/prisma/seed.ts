import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { parseRoleCode } from '../src/types/roles';

const prisma = new PrismaClient();
const DUMMY_PASSWORD = 'DummyPass123!';

/**
 * Declares a seed-managed account and its least-privilege IAM assignment.
 *
 * The catalog is intentionally the only source of user-role truth for the
 * development/demo identities below. A non-superuser always receives one
 * explicit company membership; only the dedicated system account is global.
 */
type SeedUser = {
  email: string;
  username: string;
  name: string;
  isSuper: boolean;
  roleCodes: string[];
  activeRoleCode: string;
  tenantId: string;
  companyId: string | null;
};

/**
 * main implements this file's named function contract.
 *
 * @param input - Uses the typed parameters declared by the signature.
 * @returns The value or Promise declared by the implementation.
 * Database: reads or mutates `core_tenant`, `core_company`, `core_organization` exactly as shown; no wider transaction is implied.
 * Failure/side effects: propagates validation, authorization, persistence, or dependency failures according to the existing caller contract.
 */
async function main() {
  console.log('🌱 Starting comprehensive universal ERP domain dataset seeding...');

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(DUMMY_PASSWORD, salt);

  // ===========================================================================
  // 1. CORE MULTI-TENANT & COMPANIES (PT SINERGI MUDA ARSA & GHOST)
  // ===========================================================================
  console.log('  -> [1/7] Seeding Tenants & Companies (PT Sinergi Muda Arsa)...');
  
  // 1.1 Tenant Resmi: PT Sinergi Muda Arsa
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

  // 1.2 Tenant Testing: Ghost Company Workspace (PT Coba Arsalynk)
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

  let orgHQ = await prisma.core_organization.findFirst({ where: { organization_code: 'ORG-HQ' } });
  if (!orgHQ) {
    orgHQ = await prisma.core_organization.create({
      data: {
        id: '00000000-0000-0000-0000-000000000100',
        tenant_id: tenantSMA.id,
        company_id: compSMA.id,
        organization_code: 'ORG-HQ',
        organization_name: 'Kantor Pusat PT Sinergi Muda Arsa',
        organization_type: 'DIVISION',
        status: 'ACTIVE',
      },
    });
  }

  // Ghost users must never point at SMA's organization: company isolation is
  // enforced by both membership and role-assignment context.
  let orgGhost = await prisma.core_organization.findFirst({ where: { organization_code: 'ORG-GHOST-HQ' } });
  if (!orgGhost) {
    orgGhost = await prisma.core_organization.create({
      data: {
        id: '00000000-0000-0000-0000-000000000199',
        tenant_id: tenantGhost.id,
        company_id: compGhost.id,
        organization_code: 'ORG-GHOST-HQ',
        organization_name: 'Ghost Company Headquarters',
        organization_type: 'DIVISION',
        status: 'GHOST',
      },
    });
  }

  // Fallback aliases
  const tenant = tenantSMA;
  const company = compSMA;

  // ===========================================================================
  // 2. IAM ROLES & DOMAIN USER PROFILES
  // ===========================================================================
  console.log('  -> [2/7] Seeding Roles & Official Team (DummyPass123!)...');
  const rolesData = [
    { code: 'ROLE-SUPER-ADMIN', name: 'Super Administrator', desc: 'Company governance, module enablement, and global read access' },
    { code: 'ROLE-COMPANY-ADMIN', name: 'Company Administrator', desc: 'User and access administration within one company' },
    { code: 'ROLE-DIRECTOR', name: 'Executive Director', desc: 'Executive Oversight & Approval' },
    { code: 'ROLE-OM', name: 'Operational Manager', desc: 'Operational delivery, project oversight, and periodic reporting' },
    { code: 'ROLE-PM', name: 'Project Manager', desc: 'Project & Task Management' },
    { code: 'ROLE-SUPERVISOR', name: 'Field Supervisor', desc: 'Site Operations & Task Verification' },
    { code: 'ROLE-CRM-LEAD', name: 'CRM & Commercial Lead', desc: 'Inquiries, Estimates, & Deals' },
    { code: 'ROLE-SALES', name: 'Sales Representative', desc: 'Sales Quotations & Customer Relations' },
    { code: 'ROLE-FINANCE', name: 'Finance Controller', desc: 'General Ledger, Billing, & Payments' },
    { code: 'ROLE-STAFF', name: 'Operational Staff', desc: 'Daily Task Execution' },
  ];

  const roleMap = new Map<string, any>();
  for (const tenantId of [tenantSMA.id, tenantGhost.id]) {
    for (const r of rolesData) {
      const roleCode = parseRoleCode(r.code);
      if (!roleCode) throw new Error(`Unknown role code: ${r.code}`);
      let role = await prisma.iam_role.findFirst({ where: { tenant_id: tenantId, role_code: roleCode } });
      if (!role) {
        role = await prisma.iam_role.create({
          data: {
            id: crypto.randomUUID(),
            tenant_id: tenantId,
            role_code: roleCode,
            role_name: r.name,
            description: r.desc,
          },
        });
      }
      roleMap.set(`${tenantId}:${r.code}`, role);
    }
  }

  /**
   * Demo identity catalog.
   *
   * Security rules:
   * - dummy.admin@example.com is the sole global Super Admin.
   * - Laode Fahmi is the SMA Company Admin. Rian is Director only, preserving
   *   the separation between company IAM administration and executive approval.
   * - Arof's primary account intentionally carries PM + Finance and defaults
   *   to PM; the dedicated finance persona remains available for focused tests.
   * - Every non-superuser is bound to exactly one company.
   *
   * The listed default password is hashed only when an account is first
   * created. Existing passwords are deliberately preserved on later seeds.
   */
  const officialUsers: SeedUser[] = [
    // PT Sinergi Muda Arsa — official/demo team
    { email: 'rian@arsalynk.com', username: 'rian', name: 'Rian Destianto', isSuper: false, roleCodes: ['ROLE-DIRECTOR'], activeRoleCode: 'ROLE-DIRECTOR', tenantId: tenantSMA.id, companyId: compSMA.id },
    { email: 'melika@arsalynk.com', username: 'melika', name: 'Melika Citra Tania', isSuper: false, roleCodes: ['ROLE-PM', 'ROLE-OM'], activeRoleCode: 'ROLE-PM', tenantId: tenantSMA.id, companyId: compSMA.id },
    { email: 'melika.ops@arsalynk.com', username: 'melika.ops', name: 'Melika (Ops)', isSuper: false, roleCodes: ['ROLE-OM', 'ROLE-SUPERVISOR'], activeRoleCode: 'ROLE-OM', tenantId: tenantSMA.id, companyId: compSMA.id },
    // Approved multi-role account: Arof can operate as both PM and Finance.
    // The active role remains PM by default and may be switched in-session.
    { email: 'arof@arsalynk.com', username: 'arof', name: 'Arof Fudding', isSuper: false, roleCodes: ['ROLE-PM', 'ROLE-FINANCE'], activeRoleCode: 'ROLE-PM', tenantId: tenantSMA.id, companyId: compSMA.id },
    { email: 'arof.finance@arsalynk.com', username: 'arof.finance', name: 'Arof (Finance)', isSuper: false, roleCodes: ['ROLE-FINANCE'], activeRoleCode: 'ROLE-FINANCE', tenantId: tenantSMA.id, companyId: compSMA.id },
    { email: 'laode@arsalynk.com', username: 'laode', name: 'Laode Fahmi Hidayat', isSuper: false, roleCodes: ['ROLE-COMPANY-ADMIN', 'ROLE-SUPERVISOR', 'ROLE-STAFF'], activeRoleCode: 'ROLE-COMPANY-ADMIN', tenantId: tenantSMA.id, companyId: compSMA.id },
    { email: 'jundy@arsalynk.com', username: 'jundy', name: 'Jundy Isham Izzudin', isSuper: false, roleCodes: ['ROLE-SUPERVISOR', 'ROLE-STAFF'], activeRoleCode: 'ROLE-SUPERVISOR', tenantId: tenantSMA.id, companyId: compSMA.id },
    { email: 'noorman@arsalynk.com', username: 'noorman', name: 'M Noorman Perdana', isSuper: false, roleCodes: ['ROLE-SUPERVISOR', 'ROLE-STAFF'], activeRoleCode: 'ROLE-SUPERVISOR', tenantId: tenantSMA.id, companyId: compSMA.id },

    // PT Coba Arsalynk — isolated Ghost localhost/UAT identities
    { email: 'dummy.admin@example.com', username: 'dummy.admin', name: 'System Super Administrator', isSuper: true, roleCodes: ['ROLE-SUPER-ADMIN'], activeRoleCode: 'ROLE-SUPER-ADMIN', tenantId: tenantGhost.id, companyId: null },
    { email: 'admin.director@arsalynk.id', username: 'admin.director', name: 'Ghost Admin System', isSuper: false, roleCodes: ['ROLE-COMPANY-ADMIN'], activeRoleCode: 'ROLE-COMPANY-ADMIN', tenantId: tenantGhost.id, companyId: compGhost.id },
    { email: 'director@arsalynk.id', username: 'director', name: 'Ghost Executive Director', isSuper: false, roleCodes: ['ROLE-DIRECTOR'], activeRoleCode: 'ROLE-DIRECTOR', tenantId: tenantGhost.id, companyId: compGhost.id },
    { email: 'pm.lead@arsalynk.id', username: 'pm.lead', name: 'Ghost Lead Project Manager', isSuper: false, roleCodes: ['ROLE-PM'], activeRoleCode: 'ROLE-PM', tenantId: tenantGhost.id, companyId: compGhost.id },
    { email: 'supervisor@arsalynk.id', username: 'supervisor', name: 'Ghost Field Supervisor', isSuper: false, roleCodes: ['ROLE-SUPERVISOR', 'ROLE-STAFF'], activeRoleCode: 'ROLE-SUPERVISOR', tenantId: tenantGhost.id, companyId: compGhost.id },
    { email: 'crm.lead@arsalynk.id', username: 'crm.lead', name: 'Ghost CRM Lead', isSuper: false, roleCodes: ['ROLE-CRM-LEAD'], activeRoleCode: 'ROLE-CRM-LEAD', tenantId: tenantGhost.id, companyId: compGhost.id },
    { email: 'sales@arsalynk.id', username: 'sales', name: 'Ghost Sales Staff', isSuper: false, roleCodes: ['ROLE-SALES'], activeRoleCode: 'ROLE-SALES', tenantId: tenantGhost.id, companyId: compGhost.id },
    { email: 'finance.lead@arsalynk.id', username: 'finance.lead', name: 'Ghost Finance Controller', isSuper: false, roleCodes: ['ROLE-FINANCE'], activeRoleCode: 'ROLE-FINANCE', tenantId: tenantGhost.id, companyId: compGhost.id },
    { email: 'dummy.finance@example.com', username: 'dummy.finance', name: 'Ghost AP/AR Specialist', isSuper: false, roleCodes: ['ROLE-FINANCE'], activeRoleCode: 'ROLE-FINANCE', tenantId: tenantGhost.id, companyId: compGhost.id },
    { email: 'estimator@arsalynk.id', username: 'estimator', name: 'Ghost Cost Estimator', isSuper: false, roleCodes: ['ROLE-CRM-LEAD'], activeRoleCode: 'ROLE-CRM-LEAD', tenantId: tenantGhost.id, companyId: compGhost.id },
    { email: 'staff.dev@arsalynk.id', username: 'staff.dev', name: 'Ghost Technical Staff', isSuper: false, roleCodes: ['ROLE-STAFF'], activeRoleCode: 'ROLE-STAFF', tenantId: tenantGhost.id, companyId: compGhost.id },
  ];

  const userMap = new Map<string, any>();
  for (const u of officialUsers) {
    const existing = await prisma.iam_user.findFirst({
      where: { OR: [{ email: u.email }, { username: u.username }] },
    });

    let user;
    if (existing) {
      user = await prisma.iam_user.update({
        where: { id: existing.id },
        data: {
          tenant_id: u.tenantId,
          email: u.email,
          username: u.username,
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
          tenant_id: u.tenantId,
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

    /**
     * Reconcile, rather than only append, seed-managed roles.
     *
     * Leaving removed roles attached would silently preserve privilege after a
     * catalog revision. Arof PM+Finance is the approved current combination
     * and must not be treated as stale privilege.
     * This applies only to explicit seed identities, whose catalog is the
     * intended authority for their role set.
     */
    const expectedRoleIds = u.roleCodes
      .map((code) => roleMap.get(`${u.tenantId}:${code}`)?.id)
      .filter((id): id is string => Boolean(id));
    await prisma.iam_user_role.deleteMany({
      where: {
        user_id: user.id,
        role_id: { notIn: expectedRoleIds },
      },
    });

    // Sync the remaining exact role set and its company/organization scope.
    let firstAssignedRoleId: string | null = null;
    const organizationId = u.companyId === compGhost.id ? orgGhost.id : orgHQ.id;
    for (const code of u.roleCodes) {
      const role = roleMap.get(`${u.tenantId}:${code}`);
      if (role) {
        if (!firstAssignedRoleId) firstAssignedRoleId = role.id;
        const existingUR = await prisma.iam_user_role.findFirst({
          where: { user_id: user.id, role_id: role.id },
        });
        if (!existingUR) {
          await prisma.iam_user_role.create({
            data: {
              id: crypto.randomUUID(),
              user_id: user.id,
              role_id: role.id,
              tenant_id: u.tenantId,
              company_id: u.isSuper ? null : u.companyId,
              organization_id: u.isSuper ? null : organizationId,
            },
          });
        } else {
          await prisma.iam_user_role.update({
            where: { id: existingUR.id },
            data: {
              tenant_id: u.tenantId,
              company_id: u.isSuper ? null : u.companyId,
              organization_id: u.isSuper ? null : organizationId,
            },
          });
        }
      }
    }

    // Set Active Role
    const activeRole = u.activeRoleCode ? roleMap.get(`${u.tenantId}:${u.activeRoleCode}`) : null;
    const resolvedActiveRoleId = activeRole ? activeRole.id : firstAssignedRoleId;
    if (resolvedActiveRoleId) {
      await prisma.iam_user.update({
        where: { id: user.id },
        data: { active_role_id: resolvedActiveRoleId },
      });
    }

    // Sync Company Membership
    if (!u.isSuper && u.companyId) {
      await prisma.iam_user_company_membership.upsert({
        where: { user_id: user.id },
        update: {
          company_id: u.companyId,
          tenant_id: u.tenantId,
          status: 'ACTIVE',
        },
        create: {
          id: crypto.randomUUID(),
          user_id: user.id,
          company_id: u.companyId,
          tenant_id: u.tenantId,
          status: 'ACTIVE',
        },
      });
    } else if (u.isSuper) {
      // A global Super Admin is intentionally not a member of any company.
      await prisma.iam_user_company_membership.deleteMany({
        where: { user_id: user.id },
      });
    }
  }

  // ===========================================================================
  // 2.1 COMPANY MODULE ACCESS ENTITLEMENTS (Pay-per-module Feature Toggles)
  // ===========================================================================
  console.log('  -> [2.1/7] Seeding Company Module Entitlements...');
  const allModules = [
    'CORE',
    'REQUESTS',
    'CRM',
    'SALES',
    'PROJECTS',
    'FINANCE',
    'PROCUREMENT',
    'INVENTORY',
    'MANUFACTURING',
    'QUALITY',
    'ASSETS',
    'SERVICE',
    'LOGISTICS',
    'ANALYTICS',
    'IMPLEMENTATION',
    'REPORTING',
  ];

  // PT Sinergi Muda Arsa: all modules are readable by default. Write access is
  // fail-closed and is granted per module by the Company Admin when required.
  for (const moduleCode of allModules) {
    await prisma.iam_company_module_access.upsert({
      where: {
        company_id_module_code: {
          company_id: compSMA.id,
          module_code: moduleCode,
        },
      },
      update: {
        enabled: true,
        allow_read: true,
        allow_write: false,
      },
      create: {
        id: crypto.randomUUID(),
        tenant_id: tenantSMA.id,
        company_id: compSMA.id,
        module_code: moduleCode,
        enabled: true,
        allow_read: true,
        allow_write: false,
      },
    });
  }

  // PT Coba Arsalynk (Ghost): Selected modules enabled
  const ghostModules = ['CORE', 'REQUESTS', 'CRM', 'SALES', 'PROJECTS', 'FINANCE'];
  for (const moduleCode of allModules) {
    const isEnabled = ghostModules.includes(moduleCode);
    await prisma.iam_company_module_access.upsert({
      where: {
        company_id_module_code: {
          company_id: compGhost.id,
          module_code: moduleCode,
        },
      },
      update: {
        enabled: isEnabled,
        allow_read: isEnabled,
        allow_write: isEnabled,
      },
      create: {
        id: crypto.randomUUID(),
        tenant_id: tenantGhost.id,
        company_id: compGhost.id,
        module_code: moduleCode,
        enabled: isEnabled,
        allow_read: isEnabled,
        allow_write: isEnabled,
      },
    });
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
