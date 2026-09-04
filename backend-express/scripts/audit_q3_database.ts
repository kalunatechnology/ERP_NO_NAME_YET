/**
 * File: backend-express/scripts/audit_q3_database.ts
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
  const columns = await prisma.$queryRawUnsafe<Array<{ table_name: string; column_name: string }>>(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (
        (table_name = 'iam_user' AND column_name = 'active_role_id') OR
        table_name IN ('iam_user_company_membership', 'iam_company_module_access')
      )
    ORDER BY table_name, column_name
  `);
  const enumValues = await prisma.$queryRawUnsafe<Array<{ enumlabel: string }>>(`
    SELECT e.enumlabel
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'iam_role_code'
    ORDER BY e.enumsortorder
  `);
  const roleCodes = await prisma.$queryRawUnsafe<Array<{ role_code: string; count: bigint }>>(`
    SELECT role_code::text, COUNT(*)::bigint AS count
    FROM iam_role
    GROUP BY role_code::text
    ORDER BY role_code::text
  `);
  const invariants = await prisma.$queryRawUnsafe<Array<Record<string, bigint>>>(`
    SELECT
      (SELECT count(*) FROM iam_user_company_membership) AS memberships,
      (SELECT count(*) FROM iam_company_module_access) AS module_access_rows,
      (SELECT count(*) FROM iam_company_module_access WHERE enabled OR allow_read OR allow_write) AS active_module_rows,
      (SELECT count(*) FROM iam_user WHERE is_superuser) AS legacy_super_flags,
      (SELECT count(DISTINCT u.id) FROM iam_user u JOIN iam_user_role ur ON ur.user_id=u.id JOIN iam_role r ON r.id=ur.role_id WHERE r.role_code='ROLE-SUPER-ADMIN') AS canonical_super_users,
      (SELECT count(*) FROM iam_user_company_membership m JOIN iam_user u ON u.id=m.user_id WHERE u.is_superuser) AS super_memberships,
      (SELECT count(*) FROM iam_user u WHERE NOT u.is_superuser AND NOT EXISTS (SELECT 1 FROM iam_user_company_membership m WHERE m.user_id=u.id)) AS users_without_membership,
      (SELECT count(*) FROM iam_user_role ur JOIN iam_user_company_membership m ON m.user_id=ur.user_id WHERE ur.company_id IS DISTINCT FROM m.company_id) AS role_company_mismatches
  `);
  const superUsers = await prisma.$queryRawUnsafe<Array<{ id: string; email: string }>>(`
    SELECT DISTINCT u.id, u.email FROM iam_user u
    JOIN iam_user_role ur ON ur.user_id=u.id
    JOIN iam_role r ON r.id=ur.role_id
    WHERE r.role_code='ROLE-SUPER-ADMIN'
    ORDER BY u.email
  `);
  const tenantRoleMismatches = await prisma.$queryRawUnsafe<Array<{
    email: string;
    user_tenant_id: string | null;
    assignment_tenant_id: string | null;
    role_tenant_id: string | null;
    role_code: string;
  }>>(`
    SELECT u.email,
           u.tenant_id AS user_tenant_id,
           ur.tenant_id AS assignment_tenant_id,
           r.tenant_id AS role_tenant_id,
           r.role_code::text AS role_code
    FROM iam_user u
    JOIN iam_user_role ur ON ur.user_id = u.id
    JOIN iam_role r ON r.id = ur.role_id
    WHERE u.tenant_id IS DISTINCT FROM ur.tenant_id
       OR u.tenant_id IS DISTINCT FROM r.tenant_id
    ORDER BY u.email, r.role_code::text
  `);
  const laterMigrationColumns = await prisma.$queryRawUnsafe<Array<{ table_name: string; column_name: string }>>(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema='public' AND (
      (table_name='iam_role' AND column_name IN ('company_id','custom_code','is_system')) OR
      (table_name='fin_period_closing' AND column_name IN ('requested_by','approved_by','approved_at')) OR
      (table_name='project_control_item' AND column_name='daily_task_id') OR
      (table_name='fin_project_cost_entry' AND column_name='division_id')
    ) ORDER BY table_name, column_name
  `);
  const requiredConstraints = await prisma.$queryRawUnsafe<Array<{ table_name: string; constraint_name: string; constraint_type: string }>>(`
    SELECT tc.table_name, tc.constraint_name, tc.constraint_type
    FROM information_schema.table_constraints tc
    WHERE tc.table_schema='public' AND tc.constraint_name IN (
      'iam_user_company_membership_user_fk',
      'iam_user_company_membership_company_fk',
      'iam_company_module_access_company_module_key',
      'iam_company_module_access_company_fk',
      'iam_company_module_access_period_ck'
    ) ORDER BY tc.constraint_name
  `);
  const migrationHistory = await prisma.$queryRawUnsafe<Array<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }>>(`
    SELECT migration_name, finished_at, rolled_back_at
    FROM "_prisma_migrations"
    ORDER BY started_at
  `).catch(() => []);
  console.log(JSON.stringify({ columns, laterMigrationColumns, requiredConstraints, migrationHistory, enumValues, roleCodes, invariants: invariants[0], superUsers, tenantRoleMismatches }, (_key, value) =>
    typeof value === 'bigint' ? value.toString() : value, 2));
}

main().finally(() => prisma.$disconnect());
