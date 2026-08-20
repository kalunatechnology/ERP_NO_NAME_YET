/**
 * OpenAPI Schema Service (Fetch, Catalog, Operations, and Resource Resolver)
 */

import { METHODS } from "../config/constants.js";
import { state } from "../core/state.js";
import { normalizeBase } from "../utils/formatters.js";
import { humanize, truncate } from "../utils/dom.js";
import { eventBus } from "../core/event-bus.js";

export async function loadOpenAPISchema(forceLive = false) {
  let schema = null;
  let liveError = "";

  try {
    schema = await fetchSchemaUrl(`${normalizeBase(state.base)}/api/schema/?format=json`);
    state.schemaSource = "live";
  } catch (error) {
    liveError = error.message;
    if (forceLive) {
      throw new Error(`Schema live gagal: ${error.message}`);
    }
  }

  if (!schema) {
    try {
      schema = await fetchSchemaUrl("./openapi-schema.json");
      state.schemaSource = "bundled";
    } catch (error) {
      state.schema = null;
      throw new Error(`Schema gagal dimuat. Live: ${liveError}; Offline: ${error.message}`);
    }
  }

  state.schema = schema;
  buildCatalog();
  eventBus.emit("schema:loaded", { schema: state.schema, source: state.schemaSource });
  return state.schema;
}

export async function fetchSchemaUrl(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      ...(state.access ? { Authorization: `Bearer ${state.access}` } : {}),
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${truncate(text, 160)}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Schema bukan JSON. Gunakan /api/schema/?format=json.");
  }
}

export function buildCatalog() {
  const paths = state.schema?.paths || {};
  state.operations = [];

  Object.entries(paths).forEach(([path, item]) => {
    METHODS.forEach(method => {
      const raw = item[method];
      if (!raw) return;
      state.operations.push({
        key: `${method.toUpperCase()} ${path}`,
        method: method.toUpperCase(),
        path,
        summary: raw.summary || `${method.toUpperCase()} ${humanize(path.split("/").filter(Boolean).at(-1) || "endpoint")}`,
        description: raw.description || "",
        tags: raw.tags || [deriveModule(path)],
        parameters: mergeParams(item.parameters || [], raw.parameters || []),
        requestBody: raw.requestBody || null,
        responses: raw.responses || {},
        raw,
      });
    });
  });

  state.resources = [];
  Object.entries(paths).forEach(([path, item]) => {
    if (!isResource(path, item)) return;
    const detailPath = paths[`${path}{id}/`] ? `${path}{id}/` : null;
    const listOp = state.operations.find(op => op.path === path && op.method === "GET") || null;
    const createOp = state.operations.find(op => op.path === path && op.method === "POST") || null;
    const tag = (listOp?.tags || createOp?.tags || [deriveModule(path)])[0];
    const module = normalizeModule(tag, path);
    const slug = path.split("/").filter(Boolean).at(-1);

    state.resources.push({
      path,
      detailPath,
      slug,
      title: humanize(slug),
      module,
      listOp,
      createOp,
      retrieveOp: detailPath
        ? state.operations.find(op => op.path === detailPath && op.method === "GET") || null
        : null,
      updateOp: detailPath
        ? state.operations.find(op => op.path === detailPath && op.method === "PATCH") ||
          state.operations.find(op => op.path === detailPath && op.method === "PUT") ||
          null
        : null,
      deleteOp: detailPath
        ? state.operations.find(op => op.path === detailPath && op.method === "DELETE") || null
        : null,
    });
  });

  state.resources.sort((a, b) => a.module.localeCompare(b.module) || a.title.localeCompare(b.title));

  const map = new Map();
  state.resources.forEach(resource => {
    if (!map.has(resource.module)) map.set(resource.module, { name: resource.module, resources: [], operations: 0 });
    map.get(resource.module).resources.push(resource);
  });

  state.operations.forEach(op => {
    const module = normalizeModule(op.tags?.[0], op.path);
    if (!map.has(module)) map.set(module, { name: module, resources: [], operations: 0 });
    map.get(module).operations += 1;
  });

  state.modules = [...map.values()].sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
}

function isResource(path, item) {
  if (!path.startsWith("/api/v1/") || path.includes("{") || path.includes("/commands/") || path.includes("/auth/"))
    return false;
  if (/\/(bulk-create|bulk-update|bulk-delete|metadata)\/$/.test(path)) return false;
  return Boolean(item.get || item.post);
}

function mergeParams(a, b) {
  const map = new Map();
  [...a, ...b].forEach(p => map.set(`${p.in}:${p.name}`, p));
  return [...map.values()];
}

function deriveModule(path) {
  const p = path.split("/").filter(Boolean);
  return p[2] === "commands" ? `Commands — ${humanize(p[3] || "General")}` : p[2] || "General";
}

export function normalizeModule(tag, path) {
  const raw = tag || deriveModule(path);
  if (raw === "auth") return "Authentication";
  if (raw === "master-data") return "Master Data";
  return raw.startsWith("Commands") ? raw : humanize(raw);
}

export function rank(name) {
  const order = [
    "Authentication",
    "System",
    "Accounts",
    "Core",
    "Master Data",
    "CRM",
    "Sales",
    "Projects",
    "Procurement",
    "Inventory",
    "Manufacturing",
    "Quality",
    "Finance",
    "Assets",
    "Service",
    "Logistics",
    "Analytics",
    "Reporting",
    "Dashboards",
  ];
  const i = order.indexOf(name);
  return i >= 0 ? i : name.startsWith("Commands") ? 100 : 50;
}
