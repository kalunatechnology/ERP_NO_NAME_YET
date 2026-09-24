# ERP Migration Branch Contract

This repository intentionally keeps **master data** and **production data** isolated while converging both databases on the same application schema.

## Current historical lineages

Before 2026-09-22 the two databases recorded equivalent schema evolution differently:

- **Master lineage** — incremental Prisma migrations from `20260903060000_q3_access_and_tenant_scope` through `20260921171000_marbot_ai_read_views`.
- **Production lineage** — squashed migration `20260922000000_production_baseline`.

The deployment gate in `scripts/deploy_hostinger_migrations.js` treats those histories as equivalent when the production baseline is already recorded. It marks the legacy master migration names as applied instead of replaying their DDL on production.

`20260924024500_align_uuid_storage_to_production_text` is a master convergence migration. It converts legacy UUID-backed columns to the production TEXT-backed Prisma String contract. On a production-baselined database it is recorded as applied and is not executed because production already uses TEXT storage.

## Rules from the convergence point forward

1. `prisma/schema.prisma` is shared by master and production.
2. New schema changes use one normal migration history and must be committed under `prisma/migrations/`.
3. Never create separate `migration-master` and `migration-production` variants for the same schema change.
4. Never edit an already-successful migration. Fix it with a new migration.
5. Never put demo/sample/reset data inside schema migrations.
6. `prisma migrate deploy` may run during Hostinger/Docker deployment; seed/reset operations must remain explicit and separate.
7. Master and production may contain different business rows, identifiers, users, projects, invoices, and other data. Schema parity does not mean data parity.
8. The physical architecture audit must pass after migrations. A database that still exposes UUID application columns is not allowed to start while the Prisma contract expects TEXT identifiers.

## Safe master -> production merge

After source code is merged from master into production:

1. Deployment reads `_prisma_migrations` from the target database.
2. If `20260922000000_production_baseline` is present and successful, the deployment gate records the equivalent historical master migrations as applied without executing them.
3. Only migrations created **after the convergence point** are executed normally.
4. `scripts/audit_database_architecture.js` verifies the resulting physical schema before Express compilation/startup completes.

This bridge exists only to reconcile the historical split. Do not add future migrations to the legacy-equivalence list.

## Seed policy

Migration and seed are separate concerns:

- migration = schema evolution;
- seed/bootstrap = environment-specific initial/reference data;
- application data = never synchronized by Git branch merge.

A production deployment must never implicitly import master/demo data.
