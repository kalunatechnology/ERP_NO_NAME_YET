/**
 * Reusable Data Table Component
 */

import { esc, truncate } from "../utils/dom.js";
import { formatMoney, formatDate } from "../utils/formatters.js";
import { emptyState, loadingState } from "./state-views.js";

export function renderDataTable({
  columns = [],
  rows = [],
  loading = false,
  emptyText = "Belum ada data.",
  actions = [],
  actionAttribute = "data-action",
  pagination = null,
}) {
  if (loading) return loadingState();
  if (!rows || rows.length === 0) return emptyState(emptyText);

  // If no columns provided, derive from first row
  const resolvedCols = columns.length
    ? columns
    : Object.keys(rows[0] || {})
        .filter(k => !k.startsWith("__") && typeof rows[0][k] !== "object")
        .slice(0, 7)
        .map(k => ({ key: k, label: k }));

  const thead = `
    <thead>
      <tr>
        ${resolvedCols.map(col => `<th>${esc(col.label || col.key)}</th>`).join("")}
        ${actions.length ? `<th style="text-align:right">Aksi</th>` : ""}
      </tr>
    </thead>
  `;

  const tbody = `
    <tbody>
      ${rows
        .map((row, index) => {
          const cells = resolvedCols
            .map(col => {
              const val = row[col.key];
              let rendered;
              if (typeof col.render === "function") {
                rendered = col.render(val, row, index);
              } else if (col.type === "money" || /amount|budget|cost|price|total/i.test(col.key)) {
                rendered = formatMoney(val);
              } else if (col.type === "date" || /created_at|updated_at|date/i.test(col.key)) {
                rendered = formatDate(val);
              } else if (typeof val === "object" && val !== null) {
                rendered = `<code>${esc(truncate(JSON.stringify(val), 25))}</code>`;
              } else {
                rendered = esc(String(val ?? "-"));
              }
              return `<td>${rendered}</td>`;
            })
            .join("");

          const actionButtons = actions.length
            ? `<td style="text-align:right">
                <div class="inline-actions" style="justify-content:flex-end;display:flex;gap:4px;">
                  ${actions
                    .map(act => {
                      const isVisible = typeof act.visible === "function" ? act.visible(row) : true;
                      if (!isVisible) return "";
                      return `<button class="button small ${esc(act.className || "ghost")}" ${actionAttribute}="${esc(act.name)}" data-id="${esc(row.id || index)}" title="${esc(act.title || act.label)}">${esc(act.label)}</button>`;
                    })
                    .join("")}
                </div>
              </td>`
            : "";

          return `<tr>${cells}${actionButtons}</tr>`;
        })
        .join("")}
    </tbody>
  `;

  const paginationHTML = pagination
    ? `
      <div class="pagination-bar" style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-top:1px solid var(--line);">
        <small style="color:var(--muted)">Menampilkan ${rows.length} dari ${pagination.count || rows.length} data</small>
        <div style="display:flex;gap:6px;">
          <button class="button small secondary" ${!pagination.previous ? "disabled" : ""} data-page="prev">← Sebelumnya</button>
          <span style="display:grid;place-items:center;padding:0 8px;font-size:12px;font-weight:700;">Halaman ${pagination.page || 1}</span>
          <button class="button small secondary" ${!pagination.next ? "disabled" : ""} data-page="next">Selanjutnya →</button>
        </div>
      </div>
    `
    : "";

  return `
    <div class="table-wrap">
      <table class="data-table">
        ${thead}
        ${tbody}
      </table>
      ${paginationHTML}
    </div>
  `;
}
