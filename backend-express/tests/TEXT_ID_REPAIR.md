# TEXT ID repair validation

The deployment gate checks physical UUID columns before bridging the historical
conversion. The new forward migration repairs databases whose earlier conversion
was recorded as applied without executing its SQL. Applied migration files remain
unchanged.

Run `npm run test:migration-convergence` for the deployment regression tests.
`node tests/text-id-repair.integration.js` requires an empty, disposable PostgreSQL
database on localhost:55439, user postgres. Set `TEXT_ID_TEST_DATABASE` to its name
(default postgres). It creates the production baseline and test fixtures, verifies
transaction rollback on an unknown dependent view, converts UUID columns, checks
identifier values, foreign keys and defaults, and repeats the repair. Never point
this fixture test at an existing application database.

Production rollout uses the existing deployment environment with
`DEPLOYMENT_TARGET=hostinger` and `SUPABASE_DIRECT_URL` (or `DIRECT_URL`). Ensure a
recoverable database backup is available before schema changes. Then run:

```sh
node scripts/inspect_text_id_state.js
npm run deploy:hostinger:db
npm run audit:db-architecture
npm run build
```

The inspection script is read-only and reports migration history and UUID column
count without printing credentials. Its `--session-pooler` option uses port 5432
of DATABASE_URL only after checking it identifies the same Supabase project.
Inspection does not change deployment URL settings.

An unknown dependent view, policy, or other incompatible schema object can still
block PostgreSQL type changes; the migration must roll back rather than remove
unknown dependencies. Baseline view_* physical tables are retained, including
their data, while actual repository-owned views are recreated.
