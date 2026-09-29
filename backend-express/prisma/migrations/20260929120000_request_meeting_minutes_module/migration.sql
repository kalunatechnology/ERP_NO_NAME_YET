CREATE TABLE IF NOT EXISTS "request_ticket" (
  "id" TEXT PRIMARY KEY, "tenant_id" TEXT, "company_id" TEXT NOT NULL,
  "created_by_id" TEXT NOT NULL, "workflow_instance_id" TEXT NOT NULL,
  "request_number" TEXT NOT NULL, "request_type" TEXT NOT NULL,
  "title" TEXT NOT NULL, "description" TEXT NOT NULL DEFAULT '',
  "requester_user_id" TEXT NOT NULL, "assignee_user_id" TEXT, "project_id" TEXT,
  "priority" TEXT NOT NULL DEFAULT 'MEDIUM', "status" TEXT NOT NULL DEFAULT 'PENDING_OM',
  "submitted_at" TIMESTAMP(3), "completed_at" TIMESTAMP(3), "cancelled_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "request_ticket_workflow_instance_id_key" ON "request_ticket"("workflow_instance_id");
CREATE UNIQUE INDEX IF NOT EXISTS "request_ticket_company_id_request_number_key" ON "request_ticket"("company_id", "request_number");
CREATE INDEX IF NOT EXISTS "request_ticket_company_id_request_type_status_idx" ON "request_ticket"("company_id", "request_type", "status");
CREATE INDEX IF NOT EXISTS "request_ticket_company_id_requester_user_id_idx" ON "request_ticket"("company_id", "requester_user_id");
CREATE INDEX IF NOT EXISTS "request_ticket_company_id_assignee_user_id_idx" ON "request_ticket"("company_id", "assignee_user_id");

CREATE TABLE IF NOT EXISTS "request_meeting" (
  "id" TEXT PRIMARY KEY, "tenant_id" TEXT, "company_id" TEXT NOT NULL, "created_by_id" TEXT NOT NULL,
  "request_id" TEXT NOT NULL, "organizer_user_id" TEXT NOT NULL, "notetaker_user_id" TEXT,
  "meeting_type" TEXT NOT NULL DEFAULT 'INTERNAL', "start_at" TIMESTAMP(3) NOT NULL,
  "end_at" TIMESTAMP(3) NOT NULL, "timezone" TEXT NOT NULL DEFAULT 'Asia/Jakarta',
  "location" TEXT, "meeting_url" TEXT, "agenda_summary" TEXT,
  "requires_minutes" BOOLEAN NOT NULL DEFAULT true, "minutes_due_at" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "request_meeting_request_id_key" ON "request_meeting"("request_id");
CREATE INDEX IF NOT EXISTS "request_meeting_company_id_start_at_idx" ON "request_meeting"("company_id", "start_at");
CREATE INDEX IF NOT EXISTS "request_meeting_company_id_organizer_user_id_idx" ON "request_meeting"("company_id", "organizer_user_id");

CREATE TABLE IF NOT EXISTS "request_meeting_participant" (
  "id" TEXT PRIMARY KEY, "tenant_id" TEXT, "company_id" TEXT NOT NULL, "created_by_id" TEXT NOT NULL,
  "meeting_id" TEXT NOT NULL, "user_id" TEXT, "external_name" TEXT, "external_email" TEXT,
  "participant_role" TEXT NOT NULL DEFAULT 'ATTENDEE', "is_required" BOOLEAN NOT NULL DEFAULT true,
  "invitation_status" TEXT NOT NULL DEFAULT 'PENDING', "attendance_status" TEXT NOT NULL DEFAULT 'UNKNOWN',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "request_meeting_participant_company_id_meeting_id_idx" ON "request_meeting_participant"("company_id", "meeting_id");
CREATE INDEX IF NOT EXISTS "request_meeting_participant_company_id_user_id_idx" ON "request_meeting_participant"("company_id", "user_id");

CREATE TABLE IF NOT EXISTS "request_meeting_agenda" (
  "id" TEXT PRIMARY KEY, "tenant_id" TEXT, "company_id" TEXT NOT NULL, "created_by_id" TEXT NOT NULL,
  "meeting_id" TEXT NOT NULL, "sequence_number" INTEGER NOT NULL, "title" TEXT NOT NULL,
  "description" TEXT, "presenter_user_id" TEXT, "planned_duration_minutes" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'PENDING', "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "request_meeting_agenda_meeting_id_sequence_number_key" ON "request_meeting_agenda"("meeting_id", "sequence_number");
CREATE INDEX IF NOT EXISTS "request_meeting_agenda_company_id_meeting_id_idx" ON "request_meeting_agenda"("company_id", "meeting_id");

CREATE TABLE IF NOT EXISTS "request_meeting_minutes" (
  "id" TEXT PRIMARY KEY, "tenant_id" TEXT, "company_id" TEXT NOT NULL, "created_by_id" TEXT NOT NULL,
  "meeting_id" TEXT NOT NULL, "version_number" INTEGER NOT NULL DEFAULT 1, "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "summary" TEXT NOT NULL DEFAULT '', "opening_notes" TEXT NOT NULL DEFAULT '',
  "general_discussion" TEXT NOT NULL DEFAULT '', "conclusion" TEXT NOT NULL DEFAULT '',
  "next_meeting_at" TIMESTAMP(3), "prepared_by_id" TEXT NOT NULL, "reviewed_by_id" TEXT,
  "approved_by_id" TEXT, "prepared_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "published_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "request_meeting_minutes_meeting_id_version_number_key" ON "request_meeting_minutes"("meeting_id", "version_number");
CREATE INDEX IF NOT EXISTS "request_meeting_minutes_company_id_meeting_id_status_idx" ON "request_meeting_minutes"("company_id", "meeting_id", "status");

CREATE TABLE IF NOT EXISTS "request_meeting_decision" (
  "id" TEXT PRIMARY KEY, "tenant_id" TEXT, "company_id" TEXT NOT NULL, "created_by_id" TEXT NOT NULL,
  "meeting_id" TEXT NOT NULL, "minutes_id" TEXT NOT NULL, "agenda_id" TEXT,
  "decision_number" INTEGER NOT NULL, "decision_text" TEXT NOT NULL, "owner_user_id" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE', "decided_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "request_meeting_decision_minutes_id_decision_number_key" ON "request_meeting_decision"("minutes_id", "decision_number");
CREATE INDEX IF NOT EXISTS "request_meeting_decision_company_id_meeting_id_idx" ON "request_meeting_decision"("company_id", "meeting_id");

CREATE TABLE IF NOT EXISTS "request_meeting_action_item" (
  "id" TEXT PRIMARY KEY, "tenant_id" TEXT, "company_id" TEXT NOT NULL, "created_by_id" TEXT NOT NULL,
  "meeting_id" TEXT NOT NULL, "minutes_id" TEXT NOT NULL, "agenda_id" TEXT,
  "title" TEXT NOT NULL, "description" TEXT NOT NULL DEFAULT '', "assignee_user_id" TEXT,
  "due_at" TIMESTAMP(3), "priority" TEXT NOT NULL DEFAULT 'MEDIUM', "status" TEXT NOT NULL DEFAULT 'OPEN',
  "project_id" TEXT, "daily_task_id" TEXT, "completed_at" TIMESTAMP(3), "verified_by_id" TEXT,
  "verified_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "request_meeting_action_item_company_id_meeting_id_status_idx" ON "request_meeting_action_item"("company_id", "meeting_id", "status");
CREATE INDEX IF NOT EXISTS "request_meeting_action_item_company_id_assignee_user_id_status_idx" ON "request_meeting_action_item"("company_id", "assignee_user_id", "status");
