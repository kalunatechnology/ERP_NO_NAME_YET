-- Fast tenant/company-scoped lookup for effective project management authority.
CREATE INDEX IF NOT EXISTS "project_member_active_authority_lookup_idx"
    ON "project_member"("company_id", "project_id", "user_id", "project_role", "status");

-- Delegation is project-scoped and historical rows are retained. Only one row
-- may represent the active Acting Project Manager for a project at a time.
CREATE UNIQUE INDEX IF NOT EXISTS "project_member_one_active_acting_manager_per_project_idx"
    ON "project_member"("project_id")
    WHERE "project_role" = 'ACTING_PROJECT_MANAGER'
      AND "status" = 'ACTIVE';
