CREATE TABLE "inv_internal_document" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT,
  "company_id" TEXT NOT NULL,
  "created_by_id" TEXT,
  "title" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'GENERAL',
  "description" TEXT NOT NULL DEFAULT '',
  "file_name" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "file_size" INTEGER NOT NULL,
  "checksum" TEXT NOT NULL,
  "content" BYTEA NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "inv_internal_document_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "inv_internal_document_company_category_created_at_idx"
  ON "inv_internal_document"("company_id", "category", "created_at");
