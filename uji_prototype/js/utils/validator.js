/**
 * OpenAPI Schema parsing and validation utilities
 */

import { humanize, jsonOrThrow } from "./dom.js";

export function pointer(root, ref) {
  if (!ref?.startsWith("#/")) return null;
  return ref
    .slice(2)
    .split("/")
    .reduce((v, k) => v?.[k.replace(/~1/g, "/").replace(/~0/g, "~")], root);
}

export function mergeSchema(a, b) {
  return {
    ...a,
    ...b,
    required: [...new Set([...(a.required || []), ...(b.required || [])])],
    properties: { ...(a.properties || {}), ...(b.properties || {}) },
  };
}

export function resolveSchema(schema, rootSchema = null, seen = new Set()) {
  if (!schema || typeof schema !== "object") return {};
  if (schema.$ref) {
    if (seen.has(schema.$ref)) return { type: "object", properties: {} };
    const next = new Set(seen);
    next.add(schema.$ref);
    return resolveSchema(pointer(rootSchema, schema.$ref), rootSchema, next);
  }
  if (Array.isArray(schema.allOf)) {
    return schema.allOf.reduce((a, b) => mergeSchema(a, resolveSchema(b, rootSchema, seen)), {
      ...schema,
      allOf: undefined,
    });
  }
  if (Array.isArray(schema.oneOf) && schema.oneOf.length) {
    return mergeSchema({ ...schema, oneOf: undefined }, resolveSchema(schema.oneOf[0], rootSchema, seen));
  }
  if (Array.isArray(schema.anyOf) && schema.anyOf.length) {
    const n = schema.anyOf.find(x => x.type !== "null") || schema.anyOf[0];
    return mergeSchema(
      { ...schema, anyOf: undefined, nullable: schema.anyOf.some(x => x.type === "null") },
      resolveSchema(n, rootSchema, seen)
    );
  }
  const out = { ...schema };
  if (out.properties) {
    out.properties = Object.fromEntries(
      Object.entries(out.properties).map(([k, v]) => [k, resolveSchema(v, rootSchema, seen)])
    );
  }
  if (out.items) {
    out.items = resolveSchema(out.items, rootSchema, seen);
  }
  return out;
}

export function requestSchema(op, rootSchema = null) {
  const c = op?.requestBody?.content || {};
  const media = c["application/json"] || c["application/x-www-form-urlencoded"] || c["multipart/form-data"];
  return media?.schema ? resolveSchema(media.schema, rootSchema) : { type: "object", properties: {} };
}

export function fieldSpecs(schema, initial = {}, rootSchema = null) {
  const s = resolveSchema(schema, rootSchema);
  const req = new Set(s.required || []);
  return Object.entries(s.properties || {})
    .filter(([, p]) => !p.readOnly)
    .map(([name, p]) => ({
      name,
      label: humanize(name),
      type: p.type || (p.properties ? "object" : p.items ? "array" : "string"),
      format: p.format || "",
      description: p.description || "",
      required: req.has(name),
      enum: p.enum || null,
      value: initial?.[name] ?? p.default ?? p.example ?? "",
      schema: p,
    }));
}

export function collectForm(form, fields) {
  const out = {};
  fields.forEach(f => {
    const c = form.elements[f.name];
    if (!c) return;
    let v = f.type === "boolean" ? c.checked : c.value;
    if ((v === "" || v === null) && !f.required) return;
    if ((v === "" || v === null) && f.required) throw new Error(`${f.label} wajib diisi.`);
    if (f.type === "integer") {
      v = parseInt(v, 10);
      if (Number.isNaN(v)) throw new Error(`${f.label} harus integer.`);
    }
    if (f.type === "number") {
      v = Number(v);
      if (Number.isNaN(v)) throw new Error(`${f.label} harus angka.`);
    }
    if (f.type === "object" || f.type === "array") {
      v = jsonOrThrow(v, `${f.label} harus JSON valid.`);
    }
    if (f.format === "date-time" && v && !String(v).includes("Z")) {
      v = new Date(v).toISOString();
    }
    out[f.name] = v;
  });
  return out;
}
