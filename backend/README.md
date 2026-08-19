# ERP Backend — Technical Documentation

> **Version**: 1.0.0 &bull; **Updated**: 18 Agustus 2026
> **Framework**: Django 5.x &bull; **API**: Django REST Framework 3.16
> **Database**: PostgreSQL (Supabase) &bull; **Auth**: JWT (SimpleJWT)
> **API Docs**: Scalar (OpenAPI 3.0)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Technology Stack](#2-technology-stack)
3. [System Architecture](#3-system-architecture)
4. [Backend Directory Structure](#4-backend-directory-structure)
5. [Folder & File Responsibilities](#5-folder--file-responsibilities)
6. [Application Entry Point](#6-application-entry-point)
7. [Configuration](#7-configuration)
8. [Database Architecture](#8-database-architecture)
9. [Data Models](#9-data-models)
10. [Database Relationships](#10-database-relationships)
11. [Authentication](#11-authentication)
12. [Authorization](#12-authorization)
13. [API Architecture](#13-api-architecture)
14. [API Endpoints](#14-api-endpoints)
15. [API Request Flow](#15-api-request-flow)
16. [Module Documentation](#16-module-documentation)
17. [Module Data Flow](#17-module-data-flow)
18. [Service Layer](#18-service-layer)
19. [Validation / Schema](#19-validation--schema)
20. [Error Handling](#20-error-handling)
21. [Middleware](#21-middleware)
22. [Audit Trail](#22-audit-trail)
23. [Utilities / Helpers](#23-utilities--helpers)
24. [Database Migration](#24-database-migration)
25. [Scalar API Documentation](#25-scalar-api-documentation)
26. [Testing](#26-testing)
27. [Environment Configuration](#27-environment-configuration)
28. [Local Development](#28-local-development)
29. [Seed Data](#29-seed-data)
30. [Production Deployment](#30-production-deployment)
31. [Troubleshooting](#31-troubleshooting)
32. [Complete Backend Flow](#32-complete-backend-flow)
33. [File Dependency Map](#33-file-dependency-map)
34. [Database Dependency Map](#34-database-dependency-map)
35. [Complete Data Flow Diagram](#35-complete-data-flow-diagram)

---

## 1. Overview

Backend ERP ini adalah sistem **Enterprise Resource Planning** multi-tenant yang mengelola seluruh siklus bisnis perusahaan, mulai dari **Customer Relationship Management (CRM)**, **Sales**, **Project Management**, **Procurement**, **Inventory**, **Manufacturing**, **Quality Control**, **Finance & Accounting**, **Asset Management**, **Service/Helpdesk**, **Analytics/Dashboard**, **Logistics**, hingga **Implementation Roadmap**.

Backend menyediakan **RESTful JSON API** yang dikonsumsi oleh frontend (SPA atau prototype). Seluruh endpoint dilindungi oleh **JWT authentication** dan **role-based access control (RBAC)** dengan multi-tenancy isolation.

---

## 2. Technology Stack

| Layer | Technology | Version | Keterangan |
|---|---|---|---|
| **Language** | Python | 3.12+ | Runtime |
| **Framework** | Django | 5.1–5.2 | Web framework |
| **API** | Django REST Framework | 3.15–3.16 | RESTful API toolkit |
| **Authentication** | djangorestframework-simplejwt | 5.3+ | JWT access & refresh tokens |
| **Database** | PostgreSQL | 16+ | Via Supabase cloud |
| **DB URL Parser** | dj-database-url | 2.2+ | Parse `DATABASE_URL` env var |
| **DB Driver** | psycopg[binary] | 3.2+ | PostgreSQL adapter |
| **OpenAPI** | drf-spectacular | 0.27+ | Auto-generate OpenAPI 3.0 schema |
| **API Docs UI** | django-scalar | 0.2+ | Interactive API documentation (Scalar) |
| **Filtering** | django-filter | 24.3+ | QuerySet filtering |
| **CORS** | django-cors-headers | 4.4+ | Cross-Origin Resource Sharing |
| **Env** | python-dotenv | 1.x | Load `.env` file |
| **WSGI** | Gunicorn | 23.x | Production WSGI server |
| **ASGI** | Uvicorn | 0.30+ | Production ASGI server |

---

## 3. System Architecture

```mermaid
graph TB
    subgraph Client
        FE[Frontend / Prototype]
        PM[Postman / Scalar Try-It]
    end

    subgraph "Django Backend"
        MW[Middleware Stack]
        AUTH[JWT Authentication]
        PERM[RBAC Authorization]
        SCOPE[Multi-Tenant Scoping]
        ROUTER[URL Router]

        subgraph "Application Layer"
            VS[ViewSets / Views]
            SER[Serializers]
            SVC[Workflow Services]
            CMD[Commands]
        end

        subgraph "Data Layer"
            MDL[Django ORM Models]
            AUDIT[Audit Trail]
        end
    end

    subgraph "External"
        DB[(PostgreSQL / Supabase)]
    end

    FE -->|HTTP + JWT| MW
    PM -->|HTTP + JWT| MW
    MW --> AUTH
    AUTH --> PERM
    PERM --> SCOPE
    SCOPE --> ROUTER
    ROUTER --> VS
    VS --> SER
    VS --> SVC
    VS --> CMD
    SER --> MDL
    SVC --> MDL
    CMD --> MDL
    MDL --> DB
    VS --> AUDIT
    AUDIT --> DB
```

---

## 4. Backend Directory Structure

```text
backend/
├── manage.py                          # Django management CLI entry point
├── requirements.txt                   # Python dependencies
├── .env                               # Environment variables (gitignored)
├── .env.example                       # Environment template
├── .gitignore                         # Git ignore rules
│
├── config/                            # Project-level configuration
│   ├── __init__.py
│   ├── settings/
│   │   ├── __init__.py                # Imports base settings
│   │   └── base.py                    # All Django/DRF/JWT/CORS/Spectacular settings
│   ├── urls.py                        # Root URL routing (admin, schema, scalar, api/v1/)
│   ├── api_urls.py                    # Central API router — includes all module URLs
│   ├── command_urls.py                # Operational command endpoints (submit, approve, etc.)
│   ├── commands.py                    # 3,174-line command views (business operations)
│   ├── health.py                      # GET /health/ — API & database health check
│   ├── wsgi.py                        # WSGI application entry
│   └── asgi.py                        # ASGI application entry
│
├── apps/                              # All Django applications
│   ├── __init__.py
│   ├── api_common/                    # Shared API infrastructure
│   │   ├── permissions.py             # ERPAccessPermission, IsReadOnlyOrERPAccess
│   │   ├── viewsets.py                # BaseERPModelViewSet, ReadOnlyERPModelViewSet
│   │   ├── serializers.py             # ERPModelSerializer (tenant/company validation)
│   │   ├── filters.py                 # ERPQueryFilterBackend (dynamic field filtering)
│   │   ├── pagination.py              # ERPPageNumberPagination (25 per page)
│   │   ├── scoping.py                 # Multi-tenant query scoping (find_scope_path, scope_queryset)
│   │   ├── audit.py                   # Audit trail (create_audit_event, snapshot)
│   │   ├── exceptions.py              # Standardized error envelope (erp_exception_handler)
│   │   └── tests/
│   │       ├── test_api_coverage.py   # API endpoint coverage test
│   │       └── test_scoping.py        # Scoping unit tests
│   │
│   ├── accounts/                      # IAM — Users, Roles, Permissions
│   │   ├── models.py                  # User, Role, Permission, UserRole, RoleHierarchy, etc.
│   │   ├── admin.py                   # Django admin registration
│   │   ├── api/
│   │   │   ├── auth.py                # Login, Logout, CurrentUser, ChangePassword views
│   │   │   ├── auth_urls.py           # /api/v1/auth/* routes
│   │   │   ├── serializers.py         # User/Role/Permission serializers
│   │   │   ├── viewsets.py            # CRUD viewsets for all IAM models
│   │   │   ├── urls.py                # /api/v1/accounts/* routes
│   │   │   └── user_seed.py           # POST /api/v1/dev/seed/users/ — dev user seeder
│   │   ├── management/                # Django management commands
│   │   └── migrations/                # Database migrations
│   │
│   ├── core/                          # Multi-tenancy, Documents, Workflows, Audit, Notifications
│   │   ├── models.py                  # Tenant, Company, Organization, BusinessDocument, etc.
│   │   ├── api/
│   │   │   ├── serializers.py
│   │   │   ├── viewsets.py
│   │   │   └── urls.py                # /api/v1/core/* routes
│   │   └── migrations/
│   │
│   ├── master_data/                   # Master data — Party, Product, Employee, Currency, etc.
│   │   ├── models.py
│   │   ├── api/
│   │   └── migrations/
│   │
│   ├── crm/                           # CRM — Leads, Opportunities, Inquiries, Estimates, Quotations
│   │   ├── models.py                  # 27 models (Lead, Opportunity, CustomerInquiry, etc.)
│   │   ├── workflow_services.py       # CRM business logic (qualify, estimate, quote, approve)
│   │   ├── api/
│   │   │   ├── serializers.py
│   │   │   ├── viewsets.py            # Includes workflow action endpoints
│   │   │   └── urls.py
│   │   ├── tests/
│   │   │   └── test_crm_end_to_end.py
│   │   └── migrations/
│   │
│   ├── sales/                         # Sales — Quotations, Contracts, Orders, Deliveries
│   │   ├── models.py
│   │   ├── api/
│   │   └── migrations/
│   │
│   ├── projects/                      # Project Management — Projects, Tasks, WBS, Kanban, etc.
│   │   ├── models.py                  # 34 models (Project, Task, Member, Timesheet, etc.)
│   │   ├── access.py                  # Role-based access guards (is_executive, can_manage_project)
│   │   ├── workflow_services.py       # Project business logic (start, close, reserve materials)
│   │   ├── api/
│   │   │   ├── serializers.py
│   │   │   ├── viewsets.py
│   │   │   └── urls.py
│   │   ├── tests/
│   │   │   ├── test_project_flow.py
│   │   │   ├── test_diagram_workflows.py
│   │   │   ├── test_funding_membership_permissions.py
│   │   │   └── test_project_workspace_api.py
│   │   └── migrations/
│   │
│   ├── procurement/                   # Procurement — PR, RFQ, PO, Goods Receipt, 3-Way Match
│   │   ├── models.py
│   │   ├── api/
│   │   └── migrations/
│   │
│   ├── inventory/                     # Inventory — Stock, Lots, Serials, Reservations, Counting
│   │   ├── models.py
│   │   ├── api/
│   │   └── migrations/
│   │
│   ├── manufacturing/                 # Manufacturing — BOM, Routing, Production, Work Orders
│   │   ├── models.py
│   │   ├── api/
│   │   └── migrations/
│   │
│   ├── quality/                       # Quality Control — Inspections, NC, Corrective Actions
│   │   ├── models.py
│   │   ├── api/
│   │   └── migrations/
│   │
│   ├── finance/                       # Finance — GL, AP/AR, Billing, Payments, Budget, WIP
│   │   ├── models.py                  # 36 models (Account, JournalEntry, Payment, etc.)
│   │   ├── workflow_services.py       # Finance business logic (cost collection, billing)
│   │   ├── api/
│   │   │   ├── serializers.py
│   │   │   ├── viewsets.py
│   │   │   └── urls.py
│   │   ├── tests/
│   │   │   ├── test_payment_workflow.py
│   │   │   ├── test_extended_finance_flows.py
│   │   │   └── test_project_accounting_flow.py
│   │   └── migrations/
│   │
│   ├── assets/                        # Asset Management — Fixed Assets, Depreciation, Disposal
│   │   ├── models.py
│   │   ├── api/
│   │   └── migrations/
│   │
│   ├── service/                       # Service/Helpdesk — Cases, Messages, Resolutions
│   │   ├── models.py
│   │   ├── api/
│   │   └── migrations/
│   │
│   ├── analytics/                     # Analytics — Dashboards, KPIs, Alerts
│   │   ├── models.py
│   │   ├── api/
│   │   └── migrations/
│   │
│   ├── logistics/                     # Logistics — Shipments, Tracking, Proof of Delivery
│   │   ├── models.py
│   │   ├── api/
│   │   └── migrations/
│   │
│   ├── implementation/                # Implementation Roadmap — Releases, Phases, GTM
│   │   ├── models.py
│   │   ├── api/
│   │   └── migrations/
│   │
│   └── reporting/                     # Reporting — Database Views (read-only dashboards)
│       ├── models.py                  # Managed=False views (finance, project, CRM dashboards)
│       ├── api/
│       └── migrations/
│
├── tools/                             # Development utilities
│   ├── fixing.py                      # OpenAPI BudgetLine component name patch
│   └── seeders/                       # Database seed scripts
│       ├── seeder_common.py           # Shared seeder infrastructure (33 KB)
│       ├── seed_tenant.py             # Seed tenants & companies
│       ├── seed_iam_core.py           # Seed users, roles, permissions
│       ├── seed_master_data.py        # Seed products, customers, suppliers
│       ├── seed_crm_sales.py          # Seed CRM & sales data
│       ├── seed_procurement_inventory.py
│       ├── seed_project_manufacturing.py
│       ├── seed_finance_assets.py
│       ├── run_all_seeders.py         # Run all seeders in order
│       ├── run_all_seeders.ps1        # PowerShell wrapper
│       └── seeding_state.json         # Seeder state (cross-references)
│
├── docs/
│   └── openapi-schema.yml             # Exported OpenAPI 3.0 schema (2.3 MB)
│
└── venv/                              # Python virtual environment (gitignored)
```

---

## 5. Folder & File Responsibilities

### `config/` — Project Configuration

| File | Tanggung Jawab |
|---|---|
| `settings/base.py` | Seluruh konfigurasi Django, DRF, JWT, CORS, drf-spectacular, database, logging, timezone, middleware, INSTALLED_APPS. Membaca `.env` via `python-dotenv`. |
| `urls.py` | Root URL router. Menghubungkan `/admin/`, `/health/`, `/api/schema/`, `/api/docs/` (Scalar), `/api/v1/` (semua API). |
| `api_urls.py` | Central API URL router. Men-include seluruh modul API di bawah prefix `/api/v1/`. |
| `command_urls.py` | 74 endpoint operational command (submit, approve, reject, post, close, dll.). |
| `commands.py` | 3.174 baris command views. Setiap command adalah `GenericAPIView` dengan `@extend_schema` dan business logic di dalamnya. |
| `health.py` | `GET /health/` — mengecek koneksi database dengan `SELECT 1`. Mengembalikan `{status: "ok", database: "ok"}`. |
| `wsgi.py` | WSGI entry point untuk Gunicorn. |
| `asgi.py` | ASGI entry point untuk Uvicorn. |

### `apps/api_common/` — Shared API Infrastructure

| File | Tanggung Jawab |
|---|---|
| `permissions.py` | `ERPAccessPermission` — mengecek `is_superuser`, lalu `ERP_ENFORCE_IAM` flag, lalu lookup `RolePermission` di database. `IsReadOnlyOrERPAccess` — GET/HEAD/OPTIONS diizinkan untuk semua authenticated user, mutasi memerlukan permission. |
| `viewsets.py` | `BaseERPModelViewSet` — viewset base class dengan auto-scoping tenant/company, auto `select_related`, audit trail di perform_create/update/destroy, bulk-create/update/delete actions, dan metadata endpoint. `ReadOnlyERPModelViewSet` — versi read-only. |
| `serializers.py` | `ERPModelSerializer` — base serializer dengan field-level permission enforcement (`FieldPermission`), cross-tenant/company validation pada foreign key, dan system field auto-read-only. |
| `filters.py` | `ERPQueryFilterBackend` — dynamic query param filtering dengan support `exact`, `in`, `gte`, `lte`, `gt`, `lt`, `icontains`, `contains`, `istartswith`, `iendswith`, `isnull`, `range`. Validasi field path untuk keamanan. |
| `pagination.py` | `ERPPageNumberPagination` — 25 items per page, configurable via `?page_size=`, max 500. |
| `scoping.py` | `find_scope_path(model, target)` — mencari path FK terdekat ke `tenant` atau `company` secara rekursif. `scope_queryset(qs, user, company_id)` — memfilter queryset berdasarkan tenant user dan company yang dipilih (header `X-Company-ID`). |
| `audit.py` | `create_audit_event(request, instance, event_type, before, after)` — mencatat setiap CREATE/UPDATE/DELETE ke model `AuditEvent` dengan snapshot before/after. `snapshot(instance)` — mengambil snapshot JSON-safe dari model instance. |
| `exceptions.py` | `erp_exception_handler(exc, context)` — membungkus error DRF ke format `{success: false, status_code: N, errors: {...}}`. |

### `apps/accounts/` — Identity & Access Management

| File | Tanggung Jawab |
|---|---|
| `models.py` | 12 model IAM: `User` (custom AbstractBaseUser dengan email login), `Role`, `Permission`, `UserRole`, `RolePermission`, `RoleHierarchy`, `DataScopePolicy`, `RoleDataScope`, `FieldPermission`, `InformationShareRule`, `ApprovalLimit`, `UserProjectAccess`. |
| `api/auth.py` | 4 view: `ERPTokenObtainPairView` (login → JWT dengan embedded roles), `CurrentUserView` (GET /me/ → profil + roles), `LogoutView` (POST → blacklist refresh token), `ChangePasswordView` (POST → ubah password). |
| `api/auth_urls.py` | Routes: `/api/v1/auth/token/`, `/token/refresh/`, `/token/verify/`, `/me/`, `/logout/`, `/change-password/`. |
| `api/user_seed.py` | `SeedUsersView` — `POST /api/v1/dev/seed/users/` untuk membuat user dummy beserta UserRole. Hanya admin. |
| `api/serializers.py` | Serializer per model IAM. `UserSerializer` memproteksi field `is_staff`, `is_superuser`, `tenant` dari non-superuser. |
| `api/viewsets.py` | 12 CRUD viewsets, satu untuk setiap model IAM. |

### `apps/projects/` — Project Management

| File | Tanggung Jawab |
|---|---|
| `models.py` | 34 model: `Project`, `Task`, `Member`, `Milestone`, `Timesheet`, `ChangeRequest`, `Board`, `BoardColumn`, `TaskBoardPosition`, `HealthRule`, `HealthSnapshot`, `Risk`, `Issue`, `TechnicalBrief`, `Requirement`, `AcceptanceCriteria`, `ResourceRequest`, `ResourceAllocation`, `ProgressSnapshot`, `EquipmentUsage`, `WeightIndicator`, `WeightComponent`, dll. |
| `access.py` | 7 fungsi role guard: `role_codes(user)`, `is_executive(user)`, `is_project_management(user)`, `is_finance(user)`, `is_crm(user)`, `can_access_project(user, project)`, `can_manage_project(user, project)`. |
| `workflow_services.py` | Business logic: `ensure_shortage_procurement()`, `recalculate_progress()`, `build_project_health()`, `compute_project_costs()`, `approve_timesheet()`, dll. |

### `apps/crm/` — Customer Relationship Management

| File | Tanggung Jawab |
|---|---|
| `models.py` | 27 model: `Lead`, `Opportunity`, `CustomerInquiry`, `InquiryRequirement`, `CostEstimate`, `CostEstimateLine`, `QuotationVersion`, `QuotationDelivery`, `ExecutiveApproval`, `Pipeline`, `PipelineStage`, `Activity`, `ChannelAccount`, `Conversation`, `Message`, `Feedback`, `Survey`, dll. |
| `workflow_services.py` | Business logic: `qualify_inquiry()`, `create_cost_estimate()`, `calculate_margin()`, `create_quotation_version()`, `request_executive_approval()`, `decide_approval()`. |

### `apps/finance/` — Finance & Accounting

| File | Tanggung Jawab |
|---|---|
| `models.py` | 36 model: `FiscalYear`, `FiscalPeriod`, `Account` (CoA), `Journal`, `JournalEntry`, `JournalLine`, `BillingDocument`, `Payment`, `BankAccount`, `BankStatement`, `Budget`, `BudgetLine`, `CreditFacility`, `ProjectWIPSnapshot`, `ProjectFunding`, `CostBaseline`, `CostVariance`, `OverheadRule`, `ProjectCostEntry`, `BillingProposal`, `InvoiceVarianceCase`, dll. |
| `workflow_services.py` | Business logic: `ensure_account()`, `ensure_journal()`, `collect_project_operational_costs()`, `create_billing_proposal()`. |

---

## 6. Application Entry Point

### Development

```bash
python manage.py runserver 0.0.0.0:8000
```

`manage.py` menetapkan `DJANGO_SETTINGS_MODULE=config.settings` dan menjalankan Django development server.

### Production (WSGI)

```bash
gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers 4
```

### Production (ASGI)

```bash
uvicorn config.asgi:application --host 0.0.0.0 --port 8000 --workers 4
```

---

## 7. Configuration

Seluruh konfigurasi terpusat di `config/settings/base.py`. File ini membaca environment variables dari `.env` via `python-dotenv`.

### Environment Variables

| Variable | Default | Keterangan |
|---|---|---|
| `DEBUG` | `False` | Mode debug Django |
| `SECRET_KEY` | `unsafe-development-key-change-me` | Django secret key |
| `ALLOWED_HOSTS` | `127.0.0.1,localhost` | Hosts yang diizinkan |
| `CSRF_TRUSTED_ORIGINS` | (kosong) | CSRF trusted origins |
| `DATABASE_URL` | `sqlite:///db.sqlite3` | PostgreSQL connection string |
| `DB_CONN_MAX_AGE` | `0` (debug) / `60` (prod) | Connection pooling lifetime |
| `JWT_ACCESS_MINUTES` | `30` | Access token lifetime |
| `JWT_REFRESH_DAYS` | `7` | Refresh token lifetime |
| `CORS_ALLOWED_ORIGINS` | `http://127.0.0.1:5500,...` | CORS whitelist |
| `TIME_ZONE` | `Asia/Jakarta` | Server timezone |
| `ERP_ENFORCE_IAM` | `False` | Aktifkan IAM permission checking |
| `ERP_ENFORCE_FIELD_PERMISSIONS` | `False` | Aktifkan field-level permissions |
| `SESSION_COOKIE_SECURE` | `!DEBUG` | HTTPS-only session cookie |
| `CSRF_COOKIE_SECURE` | `!DEBUG` | HTTPS-only CSRF cookie |

### Custom Headers

| Header | Keterangan |
|---|---|
| `Authorization: Bearer <token>` | JWT access token |
| `X-Company-ID: <uuid>` | Memfilter data ke company tertentu |

---

## 8. Database Architecture

```mermaid
graph LR
    subgraph "PostgreSQL (Supabase)"
        T[core_tenant]
        C[core_company]
        O[core_organization]
        U[iam_user]
        R[iam_role]
    end

    T -->|1:N| C
    T -->|1:N| O
    T -->|1:N| U
    C -->|1:N| O
    U -->|M:N via iam_user_role| R
```

**Multi-tenancy**: Setiap record terkait ke `Tenant` (perusahaan induk) dan `Company` (entitas bisnis). Scoping otomatis memfilter data berdasarkan tenant user yang login.

**Database**: PostgreSQL via Supabase (`aws-0-ap-northeast-1.pooler.supabase.com`), dikonfigurasi melalui `DATABASE_URL` dengan SSL required.

**Connection**: `dj-database-url` mem-parse `DATABASE_URL`. `conn_max_age=0` di development (no pooling), `60` di production.

---

## 9. Data Models

Backend memiliki **160 model** yang tersebar di 18 modul. Berikut ringkasan per modul:

### Core (8 model)

| Model | Table | Fields | Keterangan |
|---|---|---|---|
| `Tenant` | `core_tenant` | 6 | Multi-tenancy root |
| `Company` | `core_company` | 8 | Entitas bisnis |
| `Organization` | `core_organization` | 8 | Divisi/departemen |
| `BusinessDocument` | `core_business_document` | 15 | Master dokumen bisnis |
| `DocumentLink` | `core_document_link` | 4 | Relasi antar dokumen |
| `WorkflowInstance` | `core_workflow_instance` | — | Status workflow |
| `WorkflowApproval` | `core_workflow_approval` | — | Approval chain |
| `AuditEvent` | `core_audit_event` | — | Audit log |
| `Notification` | `core_notification` | — | Notifikasi sistem |
| `NotificationRecipient` | `core_notification_recipient` | — | Penerima notifikasi |
| `QuickAction` | `core_quick_action` | — | Quick action shortcuts |
| `File` | `core_file` | — | File storage |
| `DocumentAttachment` | `core_document_attachment` | — | Lampiran dokumen |
| `DocumentTemplate` | `core_document_template` | — | Template surat/dokumen |
| `DocumentTemplateVersion` | `core_document_template_version` | — | Versi template |
| `DocumentTemplateField` | `core_document_template_field` | — | Field placeholder |
| `GeneratedDocument` | `core_generated_document` | — | Dokumen hasil generate |
| `DocumentSignature` | `core_document_signature` | — | Tanda tangan digital |

### Accounts / IAM (12 model)

| Model | Table | Fields | Keterangan |
|---|---|---|---|
| `User` | `iam_user` | 12 | Custom user (email-based login) |
| `Role` | `iam_role` | 5 | Peran pengguna |
| `Permission` | `iam_permission` | 5 | Hak akses atomik |
| `UserRole` | `iam_user_role` | 5 | Mapping user → role + company |
| `RolePermission` | `iam_role_permission` | 4 | Mapping role → permission |
| `RoleHierarchy` | `iam_role_hierarchy` | 5 | Hierarki warisan role |
| `DataScopePolicy` | `iam_data_scope_policy` | 7 | Kebijakan batasan data |
| `RoleDataScope` | `iam_role_data_scope` | 5 | Mapping role → scope policy |
| `FieldPermission` | `iam_field_permission` | 7 | Izin per-field per-role |
| `InformationShareRule` | `iam_information_share_rule` | 10 | Aturan berbagi data antar modul |
| `ApprovalLimit` | `iam_approval_limit` | 7 | Batas nominal approval |
| `UserProjectAccess` | `iam_user_project_access` | 7 | Mapping user → project access |

### Master Data (model utama)

`Party`, `Contact`, `CustomerProfile`, `SupplierProfile`, `Product`, `ProductCategory`, `Employee`, `Currency`, `ExchangeRate`, `UOM`, `Warehouse`, `WarehouseZone`, `Machine`.

### CRM (27 model)

`Lead`, `Opportunity`, `OpportunityProduct`, `Activity`, `Pipeline`, `PipelineStage`, `OpportunityStageHistory`, `ExecutiveApproval`, `CreditStatusSnapshot`, `ChannelAccount`, `Conversation`, `ConversationParticipant`, `Message`, `MessageAttachment`, `MessageDeliveryStatus`, `Feedback`, `Survey`, `SurveyQuestion`, `SurveyResponse`, `SurveyAnswer`, `CustomerInquiry`, `InquiryRequirement`, `CostEstimate`, `CostEstimateLine`, `QuotationVersion`, `QuotationDelivery`, `CRMWorkflowEvent`.

### Sales (13 model)

`Quotation`, `QuotationLine`, `QuotationCost`, `Contract`, `ContractLine`, `Order`, `OrderLine`, `Delivery`, `DeliveryLine`, `DemandSupplyLink`, `OrderChangeRequest`, `RecurringOrderRule`, `RecurringOrderRun`.

### Projects (34 model)

`Project`, `ProjectControlItem`, `ProjectExpense`, `ProjectLifecycleEvent`, `ProjectReadinessCheck`, `Member`, `Task`, `TaskDependency`, `Milestone`, `MaterialRequirement`, `BudgetLine`, `Timesheet`, `ChangeRequest`, `ChangeRequestMaterial`, `Board`, `BoardColumn`, `TaskBoardPosition`, `HealthRule`, `HealthSnapshot`, `Risk`, `Issue`, `IssueAction`, `ProjectDispatch`, `TechnicalBrief`, `TechnicalBriefVersion`, `Requirement`, `AcceptanceCriteria`, `ResourceRequest`, `ResourceRequestLine`, `ResourceAllocation`, `ProgressSnapshot`, `EquipmentUsage`, `WeightIndicator`, `WeightComponent`.

### Procurement (9 model)

`PurchaseRequisition`, `PurchaseRequisitionLine`, `RFQ`, `SupplierQuotation`, `PurchaseOrder`, `PurchaseOrderLine`, `GoodsReceipt`, `GoodsReceiptLine`, `ThreeWayMatch`.

### Inventory (10 model)

`Lot`, `SerialNumber`, `StockMove`, `StockMoveLine`, `StockReservation`, `StockLedgerEntry`, `StockBalance`, `ValuationLayer`, `StockCount`, `StockCountLine`.

### Manufacturing (12 model)

`BOM`, `BOMVersion`, `BOMLine`, `Routing`, `RoutingOperation`, `ProductionOrder`, `ProductionMaterial`, `WorkOrder`, `LaborLog`, `MachineLog`, `ProductionOutput`, `Scrap`, `CostLedgerEntry`.

### Quality (6 model)

`QualityPlan`, `QualityPlanPoint`, `Inspection`, `InspectionResult`, `Nonconformance`, `CorrectiveAction`.

### Finance (36 model)

`FiscalYear`, `FiscalPeriod`, `Account`, `Journal`, `JournalEntry`, `JournalLine`, `BillingDocument`, `BillingDocumentLine`, `ARAPSchedule`, `Payment`, `PaymentAllocation`, `BankAccount`, `BankStatement`, `BankStatementLine`, `BankReconciliation`, `TaxTransaction`, `Budget`, `BudgetLine`, `PeriodClosing`, `FinancialSnapshot`, `UnitCostSnapshot`, `RecurringPaymentRule`, `RecurringPaymentRun`, `CreditFacility`, `ProjectWIPSnapshot`, `ProjectFunding`, `ProjectFundingTransaction`, `CostBaseline`, `CostBaselineLine`, `CostVariance`, `OverheadRule`, `OverheadAllocation`, `ProjectCostSnapshot`, `ProjectCostEntry`, `BillingProposal`, `InvoiceVarianceCase`.

### Assets (6 model)

`Category`, `Asset`, `Book`, `DepreciationLine`, `Maintenance`, `Disposal`.

### Service (4 model)

`Case`, `CaseMessage`, `CaseApproval`, `Resolution`.

### Analytics (8 model)

`Dashboard`, `DashboardRole`, `Widget`, `KPIDefinition`, `KPITarget`, `KPIResult`, `AlertRule`, `AlertEvent`.

### Logistics (4 model)

`Shipment`, `ShipmentLine`, `TrackingEvent`, `ProofOfDelivery`.

### Implementation (8 model)

`Release`, `Phase`, `PhaseItem`, `Workflow`, `WorkflowStage`, `WorkItem`, `TestCycle`, `GTMMilestone`.

### Reporting (4 database views)

`FinanceMainDashboard` (`view_finance_main_dashboard`), `ProjectDashboard` (`view_project_dashboard`), `ProjectTimelineCost` (`view_project_timeline_cost`), `CRMSalesDashboard` (`view_crm_sales_dashboard`).

---

## 10. Database Relationships

```mermaid
graph TD
    subgraph "Multi-Tenancy"
        TENANT[Tenant]
        COMPANY[Company]
        ORG[Organization]
    end

    subgraph "IAM"
        USER[User]
        ROLE[Role]
        USERROLE[UserRole]
    end

    subgraph "CRM"
        LEAD[Lead]
        OPP[Opportunity]
        INQ[CustomerInquiry]
        EST[CostEstimate]
        QUOT[QuotationVersion]
        EXEC_APPR[ExecutiveApproval]
    end

    subgraph "Sales"
        SQUO[Quotation]
        SORD[Order]
        SDEL[Delivery]
    end

    subgraph "Projects"
        PROJ[Project]
        TASK[Task]
        MEMBER[Member]
        TS[Timesheet]
        MILE[Milestone]
    end

    subgraph "Finance"
        ACCT[Account]
        JE[JournalEntry]
        BILL[BillingDocument]
        PAY[Payment]
        FUND[ProjectFunding]
    end

    TENANT --> COMPANY
    COMPANY --> ORG
    USER --> USERROLE
    ROLE --> USERROLE
    COMPANY --> USERROLE

    LEAD --> OPP
    OPP --> INQ
    INQ --> EST
    EST --> QUOT
    QUOT --> EXEC_APPR
    OPP --> SQUO
    SQUO --> SORD
    SORD --> SDEL
    SORD --> PROJ

    PROJ --> TASK
    PROJ --> MEMBER
    PROJ --> TS
    PROJ --> MILE
    USER --> MEMBER

    COMPANY --> ACCT
    PROJ --> FUND
    PROJ --> JE
    BILL --> PAY
```

### Pola Relasi Utama

- **Tenant → Company → Organization**: Hierarki multi-tenancy. Setiap data diisolasi ke tenant user.
- **User → UserRole → Role**: Many-to-many via pivot table `iam_user_role` yang juga menyimpan `company_id` dan `organization_id`.
- **CRM → Sales**: `Opportunity` menghasilkan `Quotation`, lalu `Order` setelah persetujuan.
- **Sales → Projects**: `Order` di-convert menjadi `Project` melalui command `convert-to-project`.
- **Projects → Finance**: `Project` terhubung ke `ProjectFunding`, `ProjectCostEntry`, `BillingProposal`, dan `ProjectWIPSnapshot`.
- **BusinessDocument**: Setiap transaksi besar (PO, Invoice, JournalEntry, dll.) memiliki FK ke `BusinessDocument` untuk tracking status workflow (DRAFT → SUBMITTED → APPROVED → POSTED → CANCELLED/REVERSED).

---

## 11. Authentication

### Flow Login

```mermaid
sequenceDiagram
    participant C as Client
    participant API as /api/v1/auth/token/
    participant JWT as SimpleJWT
    participant DB as PostgreSQL

    C->>API: POST {email, password}
    API->>DB: Find User by email
    DB-->>API: User record
    API->>API: check_password(hash)
    API->>JWT: Generate access + refresh tokens
    JWT->>DB: Read UserRole (embed roles in token)
    JWT-->>API: Tokens
    API-->>C: {access, refresh, user: {...}}
```

### JWT Token Customization

Token dibuat oleh `ERPTokenObtainPairSerializer` di `apps/accounts/api/auth.py`. Access token berisi claim tambahan:

```json
{
  "email": "user@example.com",
  "full_name": "John Doe",
  "tenant_id": "uuid",
  "roles": ["EXECUTIVE", "PROJECT_MANAGEMENT"]
}
```

### Endpoint Authentication

| Method | Path | Keterangan | Auth Required |
|---|---|---|---|
| `POST` | `/api/v1/auth/token/` | Login → JWT tokens | ❌ |
| `POST` | `/api/v1/auth/token/refresh/` | Refresh access token | ❌ |
| `POST` | `/api/v1/auth/token/verify/` | Verify token validity | ❌ |
| `GET` | `/api/v1/auth/me/` | Current user + roles | ✅ |
| `POST` | `/api/v1/auth/logout/` | Blacklist refresh token | ✅ |
| `POST` | `/api/v1/auth/change-password/` | Change password | ✅ |

### Token Lifetime

| Token | Default | Configurable |
|---|---|---|
| Access Token | 30 menit | `JWT_ACCESS_MINUTES` |
| Refresh Token | 7 hari | `JWT_REFRESH_DAYS` |

Refresh tokens dirotasi pada setiap penggunaan (`ROTATE_REFRESH_TOKENS=True`) dan token lama diblacklist (`BLACKLIST_AFTER_ROTATION=True`).

### Password Hashing

Django menggunakan PBKDF2 dengan SHA256 secara default. Minimum 8 karakter, divalidasi oleh 4 validator: `UserAttributeSimilarityValidator`, `MinimumLengthValidator`, `CommonPasswordValidator`, `NumericPasswordValidator`.

---

## 12. Authorization

### Layer 1: JWT Authentication

Setiap request API harus menyertakan `Authorization: Bearer <access_token>` di header. Diproses oleh `JWTAuthentication` dari SimpleJWT.

### Layer 2: RBAC via ERPAccessPermission

`ERPAccessPermission` (di `apps/api_common/permissions.py`) mengecek izin akses berdasarkan role user:

```text
Request masuk
    ↓
User authenticated? → No → 401 Unauthorized
    ↓ Yes
User is superuser? → Yes → ✅ Allowed
    ↓ No
ERP_ENFORCE_IAM enabled? → No → ✅ Allowed (bootstrap mode)
    ↓ Yes
Lookup RolePermission:
    role_ids = UserRole.filter(user=request.user)
    permission_code = "{app_label}.{model_name}.{action}"
    RolePermission.filter(role__in=role_ids, permission_code=code, allowed=True).exists()
    ↓
Exists? → Yes → ✅ Allowed
         → No  → 403 Forbidden
```

### Layer 3: Multi-Tenant Data Scoping

`scope_queryset()` (di `apps/api_common/scoping.py`) memfilter setiap queryset berdasarkan:

1. **Tenant**: Semua data difilter ke tenant milik user (`user.tenant_id`).
2. **Company**: Difilter berdasarkan header `X-Company-ID`, atau jika tidak ada, difilter ke semua company yang di-assign ke user melalui `UserRole`.

### Layer 4: Project-Level Access Control

`apps/projects/access.py` menyediakan guards tambahan untuk modul Project:

| Fungsi | Logika |
|---|---|
| `is_executive(user)` | `user.is_superuser` OR role `EXECUTIVE` |
| `is_project_management(user)` | Executive OR role `PROJECT_MANAGEMENT`/`PROJECT_MANAGER` |
| `is_finance(user)` | Executive OR role `ACCOUNTING_FINANCE`/`FINANCE` |
| `is_crm(user)` | Executive OR role `CRM`/`CRM_SALES`/`CRM_MANAGER` |
| `can_access_project(user, project)` | Executive OR PM-nya OR member aktif |
| `can_manage_project(user, project)` | Executive OR PM role + PM-nya/manager member |

### Role Hierarchy

```text
EXECUTIVE                    ← Unlimited access ke semua modul
    ├── PROJECT_MANAGEMENT   ← Kelola project + limited access ke Finance/CRM
    ├── ACCOUNTING_FINANCE   ← Kelola finance + limited access ke Project/CRM
    ├── CRM                  ← Kelola CRM/Sales + limited access ke project status
    └── PROJECT_ASSIGNEE     ← Akses terbatas: timesheet, task, work order
```

---

## 13. API Architecture

### Base Classes

Seluruh ViewSet modul mewarisi dari dua base class di `apps/api_common/viewsets.py`:

**`BaseERPModelViewSet`** (full CRUD):
- Auto `select_related` semua FK fields
- Auto `scope_queryset` (tenant + company)
- Auto search fields (semua CharField/TextField)
- Auto ordering fields (semua concrete fields)
- Audit trail pada create/update/destroy
- Auto-inject `tenant_id`, `company_id`, `created_by` pada create
- Auto-inject `updated_by` pada update
- Built-in bulk operations:
  - `POST /bulk-create/` — batch create
  - `PATCH /bulk-update/` — batch update
  - `POST /bulk-delete/` — batch delete
- `GET /metadata/` — schema introspection per model

**`ReadOnlyERPModelViewSet`** (read-only):
- Hanya `list` dan `retrieve`
- Auto scoping dan filtering

### URL Pattern

Setiap modul mengikuti pola konsisten:

```text
/api/v1/{module}/{resource}/                    → list, create
/api/v1/{module}/{resource}/{uuid}/             → retrieve, update, partial_update, destroy
/api/v1/{module}/{resource}/bulk-create/        → batch create
/api/v1/{module}/{resource}/bulk-update/        → batch update
/api/v1/{module}/{resource}/bulk-delete/        → batch delete
/api/v1/{module}/{resource}/metadata/           → schema introspection
```

### Request/Response Format

**Success Response:**
```json
{
    "count": 42,
    "next": "http://127.0.0.1:8000/api/v1/projects/projects/?page=2",
    "previous": null,
    "results": [...]
}
```

**Error Response:**
```json
{
    "success": false,
    "status_code": 400,
    "errors": {
        "field_name": ["Pesan error."]
    }
}
```

**Command Response:**
```json
{
    "success": true,
    "message": "Project berhasil dimulai.",
    "data": {...}
}
```

---

## 14. API Endpoints

### Authentication (`/api/v1/auth/`)

| Method | Path | Keterangan |
|---|---|---|
| `POST` | `/api/v1/auth/token/` | Login |
| `POST` | `/api/v1/auth/token/refresh/` | Refresh token |
| `POST` | `/api/v1/auth/token/verify/` | Verify token |
| `GET` | `/api/v1/auth/me/` | Current user |
| `POST` | `/api/v1/auth/logout/` | Logout |
| `POST` | `/api/v1/auth/change-password/` | Change password |

### Development (`/api/v1/dev/`)

| Method | Path | Keterangan |
|---|---|---|
| `POST` | `/api/v1/dev/seed/users/` | Seed dummy users |

### Accounts & IAM (`/api/v1/accounts/`)

`users`, `roles`, `permissions`, `user-roles`, `role-permissions`, `role-hierarchies`, `data-scope-policies`, `role-data-scopes`, `field-permissions`, `information-share-rules`, `approval-limits`, `user-project-accesses` — masing-masing CRUD + bulk.

### Core (`/api/v1/core/`)

`tenants`, `companies`, `organizations`, `business-documents`, `document-links`, `workflow-instances`, `workflow-approvals`, `audit-events`, `notifications`, `notification-recipients`, `quick-actions`, `files`, `document-attachments`, `document-templates`, `document-template-versions`, `document-template-fields`, `generated-documents`, `document-signatures` — masing-masing CRUD + bulk.

### Master Data (`/api/v1/master-data/`)

`parties`, `contacts`, `customer-profiles`, `supplier-profiles`, `products`, `product-categories`, `employees`, `currencies`, `exchange-rates`, `uoms`, `warehouses`, `warehouse-zones`, `machines`.

### CRM (`/api/v1/crm/`)

`leads`, `opportunities`, `opportunity-products`, `activities`, `pipelines`, `pipeline-stages`, `opportunity-stage-histories`, `executive-approvals`, `credit-status-snapshots`, `channel-accounts`, `conversations`, `conversation-participants`, `messages`, `message-attachments`, `message-delivery-statuses`, `feedbacks`, `surveys`, `survey-questions`, `survey-responses`, `survey-answers`, `customer-inquiries`, `inquiry-requirements`, `cost-estimates`, `cost-estimate-lines`, `quotation-versions`, `quotation-deliveries`, `workflow-events`.

### Sales (`/api/v1/sales/`)

`quotations`, `quotation-lines`, `quotation-costs`, `contracts`, `contract-lines`, `orders`, `order-lines`, `deliveries`, `delivery-lines`, `demand-supply-links`, `order-change-requests`, `recurring-order-rules`, `recurring-order-runs`.

### Projects (`/api/v1/projects/`)

`projects`, `control-items`, `expenses`, `lifecycle-events`, `readiness-checks`, `members`, `tasks`, `task-dependencies`, `milestones`, `material-requirements`, `budget-lines`, `timesheets`, `change-requests`, `change-request-materials`, `boards`, `board-columns`, `task-board-positions`, `health-rules`, `health-snapshots`, `risks`, `issues`, `issue-actions`, `dispatches`, `technical-briefs`, `technical-brief-versions`, `requirements`, `acceptance-criterias`, `resource-requests`, `resource-request-lines`, `resource-allocations`, `progress-snapshots`, `equipment-usages`, `weight-indicators`, `weight-components`.

### Procurement (`/api/v1/procurement/`)

`purchase-requisitions`, `purchase-requisition-lines`, `rfqs`, `supplier-quotations`, `purchase-orders`, `purchase-order-lines`, `goods-receipts`, `goods-receipt-lines`, `three-way-matches`.

### Inventory (`/api/v1/inventory/`)

`lots`, `serial-numbers`, `stock-moves`, `stock-move-lines`, `stock-reservations`, `stock-ledger-entries`, `stock-balances`, `valuation-layers`, `stock-counts`, `stock-count-lines`.

### Manufacturing (`/api/v1/manufacturing/`)

`boms`, `bom-versions`, `bom-lines`, `routings`, `routing-operations`, `production-orders`, `production-materials`, `work-orders`, `labor-logs`, `machine-logs`, `production-outputs`, `scraps`, `cost-ledger-entries`.

### Quality (`/api/v1/quality/`)

`quality-plans`, `quality-plan-points`, `inspections`, `inspection-results`, `nonconformances`, `corrective-actions`.

### Finance (`/api/v1/finance/`)

`fiscal-years`, `fiscal-periods`, `accounts`, `journals`, `journal-entries`, `journal-lines`, `billing-documents`, `billing-document-lines`, `arap-schedules`, `payments`, `payment-allocations`, `bank-accounts`, `bank-statements`, `bank-statement-lines`, `bank-reconciliations`, `tax-transactions`, `budgets`, `budget-lines`, `period-closings`, `financial-snapshots`, `unit-cost-snapshots`, `recurring-payment-rules`, `recurring-payment-runs`, `credit-facilities`, `project-wip-snapshots`, `project-fundings`, `project-funding-transactions`, `cost-baselines`, `cost-baseline-lines`, `cost-variances`, `overhead-rules`, `overhead-allocations`, `project-cost-snapshots`, `project-cost-entries`, `billing-proposals`, `invoice-variance-cases`.

### Assets (`/api/v1/assets/`)

`categories`, `assets`, `books`, `depreciation-lines`, `maintenances`, `disposals`.

### Service (`/api/v1/service/`)

`cases`, `case-messages`, `case-approvals`, `resolutions`.

### Analytics (`/api/v1/analytics/`)

`dashboards`, `dashboard-roles`, `widgets`, `kpi-definitions`, `kpi-targets`, `kpi-results`, `alert-rules`, `alert-events`.

### Logistics (`/api/v1/logistics/`)

`shipments`, `shipment-lines`, `tracking-events`, `proofs-of-delivery`.

### Implementation (`/api/v1/implementation/`)

`releases`, `phases`, `phase-items`, `workflows`, `workflow-stages`, `work-items`, `test-cycles`, `gtm-milestones`.

### Reporting (`/api/v1/reporting/`)

`finance-main-dashboards`, `project-dashboards`, `project-timeline-costs`, `crm-sales-dashboards`.

### Operational Commands (`/api/v1/commands/`)

74 endpoint command yang menjalankan aksi bisnis. Contoh utama:

| Method | Path | Aksi |
|---|---|---|
| `POST` | `/commands/core/documents/{id}/submit/` | Submit dokumen ke approval |
| `POST` | `/commands/core/documents/{id}/approve/` | Approve dokumen |
| `POST` | `/commands/core/documents/{id}/reject/` | Reject dokumen |
| `POST` | `/commands/core/documents/{id}/post/` | Post dokumen ke buku besar |
| `POST` | `/commands/core/documents/{id}/cancel/` | Cancel dokumen |
| `POST` | `/commands/core/documents/{id}/reverse/` | Reverse posting |
| `POST` | `/commands/sales/orders/{id}/convert-to-project/` | Convert SO → Project |
| `POST` | `/commands/projects/projects/{id}/start/` | Start project execution |
| `POST` | `/commands/projects/projects/{id}/close/` | Close project |
| `POST` | `/commands/projects/projects/{id}/health/` | Calculate project health |
| `POST` | `/commands/projects/projects/{id}/costs/` | Collect project costs |
| `POST` | `/commands/finance/journal-entries/{id}/post/` | Post journal entry |
| `POST` | `/commands/finance/billing-documents/{id}/post/` | Post billing doc |
| `POST` | `/commands/finance/payments/{id}/execute/` | Execute payment |
| `POST` | `/commands/finance/fiscal-periods/{id}/close/` | Period closing |
| `GET` | `/commands/reporting/finance-main-dashboard/` | Finance dashboard data |
| `GET` | `/commands/reporting/project-dashboard/{id}/` | Project dashboard data |
| `GET` | `/commands/reporting/crm-sales-dashboard/` | CRM sales dashboard data |

---

## 15. API Request Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant MW as Middleware
    participant JWT as JWTAuthentication
    participant PERM as ERPAccessPermission
    participant SCOPE as scope_queryset
    participant VS as ViewSet
    participant SER as Serializer
    participant MDL as Model/ORM
    participant DB as PostgreSQL
    participant AUDIT as AuditEvent

    C->>MW: HTTP Request + Bearer Token + X-Company-ID
    MW->>MW: SecurityMiddleware, CorsMiddleware, SessionMiddleware, CsrfMiddleware
    MW->>JWT: AuthenticationMiddleware → JWTAuthentication
    JWT->>JWT: Decode access token → request.user
    JWT->>PERM: has_permission(request, view)
    PERM->>PERM: is_superuser? ERP_ENFORCE_IAM? RolePermission lookup
    PERM->>SCOPE: scope_queryset(qs, user, company_id)
    SCOPE->>SCOPE: find_scope_path → filter tenant_id, company_id
    SCOPE->>VS: Scoped QuerySet
    VS->>SER: Deserialize request data
    SER->>SER: Validate fields + cross-tenant FK validation
    VS->>MDL: ORM operation (create/update/delete/query)
    MDL->>DB: SQL query
    DB-->>MDL: Result
    VS->>AUDIT: create_audit_event(before, after)
    AUDIT->>DB: INSERT audit_event
    VS->>SER: Serialize response data
    SER-->>VS: JSON data
    VS-->>C: HTTP Response
```

---

## 16. Module Documentation

### CRM Module Flow

```text
Lead (Prospek)
    ↓ Qualify
Opportunity (Pipeline)
    ↓ Customer contacts → creates
CustomerInquiry (Pertanyaan masuk)
    ↓ Add requirements
InquiryRequirement (Spesifikasi teknis)
    ↓ Qualify inquiry → workflow_services.qualify_inquiry()
CostEstimate + CostEstimateLine (Kalkulasi biaya & margin)
    ↓ Create quotation → workflow_services.create_quotation_version()
QuotationVersion (Penawaran harga)
    ↓ Submit for approval
ExecutiveApproval (Persetujuan direksi)
    ↓ Approved → Convert to Sales Order
Sales.Order (Kontrak penjualan)
```

### Project Management Module Flow

```text
Sales.Order
    ↓ commands/sales/orders/{id}/convert-to-project/
Project
    ↓ commands/projects/projects/{id}/start/
Task, Member, Milestone, Board, MaterialRequirement
    ↓ Execution
Timesheet, EquipmentUsage, ProgressSnapshot
    ↓ commands/projects/projects/{id}/health/
HealthSnapshot, Risk, Issue
    ↓ commands/projects/projects/{id}/costs/
ProjectCostEntry → BillingProposal → BillingDocument
    ↓ commands/projects/projects/{id}/close/
Project status = COMPLETED
```

### Finance Module Flow

```text
BillingDocument (Invoice / Credit Note)
    ↓ commands/finance/billing-documents/{id}/verify/
    ↓ commands/finance/billing-documents/{id}/approve/
    ↓ commands/finance/billing-documents/{id}/post/
JournalEntry + JournalLine (Buku besar)
    ↓
Payment
    ↓ commands/finance/payments/{id}/submit/
    ↓ commands/finance/payments/{id}/approve/
    ↓ commands/finance/payments/{id}/execute/
PaymentAllocation → BankReconciliation
    ↓
PeriodClosing (Tutup buku)
    ↓ commands/finance/fiscal-periods/{id}/close/
FinancialSnapshot (Laporan keuangan)
```

---

## 17. Module Data Flow

### Authentication Flow

```mermaid
sequenceDiagram
    Client->>+API: POST /api/v1/auth/token/ {email, password}
    API->>DB: SELECT * FROM iam_user WHERE email=?
    DB-->>API: User row
    API->>API: check_password(hash)
    alt Password valid
        API->>DB: SELECT role_code FROM iam_user_role WHERE user_id=?
        DB-->>API: ["EXECUTIVE", ...]
        API->>API: Generate JWT {email, roles, tenant_id}
        API-->>-Client: 200 {access, refresh, user}
    else Password invalid
        API-->>Client: 401 {detail: "No active account found..."}
    end
```

### CRM Inquiry-to-Quotation Flow

```mermaid
sequenceDiagram
    CRM User->>+API: POST /api/v1/crm/customer-inquiries/ {subject, customer}
    API->>DB: INSERT customer_inquiry (status=NEW)
    API-->>-CRM User: 201 Created

    CRM User->>+API: POST /api/v1/crm/inquiry-requirements/ {inquiry, specification}
    API->>DB: INSERT inquiry_requirement
    API-->>-CRM User: 201 Created

    CRM User->>+API: POST /api/v1/crm/customer-inquiries/{id}/qualify/ (via viewset action)
    API->>API: workflow_services.qualify_inquiry()
    API->>DB: INSERT opportunity (pipeline_stage=PROSPECT)
    API->>DB: UPDATE customer_inquiry (status=QUALIFIED)
    API-->>-CRM User: 200 {inquiry, opportunity}

    CRM User->>+API: POST /api/v1/crm/cost-estimates/ {inquiry, lines}
    API->>API: workflow_services.create_cost_estimate()
    API->>DB: INSERT cost_estimate + cost_estimate_lines
    API-->>-CRM User: 201 Created

    CRM User->>+API: POST /api/v1/crm/quotation-versions/ {estimate, margin}
    API->>API: workflow_services.create_quotation_version()
    API->>DB: INSERT quotation_version (status=PENDING_APPROVAL)
    API->>DB: INSERT executive_approval
    API-->>-CRM User: 201 Created

    Executive->>+API: POST /api/v1/crm/executive-approvals/{id}/decide/ {decision: APPROVED}
    API->>DB: UPDATE executive_approval, quotation_version
    API-->>-Executive: 200 Approved
```

---

## 18. Service Layer

### Workflow Services

Setiap modul yang memiliki business logic menyimpannya di `workflow_services.py`:

| File | Fungsi Utama |
|---|---|
| `apps/crm/workflow_services.py` | `qualify_inquiry()`, `create_cost_estimate()`, `calculate_margin()`, `create_quotation_version()`, `request_executive_approval()`, `decide_approval()` |
| `apps/projects/workflow_services.py` | `ensure_shortage_procurement()`, `recalculate_progress()`, `build_project_health()`, `compute_project_costs()`, `approve_timesheet()`, `build_funding_summary()` |
| `apps/finance/workflow_services.py` | `ensure_account()`, `ensure_journal()`, `collect_project_operational_costs()`, `create_billing_proposal()` |

### Commands (`config/commands.py`)

File `commands.py` (3.174 baris) berisi seluruh operational command views. Setiap command:
- Mewarisi `GenericAPIView`
- Didokumentasikan via `@extend_schema` (tag, summary, description, request/response schema)
- Menggunakan `@transaction.atomic` untuk konsistensi data
- Mengembalikan `ERPCommandResponseSerializer` (`{success, message, data}`)

Helper utama:
- `create_business_document(source, document_type, prefix, user)` — membuat `BusinessDocument` dengan nomor otomatis
- `get_next_document_number(prefix)` — generate nomor dokumen sequential

---

## 19. Validation / Schema

### ERPModelSerializer

Base serializer (`apps/api_common/serializers.py`) menyediakan:

1. **System field protection**: Fields `id`, `created_at`, `updated_at`, `created_by`, `updated_by`, dll. otomatis read-only.
2. **Field-level permissions**: Jika `ERP_ENFORCE_FIELD_PERMISSIONS=True`, field yang tidak boleh di-view oleh role user dihapus dari response, field yang tidak boleh di-edit menjadi read-only.
3. **Cross-tenant validation**: FK yang menunjuk ke record milik tenant/company berbeda ditolak.

### Dynamic Filtering

`ERPQueryFilterBackend` (`apps/api_common/filters.py`) mengizinkan filtering dinamis via query params:

```text
?status=APPROVED
?company_id=<uuid>
?posting_date__gte=2026-08-01
?id__in=<uuid>,<uuid>
?name__icontains=server
?amount__range=1000,5000
```

Lookup yang didukung: `exact`, `in`, `gte`, `lte`, `gt`, `lt`, `icontains`, `contains`, `istartswith`, `iendswith`, `isnull`, `range`.

---

## 20. Error Handling

### Standardized Error Envelope

`erp_exception_handler` (`apps/api_common/exceptions.py`) membungkus semua error DRF ke format konsisten:

```json
{
    "success": false,
    "status_code": 400,
    "errors": {
        "email": ["Email wajib diisi."],
        "password": ["Minimal 8 karakter."]
    }
}
```

### HTTP Status Codes

| Code | Penggunaan |
|---|---|
| `200` | Sukses (retrieve, update, command) |
| `201` | Berhasil dibuat (create) |
| `204` | Berhasil tanpa response body (logout, delete) |
| `400` | Validation error |
| `401` | Token tidak valid / tidak tersedia |
| `403` | Permission denied |
| `404` | Resource tidak ditemukan |
| `503` | Database unavailable (health check) |

---

## 21. Middleware

Middleware dieksekusi secara berurutan untuk setiap request:

```text
1. SecurityMiddleware           → HTTPS redirect, security headers
2. CorsMiddleware               → CORS headers (corsheaders)
3. SessionMiddleware            → Session management
4. CommonMiddleware             → URL normalization
5. CsrfViewMiddleware          → CSRF protection
6. AuthenticationMiddleware     → request.user (Django + JWT)
7. MessageMiddleware            → Flash messages
8. XFrameOptionsMiddleware     → Clickjacking protection
```

---

## 22. Audit Trail

Setiap operasi CREATE, UPDATE, DELETE pada model ERP dicatat secara otomatis oleh `BaseERPModelViewSet`:

```python
# apps/api_common/audit.py

create_audit_event(
    request=request,
    instance=instance,
    event_type="CREATE",  # CREATE | UPDATE | DELETE
    before={...},         # Snapshot sebelum perubahan (UPDATE/DELETE)
    after={...},          # Snapshot setelah perubahan (CREATE/UPDATE)
)
```

Data disimpan di tabel `core_audit_event` dengan:
- `tenant_id`, `company_id` — auto-resolved via `get_scope_value`
- `document` — FK ke `BusinessDocument` jika instance terkait
- `user` — user yang melakukan aksi
- `entity_name` — nama model (`app_label.ModelName`)
- `entity_id` — primary key record
- `event_type` — `CREATE` / `UPDATE` / `DELETE`
- `before_data` — JSON snapshot sebelum
- `after_data` — JSON snapshot setelah
- `occurred_at` — timestamp

---

## 23. Utilities / Helpers

### Multi-Tenant Scoping (`apps/api_common/scoping.py`)

- `find_scope_path(model, target, max_depth=4)` — menemukan path FK terpendek dari model ke `tenant` atau `company` secara rekursif. Menggunakan `@lru_cache` untuk performa.
- `scope_queryset(queryset, user, company_id)` — memfilter queryset berdasarkan tenant user dan company yang dipilih.
- `get_scope_value(instance, target)` — mengambil nilai `tenant_id` atau `company_id` dari instance melalui FK chain.

### Dynamic Filtering (`apps/api_common/filters.py`)

- `ERPQueryFilterBackend` — memfilter queryset berdasarkan query params dengan validasi field path dan coercion otomatis.
- Reserved params yang di-skip: `page`, `page_size`, `search`, `ordering`, `format`, `include`.

### Pagination (`apps/api_common/pagination.py`)

- `ERPPageNumberPagination` — 25 items per page, configurable via `?page_size=`, max 500.

### OpenAPI Patch (`tools/fixing.py`)

- Memperbaiki konflik nama component `BudgetLineSerializer` antara `apps/projects` dan `apps/finance` dengan menambahkan `@extend_schema_serializer(component_name=...)`.

---

## 24. Database Migration

Setiap modul memiliki folder `migrations/` yang dikelola oleh Django migration system.

```bash
# Membuat migration baru setelah mengubah model
python manage.py makemigrations

# Menjalankan migration
python manage.py migrate

# Melihat status migration
python manage.py showmigrations
```

---

## 25. Scalar API Documentation

API documentation menggunakan **Scalar** sebagai pengganti Swagger UI dan ReDoc. Scalar membaca **OpenAPI 3.0 schema** yang digenerate oleh `drf-spectacular`.

### Mengakses Dokumentasi

| URL | Keterangan |
|---|---|
| `http://127.0.0.1:8000/api/docs/` | **Scalar UI** — Interactive API documentation |
| `http://127.0.0.1:8000/api/schema/` | **OpenAPI Schema** — Raw JSON/YAML specification |

### Fitur Scalar

- Tampilan modern dan responsif
- Navigasi sidebar dengan tag-based grouping
- Schema request/response lengkap
- Try-it-out untuk menguji endpoint langsung
- Authentication documentation
- Dark/light theme

### Konfigurasi

Schema digenerate oleh `drf-spectacular` dengan konfigurasi di `config/settings/base.py`:

```python
SPECTACULAR_SETTINGS = {
    "TITLE": "ERP Operational API",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
    "SCHEMA_PATH_PREFIX": r"/api/v1",
    "TAGS": [...],  # 13 tag groups
}
```

### Exported Schema

Schema statis tersedia di `docs/openapi-schema.yml` (2.3 MB). Untuk regenerate:

```bash
python manage.py spectacular --file docs/openapi-schema.yml
```

---

## 26. Testing

### Test Files

| File | Keterangan |
|---|---|
| `apps/api_common/tests/test_api_coverage.py` | Verifikasi semua model terdaftar memiliki endpoint API |
| `apps/api_common/tests/test_scoping.py` | Unit test multi-tenant scoping |
| `apps/crm/tests/test_crm_end_to_end.py` | End-to-end CRM flow (inquiry → quotation → approval) |
| `apps/projects/tests/test_project_flow.py` | Project lifecycle flow |
| `apps/projects/tests/test_diagram_workflows.py` | Workflow diagram verification |
| `apps/projects/tests/test_funding_membership_permissions.py` | Funding & membership permission tests |
| `apps/projects/tests/test_project_workspace_api.py` | Project workspace API tests |
| `apps/finance/tests/test_payment_workflow.py` | Payment workflow tests |
| `apps/finance/tests/test_extended_finance_flows.py` | Extended finance flow tests |
| `apps/finance/tests/test_project_accounting_flow.py` | Project ↔ accounting integration tests |

### Menjalankan Tests

```bash
# Semua tests
python manage.py test

# Per modul
python manage.py test apps.crm
python manage.py test apps.projects
python manage.py test apps.finance
python manage.py test apps.api_common

# Dengan verbose
python manage.py test --verbosity=2
```

---

## 27. Environment Configuration

### File `.env`

File `.env` di root `backend/` berisi environment variables. File ini **tidak di-commit** ke git (ada di `.gitignore`).

### Template `.env.example`

```bash
DEBUG=True
SECRET_KEY=unsafe-development-key-change-me
ALLOWED_HOSTS=127.0.0.1,localhost
DATABASE_URL=postgresql://user:password@host:5432/dbname
JWT_ACCESS_MINUTES=30
JWT_REFRESH_DAYS=7
CORS_ALLOWED_ORIGINS=http://127.0.0.1:5500,http://localhost:5500
TIME_ZONE=Asia/Jakarta
ERP_ENFORCE_IAM=False
ERP_ENFORCE_FIELD_PERMISSIONS=False
```

---

## 28. Local Development

### Setup dari Nol

```bash
# 1. Clone repository
cd backend/

# 2. Buat virtual environment
python -m venv venv

# 3. Aktifkan venv
# Windows:
.\venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# 4. Install dependencies
pip install -r requirements.txt

# 5. Copy dan sesuaikan environment
copy .env.example .env
# Edit .env → set DATABASE_URL

# 6. Jalankan migration
python manage.py migrate

# 7. Buat superuser
python manage.py createsuperuser

# 8. Seed data demo (opsional)
python tools/seeders/run_all_seeders.py

# 9. Jalankan server
python manage.py runserver 0.0.0.0:8000

# 10. Buka dokumentasi API
# → http://127.0.0.1:8000/api/docs/
```

---

## 29. Seed Data

### Seed Users via API

```bash
POST /api/v1/dev/seed/users/
Authorization: Bearer <admin_token>

{
  "update_existing": false,
  "users": [
    {
      "username": "demo.executive",
      "email": "executive.demo@erp.local",
      "password": "DemoERP2026!",
      "full_name": "Demo Executive",
      "tenant": "<tenant_uuid>",
      "role": "<executive_role_uuid>",
      "company": "<company_uuid>"
    }
  ]
}
```

### Seed Scripts

Seed scripts berada di `tools/seeders/`:

| Script | Keterangan |
|---|---|
| `seed_tenant.py` | Tenant & company |
| `seed_iam_core.py` | Users, roles, permissions |
| `seed_master_data.py` | Products, customers, suppliers, currencies |
| `seed_crm_sales.py` | CRM leads, opportunities, quotations |
| `seed_procurement_inventory.py` | PO, receipts, stock |
| `seed_project_manufacturing.py` | Projects, tasks, production orders |
| `seed_finance_assets.py` | Journal entries, invoices, assets |
| `run_all_seeders.py` | Menjalankan semua seeder berurutan |
| `seeder_common.py` | Shared helper functions (33 KB) |

```bash
# Jalankan semua seeder
python tools/seeders/run_all_seeders.py

# Atau via PowerShell
.\tools\seeders\run_all_seeders.ps1
```

### Demo Users

| Role | Email | Password |
|---|---|---|
| Executive | `executive.demo@erp.local` | `DemoERP2026!` |
| Project Management | `project.manager.demo@erp.local` | `DemoERP2026!` |
| Finance | `finance.demo@erp.local` | `DemoERP2026!` |
| Project Assignee | `assignee.demo@erp.local` | `DemoERP2026!` |

---

## 30. Production Deployment

### WSGI (Gunicorn)

```bash
gunicorn config.wsgi:application \
    --bind 0.0.0.0:8000 \
    --workers 4 \
    --timeout 120 \
    --access-logfile - \
    --error-logfile -
```

### ASGI (Uvicorn)

```bash
uvicorn config.asgi:application \
    --host 0.0.0.0 \
    --port 8000 \
    --workers 4
```

### Production Environment Variables

```bash
DEBUG=False
SECRET_KEY=<random-50-char-string>
ALLOWED_HOSTS=api.yourdomain.com
CSRF_TRUSTED_ORIGINS=https://api.yourdomain.com
DATABASE_URL=postgresql://user:pass@host:5432/dbname
SESSION_COOKIE_SECURE=True
CSRF_COOKIE_SECURE=True
```

### Static Files

```bash
python manage.py collectstatic --noinput
```

Static files dikumpulkan ke `backend/staticfiles/`.

---

## 31. Troubleshooting

### Import Error setelah migrasi

```bash
python manage.py check
```

### Database connection error

Pastikan `DATABASE_URL` di `.env` benar dan database PostgreSQL bisa diakses.

```bash
python manage.py dbshell
```

### Migration conflict

```bash
python manage.py showmigrations
python manage.py migrate --run-syncdb
```

### OpenAPI schema error

```bash
python manage.py spectacular --validate
```

### Permission denied (403)

- Cek apakah `ERP_ENFORCE_IAM=True`. Jika ya, pastikan user memiliki `RolePermission` yang sesuai.
- Cek header `Authorization: Bearer <token>`.
- Cek header `X-Company-ID` jika diperlukan.

### CORS error

Pastikan frontend origin ada di `CORS_ALLOWED_ORIGINS` di `.env` atau `settings/base.py`.

---

## 32. Complete Backend Flow

```text
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT                                │
│  (Frontend / Postman / Scalar Try-It)                       │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP Request
                           │ Headers: Authorization, X-Company-ID
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    DJANGO MIDDLEWARE                          │
│  SecurityMiddleware → CorsMiddleware → SessionMiddleware     │
│  → CommonMiddleware → CsrfViewMiddleware                     │
│  → AuthenticationMiddleware → MessageMiddleware              │
│  → XFrameOptionsMiddleware                                   │
└──────────────────────────┬──────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                  JWT AUTHENTICATION                          │
│  rest_framework_simplejwt.authentication.JWTAuthentication   │
│  → Decode Bearer token → Set request.user                    │
└──────────────────────────┬──────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   URL ROUTING                                │
│  config/urls.py → config/api_urls.py                         │
│  → apps/{module}/api/urls.py                                 │
│  → apps/{module}/api/viewsets.py (ViewSet.action)            │
│  OR                                                          │
│  → config/command_urls.py → config/commands.py               │
└──────────────────────────┬──────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│               RBAC AUTHORIZATION                             │
│  apps/api_common/permissions.py → ERPAccessPermission        │
│  1. is_superuser? → Allow                                    │
│  2. ERP_ENFORCE_IAM=False? → Allow (bootstrap)               │
│  3. RolePermission lookup → Allow/Deny                       │
└──────────────────────────┬──────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              MULTI-TENANT SCOPING                            │
│  apps/api_common/scoping.py → scope_queryset()               │
│  1. Filter by user.tenant_id                                 │
│  2. Filter by X-Company-ID (or user's companies)             │
└──────────────────────────┬──────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              VIEWSET / COMMAND VIEW                           │
│  apps/api_common/viewsets.py → BaseERPModelViewSet           │
│  OR config/commands.py → GenericAPIView                      │
│                                                              │
│  → Deserialize request (ERPModelSerializer)                  │
│  → Validate (field perms, cross-tenant FK)                   │
│  → Execute business logic (workflow_services)                │
│  → ORM operation (create/update/delete/query)                │
│  → Audit trail (create_audit_event)                          │
│  → Serialize response                                        │
└──────────────────────────┬──────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                  DJANGO ORM                                  │
│  apps/{module}/models.py → SQL                               │
└──────────────────────────┬──────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              POSTGRESQL (SUPABASE)                            │
│  160 tables, UUID primary keys, FK constraints               │
│  Multi-tenant isolation via tenant_id/company_id             │
└──────────────────────────┬──────────────────────────────────┘
                           │ Query result
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              HTTP RESPONSE                                   │
│  Success: {count, next, previous, results}                   │
│  Error: {success: false, status_code, errors}                │
│  Command: {success: true, message, data}                     │
└─────────────────────────────────────────────────────────────┘
```

---

## 33. File Dependency Map

```mermaid
graph TD
    subgraph "Entry Points"
        MANAGE[manage.py]
        WSGI[config/wsgi.py]
        ASGI[config/asgi.py]
    end

    subgraph "Configuration"
        SETTINGS[config/settings/base.py]
        URLS[config/urls.py]
        API_URLS[config/api_urls.py]
        CMD_URLS[config/command_urls.py]
        HEALTH[config/health.py]
    end

    subgraph "Shared Infrastructure"
        PERMS[api_common/permissions.py]
        BASE_VS[api_common/viewsets.py]
        BASE_SER[api_common/serializers.py]
        FILTERS[api_common/filters.py]
        SCOPING[api_common/scoping.py]
        AUDIT_M[api_common/audit.py]
        PAGING[api_common/pagination.py]
        EXCEPT[api_common/exceptions.py]
    end

    subgraph "Module Pattern (per modul)"
        MOD_MODELS[models.py]
        MOD_SER[api/serializers.py]
        MOD_VS[api/viewsets.py]
        MOD_URLS[api/urls.py]
        MOD_WF[workflow_services.py]
    end

    subgraph "Commands"
        COMMANDS[config/commands.py]
    end

    MANAGE --> SETTINGS
    WSGI --> SETTINGS
    ASGI --> SETTINGS
    SETTINGS --> URLS
    URLS --> API_URLS
    URLS --> HEALTH
    API_URLS --> MOD_URLS
    API_URLS --> CMD_URLS
    CMD_URLS --> COMMANDS

    MOD_URLS --> MOD_VS
    MOD_VS --> BASE_VS
    MOD_VS --> MOD_SER
    MOD_SER --> BASE_SER
    MOD_VS --> MOD_WF
    BASE_VS --> PERMS
    BASE_VS --> SCOPING
    BASE_VS --> FILTERS
    BASE_VS --> PAGING
    BASE_VS --> AUDIT_M
    BASE_SER --> SCOPING
    MOD_SER --> MOD_MODELS
    MOD_WF --> MOD_MODELS
    COMMANDS --> MOD_MODELS
    COMMANDS --> AUDIT_M

    SETTINGS --> EXCEPT
```

---

## 34. Database Dependency Map

```mermaid
graph TD
    subgraph "Core"
        T[core_tenant] --> C[core_company]
        C --> O[core_organization]
        C --> BD[core_business_document]
    end

    subgraph "IAM"
        U[iam_user] --> UR[iam_user_role]
        R[iam_role] --> UR
        C --> UR
    end

    subgraph "Master Data"
        PARTY[master_party]
        PROD[master_product]
        WH[master_warehouse]
        CUR[master_currency]
    end

    subgraph "CRM → Sales"
        LEAD[crm_lead] --> OPP[crm_opportunity]
        OPP --> INQ[crm_customer_inquiry]
        INQ --> CE[crm_cost_estimate]
        CE --> QV[crm_quotation_version]
        QV --> EA[crm_executive_approval]
        OPP --> SQ[sales_quotation]
        SQ --> SO[sales_order]
        SO --> SD[sales_delivery]
    end

    subgraph "Projects"
        SO --> PROJ[project_project]
        PROJ --> TASK[project_task]
        PROJ --> MEM[project_member]
        PROJ --> TS[project_timesheet]
    end

    subgraph "Procurement"
        PROJ --> PR[proc_purchase_requisition]
        PR --> PO[proc_purchase_order]
        PO --> GR[proc_goods_receipt]
    end

    subgraph "Finance"
        PROJ --> PCE[fin_project_cost_entry]
        PROJ --> PF[fin_project_funding]
        BD --> JE[fin_journal_entry]
        BD --> BILL[fin_billing_document]
        BILL --> PAY[fin_payment]
    end

    PARTY --> OPP
    PARTY --> INQ
    PARTY --> SQ
    PARTY --> SO
    PROD --> CE
    U --> MEM
    U --> TS
    C --> PROJ
    T --> U
```

---

## 35. Complete Data Flow Diagram

```mermaid
graph LR
    subgraph "CRM"
        A[Lead] --> B[Opportunity]
        B --> C[Inquiry]
        C --> D[Cost Estimate]
        D --> E[Quotation]
        E --> F[Executive Approval]
    end

    subgraph "Sales"
        F --> G[Sales Quotation]
        G --> H[Sales Order]
        H --> I[Delivery]
    end

    subgraph "Project Management"
        H --> J[Project]
        J --> K[Tasks / WBS]
        J --> L[Timesheets]
        J --> M[Material Req]
    end

    subgraph "Procurement"
        M --> N[Purchase Req]
        N --> O[Purchase Order]
        O --> P[Goods Receipt]
    end

    subgraph "Inventory"
        P --> Q[Stock Balance]
    end

    subgraph "Manufacturing"
        Q --> R[Production Order]
        R --> S[Work Order]
    end

    subgraph "Quality"
        S --> T[Inspection]
        P --> T
    end

    subgraph "Finance"
        L --> U[Cost Entry]
        J --> V[Billing Proposal]
        V --> W[Invoice]
        W --> X[Payment]
        X --> Y[Bank Reconciliation]
        Y --> Z[Period Closing]
    end
```

---

> **Catatan**: Untuk diagram ERD lengkap dengan seluruh 160 tabel, lihat [README.md](../README.md) di root project.
