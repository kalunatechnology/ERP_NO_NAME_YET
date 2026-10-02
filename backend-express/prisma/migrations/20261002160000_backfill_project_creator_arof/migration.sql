-- Backfill created_by_id and project_manager_id for all projects to Arof Fudding
DO $$
DECLARE
    v_arof_id TEXT;
    v_arof_name TEXT;
BEGIN
    SELECT id, full_name INTO v_arof_id, v_arof_name FROM iam_user WHERE username = 'arof' LIMIT 1;
    IF v_arof_id IS NOT NULL THEN
        UPDATE project_project
        SET created_by_id = v_arof_id,
            project_manager_id = v_arof_id,
            manager_name = COALESCE(v_arof_name, 'Arof Fudding');

        -- Clear notetaker on recurring meetings (open to all attendees)
        UPDATE request_meeting
        SET notetaker_user_id = NULL
        WHERE recurrence_type = 'RECURRING';

        UPDATE request_ticket
        SET assignee_user_id = NULL
        WHERE id IN (SELECT request_id FROM request_meeting WHERE recurrence_type = 'RECURRING');
    END IF;
END $$;
