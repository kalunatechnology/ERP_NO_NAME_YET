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

export function openModal(eyebrowOrOptions, title, bodyHTML, footerHTML = "", onClose = null) {
  if (!modalBackdrop) initModalDOM();
  
  let eyebrow = "Modal";
  let body = "";
  let footer = "";
  let heading = "Detail";
  let closeCb = onClose;

  if (typeof eyebrowOrOptions === "object" && eyebrowOrOptions !== null) {
    heading = eyebrowOrOptions.title || "Detail";
    eyebrow = eyebrowOrOptions.eyebrow || "Action";
    body = eyebrowOrOptions.content || eyebrowOrOptions.body || "";
    footer = eyebrowOrOptions.footer || "";
    closeCb = eyebrowOrOptions.onClose || null;
  } else {
    eyebrow = eyebrowOrOptions || "Modal";
    heading = title || "Detail";
    body = bodyHTML || "";
    footer = footerHTML || "";
  }

  currentOnClose = closeCb;

  if (modalEyebrow) modalEyebrow.textContent = eyebrow;
  if (modalTitle) modalTitle.textContent = heading;

  if (modalBody) {
    if (typeof body === "string") {
      modalBody.innerHTML = body;
    } else if (body instanceof Node) {
      modalBody.innerHTML = "";
      modalBody.appendChild(body);
    }
  }

  if (modalFooter) {
    if (typeof footer === "string") {
      modalFooter.innerHTML = footer;
    } else if (footer instanceof Node) {
      modalFooter.innerHTML = "";
      modalFooter.appendChild(footer);
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

export const modal = Modal;

