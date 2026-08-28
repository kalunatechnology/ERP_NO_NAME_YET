import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('=== MIGRATING & SEEDING PT SINERGI MUDA ARSA ===');

  // 1. Ensure Tenant & Primary Companies
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

  // Ensure active company PT Sinergi Muda Arsa (SMA)
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
        legal_name: 'PT Sinergi Muda Arsa',
        status: 'ACTIVE',
      },
    });
  }

  // Ensure active company PT Arsalynk Technology Indonesia (ARSALYNK)
  let companyArsalynk = await prisma.core_company.findFirst({ where: { company_code: 'ARSALYNK' } });
  if (!companyArsalynk) {
    companyArsalynk = await prisma.core_company.create({
      data: {
        id: '10000000-0000-0000-0000-000000000010',
        tenant_id: tenantSMA.id,
        company_code: 'ARSALYNK',
        legal_name: 'PT Arsalynk Technology Indonesia',
        tax_number: '01.234.567.8-001.000',
        fiscal_year_start: new Date('2026-01-01'),
        status: 'ACTIVE',
      },
    });
  } else {
    companyArsalynk = await prisma.core_company.update({
      where: { id: companyArsalynk.id },
      data: {
        legal_name: 'PT Arsalynk Technology Indonesia',
        status: 'ACTIVE',
      },
    });
  }

  // Ensure Organization HQ for SMA
  let orgSMA = await prisma.core_organization.findFirst({
    where: { organization_code: 'ORG-SMA-HQ' },
  });
  if (!orgSMA) {
    orgSMA = await prisma.core_organization.create({
      data: {
        id: crypto.randomUUID(),
        tenant_id: tenantSMA.id,
        company_id: companySMA.id,
        organization_code: 'ORG-SMA-HQ',
        organization_name: 'Kantor Pusat PT Sinergi Muda Arsa',
        organization_type: 'DIVISION',
        status: 'ACTIVE',
      },
    });
  }

  // 2. Link all team users to PT Sinergi Muda Arsa
  const teamEmails = [
    'rian@arsalynk.com',
    'melika@arsalynk.com',
    'melika.ops@arsalynk.com',
    'arof@arsalynk.com',
    'arof.finance@arsalynk.com',
    'laode@arsalynk.com',
    'jundy@arsalynk.com',
    'noorman@arsalynk.com',
  ];

  const teamUsers = await prisma.iam_user.findMany({
    where: { email: { in: teamEmails } },
  });

  for (const u of teamUsers) {
    await prisma.iam_user.update({
      where: { id: u.id },
      data: { tenant_id: tenantSMA.id, status: 'ACTIVE', is_active: true },
    });
    await prisma.iam_user_role.updateMany({
      where: { user_id: u.id },
      data: {
        company_id: companySMA.id,
        organization_id: orgSMA.id,
      },
    });
  }

  // Ensure all projects are ACTIVE and visible
  await prisma.project_project.updateMany({
    data: {
      status: 'STARTED',
      lifecycle_status: 'STARTED',
    },
  });

  // Fetch PM and Field Assignees
  const melika = teamUsers.find((u) => u.email === 'melika@arsalynk.com') ?? teamUsers[0];
  const arof = teamUsers.find((u) => u.email === 'arof@arsalynk.com') ?? teamUsers[0];
  const laode = teamUsers.find((u) => u.email === 'laode@arsalynk.com') ?? teamUsers[0];
  const jundy = teamUsers.find((u) => u.email === 'jundy@arsalynk.com') ?? teamUsers[0];
  const noorman = teamUsers.find((u) => u.email === 'noorman@arsalynk.com') ?? teamUsers[0];

  // 4. Create the 3 Official Real Projects for PT Sinergi Muda Arsa
  const projectsData = [
    {
      code: 'PRJ-SMA-2026-001',
      name: 'Pembuatan Buku Pedoman Perubahan Perilaku',
      customer: 'Dinas Dalduk / Disdalduk',
      desc: 'Pelaksanaan Pendampingan Keluarga dalam Upaya Percepatan Penurunan Risiko Stunting di Tingkat Kelurahan',
      pm: melika,
      contract: 185000000,
      budget: 140000000,
      progress: 45,
      tasks: [
        {
          title: 'Tahap 1: Pengumpulan Data Lapangan & Kajian Stunting Kelurahan',
          desc: 'Survei dan wawancara kader pendamping keluarga di wilayah sasaran',
          assignee: laode,
          weight: 30,
          progress: 100,
          status: 'COMPLETED',
          daily: [
            { title: 'Konsolidasi data demografi stunting dengan Disdalduk', assignee: laode, progress: 100, status: 'DONE' },
            { title: 'Wawancara mendalam dengan tim TPK Kelurahan', assignee: jundy, progress: 100, status: 'DONE' },
          ],
        },
        {
          title: 'Tahap 2: Penyusunan Naskah & Modul Perubahan Perilaku',
          desc: 'Drafting pedoman pendampingan gizi, sanitasi, dan pola asuh keluarga',
          assignee: noorman,
          weight: 40,
          progress: 50,
          status: 'IN_PROGRESS',
          daily: [
            { title: 'Penyusunan Bab 1-3 Kerangka Intervensi Perilaku', assignee: noorman, progress: 80, status: 'IN_PROGRESS' },
            { title: 'Review materi bersama tim ahli gizi dan psikolog', assignee: melika, progress: 30, status: 'IN_PROGRESS' },
          ],
        },
        {
          title: 'Tahap 3: Finalisasi Layout, Desain Grafis & Uji Coba Buku',
          desc: 'Illustrasi visual, layouting panduan praktis, dan validasi dinas',
          assignee: jundy,
          weight: 30,
          progress: 0,
          status: 'PLANNED',
          daily: [
            { title: 'Layouting infografis panduan kader', assignee: jundy, progress: 0, status: 'PLANNED' },
            { title: 'FGD Validasi Naskah bersama Disdalduk', assignee: melika, progress: 0, status: 'PLANNED' },
          ],
        },
      ],
    },
    {
      code: 'PRJ-SMA-2026-002',
      name: 'Kajian Kelayakan Pengembangan GIK',
      customer: 'BRIDA Kota Semarang',
      desc: 'Pengembangan GIK sebagai Destinasi Wisata Belanja Oleh-oleh Khas Semarang',
      pm: arof,
      contract: 240000000,
      budget: 180000000,
      progress: 35,
      tasks: [
        {
          title: 'Tahap 1: Studi Literatur & Regulasi Kawasan GIK Semarang',
          desc: 'Analisis kebijakan tata ruang dan potensi pariwisata Kota Semarang',
          assignee: arof,
          weight: 25,
          progress: 100,
          status: 'COMPLETED',
          daily: [
            { title: 'Pengumpulan data profil UMKM dan oleh-oleh Semarang', assignee: laode, progress: 100, status: 'DONE' },
            { title: 'Telaah dokumen RTRW dan masterplan kawasan GIK', assignee: arof, progress: 100, status: 'DONE' },
          ],
        },
        {
          title: 'Tahap 2: Survei Pasar, Kelayakan Finansial & Teknis',
          desc: 'Analisis proyeksi pendapatan, NPV, IRR, dan daya tampung tenant GIK',
          assignee: noorman,
          weight: 45,
          progress: 30,
          status: 'IN_PROGRESS',
          daily: [
            { title: 'Penyebaran kuesioner preferensi wisatawan', assignee: jundy, progress: 60, status: 'IN_PROGRESS' },
            { title: 'Pemodelan kelayakan investasi dan payback period', assignee: arof, progress: 20, status: 'IN_PROGRESS' },
          ],
        },
        {
          title: 'Tahap 3: Penyusunan Dokumen Akhir & Rekomendasi BRIDA',
          desc: 'Penyusunan laporan kelayakan komprehensif untuk Pemkot Semarang',
          assignee: laode,
          weight: 30,
          progress: 0,
          status: 'PLANNED',
          daily: [
            { title: 'Penyusunan draf rekomendasi skema pengelolaan GIK', assignee: laode, progress: 0, status: 'PLANNED' },
            { title: 'Presentasi laporan akhir di hadapan pimpinan BRIDA', assignee: arof, progress: 0, status: 'PLANNED' },
          ],
        },
      ],
    },
    {
      code: 'PRJ-SMA-2026-003',
      name: 'Konten Edukasi Fisioterapi Padel',
      customer: 'Goodphysio ID x PBPI Jaten',
      desc: 'Konten Edukasi Fisioterapi untuk Padel',
      pm: melika,
      contract: 85000000,
      budget: 60000000,
      progress: 60,
      tasks: [
        {
          title: 'Tahap 1: Riset Cedera Padel & Scriptwriting Video Edukasi',
          desc: 'Analisis biomekanik gerakan padel dan penanganan cedera umum (epicondylitis, ankle)',
          assignee: jundy,
          weight: 30,
          progress: 100,
          status: 'COMPLETED',
          daily: [
            { title: 'Penyusunan 10 topik video pencegahan cedera padel', assignee: jundy, progress: 100, status: 'DONE' },
            { title: 'Review script bersama fisioterapis Goodphysio ID', assignee: melika, progress: 100, status: 'DONE' },
          ],
        },
        {
          title: 'Tahap 2: Shooting Video Lapangan di PBPI Jaten',
          desc: 'Pengambilan gambar demonstrasi gerakan latihan preventif dan teknik recovery',
          assignee: laode,
          weight: 40,
          progress: 75,
          status: 'IN_PROGRESS',
          daily: [
            { title: 'Shooting batch 1: Pemanasan dinamis dan penguatan bahu', assignee: laode, progress: 100, status: 'DONE' },
            { title: 'Shooting batch 2: Teknik pemulihan pasca-pertandingan', assignee: noorman, progress: 50, status: 'IN_PROGRESS' },
          ],
        },
        {
          title: 'Tahap 3: Post-Production, Animasi Grafis & Publikasi Sosial Media',
          desc: 'Editing video reels/shorts, motion graphic anatomi otot, dan serah terima aset',
          assignee: noorman,
          weight: 30,
          progress: 15,
          status: 'IN_PROGRESS',
          daily: [
            { title: 'Editing reels series episode 1-5', assignee: noorman, progress: 30, status: 'IN_PROGRESS' },
            { title: 'Pemberian caption edukatif dan logo PBPI Jaten', assignee: jundy, progress: 0, status: 'PLANNED' },
          ],
        },
      ],
    },
  ];

  for (const pd of projectsData) {
    let proj = await prisma.project_project.findFirst({
      where: { project_code: pd.code },
    });

    if (!proj) {
      proj = await prisma.project_project.create({
        data: {
          id: crypto.randomUUID(),
          tenant_id: tenantSMA.id,
          company_id: companySMA.id,
          project_code: pd.code,
          project_name: pd.name,
          customer_name: pd.customer,
          description: pd.desc,
          project_manager_id: pd.pm.id,
          manager_name: pd.pm.full_name,
          contract_amount: pd.contract,
          budget_amount: pd.budget,
          progress_percent: pd.progress,
          target_margin_percent: 25,
          source_type: 'INTERNAL',
          status: 'STARTED',
          lifecycle_status: 'STARTED',
          health_status: 'HEALTHY',
          planned_start_date: new Date('2026-08-01'),
          planned_end_date: new Date('2026-11-30'),
        },
      });
      console.log(`Created Project: [${pd.code}] ${pd.name}`);
    } else {
      proj = await prisma.project_project.update({
        where: { id: proj.id },
        data: {
          company_id: companySMA.id,
          project_name: pd.name,
          customer_name: pd.customer,
          description: pd.desc,
          project_manager_id: pd.pm.id,
          manager_name: pd.pm.full_name,
          contract_amount: pd.contract,
          budget_amount: pd.budget,
          progress_percent: pd.progress,
          status: 'STARTED',
          lifecycle_status: 'STARTED',
        },
      });
      console.log(`Updated Project: [${pd.code}] ${pd.name}`);
    }

    // Populate Tasks WBS
    for (const mt of pd.tasks) {
      let mainTask = await prisma.project_main_task.findFirst({
        where: { project_id: proj.id, name: mt.title },
      });

      if (!mainTask) {
        mainTask = await prisma.project_main_task.create({
          data: {
            id: crypto.randomUUID(),
            project_id: proj.id,
            name: mt.title,
            description: mt.desc,
            priority: 'HIGH',
            weight: mt.weight,
            progress: mt.progress,
            status: mt.status,
            is_progress_overridden: false,
            override_reason: '',
            created_at: new Date(),
            updated_at: new Date(),
          },
        });

        // Assign member to main task
        await prisma.project_task_assignment.create({
          data: {
            id: crypto.randomUUID(),
            main_task_id: mainTask.id,
            assignee_id: mt.assignee.id,
            assigned_at: new Date(),
          },
        });

        // Create Weekly Task
        const weeklyTask = await prisma.project_weekly_task.create({
          data: {
            id: crypto.randomUUID(),
            main_task_id: mainTask.id,
            assignee_id: mt.assignee.id,
            week_number: 1,
            target_description: `Aktivitas Mingguan: ${mt.title}`,
            progress: mt.progress,
            status: mt.status,
            is_progress_overridden: false,
            override_reason: '',
            created_at: new Date(),
            updated_at: new Date(),
          },
        });

        // Create Daily Tasks
        for (const dt of mt.daily) {
          await prisma.project_daily_task.create({
            data: {
              id: crypto.randomUUID(),
              weekly_task_id: weeklyTask.id,
              owner_id: dt.assignee.id,
              title: dt.title,
              description: dt.title,
              time_slot: 'MORNING',
              output_result: dt.status === 'DONE' ? 'Selesai sesuai target kerja' : 'Sedang dikerjakan',
              notes: 'Progress dilaporkan via Marka+ Task Panel',
              progress: dt.progress,
              status: dt.status,
              is_blocked: false,
              block_reason: '',
              created_at: new Date(),
              updated_at: new Date(),
            },
          });
        }
      }
    }
  }

  console.log('=== PT SINERGI MUDA ARSA SEEDING COMPLETE! ===');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
