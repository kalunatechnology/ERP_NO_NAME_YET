# MIGRATION AUDIT & PARITY MATRIX
## Django REST Framework -> Node.js / Express.js + TypeScript + Prisma

> **Date**: 2026-08-26  
> **Source**: `backend/` (Django 5.x / DRF / SimpleJWT)  
> **Target**: `backend-express/` (Node.js 20+ / Express / TypeScript / Prisma / PostgreSQL)  
> **Frontend Consumer**: `frontend-next/` (Next.js App Router / React)

---

## 1. EXECUTIVE SUMMARY & DISCOVERY SCOPE

A complete architectural inspection of the existing Django backend (`backend/`) and Next.js frontend (`frontend-next/`) was conducted.

### Key Metrics
- **Total Django Apps**: 19 apps (`accounts`, `core`, `api_common`, `master_data`, `crm`, `sales`, `projects`, `procurement`, `inventory`, `manufacturing`, `quality`, `finance`, `assets`, `service`, `analytics`, `logistics`, `implementation`, `reporting`, `workflows`).
- **Total Database Models**: 249 models across PostgreSQL/SQLite schemas.
- **Total Registered REST Resources**: 214 ViewSet resources + 60+ Transactional/Command endpoints + 3 Workflow Engine endpoints + Auth/Core direct endpoints.
- **Total Frontend Active Endpoints**: 83 unique API endpoints integrated in `frontend-next/`.

---

## 2. MODULE INVENTORY

| App / Module | Model Count | Resource Endpoints | Key Business Logic & Services |
| :--- | :--- | :--- | :--- |
| **Accounts & IAM** | 12 | `/api/v1/accounts/*`, `/api/v1/auth/*` | User auth, RBAC, Role assignments, JWT claims, Password hashing |
| **Core & Common** | 22 | `/api/v1/core/*`, `/api/v1/sidebar-feed/*`, `/api/v1/recent-items/*` | Tenancy, Company hierarchy, Document numbers, Audit events, Feed aggregation |
| **Master Data** | 20 | `/api/v1/master-data/*` | Parties, Customer/Supplier profiles, Products, Currencies, Warehouses |
| **CRM & Commercial** | 28 | `/api/v1/crm/*` | Inquiry qualification, Cost estimation, Deals won, Credit snapshot, Executive approvals |
| **Sales** | 13 | `/api/v1/sales/*` | Quotation workflow, Order confirmation, Delivery dispatch, Project conversion |
| **Projects & WBS** | 43 | `/api/v1/projects/*` | EVM engine (CV, SV, CPI, SPI), WBS Rollup (Daily -> Weekly -> Main -> Project), Stage gates, Task transfers |
| **Procurement** | 9 | `/api/v1/procurement/*` | PR -> RFQ -> Supplier Quote -> PO -> Goods Receipt -> 3-Way Match |
| **Inventory** | 10 | `/api/v1/inventory/*` | Stock moves, Stock reservations, Stock counting adjustments, Valuation |
| **Manufacturing** | 13 | `/api/v1/manufacturing/*` | BOM versions, Routings, Production orders, Work orders, Labor/Machine logs, Scraps |
| **Quality** | 6 | `/api/v1/quality/*` | Quality inspection plans, Nonconformances, Corrective actions |
| **Finance & Accounting** | 37 | `/api/v1/finance/*` | Double-entry journals, Chart of accounts, Billing documents & proposals, Payments, Bank reconciliations, Project WIP & Funding |
| **Assets** | 6 | `/api/v1/assets/*` | Asset lifecycle, Depreciation schedules, Maintenance tracking, Disposals |
| **Service** | 4 | `/api/v1/service/*` | Service cases, Approvals, Case messaging, Resolutions |
| **Logistics** | 4 | `/api/v1/logistics/*` | Shipments, Shipping lines, Tracking events, Proof of delivery |
| **Analytics & Alerts** | 8 | `/api/v1/analytics/*` | KPI recalculations, Metric alerts, Anomaly detection |
| **Implementation** | 8 | `/api/v1/implementation/*` | Implementation milestones, Deployments, Cutover plans, Handover logs |
| **Reporting** | 4 | `/api/v1/reporting/*` | Finance dashboard aggregation, Project portfolio performance, CRM sales dashboards |
| **Workflows** | 2 | `/api/v1/commands/workflow/*` | Pluggable tenant workflow engine (Arsalynk & Default state machines) |

---

## 3. DATABASE MODEL TO PRISMA MAPPING MATRIX

All 249 models map to PostgreSQL tables via Prisma. Models use UUID primary keys (`id UUID @id @default(uuid())`), multi-tenant scoping (`tenant_id`, `company_id`), timestamps (`created_at`, `updated_at`), and user audit tracking (`created_by_id`, `updated_by_id`).

### Core & IAM Models
- `User` (`accounts_user`), `Role` (`accounts_role`), `UserRole` (`accounts_userrole`), `Permission` (`accounts_permission`), `RolePermission` (`accounts_rolepermission`), `DataScopeRule` (`accounts_datascoperule`), `ApprovalLimit` (`accounts_approvallimit`)
- `Tenant` (`core_tenant`), `Company` (`core_company`), `OrganizationUnit` (`core_organizationunit`), `Document` (`core_document`), `DocumentHistory` (`core_documenthistory`), `AuditEvent` (`core_auditevent`), `UserRecentItem` (`core_userrecentitem`), `RightSidebarFeed` (`core_rightsidebarfeed`)

### Master Data Models
- `Party`, `PartyRole`, `Contact`, `Address`, `CustomerProfile`, `SupplierProfile`, `ProductCategory`, `UOM`, `Product`, `Currency`, `ExchangeRate`, `PaymentTerm`, `TaxCode`, `CostCenter`, `Department`, `Employee`, `Warehouse`, `WarehouseLocation`, `WorkCenter`, `Machine`

### CRM & Sales Models
- `CustomerInquiry`, `InquiryRequirement`, `CostEstimate`, `CostEstimateLine`, `Opportunity`, `DealWorkflow`, `CreditStatusSnapshot`, `ExecutiveApproval`, `QuotationDelivery`, `Feedback`
- `Quotation`, `QuotationLine`, `QuotationCost`, `Contract`, `ContractLine`, `Order`, `OrderLine`, `Delivery`, `DeliveryLine`, `DemandSupplyLink`, `OrderChangeRequest`, `RecurringOrderRule`, `RecurringOrderRun`

### Projects & WBS Models
- `Project`, `ProjectControlItem`, `ProjectExpense`, `ProjectLifecycleEvent`, `ProjectReadinessCheck`, `Member`, `Task`, `TaskDependency`, `Milestone`, `MaterialRequirement`, `BudgetLine`, `Timesheet`, `ChangeRequest`, `ChangeRequestMaterial`, `Board`, `BoardColumn`, `TaskBoardPosition`, `HealthRule`, `HealthSnapshot`, `Risk`, `Issue`, `IssueAction`, `ProjectDispatch`, `TechnicalBrief`, `TechnicalBriefVersion`, `Requirement`, `AcceptanceCriteria`, `ResourceRequest`, `ResourceAllocation`, `ProgressSnapshot`, `ProjectWeeklyProgress`, `EquipmentUsage`, `WeightIndicator`, `WeightComponent`, `ProjectMainTask`, `TaskAssignment`, `ProjectWeeklyTask`, `ProjectDailyTask`, `TaskTransferRequest`, `TaskActivityLog`

### Finance Models
- `AccountCategory`, `Account`, `FiscalYear`, `FiscalPeriod`, `JournalEntry`, `JournalLine`, `BillingDocument`, `BillingDocumentLine`, `BillingProposal`, `Payment`, `PaymentLine`, `PaymentBatch`, `BankAccount`, `BankStatement`, `BankStatementLine`, `TaxTransaction`, `Budget`, `BudgetLine`, `ProjectCostEntry`, `ProjectFunding`, `CreditFacility`, `RecurringPaymentRule`, `OverheadRule`

### Procurement, Inventory, Manufacturing, Quality, Logistics, Assets, Service
- `PurchaseRequisition`, `PurchaseRequisitionLine`, `RFQ`, `SupplierQuotation`, `PurchaseOrder`, `PurchaseOrderLine`, `GoodsReceipt`, `GoodsReceiptLine`, `ThreeWayMatch`
- `StockMovement`, `StockReservation`, `StockLedger`, `StockBalance`, `StockCount`, `StockCountLine`, `ValuationLayer`, `ReorderRule`
- `BOM`, `BOMVersion`, `BOMLine`, `Routing`, `RoutingOperation`, `ProductionOrder`, `ProductionMaterial`, `WorkOrder`, `LaborLog`, `MachineLog`, `ProductionOutput`, `Scrap`, `CostLedgerEntry`
- `QualityPlan`, `QualityPlanPoint`, `Inspection`, `InspectionResult`, `Nonconformance`, `CorrectiveAction`
- `Shipment`, `ShipmentLine`, `TrackingEvent`, `ProofOfDelivery`
- `Asset`, `AssetCategory`, `DepreciationSchedule`, `MaintenanceRecord`, `AssetTransfer`, `AssetDisposal`
- `Case`, `CaseMessage`, `CaseApproval`, `Resolution`

---

## 4. BUSINESS LOGIC & CALCULATION ENGINES

### 4.1. EVM (Earned Value Management) Engine
- **Planned Value (PV)**: Baseline budget scheduled to date.
- **Earned Value (EV)**: `BAC * (Physical % Complete / 100)`.
- **Actual Cost (AC)**: Total realized expenditures (`ProjectCostEntry` + `ProjectExpense`).
- **Cost Variance (CV)**: `CV = EV - AC`
- **Schedule Variance (SV)**: `SV = EV - PV`
- **Cost Performance Index (CPI)**:
  $$\text{CPI} = \begin{cases} \frac{\text{EV}}{\text{AC}} & \text{if } \text{AC} > 0 \\ 1.0 & \text{if } \text{AC} = 0 \land \text{EV} = 0 \\ 999.0 & \text{if } \text{AC} = 0 \land \text{EV} > 0 \end{cases}$$
- **Schedule Performance Index (SPI)**:
  $$\text{SPI} = \begin{cases} \frac{\text{EV}}{\text{PV}} & \text{if } \text{PV} > 0 \\ 1.0 & \text{if } \text{PV} = 0 \land \text{EV} = 0 \\ 999.0 & \text{if } \text{PV} = 0 \land \text{EV} > 0 \end{cases}$$

### 4.2. WBS Rollup Architecture
- **Daily Task**: Progress updated by assigned team member ($0-100\%$).
- **Weekly Task**: Weighted average or direct rollup:
  $$\text{Weekly Progress} = \frac{\sum (\text{Daily Progress} \times \text{Daily Weight})}{\sum \text{Daily Weight}}$$
- **Main Task**: Aggregation of Weekly Tasks.
- **Project Progress**: Cumulative aggregation of Main Tasks weighted by task budget / weight points.

### 4.3. Double-Entry Accounting Invariant
- Every posted `JournalEntry` must satisfy:
  $$\sum \text{Debit} = \sum \text{Credit}$$
- Handled atomically inside `prisma.$transaction(...)`.
- State transitions: `DRAFT` $\to$ `VERIFIED` $\to$ `POSTED` (or `REVERSED`).

### 4.4. Procurement 3-Way Matching
- Validates:
  $$\text{PO Quantity} \approx \text{Goods Receipt Quantity} \approx \text{Vendor Invoice Quantity}$$
  with configurable tolerance percentage (default: 0-2% tolerance).

### 4.5. CRM & Commercial Workflow
- `CustomerInquiry` $\to$ `CostEstimate` (Direct Cost + Overhead + Margin Markup) $\to$ `Quotation` $\to$ Approval $\to$ Customer Decision $\to$ `SalesOrder` $\to$ `Project` Auto-Initialization.

---

## 5. FRONTEND COMPATIBILITY MATRIX

| Endpoint URI | Frontend Component / Page | Compatibility Strategy |
| :--- | :--- | :--- |
| `POST /api/v1/auth/token/` | `auth.service.ts` / Login | Express route returning `{ access, refresh, user }` |
| `GET /api/v1/auth/me/` | Header / AuthProvider | Express route returning serialized user profile & roles |
| `GET /api/v1/core/sidebar-feed/` | `RightSidebar.tsx` | Express view aggregating notifications, activities, contacts |
| `POST /api/v1/core/sidebar-feed/mark-read/`| `RightSidebar.tsx` | Express action marking notifications as read |
| `GET /api/v1/projects/projects/` | Projects List View | Paginated DRF envelope `{ count, next, previous, results }` |
| `GET /api/v1/projects/projects/:id/` | Project Detail View | Complete project object with relations |
| `POST /api/v1/projects/projects/:id/recalculate_health/` | Project EVM & Health | Computes EVM & health status |
| `POST /api/v1/projects/projects/:id/advance-stage/` | Stage Gates | Advances project lifecycle stage |
| `POST /api/v1/commands/sales/quotations/:id/convert-to-order/` | Commercial Deal Won | Converts accepted quotation to order & project |
| `POST /api/v1/finance/billing-proposals/` | Billing proposals | Creates billing proposals linked to project milestones |
| `POST /api/v1/finance/project-fundings/:id/decide/` | Project funding approval | Approves or rejects project funding requests |

---

## 6. TARGET EXPRESS ARCHITECTURE & NEXT STEPS

1. **Phase 1**: Initialize `backend-express/` with TypeScript, Express, Prisma, environment configuration, error handling, and response compatibility layer.
2. **Phase 2**: Create complete `prisma/schema.prisma` covering all 249 models.
3. **Phase 3**: Core middleware (JWT Auth, RBAC, Tenancy Scoping, Validation, Exception mapping).
4. **Phase 4**: Implement modular architecture for all 19 domain modules.
5. **Phase 5**: Business logic parity (EVM, WBS, Accounting, Workflows).
6. **Phase 6**: Comprehensive Seeder in `prisma/seed.ts`.
7. **Phase 7**: End-to-end verification and compile check.
