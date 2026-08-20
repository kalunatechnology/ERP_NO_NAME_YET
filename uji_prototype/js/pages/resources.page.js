/**
 * Data Explorer & OpenAPI Dynamic Schema CRUD Page Controller
 */

import { state } from "../core/state.js";
import { router } from "../core/router.js";
import { setPageHeader } from "../components/topbar.js";
import { esc, attr, replacePath, jsonOrThrow } from "../utils/dom.js";
import { normalizeList, formatDate } from "../utils/formatters.js";
import { requestSchema, fieldSpecs, collectForm } from "../utils/validator.js";
import { renderFormFields } from "../components/form-builder.js";
import { emptyState, loadingState, errorState } from "../components/state-views.js";
import { Modal } from "../components/modal.js";
import { toast } from "../components/toast.js";
import { requestJSON } from "../core/http.js";

export async function renderResourcesPage({ params = {} } = {}) {
  const workspace = document.getElementById("workspace");
  if (!workspace) return;

  if (params.module && params.resource) {
    const foundRes = state.resources.find(
      r =>
        r.module.toLowerCase() === decodeURIComponent(params.module).toLowerCase() &&
        (r.slug === params.resource || r.path.includes(params.resource))
    );
    if (foundRes) {
      state.resource = foundRes;
      state.module = foundRes.module;
    }
  }

  if (!state.resource) {
    state.resource = state.resources[0] || null;
  }

  if (!state.resource) {
    setPageHeader("Data Explorer", "Resource Tidak Ditemukan");
    workspace.innerHTML = emptyState("Belum ada resource schema OpenAPI yang dimuat.");
    return;
  }

  const r = state.resource;
  setPageHeader(r.module, r.title);

  workspace.innerHTML = `
    <div class="content-toolbar" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px;">
      <div style="display:flex;gap:8px;align-items:center;">
        <input id="resSearchInput" type="search" placeholder="Cari data..." value="${attr(state.pagination.search)}" style="padding:8px 12px;border:1px solid var(--line);border-radius:8px;font-size:12px;min-width:200px;">
        <button id="btnSearchRes" class="button secondary small">Cari</button>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        ${r.createOp ? `<button id="btnCreateRes" class="button primary small">+ Tambah ${esc(r.title)}</button>` : ""}
        <button id="btnReloadRes" class="button ghost small">🔄 Refresh</button>
      </div>
    </div>
    <div id="resTableContainer">${loadingState("Mengambil data...")}</div>
  `;

  document.getElementById("btnSearchRes")?.addEventListener("click", () => {
    state.pagination.search = document.getElementById("resSearchInput")?.value.trim() || "";
    state.pagination.page = 1;
    loadAndRenderRows(r);
  });

  document.getElementById("resSearchInput")?.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      state.pagination.search = e.target.value.trim();
      state.pagination.page = 1;
      loadAndRenderRows(r);
    }
  });

  document.getElementById("btnReloadRes")?.addEventListener("click", () => {
    loadAndRenderRows(r);
  });

  document.getElementById("btnCreateRes")?.addEventListener("click", () => {
    openResourceForm(r, null);
  });

  await loadAndRenderRows(r);
}

async function loadAndRenderRows(r) {
  const container = document.getElementById("resTableContainer");
  if (!container) return;

  container.innerHTML = loadingState("Mengambil data dari API...");

  try {
    const q = new URLSearchParams();
    q.set("page", state.pagination.page);
    q.set("page_size", state.pagination.pageSize);
    if (state.pagination.search) q.set("search", state.pagination.search);

    const fullPath = `${r.path}?${q.toString()}`;
    const res = await requestJSON(fullPath, { method: "GET" });
    const normalized = normalizeList(res);

    state.rows = normalized.rows;
    state.pagination.count = normalized.count;
    state.pagination.next = normalized.next;
    state.pagination.previous = normalized.previous;

    renderTable(r, container);
  } catch (err) {
    container.innerHTML = errorState("Gagal Mengambil Data", err.message);
  }
}

function renderTable(r, container) {
  const rows = state.rows;
  if (!rows || rows.length === 0) {
    container.innerHTML = emptyState(`Belum ada data pada ${r.title}.`);
    return;
  }

  const cols = Object.keys(rows[0] || {})
    .filter(k => !k.startsWith("__") && typeof rows[0][k] !== "object")
    .slice(0, 6);

  const thead = `
    <thead>
      <tr>
        ${cols.map(c => `<th>${esc(c)}</th>`).join("")}
        <th style="text-align:right;">Aksi</th>
      </tr>
    </thead>
  `;

  const tbody = `
    <tbody>
      ${rows
        .map(
          (row, idx) => `
        <tr>
          ${cols
            .map(c => {
              const val = row[c];
              return `<td>${esc(String(val ?? "-"))}</td>`;
            })
            .join("")}
          <td style="text-align:right;">
            <div class="inline-actions" style="justify-content:flex-end;display:flex;gap:4px;">
              <button class="button small ghost" data-res-act="view" data-index="${idx}">Detail</button>
              ${r.updateOp ? `<button class="button small secondary" data-res-act="edit" data-index="${idx}">Edit</button>` : ""}
              ${r.deleteOp ? `<button class="button small danger" data-res-act="delete" data-index="${idx}">Hapus</button>` : ""}
            </div>
          </td>
        </tr>
      `
        )
        .join("")}
    </tbody>
  `;

  const paginationHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;border-top:1px solid var(--line);">
      <small style="color:var(--muted);">Total ${state.pagination.count || rows.length} data</small>
      <div style="display:flex;gap:6px;">
        <button class="button small secondary" id="btnPrevPage" ${!state.pagination.previous ? "disabled" : ""}>← Sebelumnya</button>
        <span style="display:grid;place-items:center;padding:0 8px;font-size:12px;font-weight:700;">Halaman ${state.pagination.page}</span>
        <button class="button small secondary" id="btnNextPage" ${!state.pagination.next ? "disabled" : ""}>Selanjutnya →</button>
      </div>
    </div>
  `;

  container.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">${thead}${tbody}</table>
      ${paginationHTML}
    </div>
  `;

  document.getElementById("btnPrevPage")?.addEventListener("click", () => {
    if (state.pagination.page > 1) {
      state.pagination.page--;
      loadAndRenderRows(r);
    }
  });

  document.getElementById("btnNextPage")?.addEventListener("click", () => {
    state.pagination.page++;
    loadAndRenderRows(r);
  });

  container.querySelectorAll("[data-res-act]").forEach(btn => {
    btn.addEventListener("click", () => {
      const act = btn.dataset.resAct;
      const idx = Number(btn.dataset.index);
      const row = state.rows[idx];

      if (act === "view") {
        Modal.open(
          r.module,
          `Detail ${r.title}`,
          `<pre class="json-view">${esc(JSON.stringify(row, null, 2))}</pre>`,
          `<button class="button secondary" onclick="document.getElementById('modalClose').click()">Tutup</button>`
        );
      } else if (act === "edit") {
        openResourceForm(r, row);
      } else if (act === "delete") {
        deleteResourceRow(r, row);
      }
    });
  });
}

function openResourceForm(r, row) {
  const op = row ? r.updateOp : r.createOp;
  if (!op) return;

  const schema = requestSchema(op, state.schema);
  const fields = fieldSpecs(schema, row || {}, state.schema);
  const formId = `form-${Date.now()}`;

  Modal.open(
    r.module,
    `${row ? "Edit" : "Tambah"} ${r.title}`,
    `
      <form id="${formId}" class="dynamic-form">
        ${renderFormFields(fields)}
      </form>
    `,
    `
      <button class="button secondary" onclick="document.getElementById('modalClose').click()">Batal</button>
      <button id="btnSubmitSchemaForm" class="button primary">${row ? "Simpan Perubahan" : "Simpan Data"}</button>
    `
  );

  document.getElementById("btnSubmitSchemaForm")?.addEventListener("click", async e => {
    const form = document.getElementById(formId);
    if (!form) return;
    try {
      e.target.disabled = true;
      e.target.textContent = "Mengirim...";

      const payload = fields.length
        ? collectForm(form, fields)
        : jsonOrThrow(form.elements.__raw?.value || "{}", "JSON tidak valid.");

      const path = row ? replacePath(op.path, { id: row.id }) : r.path;
      await requestJSON(path, { method: op.method, body: payload });

      Modal.close();
      toast("Data Tersimpan", `${r.title} berhasil ${row ? "diperbarui" : "dibuat"}.`, "success");
      loadAndRenderRows(r);
    } catch (err) {
      e.target.disabled = false;
      e.target.textContent = row ? "Simpan Perubahan" : "Simpan Data";
      toast("Gagal Menyimpan", err.message, "error");
    }
  });
}

function deleteResourceRow(r, row) {
  if (!row?.id) {
    toast("Delete Gagal", "Row tidak memiliki field ID.", "error");
    return;
  }

  Modal.open(
    "Danger Zone",
    `Hapus ${r.title}`,
    `
      <div class="error-state" style="padding:20px;text-align:center;">
        <div class="state-icon">!</div>
        <h3>Yakin ingin menghapus data ini?</h3>
        <code class="path" style="display:inline-block;margin-top:8px;">ID: ${esc(row.id)}</code>
      </div>
    `,
    `
      <button class="button secondary" onclick="document.getElementById('modalClose').click()">Batal</button>
      <button id="btnConfirmDelete" class="button danger">Hapus Sekarang</button>
    `
  );

  document.getElementById("btnConfirmDelete")?.addEventListener("click", async e => {
    try {
      e.target.disabled = true;
      await requestJSON(replacePath(r.deleteOp.path, { id: row.id }), { method: "DELETE" });
      Modal.close();
      toast("Data Dihapus", `${r.title} berhasil dihapus.`, "success");
      loadAndRenderRows(r);
    } catch (err) {
      e.target.disabled = false;
      toast("Delete Gagal", err.message, "error");
    }
  });
}
