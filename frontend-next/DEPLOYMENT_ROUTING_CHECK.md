# Deployment Routing Check

This file is a harmless deployment probe used to verify Vercel branch isolation.

Expected routing:
- `master` -> `erp-no-name-yet`
- `production` -> `erp-production`

No runtime behavior, API contract, Prisma schema, migration, or application logic is changed by this file.
