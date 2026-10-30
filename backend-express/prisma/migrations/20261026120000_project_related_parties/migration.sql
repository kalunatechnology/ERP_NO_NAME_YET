CREATE TABLE "project_project_party" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT,
  "company_id" TEXT,
  "project_id" TEXT NOT NULL,
  "party_id" TEXT NOT NULL,
  "relationship_type" TEXT NOT NULL,
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_project_party_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "project_project_party_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project_project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "project_project_party_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "master_party"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "project_project_party_project_id_party_id_relationship_type_key"
  ON "project_project_party"("project_id", "party_id", "relationship_type");
CREATE INDEX "project_project_party_tenant_id_company_id_project_id_idx"
  ON "project_project_party"("tenant_id", "company_id", "project_id");
