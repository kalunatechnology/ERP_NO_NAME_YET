-- Provision the missing employee side only for an IAM user that already has
-- an explicit active project membership. This is deterministic and scoped;
-- no matching by name or email is permitted.
INSERT INTO "master_employee" (
  "id",
  "tenant_id",
  "company_id",
  "user_id",
  "employee_number",
  "employment_status",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  member."tenant_id",
  member."company_id",
  member."user_id"::text,
  'AUTO-' || UPPER(SUBSTRING(REPLACE(member."user_id"::text, '-', '') FROM 1 FOR 12)),
  'ACTIVE',
  NOW(),
  NOW()
FROM (
  SELECT DISTINCT "tenant_id", "company_id", "user_id"
  FROM "project_member"
  WHERE "user_id" IS NOT NULL
    AND UPPER("status") = 'ACTIVE'
) AS member
WHERE NOT EXISTS (
  SELECT 1
  FROM "master_employee" AS existing
  WHERE existing."company_id"::text = member."company_id"::text
    AND existing."user_id"::text = member."user_id"::text
);

-- Link active memberships to the exact employee created/found for the same
-- tenant, company, and IAM user.
UPDATE "project_member" AS member
SET "employee_id" = employee."id"
FROM "master_employee" AS employee
WHERE member."employee_id" IS NULL
  AND member."user_id" IS NOT NULL
  AND UPPER(member."status") = 'ACTIVE'
  AND employee."tenant_id"::text = member."tenant_id"::text
  AND employee."company_id"::text = member."company_id"::text
  AND employee."user_id"::text = member."user_id"::text;

-- Backfill only authoritative IAM mappings already represented by an active
-- project membership with an existing employee relation.
WITH authoritative_mapping AS (
  SELECT
    member."tenant_id"::text AS tenant_id,
    member."company_id"::text AS company_id,
    member."employee_id"::text AS employee_id,
    MIN(member."user_id"::text) AS user_id
  FROM "project_member" AS member
  WHERE member."employee_id" IS NOT NULL
    AND member."user_id" IS NOT NULL
    AND UPPER(member."status") = 'ACTIVE'
  GROUP BY member."tenant_id"::text, member."company_id"::text, member."employee_id"::text
  HAVING COUNT(DISTINCT member."user_id"::text) = 1
)
UPDATE "master_employee" AS employee
SET "user_id" = mapping."user_id"
FROM authoritative_mapping AS mapping
WHERE employee."user_id" IS NULL
  AND employee."id"::text = mapping."employee_id"
  AND employee."tenant_id"::text = mapping."tenant_id"
  AND employee."company_id"::text = mapping."company_id"
  AND NOT EXISTS (
    SELECT 1
    FROM "master_employee" AS existing
    WHERE existing."company_id"::text = employee."company_id"::text
      AND existing."user_id"::text = mapping."user_id"
  );
