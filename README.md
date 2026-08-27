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
36. [Appendix: Database ERD — 100% Information Architecture](#36-appendix-database-erd--100-information-architecture)

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


---

## 36. Appendix: Database ERD — 100% Information Architecture

# ERP Database ERD — 100% Information Architecture

> 📖 **Backend Technical Documentation**: Lihat [backend/README.md](backend/README.md) untuk dokumentasi lengkap backend (arsitektur, API, authentication, data flow, deployment, dan Scalar API docs).

Versi pembaruan: 3 Agustus 2026. Struktur ini mempertahankan transactional core sebelumnya dan menambahkan seluruh lapisan yang terlihat pada PNG: akses bertingkat, limited information sharing, dashboard/KPI, notifikasi, project health, technical brief, recurring payment/order, document builder, omnichannel, delivery tracking, feedback center, serta roadmap implementasi.

```mermaid
erDiagram

    %% =========================================================
    %% CORE, MULTI-TENANCY, IAM, DOCUMENT, WORKFLOW, AUDIT
    %% =========================================================

    CORE_TENANT {
        uuid id PK
        string code UK
        string name
        string status
        datetime created_at
        datetime updated_at
    }

    CORE_COMPANY {
        uuid id PK
        uuid tenant_id FK
        string company_code
        string legal_name
        string tax_number
        uuid base_currency_id FK
        date fiscal_year_start
        string status
    }

    CORE_ORGANIZATION {
        uuid id PK
        uuid tenant_id FK
        uuid company_id FK
        uuid parent_id FK
        string organization_code
        string organization_name
        string organization_type
        string status
    }

    IAM_USER {
        uuid id PK
        uuid tenant_id FK
        string username UK
        string email UK
        string password_hash
        string full_name
        string status
        datetime last_login_at
    }

    IAM_ROLE {
        uuid id PK
        uuid tenant_id FK
        string role_code
        string role_name
        string description
    }

    IAM_PERMISSION {
        uuid id PK
        string permission_code UK
        string module_code
        string resource_name
        string action_name
    }

    IAM_USER_ROLE {
        uuid id PK
        uuid user_id FK
        uuid role_id FK
        uuid company_id FK
        uuid organization_id FK
    }

    IAM_ROLE_PERMISSION {
        uuid id PK
        uuid role_id FK
        uuid permission_id FK
        boolean allowed
    }

    CORE_BUSINESS_DOCUMENT {
        uuid id PK
        uuid tenant_id FK
        uuid company_id FK
        string document_type
        string document_number
        string status
        date document_date
        date posting_date
        int version
        uuid created_by FK
        uuid approved_by FK
        uuid posted_by FK
        uuid reversal_of_id FK
        datetime created_at
        datetime updated_at
    }

    CORE_DOCUMENT_LINK {
        uuid id PK
        uuid source_document_id FK
        uuid target_document_id FK
        string link_type
        datetime created_at
    }

    CORE_WORKFLOW_INSTANCE {
        uuid id PK
        uuid document_id FK
        string workflow_code
        string current_state
        string status
        datetime started_at
        datetime completed_at
    }

    CORE_WORKFLOW_APPROVAL {
        uuid id PK
        uuid workflow_instance_id FK
        uuid approver_user_id FK
        string approval_level
        string decision
        string remarks
        datetime decided_at
    }

    CORE_AUDIT_EVENT {
        uuid id PK
        uuid tenant_id FK
        uuid company_id FK
        uuid document_id FK
        uuid user_id FK
        string entity_name
        uuid entity_id
        string event_type
        json before_data
        json after_data
        datetime occurred_at
    }

    %% =========================================================
    %% SHARED MASTER DATA
    %% =========================================================

    MASTER_PARTY {
        uuid id PK
        uuid tenant_id FK
        string party_code
        string party_type
        string legal_name
        string display_name
        string tax_number
        uuid default_currency_id FK
        string status
    }

    MASTER_PARTY_ROLE {
        uuid id PK
        uuid party_id FK
        string role_type
        date valid_from
        date valid_to
        boolean active
    }

    MASTER_CONTACT {
        uuid id PK
        uuid party_id FK
        string contact_name
        string job_title
        string email
        string phone
        boolean primary_contact
    }

    MASTER_ADDRESS {
        uuid id PK
        uuid party_id FK
        string address_type
        string address_line
        string city
        string province
        string postal_code
        string country_code
        boolean primary_address
    }

    MASTER_CUSTOMER_PROFILE {
        uuid id PK
        uuid party_id FK
        string customer_code
        decimal credit_limit
        boolean credit_hold
        uuid payment_term_id FK
        uuid price_list_id
        uuid receivable_account_id FK
        string risk_category
    }

    MASTER_SUPPLIER_PROFILE {
        uuid id PK
        uuid party_id FK
        string supplier_code
        uuid payment_term_id FK
        int lead_time_days
        decimal minimum_order_value
        uuid payable_account_id FK
        boolean approved_supplier
    }

    MASTER_PRODUCT_CATEGORY {
        uuid id PK
        uuid tenant_id FK
        uuid parent_id FK
        string category_code
        string category_name
        string status
    }

    MASTER_UOM {
        uuid id PK
        uuid tenant_id FK
        string uom_code
        string uom_name
        string dimension_type
        boolean base_uom
    }

    MASTER_PRODUCT {
        uuid id PK
        uuid tenant_id FK
        uuid category_id FK
        uuid base_uom_id FK
        string product_code
        string product_name
        string product_type
        string costing_method
        boolean stock_item
        boolean purchase_item
        boolean sales_item
        boolean manufactured_item
        boolean lot_controlled
        boolean serial_controlled
        string status
    }

    MASTER_CURRENCY {
        uuid id PK
        string currency_code UK
        string currency_name
        string symbol
        int decimal_places
    }

    MASTER_EXCHANGE_RATE {
        uuid id PK
        uuid company_id FK
        uuid from_currency_id FK
        uuid to_currency_id FK
        date rate_date
        decimal exchange_rate
        string rate_source
    }

    MASTER_PAYMENT_TERM {
        uuid id PK
        uuid tenant_id FK
        string term_code
        string term_name
        int due_days
        decimal early_discount_percent
        int early_discount_days
    }

    MASTER_TAX_CODE {
        uuid id PK
        uuid tenant_id FK
        string tax_code
        string tax_name
        string tax_type
        decimal tax_rate
        date effective_from
        date effective_to
        uuid input_account_id FK
        uuid output_account_id FK
    }

    MASTER_COST_CENTER {
        uuid id PK
        uuid company_id FK
        uuid parent_id FK
        string cost_center_code
        string cost_center_name
        string status
    }

    MASTER_DEPARTMENT {
        uuid id PK
        uuid company_id FK
        uuid parent_id FK
        string department_code
        string department_name
        string status
    }

    MASTER_EMPLOYEE {
        uuid id PK
        uuid tenant_id FK
        uuid party_id FK
        uuid department_id FK
        string employee_number
        string employment_status
        decimal standard_hourly_rate
    }

    MASTER_WAREHOUSE {
        uuid id PK
        uuid company_id FK
        string warehouse_code
        string warehouse_name
        string warehouse_type
        string status
    }

    MASTER_WAREHOUSE_LOCATION {
        uuid id PK
        uuid warehouse_id FK
        uuid parent_id FK
        string location_code
        string location_name
        string location_type
        boolean quality_hold
        boolean active
    }

    MASTER_WORK_CENTER {
        uuid id PK
        uuid company_id FK
        string work_center_code
        string work_center_name
        decimal hourly_rate
        decimal capacity_per_day
        string status
    }

    MASTER_MACHINE {
        uuid id PK
        uuid company_id FK
        uuid work_center_id FK
        uuid asset_id FK
        string machine_code
        string machine_name
        decimal hourly_rate
        string status
    }

    %% =========================================================
    %% CRM
    %% =========================================================

    CRM_LEAD {
        uuid id PK
        uuid document_id FK
        uuid tenant_id FK
        uuid company_id FK
        uuid party_id FK
        uuid owner_user_id FK
        string lead_source
        string lead_status
        decimal estimated_value
        date expected_close_date
    }

    CRM_OPPORTUNITY {
        uuid id PK
        uuid document_id FK
        uuid customer_party_id FK
        uuid lead_id FK
        uuid owner_user_id FK
        string pipeline_stage
        decimal probability_percent
        decimal expected_amount
        decimal expected_margin
        date expected_close_date
        string status
    }

    CRM_OPPORTUNITY_PRODUCT {
        uuid id PK
        uuid opportunity_id FK
        uuid product_id FK
        decimal quantity
        uuid uom_id FK
        decimal estimated_unit_price
        decimal estimated_cost
    }

    CRM_ACTIVITY {
        uuid id PK
        uuid opportunity_id FK
        uuid party_id FK
        uuid assigned_user_id FK
        string activity_type
        string subject
        datetime scheduled_at
        datetime completed_at
        string status
    }

    %% =========================================================
    %% SALES, ESTIMATING, CONTRACT, DELIVERY
    %% =========================================================

    SALES_QUOTATION {
        uuid id PK
        uuid document_id FK
        uuid opportunity_id FK
        uuid customer_party_id FK
        uuid currency_id FK
        uuid payment_term_id FK
        date valid_until
        decimal subtotal
        decimal tax_amount
        decimal total_amount
        decimal estimated_total_cost
        decimal estimated_margin
        string status
    }

    SALES_QUOTATION_LINE {
        uuid id PK
        uuid quotation_id FK
        uuid product_id FK
        string description
        decimal quantity
        uuid uom_id FK
        decimal unit_price
        decimal discount_amount
        uuid tax_code_id FK
        decimal line_total
    }

    SALES_QUOTATION_COST {
        uuid id PK
        uuid quotation_line_id FK
        string cost_element
        decimal quantity
        decimal rate
        decimal amount
        string calculation_source
    }

    SALES_CONTRACT {
        uuid id PK
        uuid document_id FK
        uuid customer_party_id FK
        string contract_number
        date start_date
        date end_date
        string contract_type
        string billing_frequency
        string order_frequency
        string status
    }

    SALES_CONTRACT_LINE {
        uuid id PK
        uuid contract_id FK
        uuid product_id FK
        decimal contracted_quantity
        decimal unit_price
        uuid tax_code_id FK
        string recurrence_rule
    }

    SALES_ORDER {
        uuid id PK
        uuid document_id FK
        uuid quotation_id FK
        uuid contract_id FK
        uuid customer_party_id FK
        uuid currency_id FK
        uuid payment_term_id FK
        date order_date
        date requested_delivery_date
        decimal subtotal
        decimal tax_amount
        decimal total_amount
        string status
    }

    SALES_ORDER_LINE {
        uuid id PK
        uuid sales_order_id FK
        uuid product_id FK
        decimal ordered_quantity
        decimal delivered_quantity
        decimal invoiced_quantity
        uuid uom_id FK
        decimal unit_price
        uuid tax_code_id FK
        uuid project_id FK
        string fulfillment_method
    }

    SALES_DELIVERY {
        uuid id PK
        uuid document_id FK
        uuid sales_order_id FK
        uuid customer_party_id FK
        uuid warehouse_id FK
        date delivery_date
        string delivery_status
    }

    SALES_DELIVERY_LINE {
        uuid id PK
        uuid delivery_id FK
        uuid sales_order_line_id FK
        uuid product_id FK
        uuid lot_id FK
        uuid serial_number_id FK
        decimal quantity
        uuid uom_id FK
    }

    SALES_DEMAND_SUPPLY_LINK {
        uuid id PK
        uuid sales_order_line_id FK
        uuid project_id FK
        uuid production_order_id FK
        uuid purchase_order_line_id FK
        uuid stock_reservation_id FK
        decimal demand_quantity
        decimal allocated_quantity
        decimal fulfilled_quantity
        string status
    }

    %% =========================================================
    %% PROJECT MANAGEMENT
    %% =========================================================

    PROJECT_PROJECT {
        uuid id PK
        uuid document_id FK
        uuid tenant_id FK
        uuid company_id FK
        uuid customer_party_id FK
        uuid sales_order_id FK
        uuid project_manager_id FK
        uuid cost_center_id FK
        string project_code
        string project_name
        date planned_start_date
        date planned_end_date
        date actual_start_date
        date actual_end_date
        decimal budget_amount
        decimal progress_percent
        string status
    }

    PROJECT_MEMBER {
        uuid id PK
        uuid project_id FK
        uuid user_id FK
        uuid employee_id FK
        string project_role
        date joined_at
        date left_at
    }

    PROJECT_TASK {
        uuid id PK
        uuid project_id FK
        uuid parent_task_id FK
        uuid work_center_id FK
        uuid production_order_id FK
        string task_code
        string task_name
        datetime planned_start_at
        datetime planned_end_at
        datetime actual_start_at
        datetime actual_end_at
        decimal planned_hours
        decimal actual_hours
        decimal progress_percent
        string status
    }

    PROJECT_TASK_DEPENDENCY {
        uuid id PK
        uuid predecessor_task_id FK
        uuid successor_task_id FK
        string dependency_type
        int lag_minutes
    }

    PROJECT_MILESTONE {
        uuid id PK
        uuid project_id FK
        string milestone_name
        date planned_date
        date actual_date
        decimal weight_percent
        string status
    }

    PROJECT_MATERIAL_REQUIREMENT {
        uuid id PK
        uuid project_id FK
        uuid task_id FK
        uuid product_id FK
        uuid warehouse_id FK
        decimal required_quantity
        decimal reserved_quantity
        decimal issued_quantity
        date required_date
        string status
    }

    PROJECT_BUDGET_LINE {
        uuid id PK
        uuid project_id FK
        string cost_element
        uuid account_id FK
        uuid cost_center_id FK
        decimal budget_quantity
        decimal budget_rate
        decimal budget_amount
    }

    PROJECT_TIMESHEET {
        uuid id PK
        uuid project_id FK
        uuid task_id FK
        uuid employee_id FK
        date work_date
        decimal hours
        decimal hourly_rate
        decimal amount
        string approval_status
    }

    PROJECT_CHANGE_REQUEST {
        uuid id PK
        uuid document_id FK
        uuid project_id FK
        string change_type
        string description
        decimal schedule_impact_days
        decimal cost_impact
        string approval_status
    }

    %% =========================================================
    %% PROCUREMENT
    %% =========================================================

    PROC_PURCHASE_REQUISITION {
        uuid id PK
        uuid document_id FK
        uuid company_id FK
        uuid project_id FK
        uuid requested_by FK
        date request_date
        date required_date
        string status
    }

    PROC_PURCHASE_REQUISITION_LINE {
        uuid id PK
        uuid requisition_id FK
        uuid product_id FK
        decimal requested_quantity
        uuid uom_id FK
        uuid warehouse_id FK
        uuid project_material_requirement_id FK
    }

    PROC_RFQ {
        uuid id PK
        uuid document_id FK
        uuid requisition_id FK
        date issue_date
        date closing_date
        string status
    }

    PROC_SUPPLIER_QUOTATION {
        uuid id PK
        uuid document_id FK
        uuid rfq_id FK
        uuid supplier_party_id FK
        uuid currency_id FK
        date quotation_date
        date valid_until
        decimal total_amount
        string evaluation_status
    }

    PROC_PURCHASE_ORDER {
        uuid id PK
        uuid document_id FK
        uuid supplier_quotation_id FK
        uuid supplier_party_id FK
        uuid currency_id FK
        uuid payment_term_id FK
        date order_date
        date expected_receipt_date
        decimal subtotal
        decimal tax_amount
        decimal total_amount
        string status
    }

    PROC_PURCHASE_ORDER_LINE {
        uuid id PK
        uuid purchase_order_id FK
        uuid requisition_line_id FK
        uuid product_id FK
        decimal ordered_quantity
        decimal received_quantity
        decimal invoiced_quantity
        uuid uom_id FK
        decimal unit_price
        uuid tax_code_id FK
        uuid project_id FK
    }

    PROC_GOODS_RECEIPT {
        uuid id PK
        uuid document_id FK
        uuid purchase_order_id FK
        uuid supplier_party_id FK
        uuid warehouse_id FK
        date receipt_date
        string inspection_status
        string status
    }

    PROC_GOODS_RECEIPT_LINE {
        uuid id PK
        uuid goods_receipt_id FK
        uuid purchase_order_line_id FK
        uuid product_id FK
        uuid lot_id FK
        uuid serial_number_id FK
        decimal received_quantity
        decimal accepted_quantity
        decimal rejected_quantity
        uuid uom_id FK
    }

    PROC_THREE_WAY_MATCH {
        uuid id PK
        uuid purchase_order_id FK
        uuid goods_receipt_id FK
        uuid supplier_invoice_id FK
        decimal quantity_variance
        decimal price_variance
        decimal tax_variance
        string match_status
        uuid reviewed_by FK
        datetime reviewed_at
    }

    %% =========================================================
    %% INVENTORY AND WAREHOUSE
    %% =========================================================

    INV_LOT {
        uuid id PK
        uuid product_id FK
        string lot_number
        date manufacture_date
        date expiry_date
        string quality_status
    }

    INV_SERIAL_NUMBER {
        uuid id PK
        uuid product_id FK
        string serial_number UK
        uuid current_location_id FK
        string status
    }

    INV_STOCK_MOVE {
        uuid id PK
        uuid document_id FK
        uuid company_id FK
        string move_type
        uuid source_location_id FK
        uuid destination_location_id FK
        uuid project_id FK
        uuid production_order_id FK
        datetime scheduled_at
        datetime completed_at
        string status
    }

    INV_STOCK_MOVE_LINE {
        uuid id PK
        uuid stock_move_id FK
        uuid product_id FK
        uuid lot_id FK
        uuid serial_number_id FK
        decimal quantity
        uuid uom_id FK
        decimal unit_cost
        decimal total_value
    }

    INV_STOCK_RESERVATION {
        uuid id PK
        uuid product_id FK
        uuid warehouse_location_id FK
        uuid project_id FK
        uuid sales_order_line_id FK
        uuid production_order_id FK
        decimal reserved_quantity
        date required_date
        string status
    }

    INV_STOCK_LEDGER_ENTRY {
        uuid id PK
        uuid tenant_id FK
        uuid company_id FK
        uuid product_id FK
        uuid warehouse_location_id FK
        uuid lot_id FK
        uuid serial_number_id FK
        uuid source_document_id FK
        uuid source_line_id FK
        uuid project_id FK
        uuid production_order_id FK
        datetime posting_at
        decimal quantity_delta
        decimal value_delta
        decimal unit_cost
        decimal balance_quantity
        decimal balance_value
        uuid reversal_of_id FK
    }

    INV_STOCK_BALANCE {
        uuid id PK
        uuid company_id FK
        uuid product_id FK
        uuid warehouse_location_id FK
        uuid lot_id FK
        uuid serial_number_id FK
        decimal on_hand_quantity
        decimal reserved_quantity
        decimal available_quantity
        decimal inventory_value
        uuid last_ledger_entry_id FK
    }

    INV_VALUATION_LAYER {
        uuid id PK
        uuid product_id FK
        uuid warehouse_id FK
        uuid receipt_ledger_entry_id FK
        decimal original_quantity
        decimal remaining_quantity
        decimal unit_cost
        decimal remaining_value
        datetime received_at
    }

    INV_STOCK_COUNT {
        uuid id PK
        uuid document_id FK
        uuid warehouse_id FK
        date count_date
        string count_type
        string status
    }

    INV_STOCK_COUNT_LINE {
        uuid id PK
        uuid stock_count_id FK
        uuid product_id FK
        uuid location_id FK
        uuid lot_id FK
        decimal system_quantity
        decimal counted_quantity
        decimal variance_quantity
        decimal variance_value
    }

    %% =========================================================
    %% MANUFACTURING
    %% =========================================================

    MFG_BOM {
        uuid id PK
        uuid tenant_id FK
        uuid product_id FK
        string bom_code
        string status
    }

    MFG_BOM_VERSION {
        uuid id PK
        uuid bom_id FK
        int version_number
        date effective_from
        date effective_to
        decimal output_quantity
        uuid output_uom_id FK
        string status
    }

    MFG_BOM_LINE {
        uuid id PK
        uuid bom_version_id FK
        uuid component_product_id FK
        uuid operation_id FK
        decimal quantity
        uuid uom_id FK
        decimal scrap_percent
        string issue_method
    }

    MFG_ROUTING {
        uuid id PK
        uuid tenant_id FK
        string routing_code
        string routing_name
        string status
    }

    MFG_ROUTING_OPERATION {
        uuid id PK
        uuid routing_id FK
        uuid work_center_id FK
        int sequence_number
        string operation_name
        decimal setup_minutes
        decimal run_minutes_per_unit
    }

    MFG_PRODUCTION_ORDER {
        uuid id PK
        uuid document_id FK
        uuid company_id FK
        uuid product_id FK
        uuid bom_version_id FK
        uuid routing_id FK
        uuid project_id FK
        uuid sales_order_line_id FK
        uuid warehouse_id FK
        decimal planned_quantity
        decimal completed_quantity
        decimal scrapped_quantity
        datetime planned_start_at
        datetime planned_end_at
        datetime actual_start_at
        datetime actual_end_at
        string material_status
        string quality_status
        string status
    }

    MFG_PRODUCTION_MATERIAL {
        uuid id PK
        uuid production_order_id FK
        uuid product_id FK
        uuid warehouse_id FK
        decimal required_quantity
        decimal reserved_quantity
        decimal issued_quantity
        decimal returned_quantity
        decimal actual_cost
    }

    MFG_WORK_ORDER {
        uuid id PK
        uuid document_id FK
        uuid production_order_id FK
        uuid routing_operation_id FK
        uuid work_center_id FK
        uuid machine_id FK
        int sequence_number
        datetime planned_start_at
        datetime planned_end_at
        datetime actual_start_at
        datetime actual_end_at
        decimal planned_quantity
        decimal completed_quantity
        decimal rejected_quantity
        string status
    }

    MFG_LABOR_LOG {
        uuid id PK
        uuid work_order_id FK
        uuid employee_id FK
        uuid project_id FK
        datetime start_at
        datetime end_at
        decimal duration_hours
        decimal hourly_rate
        decimal labor_cost
    }

    MFG_MACHINE_LOG {
        uuid id PK
        uuid work_order_id FK
        uuid machine_id FK
        uuid project_id FK
        datetime start_at
        datetime end_at
        decimal run_hours
        decimal setup_hours
        decimal downtime_hours
        decimal hourly_rate
        decimal machine_cost
    }

    MFG_PRODUCTION_OUTPUT {
        uuid id PK
        uuid production_order_id FK
        uuid product_id FK
        uuid lot_id FK
        decimal output_quantity
        decimal unit_cost
        decimal total_cost
        uuid destination_location_id FK
        datetime produced_at
    }

    MFG_SCRAP {
        uuid id PK
        uuid production_order_id FK
        uuid work_order_id FK
        uuid product_id FK
        decimal scrap_quantity
        decimal scrap_value
        string reason_code
        string disposition
    }

    MFG_COST_LEDGER_ENTRY {
        uuid id PK
        uuid company_id FK
        uuid project_id FK
        uuid production_order_id FK
        uuid work_order_id FK
        uuid product_id FK
        string cost_element
        decimal quantity
        decimal rate
        decimal amount
        uuid stock_ledger_entry_id FK
        uuid journal_line_id FK
        uuid source_document_id FK
        datetime posting_at
        uuid reversal_of_id FK
    }

    %% =========================================================
    %% QUALITY ASSURANCE
    %% =========================================================

    QA_QUALITY_PLAN {
        uuid id PK
        uuid tenant_id FK
        uuid product_id FK
        string plan_code
        string inspection_stage
        string status
    }

    QA_QUALITY_PLAN_POINT {
        uuid id PK
        uuid quality_plan_id FK
        int sequence_number
        string parameter_name
        string measurement_type
        decimal minimum_value
        decimal maximum_value
        decimal target_value
        boolean mandatory
    }

    QA_INSPECTION {
        uuid id PK
        uuid document_id FK
        uuid quality_plan_id FK
        uuid product_id FK
        uuid lot_id FK
        uuid goods_receipt_id FK
        uuid production_order_id FK
        uuid work_order_id FK
        uuid inspector_user_id FK
        string inspection_type
        decimal quantity_inspected
        decimal quantity_accepted
        decimal quantity_rejected
        datetime inspection_at
        string result
        string status
    }

    QA_INSPECTION_RESULT {
        uuid id PK
        uuid inspection_id FK
        uuid plan_point_id FK
        decimal numeric_value
        string text_value
        boolean passed
        string remarks
    }

    QA_NONCONFORMANCE {
        uuid id PK
        uuid document_id FK
        uuid inspection_id FK
        string severity
        string description
        string disposition
        string status
    }

    QA_CORRECTIVE_ACTION {
        uuid id PK
        uuid nonconformance_id FK
        uuid assigned_user_id FK
        string action_description
        date due_date
        date completed_date
        string verification_result
        string status
    }

    %% =========================================================
    %% ACCOUNTING AND FINANCE
    %% =========================================================

    FIN_FISCAL_YEAR {
        uuid id PK
        uuid company_id FK
        string fiscal_year_name
        date start_date
        date end_date
        string status
    }

    FIN_FISCAL_PERIOD {
        uuid id PK
        uuid fiscal_year_id FK
        int period_number
        date start_date
        date end_date
        string status
    }

    FIN_ACCOUNT {
        uuid id PK
        uuid company_id FK
        uuid parent_account_id FK
        string account_code
        string account_name
        string account_type
        string normal_balance
        uuid currency_id FK
        boolean allow_manual_posting
        boolean reconciliation_required
        string status
    }

    FIN_JOURNAL {
        uuid id PK
        uuid company_id FK
        string journal_code
        string journal_name
        string journal_type
        string status
    }

    FIN_JOURNAL_ENTRY {
        uuid id PK
        uuid document_id FK
        uuid journal_id FK
        uuid fiscal_period_id FK
        uuid currency_id FK
        string entry_number
        date posting_date
        decimal exchange_rate
        string description
        uuid source_document_id FK
        uuid reversal_of_entry_id FK
        string status
    }

    FIN_JOURNAL_LINE {
        uuid id PK
        uuid journal_entry_id FK
        uuid account_id FK
        uuid party_id FK
        uuid project_id FK
        uuid cost_center_id FK
        uuid department_id FK
        uuid product_id FK
        uuid warehouse_id FK
        decimal debit_base
        decimal credit_base
        uuid transaction_currency_id FK
        decimal transaction_amount
        date due_date
        uuid source_document_line_id FK
    }

    FIN_BILLING_DOCUMENT {
        uuid id PK
        uuid document_id FK
        uuid company_id FK
        uuid party_id FK
        uuid currency_id FK
        uuid payment_term_id FK
        uuid sales_order_id FK
        uuid purchase_order_id FK
        uuid project_id FK
        string billing_type
        string invoice_number
        date invoice_date
        date posting_date
        date due_date
        decimal subtotal
        decimal tax_amount
        decimal total_amount
        decimal paid_amount
        decimal outstanding_amount
        string payment_status
        string status
    }

    FIN_BILLING_DOCUMENT_LINE {
        uuid id PK
        uuid billing_document_id FK
        uuid product_id FK
        uuid account_id FK
        uuid project_id FK
        uuid cost_center_id FK
        decimal quantity
        uuid uom_id FK
        decimal unit_price
        decimal discount_amount
        uuid tax_code_id FK
        decimal line_total
    }

    FIN_AR_AP_SCHEDULE {
        uuid id PK
        uuid billing_document_id FK
        int installment_number
        date due_date
        decimal original_amount
        decimal paid_amount
        decimal outstanding_amount
        string status
    }

    FIN_PAYMENT {
        uuid id PK
        uuid document_id FK
        uuid company_id FK
        uuid party_id FK
        uuid bank_account_id FK
        uuid currency_id FK
        string payment_type
        date payment_date
        decimal amount
        string payment_method
        string reference_number
        uuid journal_entry_id FK
        string status
    }

    FIN_PAYMENT_ALLOCATION {
        uuid id PK
        uuid payment_id FK
        uuid billing_document_id FK
        uuid schedule_id FK
        decimal allocated_amount
        decimal discount_amount
        decimal write_off_amount
        decimal exchange_difference
    }

    FIN_BANK_ACCOUNT {
        uuid id PK
        uuid company_id FK
        uuid party_id FK
        uuid ledger_account_id FK
        uuid currency_id FK
        string bank_name
        string account_number
        string account_name
        string status
    }

    FIN_BANK_STATEMENT {
        uuid id PK
        uuid bank_account_id FK
        date statement_date
        decimal opening_balance
        decimal closing_balance
        string status
    }

    FIN_BANK_STATEMENT_LINE {
        uuid id PK
        uuid bank_statement_id FK
        date transaction_date
        string reference_number
        string description
        decimal debit_amount
        decimal credit_amount
        decimal running_balance
    }

    FIN_BANK_RECONCILIATION {
        uuid id PK
        uuid bank_statement_line_id FK
        uuid payment_id FK
        uuid journal_line_id FK
        decimal matched_amount
        string match_type
        string status
    }

    FIN_TAX_TRANSACTION {
        uuid id PK
        uuid billing_document_id FK
        uuid billing_document_line_id FK
        uuid tax_code_id FK
        decimal taxable_amount
        decimal tax_rate
        decimal tax_amount
        string tax_direction
        date tax_date
    }

    FIN_BUDGET {
        uuid id PK
        uuid company_id FK
        uuid fiscal_year_id FK
        string budget_name
        string budget_type
        string status
    }

    FIN_BUDGET_LINE {
        uuid id PK
        uuid budget_id FK
        uuid account_id FK
        uuid project_id FK
        uuid cost_center_id FK
        uuid department_id FK
        int period_number
        decimal budget_amount
    }

    FIN_PERIOD_CLOSING {
        uuid id PK
        uuid document_id FK
        uuid fiscal_period_id FK
        uuid executed_by FK
        datetime started_at
        datetime completed_at
        string closing_type
        string status
    }

    %% =========================================================
    %% FIXED ASSETS
    %% =========================================================

    ASSET_CATEGORY {
        uuid id PK
        uuid company_id FK
        string category_code
        string category_name
        uuid asset_account_id FK
        uuid accumulated_depreciation_account_id FK
        uuid depreciation_expense_account_id FK
    }

    ASSET_ASSET {
        uuid id PK
        uuid document_id FK
        uuid company_id FK
        uuid category_id FK
        uuid supplier_party_id FK
        uuid warehouse_location_id FK
        uuid department_id FK
        uuid project_id FK
        string asset_code
        string asset_name
        string serial_number
        date acquisition_date
        date available_for_use_date
        decimal acquisition_cost
        decimal salvage_value
        int useful_life_months
        string status
    }

    ASSET_BOOK {
        uuid id PK
        uuid asset_id FK
        string book_type
        string depreciation_method
        decimal cost_basis
        decimal salvage_value
        int useful_life_periods
        date depreciation_start_date
        decimal accumulated_depreciation
        decimal net_book_value
    }

    ASSET_DEPRECIATION_LINE {
        uuid id PK
        uuid asset_book_id FK
        uuid fiscal_period_id FK
        date depreciation_date
        decimal opening_book_value
        decimal depreciation_amount
        decimal accumulated_depreciation
        decimal closing_book_value
        uuid journal_entry_id FK
        string status
    }

    ASSET_MAINTENANCE {
        uuid id PK
        uuid asset_id FK
        uuid machine_id FK
        date scheduled_date
        date completed_date
        string maintenance_type
        decimal maintenance_cost
        string status
    }

    ASSET_DISPOSAL {
        uuid id PK
        uuid document_id FK
        uuid asset_id FK
        date disposal_date
        decimal disposal_proceeds
        decimal net_book_value
        decimal gain_or_loss
        uuid journal_entry_id FK
        string status
    }

    %% =========================================================
    %% CUSTOMER SERVICE
    %% =========================================================

    SERVICE_CASE {
        uuid id PK
        uuid document_id FK
        uuid customer_party_id FK
        uuid contact_id FK
        uuid sales_order_id FK
        uuid billing_document_id FK
        uuid product_id FK
        uuid serial_number_id FK
        uuid assigned_user_id FK
        string priority
        string subject
        string description
        datetime sla_due_at
        datetime resolved_at
        string status
    }

    SERVICE_CASE_MESSAGE {
        uuid id PK
        uuid service_case_id FK
        uuid sender_user_id FK
        string channel
        string message_text
        datetime sent_at
    }

    SERVICE_CASE_APPROVAL {
        uuid id PK
        uuid service_case_id FK
        uuid approver_user_id FK
        string approval_type
        decimal approved_amount
        string decision
        datetime decided_at
    }

    SERVICE_RESOLUTION {
        uuid id PK
        uuid service_case_id FK
        string resolution_type
        string resolution_notes
        uuid credit_note_id FK
        uuid replacement_delivery_id FK
        datetime resolved_at
    }

    %% =========================================================
    %% ACCESS GOVERNANCE, ROLE HIERARCHY, DATA SCOPE, SHARING
    %% =========================================================

    IAM_ROLE_HIERARCHY {
        uuid id PK
        uuid parent_role_id FK
        uuid child_role_id FK
        string inheritance_mode
        boolean active
    }

    IAM_DATA_SCOPE_POLICY {
        uuid id PK
        uuid tenant_id FK
        string policy_code UK
        string module_code
        string entity_name
        string scope_type
        json condition_json
        boolean active
    }

    IAM_ROLE_DATA_SCOPE {
        uuid id PK
        uuid role_id FK
        uuid policy_id FK
        string access_level
        boolean can_export
        boolean can_share
    }

    IAM_FIELD_PERMISSION {
        uuid id PK
        uuid role_id FK
        string module_code
        string entity_name
        string field_name
        boolean can_view
        boolean can_edit
        string masking_type
    }

    IAM_INFORMATION_SHARE_RULE {
        uuid id PK
        uuid tenant_id FK
        string source_module_code
        string target_module_code
        string entity_name
        string field_set_code
        string share_direction
        json filter_json
        string access_level
        boolean active
    }

    IAM_APPROVAL_LIMIT {
        uuid id PK
        uuid role_id FK
        uuid user_id FK
        uuid currency_id FK
        string approval_type
        decimal minimum_amount
        decimal maximum_amount
        boolean active
    }

    IAM_USER_PROJECT_ACCESS {
        uuid id PK
        uuid user_id FK
        uuid project_id FK
        string project_role
        string access_level
        date valid_from
        date valid_to
    }

    %% =========================================================
    %% DASHBOARD, KPI, ANALYTICS, ALERT, NOTIFICATION, QUICK ACTION
    %% =========================================================

    ANALYTICS_DASHBOARD {
        uuid id PK
        uuid tenant_id FK
        uuid company_id FK
        string dashboard_code UK
        string dashboard_name
        string module_code
        string dashboard_type
        boolean realtime_enabled
        string status
    }

    ANALYTICS_DASHBOARD_ROLE {
        uuid id PK
        uuid dashboard_id FK
        uuid role_id FK
        boolean is_default
        boolean can_customize
    }

    ANALYTICS_WIDGET {
        uuid id PK
        uuid dashboard_id FK
        string widget_code
        string widget_name
        string widget_type
        string data_source_type
        string data_source_name
        json filter_json
        json layout_json
        int refresh_seconds
        boolean active
    }

    ANALYTICS_KPI_DEFINITION {
        uuid id PK
        uuid tenant_id FK
        string kpi_code UK
        string kpi_name
        string module_code
        string measurement_unit
        string aggregation_method
        string source_entity
        string formula_expression
        string period_type
        boolean active
    }

    ANALYTICS_KPI_TARGET {
        uuid id PK
        uuid kpi_definition_id FK
        uuid company_id FK
        uuid organization_id FK
        uuid project_id FK
        uuid owner_user_id FK
        date period_start
        date period_end
        decimal target_value
        decimal warning_value
        decimal critical_value
    }

    ANALYTICS_KPI_RESULT {
        uuid id PK
        uuid kpi_definition_id FK
        uuid company_id FK
        uuid organization_id FK
        uuid project_id FK
        uuid owner_user_id FK
        datetime measured_at
        decimal actual_value
        decimal target_value
        string health_status
        json dimension_json
    }

    ANALYTICS_ALERT_RULE {
        uuid id PK
        uuid tenant_id FK
        uuid kpi_definition_id FK
        string rule_code UK
        string module_code
        string entity_name
        string operator
        decimal threshold_value
        string severity
        json condition_json
        boolean active
    }

    ANALYTICS_ALERT_EVENT {
        uuid id PK
        uuid alert_rule_id FK
        uuid company_id FK
        uuid project_id FK
        uuid source_document_id FK
        uuid source_entity_id
        decimal measured_value
        string severity
        string message
        datetime triggered_at
        datetime acknowledged_at
        uuid acknowledged_by FK
        string status
    }

    CORE_NOTIFICATION {
        uuid id PK
        uuid tenant_id FK
        uuid company_id FK
        uuid source_document_id FK
        uuid alert_event_id FK
        string notification_type
        string title
        string message
        string action_url
        string priority
        datetime created_at
        datetime expires_at
    }

    CORE_NOTIFICATION_RECIPIENT {
        uuid id PK
        uuid notification_id FK
        uuid recipient_user_id FK
        uuid recipient_role_id FK
        datetime delivered_at
        datetime read_at
        datetime dismissed_at
        string delivery_status
    }

    CORE_QUICK_ACTION {
        uuid id PK
        uuid tenant_id FK
        string action_code UK
        string action_name
        string module_code
        string entity_name
        string route_path
        uuid required_permission_id FK
        json default_payload
        boolean active
    }

    %% =========================================================
    %% FILE, ATTACHMENT, TEMPLATE, DOCUMENT BUILDER, SIGNATURE
    %% =========================================================

    CORE_FILE {
        uuid id PK
        uuid tenant_id FK
        uuid company_id FK
        string file_name
        string storage_key
        string mime_type
        bigint file_size
        string checksum
        uuid uploaded_by FK
        datetime uploaded_at
        string status
    }

    CORE_DOCUMENT_ATTACHMENT {
        uuid id PK
        uuid document_id FK
        uuid file_id FK
        string attachment_type
        int sort_order
        boolean visible_to_customer
    }

    CORE_DOCUMENT_TEMPLATE {
        uuid id PK
        uuid tenant_id FK
        uuid company_id FK
        string template_code UK
        string template_name
        string document_type
        string output_format
        string status
    }

    CORE_DOCUMENT_TEMPLATE_VERSION {
        uuid id PK
        uuid template_id FK
        int version_number
        text header_markup
        text body_markup
        text footer_markup
        json style_json
        date effective_from
        date effective_to
        string status
    }

    CORE_DOCUMENT_TEMPLATE_FIELD {
        uuid id PK
        uuid template_version_id FK
        string field_code
        string source_path
        string field_type
        string format_pattern
        boolean required
        int sort_order
    }

    CORE_GENERATED_DOCUMENT {
        uuid id PK
        uuid business_document_id FK
        uuid template_version_id FK
        uuid file_id FK
        int generation_number
        string generation_status
        uuid generated_by FK
        datetime generated_at
    }

    CORE_DOCUMENT_SIGNATURE {
        uuid id PK
        uuid generated_document_id FK
        uuid signer_user_id FK
        uuid signer_party_id FK
        string signature_type
        string signature_status
        datetime requested_at
        datetime signed_at
        string verification_reference
    }

    %% =========================================================
    %% FINANCE DASHBOARD, HPP, RECURRING PAYMENT, CREDIT, WIP,
    %% PROJECT FUNDING, IDEAL VS ACTUAL COST, OVERHEAD
    %% =========================================================

    FIN_FINANCIAL_SNAPSHOT {
        uuid id PK
        uuid company_id FK
        uuid fiscal_period_id FK
        datetime snapshot_at
        decimal revenue_amount
        decimal expense_amount
        decimal profit_loss_amount
        decimal operating_cashflow
        decimal investing_cashflow
        decimal financing_cashflow
        decimal cash_balance
        string snapshot_status
    }

    FIN_UNIT_COST_SNAPSHOT {
        uuid id PK
        uuid company_id FK
        uuid project_id FK
        uuid production_order_id FK
        uuid product_id FK
        string cost_unit_code
        datetime snapshot_at
        decimal material_cost
        decimal labor_cost
        decimal machine_cost
        decimal overhead_cost
        decimal total_cost
        decimal output_quantity
        decimal unit_cost
    }

    FIN_RECURRING_PAYMENT_RULE {
        uuid id PK
        uuid company_id FK
        uuid party_id FK
        uuid bank_account_id FK
        uuid expense_account_id FK
        uuid currency_id FK
        string rule_code UK
        decimal amount
        string recurrence_rule
        date next_run_date
        date end_date
        boolean approval_required
        string status
    }

    FIN_RECURRING_PAYMENT_RUN {
        uuid id PK
        uuid recurring_rule_id FK
        uuid payment_id FK
        date scheduled_date
        datetime executed_at
        string run_status
        string failure_reason
    }

    FIN_CREDIT_FACILITY {
        uuid id PK
        uuid company_id FK
        uuid party_id FK
        uuid currency_id FK
        string facility_type
        string facility_number
        decimal credit_limit
        decimal utilized_amount
        decimal available_amount
        date effective_from
        date effective_to
        string status
    }

    FIN_PROJECT_WIP_SNAPSHOT {
        uuid id PK
        uuid project_id FK
        uuid fiscal_period_id FK
        date snapshot_date
        decimal completion_percent
        decimal recognized_revenue
        decimal recognized_cost
        decimal wip_asset_amount
        decimal accrued_billing_amount
        decimal unbilled_amount
        string status
    }

    FIN_PROJECT_FUNDING {
        uuid id PK
        uuid document_id FK
        uuid project_id FK
        uuid funding_source_party_id FK
        uuid currency_id FK
        string funding_type
        decimal approved_limit
        decimal interest_rate
        date start_date
        date maturity_date
        string status
    }

    FIN_PROJECT_FUNDING_TRANSACTION {
        uuid id PK
        uuid project_funding_id FK
        uuid payment_id FK
        uuid journal_entry_id FK
        string transaction_type
        date transaction_date
        decimal amount
        decimal outstanding_balance
    }

    FIN_COST_BASELINE {
        uuid id PK
        uuid document_id FK
        uuid project_id FK
        int baseline_version
        date effective_date
        decimal total_ideal_cost
        uuid approved_by FK
        string status
    }

    FIN_COST_BASELINE_LINE {
        uuid id PK
        uuid cost_baseline_id FK
        uuid product_id FK
        uuid account_id FK
        uuid cost_center_id FK
        string cost_element
        decimal quantity
        decimal unit_rate
        decimal ideal_amount
    }

    FIN_COST_VARIANCE {
        uuid id PK
        uuid project_id FK
        uuid cost_baseline_line_id FK
        uuid fiscal_period_id FK
        decimal actual_amount
        decimal ideal_amount
        decimal variance_amount
        decimal variance_percent
        datetime calculated_at
    }

    FIN_OVERHEAD_RULE {
        uuid id PK
        uuid company_id FK
        uuid source_account_id FK
        uuid target_cost_center_id FK
        string rule_code UK
        string allocation_basis
        decimal rate_percent
        date effective_from
        date effective_to
        string status
    }

    FIN_OVERHEAD_ALLOCATION {
        uuid id PK
        uuid overhead_rule_id FK
        uuid project_id FK
        uuid production_order_id FK
        uuid fiscal_period_id FK
        uuid journal_entry_id FK
        decimal basis_quantity
        decimal allocated_amount
        datetime posted_at
        string status
    }

    FIN_PROJECT_COST_SNAPSHOT {
        uuid id PK
        uuid project_id FK
        datetime snapshot_at
        decimal budget_amount
        decimal committed_cost
        decimal actual_cost
        decimal overhead_cost
        decimal forecast_cost
        decimal cost_variance
        decimal remaining_budget
    }

    %% =========================================================
    %% PROJECT DASHBOARD, HEALTH, KANBAN, TECHNICAL BRIEF,
    %% RESOURCE REQUEST, EXECUTION PROGRESS, TIMELINE AND COST
    %% =========================================================

    PROJECT_BOARD {
        uuid id PK
        uuid project_id FK
        string board_name
        string board_type
        boolean default_board
        string status
    }

    PROJECT_BOARD_COLUMN {
        uuid id PK
        uuid board_id FK
        string column_name
        string mapped_task_status
        int position_order
        int wip_limit
    }

    PROJECT_TASK_BOARD_POSITION {
        uuid id PK
        uuid task_id FK
        uuid board_column_id FK
        decimal position_order
        datetime moved_at
        uuid moved_by FK
    }

    PROJECT_HEALTH_RULE {
        uuid id PK
        uuid company_id FK
        string rule_code UK
        string health_dimension
        string operator
        decimal warning_threshold
        decimal critical_threshold
        decimal weight_percent
        boolean active
    }

    PROJECT_HEALTH_SNAPSHOT {
        uuid id PK
        uuid project_id FK
        datetime snapshot_at
        decimal schedule_score
        decimal cost_score
        decimal quality_score
        decimal resource_score
        decimal risk_score
        decimal overall_score
        string health_status
        json explanation_json
    }

    PROJECT_RISK {
        uuid id PK
        uuid document_id FK
        uuid project_id FK
        uuid owner_user_id FK
        string risk_code
        string risk_category
        string description
        int probability_score
        int impact_score
        int risk_score
        string mitigation_plan
        date due_date
        string status
    }

    PROJECT_ISSUE {
        uuid id PK
        uuid document_id FK
        uuid project_id FK
        uuid task_id FK
        uuid assigned_user_id FK
        string issue_type
        string severity
        string description
        date due_date
        datetime resolved_at
        string status
    }

    PROJECT_TECHNICAL_BRIEF {
        uuid id PK
        uuid document_id FK
        uuid project_id FK
        uuid sales_order_id FK
        string brief_number
        string brief_title
        text objective
        text scope_summary
        uuid owner_user_id FK
        string approval_status
        string status
    }

    PROJECT_TECHNICAL_BRIEF_VERSION {
        uuid id PK
        uuid technical_brief_id FK
        int version_number
        text specification_text
        json specification_json
        uuid file_id FK
        uuid created_by FK
        datetime created_at
        string status
    }

    PROJECT_REQUIREMENT {
        uuid id PK
        uuid technical_brief_id FK
        uuid parent_requirement_id FK
        string requirement_code
        string requirement_type
        string requirement_text
        string priority
        string verification_method
        string status
    }

    PROJECT_ACCEPTANCE_CRITERIA {
        uuid id PK
        uuid requirement_id FK
        string criteria_text
        string expected_result
        string actual_result
        boolean passed
        uuid verified_by FK
        datetime verified_at
    }

    PROJECT_RESOURCE_REQUEST {
        uuid id PK
        uuid document_id FK
        uuid project_id FK
        uuid task_id FK
        uuid requested_by FK
        date request_date
        date required_date
        string request_type
        string priority
        string approval_status
        string status
    }

    PROJECT_RESOURCE_REQUEST_LINE {
        uuid id PK
        uuid resource_request_id FK
        uuid product_id FK
        uuid employee_id FK
        uuid machine_id FK
        uuid work_center_id FK
        uuid uom_id FK
        string resource_type
        decimal requested_quantity
        decimal requested_hours
        string specification
    }

    PROJECT_RESOURCE_ALLOCATION {
        uuid id PK
        uuid resource_request_line_id FK
        uuid stock_reservation_id FK
        uuid employee_id FK
        uuid machine_id FK
        datetime allocation_start_at
        datetime allocation_end_at
        decimal allocated_quantity
        decimal allocated_hours
        decimal estimated_cost
        decimal actual_cost
        string status
    }

    PROJECT_PROGRESS_SNAPSHOT {
        uuid id PK
        uuid project_id FK
        uuid work_order_id FK
        datetime snapshot_at
        decimal planned_progress_percent
        decimal actual_progress_percent
        decimal earned_value
        decimal planned_value
        decimal actual_cost
        string progress_status
    }

    PROJECT_EQUIPMENT_USAGE {
        uuid id PK
        uuid project_id FK
        uuid task_id FK
        uuid machine_id FK
        uuid asset_id FK
        uuid employee_id FK
        datetime start_at
        datetime end_at
        decimal usage_hours
        decimal hourly_rate
        decimal total_cost
        string status
    }

    PROJECT_WEIGHT_INDICATOR {
        uuid id PK
        uuid project_id FK
        uuid opportunity_id FK
        uuid sales_order_id FK
        uuid currency_id FK
        decimal base_project_value
        decimal weight_percent
        decimal weighted_project_value
        datetime calculated_at
        string status
    }

    PROJECT_WEIGHT_COMPONENT {
        uuid id PK
        uuid project_weight_indicator_id FK
        string component_code
        string component_name
        decimal raw_value
        decimal normalized_score
        decimal component_weight
        decimal weighted_score
    }

    %% =========================================================
    %% SALES PIPELINE, EXECUTIVE APPROVAL, CREDIT STATUS,
    %% ORDER CHANGE, REPEAT ORDER AUTOMATION
    %% =========================================================

    CRM_PIPELINE {
        uuid id PK
        uuid tenant_id FK
        uuid company_id FK
        string pipeline_code UK
        string pipeline_name
        boolean default_pipeline
        string status
    }

    CRM_PIPELINE_STAGE {
        uuid id PK
        uuid pipeline_id FK
        string stage_code
        string stage_name
        int position_order
        decimal default_probability_percent
        boolean closed_won
        boolean closed_lost
        string status
    }

    CRM_OPPORTUNITY_STAGE_HISTORY {
        uuid id PK
        uuid opportunity_id FK
        uuid from_stage_id FK
        uuid to_stage_id FK
        uuid changed_by FK
        datetime changed_at
        string change_reason
    }

    CRM_EXECUTIVE_APPROVAL {
        uuid id PK
        uuid document_id FK
        uuid opportunity_id FK
        uuid quotation_id FK
        uuid contract_id FK
        uuid project_id FK
        uuid requested_by FK
        uuid approver_user_id FK
        string approval_type
        decimal requested_amount
        string decision
        string remarks
        datetime requested_at
        datetime decided_at
    }

    CRM_CREDIT_STATUS_SNAPSHOT {
        uuid id PK
        uuid customer_party_id FK
        uuid company_id FK
        datetime snapshot_at
        decimal credit_limit
        decimal outstanding_receivable
        decimal overdue_amount
        decimal available_credit
        string risk_category
        string credit_status
    }

    SALES_ORDER_CHANGE_REQUEST {
        uuid id PK
        uuid document_id FK
        uuid sales_order_id FK
        uuid project_id FK
        uuid requested_by FK
        string change_type
        string change_reason
        decimal value_impact
        int schedule_impact_days
        string approval_status
        string status
    }

    SALES_RECURRING_ORDER_RULE {
        uuid id PK
        uuid contract_id FK
        uuid customer_party_id FK
        uuid source_sales_order_id FK
        string recurrence_rule
        date next_order_date
        date end_date
        boolean auto_create
        boolean approval_required
        string status
    }

    SALES_RECURRING_ORDER_RUN {
        uuid id PK
        uuid recurring_order_rule_id FK
        uuid generated_sales_order_id FK
        date scheduled_date
        datetime generated_at
        string run_status
        string failure_reason
    }

    %% =========================================================
    %% OMNICHANNEL CUSTOMER ENGAGEMENT
    %% =========================================================

    CRM_CHANNEL_ACCOUNT {
        uuid id PK
        uuid tenant_id FK
        uuid company_id FK
        string channel_type
        string account_name
        string external_account_id
        string credential_reference
        boolean active
    }

    CRM_CONVERSATION {
        uuid id PK
        uuid channel_account_id FK
        uuid customer_party_id FK
        uuid contact_id FK
        uuid opportunity_id FK
        uuid service_case_id FK
        uuid assigned_user_id FK
        string external_conversation_id
        string subject
        datetime opened_at
        datetime closed_at
        string priority
        string status
    }

    CRM_CONVERSATION_PARTICIPANT {
        uuid id PK
        uuid conversation_id FK
        uuid party_id FK
        uuid contact_id FK
        uuid user_id FK
        string participant_type
        datetime joined_at
        datetime left_at
    }

    CRM_MESSAGE {
        uuid id PK
        uuid conversation_id FK
        uuid sender_user_id FK
        uuid sender_party_id FK
        string external_message_id
        string direction
        string message_type
        text message_text
        datetime sent_at
        datetime received_at
        string status
    }

    CRM_MESSAGE_ATTACHMENT {
        uuid id PK
        uuid message_id FK
        uuid file_id FK
        string attachment_type
    }

    CRM_MESSAGE_DELIVERY_STATUS {
        uuid id PK
        uuid message_id FK
        string delivery_status
        datetime status_at
        string failure_code
        string failure_message
    }

    %% =========================================================
    %% DELIVERY TRACKING AND PROOF OF DELIVERY
    %% =========================================================

    LOGISTICS_SHIPMENT {
        uuid id PK
        uuid document_id FK
        uuid delivery_id FK
        uuid sales_order_id FK
        uuid customer_party_id FK
        string shipment_number
        string carrier_name
        string tracking_number
        datetime planned_dispatch_at
        datetime actual_dispatch_at
        datetime estimated_arrival_at
        datetime delivered_at
        string shipment_status
    }

    LOGISTICS_SHIPMENT_LINE {
        uuid id PK
        uuid shipment_id FK
        uuid delivery_line_id FK
        uuid product_id FK
        decimal shipped_quantity
        uuid uom_id FK
    }

    LOGISTICS_TRACKING_EVENT {
        uuid id PK
        uuid shipment_id FK
        string event_code
        string event_description
        string location_text
        decimal latitude
        decimal longitude
        datetime event_at
        string source_system
    }

    LOGISTICS_PROOF_OF_DELIVERY {
        uuid id PK
        uuid shipment_id FK
        uuid received_by_party_id FK
        uuid signature_file_id FK
        uuid photo_file_id FK
        string receiver_name
        datetime received_at
        string remarks
        string verification_status
    }

    %% =========================================================
    %% FEEDBACK CENTER, CUSTOMER SATISFACTION, SURVEY
    %% =========================================================

    CRM_FEEDBACK {
        uuid id PK
        uuid document_id FK
        uuid customer_party_id FK
        uuid contact_id FK
        uuid project_id FK
        uuid sales_order_id FK
        uuid delivery_id FK
        uuid service_case_id FK
        string feedback_type
        int rating_value
        decimal nps_score
        text feedback_text
        datetime submitted_at
        string status
    }

    CRM_SURVEY {
        uuid id PK
        uuid tenant_id FK
        uuid company_id FK
        string survey_code UK
        string survey_name
        string survey_type
        date active_from
        date active_to
        string status
    }

    CRM_SURVEY_QUESTION {
        uuid id PK
        uuid survey_id FK
        string question_text
        string answer_type
        boolean required
        int position_order
        json option_json
    }

    CRM_SURVEY_RESPONSE {
        uuid id PK
        uuid survey_id FK
        uuid customer_party_id FK
        uuid contact_id FK
        uuid project_id FK
        uuid sales_order_id FK
        datetime started_at
        datetime submitted_at
        string response_status
    }

    CRM_SURVEY_ANSWER {
        uuid id PK
        uuid response_id FK
        uuid question_id FK
        decimal numeric_answer
        text text_answer
        json option_answer
    }

    %% =========================================================
    %% PRODUCT IMPLEMENTATION ROADMAP AND DEVELOPMENT WORKFLOW
    %% Covers Suggested Phase and Suggested Workflow in the IA image
    %% =========================================================

    IMPLEMENTATION_RELEASE {
        uuid id PK
        uuid tenant_id FK
        string release_code UK
        string release_name
        date planned_start_date
        date planned_launch_date
        date actual_launch_date
        string release_status
    }

    IMPLEMENTATION_PHASE {
        uuid id PK
        uuid release_id FK
        string phase_code
        string phase_name
        int phase_order
        date planned_start_date
        date planned_end_date
        date actual_start_date
        date actual_end_date
        string status
    }

    IMPLEMENTATION_PHASE_ITEM {
        uuid id PK
        uuid phase_id FK
        string module_code
        string item_type
        string item_name
        int sequence_order
        string status
    }

    IMPLEMENTATION_WORKFLOW {
        uuid id PK
        uuid release_id FK
        string workflow_code UK
        string workflow_name
        string methodology
        string status
    }

    IMPLEMENTATION_WORKFLOW_STAGE {
        uuid id PK
        uuid workflow_id FK
        string stage_code
        string stage_name
        int stage_order
        string stage_type
        string status
    }

    IMPLEMENTATION_WORK_ITEM {
        uuid id PK
        uuid release_id FK
        uuid phase_id FK
        uuid workflow_stage_id FK
        uuid assigned_user_id FK
        string module_code
        string work_item_type
        string title
        text description
        date planned_start_date
        date planned_end_date
        datetime completed_at
        string status
    }

    IMPLEMENTATION_TEST_CYCLE {
        uuid id PK
        uuid release_id FK
        uuid phase_id FK
        string test_scope
        string test_type
        date planned_date
        date executed_date
        int passed_count
        int failed_count
        string status
    }

    IMPLEMENTATION_GTM_MILESTONE {
        uuid id PK
        uuid release_id FK
        string milestone_type
        string milestone_name
        date planned_date
        date actual_date
        string status
    }

    %% =========================================================
    %% DATABASE VIEWS / MATERIALIZED VIEWS FOR THE THREE MAIN UI AREAS
    %% =========================================================

    VIEW_FINANCE_MAIN_DASHBOARD {
        uuid company_id PK
        datetime calculated_at
        decimal profit_loss_amount
        decimal net_cashflow_amount
        decimal total_unit_hpp
        int active_alert_count
        int periodic_kpi_count
    }

    VIEW_PROJECT_DASHBOARD {
        uuid project_id PK
        datetime calculated_at
        decimal overall_kpi_score
        decimal planned_progress_percent
        decimal actual_progress_percent
        string project_health_status
        int overdue_task_count
        int unread_notification_count
    }

    VIEW_PROJECT_TIMELINE_COST {
        uuid project_id PK
        datetime calculated_at
        decimal labor_hours
        decimal machine_hours
        decimal labor_cost
        decimal equipment_cost
        decimal material_cost
        decimal overhead_cost
        decimal total_actual_cost
    }

    VIEW_CRM_SALES_DASHBOARD {
        uuid company_id PK
        datetime calculated_at
        decimal weighted_project_value
        decimal win_rate_percent
        int prospect_count
        int pitch_count
        int closing_count
        decimal offering_margin_percent
    }

    %% =========================================================
    %% COMPLETE RELATIONSHIPS
    %% =========================================================

    %% CORE RELATIONSHIPS
    CORE_BUSINESS_DOCUMENT ||--o{ ANALYTICS_ALERT_EVENT : source_document
    CORE_BUSINESS_DOCUMENT ||--o{ ASSET_ASSET : document
    CORE_BUSINESS_DOCUMENT ||--o{ ASSET_DISPOSAL : document
    CORE_BUSINESS_DOCUMENT ||--o{ CORE_AUDIT_EVENT : document
    CORE_BUSINESS_DOCUMENT ||--o{ CORE_BUSINESS_DOCUMENT : reversal_of
    CORE_BUSINESS_DOCUMENT ||--o{ CORE_DOCUMENT_ATTACHMENT : document
    CORE_BUSINESS_DOCUMENT ||--o{ CORE_DOCUMENT_LINK : source_document
    CORE_BUSINESS_DOCUMENT ||--o{ CORE_DOCUMENT_LINK : target_document
    CORE_BUSINESS_DOCUMENT ||--o{ CORE_GENERATED_DOCUMENT : business_document
    CORE_BUSINESS_DOCUMENT ||--o{ CORE_NOTIFICATION : source_document
    CORE_BUSINESS_DOCUMENT ||--o{ CORE_WORKFLOW_INSTANCE : document
    CORE_BUSINESS_DOCUMENT ||--o{ CRM_EXECUTIVE_APPROVAL : document
    CORE_BUSINESS_DOCUMENT ||--o{ CRM_FEEDBACK : document
    CORE_BUSINESS_DOCUMENT ||--o{ CRM_LEAD : document
    CORE_BUSINESS_DOCUMENT ||--o{ CRM_OPPORTUNITY : document
    CORE_BUSINESS_DOCUMENT ||--o{ FIN_BILLING_DOCUMENT : document
    CORE_BUSINESS_DOCUMENT ||--o{ FIN_COST_BASELINE : document
    CORE_BUSINESS_DOCUMENT ||--o{ FIN_JOURNAL_ENTRY : document
    CORE_BUSINESS_DOCUMENT ||--o{ FIN_JOURNAL_ENTRY : source_document
    CORE_BUSINESS_DOCUMENT ||--o{ FIN_JOURNAL_LINE : source_document_line
    CORE_BUSINESS_DOCUMENT ||--o{ FIN_PAYMENT : document
    CORE_BUSINESS_DOCUMENT ||--o{ FIN_PERIOD_CLOSING : document
    CORE_BUSINESS_DOCUMENT ||--o{ FIN_PROJECT_FUNDING : document
    CORE_BUSINESS_DOCUMENT ||--o{ INV_STOCK_COUNT : document
    CORE_BUSINESS_DOCUMENT ||--o{ INV_STOCK_LEDGER_ENTRY : source_document
    CORE_BUSINESS_DOCUMENT ||--o{ INV_STOCK_LEDGER_ENTRY : source_line
    CORE_BUSINESS_DOCUMENT ||--o{ INV_STOCK_MOVE : document
    CORE_BUSINESS_DOCUMENT ||--o{ LOGISTICS_SHIPMENT : document
    CORE_BUSINESS_DOCUMENT ||--o{ MFG_COST_LEDGER_ENTRY : source_document
    CORE_BUSINESS_DOCUMENT ||--o{ MFG_PRODUCTION_ORDER : document
    CORE_BUSINESS_DOCUMENT ||--o{ MFG_WORK_ORDER : document
    CORE_BUSINESS_DOCUMENT ||--o{ PROC_GOODS_RECEIPT : document
    CORE_BUSINESS_DOCUMENT ||--o{ PROC_PURCHASE_ORDER : document
    CORE_BUSINESS_DOCUMENT ||--o{ PROC_PURCHASE_REQUISITION : document
    CORE_BUSINESS_DOCUMENT ||--o{ PROC_RFQ : document
    CORE_BUSINESS_DOCUMENT ||--o{ PROC_SUPPLIER_QUOTATION : document
    CORE_BUSINESS_DOCUMENT ||--o{ PROJECT_CHANGE_REQUEST : document
    CORE_BUSINESS_DOCUMENT ||--o{ PROJECT_ISSUE : document
    CORE_BUSINESS_DOCUMENT ||--o{ PROJECT_PROJECT : document
    CORE_BUSINESS_DOCUMENT ||--o{ PROJECT_RESOURCE_REQUEST : document
    CORE_BUSINESS_DOCUMENT ||--o{ PROJECT_RISK : document
    CORE_BUSINESS_DOCUMENT ||--o{ PROJECT_TECHNICAL_BRIEF : document
    CORE_BUSINESS_DOCUMENT ||--o{ QA_INSPECTION : document
    CORE_BUSINESS_DOCUMENT ||--o{ QA_NONCONFORMANCE : document
    CORE_BUSINESS_DOCUMENT ||--o{ SALES_CONTRACT : document
    CORE_BUSINESS_DOCUMENT ||--o{ SALES_DELIVERY : document
    CORE_BUSINESS_DOCUMENT ||--o{ SALES_ORDER : document
    CORE_BUSINESS_DOCUMENT ||--o{ SALES_ORDER_CHANGE_REQUEST : document
    CORE_BUSINESS_DOCUMENT ||--o{ SALES_QUOTATION : document
    CORE_BUSINESS_DOCUMENT ||--o{ SERVICE_CASE : document
    CORE_COMPANY ||--o{ ANALYTICS_ALERT_EVENT : company
    CORE_COMPANY ||--o{ ANALYTICS_DASHBOARD : company
    CORE_COMPANY ||--o{ ANALYTICS_KPI_RESULT : company
    CORE_COMPANY ||--o{ ANALYTICS_KPI_TARGET : company
    CORE_COMPANY ||--o{ ASSET_ASSET : company
    CORE_COMPANY ||--o{ ASSET_CATEGORY : company
    CORE_COMPANY ||--o{ CORE_AUDIT_EVENT : company
    CORE_COMPANY ||--o{ CORE_BUSINESS_DOCUMENT : company
    CORE_COMPANY ||--o{ CORE_DOCUMENT_TEMPLATE : company
    CORE_COMPANY ||--o{ CORE_FILE : company
    CORE_COMPANY ||--o{ CORE_NOTIFICATION : company
    CORE_COMPANY ||--o{ CORE_ORGANIZATION : company
    CORE_COMPANY ||--o{ CRM_CHANNEL_ACCOUNT : company
    CORE_COMPANY ||--o{ CRM_LEAD : company
    CORE_COMPANY ||--o{ CRM_PIPELINE : company
    CORE_COMPANY ||--o{ CRM_SURVEY : company
    CORE_COMPANY ||--o{ FIN_ACCOUNT : company
    CORE_COMPANY ||--o{ FIN_BANK_ACCOUNT : company
    CORE_COMPANY ||--o{ FIN_BILLING_DOCUMENT : company
    CORE_COMPANY ||--o{ FIN_BUDGET : company
    CORE_COMPANY ||--o{ FIN_CREDIT_FACILITY : company
    CORE_COMPANY ||--o{ FIN_FINANCIAL_SNAPSHOT : company
    CORE_COMPANY ||--o{ FIN_FISCAL_YEAR : company
    CORE_COMPANY ||--o{ FIN_JOURNAL : company
    CORE_COMPANY ||--o{ FIN_OVERHEAD_RULE : company
    CORE_COMPANY ||--o{ FIN_PAYMENT : company
    CORE_COMPANY ||--o{ FIN_RECURRING_PAYMENT_RULE : company
    CORE_COMPANY ||--o{ FIN_UNIT_COST_SNAPSHOT : company
    CORE_COMPANY ||--o{ IAM_USER_ROLE : company
    CORE_COMPANY ||--o{ INV_STOCK_BALANCE : company
    CORE_COMPANY ||--o{ INV_STOCK_LEDGER_ENTRY : company
    CORE_COMPANY ||--o{ INV_STOCK_MOVE : company
    CORE_COMPANY ||--o{ MASTER_COST_CENTER : company
    CORE_COMPANY ||--o{ MASTER_DEPARTMENT : company
    CORE_COMPANY ||--o{ MASTER_EXCHANGE_RATE : company
    CORE_COMPANY ||--o{ MASTER_MACHINE : company
    CORE_COMPANY ||--o{ MASTER_WAREHOUSE : company
    CORE_COMPANY ||--o{ MASTER_WORK_CENTER : company
    CORE_COMPANY ||--o{ MFG_COST_LEDGER_ENTRY : company
    CORE_COMPANY ||--o{ MFG_PRODUCTION_ORDER : company
    CORE_COMPANY ||--o{ PROC_PURCHASE_REQUISITION : company
    CORE_COMPANY ||--o{ PROJECT_HEALTH_RULE : company
    CORE_COMPANY ||--o{ PROJECT_PROJECT : company
    CORE_COMPANY ||--o| CRM_CREDIT_STATUS_SNAPSHOT : company
    CORE_COMPANY ||--o| VIEW_CRM_SALES_DASHBOARD : summarizes
    CORE_COMPANY ||--o| VIEW_FINANCE_MAIN_DASHBOARD : summarizes
    CORE_DOCUMENT_TEMPLATE ||--o{ CORE_DOCUMENT_TEMPLATE_VERSION : template
    CORE_DOCUMENT_TEMPLATE_VERSION ||--o{ CORE_DOCUMENT_TEMPLATE_FIELD : template_version
    CORE_DOCUMENT_TEMPLATE_VERSION ||--o{ CORE_GENERATED_DOCUMENT : template_version
    CORE_FILE ||--o{ CORE_DOCUMENT_ATTACHMENT : file
    CORE_FILE ||--o{ CORE_GENERATED_DOCUMENT : file
    CORE_FILE ||--o{ CRM_MESSAGE_ATTACHMENT : file
    CORE_FILE ||--o{ LOGISTICS_PROOF_OF_DELIVERY : photo_file
    CORE_FILE ||--o{ LOGISTICS_PROOF_OF_DELIVERY : signature_file
    CORE_FILE ||--o{ PROJECT_TECHNICAL_BRIEF_VERSION : file
    CORE_GENERATED_DOCUMENT ||--o{ CORE_DOCUMENT_SIGNATURE : generated_document
    CORE_NOTIFICATION ||--o{ CORE_NOTIFICATION_RECIPIENT : notification
    CORE_ORGANIZATION ||--o{ ANALYTICS_KPI_RESULT : organization
    CORE_ORGANIZATION ||--o{ ANALYTICS_KPI_TARGET : organization
    CORE_ORGANIZATION ||--o{ CORE_ORGANIZATION : parent
    CORE_ORGANIZATION ||--o{ IAM_USER_ROLE : organization
    CORE_TENANT ||--o{ ANALYTICS_ALERT_RULE : tenant
    CORE_TENANT ||--o{ ANALYTICS_DASHBOARD : tenant
    CORE_TENANT ||--o{ ANALYTICS_KPI_DEFINITION : tenant
    CORE_TENANT ||--o{ CORE_AUDIT_EVENT : tenant
    CORE_TENANT ||--o{ CORE_BUSINESS_DOCUMENT : tenant
    CORE_TENANT ||--o{ CORE_COMPANY : tenant
    CORE_TENANT ||--o{ CORE_DOCUMENT_TEMPLATE : tenant
    CORE_TENANT ||--o{ CORE_FILE : tenant
    CORE_TENANT ||--o{ CORE_NOTIFICATION : tenant
    CORE_TENANT ||--o{ CORE_ORGANIZATION : tenant
    CORE_TENANT ||--o{ CORE_QUICK_ACTION : tenant
    CORE_TENANT ||--o{ CRM_CHANNEL_ACCOUNT : tenant
    CORE_TENANT ||--o{ CRM_LEAD : tenant
    CORE_TENANT ||--o{ CRM_PIPELINE : tenant
    CORE_TENANT ||--o{ CRM_SURVEY : tenant
    CORE_TENANT ||--o{ IAM_DATA_SCOPE_POLICY : tenant
    CORE_TENANT ||--o{ IAM_INFORMATION_SHARE_RULE : tenant
    CORE_TENANT ||--o{ IAM_ROLE : tenant
    CORE_TENANT ||--o{ IAM_USER : tenant
    CORE_TENANT ||--o{ IMPLEMENTATION_RELEASE : tenant
    CORE_TENANT ||--o{ INV_STOCK_LEDGER_ENTRY : tenant
    CORE_TENANT ||--o{ MASTER_EMPLOYEE : tenant
    CORE_TENANT ||--o{ MASTER_PARTY : tenant
    CORE_TENANT ||--o{ MASTER_PAYMENT_TERM : tenant
    CORE_TENANT ||--o{ MASTER_PRODUCT : tenant
    CORE_TENANT ||--o{ MASTER_PRODUCT_CATEGORY : tenant
    CORE_TENANT ||--o{ MASTER_TAX_CODE : tenant
    CORE_TENANT ||--o{ MASTER_UOM : tenant
    CORE_TENANT ||--o{ MFG_BOM : tenant
    CORE_TENANT ||--o{ MFG_ROUTING : tenant
    CORE_TENANT ||--o{ PROJECT_PROJECT : tenant
    CORE_TENANT ||--o{ QA_QUALITY_PLAN : tenant
    CORE_WORKFLOW_INSTANCE ||--o{ CORE_WORKFLOW_APPROVAL : workflow_instance

    %% IAM RELATIONSHIPS
    IAM_DATA_SCOPE_POLICY ||--o{ IAM_ROLE_DATA_SCOPE : policy
    IAM_PERMISSION ||--o{ CORE_QUICK_ACTION : required_permission
    IAM_PERMISSION ||--o{ IAM_ROLE_PERMISSION : permission
    IAM_ROLE ||--o{ ANALYTICS_DASHBOARD_ROLE : role
    IAM_ROLE ||--o{ CORE_NOTIFICATION_RECIPIENT : recipient_role
    IAM_ROLE ||--o{ IAM_APPROVAL_LIMIT : role
    IAM_ROLE ||--o{ IAM_FIELD_PERMISSION : role
    IAM_ROLE ||--o{ IAM_ROLE_DATA_SCOPE : role
    IAM_ROLE ||--o{ IAM_ROLE_HIERARCHY : child_role
    IAM_ROLE ||--o{ IAM_ROLE_HIERARCHY : parent_role
    IAM_ROLE ||--o{ IAM_ROLE_PERMISSION : role
    IAM_ROLE ||--o{ IAM_USER_ROLE : role
    IAM_USER ||--o{ ANALYTICS_ALERT_EVENT : acknowledged_by
    IAM_USER ||--o{ ANALYTICS_KPI_RESULT : owner_user
    IAM_USER ||--o{ ANALYTICS_KPI_TARGET : owner_user
    IAM_USER ||--o{ CORE_AUDIT_EVENT : user
    IAM_USER ||--o{ CORE_BUSINESS_DOCUMENT : approved_by
    IAM_USER ||--o{ CORE_BUSINESS_DOCUMENT : created_by
    IAM_USER ||--o{ CORE_BUSINESS_DOCUMENT : posted_by
    IAM_USER ||--o{ CORE_DOCUMENT_SIGNATURE : signer_user
    IAM_USER ||--o{ CORE_FILE : uploaded_by
    IAM_USER ||--o{ CORE_GENERATED_DOCUMENT : generated_by
    IAM_USER ||--o{ CORE_NOTIFICATION_RECIPIENT : recipient_user
    IAM_USER ||--o{ CORE_WORKFLOW_APPROVAL : approver_user
    IAM_USER ||--o{ CRM_ACTIVITY : assigned_user
    IAM_USER ||--o{ CRM_CONVERSATION : assigned_user
    IAM_USER ||--o{ CRM_CONVERSATION_PARTICIPANT : user
    IAM_USER ||--o{ CRM_EXECUTIVE_APPROVAL : approver_user
    IAM_USER ||--o{ CRM_EXECUTIVE_APPROVAL : requested_by
    IAM_USER ||--o{ CRM_LEAD : owner_user
    IAM_USER ||--o{ CRM_MESSAGE : sender_user
    IAM_USER ||--o{ CRM_OPPORTUNITY : owner_user
    IAM_USER ||--o{ CRM_OPPORTUNITY_STAGE_HISTORY : changed_by
    IAM_USER ||--o{ FIN_COST_BASELINE : approved_by
    IAM_USER ||--o{ FIN_PERIOD_CLOSING : executed_by
    IAM_USER ||--o{ IAM_APPROVAL_LIMIT : user
    IAM_USER ||--o{ IAM_USER_PROJECT_ACCESS : user
    IAM_USER ||--o{ IAM_USER_ROLE : user
    IAM_USER ||--o{ IMPLEMENTATION_WORK_ITEM : assigned_user
    IAM_USER ||--o{ PROC_PURCHASE_REQUISITION : requested_by
    IAM_USER ||--o{ PROC_THREE_WAY_MATCH : reviewed_by
    IAM_USER ||--o{ PROJECT_ACCEPTANCE_CRITERIA : verified_by
    IAM_USER ||--o{ PROJECT_ISSUE : assigned_user
    IAM_USER ||--o{ PROJECT_MEMBER : user
    IAM_USER ||--o{ PROJECT_PROJECT : project_manager
    IAM_USER ||--o{ PROJECT_RESOURCE_REQUEST : requested_by
    IAM_USER ||--o{ PROJECT_RISK : owner_user
    IAM_USER ||--o{ PROJECT_TASK_BOARD_POSITION : moved_by
    IAM_USER ||--o{ PROJECT_TECHNICAL_BRIEF : owner_user
    IAM_USER ||--o{ PROJECT_TECHNICAL_BRIEF_VERSION : created_by
    IAM_USER ||--o{ QA_CORRECTIVE_ACTION : assigned_user
    IAM_USER ||--o{ QA_INSPECTION : inspector_user
    IAM_USER ||--o{ SALES_ORDER_CHANGE_REQUEST : requested_by
    IAM_USER ||--o{ SERVICE_CASE : assigned_user
    IAM_USER ||--o{ SERVICE_CASE_APPROVAL : approver_user
    IAM_USER ||--o{ SERVICE_CASE_MESSAGE : sender_user

    %% MASTER RELATIONSHIPS
    MASTER_CONTACT ||--o{ CRM_CONVERSATION : contact
    MASTER_CONTACT ||--o{ CRM_CONVERSATION_PARTICIPANT : contact
    MASTER_CONTACT ||--o{ CRM_FEEDBACK : contact
    MASTER_CONTACT ||--o{ CRM_SURVEY_RESPONSE : contact
    MASTER_CONTACT ||--o{ SERVICE_CASE : contact
    MASTER_COST_CENTER ||--o{ FIN_BILLING_DOCUMENT_LINE : cost_center
    MASTER_COST_CENTER ||--o{ FIN_BUDGET_LINE : cost_center
    MASTER_COST_CENTER ||--o{ FIN_COST_BASELINE_LINE : cost_center
    MASTER_COST_CENTER ||--o{ FIN_JOURNAL_LINE : cost_center
    MASTER_COST_CENTER ||--o{ FIN_OVERHEAD_RULE : target_cost_center
    MASTER_COST_CENTER ||--o{ MASTER_COST_CENTER : parent
    MASTER_COST_CENTER ||--o{ PROJECT_BUDGET_LINE : cost_center
    MASTER_COST_CENTER ||--o{ PROJECT_PROJECT : cost_center
    MASTER_CURRENCY ||--o{ CORE_COMPANY : base_currency
    MASTER_CURRENCY ||--o{ FIN_ACCOUNT : currency
    MASTER_CURRENCY ||--o{ FIN_BANK_ACCOUNT : currency
    MASTER_CURRENCY ||--o{ FIN_BILLING_DOCUMENT : currency
    MASTER_CURRENCY ||--o{ FIN_CREDIT_FACILITY : currency
    MASTER_CURRENCY ||--o{ FIN_JOURNAL_ENTRY : currency
    MASTER_CURRENCY ||--o{ FIN_JOURNAL_LINE : transaction_currency
    MASTER_CURRENCY ||--o{ FIN_PAYMENT : currency
    MASTER_CURRENCY ||--o{ FIN_PROJECT_FUNDING : currency
    MASTER_CURRENCY ||--o{ FIN_RECURRING_PAYMENT_RULE : currency
    MASTER_CURRENCY ||--o{ IAM_APPROVAL_LIMIT : currency
    MASTER_CURRENCY ||--o{ MASTER_EXCHANGE_RATE : from_currency
    MASTER_CURRENCY ||--o{ MASTER_EXCHANGE_RATE : to_currency
    MASTER_CURRENCY ||--o{ MASTER_PARTY : default_currency
    MASTER_CURRENCY ||--o{ PROC_PURCHASE_ORDER : currency
    MASTER_CURRENCY ||--o{ PROC_SUPPLIER_QUOTATION : currency
    MASTER_CURRENCY ||--o{ PROJECT_WEIGHT_INDICATOR : currency
    MASTER_CURRENCY ||--o{ SALES_ORDER : currency
    MASTER_CURRENCY ||--o{ SALES_QUOTATION : currency
    MASTER_DEPARTMENT ||--o{ ASSET_ASSET : department
    MASTER_DEPARTMENT ||--o{ FIN_BUDGET_LINE : department
    MASTER_DEPARTMENT ||--o{ FIN_JOURNAL_LINE : department
    MASTER_DEPARTMENT ||--o{ MASTER_DEPARTMENT : parent
    MASTER_DEPARTMENT ||--o{ MASTER_EMPLOYEE : department
    MASTER_EMPLOYEE ||--o{ MFG_LABOR_LOG : employee
    MASTER_EMPLOYEE ||--o{ PROJECT_EQUIPMENT_USAGE : employee
    MASTER_EMPLOYEE ||--o{ PROJECT_MEMBER : employee
    MASTER_EMPLOYEE ||--o{ PROJECT_RESOURCE_ALLOCATION : employee
    MASTER_EMPLOYEE ||--o{ PROJECT_RESOURCE_REQUEST_LINE : employee
    MASTER_EMPLOYEE ||--o{ PROJECT_TIMESHEET : employee
    MASTER_MACHINE ||--o{ ASSET_MAINTENANCE : machine
    MASTER_MACHINE ||--o{ MFG_MACHINE_LOG : machine
    MASTER_MACHINE ||--o{ MFG_WORK_ORDER : machine
    MASTER_MACHINE ||--o{ PROJECT_EQUIPMENT_USAGE : machine
    MASTER_MACHINE ||--o{ PROJECT_RESOURCE_ALLOCATION : machine
    MASTER_MACHINE ||--o{ PROJECT_RESOURCE_REQUEST_LINE : machine
    MASTER_PARTY ||--o{ ASSET_ASSET : supplier_party
    MASTER_PARTY ||--o{ CORE_DOCUMENT_SIGNATURE : signer_party
    MASTER_PARTY ||--o{ CRM_ACTIVITY : party
    MASTER_PARTY ||--o{ CRM_CONVERSATION : customer_party
    MASTER_PARTY ||--o{ CRM_CONVERSATION_PARTICIPANT : party
    MASTER_PARTY ||--o{ CRM_FEEDBACK : customer_party
    MASTER_PARTY ||--o{ CRM_LEAD : party
    MASTER_PARTY ||--o{ CRM_MESSAGE : sender_party
    MASTER_PARTY ||--o{ CRM_OPPORTUNITY : customer_party
    MASTER_PARTY ||--o{ CRM_SURVEY_RESPONSE : customer_party
    MASTER_PARTY ||--o{ FIN_BANK_ACCOUNT : party
    MASTER_PARTY ||--o{ FIN_BILLING_DOCUMENT : party
    MASTER_PARTY ||--o{ FIN_CREDIT_FACILITY : party
    MASTER_PARTY ||--o{ FIN_JOURNAL_LINE : party
    MASTER_PARTY ||--o{ FIN_PAYMENT : party
    MASTER_PARTY ||--o{ FIN_PROJECT_FUNDING : funding_source_party
    MASTER_PARTY ||--o{ FIN_RECURRING_PAYMENT_RULE : party
    MASTER_PARTY ||--o{ LOGISTICS_PROOF_OF_DELIVERY : received_by_party
    MASTER_PARTY ||--o{ LOGISTICS_SHIPMENT : customer_party
    MASTER_PARTY ||--o{ MASTER_ADDRESS : party
    MASTER_PARTY ||--o{ MASTER_CONTACT : party
    MASTER_PARTY ||--o{ MASTER_EMPLOYEE : party
    MASTER_PARTY ||--o{ MASTER_PARTY_ROLE : party
    MASTER_PARTY ||--o{ PROC_GOODS_RECEIPT : supplier_party
    MASTER_PARTY ||--o{ PROC_PURCHASE_ORDER : supplier_party
    MASTER_PARTY ||--o{ PROC_SUPPLIER_QUOTATION : supplier_party
    MASTER_PARTY ||--o{ PROJECT_PROJECT : customer_party
    MASTER_PARTY ||--o{ SALES_CONTRACT : customer_party
    MASTER_PARTY ||--o{ SALES_DELIVERY : customer_party
    MASTER_PARTY ||--o{ SALES_ORDER : customer_party
    MASTER_PARTY ||--o{ SALES_QUOTATION : customer_party
    MASTER_PARTY ||--o{ SALES_RECURRING_ORDER_RULE : customer_party
    MASTER_PARTY ||--o{ SERVICE_CASE : customer_party
    MASTER_PARTY ||--o| CRM_CREDIT_STATUS_SNAPSHOT : customer_party
    MASTER_PARTY ||--o| MASTER_CUSTOMER_PROFILE : party
    MASTER_PARTY ||--o| MASTER_SUPPLIER_PROFILE : party
    MASTER_PAYMENT_TERM ||--o{ FIN_BILLING_DOCUMENT : payment_term
    MASTER_PAYMENT_TERM ||--o{ PROC_PURCHASE_ORDER : payment_term
    MASTER_PAYMENT_TERM ||--o{ SALES_ORDER : payment_term
    MASTER_PAYMENT_TERM ||--o{ SALES_QUOTATION : payment_term
    MASTER_PAYMENT_TERM ||--o| MASTER_CUSTOMER_PROFILE : payment_term
    MASTER_PAYMENT_TERM ||--o| MASTER_SUPPLIER_PROFILE : payment_term
    MASTER_PRODUCT ||--o{ CRM_OPPORTUNITY_PRODUCT : product
    MASTER_PRODUCT ||--o{ FIN_BILLING_DOCUMENT_LINE : product
    MASTER_PRODUCT ||--o{ FIN_COST_BASELINE_LINE : product
    MASTER_PRODUCT ||--o{ FIN_JOURNAL_LINE : product
    MASTER_PRODUCT ||--o{ FIN_UNIT_COST_SNAPSHOT : product
    MASTER_PRODUCT ||--o{ INV_LOT : product
    MASTER_PRODUCT ||--o{ INV_SERIAL_NUMBER : product
    MASTER_PRODUCT ||--o{ INV_STOCK_BALANCE : product
    MASTER_PRODUCT ||--o{ INV_STOCK_COUNT_LINE : product
    MASTER_PRODUCT ||--o{ INV_STOCK_LEDGER_ENTRY : product
    MASTER_PRODUCT ||--o{ INV_STOCK_MOVE_LINE : product
    MASTER_PRODUCT ||--o{ INV_STOCK_RESERVATION : product
    MASTER_PRODUCT ||--o{ INV_VALUATION_LAYER : product
    MASTER_PRODUCT ||--o{ LOGISTICS_SHIPMENT_LINE : product
    MASTER_PRODUCT ||--o{ MFG_BOM : product
    MASTER_PRODUCT ||--o{ MFG_BOM_LINE : component_product
    MASTER_PRODUCT ||--o{ MFG_COST_LEDGER_ENTRY : product
    MASTER_PRODUCT ||--o{ MFG_PRODUCTION_MATERIAL : product
    MASTER_PRODUCT ||--o{ MFG_PRODUCTION_ORDER : product
    MASTER_PRODUCT ||--o{ MFG_PRODUCTION_OUTPUT : product
    MASTER_PRODUCT ||--o{ MFG_SCRAP : product
    MASTER_PRODUCT ||--o{ PROC_GOODS_RECEIPT_LINE : product
    MASTER_PRODUCT ||--o{ PROC_PURCHASE_ORDER_LINE : product
    MASTER_PRODUCT ||--o{ PROC_PURCHASE_REQUISITION_LINE : product
    MASTER_PRODUCT ||--o{ PROJECT_MATERIAL_REQUIREMENT : product
    MASTER_PRODUCT ||--o{ PROJECT_RESOURCE_REQUEST_LINE : product
    MASTER_PRODUCT ||--o{ QA_INSPECTION : product
    MASTER_PRODUCT ||--o{ QA_QUALITY_PLAN : product
    MASTER_PRODUCT ||--o{ SALES_CONTRACT_LINE : product
    MASTER_PRODUCT ||--o{ SALES_DELIVERY_LINE : product
    MASTER_PRODUCT ||--o{ SALES_ORDER_LINE : product
    MASTER_PRODUCT ||--o{ SALES_QUOTATION_LINE : product
    MASTER_PRODUCT ||--o{ SERVICE_CASE : product
    MASTER_PRODUCT_CATEGORY ||--o{ ASSET_ASSET : category
    MASTER_PRODUCT_CATEGORY ||--o{ MASTER_PRODUCT : category
    MASTER_PRODUCT_CATEGORY ||--o{ MASTER_PRODUCT_CATEGORY : parent
    MASTER_TAX_CODE ||--o{ FIN_BILLING_DOCUMENT_LINE : tax_code
    MASTER_TAX_CODE ||--o{ FIN_TAX_TRANSACTION : tax_code
    MASTER_TAX_CODE ||--o{ PROC_PURCHASE_ORDER_LINE : tax_code
    MASTER_TAX_CODE ||--o{ SALES_CONTRACT_LINE : tax_code
    MASTER_TAX_CODE ||--o{ SALES_ORDER_LINE : tax_code
    MASTER_TAX_CODE ||--o{ SALES_QUOTATION_LINE : tax_code
    MASTER_UOM ||--o{ CRM_OPPORTUNITY_PRODUCT : uom
    MASTER_UOM ||--o{ FIN_BILLING_DOCUMENT_LINE : uom
    MASTER_UOM ||--o{ INV_STOCK_MOVE_LINE : uom
    MASTER_UOM ||--o{ LOGISTICS_SHIPMENT_LINE : uom
    MASTER_UOM ||--o{ MASTER_PRODUCT : base_uom
    MASTER_UOM ||--o{ MFG_BOM_LINE : uom
    MASTER_UOM ||--o{ MFG_BOM_VERSION : output_uom
    MASTER_UOM ||--o{ PROC_GOODS_RECEIPT_LINE : uom
    MASTER_UOM ||--o{ PROC_PURCHASE_ORDER_LINE : uom
    MASTER_UOM ||--o{ PROC_PURCHASE_REQUISITION_LINE : uom
    MASTER_UOM ||--o{ PROJECT_RESOURCE_REQUEST_LINE : uom
    MASTER_UOM ||--o{ SALES_DELIVERY_LINE : uom
    MASTER_UOM ||--o{ SALES_ORDER_LINE : uom
    MASTER_UOM ||--o{ SALES_QUOTATION_LINE : uom
    MASTER_WAREHOUSE ||--o{ FIN_JOURNAL_LINE : warehouse
    MASTER_WAREHOUSE ||--o{ INV_STOCK_COUNT : warehouse
    MASTER_WAREHOUSE ||--o{ INV_VALUATION_LAYER : warehouse
    MASTER_WAREHOUSE ||--o{ MASTER_WAREHOUSE_LOCATION : warehouse
    MASTER_WAREHOUSE ||--o{ MFG_PRODUCTION_MATERIAL : warehouse
    MASTER_WAREHOUSE ||--o{ MFG_PRODUCTION_ORDER : warehouse
    MASTER_WAREHOUSE ||--o{ PROC_GOODS_RECEIPT : warehouse
    MASTER_WAREHOUSE ||--o{ PROC_PURCHASE_REQUISITION_LINE : warehouse
    MASTER_WAREHOUSE ||--o{ PROJECT_MATERIAL_REQUIREMENT : warehouse
    MASTER_WAREHOUSE ||--o{ SALES_DELIVERY : warehouse
    MASTER_WAREHOUSE_LOCATION ||--o{ ASSET_ASSET : warehouse_location
    MASTER_WAREHOUSE_LOCATION ||--o{ INV_SERIAL_NUMBER : current_location
    MASTER_WAREHOUSE_LOCATION ||--o{ INV_STOCK_BALANCE : warehouse_location
    MASTER_WAREHOUSE_LOCATION ||--o{ INV_STOCK_COUNT_LINE : location
    MASTER_WAREHOUSE_LOCATION ||--o{ INV_STOCK_LEDGER_ENTRY : warehouse_location
    MASTER_WAREHOUSE_LOCATION ||--o{ INV_STOCK_MOVE : destination_location
    MASTER_WAREHOUSE_LOCATION ||--o{ INV_STOCK_MOVE : source_location
    MASTER_WAREHOUSE_LOCATION ||--o{ INV_STOCK_RESERVATION : warehouse_location
    MASTER_WAREHOUSE_LOCATION ||--o{ MASTER_WAREHOUSE_LOCATION : parent
    MASTER_WAREHOUSE_LOCATION ||--o{ MFG_PRODUCTION_OUTPUT : destination_location
    MASTER_WORK_CENTER ||--o{ MASTER_MACHINE : work_center
    MASTER_WORK_CENTER ||--o{ MFG_ROUTING_OPERATION : work_center
    MASTER_WORK_CENTER ||--o{ MFG_WORK_ORDER : work_center
    MASTER_WORK_CENTER ||--o{ PROJECT_RESOURCE_REQUEST_LINE : work_center
    MASTER_WORK_CENTER ||--o{ PROJECT_TASK : work_center

    %% ANALYTICS RELATIONSHIPS
    ANALYTICS_ALERT_EVENT ||--o{ CORE_NOTIFICATION : alert_event
    ANALYTICS_ALERT_RULE ||--o{ ANALYTICS_ALERT_EVENT : alert_rule
    ANALYTICS_DASHBOARD ||--o{ ANALYTICS_DASHBOARD_ROLE : dashboard
    ANALYTICS_DASHBOARD ||--o{ ANALYTICS_WIDGET : dashboard
    ANALYTICS_KPI_DEFINITION ||--o{ ANALYTICS_ALERT_RULE : kpi_definition
    ANALYTICS_KPI_DEFINITION ||--o{ ANALYTICS_KPI_RESULT : kpi_definition
    ANALYTICS_KPI_DEFINITION ||--o{ ANALYTICS_KPI_TARGET : kpi_definition

    %% CRM RELATIONSHIPS
    CRM_CHANNEL_ACCOUNT ||--o{ CRM_CONVERSATION : channel_account
    CRM_CONVERSATION ||--o{ CRM_CONVERSATION_PARTICIPANT : conversation
    CRM_CONVERSATION ||--o{ CRM_MESSAGE : conversation
    CRM_LEAD ||--o{ CRM_OPPORTUNITY : lead
    CRM_MESSAGE ||--o{ CRM_MESSAGE_ATTACHMENT : message
    CRM_MESSAGE ||--o{ CRM_MESSAGE_DELIVERY_STATUS : message
    CRM_OPPORTUNITY ||--o{ CRM_ACTIVITY : opportunity
    CRM_OPPORTUNITY ||--o{ CRM_CONVERSATION : opportunity
    CRM_OPPORTUNITY ||--o{ CRM_EXECUTIVE_APPROVAL : opportunity
    CRM_OPPORTUNITY ||--o{ CRM_OPPORTUNITY_PRODUCT : opportunity
    CRM_OPPORTUNITY ||--o{ CRM_OPPORTUNITY_STAGE_HISTORY : opportunity
    CRM_OPPORTUNITY ||--o{ PROJECT_WEIGHT_INDICATOR : opportunity
    CRM_OPPORTUNITY ||--o{ SALES_QUOTATION : opportunity
    CRM_PIPELINE ||--o{ CRM_PIPELINE_STAGE : pipeline
    CRM_PIPELINE_STAGE ||--o{ CRM_OPPORTUNITY_STAGE_HISTORY : from_stage
    CRM_PIPELINE_STAGE ||--o{ CRM_OPPORTUNITY_STAGE_HISTORY : to_stage
    CRM_SURVEY ||--o{ CRM_SURVEY_QUESTION : survey
    CRM_SURVEY ||--o{ CRM_SURVEY_RESPONSE : survey
    CRM_SURVEY_QUESTION ||--o{ CRM_SURVEY_ANSWER : question
    CRM_SURVEY_RESPONSE ||--o{ CRM_SURVEY_ANSWER : response

    %% SALES RELATIONSHIPS
    SALES_CONTRACT ||--o{ CRM_EXECUTIVE_APPROVAL : contract
    SALES_CONTRACT ||--o{ SALES_CONTRACT_LINE : contract
    SALES_CONTRACT ||--o{ SALES_ORDER : contract
    SALES_CONTRACT ||--o{ SALES_RECURRING_ORDER_RULE : contract
    SALES_DELIVERY ||--o{ CRM_FEEDBACK : delivery
    SALES_DELIVERY ||--o{ LOGISTICS_SHIPMENT : delivery
    SALES_DELIVERY ||--o{ SALES_DELIVERY_LINE : delivery
    SALES_DELIVERY ||--o{ SERVICE_RESOLUTION : replacement_delivery
    SALES_DELIVERY_LINE ||--o{ LOGISTICS_SHIPMENT_LINE : delivery_line
    SALES_ORDER ||--o{ CRM_FEEDBACK : sales_order
    SALES_ORDER ||--o{ CRM_SURVEY_RESPONSE : sales_order
    SALES_ORDER ||--o{ FIN_BILLING_DOCUMENT : sales_order
    SALES_ORDER ||--o{ LOGISTICS_SHIPMENT : sales_order
    SALES_ORDER ||--o{ PROJECT_PROJECT : sales_order
    SALES_ORDER ||--o{ PROJECT_TECHNICAL_BRIEF : sales_order
    SALES_ORDER ||--o{ PROJECT_WEIGHT_INDICATOR : sales_order
    SALES_ORDER ||--o{ SALES_DELIVERY : sales_order
    SALES_ORDER ||--o{ SALES_ORDER_CHANGE_REQUEST : sales_order
    SALES_ORDER ||--o{ SALES_ORDER_LINE : sales_order
    SALES_ORDER ||--o{ SALES_RECURRING_ORDER_RULE : source_sales_order
    SALES_ORDER ||--o{ SALES_RECURRING_ORDER_RUN : generated_sales_order
    SALES_ORDER ||--o{ SERVICE_CASE : sales_order
    SALES_ORDER_LINE ||--o{ INV_STOCK_RESERVATION : sales_order_line
    SALES_ORDER_LINE ||--o{ MFG_PRODUCTION_ORDER : sales_order_line
    SALES_ORDER_LINE ||--o{ SALES_DELIVERY_LINE : sales_order_line
    SALES_ORDER_LINE ||--o{ SALES_DEMAND_SUPPLY_LINK : sales_order_line
    SALES_QUOTATION ||--o{ CRM_EXECUTIVE_APPROVAL : quotation
    SALES_QUOTATION ||--o{ SALES_ORDER : quotation
    SALES_QUOTATION ||--o{ SALES_QUOTATION_LINE : quotation
    SALES_QUOTATION_LINE ||--o{ SALES_QUOTATION_COST : quotation_line
    SALES_RECURRING_ORDER_RULE ||--o{ SALES_RECURRING_ORDER_RUN : recurring_order_rule

    %% PROJECT RELATIONSHIPS
    PROJECT_BOARD ||--o{ PROJECT_BOARD_COLUMN : board
    PROJECT_BOARD_COLUMN ||--o{ PROJECT_TASK_BOARD_POSITION : board_column
    PROJECT_MATERIAL_REQUIREMENT ||--o{ PROC_PURCHASE_REQUISITION_LINE : project_material_requirement
    PROJECT_PROJECT ||--o{ ANALYTICS_ALERT_EVENT : project
    PROJECT_PROJECT ||--o{ ANALYTICS_KPI_RESULT : project
    PROJECT_PROJECT ||--o{ ANALYTICS_KPI_TARGET : project
    PROJECT_PROJECT ||--o{ ASSET_ASSET : project
    PROJECT_PROJECT ||--o{ CRM_EXECUTIVE_APPROVAL : project
    PROJECT_PROJECT ||--o{ CRM_FEEDBACK : project
    PROJECT_PROJECT ||--o{ CRM_SURVEY_RESPONSE : project
    PROJECT_PROJECT ||--o{ FIN_BILLING_DOCUMENT : project
    PROJECT_PROJECT ||--o{ FIN_BILLING_DOCUMENT_LINE : project
    PROJECT_PROJECT ||--o{ FIN_BUDGET_LINE : project
    PROJECT_PROJECT ||--o{ FIN_COST_BASELINE : project
    PROJECT_PROJECT ||--o{ FIN_COST_VARIANCE : project
    PROJECT_PROJECT ||--o{ FIN_JOURNAL_LINE : project
    PROJECT_PROJECT ||--o{ FIN_OVERHEAD_ALLOCATION : project
    PROJECT_PROJECT ||--o{ FIN_PROJECT_COST_SNAPSHOT : project
    PROJECT_PROJECT ||--o{ FIN_PROJECT_FUNDING : project
    PROJECT_PROJECT ||--o{ FIN_PROJECT_WIP_SNAPSHOT : project
    PROJECT_PROJECT ||--o{ FIN_UNIT_COST_SNAPSHOT : project
    PROJECT_PROJECT ||--o{ IAM_USER_PROJECT_ACCESS : project
    PROJECT_PROJECT ||--o{ INV_STOCK_LEDGER_ENTRY : project
    PROJECT_PROJECT ||--o{ INV_STOCK_MOVE : project
    PROJECT_PROJECT ||--o{ INV_STOCK_RESERVATION : project
    PROJECT_PROJECT ||--o{ MFG_COST_LEDGER_ENTRY : project
    PROJECT_PROJECT ||--o{ MFG_LABOR_LOG : project
    PROJECT_PROJECT ||--o{ MFG_MACHINE_LOG : project
    PROJECT_PROJECT ||--o{ MFG_PRODUCTION_ORDER : project
    PROJECT_PROJECT ||--o{ PROC_PURCHASE_ORDER_LINE : project
    PROJECT_PROJECT ||--o{ PROC_PURCHASE_REQUISITION : project
    PROJECT_PROJECT ||--o{ PROJECT_BOARD : project
    PROJECT_PROJECT ||--o{ PROJECT_BUDGET_LINE : project
    PROJECT_PROJECT ||--o{ PROJECT_CHANGE_REQUEST : project
    PROJECT_PROJECT ||--o{ PROJECT_EQUIPMENT_USAGE : project
    PROJECT_PROJECT ||--o{ PROJECT_HEALTH_SNAPSHOT : project
    PROJECT_PROJECT ||--o{ PROJECT_ISSUE : project
    PROJECT_PROJECT ||--o{ PROJECT_MATERIAL_REQUIREMENT : project
    PROJECT_PROJECT ||--o{ PROJECT_MEMBER : project
    PROJECT_PROJECT ||--o{ PROJECT_MILESTONE : project
    PROJECT_PROJECT ||--o{ PROJECT_PROGRESS_SNAPSHOT : project
    PROJECT_PROJECT ||--o{ PROJECT_RESOURCE_REQUEST : project
    PROJECT_PROJECT ||--o{ PROJECT_RISK : project
    PROJECT_PROJECT ||--o{ PROJECT_TASK : project
    PROJECT_PROJECT ||--o{ PROJECT_TECHNICAL_BRIEF : project
    PROJECT_PROJECT ||--o{ PROJECT_TIMESHEET : project
    PROJECT_PROJECT ||--o{ PROJECT_WEIGHT_INDICATOR : project
    PROJECT_PROJECT ||--o{ SALES_DEMAND_SUPPLY_LINK : project
    PROJECT_PROJECT ||--o{ SALES_ORDER_CHANGE_REQUEST : project
    PROJECT_PROJECT ||--o{ SALES_ORDER_LINE : project
    PROJECT_PROJECT ||--o| VIEW_PROJECT_DASHBOARD : summarizes
    PROJECT_PROJECT ||--o| VIEW_PROJECT_TIMELINE_COST : summarizes
    PROJECT_REQUIREMENT ||--o{ PROJECT_ACCEPTANCE_CRITERIA : requirement
    PROJECT_REQUIREMENT ||--o{ PROJECT_REQUIREMENT : parent_requirement
    PROJECT_RESOURCE_REQUEST ||--o{ PROJECT_RESOURCE_REQUEST_LINE : resource_request
    PROJECT_RESOURCE_REQUEST_LINE ||--o{ PROJECT_RESOURCE_ALLOCATION : resource_request_line
    PROJECT_TASK ||--o{ PROJECT_EQUIPMENT_USAGE : task
    PROJECT_TASK ||--o{ PROJECT_ISSUE : task
    PROJECT_TASK ||--o{ PROJECT_MATERIAL_REQUIREMENT : task
    PROJECT_TASK ||--o{ PROJECT_RESOURCE_REQUEST : task
    PROJECT_TASK ||--o{ PROJECT_TASK : parent_task
    PROJECT_TASK ||--o{ PROJECT_TASK_BOARD_POSITION : task
    PROJECT_TASK ||--o{ PROJECT_TASK_DEPENDENCY : predecessor_task
    PROJECT_TASK ||--o{ PROJECT_TASK_DEPENDENCY : successor_task
    PROJECT_TASK ||--o{ PROJECT_TIMESHEET : task
    PROJECT_TECHNICAL_BRIEF ||--o{ PROJECT_REQUIREMENT : technical_brief
    PROJECT_TECHNICAL_BRIEF ||--o{ PROJECT_TECHNICAL_BRIEF_VERSION : technical_brief
    PROJECT_WEIGHT_INDICATOR ||--o{ PROJECT_WEIGHT_COMPONENT : project_weight_indicator

    %% PROC RELATIONSHIPS
    PROC_GOODS_RECEIPT ||--o{ PROC_GOODS_RECEIPT_LINE : goods_receipt
    PROC_GOODS_RECEIPT ||--o{ PROC_THREE_WAY_MATCH : goods_receipt
    PROC_GOODS_RECEIPT ||--o{ QA_INSPECTION : goods_receipt
    PROC_PURCHASE_ORDER ||--o{ FIN_BILLING_DOCUMENT : purchase_order
    PROC_PURCHASE_ORDER ||--o{ PROC_GOODS_RECEIPT : purchase_order
    PROC_PURCHASE_ORDER ||--o{ PROC_PURCHASE_ORDER_LINE : purchase_order
    PROC_PURCHASE_ORDER ||--o{ PROC_THREE_WAY_MATCH : purchase_order
    PROC_PURCHASE_ORDER_LINE ||--o{ PROC_GOODS_RECEIPT_LINE : purchase_order_line
    PROC_PURCHASE_ORDER_LINE ||--o{ SALES_DEMAND_SUPPLY_LINK : purchase_order_line
    PROC_PURCHASE_REQUISITION ||--o{ PROC_PURCHASE_REQUISITION_LINE : requisition
    PROC_PURCHASE_REQUISITION ||--o{ PROC_RFQ : requisition
    PROC_PURCHASE_REQUISITION_LINE ||--o{ PROC_PURCHASE_ORDER_LINE : requisition_line
    PROC_RFQ ||--o{ PROC_SUPPLIER_QUOTATION : rfq
    PROC_SUPPLIER_QUOTATION ||--o{ PROC_PURCHASE_ORDER : supplier_quotation

    %% INV RELATIONSHIPS
    INV_LOT ||--o{ INV_STOCK_BALANCE : lot
    INV_LOT ||--o{ INV_STOCK_COUNT_LINE : lot
    INV_LOT ||--o{ INV_STOCK_LEDGER_ENTRY : lot
    INV_LOT ||--o{ INV_STOCK_MOVE_LINE : lot
    INV_LOT ||--o{ MFG_PRODUCTION_OUTPUT : lot
    INV_LOT ||--o{ PROC_GOODS_RECEIPT_LINE : lot
    INV_LOT ||--o{ QA_INSPECTION : lot
    INV_LOT ||--o{ SALES_DELIVERY_LINE : lot
    INV_SERIAL_NUMBER ||--o{ INV_STOCK_BALANCE : serial_number
    INV_SERIAL_NUMBER ||--o{ INV_STOCK_LEDGER_ENTRY : serial_number
    INV_SERIAL_NUMBER ||--o{ INV_STOCK_MOVE_LINE : serial_number
    INV_SERIAL_NUMBER ||--o{ PROC_GOODS_RECEIPT_LINE : serial_number
    INV_SERIAL_NUMBER ||--o{ SALES_DELIVERY_LINE : serial_number
    INV_SERIAL_NUMBER ||--o{ SERVICE_CASE : serial_number
    INV_STOCK_COUNT ||--o{ INV_STOCK_COUNT_LINE : stock_count
    INV_STOCK_LEDGER_ENTRY ||--o{ INV_STOCK_BALANCE : last_ledger_entry
    INV_STOCK_LEDGER_ENTRY ||--o{ INV_STOCK_LEDGER_ENTRY : reversal_of
    INV_STOCK_LEDGER_ENTRY ||--o{ INV_VALUATION_LAYER : receipt_ledger_entry
    INV_STOCK_LEDGER_ENTRY ||--o{ MFG_COST_LEDGER_ENTRY : stock_ledger_entry
    INV_STOCK_MOVE ||--o{ INV_STOCK_MOVE_LINE : stock_move
    INV_STOCK_RESERVATION ||--o{ PROJECT_RESOURCE_ALLOCATION : stock_reservation
    INV_STOCK_RESERVATION ||--o{ SALES_DEMAND_SUPPLY_LINK : stock_reservation

    %% MFG RELATIONSHIPS
    MFG_BOM ||--o{ MFG_BOM_VERSION : bom
    MFG_BOM_VERSION ||--o{ MFG_BOM_LINE : bom_version
    MFG_BOM_VERSION ||--o{ MFG_PRODUCTION_ORDER : bom_version
    MFG_COST_LEDGER_ENTRY ||--o{ MFG_COST_LEDGER_ENTRY : reversal_of
    MFG_PRODUCTION_ORDER ||--o{ FIN_OVERHEAD_ALLOCATION : production_order
    MFG_PRODUCTION_ORDER ||--o{ FIN_UNIT_COST_SNAPSHOT : production_order
    MFG_PRODUCTION_ORDER ||--o{ INV_STOCK_LEDGER_ENTRY : production_order
    MFG_PRODUCTION_ORDER ||--o{ INV_STOCK_MOVE : production_order
    MFG_PRODUCTION_ORDER ||--o{ INV_STOCK_RESERVATION : production_order
    MFG_PRODUCTION_ORDER ||--o{ MFG_COST_LEDGER_ENTRY : production_order
    MFG_PRODUCTION_ORDER ||--o{ MFG_PRODUCTION_MATERIAL : production_order
    MFG_PRODUCTION_ORDER ||--o{ MFG_PRODUCTION_OUTPUT : production_order
    MFG_PRODUCTION_ORDER ||--o{ MFG_SCRAP : production_order
    MFG_PRODUCTION_ORDER ||--o{ MFG_WORK_ORDER : production_order
    MFG_PRODUCTION_ORDER ||--o{ PROJECT_TASK : production_order
    MFG_PRODUCTION_ORDER ||--o{ QA_INSPECTION : production_order
    MFG_PRODUCTION_ORDER ||--o{ SALES_DEMAND_SUPPLY_LINK : production_order
    MFG_ROUTING ||--o{ MFG_PRODUCTION_ORDER : routing
    MFG_ROUTING ||--o{ MFG_ROUTING_OPERATION : routing
    MFG_ROUTING_OPERATION ||--o{ MFG_BOM_LINE : operation
    MFG_ROUTING_OPERATION ||--o{ MFG_WORK_ORDER : routing_operation
    MFG_WORK_ORDER ||--o{ MFG_COST_LEDGER_ENTRY : work_order
    MFG_WORK_ORDER ||--o{ MFG_LABOR_LOG : work_order
    MFG_WORK_ORDER ||--o{ MFG_MACHINE_LOG : work_order
    MFG_WORK_ORDER ||--o{ MFG_SCRAP : work_order
    MFG_WORK_ORDER ||--o{ PROJECT_PROGRESS_SNAPSHOT : work_order
    MFG_WORK_ORDER ||--o{ QA_INSPECTION : work_order

    %% QA RELATIONSHIPS
    QA_INSPECTION ||--o{ QA_INSPECTION_RESULT : inspection
    QA_INSPECTION ||--o{ QA_NONCONFORMANCE : inspection
    QA_NONCONFORMANCE ||--o{ QA_CORRECTIVE_ACTION : nonconformance
    QA_QUALITY_PLAN ||--o{ QA_INSPECTION : quality_plan
    QA_QUALITY_PLAN ||--o{ QA_QUALITY_PLAN_POINT : quality_plan
    QA_QUALITY_PLAN_POINT ||--o{ QA_INSPECTION_RESULT : plan_point

    %% FIN RELATIONSHIPS
    FIN_ACCOUNT ||--o{ ASSET_CATEGORY : accumulated_depreciation_account
    FIN_ACCOUNT ||--o{ ASSET_CATEGORY : asset_account
    FIN_ACCOUNT ||--o{ ASSET_CATEGORY : depreciation_expense_account
    FIN_ACCOUNT ||--o{ FIN_ACCOUNT : parent_account
    FIN_ACCOUNT ||--o{ FIN_BANK_ACCOUNT : ledger_account
    FIN_ACCOUNT ||--o{ FIN_BILLING_DOCUMENT_LINE : account
    FIN_ACCOUNT ||--o{ FIN_BUDGET_LINE : account
    FIN_ACCOUNT ||--o{ FIN_COST_BASELINE_LINE : account
    FIN_ACCOUNT ||--o{ FIN_JOURNAL_LINE : account
    FIN_ACCOUNT ||--o{ FIN_OVERHEAD_RULE : source_account
    FIN_ACCOUNT ||--o{ FIN_RECURRING_PAYMENT_RULE : expense_account
    FIN_ACCOUNT ||--o{ MASTER_TAX_CODE : input_account
    FIN_ACCOUNT ||--o{ MASTER_TAX_CODE : output_account
    FIN_ACCOUNT ||--o{ PROJECT_BUDGET_LINE : account
    FIN_ACCOUNT ||--o| MASTER_CUSTOMER_PROFILE : receivable_account
    FIN_ACCOUNT ||--o| MASTER_SUPPLIER_PROFILE : payable_account
    FIN_AR_AP_SCHEDULE ||--o{ FIN_PAYMENT_ALLOCATION : schedule
    FIN_BANK_ACCOUNT ||--o{ FIN_BANK_STATEMENT : bank_account
    FIN_BANK_ACCOUNT ||--o{ FIN_PAYMENT : bank_account
    FIN_BANK_ACCOUNT ||--o{ FIN_RECURRING_PAYMENT_RULE : bank_account
    FIN_BANK_STATEMENT ||--o{ FIN_BANK_STATEMENT_LINE : bank_statement
    FIN_BANK_STATEMENT_LINE ||--o{ FIN_BANK_RECONCILIATION : bank_statement_line
    FIN_BILLING_DOCUMENT ||--o{ FIN_AR_AP_SCHEDULE : billing_document
    FIN_BILLING_DOCUMENT ||--o{ FIN_BILLING_DOCUMENT_LINE : billing_document
    FIN_BILLING_DOCUMENT ||--o{ FIN_PAYMENT_ALLOCATION : billing_document
    FIN_BILLING_DOCUMENT ||--o{ FIN_TAX_TRANSACTION : billing_document
    FIN_BILLING_DOCUMENT ||--o{ PROC_THREE_WAY_MATCH : supplier_invoice
    FIN_BILLING_DOCUMENT ||--o{ SERVICE_CASE : billing_document
    FIN_BILLING_DOCUMENT ||--o{ SERVICE_RESOLUTION : credit_note
    FIN_BILLING_DOCUMENT_LINE ||--o{ FIN_TAX_TRANSACTION : billing_document_line
    FIN_BUDGET ||--o{ FIN_BUDGET_LINE : budget
    FIN_COST_BASELINE ||--o{ FIN_COST_BASELINE_LINE : cost_baseline
    FIN_COST_BASELINE_LINE ||--o{ FIN_COST_VARIANCE : cost_baseline_line
    FIN_FISCAL_PERIOD ||--o{ ASSET_DEPRECIATION_LINE : fiscal_period
    FIN_FISCAL_PERIOD ||--o{ FIN_COST_VARIANCE : fiscal_period
    FIN_FISCAL_PERIOD ||--o{ FIN_FINANCIAL_SNAPSHOT : fiscal_period
    FIN_FISCAL_PERIOD ||--o{ FIN_JOURNAL_ENTRY : fiscal_period
    FIN_FISCAL_PERIOD ||--o{ FIN_OVERHEAD_ALLOCATION : fiscal_period
    FIN_FISCAL_PERIOD ||--o{ FIN_PERIOD_CLOSING : fiscal_period
    FIN_FISCAL_PERIOD ||--o{ FIN_PROJECT_WIP_SNAPSHOT : fiscal_period
    FIN_FISCAL_YEAR ||--o{ FIN_BUDGET : fiscal_year
    FIN_FISCAL_YEAR ||--o{ FIN_FISCAL_PERIOD : fiscal_year
    FIN_JOURNAL ||--o{ FIN_JOURNAL_ENTRY : journal
    FIN_JOURNAL_ENTRY ||--o{ ASSET_DEPRECIATION_LINE : journal_entry
    FIN_JOURNAL_ENTRY ||--o{ ASSET_DISPOSAL : journal_entry
    FIN_JOURNAL_ENTRY ||--o{ FIN_JOURNAL_ENTRY : reversal_of_entry
    FIN_JOURNAL_ENTRY ||--o{ FIN_JOURNAL_LINE : journal_entry
    FIN_JOURNAL_ENTRY ||--o{ FIN_OVERHEAD_ALLOCATION : journal_entry
    FIN_JOURNAL_ENTRY ||--o{ FIN_PAYMENT : journal_entry
    FIN_JOURNAL_ENTRY ||--o{ FIN_PROJECT_FUNDING_TRANSACTION : journal_entry
    FIN_JOURNAL_LINE ||--o{ FIN_BANK_RECONCILIATION : journal_line
    FIN_JOURNAL_LINE ||--o{ MFG_COST_LEDGER_ENTRY : journal_line
    FIN_OVERHEAD_RULE ||--o{ FIN_OVERHEAD_ALLOCATION : overhead_rule
    FIN_PAYMENT ||--o{ FIN_BANK_RECONCILIATION : payment
    FIN_PAYMENT ||--o{ FIN_PAYMENT_ALLOCATION : payment
    FIN_PAYMENT ||--o{ FIN_PROJECT_FUNDING_TRANSACTION : payment
    FIN_PAYMENT ||--o{ FIN_RECURRING_PAYMENT_RUN : payment
    FIN_PROJECT_FUNDING ||--o{ FIN_PROJECT_FUNDING_TRANSACTION : project_funding
    FIN_RECURRING_PAYMENT_RULE ||--o{ FIN_RECURRING_PAYMENT_RUN : recurring_rule

    %% ASSET RELATIONSHIPS
    ASSET_ASSET ||--o{ ASSET_BOOK : asset
    ASSET_ASSET ||--o{ ASSET_DISPOSAL : asset
    ASSET_ASSET ||--o{ ASSET_MAINTENANCE : asset
    ASSET_ASSET ||--o{ MASTER_MACHINE : asset
    ASSET_ASSET ||--o{ PROJECT_EQUIPMENT_USAGE : asset
    ASSET_BOOK ||--o{ ASSET_DEPRECIATION_LINE : asset_book

    %% SERVICE RELATIONSHIPS
    SERVICE_CASE ||--o{ CRM_CONVERSATION : service_case
    SERVICE_CASE ||--o{ CRM_FEEDBACK : service_case
    SERVICE_CASE ||--o{ SERVICE_CASE_APPROVAL : service_case
    SERVICE_CASE ||--o{ SERVICE_CASE_MESSAGE : service_case
    SERVICE_CASE ||--o{ SERVICE_RESOLUTION : service_case

    %% LOGISTICS RELATIONSHIPS
    LOGISTICS_SHIPMENT ||--o{ LOGISTICS_PROOF_OF_DELIVERY : shipment
    LOGISTICS_SHIPMENT ||--o{ LOGISTICS_SHIPMENT_LINE : shipment
    LOGISTICS_SHIPMENT ||--o{ LOGISTICS_TRACKING_EVENT : shipment

    %% IMPLEMENTATION RELATIONSHIPS
    IMPLEMENTATION_PHASE ||--o{ IMPLEMENTATION_PHASE_ITEM : phase
    IMPLEMENTATION_PHASE ||--o{ IMPLEMENTATION_TEST_CYCLE : phase
    IMPLEMENTATION_PHASE ||--o{ IMPLEMENTATION_WORK_ITEM : phase
    IMPLEMENTATION_RELEASE ||--o{ IMPLEMENTATION_GTM_MILESTONE : release
    IMPLEMENTATION_RELEASE ||--o{ IMPLEMENTATION_PHASE : release
    IMPLEMENTATION_RELEASE ||--o{ IMPLEMENTATION_TEST_CYCLE : release
    IMPLEMENTATION_RELEASE ||--o{ IMPLEMENTATION_WORKFLOW : release
    IMPLEMENTATION_RELEASE ||--o{ IMPLEMENTATION_WORK_ITEM : release
    IMPLEMENTATION_WORKFLOW ||--o{ IMPLEMENTATION_WORKFLOW_STAGE : workflow
    IMPLEMENTATION_WORKFLOW_STAGE ||--o{ IMPLEMENTATION_WORK_ITEM : workflow_stage
```

## Matriks kesesuaian terhadap Information Architecture PNG

| Area/fungsi pada PNG                        | Struktur database yang mendukung                                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Executive memiliki akses penuh              | `IAM_ROLE_HIERARCHY`, `IAM_ROLE_PERMISSION`, `IAM_ROLE_DATA_SCOPE`                                                  |
| Informasi terbatas PM–Finance–CRM–Technical | `IAM_INFORMATION_SHARE_RULE`, `IAM_FIELD_PERMISSION`, `IAM_USER_PROJECT_ACCESS`                                     |
| Dashboard utama Finance                     | `ANALYTICS_DASHBOARD`, `ANALYTICS_WIDGET`, `VIEW_FINANCE_MAIN_DASHBOARD`                                            |
| Laba rugi dan cashflow real-time            | `FIN_FINANCIAL_SNAPSHOT`, `FIN_JOURNAL_ENTRY`, `FIN_JOURNAL_LINE`                                                   |
| Unit-unit HPP                               | `FIN_UNIT_COST_SNAPSHOT`, `MFG_COST_LEDGER_ENTRY`                                                                   |
| Peringatan dan KPI periodik                 | `ANALYTICS_ALERT_RULE`, `ANALYTICS_ALERT_EVENT`, `ANALYTICS_KPI_*`                                                  |
| CoA, jurnal, pajak, tutup buku              | `FIN_ACCOUNT`, `FIN_JOURNAL_*`, `FIN_TAX_TRANSACTION`, `FIN_PERIOD_CLOSING`                                         |
| Vendor invoice dan three-way matching       | `FIN_BILLING_DOCUMENT`, `PROC_THREE_WAY_MATCH`                                                                      |
| Batch payment                               | `FIN_PAYMENT`, `FIN_PAYMENT_ALLOCATION`                                                                             |
| Recurring payment                           | `FIN_RECURRING_PAYMENT_RULE`, `FIN_RECURRING_PAYMENT_RUN`                                                           |
| Limit kredit                                | `FIN_CREDIT_FACILITY`, `MASTER_CUSTOMER_PROFILE`, `CRM_CREDIT_STATUS_SNAPSHOT`                                      |
| Work in progress                            | `FIN_PROJECT_WIP_SNAPSHOT`                                                                                          |
| Permodalan/pembiayaan proyek                | `FIN_PROJECT_FUNDING`, `FIN_PROJECT_FUNDING_TRANSACTION`                                                            |
| Selisih biaya ideal dan riil                | `FIN_COST_BASELINE*`, `FIN_COST_VARIANCE`                                                                           |
| Biaya overhead                              | `FIN_OVERHEAD_RULE`, `FIN_OVERHEAD_ALLOCATION`                                                                      |
| Invoice/document builder                    | `CORE_DOCUMENT_TEMPLATE*`, `CORE_GENERATED_DOCUMENT`, `CORE_DOCUMENT_SIGNATURE`                                     |
| Nilai, depresiasi, maintenance aset         | `ASSET_ASSET`, `ASSET_BOOK`, `ASSET_DEPRECIATION_LINE`, `ASSET_MAINTENANCE`                                         |
| Dashboard Project dan KPI                   | `VIEW_PROJECT_DASHBOARD`, `ANALYTICS_KPI_*`                                                                         |
| Gantt dan summary task                      | `PROJECT_TASK`, `PROJECT_TASK_DEPENDENCY`                                                                           |
| Notification dan quick actions              | `CORE_NOTIFICATION*`, `CORE_QUICK_ACTION`                                                                           |
| Project health status                       | `PROJECT_HEALTH_RULE`, `PROJECT_HEALTH_SNAPSHOT`, `PROJECT_RISK`, `PROJECT_ISSUE`                                   |
| Timeline dan Kanban                         | `PROJECT_BOARD*`, `PROJECT_TASK_BOARD_POSITION`                                                                     |
| Milestones/KPI                              | `PROJECT_MILESTONE`, `ANALYTICS_KPI_*`                                                                              |
| Linked sales orders                         | `PROJECT_PROJECT.sales_order_id`, `SALES_DEMAND_SUPPLY_LINK`                                                        |
| Spesifikasi teknis/brief                    | `PROJECT_TECHNICAL_BRIEF*`, `PROJECT_REQUIREMENT`, `PROJECT_ACCEPTANCE_CRITERIA`                                    |
| Change of order/update                      | `SALES_ORDER_CHANGE_REQUEST`, `PROJECT_CHANGE_REQUEST`                                                              |
| Alokasi material dan permintaan resource    | `PROJECT_RESOURCE_REQUEST*`, `PROJECT_RESOURCE_ALLOCATION`, `INV_STOCK_RESERVATION`                                 |
| Work order progress dan QA                  | `PROJECT_PROGRESS_SNAPSHOT`, `MFG_WORK_ORDER`, `QA_INSPECTION*`                                                     |
| Jam kerja alat dan pekerja                  | `PROJECT_TIMESHEET`, `PROJECT_EQUIPMENT_USAGE`, `MFG_LABOR_LOG`, `MFG_MACHINE_LOG`                                  |
| Modal dan pengeluaran proyek                | `FIN_PROJECT_COST_SNAPSHOT`, `FIN_PROJECT_FUNDING*`                                                                 |
| Dashboard Sales dan indikator bobot proyek  | `VIEW_CRM_SALES_DASHBOARD`, `PROJECT_WEIGHT_INDICATOR*`                                                             |
| Prospect–pitch–closing dan win rate         | `CRM_PIPELINE*`, `CRM_OPPORTUNITY_STAGE_HISTORY`, `CRM_OPPORTUNITY`                                                 |
| Keuntungan offering                         | `CRM_OPPORTUNITY.expected_margin`, `SALES_QUOTATION.estimated_margin`                                               |
| Profil dan kontak customer                  | `MASTER_PARTY`, `MASTER_CONTACT`, `MASTER_CUSTOMER_PROFILE`                                                         |
| Executive approval                          | `CRM_EXECUTIVE_APPROVAL`, `CORE_WORKFLOW_APPROVAL`, `IAM_APPROVAL_LIMIT`                                            |
| Credit status                               | `CRM_CREDIT_STATUS_SNAPSHOT`                                                                                        |
| Estimating dan quotation                    | `SALES_QUOTATION*`, `SALES_QUOTATION_COST`                                                                          |
| Kontrak umum dan berkala                    | `SALES_CONTRACT`, `SALES_CONTRACT_LINE`                                                                             |
| Otomasi repeat order                        | `SALES_RECURRING_ORDER_RULE`, `SALES_RECURRING_ORDER_RUN`                                                           |
| Omnichannel dashboard                       | `CRM_CHANNEL_ACCOUNT`, `CRM_CONVERSATION*`, `CRM_MESSAGE*`                                                          |
| Delivery tracking                           | `LOGISTICS_SHIPMENT*`, `LOGISTICS_TRACKING_EVENT`, `LOGISTICS_PROOF_OF_DELIVERY`                                    |
| Feedback center                             | `CRM_FEEDBACK`, `CRM_SURVEY*`                                                                                       |
| Suggested Phase 1–4                         | `IMPLEMENTATION_RELEASE`, `IMPLEMENTATION_PHASE`, `IMPLEMENTATION_PHASE_ITEM`                                       |
| Suggested Workflow dan testing/GTM/launch   | `IMPLEMENTATION_WORKFLOW*`, `IMPLEMENTATION_WORK_ITEM`, `IMPLEMENTATION_TEST_CYCLE`, `IMPLEMENTATION_GTM_MILESTONE` |

## Seed role yang harus dibuat

* `EXECUTIVE`: akses penuh seluruh modul dan seluruh data.
* `PROJECT_MANAGEMENT`: akses penuh Project Management dan akses terbatas ke data Finance/CRM sesuai share rule.
* `ACCOUNTING_FINANCE`: akses penuh Finance dan akses terbatas ke data Project/CRM.
* `CRM`: akses penuh CRM/Sales dan akses terbatas ke status, nilai, serta approval terkait proyek.
* `PROJECT_MANAGEMENT_TECHNICAL`: akses teknis untuk brief, resource, work order, progress, dan QA.

Kesesuaian 100% di sini berarti setiap node fitur pada PNG sudah memiliki representasi berupa tabel transaksi, tabel konfigurasi, tabel snapshot, atau database view. Rumus KPI, aturan approval, serta batas informasi yang dibagikan tetap dikonfigurasi melalui data dan application service, bukan di-hardcode pada tabel.

Ran command: `npx ts-node -e "import prisma from './src/config/database'; async function run() { const users = await prisma.iam_user.findMany({ include: { iam_user_role: { include: { iam_role: true } } } }); console.log(JSON.stringify(users.map(u => ({ id: u.id, name: u.full_name, email: u.email, username: u.username, is_super: u.is_superuser, is_active: u.is_active, roles: u.iam_user_role.map(ur => ur.iam_role?.role_name || ur.iam_role?.role_code) })), null, 2)); } run().finally(() => prisma.\$disconnect());"`
Ran command: `npx ts-node -e "import prisma from './src/config/database'; async function run() { const users = await prisma.iam_user.findMany({ include: { iam_user_role: { include: { iam_role: true } } } }); console.log(JSON.stringify(users.map(u => ({ id: u.id, name: u.full_name, email: u.email, username: u.username, is_super: u.is_superuser, is_active: u.is_active, roles: u.iam_user_role.map(ur => ur.iam_role?.role_name || ur.iam_role?.role_code) })), null, 2)); } run();"`
Ran command: `npx ts-node -e "import prisma from './src/config/database'; async function run() { const users = await prisma.iam_user.findMany(); const userRoles = await prisma.iam_user_role.findMany(); const roles = await prisma.iam_role.findMany(); const rMap = new Map(roles.map(r => [r.id, r.role_name || r.role_code])); const urMap = new Map(); for (const ur of userRoles) { const list = urMap.get(ur.user_id) || []; list.push(rMap.get(ur.role_id)); urMap.set(ur.user_id, list); } console.log(JSON.stringify(users.map(u => ({ id: u.id, name: u.full_name, email: u.email, username: u.username, is_super: u.is_superuser, is_active: u.is_active, roles: urMap.get(u.id) || [] })), null, 2)); } run();"`
Ran command: `npx ts-node -e "import prisma from './src/config/database'; async function run() { const users = await prisma.iam_user.findMany(); const userRoles = await prisma.iam_user_role.findMany(); const roles = await prisma.iam_role.findMany(); const rMap = new Map(roles.map(r => [r.id, r.role_name || r.role_code])); const urMap = new Map<string, string[]>(); for (const ur of userRoles) { if (!ur.user_id || !ur.role_id) continue; const list = urMap.get(ur.user_id) || []; const rn = rMap.get(ur.role_id); if (rn) list.push(rn); urMap.set(ur.user_id, list); } console.log(JSON.stringify(users.map(u => ({ name: u.full_name, email: u.email, username: u.username, is_super: u.is_superuser, roles: urMap.get(u.id) || [] })), null, 2)); } run();"`

Berikut adalah **daftar lengkap seluruh data user** yang ada pada sistem database saat ini, terbagi menjadi **Daftar User Resmi Tim** dan **Daftar Ghost / Demo User** (yang tetap dapat Anda gunakan untuk login kapan saja).

Berikut adalah daftar resmi seluruh akun pengguna tim **PT Sinergi Muda Arsa** yang telah aktif, terhubung ke database PostgreSQL Supabase, dan siap digunakan:

---

### 🏢 **1. Daftar Pengguna Resmi Tim (PT Sinergi Muda Arsa)**

*Semua akun menggunakan nama pertama dan domain resmi `.com` dengan password seragam `DummyPass123!`*:

| No | Nama Pengguna | Email Login | Username Login | Peran & Hak Akses (Role) | Default Password |
|:---:|:---|:---|:---|:---|:---:|
| 1 | **Rian** | `rian@arsalynk.com` | `rian` | **Director & Super Admin**<br>*(Approval Eksekutif, IAM, & Akses Penuh Sistem)* | `DummyPass123!` |
| 2 | **Melika** | `melika@arsalynk.com` | `melika` | **Lead Project Manager**<br>*(Kontrol 5-Level WBS, Gantt Chart, Kurva S, & Seluruh Proyek)* | `DummyPass123!` |
| 3 | **Melika (Ops)** | `melika.ops@arsalynk.com` | `melika.ops` | **Operational Lead & Supervisor**<br>*(Master 5 Divisi, Studio Arsa, & Manajemen Aset Lapangan)* | `DummyPass123!` |
| 4 | **Arof** | `arof@arsalynk.com` | `arof` | **Lead Project Manager & Riset**<br>*(Kontrol Seluruh Proyek & Lead Riset BRIDA Semarang)* | `DummyPass123!` |
| 5 | **Arof (Finance)** | `arof.finance@arsalynk.com` | `arof.finance` | **Finance Lead & Tax Controller**<br>*(Buku Besar GL, NPWP, Rekening Bank, e-Faktur, & Plafon KMK)* | `DummyPass123!` |
| 6 | **Laode** | `laode@arsalynk.com` | `laode` | **Field Specialist / Engineer**<br>*(Eksekusi Task Harian & Timesheet Lapangan)* | `DummyPass123!` |
| 7 | **Jundy** | `jundy@arsalynk.com` | `jundy` | **Field Specialist / Creative Media**<br>*(Produksi Konten Video & Creative Hub)* | `DummyPass123!` |
| 8 | **Noorman** | `noorman@arsalynk.com` | `noorman` | **Field Specialist / Survey Specialist**<br>*(Survey Lapangan & Dokumentasi Teknis)* | `DummyPass123!` |

---

### 👻 **2. Daftar Akun Dummy Ghost (Khusus Uji Coba Localhost - PT Coba Arsalynk)**

*Akun dummy terisolasi untuk simulasi alur sistem tanpa mengotori data asli*:

| No | Label Akun Dummy | Email Login | No. Telepon | Modul Uji Coba | Password |
|:---:|:---|:---|:---:|:---|:---:|
| 1 | **Ghost Admin System** | `admin.director@arsalynk.id` | `+62 81234567890` | Administrator & IAM | `DummyPass123!` |
| 2 | **Ghost Executive Director** | `director@arsalynk.id` | `+62 81234567891` | Executive Approval & Override | `DummyPass123!` |
| 3 | **Ghost Lead PM** | `pm.lead@arsalynk.id` | `+62 81234567892` | WBS & Kurva S Proyek Prototype | `DummyPass123!` |
| 4 | **Ghost Field Supervisor** | `supervisor@arsalynk.id` | `+62 81234567893` | Supervisi Task Lapangan | `DummyPass123!` |
| 5 | **Ghost CRM Lead** | `crm.lead@arsalynk.id` | `+62 81234567894` | Pipeline Inquiry & Estimasi RAB | `DummyPass123!` |
| 6 | **Ghost Sales Staff** | `sales@arsalynk.id` | `+62 81234567895` | Sales Quotation & Sales Order | `DummyPass123!` |
| 7 | **Ghost Finance Controller** | `finance.lead@arsalynk.id` | `+62 81234567896` | Billing Termin & e-Faktur Pajak | `DummyPass123!` |
| 8 | **Ghost AP/AR Specialist** | `dummy.finance@example.com` | `+62 81234567897` | 3-Way Match Vendor Bill & Piutang | `DummyPass123!` |
| 9 | **Ghost Cost Estimator** | `estimator@arsalynk.id` | `+62 81234567898` | Perhitungan Cost Baseline | `DummyPass123!` |
| 10 | **Ghost Technical Staff** | `staff.dev@arsalynk.id` | `+62 81234567899` | Daily Task & Timesheet Demo | `DummyPass123!` |

### 3. **Cara Login Sebagai Ghost User Kapan Saja**

1. Buka halaman login di `/login`.
2. Masukkan **Email** atau **Username** dari salah satu Ghost User di atas (contoh: `dummy.admin@example.com` atau `dummy_admin`).
3. Masukkan Password: `DummyPass123!`.
4. Klik **Masuk** — Anda akan langsung masuk dengan role dan data simulasi dari ghost user tersebut.|
