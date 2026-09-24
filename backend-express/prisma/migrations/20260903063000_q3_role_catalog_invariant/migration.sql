BEGIN;

WITH catalog(role_code, role_name, description) AS (
  VALUES
    ('ROLE-COMPANY-ADMIN'::iam_role_code, 'Company Administrator', 'Company-scoped user and permission administrator'),
    ('ROLE-DIRECTOR'::iam_role_code, 'Director', 'Executive and reporting access'),
    ('ROLE-OM'::iam_role_code, 'Operational Manager', 'Operational management access'),
    ('ROLE-PM'::iam_role_code, 'Project Manager', 'Project management access'),
    ('ROLE-SUPERVISOR'::iam_role_code, 'Supervisor', 'Supervisor access'),
    ('ROLE-CRM-LEAD'::iam_role_code, 'CRM Lead', 'CRM leadership access'),
    ('ROLE-SALES'::iam_role_code, 'Sales', 'Sales access'),
    ('ROLE-FINANCE'::iam_role_code, 'Finance', 'Finance access'),
    ('ROLE-STAFF'::iam_role_code, 'Staff', 'Standard staff access')
), tenant_catalog AS (
  SELECT DISTINCT u.tenant_id, c.*
  FROM iam_user u CROSS JOIN catalog c
  WHERE u.tenant_id IS NOT NULL
)
INSERT INTO iam_role(id, tenant_id, role_code, role_name, description)
SELECT gen_random_uuid(), tc.tenant_id, tc.role_code, tc.role_name, tc.description
FROM tenant_catalog tc
WHERE NOT EXISTS (
  SELECT 1 FROM iam_role r
  WHERE r.tenant_id = tc.tenant_id AND r.role_code = tc.role_code
);

UPDATE iam_user_role ur
SET role_id = company_admin.id
FROM iam_user u
JOIN iam_role legacy_super
  ON legacy_super.tenant_id IS NOT DISTINCT FROM u.tenant_id
 AND legacy_super.role_code = 'ROLE-SUPER-ADMIN'::iam_role_code
JOIN iam_role company_admin
  ON company_admin.tenant_id IS NOT DISTINCT FROM u.tenant_id
 AND company_admin.role_code = 'ROLE-COMPANY-ADMIN'::iam_role_code
WHERE ur.user_id = u.id
  AND ur.role_id = legacy_super.id
  AND lower(u.email) <> 'dummy.admin@example.com';

INSERT INTO iam_user_company_membership(id, tenant_id, company_id, user_id, status)
SELECT gen_random_uuid(), u.tenant_id, c.id, u.id, 'ACTIVE'
FROM iam_user u
JOIN LATERAL (
  SELECT c.id FROM core_company c WHERE c.tenant_id IS NOT DISTINCT FROM u.tenant_id ORDER BY c.id LIMIT 1
) c ON true
WHERE lower(u.email) <> 'dummy.admin@example.com'
  AND NOT EXISTS (SELECT 1 FROM iam_user_company_membership m WHERE m.user_id=u.id);

DELETE FROM iam_user_company_membership m
USING iam_user u
WHERE m.user_id=u.id AND lower(u.email)='dummy.admin@example.com';

UPDATE iam_user_role ur
SET company_id = CASE WHEN lower(u.email)='dummy.admin@example.com' THEN NULL ELSE m.company_id END
FROM iam_user u
LEFT JOIN iam_user_company_membership m ON m.user_id=u.id
WHERE ur.user_id=u.id;

UPDATE iam_user
SET is_superuser = (lower(email)='dummy.admin@example.com'),
    is_staff = CASE WHEN lower(email)='dummy.admin@example.com' THEN true ELSE is_staff END;

UPDATE iam_user u
SET active_role_id = (
  SELECT ur.role_id FROM iam_user_role ur
  WHERE ur.user_id = u.id AND ur.role_id IS NOT NULL
  ORDER BY ur.id LIMIT 1
)
WHERE lower(u.email) <> 'dummy.admin@example.com'
  AND EXISTS (
    SELECT 1 FROM iam_role r
    WHERE r.id = u.active_role_id AND r.role_code = 'ROLE-SUPER-ADMIN'::iam_role_code
  );

UPDATE iam_user u
SET active_role_id = r.id
FROM iam_role r
WHERE lower(u.email)='dummy.admin@example.com'
  AND r.tenant_id IS NOT DISTINCT FROM u.tenant_id
  AND r.role_code='ROLE-SUPER-ADMIN'::iam_role_code;

COMMIT;
