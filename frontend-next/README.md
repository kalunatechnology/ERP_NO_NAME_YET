# Marka+ ERP Frontend

Next.js 14 App Router frontend for the active Express ERP API. Current technical and performance status is documented in [Current Implementation Status](../docs/CURRENT_IMPLEMENTATION_STATUS.md).

## Current behavior

- Login hydrates user, company, active role, assigned roles, `enabled_modules`, and `delegated_modules` from one response.
- The initial dashboard uses `/api/v1/dashboard/bootstrap?sections=projects,finance` plus the Request Card feed in parallel.
- The dashboard does not restore the former multi-route browser fan-out.
- API requests send JWT and the active `X-Company-ID` context.
- `lib/access/module-contract.ts` is the frontend source for route/module/API preflight mapping. Route labels are never converted into module codes; `/tasks` uses `PROJECTS`.
- Known modular requests are checked against active role, company entitlement, and valid personal delegation before transmission. Backend middleware remains authoritative.
- Cache diagnostics are available through `X-Dashboard-Cache` and `X-Request-Cache`.
- Production build currently generates 14 application routes successfully.

## Environment

Set `NEXT_PUBLIC_API_BASE_URL` to the Express API origin. Keep secrets out of `NEXT_PUBLIC_*` variables because they are embedded in the browser bundle.

## Getting Started

First, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

For a production check, run `npm run build` and verify login plus `/dashboard` against the intended Express environment. The latest verified initial-load target is 3,000 ms; record cold and cache-hit runs separately.
