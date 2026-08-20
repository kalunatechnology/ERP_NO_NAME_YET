/**
 * Navigation Tabs Component
 */

import { esc } from "../utils/dom.js";

export function renderTabs({ tabs = [], activeTab = "", onTabChangeAttribute = "data-tab", className = "crm-tabs", badges = {} }) {
  return `
    <nav class="${esc(className)}">
      ${tabs
        .map(([id, label]) => {
          const isActive = activeTab === id;
          const count = badges[id] !== undefined ? `<span>${esc(badges[id])}</span>` : "";
          return `<button ${onTabChangeAttribute}="${esc(id)}" class="${isActive ? "active" : ""}">${esc(label)}${count}</button>`;
        })
        .join("")}
    </nav>
  `;
}
