# ERP Migration Branch Contract

This repository intentionally keeps **master data** and **production data** isolated while converging both databases on the same application schema.

## Current historical lineages

Before 2026-09-22 the two databases recorded equivalent schema evolution differently:

- **Master lineage** — incremental Prisma migrations from `20260903060000_q3_access_and_tenant_scope` through `20260921171000_marbot_ai_read_views`.
- **Production lineage** — squashed migration `20260922000000_production_baseline`.

Both histories now remain committed under `prisma/migrations/`. The deployment gate in `scripts/deploy_hostinger_migrations.js` identifies the target database from `_prisma_migrations` and records the equivalent history instead of replaying duplicate DDL.

`20260924024500_align_uuid_storage_to_production_text` is a master convergence migration. It converts legacy UUID-backed columns to the production TEXT-backed Prisma String contract. On a production-baselined database it is recorded as applied and is not executed because production already uses TEXT storage.

`20260924031000_refresh_read_views_after_history_convergence` is a historical post-convergence read-view migration. The production baseline contains several reporting `view_*` relations as physical tables, so this migration must not be blindly replayed there. `20260924040000_repair_skipped_text_id_convergence` preserves those physical tables, recreates the compatible read projections, and the deployment gate verifies the resulting relation kinds before recording the superseded read-view refresh as applied.

## Rules from the convergence point forward

1. `prisma/schema.prisma` is shared by master and production.
2. New schema changes use one normal migration history and must be committed under `prisma/migrations/`.
3. Never create separate `migration-master` and `migration-production` variants for the same schema change.
4. Never edit an already-successful migration. Fix it with a new migration or deployment reconciliation that verifies the physical state first.
5. Never put demo/sample/reset data inside schema migrations.
6. **Application build and database migration are separate operations.** `npm run build` must never connect to or mutate a live database. Run `npm run deploy:hostinger:db` explicitly for a controlled database release.
7. Master and production may contain different business rows, users, projects, invoices, and other data. Schema parity does not mean data parity.
8. Run `npm run audit:db-architecture` explicitly after a database migration when release operations require physical schema verification.

## Safe master -> production merge

After source code is merged from master into production:

1. The application/frontend build can proceed independently and does not force Prisma migrations.
2. When a database release is actually required, run `npm run deploy:hostinger:db` explicitly.
3. The database gate reads `_prisma_migrations` from the target database.
4. If `20260922000000_production_baseline` is present and successful, the deployment gate records the equivalent historical master migrations as applied without executing duplicate DDL.
5. If the complete legacy master tail is present instead, the production squash baseline is recorded as schema-equivalent without executing it.
6. The forward TEXT-ID repair handles legacy UUID storage and preserves production reporting tables; the gate verifies the resulting projections before reconciling the superseded read-view refresh.
7. Only genuinely pending migrations after convergence are passed to `prisma migrate deploy`.

The bridge exists only to reconcile the historical split. Do not add future migrations to the legacy-equivalence list.

## Seed policy

Migration and seed are separate concerns:

- migration = schema evolution;
- seed/bootstrap = environment-specific initial/reference data;
- application data = never synchronized by Git branch merge.

Seed profiles are intentionally stored separately:

- `prisma/seed.master.ts` — master/demo dataset; it refuses to run under normal production mode unless its existing explicit demo override is supplied.
- `prisma/seed.production.ts` — preserved production reset/bootstrap profile with its destructive-reset confirmation and production password guard.
- `prisma/seed.ts` — safety guard only; generic seeding is disabled.

Use only explicit commands:

```bash
npm run seed:master
npm run seed:production
```

A normal application build/deploy does **not** run either seed profile and does **not** run database migrations. Production data therefore cannot be overwritten by merging the master branch.