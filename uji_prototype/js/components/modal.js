/**
 * Reusable Modal Controller Component
 */

import { esc } from "../utils/dom.js";

let modalBackdrop = null;
let modalEyebrow = null;
let modalTitle = null;
let modalBody = null;
let modalFooter = null;
let modalCloseBtn = null;
let currentOnClose = null;

function initModalDOM() {
  modalBackdrop = document.getElementById("modalBackdrop");
  modalEyebrow = document.getElementById("modalEyebrow");
  modalTitle = document.getElementById("modalTitle");
  modalBody = document.getElementById("modalBody");
  modalFooter = document.getElementById("modalFooter");
  modalCloseBtn = document.getElementById("modalClose");

  if (modalCloseBtn) {
    modalCloseBtn.addEventListener("click", closeModal);
  }
  if (modalBackdrop) {
    modalBackdrop.addEventListener("click", event => {
      if (event.target === modalBackdrop) closeModal();
    });
  }
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && modalBackdrop && !modalBackdrop.hidden) {
      closeModal();
    }
  });
}

export function openModal(eyebrow, title, bodyHTML, footerHTML = "", onClose = null) {
  if (!modalBackdrop) initModalDOM();
  currentOnClose = onClose;

  if (modalEyebrow) modalEyebrow.textContent = eyebrow || "Modal";
  if (modalTitle) modalTitle.textContent = title || "Detail";

  if (modalBody) {
    if (typeof bodyHTML === "string") {
      modalBody.innerHTML = bodyHTML;
    } else if (bodyHTML instanceof Node) {
      modalBody.innerHTML = "";
      modalBody.appendChild(bodyHTML);
    }
  }

  if (modalFooter) {
    if (typeof footerHTML === "string") {
      modalFooter.innerHTML = footerHTML;
    } else if (footerHTML instanceof Node) {
      modalFooter.innerHTML = "";
      modalFooter.appendChild(footerHTML);
    }
  }

  if (modalBackdrop) {
    modalBackdrop.hidden = false;
  }
}

export function closeModal() {
  if (!modalBackdrop) initModalDOM();
  if (modalBackdrop) modalBackdrop.hidden = true;
  if (modalBody) modalBody.innerHTML = "";
  if (modalFooter) modalFooter.innerHTML = "";
  if (typeof currentOnClose === "function") {
    currentOnClose();
    currentOnClose = null;
  }
}

export const Modal = {
  open: openModal,
  close: closeModal,
};
