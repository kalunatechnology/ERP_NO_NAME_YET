-- Preserve unknown schemes on historical records. Never infer tax treatment.
ALTER TABLE "fin_billing_proposal" ADD COLUMN "tax_scheme" TEXT;
ALTER TABLE "fin_billing_document" ADD COLUMN "tax_scheme" TEXT;
ALTER TABLE "fin_billing_proposal" ADD CONSTRAINT "billing_proposal_tax_scheme_valid"
  CHECK ("tax_scheme" IN ('PROPORTIONAL', 'FULL_UPFRONT', 'FINAL_SETTLEMENT'));
ALTER TABLE "fin_billing_document" ADD CONSTRAINT "billing_document_tax_scheme_valid"
  CHECK ("tax_scheme" IN ('PROPORTIONAL', 'FULL_UPFRONT', 'FINAL_SETTLEMENT'));
