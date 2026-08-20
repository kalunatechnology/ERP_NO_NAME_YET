/**
 * Reusable Toast Notification Component
 */

import { esc } from "../utils/dom.js";

let toastContainer = null;

function ensureContainer() {
  if (!toastContainer) {
    toastContainer = document.getElementById("toasts");
    if (!toastContainer) {
      toastContainer = document.createElement("div");
      toastContainer.id = "toasts";
      toastContainer.className = "toasts";
      document.body.appendChild(toastContainer);
    }
  }
  return toastContainer;
}

export function toast(title, message = "", type = "info") {
  const container = ensureContainer();
  const item = document.createElement("div");
  item.className = `toast ${type}`;
  item.innerHTML = `
    <strong>${esc(title)}</strong>
    ${message ? `<p>${esc(message)}</p>` : ""}
  `;

  container.appendChild(item);

  setTimeout(() => {
    item.style.opacity = "0";
    item.style.transform = "translateX(30px)";
    item.style.transition = "all 0.3s ease";
    setTimeout(() => {
      if (item.parentNode) item.parentNode.removeChild(item);
    }, 300);
  }, 4000);
}
