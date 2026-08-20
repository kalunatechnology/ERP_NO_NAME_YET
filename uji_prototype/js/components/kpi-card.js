/**
 * Metric & KPI Card Components
 */

import { esc } from "../utils/dom.js";
import { formatMoney, number } from "../utils/formatters.js";

export function renderMetricCard(label, value, foot = "") {
  return `
    <article class="metric">
      <span>${esc(label)}</span>
      <strong>${typeof value === "number" ? number(value) : esc(String(value ?? 0))}</strong>
      ${foot ? `<small>${esc(foot)}</small>` : ""}
    </article>
  `;
}

export function renderMoneyMetricCard(label, value, foot = "IDR · snapshot terbaru") {
  return `
    <article class="metric">
      <span>${esc(label)}</span>
      <strong>${esc(formatMoney(value))}</strong>
      <small>${esc(foot)}</small>
    </article>
  `;
}

export function renderStatusRow(label, value, type = "info") {
  return `
    <div class="status-row">
      <div>
        <strong>${esc(label)}</strong>
        <span>${esc(String(value || "-"))}</span>
      </div>
      <span class="badge ${type}">${type === "success" ? "Ready" : type === "warning" ? "Check" : "Info"}</span>
    </div>
  `;
}
