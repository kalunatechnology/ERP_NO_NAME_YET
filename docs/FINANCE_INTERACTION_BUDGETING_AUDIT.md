# Finance interaction and budgeting audit

Audit scope: the active production path documented by `README.md` (`frontend-next/` + `backend-express/`), inspected against the attached Finance enhancement request. This is a source-code audit; no live tenant data or production database was queried.

## Findings before changes

### Interaction and duplicate requests

- Finance mutations run through the shared Axios adapter in `frontend-next/lib/api/axios.ts`. For every POST/PUT/PATCH/DELETE it generates a fresh `Idempotency-Key` when the caller did not provide one.
- Express mounts `enforceTransactionIdempotency` for finance mutation routes in `backend-express/src/middlewares/idempotency.middleware.ts`. It validates the key, records a body hash, rejects reuse with a different body, and replays completed responses. This is useful transport-level protection, but two rapid frontend clicks receive two different keys and therefore are two distinct operations to the middleware.
- FinanceClient already had local loading state for some paths (bank import, receipt lifecycle, proposal posting), but lifecycle actions, cost validation/posting, journal reversal, document verification, payment actions, and inline billing actions did not consistently disable their buttons or expose a pending label. Other forms and finance workspaces also use inconsistent local `busy` state.
- The idempotency record and business mutation are not written in a shared database transaction by the middleware. A failed response is stored as FAILED and a repeated request with that same key is rejected; a new click creates a new key. Therefore UI request locking is needed, and retry after an uncertain network response must be treated as “status not confirmed” rather than success.

Mutation paths with direct financial side effects identified in the inspected Finance client/routes include `/api/v1/finance/customer-receipts`, `/api/v1/finance/payments/*/execute`, `/api/v1/finance/billing-documents/*/{post,create-payment,approve}`, `/api/v1/finance/project-fundings/*/{draw,decide}`, `/api/v1/finance/project-cost-entries/*/post-to-wip`, `/api/v1/finance/bank-statement-lines/*/reconcile`, `/api/v1/finance/journal-entries/*/reverse`, and the `/api/v1/finance/budget-*` reservation/approval/revision/transfer routes. These are under the middleware's finance mutation root; action-specific business validation and permission checks remain in the route/service layer.

### Budgeting, database, and transaction flow

- `fin_budget` stores the plan type, period mode, approval lifecycle, and control policy. `fin_budget_line` stores independent nullable `project_id` and `cost_center_id` dimensions; the physical schema already allows a missing project and cost center, so no migration is needed for the requested relationship.
- `BudgetingWorkspace.tsx` already separates project-linked allocations from company allocations and reports allocated, committed, actual, available, and utilization. The available formula is `allocated - committed - actual`.
- `BudgetingService.createPlan` required both a project (via the UI in Project scope) and a cost center for every allocation. That prevented Project Budget allocations without a Cost Center, even though the data model permits it; it also did not enforce the Project Budget project requirement at the API boundary.
- Budget commitments and actual recognition/release are recorded in append-only `fin_budget_ledger`; reservations link budget allocations to source requests, POs, and invoices. Actual recognition reduces committed and increases actual in the same ledger entry. `createReservation` locks the allocation row and checks available balance. `releaseReservation` did not lock its reservation row, leaving concurrent requests a chance to read the same remaining amount.
- Approval lifecycle and permission enforcement are in Finance routes/services; the UI changes below do not bypass those checks. The wider project-cost, AP/AR, cash-bank and GL posting paths remain governed by their respective server handlers and ledger/journal code.

## Changes made

- Added `useAsyncAction`, which synchronously locks an action key before starting its async callback and publishes pending keys for accessible loading labels/disabled buttons.
- Applied it to principal Finance actions: project cost entry, funding request, AP invoice, customer receipt, bank statement import/reconciliation, project-cost validation/WIP posting, journal reversal, billing proposal/document lifecycle, vendor payment execution, receipt posting/deletion, invoice verification, and billing-document submit/approve/post. The Finance page displays a blocking progress overlay while these mutations run; submit/action buttons show pending labels and disable while pending.
- Applied the same lock to Budgeting create/edit/delete, submit, approval/rejection, reservation, revision, transfer, close, and settle operations. Budgeting presents a process notice and locks action buttons while a mutation is pending.
- Updated Budgeting validation so a Project Budget requires a project at both the UI and service boundary, while a Cost Center remains optional for Project Budget. Operational and Capital plans still require a Cost Center; the project field is optional for non-Project plans. Journal actual matching now consumes a project-only allocation when its Cost Center is intentionally blank, and still requires a Cost Center when the matching budget is specifically cost-center scoped. Existing database columns already support these nullability rules.
- Added a row-level reservation lock in `releaseReservation` so concurrent release/recognition operations recalculate from the latest reservation state before appending a ledger entry.

## Verification and limits

## Payroll budget matching and button UX follow-up

- Payroll posting previously required a Budget Plan row with `department_id = null`, even when account 6100 and the payroll Cost Center matched. The Budgeting form can set a department when its code matches the Cost Center, so this predicate incorrectly rejected valid allocations. Posting now compares the employee department when recorded; for legacy employee rows without one, it follows the same unique code mapping used by the Budgeting form. It validates the payroll fiscal period allocation as well and reports the uncovered Cost Center names.
- Payroll expense journal lines now carry the resolved department dimension so `recordJournalActuals` records actual cost against the same budget allocation that passed the preflight check.
- Added common cursor, hover, press, and keyboard-focus feedback for native buttons and elements with `role="button"`; disabled controls use a disabled cursor and reduced-motion preferences are respected. Payroll also displays a blocking process indicator during mutation and explains that an APPROVED run must be posted to GL before payment is available.

- Frontend TypeScript validation passed with `frontend-next/node_modules/.bin/tsc.cmd --noEmit` after the final frontend edits.
- Prisma validation passed with `backend-express/node_modules/.bin/prisma.cmd validate`. No schema migration was introduced because `fin_budget_line.project_id` and `cost_center_id` are already nullable.
- Backend TypeScript validation was attempted with `backend-express/node_modules/.bin/tsc.cmd --noEmit` but the local dependency installation is missing `bcryptjs`, causing TS2307 in the existing `src/utils/password.ts`. No live database migration or runtime transaction test was run.
- The interaction utility is integrated into FinanceClient's high-impact transaction paths and Budgeting workspace. Synchronous action locks were also added to COA management, payroll mutations, recurring expense rule/generation actions, and period closing/rollback actions. This audit does not claim that every asynchronous button in every dynamically loaded Finance subworkspace has been converted yet; remaining candidates include fixed assets, tax status actions, and reports. They require the same wrapper/disabled-label treatment before the request's “all buttons” acceptance criterion is complete.
- No double-click browser test or connected-database acceptance test was run in this source-only workspace. Backend request idempotency, Finance route permissions, budget control policy, cash movement, and GL lifecycle require runtime regression checks against a configured test database.
