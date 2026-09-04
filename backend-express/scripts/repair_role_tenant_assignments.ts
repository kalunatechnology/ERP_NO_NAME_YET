/**
 * File: backend-express/scripts/repair_role_tenant_assignments.ts
 *
 * Purpose: Implements database administration script responsibilities for the platform domain.
 * Responsibility: Defines the executable contracts in this file and connects them to their callers without owning unrelated domain behavior.
 * Integration: Used through static imports, Express/Next framework discovery, or an explicit npm/script entry point as applicable.
 * Dependencies and side effects: See each documented function; database, browser storage, network, and response mutations are called out where present.
 */
import prisma from '../src/config/database';

/**
 * main executes one step of this explicit database administration script.
 *
 * Database operations: Uses the database/client operations visible in the implementation.
 * Operational contract: It runs only when this script is invoked; it is not part of the normal HTTP request lifecycle.
 * Failure behavior: Rejects/throws to the script entry point so the process can report failure and perform its configured cleanup/disconnect.
 */
async function main() {
  const statements = [
    `INSERT INTO iam_role (id, tenant_id, role_code, role_name, description)
     SELECT gen_random_uuid(), required.tenant_id, required.role_code, required.role_name, required.description
     FROM (SELECT DISTINCT u.tenant_id, r.role_code, r.role_name, r.description
           FROM iam_user_role ur JOIN iam_user u ON u.id=ur.user_id JOIN iam_role r ON r.id=ur.role_id
           WHERE u.tenant_id IS NOT NULL) required
     WHERE NOT EXISTS (SELECT 1 FROM iam_role existing
                       WHERE existing.tenant_id=required.tenant_id AND existing.role_code=required.role_code)`,
    `UPDATE iam_user u SET active_role_id=tenant_role.id
     FROM iam_role source_role, iam_role tenant_role
     WHERE source_role.id=u.active_role_id AND tenant_role.tenant_id=u.tenant_id
       AND tenant_role.role_code=source_role.role_code AND source_role.tenant_id IS DISTINCT FROM u.tenant_id`,
    `UPDATE iam_user_role ur SET tenant_id=u.tenant_id, role_id=tenant_role.id, updated_at=now()
     FROM iam_user u, iam_role source_role, iam_role tenant_role
     WHERE u.id=ur.user_id AND source_role.id=ur.role_id AND tenant_role.tenant_id=u.tenant_id
       AND tenant_role.role_code=source_role.role_code
       AND (ur.tenant_id IS DISTINCT FROM u.tenant_id OR source_role.tenant_id IS DISTINCT FROM u.tenant_id)`,
    `DELETE FROM iam_user_role duplicate USING iam_user_role keeper
     WHERE duplicate.user_id=keeper.user_id AND duplicate.role_id=keeper.role_id AND duplicate.id::text>keeper.id::text`,
    `DELETE FROM iam_user_role ur USING iam_user u, iam_role r
     WHERE ur.user_id=u.id AND ur.role_id=r.id AND u.email='dummy.admin@example.com'
       AND r.role_code<>'ROLE-SUPER-ADMIN'`,
    `UPDATE iam_user_role ur SET company_id=NULL, organization_id=NULL, tenant_id=u.tenant_id, updated_at=now()
     FROM iam_user u, iam_role r WHERE ur.user_id=u.id AND ur.role_id=r.id
       AND u.email='dummy.admin@example.com' AND r.role_code='ROLE-SUPER-ADMIN'`,
    `UPDATE iam_user u SET is_superuser=(u.email='dummy.admin@example.com'),
       is_staff=CASE WHEN u.email='dummy.admin@example.com' THEN TRUE ELSE u.is_staff END,
       active_role_id=CASE WHEN u.email='dummy.admin@example.com' THEN
         (SELECT r.id FROM iam_role r WHERE r.tenant_id=u.tenant_id AND r.role_code='ROLE-SUPER-ADMIN' LIMIT 1)
         ELSE u.active_role_id END`,
    `DELETE FROM iam_user_company_membership membership USING iam_user u
     WHERE membership.user_id=u.id AND u.email='dummy.admin@example.com'`,
  ];

  const results = await prisma.$transaction(statements.map((sql) => prisma.$executeRawUnsafe(sql)));
  console.log(JSON.stringify({ affectedRowsByStep: results }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
