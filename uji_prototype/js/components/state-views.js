/**
 * State View Feedback Components (Loading, Empty, Error)
 */

import { esc } from "../utils/dom.js";

export function emptyState(text = "Tidak ada data.") {
  return `
    <div class="empty-state">
      <div class="state-icon">∅</div>
      <h3>${esc(text)}</h3>
    </div>
  `;
}

export function errorState(title = "Terjadi Kesalahan", message = "") {
  return `
    <div class="error-state">
      <div class="state-icon">!</div>
      <h3>${esc(title)}</h3>
      ${message ? `<p>${esc(message)}</p>` : ""}
    </div>
  `;
}

export function loadingState(text = "Memuat data...") {
  return `
    <div class="loading-state" style="display:grid;place-items:center;padding:40px;text-align:center;">
      <div class="spinner" style="width:32px;height:32px;border:3px solid var(--line);border-top-color:var(--primary);border-radius:50%;animation:spin 0.8s linear infinite;margin-bottom:12px;"></div>
      <p style="color:var(--muted);margin:0;font-size:13px;">${esc(text)}</p>
    </div>
  `;
}
