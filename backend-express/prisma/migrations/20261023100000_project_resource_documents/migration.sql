CREATE TABLE "project_resource_document" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT,
  "company_id" TEXT,
  "project_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "category" TEXT NOT NULL DEFAULT 'DOCUMENT',
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "project_resource_document_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "project_resource_document_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project_project"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "project_resource_document_tenant_id_company_id_project_id_idx"
  ON "project_resource_document"("tenant_id", "company_id", "project_id");
