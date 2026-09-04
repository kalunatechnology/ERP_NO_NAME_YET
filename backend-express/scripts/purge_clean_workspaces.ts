/**
 * File: backend-express/scripts/purge_clean_workspaces.ts
 *
 * Purpose: Implements database administration script responsibilities for the platform domain.
 * Responsibility: Defines the executable contracts in this file and connects them to their callers without owning unrelated domain behavior.
 * Integration: Used through static imports, Express/Next framework discovery, or an explicit npm/script entry point as applicable.
 * Dependencies and side effects: See each documented function; database, browser storage, network, and response mutations are called out where present.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * main executes one step of this explicit database administration script.
 *
 * Database operations: Reads or mutates Prisma model(s) `core_tenant`, `core_company`, `core_notification_recipient`, `core_notification`, `analytics_alert_event`, `core_audit_event`, `iam_user`.
 * Operational contract: It runs only when this script is invoked; it is not part of the normal HTTP request lifecycle.
 * Failure behavior: Rejects/throws to the script entry point so the process can report failure and perform its configured cleanup/disconnect.
 */
async function main() {
  console.log('=== STARTING TARGETED DATABASE PURGE & CLEANUP ===\n');

  // 1. Resolve Tenants and Companies
  const tenantSMA = await prisma.core_tenant.findFirst({ where: { code: 'SINERGI_MUDA_ARSA' } });
  const compSMA = await prisma.core_company.findFirst({ where: { company_code: 'SMA' } });

  const tenantGhost = await prisma.core_tenant.findFirst({ where: { code: 'GHOST_TENANT' } });
  const compGhost = await prisma.core_company.findFirst({ where: { company_code: 'GHOST-ARSALYNK' } });

  console.log(`[TENANTS] SMA: ${tenantSMA?.id ?? 'Not found'} | Ghost: ${tenantGhost?.id ?? 'Not found'}`);
  console.log(`[COMPANIES] SMA: ${compSMA?.id ?? 'Not found'} | Ghost: ${compGhost?.id ?? 'Not found'}\n`);

  // =========================================================================
  // A. CLEAN GHOST COMPANY (Fresh state, zero alerts/notifications, KEEP 10 USERS)
  // =========================================================================
  console.log('--- [A] Cleaning Ghost Company (PT Coba Arsalynk) ---');

  // 1. Purge Notifications & Alerts
  const delNotifRec = await prisma.core_notification_recipient.deleteMany({});
  const delNotif = await prisma.core_notification.deleteMany({});
  const delAlerts = await prisma.analytics_alert_event.deleteMany({});
  const delAudit = await prisma.core_audit_event.deleteMany({});
  console.log(`  -> Cleared Notifications (${delNotif.count}), Recipients (${delNotifRec.count}), Alerts (${delAlerts.count}), Audit Events (${delAudit.count})`);

  // 2. Ensure the 10 Ghost Users are Active & Clean
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
  ];

  if (tenantGhost && compGhost) {
    const updatedGhostUsers = await prisma.iam_user.updateMany({
      where: { email: { in: ghostEmails } },
      data: {
        tenant_id: tenantGhost.id,
        is_active: true,
        status: 'ACTIVE',
      },
    });
    console.log(`  -> Verified & preserved ${updatedGhostUsers.count} Ghost Login Accounts`);
  }

  // =========================================================================
  // B. CLEAN PT SINERGI MUDA ARSA (SMA: 8 Official Users & 3 Real Projects ONLY)
  // =========================================================================
  console.log('\n--- [B] Cleaning PT Sinergi Muda Arsa (SMA) ---');

  const officialSMAEmails = [
    'rian@arsalynk.com',
    'melika@arsalynk.com',
    'melika.ops@arsalynk.com',
    'arof@arsalynk.com',
    'arof.finance@arsalynk.com',
    'laode@arsalynk.com',
    'jundy@arsalynk.com',
    'noorman@arsalynk.com',
  ];

  if (tenantSMA && compSMA) {
    // 1. Lock and preserve the 8 Official SMA Users
    const updatedSMAUsers = await prisma.iam_user.updateMany({
      where: { email: { in: officialSMAEmails } },
      data: {
        tenant_id: tenantSMA.id,
        is_active: true,
        status: 'ACTIVE',
      },
    });
    console.log(`  -> Verified & preserved ${updatedSMAUsers.count} Official SMA Team Accounts (@arsalynk.com)`);

    // 2. Keep strictly the 3 Real Projects for SMA
    const officialProjectCodes = [
      'PRJ-SMA-2026-001', // Pembuatan Buku Pedoman Perubahan Perilaku
      'PRJ-SMA-2026-002', // Kajian Kelayakan Pengembangan GIK
      'PRJ-SMA-2026-003', // Konten Edukasi Fisioterapi Padel
    ];

    // Delete non-official projects under SMA
    const delOtherProjects = await prisma.project_project.deleteMany({
      where: {
        company_id: compSMA.id,
        NOT: { project_code: { in: officialProjectCodes } },
      },
    });
    console.log(`  -> Removed non-official project records under SMA (${delOtherProjects.count} removed)`);

    // Ensure the 3 real projects are active and linked to SMA
    const verifiedProjects = await prisma.project_project.findMany({
      where: { project_code: { in: officialProjectCodes } },
      select: { project_code: true, project_name: true, customer_name: true, status: true },
    });

    console.log(`  -> Active Official Projects (${verifiedProjects.length}):`);
    verifiedProjects.forEach((p) => {
      console.log(`     * [${p.project_code}] ${p.project_name} (Klien: ${p.customer_name}) [Status: ${p.status}]`);
    });
  }

  console.log('\n=== TARGETED DATABASE CLEANUP COMPLETED SUCCESSFULLY ===');
}

/**
 * main executes one step of this explicit database administration script.
 *
 * Database operations: Uses the database/client operations visible in the implementation.
 * Operational contract: It runs only when this script is invoked; it is not part of the normal HTTP request lifecycle.
 * Failure behavior: Rejects/throws to the script entry point so the process can report failure and perform its configured cleanup/disconnect.
 */
main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
