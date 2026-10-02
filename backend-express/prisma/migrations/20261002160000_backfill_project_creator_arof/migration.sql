-- Backfill created_by_id and project_manager_id for all projects to Arof Fudding
DO $$
DECLARE
    v_arof_id TEXT;
BEGIN
    SELECT id INTO v_arof_id FROM iam_user WHERE username = 'arof' LIMIT 1;
    IF v_arof_id IS NOT NULL THEN
        UPDATE project_project
        SET created_by_id = v_arof_id,
            project_manager_id = COALESCE(project_manager_id, v_arof_id)
        WHERE created_by_id IS NULL;

        -- Ensure SMA projects are managed by Arof
        UPDATE project_project
        SET project_manager_id = v_arof_id
        WHERE company_id = '10000000-0000-0000-0000-000000000001';
    END IF;
END $$;
