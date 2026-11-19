-- Drop legacy Django foreign keys from inventory tables referencing core_business_document(_line)
-- so stock_move.id and stock_move_line.id can be recorded directly in the inventory ledger.
ALTER TABLE "inv_stock_ledger_entry"
  DROP CONSTRAINT IF EXISTS "inv_stock_ledger_ent_source_document_id_190ee411_fk_core_busi";

ALTER TABLE "inv_stock_ledger_entry"
  DROP CONSTRAINT IF EXISTS "inv_stock_ledger_ent_source_line_id_15aa25e7_fk_core_busi";

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT conname, conrelid::regclass::text AS tbl
    FROM pg_constraint
    WHERE contype = 'f'
      AND conrelid::regclass::text IN (
        'inv_stock_ledger_entry',
        'inv_stock_move',
        'inv_stock_balance',
        'inv_valuation_layer'
      )
      AND confrelid::regclass::text IN ('core_business_document', 'core_business_document_line')
  ) LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I', r.tbl, r.conname);
  END LOOP;
END $$;
