BEGIN;

-- CreateTable
CREATE TABLE IF NOT EXISTS "marbot_knowledge_snapshot" (
    "id" TEXT NOT NULL,
    "version_number" TEXT NOT NULL,
    "commit_sha" TEXT NOT NULL,
    "deployment_target" TEXT NOT NULL DEFAULT 'production',
    "runtime_config_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'STAGING',
    "metrics_json" TEXT,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marbot_knowledge_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "marbot_knowledge_entry" (
    "id" TEXT NOT NULL,
    "snapshot_id" TEXT NOT NULL,
    "feature_id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "operation" TEXT,
    "module_code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "knowledge_category" TEXT NOT NULL DEFAULT 'USER_PROCEDURE',
    "lifecycle_status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "comparison_status" TEXT NOT NULL DEFAULT 'NEW',
    "source_priority" TEXT NOT NULL DEFAULT 'CODE_FACT',
    "actor_policy_json" TEXT,
    "workflow_json" TEXT,
    "navigation_json" TEXT,
    "content_json" TEXT NOT NULL,
    "confidence_score" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "review_required" BOOLEAN NOT NULL DEFAULT false,
    "provenance_json" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marbot_knowledge_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "marbot_knowledge_evidence" (
    "id" TEXT NOT NULL,
    "entry_id" TEXT,
    "feature_id" TEXT NOT NULL,
    "source_file" TEXT NOT NULL,
    "symbol_name" TEXT,
    "ast_node_range" TEXT,
    "ast_node_hash" TEXT NOT NULL,
    "route_method" TEXT,
    "route_path" TEXT,
    "middleware_chain_json" TEXT,
    "related_symbols_json" TEXT,
    "extraction_method" TEXT NOT NULL DEFAULT 'AST',
    "source_type" TEXT NOT NULL DEFAULT 'BACKEND_ROUTE',
    "commit_sha" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marbot_knowledge_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "marbot_knowledge_job" (
    "id" TEXT NOT NULL,
    "job_type" TEXT NOT NULL,
    "queue_name" TEXT NOT NULL DEFAULT 'default',
    "priority" INTEGER NOT NULL DEFAULT 10,
    "payload_json" TEXT,
    "checkpoint_json" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "next_retry_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_by" TEXT,
    "lock_token" TEXT,
    "locked_until" TIMESTAMP(3),
    "last_error" TEXT,
    "commit_sha" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marbot_knowledge_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "marbot_knowledge_lock" (
    "lock_key" TEXT NOT NULL,
    "owner_worker_id" TEXT NOT NULL,
    "lock_token" TEXT NOT NULL,
    "commit_sha" TEXT,
    "acquired_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marbot_knowledge_lock_pkey" PRIMARY KEY ("lock_key")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "marbot_knowledge_snapshot_version_number_key" ON "marbot_knowledge_snapshot"("version_number");
CREATE INDEX IF NOT EXISTS "marbot_knowledge_snapshot_status_idx" ON "marbot_knowledge_snapshot"("status");
CREATE INDEX IF NOT EXISTS "marbot_knowledge_snapshot_commit_sha_idx" ON "marbot_knowledge_snapshot"("commit_sha");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "marbot_knowledge_entry_snapshot_id_feature_id_key" ON "marbot_knowledge_entry"("snapshot_id", "feature_id");
CREATE INDEX IF NOT EXISTS "marbot_knowledge_entry_topic_operation_idx" ON "marbot_knowledge_entry"("topic", "operation");
CREATE INDEX IF NOT EXISTS "marbot_knowledge_entry_module_code_idx" ON "marbot_knowledge_entry"("module_code");
CREATE INDEX IF NOT EXISTS "marbot_knowledge_entry_lifecycle_status_idx" ON "marbot_knowledge_entry"("lifecycle_status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "marbot_knowledge_evidence_feature_id_idx" ON "marbot_knowledge_evidence"("feature_id");
CREATE INDEX IF NOT EXISTS "marbot_knowledge_evidence_ast_node_hash_idx" ON "marbot_knowledge_evidence"("ast_node_hash");
CREATE INDEX IF NOT EXISTS "marbot_knowledge_evidence_source_file_idx" ON "marbot_knowledge_evidence"("source_file");
CREATE INDEX IF NOT EXISTS "marbot_knowledge_evidence_commit_sha_idx" ON "marbot_knowledge_evidence"("commit_sha");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "marbot_knowledge_job_status_next_retry_at_locked_until_idx" ON "marbot_knowledge_job"("status", "next_retry_at", "locked_until");
CREATE INDEX IF NOT EXISTS "marbot_knowledge_job_queue_name_priority_idx" ON "marbot_knowledge_job"("queue_name", "priority");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "marbot_knowledge_lock_expires_at_idx" ON "marbot_knowledge_lock"("expires_at");

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'marbot_knowledge_entry_snapshot_id_fkey'
    ) THEN
        ALTER TABLE "marbot_knowledge_entry"
        ADD CONSTRAINT "marbot_knowledge_entry_snapshot_id_fkey"
        FOREIGN KEY ("snapshot_id") REFERENCES "marbot_knowledge_snapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'marbot_knowledge_evidence_entry_id_fkey'
    ) THEN
        ALTER TABLE "marbot_knowledge_evidence"
        ADD CONSTRAINT "marbot_knowledge_evidence_entry_id_fkey"
        FOREIGN KEY ("entry_id") REFERENCES "marbot_knowledge_entry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

COMMIT;
