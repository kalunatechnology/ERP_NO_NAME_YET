-- Drop legacy Django foreign key from inv_stock_ledger_entry.source_document_id to core_business_document
-- so stock_move.id can be recorded directly as source_document_id without requiring a core_business_document row.
ALTER TABLE "inv_stock_ledger_entry"
  DROP CONSTRAINT IF EXISTS "inv_stock_ledger_ent_source_document_id_190ee411_fk_core_busi";
