/**
 * API Console Request Runner Page Controller
 */

import { state } from "../core/state.js";
import { setPageHeader } from "../components/topbar.js";
import { esc, attr, replacePath, jsonOrThrow, copyToClipboard } from "../utils/dom.js";
import { normalizeBase, formatData } from "../utils/formatters.js";
import { requestSchema, fieldSpecs, collectForm, resolveSchema } from "../utils/validator.js";
import { renderField } from "../components/form-builder.js";
import { emptyState } from "../components/state-views.js";
import { rawRequest } from "../core/http.js";
import { toast } from "../components/toast.js";

export function renderConsolePage() {
  setPageHeader("Manual Request Runner", "API Console");
  const workspace = document.getElementById("workspace");
  if (!workspace) return;

  const ops = filteredOperations();
  if (!state.operation || !ops.some(o => o.key === state.operation.key)) {
    state.operation = ops[0] || state.operations[0] || null;
  }

  workspace.innerHTML = `
    <section class="console">
      <aside class="operation-pane">
        <div class="operation-filter">
          <input id="opSearch" class="search-input" style="min-width:0;" placeholder="Cari path, summary, tag" value="${attr(state.console.query)}">
          <div class="method-filters">
            ${["all", "GET", "POST", "PUT", "PATCH", "DELETE"]
              .map(
                m => `
              <button class="method-filter ${state.console.method === m ? "active" : ""}" data-method="${m}">${m}</button>
            `
              )
              .join("")}
          </div>
        </div>
        <div id="opList" class="operation-list">
          ${renderOpList(ops)}
        </div>
      </aside>

      <article id="opWorkspace" class="operation-workspace">
        ${state.operation ? renderOpWorkspace(state.operation) : emptyState("Operation tidak ditemukan.")}
      </article>
    </section>
  `;

  document.getElementById("opSearch")?.addEventListener("input", e => {
    state.console.query = e.target.value;
    const currentOps = filteredOperations();
    const opListEl = document.getElementById("opList");
    if (opListEl) opListEl.innerHTML = renderOpList(currentOps);
    bindOpList();
  });

  workspace.querySelectorAll("[data-method]").forEach(b => {
    b.addEventListener("click", () => {
      state.console.method = b.dataset.method;
      renderConsolePage();
    });
  });

  bindOpList();
  bindOpWorkspace();
}

function filteredOperations() {
  const q = state.console.query.toLowerCase().trim();
  return state.operations.filter(
    o =>
      (state.console.method === "all" || o.method === state.console.method) &&
      (!q || `${o.path} ${o.summary} ${o.tags.join(" ")}`.toLowerCase().includes(q))
  );
}

function renderOpList(ops) {
  return (
    ops
      .slice(0, 500)
      .map(
        o => `
      <button class="operation-item ${state.operation?.key === o.key ? "active" : ""}" data-op="${attr(o.key)}">
        <span class="method ${o.method.toLowerCase()}">${o.method}</span>
        <div>
          <strong>${esc(o.summary)}</strong>
          <code>${esc(o.path)}</code>
        </div>
      </button>
    `
      )
      .join("") || emptyState("Operation tidak ditemukan.")
  );
}

function bindOpList() {
  document.querySelectorAll("[data-op]").forEach(b => {
    b.addEventListener("click", () => {
      state.operation = state.operations.find(o => o.key === b.dataset.op);
      renderConsolePage();
    });
  });
}

function renderOpWorkspace(op) {
  const pathParams = op.parameters.filter(p => p.in === "path");
  const queryParams = op.parameters.filter(p => p.in === "query");
  const headerParams = op.parameters.filter(p => p.in === "header");
  const fields = fieldSpecs(requestSchema(op, state.schema), {}, state.schema);

  return `
    <div class="operation-head">
      <span class="method ${op.method.toLowerCase()}">${op.method}</span>
      <div>
        <h2>${esc(op.summary)}</h2>
        <code>${esc(op.path)}</code>
      </div>
    </div>
    ${op.description ? `<div class="description">${esc(op.description)}</div>` : ""}
    <form id="opForm">
      ${paramSection("Path parameters", pathParams)}
      ${paramSection("Query parameters", queryParams)}
      ${paramSection("Header parameters", headerParams)}
      ${
        op.requestBody
          ? `
        <section class="form-section">
          <h3>Request body</h3>
          <div class="dynamic-form">
            ${
              fields.length
                ? fields.map(renderField).join("")
                : `<label class="field full"><span>JSON payload</span><textarea name="__raw" class="json-editor">{}</textarea></label>`
            }
          </div>
        </section>
      `
          : ""
      }
      <div class="toolbar" style="margin-top:14px;display:flex;gap:8px;">
        <button id="executeOp" class="button ${op.method === "DELETE" ? "danger" : "primary"}" type="button">Execute ${op.method}</button>
        <button id="copyCurl" class="button secondary" type="button">Copy cURL</button>
      </div>
    </form>
    <div id="responseHost"></div>
  `;
}

function paramSection(title, params) {
  if (!params.length) return "";
  return `
    <section class="form-section">
      <h3>${esc(title)}</h3>
      <div class="dynamic-form">
        ${params
          .map(p => {
            const s = resolveSchema(p.schema || {}, state.schema);
            return renderField({
              name: `param__${p.in}__${p.name}`,
              label: p.name,
              type: s.type || "string",
              format: s.format || "",
              description: p.description || "",
              required: Boolean(p.required),
              enum: s.enum || null,
              value: p.in === "header" && p.name.toLowerCase() === "x-company-id" ? state.company : s.default || "",
              schema: s,
            });
          })
          .join("")}
      </div>
    </section>
  `;
}

function bindOpWorkspace() {
  document.getElementById("executeOp")?.addEventListener("click", executeOperation);
  document.getElementById("copyCurl")?.addEventListener("click", handleCopyCurl);
}

function operationRequest(op, form) {
  const pathValues = {};
  const q = new URLSearchParams();
  const headers = {};

  op.parameters.forEach(p => {
    const c = form.elements[`param__${p.in}__${p.name}`];
    if (!c) return;
    const v = c.type === "checkbox" ? c.checked : c.value;
    if ((v === "" || v === undefined) && p.required) throw new Error(`Parameter ${p.name} wajib diisi.`);
    if (v === "" || v === undefined) return;
    if (p.in === "path") pathValues[p.name] = v;
    if (p.in === "query") q.set(p.name, v);
    if (p.in === "header") headers[p.name] = v;
  });

  let path = replacePath(op.path, pathValues);
  if (q.toString()) path += `?${q}`;

  let body;
  if (op.requestBody) {
    const fields = fieldSpecs(requestSchema(op, state.schema), {}, state.schema);
    body = fields.length ? collectForm(form, fields) : jsonOrThrow(form.elements.__raw?.value || "{}", "JSON tidak valid.");
  }
  return { path, headers, body };
}

async function executeOperation() {
  const op = state.operation;
  const form = document.getElementById("opForm");
  const button = document.getElementById("executeOp");

  if (op.method === "DELETE" && !confirm(`Yakin ingin mengeksekusi DELETE ${op.path}?`)) return;

  try {
    const req = operationRequest(op, form);
    button.disabled = true;
    button.textContent = "Executing...";

    const start = performance.now();
    const res = await rawRequest(req.path, { method: op.method, body: req.body, headers: req.headers });
    renderResponse(res, Math.round(performance.now() - start));
    toast(res.ok ? "Request Berhasil" : "Request Error", `${op.method} ${req.path} → ${res.status}`, res.ok ? "success" : "warning");
  } catch (error) {
    renderResponse({ ok: false, status: 0, statusText: "Client Error", data: { detail: error.message } }, 0);
    toast("Request Gagal", error.message, "error");
  } finally {
    button.disabled = false;
    button.textContent = `Execute ${op.method}`;
  }
}

async function handleCopyCurl() {
  try {
    const req = operationRequest(state.operation, document.getElementById("opForm"));
    const hs = [
      '-H "Accept: application/json"',
      ...(state.access ? ['-H "Authorization: Bearer ACCESS_TOKEN"'] : []),
      ...(state.company ? [`-H "X-Company-ID: ${state.company}"`] : []),
      ...Object.entries(req.headers).map(([k, v]) => `-H "${k}: ${v}"`),
    ];
    if (req.body !== undefined) hs.push('-H "Content-Type: application/json"');
    const body = req.body !== undefined ? ` \\\n  -d '${JSON.stringify(req.body)}'` : "";
    const curl = `curl -X ${state.operation.method} "${normalizeBase(state.base)}${req.path}" \\\n  ${hs.join(" \\\n  ")}${body}`;
    await copyToClipboard(curl);
    toast("cURL Disalin", "Ganti ACCESS_TOKEN dengan token aktual.", "success");
  } catch (error) {
    toast("cURL Gagal", error.message, "error");
  }
}

function renderResponse(res, duration) {
  const host = document.getElementById("responseHost");
  if (!host) return;
  host.innerHTML = `
    <section class="response" style="margin-top:16px;">
      <header class="response-head" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <div class="toolbar" style="display:flex;gap:6px;">
          <span class="badge ${res.ok ? "success" : "danger"}">${res.status || "ERR"} ${esc(res.statusText || "")}</span>
          <span class="badge info">${duration} ms</span>
        </div>
        <button id="copyResponse" class="button ghost small">Copy JSON</button>
      </header>
      <pre class="json-view">${esc(formatData(res.data))}</pre>
    </section>
  `;

  document.getElementById("copyResponse")?.addEventListener("click", async () => {
    await copyToClipboard(formatData(res.data));
    toast("Response Disalin", "Data berhasil disalin ke clipboard.", "success");
  });
}
