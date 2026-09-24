-- Align the physical PostgreSQL ID storage with the established production
-- baseline and the current Prisma schema.
--
-- Context:
-- - Prisma models expose identifiers as String and do not declare @db.Uuid.
-- - Production was explicitly normalized to TEXT-backed IDs.
-- - Some historical migrations created UUID-backed columns, which can leave a
--   freshly migrated database with a different physical schema and cause
--   PostgreSQL 42883 errors such as `operator does not exist: uuid = text`.
--
-- This migration is intentionally data-preserving: PostgreSQL UUID values are
-- converted to their canonical textual representation. Foreign keys are
-- temporarily removed and recreated after both sides of each relationship have
-- been normalized. UUID defaults are restored as TEXT-producing defaults.

BEGIN;

-- Capture every FK that touches at least one UUID column on either side. These
-- constraints must be removed before changing the participating column types.
CREATE TEMP TABLE _erp_uuid_fk_restore ON COMMIT DROP AS
SELECT
  c.oid AS constraint_oid,
  c.conrelid AS table_oid,
  c.conname AS constraint_name,
  pg_get_constraintdef(c.oid, true) AS constraint_definition
FROM pg_constraint c
WHERE c.contype = 'f'
  AND c.connamespace = 'public'::regnamespace
  AND (
    EXISTS (
      SELECT 1
      FROM unnest(c.conkey) AS key(attnum)
      JOIN pg_attribute a
        ON a.attrelid = c.conrelid
       AND a.attnum = key.attnum
      WHERE a.atttypid = 'uuid'::regtype
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(c.confkey) AS key(attnum)
      JOIN pg_attribute a
        ON a.attrelid = c.confrelid
       AND a.attnum = key.attnum
      WHERE a.atttypid = 'uuid'::regtype
    )
  );

DO $$
DECLARE
  item record;
BEGIN
  FOR item IN SELECT * FROM _erp_uuid_fk_restore LOOP
    EXECUTE format(
      'ALTER TABLE %s DROP CONSTRAINT %I',
      item.table_oid::regclass,
      item.constraint_name
    );
  END LOOP;
END $$;

-- Defaults returning UUID cannot remain attached while the column is changed
-- to TEXT. Preserve their expressions so the same generation semantics can be
-- restored as text after conversion.
CREATE TEMP TABLE _erp_uuid_default_restore ON COMMIT DROP AS
SELECT
  cls.oid AS table_oid,
  attr.attname AS column_name,
  pg_get_expr(def.adbin, def.adrelid) AS default_expression
FROM pg_attribute attr
JOIN pg_class cls ON cls.oid = attr.attrelid
JOIN pg_namespace ns ON ns.oid = cls.relnamespace
JOIN pg_attrdef def
  ON def.adrelid = attr.attrelid
 AND def.adnum = attr.attnum
WHERE ns.nspname = 'public'
  AND cls.relkind IN ('r', 'p')
  AND attr.attnum > 0
  AND NOT attr.attisdropped
  AND attr.atttypid = 'uuid'::regtype;

DO $$
DECLARE
  item record;
BEGIN
  FOR item IN SELECT * FROM _erp_uuid_default_restore LOOP
    EXECUTE format(
      'ALTER TABLE %s ALTER COLUMN %I DROP DEFAULT',
      item.table_oid::regclass,
      item.column_name
    );
  END LOOP;
END $$;

-- Current Prisma models represent these identifiers as String without
-- @db.Uuid. Normalize every remaining application UUID column in public to
-- PostgreSQL TEXT so a database produced from migrations has the same storage
-- contract as production.
DO $$
DECLARE
  item record;
BEGIN
  FOR item IN
    SELECT cls.oid AS table_oid, attr.attname AS column_name
    FROM pg_attribute attr
    JOIN pg_class cls ON cls.oid = attr.attrelid
    JOIN pg_namespace ns ON ns.oid = cls.relnamespace
    WHERE ns.nspname = 'public'
      AND cls.relkind IN ('r', 'p')
      AND attr.attnum > 0
      AND NOT attr.attisdropped
      AND attr.atttypid = 'uuid'::regtype
    ORDER BY cls.relname, attr.attnum
  LOOP
    EXECUTE format(
      'ALTER TABLE %s ALTER COLUMN %I TYPE text USING %I::text',
      item.table_oid::regclass,
      item.column_name,
      item.column_name
    );
  END LOOP;
END $$;

-- Preserve UUID-generation behavior, now producing the canonical UUID string.
DO $$
DECLARE
  item record;
BEGIN
  FOR item IN SELECT * FROM _erp_uuid_default_restore LOOP
    EXECUTE format(
      'ALTER TABLE %s ALTER COLUMN %I SET DEFAULT ((%s)::text)',
      item.table_oid::regclass,
      item.column_name,
      item.default_expression
    );
  END LOOP;
END $$;

-- Both ends of each FK are TEXT now, so the original constraints can be
-- restored verbatim (including delete/update actions and deferrability).
DO $$
DECLARE
  item record;
BEGIN
  FOR item IN SELECT * FROM _erp_uuid_fk_restore ORDER BY constraint_oid LOOP
    EXECUTE format(
      'ALTER TABLE %s ADD CONSTRAINT %I %s',
      item.table_oid::regclass,
      item.constraint_name,
      item.constraint_definition
    );
  END LOOP;
END $$;

-- Fail closed if a UUID column survived. The application schema intentionally
-- has no @db.Uuid fields; leaving one behind would recreate the same class of
-- runtime mismatch on a later endpoint.
DO $$
DECLARE
  remaining text;
BEGIN
  SELECT string_agg(format('%I.%I', table_name, column_name), ', ' ORDER BY table_name, ordinal_position)
    INTO remaining
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND data_type = 'uuid';

  IF remaining IS NOT NULL THEN
    RAISE EXCEPTION 'ERP schema normalization incomplete; UUID columns remain: %', remaining;
  END IF;
END $$;

COMMIT;
