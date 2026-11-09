# Budgetary Control

Budgetary Control separates approved planning, open commitments, and recognized expense. Cash disbursement is not treated as an expense.

## Balance definitions

- **Allocated** = the approved allocation amount plus posted budget revisions and transfers.
- **Committed** = open reservations created for approved Requests, purchase orders, or other controlled sources.
- **Actual** = expense journal lines posted to the General Ledger and matched to an active Budget Plan allocation.
- **Available** = `Allocated - Committed - Actual`.

When a posted expense journal references the same source document as a reservation, the matched amount is released from committed and recognized as actual in the same database transaction. Any remaining reservation stays committed. Reversing the journal creates an immutable negative actual ledger entry. Payment and Project Funding do not add actual a second time.

## Budget Plan lifecycle

1. Finance creates a draft with a fiscal year, control policy, period mode, and one or more allocations.
2. Each allocation requires an active expense account and cost center. Project and department are optional dimensions.
3. Period controlled allocations must allocate exactly their full total across the fiscal periods in the selected fiscal year. Carry forward can be enabled per plan.
4. A different Finance user submits the plan. A Finance user or Director approves it; the creator and submitter cannot approve their own plan.
5. Approval activates the plan and records a baseline ledger entry. Overlapping active account/cost center/project/department dimensions in the same fiscal year are rejected.
6. To replace a plan, Finance closes it with a reason. Open or pending commitments must be resolved first.

## Control policies

- `HARD_STOP`: reject a reservation or expense posting that would exceed available funds.
- `SOFT_WARNING`: allow an over-budget reservation and show the negative available balance.
- `APPROVAL_ESCALATION`: an over-budget reservation remains pending until a different Finance user or Director approves it.

The plan defaults to `HARD_STOP`. Policies are saved with the plan and do not depend on a hard-coded company setting.

## Changes and commitments

- **Reservation** writes a positive committed ledger movement. A source document and allocation are required. Purchase Order sources must be `APPROVED`; Request sources must exist and not be drafts/cancelled/rejected; supplier invoice sources must exist and not be drafts/rejected/cancelled. Active duplicate reservations for the same source line and allocation are rejected.
- **Release** writes a negative committed movement; partial releases are supported.
- **Accrual recognition** releases the matched commitment and adds actual together. It can also be recorded manually when no linked expense journal exists.
- **Revision** increases or decreases allocated budget through an approval workflow. A decrease cannot reduce allocated below committed plus actual.
- **Transfer** moves allocated budget between two allocations in the same active plan. Total plan allocation is unchanged. Cross-period transfers are blocked for period controlled allocations; submit a period-specific revision instead.
- **Ledger** entries cannot be edited or deleted through the Finance API. Corrections use reversal movements.

## General Ledger matching

On journal posting, only accounts with `account_type = EXPENSE` are considered. A match requires the same account and cost center. Project and department specific allocations take precedence over their broader optional-dimension allocations. Period controlled allocations match the journal's fiscal period. An expense line missing its required cost center is rejected when a Budget Plan controls that account. Historical journal lines posted before a Budget Plan was activated are not backfilled into its ledger.

If the journal's `source_document_id` matches the reservation's `source_id`, the matching reservation is consumed up to the actual expense amount. For supplier invoices linked to a PO, the linked PO reservation is also consumed. Remaining commitment stays open. Expense postings above the cap fail for `HARD_STOP` and `APPROVAL_ESCALATION`; `SOFT_WARNING` records the overrun.

Project Funding is intentionally excluded from Actual. Funding/disbursement represents cash movement or an advance; expense actual is recognized when its supporting accrual journal is posted.

## Finance API

- `GET /api/v1/finance/budgeting/options`
- `GET /api/v1/finance/budgeting/dashboard?fiscal_year_id=...`
- `GET /api/v1/finance/budgeting/workflow`
- `GET /api/v1/finance/budgeting/ledger?allocation_id=...`
- `GET /api/v1/finance/budgeting/reservations`
- `GET|POST /api/v1/finance/budgets`
- `POST /api/v1/finance/budgets/:id/submit|approve|reject|close`
- `POST /api/v1/finance/budget-reservations`
- `POST /api/v1/finance/budget-reservations/:id/approve|reject|release|recognize`
- `POST /api/v1/finance/budget-revisions` and `POST /api/v1/finance/budget-revisions/:id/approve|reject`
- `POST /api/v1/finance/budget-transfers` and `POST /api/v1/finance/budget-transfers/:id/approve|reject`

Budget writes require Finance privileges; approvals allow Finance or Director and enforce maker/checker at the service boundary. All reads and writes are scoped to the active company.

## Deployment

The schema change is in `backend-express/prisma/migrations/20261109100000_budgetary_control_foundation`. Apply the migration through the established database deployment process before enabling the new UI in an environment. The frontend build does not run this migration.
