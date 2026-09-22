import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcrypt';
import { parseRoleCode } from '../src/types/roles';
import { postgresPoolConfig } from '../src/config/postgres';

const prisma = new PrismaClient({
  adapter: new PrismaPg(postgresPoolConfig(process.env.DATABASE_URL || '')),
});
const DEFAULT_PASSWORD = process.env.SEED_DEFAULT_PASSWORD || 'DummyPass123!';
const PRODUCTION_CONFIRMATION = 'RESET_TO_SINERGI_MUDA_ARSA';

type SeedUser = { username: string; email: string; name: string; roleCodes: string[]; activeRoleCode: string; global?: boolean };
type DailySpec = { title: string; owner: string; date: string; result: string; status: 'COMPLETED' | 'IN_PROGRESS' | 'NOT_STARTED'; notes?: string };
type WeeklySpec = { title: string; assignee: string; start: string; end: string; target: string; status: 'COMPLETED' | 'IN_PROGRESS' | 'PLANNED'; daily: DailySpec[] };
type MainTaskSpec = { title: string; description: string; pic: string; assignees: string[]; start: string; due: string | null; status: 'COMPLETED' | 'IN_PROGRESS' | 'PLANNED'; weekly: WeeklySpec[] };
type ProjectSpec = { code: string; name: string; description: string; manager: string; members: string[]; start: string; deadline: string | null; mainTasks: MainTaskSpec[] };

const d = (value: string | null): Date | null => value ? new Date(`${value}T00:00:00.000+07:00`) : null;
const dailyProgress = (status: DailySpec['status']): number => status === 'COMPLETED' ? 100 : status === 'IN_PROGRESS' ? 25 : 0;
const average = (values: number[]): number => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;

/**
 * Authoritative production baseline. All application rows are removed before
 * the single approved tenant is rebuilt. Prisma migration history is retained.
 */
async function resetApplicationData(db: Prisma.TransactionClient): Promise<void> {
  await db.$executeRawUnsafe(`
    DO $$
    DECLARE table_list text;
    BEGIN
      SELECT string_agg(format('%I.%I', schemaname, tablename), ', ')
      INTO table_list
      FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> '_prisma_migrations';
      IF table_list IS NOT NULL THEN
        EXECUTE 'TRUNCATE TABLE ' || table_list || ' RESTART IDENTITY CASCADE';
      END IF;
    END $$;
  `);
}

const roles = [
  ['ROLE-SUPER-ADMIN', 'Super Administrator', 'Platform governance and global administration'],
  ['ROLE-COMPANY-ADMIN', 'Company Administrator', 'Company user and access administration'],
  ['ROLE-DIRECTOR', 'Executive Director', 'Executive oversight and approval'],
  ['ROLE-OM', 'Operational Manager', 'Operational delivery and reporting'],
  ['ROLE-PM', 'Project Manager', 'Project and task management'],
  ['ROLE-SUPERVISOR', 'Supervisor', 'Operational supervision'],
  ['ROLE-CRM-LEAD', 'CRM Lead', 'CRM and commercial operations'],
  ['ROLE-SALES', 'Sales', 'Sales operations'],
  ['ROLE-FINANCE', 'Finance', 'Finance operations'],
  ['ROLE-STAFF', 'Staff', 'Personal Daily Task execution'],
] as const;

export const users: SeedUser[] = [
  { username: 'system.admin', email: 'admin@arsalynk.com', name: 'System Administrator', roleCodes: ['ROLE-SUPER-ADMIN'], activeRoleCode: 'ROLE-SUPER-ADMIN', global: true },
  { username: 'laode', email: 'laode@arsalynk.com', name: 'Laode Fahmi Hidayat', roleCodes: ['ROLE-COMPANY-ADMIN', 'ROLE-STAFF'], activeRoleCode: 'ROLE-COMPANY-ADMIN' },
  { username: 'rian', email: 'rian@arsalynk.com', name: 'Rian Destianto', roleCodes: ['ROLE-DIRECTOR', 'ROLE-STAFF'], activeRoleCode: 'ROLE-DIRECTOR' },
  { username: 'melika', email: 'melika@arsalynk.com', name: 'Melika Citra Tania', roleCodes: ['ROLE-STAFF'], activeRoleCode: 'ROLE-STAFF' },
  { username: 'arof', email: 'arof@arsalynk.com', name: 'Ahmad Arof Fuddin', roleCodes: ['ROLE-PM', 'ROLE-FINANCE', 'ROLE-STAFF'], activeRoleCode: 'ROLE-PM' },
  { username: 'jundy', email: 'jundy@arsalynk.com', name: 'Jundy Isham Izzudin', roleCodes: ['ROLE-STAFF'], activeRoleCode: 'ROLE-STAFF' },
  // Oman is the operational name in the task list. Keep the existing Noorman
  // login identity so production users are not unexpectedly renamed.
  { username: 'noorman', email: 'noorman@arsalynk.com', name: 'M Noorman Perdana', roleCodes: ['ROLE-STAFF'], activeRoleCode: 'ROLE-STAFF' },
  { username: 'ilyas', email: 'ilyas@arsalynk.com', name: 'Ilyas', roleCodes: ['ROLE-STAFF'], activeRoleCode: 'ROLE-STAFF' },
];

export const projects: ProjectSpec[] = [
  {
    code: 'SMA-PRJ-001', name: 'Follow up SPG ANC Serang',
    description: 'Untuk konfirmasi ke penyedia SPG (Bang Alex) dan briefing SPG untuk event dengan segera.',
    manager: 'melika', members: ['melika'], start: '2026-09-22', deadline: '2026-09-22',
    mainTasks: [{
      title: 'SPG ANC Serang',
      description: 'Mendapatkan SPG yang sudah dipilih Ko Andrew dan meminta daftar username & jumlah followers ke penyedia.',
      pic: 'melika', assignees: ['melika'], start: '2026-09-22', due: '2026-09-22', status: 'IN_PROGRESS',
      weekly: [{
        title: 'SPG ANC Serang confirmed', assignee: 'melika', start: '2026-09-22', end: '2026-09-22',
        target: 'Sudah ada list SPG yang dipilih Ko Andrew.', status: 'IN_PROGRESS',
        daily: [{ title: 'SPG ANC Serang', owner: 'melika', date: '2026-09-22', result: 'List SPG confirmed sudah disetujui.', status: 'IN_PROGRESS' }],
      }],
    }],
  },
  {
    code: 'SMA-PRJ-002', name: 'Riset rumah makan, kemeja, dan tempat bordir ANC Serang',
    description: 'List rumah makan untuk konsumsi event ANC di Serang, kemeja dan bordir tim untuk event ANC Serang.',
    manager: 'melika', members: ['melika'], start: '2026-09-22', deadline: '2026-09-23',
    mainTasks: [{
      title: 'List rumah makan, tempat membeli kemeja, dan bordiran',
      description: 'Sudah ada list rumah makan fix, kemeja dan tempat bordiran menyusul.',
      pic: 'melika', assignees: ['melika'], start: '2026-09-22', due: '2026-09-23', status: 'IN_PROGRESS',
      weekly: [{
        title: 'List rumah makan, tempat membeli kemeja, dan bordiran', assignee: 'melika', start: '2026-09-22', end: '2026-09-23',
        target: 'Sudah ada fiksasi rumah makan dan vendor kemeja & bordir.', status: 'IN_PROGRESS',
        daily: [{ title: 'Riset rumah makan, kemeja, dan tempat bordir ANC Serang', owner: 'melika', date: '2026-09-23', result: 'List rumah makan dan vendor kemeja & bordiran fix.', status: 'IN_PROGRESS' }],
      }],
    }],
  },
  {
    code: 'SMA-PRJ-003', name: 'Kajian Kelayakan GIK',
    description: 'Menilai kelayakan Gedung Industri Kreatif di Kota Lama Semarang sebagai destinasi wisata belanja oleh-oleh khas Semarang yang legal, sesuai aturan cagar budaya, dan memberi manfaat bagi IKM/UMKM serta PAD.',
    manager: 'melika', members: ['melika', 'arof'], start: '2026-09-22', deadline: '2026-10-31',
    mainTasks: [{
      title: 'Checking instrumen survei tenant GIK',
      description: 'Menghasilkan instrumen survei tenant GIK yang terkurasi berdasarkan output yang ingin dicapai.',
      pic: 'melika', assignees: ['melika', 'arof'], start: '2026-09-22', due: '2026-09-25', status: 'IN_PROGRESS',
      weekly: [{
        title: 'Instrumen survei tenant GIK', assignee: 'melika', start: '2026-09-22', end: '2026-09-25',
        target: 'Lembar kuesioner sudah siap dieksekusi ke lapangan.', status: 'IN_PROGRESS',
        daily: [{ title: 'Checking instrumen survei tenant GIK', owner: 'melika', date: '2026-09-25', result: 'Kuesioner sudah terkurasi dan siap disebarkan ketika penelitian ke lapangan.', status: 'IN_PROGRESS' }],
      }],
    }],
  },
  {
    code: 'SMA-PRJ-004', name: 'Dokumentasi ANC 2026 (Axis Nation Cup)',
    description: 'Dokumentasi foto & video selama Axis Nation Cup, dikoordinasikan dengan tim eksekutor/shooting.',
    manager: 'noorman', members: ['noorman'], start: '2026-09-21', deadline: '2026-09-27',
    mainTasks: [{
      title: 'Koordinasi Dokumentasi ANC 2026',
      description: 'Memastikan seluruh dokumentasi foto & video ANC selesai dan diterima sesuai timeline dari eksekutor.',
      pic: 'noorman', assignees: ['noorman'], start: '2026-09-21', due: '2026-09-27', status: 'IN_PROGRESS',
      weekly: [{
        title: 'Koordinasi Dokumentasi Axis Nation Cup (ANC) 2026', assignee: 'noorman', start: '2026-09-21', end: '2026-09-27',
        target: 'Memastikan seluruh dokumentasi foto & video ANC selesai dan diterima 3–5 hari setelah shooting; follow up Rabu sore/Kamis pagi.', status: 'IN_PROGRESS',
        daily: [
          { title: 'Briefing pagi & cek Today Task tim', owner: 'noorman', date: '2026-09-21', result: '', status: 'COMPLETED' },
          { title: 'Follow up output foto & video ANC', owner: 'noorman', date: '2026-09-21', result: 'Follow up sudah dilakukan, estimasi output 3–5 hari setelah shooting (Rabu/Kamis).', status: 'COMPLETED', notes: 'Follow up lanjutan akan dilakukan Rabu sore atau Kamis pagi.' },
          { title: 'Finishing Deck Marimas', owner: 'noorman', date: '2026-09-21', result: 'Deck sudah terkirim, revisi minor full Bahasa Inggris sudah dimasukkan.', status: 'COMPLETED', notes: 'https://www.figma.com/design/k0EgJeipr6xTDnMNXsOHRw/Pitch-Deck-Proposal-s-' },
          { title: 'Boosting Social Media', owner: 'noorman', date: '2026-09-21', result: '4 postingan Craftivation terboosting.', status: 'COMPLETED' },
          { title: 'Upload Konten LinkedIn', owner: 'noorman', date: '2026-09-21', result: '3 konten Ilusia Studio terupload.', status: 'COMPLETED' },
          { title: 'Upload Berita Media', owner: 'noorman', date: '2026-09-21', result: '20 berita terupload.', status: 'COMPLETED' },
          { title: 'Update status task ke tim & susun Daily Report (briefing akhir)', owner: 'noorman', date: '2026-09-21', result: '', status: 'COMPLETED' },
          { title: 'Briefing pagi & cek Today Task tim', owner: 'noorman', date: '2026-09-22', result: 'Daftar Today Task tim sudah dikonfirmasi.', status: 'NOT_STARTED' },
          { title: 'Follow up Deck Marimas & katalog WhatsApp Business', owner: 'noorman', date: '2026-09-22', result: 'Kepastian update deck + kepastian setup lanjutan WhatsApp Business.', status: 'NOT_STARTED' },
          { title: 'Upload Konten LinkedIn', owner: 'noorman', date: '2026-09-22', result: '3 konten Seveny terupload.', status: 'NOT_STARTED' },
          { title: 'Upload Konten Berita', owner: 'noorman', date: '2026-09-22', result: '2 konten terupload ke social media berita.', status: 'NOT_STARTED' },
          { title: 'Boosting Social Media + Postingan', owner: 'noorman', date: '2026-09-22', result: 'Social media Craftivation terboosting beserta postingannya.', status: 'NOT_STARTED' },
          { title: 'Update status seluruh task ke tim', owner: 'noorman', date: '2026-09-22', result: '', status: 'NOT_STARTED' },
          { title: 'Susun Daily Report tim & rencana kerja besok (briefing akhir)', owner: 'noorman', date: '2026-09-22', result: 'Daily Report tim & rencana besok selesai dibuat.', status: 'NOT_STARTED' },
        ],
      }],
    }],
  },
  {
    code: 'SMA-PRJ-005', name: 'Marketing Content Creation',
    description: 'Memproduksi dan posting konten untuk berbagai akun Instagram Arsalynk.',
    manager: 'jundy', members: ['jundy', 'noorman', 'laode'], start: '2026-09-21', deadline: null,
    mainTasks: [{
      title: 'Content Creation', description: 'Memproduksi konten untuk beragam akun social media Arsalynk.',
      pic: 'jundy', assignees: ['jundy', 'noorman', 'laode'], start: '2026-09-21', due: null, status: 'PLANNED',
      weekly: [{
        title: 'Weekly Contents for Craftivation', assignee: 'jundy', start: '2026-09-21', end: '2026-09-25',
        target: '20–24 Carousel (2 static + 2 dynamic slides).', status: 'IN_PROGRESS',
        daily: [{ title: 'Create 4 Carousels for Craftivation', owner: 'jundy', date: '2026-09-22', result: '4 Carousel dipost dan diboost oleh mas Oman di hari yang sama.', status: 'COMPLETED' }],
      }],
    }],
  },
  {
    code: 'SMA-PRJ-006', name: 'Project ERP Marka',
    description: 'Project building ERP Marka sebagai produk IT dari Arsalynk.',
    manager: 'jundy', members: ['jundy', 'ilyas', 'laode', 'arof'], start: '2026-09-21', deadline: '2026-10-31',
    mainTasks: [{
      title: 'ERP Project Management', description: 'Mengelola dan memantau pengerjaan Project ERP Marka.',
      pic: 'jundy', assignees: ['jundy', 'ilyas', 'laode', 'arof'], start: '2026-09-21', due: '2026-10-31', status: 'PLANNED',
      weekly: [
        {
          title: 'Weekly ERP Management', assignee: 'jundy', start: '2026-09-21', end: '2026-09-25',
          target: 'Project ready 90% untuk diimplementasikan dengan minor bug & revisions.', status: 'IN_PROGRESS',
          daily: [{ title: 'Review and support for ERP Marka', owner: 'jundy', date: '2026-09-22', result: 'Memastikan kesiapan ERP untuk digunakan tim pada 23 September.', status: 'NOT_STARTED' }],
        },
        {
          title: 'PM & Finance Readiness ERP Marka', assignee: 'arof', start: '2026-09-21', end: '2026-09-25',
          target: 'Memastikan scope PM dan kebutuhan finansial implementasi ERP siap.', status: 'IN_PROGRESS',
          daily: [{ title: 'Review scope PM dan kebutuhan finansial ERP Marka', owner: 'arof', date: '2026-09-22', result: 'Catatan kesiapan PM dan Finance ERP tersedia.', status: 'IN_PROGRESS' }],
        },
        {
          title: 'Administrasi Implementasi ERP Marka', assignee: 'laode', start: '2026-09-21', end: '2026-09-25',
          target: 'Akses user dan administrasi implementasi siap.', status: 'IN_PROGRESS',
          daily: [{ title: 'Validasi user dan akses implementasi ERP Marka', owner: 'laode', date: '2026-09-22', result: 'Daftar user dan akses tervalidasi.', status: 'IN_PROGRESS' }],
        },
        {
          title: 'Development ERP Marka', assignee: 'laode', start: '2026-09-21', end: '2026-09-25',
          target: 'Perbaikan prioritas implementasi terselesaikan.', status: 'IN_PROGRESS',
          daily: [{ title: 'Implementasi dan perbaikan prioritas ERP Marka', owner: 'laode', date: '2026-09-22', result: 'Perbaikan prioritas siap direview.', status: 'IN_PROGRESS' }],
        },
        {
          title: 'Development Supervision ERP Marka', assignee: 'ilyas', start: '2026-09-21', end: '2026-09-25',
          target: 'Hasil development tervalidasi sebelum implementasi.', status: 'IN_PROGRESS',
          daily: [{ title: 'Supervisi hasil development ERP Marka', owner: 'ilyas', date: '2026-09-22', result: 'Catatan supervisi dan tindak lanjut tersedia.', status: 'IN_PROGRESS' }],
        },
      ],
    }],
  },
  {
    code: 'SMA-PRJ-007', name: 'Project ANC x Gamefinity',
    description: 'Menyiapkan desain dan menjadi PIC untuk Gamefinity selama project berlangsung.',
    manager: 'rian', members: ['rian', 'arof', 'jundy', 'noorman', 'melika', 'laode'], start: '2026-09-21', deadline: '2026-10-31',
    mainTasks: [{
      title: 'Project ANC x Gamefinity', description: 'Mengelola dan memantau pengerjaan Project ANC x Gamefinity.',
      pic: 'jundy', assignees: ['rian', 'arof', 'jundy', 'noorman', 'melika', 'laode'], start: '2026-09-21', due: '2026-10-31', status: 'PLANNED',
      weekly: [{
        title: 'Second & Grand Final Venue Preparation', assignee: 'jundy', start: '2026-09-21', end: '2026-09-25',
        target: 'Memastikan dan menyiapkan kebutuhan desain booth final serta kesiapan operasional di second venue.', status: 'IN_PROGRESS',
        daily: [
          { title: 'Daily Communication with Ko Andrew', owner: 'jundy', date: '2026-09-22', result: 'Memastikan informasi penting untuk second venue dan persiapan grand final.', status: 'IN_PROGRESS' },
          { title: 'Desain & Produksi Grand Final Booth', owner: 'jundy', date: '2026-09-22', result: 'Meeting dengan Mang Endy terkait teknis produksi booth Grand Final.', status: 'NOT_STARTED' },
        ],
      }, {
        title: 'Project Lead Coordination ANC x Gamefinity', assignee: 'rian', start: '2026-09-21', end: '2026-09-25',
        target: 'Koordinasi project lead dan keputusan lintas fungsi terdokumentasi.', status: 'IN_PROGRESS',
        daily: [{ title: 'Koordinasi project lead ANC x Gamefinity', owner: 'rian', date: '2026-09-22', result: 'Keputusan dan tindak lanjut lintas fungsi terdokumentasi.', status: 'IN_PROGRESS' }],
      }],
    }],
  },
];

async function seedDatabase(db: Prisma.TransactionClient) {
  console.log('Resetting database to the PT Sinergi Muda Arsa production baseline...');
  await resetApplicationData(db);

  const tenant = await db.core_tenant.create({
    data: { id: '00000000-0000-0000-0000-000000000001', code: 'SINERGI_MUDA_ARSA', name: 'PT Sinergi Muda Arsa', status: 'ACTIVE' },
  });
  const company = await db.core_company.create({
    data: {
      id: '10000000-0000-0000-0000-000000000001', tenant_id: tenant.id, company_code: 'SMA',
      legal_name: 'PT Sinergi Muda Arsa', business_category: 'Creative, Technology & Event Services',
      tax_number: '03.881.992.1-512.000', fiscal_year_start: d('2026-01-01'), status: 'ACTIVE',
    },
  });
  const organization = await db.core_organization.create({
    data: {
      id: '00000000-0000-0000-0000-000000000100', tenant_id: tenant.id, company_id: company.id,
      organization_code: 'ORG-HQ', organization_name: 'Kantor Pusat PT Sinergi Muda Arsa', organization_type: 'DIVISION', status: 'ACTIVE',
    },
  });

  const roleMap = new Map<string, { id: string }>();
  for (const [code, name, description] of roles) {
    const roleCode = parseRoleCode(code);
    if (!roleCode) throw new Error(`Role code tidak dikenal: ${code}`);
    const role = await db.iam_role.create({
      data: { id: crypto.randomUUID(), tenant_id: tenant.id, company_id: null, role_code: roleCode, role_name: name, description, is_system: true },
    });
    roleMap.set(code, role);
  }

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  const userMap = new Map<string, { id: string; full_name: string }>();
  for (const seedUser of users) {
    const activeRole = roleMap.get(seedUser.activeRoleCode);
    if (!activeRole) throw new Error(`Active role ${seedUser.activeRoleCode} tidak tersedia.`);
    const user = await db.iam_user.create({
      data: {
        id: crypto.randomUUID(), tenant_id: tenant.id, username: seedUser.username, email: seedUser.email,
        password_hash: passwordHash, full_name: seedUser.name, status: 'ACTIVE', is_staff: Boolean(seedUser.global),
        is_superuser: Boolean(seedUser.global), is_active: true, date_joined: new Date(), active_role_id: activeRole.id,
      },
    });
    userMap.set(seedUser.username, user);

    // STAFF is the non-selectable baseline capability of every company user.
    // Functional roles remain selectable additions and never replace it.
    const assignedRoleCodes = seedUser.global
      ? seedUser.roleCodes
      : [...new Set([...seedUser.roleCodes, 'ROLE-STAFF'])];
    for (const roleCode of assignedRoleCodes) {
      const role = roleMap.get(roleCode);
      if (!role) throw new Error(`Role ${roleCode} tidak tersedia untuk ${seedUser.username}.`);
      await db.iam_user_role.create({
        data: {
          id: crypto.randomUUID(), tenant_id: tenant.id, company_id: seedUser.global ? null : company.id,
          organization_id: seedUser.global ? null : organization.id, user_id: user.id, role_id: role.id,
        },
      });
    }

    if (!seedUser.global) {
      await db.iam_user_company_membership.create({
        data: { id: crypto.randomUUID(), tenant_id: tenant.id, company_id: company.id, user_id: user.id, status: 'ACTIVE' },
      });
      await db.master_employee.create({
        data: {
          id: crypto.randomUUID(), tenant_id: tenant.id, company_id: company.id, user_id: user.id,
          employee_number: `SMA-${seedUser.username.toUpperCase()}`, employment_status: 'ACTIVE',
        },
      });
    }
  }

  const enabledModules = new Set(['CORE', 'PROJECTS', 'FINANCE', 'REPORTING']);
  const allModules = ['CORE', 'REQUESTS', 'CRM', 'SALES', 'PROJECTS', 'FINANCE', 'PROCUREMENT', 'INVENTORY', 'MANUFACTURING', 'QUALITY', 'ASSETS', 'SERVICE', 'LOGISTICS', 'ANALYTICS', 'IMPLEMENTATION', 'REPORTING', 'MARBOT'];
  for (const moduleCode of allModules) {
    const enabled = enabledModules.has(moduleCode);
    await db.iam_company_module_access.create({
      data: {
        id: crypto.randomUUID(), tenant_id: tenant.id, company_id: company.id, module_code: moduleCode,
        enabled, allow_read: enabled, allow_write: enabled, source: 'PRODUCTION_SEED',
      },
    });
  }

  for (const projectSpec of projects) {
    const manager = userMap.get(projectSpec.manager);
    if (!manager) throw new Error(`Project manager ${projectSpec.manager} tidak ditemukan.`);
    const weeklyProgresses = projectSpec.mainTasks.flatMap((mainTask) => mainTask.weekly.map((weekly) =>
      average(weekly.daily.map((daily) => dailyProgress(daily.status))),
    ));
    const project = await db.project_project.create({
      data: {
        id: crypto.randomUUID(), tenant_id: tenant.id, company_id: company.id,
        project_manager_id: manager.id, project_code: projectSpec.code, project_name: projectSpec.name,
        customer_name: 'Internal PT Sinergi Muda Arsa', manager_name: manager.full_name,
        description: projectSpec.description, planned_start_date: d(projectSpec.start), planned_end_date: d(projectSpec.deadline),
        progress_percent: average(weeklyProgresses), status: 'ACTIVE', lifecycle_status: 'STARTED',
        health_status: 'NORMAL', source_type: 'MANUAL', started_at: d(projectSpec.start), created_by_id: manager.id,
      },
    });

    // PROJECT_MANAGER is descriptive membership only. No
    // ACTING_PROJECT_MANAGER is created, so the supervisor slot stays empty.
    for (const username of [...new Set([projectSpec.manager, ...projectSpec.members])]) {
      const member = userMap.get(username);
      if (!member) throw new Error(`Project member ${username} tidak ditemukan.`);
      await db.project_member.create({
        data: {
          id: crypto.randomUUID(), tenant_id: tenant.id, company_id: company.id, project_id: project.id,
          user_id: member.id, project_role: username === projectSpec.manager ? 'PROJECT_MANAGER' : 'MEMBER',
          status: 'ACTIVE', permissions_json: {}, assigned_at: new Date(), joined_at: new Date(), created_by_id: manager.id,
        },
      });
    }

    for (const mainSpec of projectSpec.mainTasks) {
      const mainProgress = average(mainSpec.weekly.map((weekly) => average(weekly.daily.map((daily) => dailyProgress(daily.status)))));
      const main = await db.project_main_task.create({
        data: {
          id: crypto.randomUUID(), tenant_id: tenant.id, company_id: company.id, project_id: project.id,
          name: mainSpec.title, description: mainSpec.description, priority: 'HIGH', start_date: d(mainSpec.start), due_date: d(mainSpec.due),
          weight: 100, progress: mainProgress, status: mainSpec.status, is_progress_overridden: false,
          override_reason: '', created_by_id: userMap.get(mainSpec.pic)?.id ?? manager.id, created_at: new Date(), updated_at: new Date(),
        },
      });

      for (const username of [...new Set(mainSpec.assignees)]) {
        const assignee = userMap.get(username);
        if (!assignee) throw new Error(`Main Task assignee ${username} tidak ditemukan.`);
        await db.project_task_assignment.create({
          data: {
            id: crypto.randomUUID(), tenant_id: tenant.id, company_id: company.id, main_task_id: main.id,
            assignee_id: assignee.id, assigned_by_id: manager.id, assigned_at: new Date(), created_by_id: manager.id,
          },
        });
      }

      for (let weeklyIndex = 0; weeklyIndex < mainSpec.weekly.length; weeklyIndex += 1) {
        const weeklySpec = mainSpec.weekly[weeklyIndex];
        const assignee = userMap.get(weeklySpec.assignee);
        if (!assignee) throw new Error(`Weekly Task assignee ${weeklySpec.assignee} tidak ditemukan.`);
        const progress = average(weeklySpec.daily.map((daily) => dailyProgress(daily.status)));
        const weekly = await db.project_weekly_task.create({
          data: {
            id: crypto.randomUUID(), tenant_id: tenant.id, company_id: company.id, main_task_id: main.id,
            assignee_id: assignee.id, week_number: weeklyIndex + 1, start_date: d(weeklySpec.start), end_date: d(weeklySpec.end),
            target_description: `${weeklySpec.title} — ${weeklySpec.target}`, progress, status: weeklySpec.status,
            is_progress_overridden: false, override_reason: '', created_by_id: manager.id, created_at: new Date(), updated_at: new Date(),
          },
        });

        for (const dailySpec of weeklySpec.daily) {
          const owner = userMap.get(dailySpec.owner);
          if (!owner) throw new Error(`Daily Task owner ${dailySpec.owner} tidak ditemukan.`);
          await db.project_daily_task.create({
            data: {
              id: crypto.randomUUID(), tenant_id: tenant.id, company_id: company.id, weekly_task_id: weekly.id,
              owner_id: owner.id, title: dailySpec.title, description: weeklySpec.target, planned_date: d(dailySpec.date),
              time_slot: '09.00 - 17.00', output_result: dailySpec.result, notes: dailySpec.notes ?? '',
              progress: dailyProgress(dailySpec.status), status: dailySpec.status, is_blocked: false, block_reason: '',
              created_by_id: owner.id, created_at: new Date(), updated_at: new Date(),
            },
          });
        }
      }
    }
  }

  const counts = {
    tenants: await db.core_tenant.count(),
    companies: await db.core_company.count(),
    users: await db.iam_user.count(),
    projects: await db.project_project.count(),
    mainTasks: await db.project_main_task.count(),
    weeklyTasks: await db.project_weekly_task.count(),
    dailyTasks: await db.project_daily_task.count(),
    projectSupervisors: await db.project_member.count({ where: { project_role: 'ACTING_PROJECT_MANAGER', status: 'ACTIVE' } }),
    crmOpportunities: await db.crm_opportunity.count(),
    financeEntries: await db.fin_journal_entry.count(),
  };
  return { status: 'SEEDED', tenant: tenant.code, company: company.company_code, counts };
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PRODUCTION_SEED_RESET !== PRODUCTION_CONFIRMATION) {
    throw new Error(`Production seed dibatalkan. Set ALLOW_PRODUCTION_SEED_RESET=${PRODUCTION_CONFIRMATION} untuk reset eksplisit.`);
  }
  if (process.env.NODE_ENV === 'production' && !process.env.SEED_DEFAULT_PASSWORD) {
    throw new Error('SEED_DEFAULT_PASSWORD wajib diisi untuk seed production dan tidak boleh memakai password default lokal.');
  }
  const result = await prisma.$transaction((db) => seedDatabase(db), { maxWait: 30_000, timeout: 120_000 });
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error('Production seed failed:', error);
      process.exitCode = 1;
    })
    .finally(async () => prisma.$disconnect());
}
