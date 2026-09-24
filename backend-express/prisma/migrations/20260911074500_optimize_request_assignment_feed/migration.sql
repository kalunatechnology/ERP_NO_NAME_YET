-- CreateIndex
CREATE INDEX IF NOT EXISTS "core_audit_event_company_id_entity_name_entity_id_event_type_occurred_at_idx"
ON "core_audit_event"("company_id", "entity_name", "entity_id", "event_type", "occurred_at");
