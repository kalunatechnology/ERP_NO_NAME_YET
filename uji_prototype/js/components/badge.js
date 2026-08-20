/**
 * Status Badge Component
 */

import { esc } from "../utils/dom.js";

export function renderBadge(text, type = "info") {
  if (!text) return "";
  return `<span class="badge ${esc(type)}">${esc(text)}</span>`;
}

export function statusBadge(status) {
  if (!status) return `<span class="badge info">-</span>`;
  const s = String(status).toUpperCase();
  let type = "info";
  if (["ACTIVE", "POSTED", "APPROVED", "PAID", "WON", "COMPLETED", "SUCCESS", "QUALIFIED", "READY", "RESOLVED", "SAFE"].includes(s)) {
    type = "success";
  } else if (["PENDING", "PENDING_APPROVAL", "DRAFT", "IN_PROGRESS", "SUBMITTED", "OVER", "HOLD", "WARNING"].includes(s)) {
    type = "warning";
  } else if (["REJECTED", "CANCELLED", "FAILED", "CLOSED", "LOST", "ERROR", "DANGER", "OVERDUE"].includes(s)) {
    type = "danger";
  }
  return `<span class="badge ${type}">${esc(status)}</span>`;
}
