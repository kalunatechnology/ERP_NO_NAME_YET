CREATE TABLE "marbot_request" (
  "id" UUID NOT NULL,
  "nonce" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "tool_name" TEXT NOT NULL,
  "request_id" TEXT NOT NULL,
  "outcome" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marbot_request_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "marbot_request_nonce_key" ON "marbot_request"("nonce");
CREATE INDEX "marbot_request_tenant_id_company_id_created_at_idx" ON "marbot_request"("tenant_id", "company_id", "created_at");
