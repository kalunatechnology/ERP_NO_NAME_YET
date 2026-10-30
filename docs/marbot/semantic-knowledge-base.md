# Marka Plus semantic knowledge base

The assistant maps a user request to a permission-filtered ERP knowledge base before it chooses a reader. The LLM uses business meanings and aliases to identify the resource; generated route metadata and the Prisma schema provide the physical table, column names, types, enum values, and declared relationships. The LLM never invents SQL or accesses the database directly.

## Mapping path

`user wording → intent and entity → module/resource → database schema/table → columns and code values → validated API read → LLM answer grounded in returned rows`

For example, “Tampilkan opportunity CRM yang dapat saya akses” maps to:

| Layer | Definition |
| --- | --- |
| Intent | List live records |
| Business entity | CRM opportunity / deal |
| Resource | `crm.opportunities` |
| Physical source | `public.crm_opportunity` |
| Relevant columns | `opportunity_name`, `pipeline_stage`, `status`, `owner_user_id`, `customer_party_id`, expected value/date fields (each entry records the API field and physical database column) |
| Access behavior | No inferred owner filter; the authenticated CRM API applies the user's tenant, role, and record scope |

The semantic overlay in `src/modules/marbot/knowledge/resource-knowledge.ts` defines user-facing meanings and aliases for business entities and columns. `resource-catalog.generated.json` maps API resources to Prisma models and routes. Runtime metadata adds physical table/column names, column types, primary/unique keys, enum/code values, Prisma relationships, and live database foreign keys for the selected tables. All of this is filtered through the user's current permissions before it reaches the LLM.

The ERP currently has a large resource catalogue, so the assistant uses hierarchical retrieval instead of placing every table in one prompt: first the business glossary ranks likely resources, then the LLM receives the permission-filtered schema details for those candidates and their allowed relationships. Schema names and types come from generated application metadata; curated meanings and examples add business-language context. This keeps exact identifiers authoritative while limiting irrelevant schema noise.

## Typed query plan

The LLM returns a structured plan rather than SQL. The plan identifies a resource, operation, selected API columns, typed equality or `in` filters, text search, one sort field, a bounded row limit, and verified relation paths. The backend checks every resource, field, type, enum value, relationship, and literal filter against the current schema and user scope, then compiles the plan to the canonical ERP API. `select` controls which columns are sent to the answer model; it does not grant access to fields hidden by the API.

Example plan for the opportunity request:

```json
{
  "resource": "crm.opportunities",
  "operation": "list",
  "select": ["opportunity_name", "pipeline_stage", "status", "expected_close_date"],
  "filters": {},
  "limit": 30
}
```

The plan deliberately has no owner filter. The authenticated CRM endpoint applies tenant, role, and row visibility. If the user asks for a stage-code definition, the LLM selects `crm.pipeline-stages` and reads the actual `stage_code` and `stage_name` values rather than inventing a code meaning.

## Responsibilities

- The LLM interprets wording, selects an intent and a permitted resource, chooses literal columns/filters, and explains returned data naturally.
- The ERP backend validates the selected resource, field names, field types, literal filter values, declared relationships, tenant scope, and role permissions.
- The canonical ERP API reads the rows. The LLM receives only the scoped result and cannot widen access or issue direct SQL.
- Users ask for business information. Developers maintain entity/column meanings and the generated schema map; users are never asked to configure internal resources.

When adding a domain term, add it to the semantic overlay and connect it to an existing generated resource key. When a Prisma model or route changes, regenerate the canonical resource catalogue. Do not add an alias that implies a relationship unless the Prisma schema and permitted API path support it.
