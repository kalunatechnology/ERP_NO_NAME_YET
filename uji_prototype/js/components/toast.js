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

export function toast(titleOrMessage, message = "", type = "info") {
  const container = ensureContainer();
  const item = document.createElement("div");

  let t = titleOrMessage;
  let m = message;
  let tp = type;

  if (!message && (type === "info" || !type)) {
    // Single argument passed like toast.error("Error occurred")
    t = type === "error" ? "Gagal" : type === "success" ? "Berhasil" : "Info";
    m = titleOrMessage;
  }

  item.className = `toast ${tp}`;
  item.innerHTML = `
    <strong>${esc(t)}</strong>
    ${m ? `<p>${esc(m)}</p>` : ""}
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

toast.success = (message, title = "Berhasil") => toast(title, message, "success");
toast.error = (message, title = "Gagal") => toast(title, message, "error");
toast.info = (message, title = "Informasi") => toast(title, message, "info");
toast.warning = (message, title = "Peringatan") => toast(title, message, "warning");

