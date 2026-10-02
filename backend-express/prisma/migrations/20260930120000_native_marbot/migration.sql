CREATE TABLE "marbot_conversation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "marbot_conversation_tenant_id_company_id_user_id_updated_at_idx"
  ON "marbot_conversation"("tenant_id", "company_id", "user_id", "updated_at");
CREATE TABLE "marbot_message" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "conversation_id" TEXT NOT NULL REFERENCES "marbot_conversation"("id") ON DELETE CASCADE,
  "role" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "metadata" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "marbot_message_conversation_id_created_at_idx" ON "marbot_message"("conversation_id", "created_at");
