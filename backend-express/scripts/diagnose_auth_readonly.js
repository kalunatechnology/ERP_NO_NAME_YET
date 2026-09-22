/** Read-only account/auth readiness probe. Never prints secrets, hashes or IDs. */
require('dotenv').config();
const { createPrismaClient } = require('./prisma_client');
const bcrypt = require('bcrypt');

async function main() {
  const email = String(process.argv[2] || '').trim().toLowerCase();
  if (!email) throw new Error('Provide an account email.');
  const db = createPrismaClient();
  try {
    const startedAt = performance.now();
    const user = await db.iam_user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true, is_active: true, password_hash: true, tenant_id: true, active_role_id: true },
    });
    if (!user) {
      console.log(JSON.stringify({ account_found: false, lookup_ms: Math.round(performance.now() - startedAt) }));
      return;
    }
    const [roleAssignments, membershipCount] = await Promise.all([
      db.iam_user_role.findMany({ where: { user_id: user.id }, select: { role_id: true, company_id: true } }),
      db.iam_user_company_membership.count({ where: { user_id: user.id } }),
    ]);
    const roles = await db.iam_role.findMany({
      where: { id: { in: roleAssignments.map((assignment) => assignment.role_id).filter(Boolean) } },
      select: { id: true, role_code: true, tenant_id: true },
    });
    const hashStartedAt = performance.now();
    await bcrypt.compare('not-the-users-password', user.password_hash);
    const hashMs = Math.round(performance.now() - hashStartedAt);
    console.log(JSON.stringify({
      account_found: true,
      active: user.is_active,
      hash_type: user.password_hash.startsWith('pbkdf2_') ? 'legacy-pbkdf2' : user.password_hash.startsWith('$2') ? 'bcrypt' : 'other',
      role_count: roleAssignments.length,
      membership_count: membershipCount,
      super_admin_role: roles.some((role) => role.role_code === 'SUPER_ADMIN'),
      role_tenant_mismatch: roles.some((role) => role.tenant_id !== user.tenant_id),
      tenant_assigned: Boolean(user.tenant_id),
      role_has_company: roleAssignments.some((assignment) => Boolean(assignment.company_id)),
      active_role_known: user.active_role_id === null || roles.some((role) => role.id === user.active_role_id),
      hash_verify_ms: hashMs,
      probe_ms: Math.round(performance.now() - startedAt),
    }));
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(`${error.name}: ${error.code || 'AUTH_PROBE_FAILED'}`);
  process.exitCode = 1;
});
