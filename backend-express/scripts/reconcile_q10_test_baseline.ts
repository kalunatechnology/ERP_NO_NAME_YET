/**
 * Reconciles the minimal Q10 Ghost-company entitlement baseline.
 *
 * The canonical seed declares CRM as an enabled demo module for PT Coba
 * Arsalynk. This script repairs only that entitlement and does not alter roles,
 * users, company membership, operational data, or unrelated modules.
 */
import crypto from 'node:crypto';
import prisma from '../src/config/database';

/** Ensures the Ghost demo company can exercise its designated CRM persona. */
async function main(): Promise<void> {
  const crmUser = await prisma.iam_user.findUnique({ where: { email: 'crm.lead@arsalynk.id' }, select: { id: true } });
  if (!crmUser) throw new Error('Canonical Ghost CRM Lead was not found.');
  const membership = await prisma.iam_user_company_membership.findUnique({
    where: { user_id: crmUser.id },
    select: { company_id: true, tenant_id: true },
  });
  if (!membership) throw new Error('Ghost CRM Lead has no one-company membership.');
  const company = await prisma.core_company.findUnique({
    where: { id: membership.company_id },
    select: { id: true, tenant_id: true, company_code: true },
  });
  if (!company) throw new Error('Company assigned to Ghost CRM Lead was not found.');
  if (!company.tenant_id || company.tenant_id !== membership.tenant_id) {
    throw new Error('Ghost CRM Lead company/tenant ownership is inconsistent.');
  }

  const before = await prisma.iam_company_module_access.findUnique({
    where: { company_id_module_code: { company_id: company.id, module_code: 'CRM' } },
  });
  const personalBefore = await prisma.iam_user_module_access.findUnique({
    where: { user_id_module_code: { user_id: crmUser.id, module_code: 'CRM' } },
  });
  const access = await prisma.iam_company_module_access.upsert({
    where: { company_id_module_code: { company_id: company.id, module_code: 'CRM' } },
    update: { enabled: true, allow_read: true, allow_write: true, source: 'Q10_CANONICAL_DEMO_BASELINE' },
    create: {
      id: crypto.randomUUID(),
      tenant_id: company.tenant_id,
      company_id: company.id,
      module_code: 'CRM',
      enabled: true,
      allow_read: true,
      allow_write: true,
      source: 'Q10_CANONICAL_DEMO_BASELINE',
    },
  });

  console.log(JSON.stringify({
    status: 'PASS',
    company_code: company.company_code,
    company_id: company.id,
    module: 'CRM',
    previous: before ? { enabled: before.enabled, allow_read: before.allow_read, allow_write: before.allow_write } : null,
    current: { enabled: access.enabled, allow_read: access.allow_read, allow_write: access.allow_write },
    personal_override: personalBefore ? {
      company_matches: personalBefore.company_id === company.id,
      tenant_matches: personalBefore.tenant_id === company.tenant_id,
      allow_read: personalBefore.allow_read,
      allow_write: personalBefore.allow_write,
    } : null,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
