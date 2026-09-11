# Integration hardening — 10 September 2026

Status: working-tree implementation, NOT production verified. This addendum supersedes older status-only matching/disbursement descriptions. It does not certify complete ERP integration.

| Flow | Implementation | Limits |
|---|---|---|
| Three-way match | Existing endpoint now requires goods_receipt_id and supplier_invoice_id. Checks company/PO/vendor/currency, accepted completed receipt, product/UOM, ordered/accepted/invoiced quantities, price, totals and tax. Stores MATCHED/MISMATCH and variances; generic match writes disabled. | Exact full-order matching only. Partial invoices, tolerance, repeated-product allocation and consumption across invoices remain open. No automatic payment approval. |
| Tax scheme | Nullable tax_scheme on proposal/document, copied at issuance and projected through invoice. Three allowed values: PROPORTIONAL, FULL_UPFRONT, FINAL_SETTLEMENT. Missing historical scheme stays null. | Classification storage only; upfront/final-settlement tax timing calculation remains open. |
| Request disbursement | Actual bank/reference required. Approved INTERNAL_FUND_REQUEST amount becomes REQUEST_ADVANCE Payment and debit 1140/credit bank journal. Payment, journal, status and audit share a serializable transaction. | Records an external transfer; does not send bank funds. LPJ settlement/refund journals remain open. Open fiscal period and configured accounts required. |
| Inventory | Stock-move completion writes signed ledger, balance, FIFO valuation layers, line value and status atomically. Added stock-move-lines route. Ledger/balance/layer routes read-only. | Non-lot/non-serial FIFO with base UOM, RECEIPT/ISSUE/TRANSFER only. Adjustments, reservation consumption and other costing methods rejected. No automatic GL. Old completed records without ledger require reconciliation. |
| Manufacturing | Issue-materials posts prepared linked ISSUE moves atomically, checks quantities against material plan, records issued quantity/actual cost/manufacturing ledger. | No invented source location or automatic BOM movement creation. Finished goods, labor/overhead and GL posting remain open. |
| Quality | Completion validates quantity, mandatory plan results and numeric limits. Failure requires NCR. Receipt acceptance requires all linked inspections passing. Work-order completion requires passing inspections and reconciled quantity. | Full disposition/CAPA automation and downstream gates remain open. |
| Disposal | Separate category accounts for acquisition/accumulated depreciation; company checks, valid proceeds/date/book arithmetic, conditional ACTIVE claim, scoped journal/disposal. | Concurrent depreciation/disposal and multiple books need database verification. Explicit category accounts required. |

## Migration and production

The Hostinger build log dated 11 September 2026 confirms that `20260910020000_billing_tax_scheme` was applied successfully through `prisma migrate deploy`. A subsequent build then failed at the backend Q11 test because it imported a frontend UI utility and Hostinger installs only backend dependencies. The gate is now dependency-isolated; redeploy the same backend release. `migrate deploy` is idempotent and will not reapply the completed migration. Authenticated browser smoke remains required before production acceptance.

## Verification limits

`tests/integration-hardening.unit.ts` uses mocked Prisma transactions to verify exact match, price mismatch, invalid references/no write, invalid disbursement/disposal input and lifecycle/tax guards. It does not prove PostgreSQL rollback, concurrency, authorization or deployment behavior.

Required database acceptance: duplicate/concurrent posting; injected failure after each write; company boundary; fiscal locks; FIFO shortages and value conservation; approved request amount; scoped balanced disposal journal. Use an isolated company.

## Remaining sign-off work

Database-backed regression and production smoke; procurement partial-invoice allocation/tolerance and GRN-to-stock handoff; actual tax timing; LPJ settlement/refund journals; inventory traceability/reservations/adjustments; manufacturing output/labor/overhead accounting; complete child immutability across resource aliases; quality disposition; asset multi-book/concurrency testing.
