-- CreateTable
CREATE TABLE "management_report" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "report_number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "report_type" TEXT NOT NULL,
    "period_type" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "executive_summary" TEXT,
    "achievements" TEXT,
    "blockers" TEXT,
    "risks" TEXT,
    "decisions_needed" TEXT,
    "next_plan" TEXT,
    "snapshot_json" JSONB,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "prepared_by_id" TEXT NOT NULL,
    "submitted_at" TIMESTAMP(3),
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,
    "version_number" INTEGER NOT NULL DEFAULT 1,
    "parent_report_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "management_report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "management_report_tenant_id_company_id_status_idx" ON "management_report"("tenant_id", "company_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "management_report_company_id_report_number_version_number_key" ON "management_report"("company_id", "report_number", "version_number");
