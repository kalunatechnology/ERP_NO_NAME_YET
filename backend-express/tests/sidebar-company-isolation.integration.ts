/**
 * Regression test for sidebar company isolation and role serialization.
 *
 * This read-only integration test calls the real service against the configured
 * database. It proves that every returned contact belongs to the caller's one
 * active company and that identities from the Ghost demo company never leak.
 */
import assert from 'node:assert/strict';
import prisma from '../src/config/database';
import { CoreService } from '../src/modules/core/core.service';

/** Executes the company-bound contact assertions for Melika's real membership. */
async function testSidebarCompanyIsolation(): Promise<void> {
  const melika = await prisma.iam_user.findUnique({
    where: { email: 'melika@arsalynk.com' },
    select: { id: true },
  });
  assert(melika, 'Melika fixture must exist');

  const membership = await prisma.iam_user_company_membership.findUnique({
    where: { user_id: melika.id },
  });
  assert(membership, 'Melika must have one company membership');

  const feed = await CoreService.getSidebarFeed(melika.id, membership.company_id);
  const contactIds = feed.contacts.map((contact) => contact.id);
  const scopedMemberships = contactIds.length > 0
    ? await prisma.iam_user_company_membership.findMany({
        where: { user_id: { in: contactIds } },
        select: { user_id: true, company_id: true },
      })
    : [];

  assert.equal(scopedMemberships.length, contactIds.length, 'Every contact must have a membership');
  assert(scopedMemberships.every((item) => item.company_id === membership.company_id), 'A cross-company contact leaked into the feed');
  assert(feed.contacts.every((contact) => !contact.email.endsWith('@arsalynk.id')), 'Ghost-company contact leaked into the SMA feed');
  assert(feed.contacts.every((contact) => Boolean(contact.role_code)), 'Every contact must expose its actual active role');

  console.log(JSON.stringify({
    status: 'PASS',
    company_id: membership.company_id,
    contact_count: feed.contacts.length,
    cross_company_contacts: 0,
    contacts: feed.contacts.map((contact) => ({ email: contact.email, role: contact.role_code })),
  }, null, 2));
}

testSidebarCompanyIsolation()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
