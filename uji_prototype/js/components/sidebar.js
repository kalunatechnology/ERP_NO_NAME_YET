/**
 * Sidebar Navigation Component
 */

import { state } from "../core/state.js";
import { router } from "../core/router.js";
import { esc, attr } from "../utils/dom.js";
import { eventBus } from "../core/event-bus.js";
import { loadOpenAPISchema } from "../services/schema.service.js";
import { toast } from "./toast.js";

let sidebarEl = null;
let moduleListEl = null;
let moduleSearchEl = null;
let moduleCountEl = null;
let connectionDotEl = null;
let connectionTextEl = null;
let connectionDetailEl = null;
let schemaLabelEl = null;

export function initSidebar() {
  sidebarEl = document.getElementById("sidebar");
  moduleListEl = document.getElementById("moduleList");
  moduleSearchEl = document.getElementById("moduleSearch");
  moduleCountEl = document.getElementById("moduleCount");
  connectionDotEl = document.getElementById("connectionDot");
  connectionTextEl = document.getElementById("connectionText");
  connectionDetailEl = document.getElementById("connectionDetail");
  schemaLabelEl = document.getElementById("schemaLabel");

  const openSidebarBtn = document.getElementById("openSidebar");
  const closeSidebarBtn = document.getElementById("closeSidebar");
  const reloadSchemaBtn = document.getElementById("reloadSchemaSidebar");
  const mainNav = document.getElementById("mainNav");

  if (openSidebarBtn) {
    openSidebarBtn.addEventListener("click", () => sidebarEl?.classList.add("open"));
  }
  if (closeSidebarBtn) {
    closeSidebarBtn.addEventListener("click", () => sidebarEl?.classList.remove("open"));
  }

  if (moduleSearchEl) {
    moduleSearchEl.addEventListener("input", renderModulesList);
  }

  if (reloadSchemaBtn) {
    reloadSchemaBtn.addEventListener("click", async () => {
      try {
        setConnectionStatus(false, "Memuat...", "Membaca schema");
        await loadOpenAPISchema(true);
        toast("Schema Diperbarui", "Live schema berhasil dimuat.", "success");
      } catch (err) {
        toast("Gagal Reload Schema", err.message, "error");
      }
    });
  }

  if (mainNav) {
    mainNav.addEventListener("click", event => {
      const button = event.target.closest("[data-view]");
      if (button) {
        const view = button.dataset.view;
        const financeTab = button.dataset.financeTab;
        if (view === "finance-flow" && financeTab) {
          router.navigate(`/finance/${financeTab}`);
        } else if (view === "finance-flow") {
          router.navigate("/finance");
        } else if (view === "crm-flow") {
          router.navigate("/crm");
        } else if (view === "project-flow") {
          router.navigate("/projects");
        } else if (view === "reporting-flow") {
          router.navigate("/reporting");
        } else if (view === "resources") {
          router.navigate("/resources");
        } else if (view === "console") {
          router.navigate("/console");
        } else if (view === "auth") {
          router.navigate("/auth");
        } else if (view === "logs") {
          router.navigate("/logs");
        } else if (view === "settings") {
          router.navigate("/settings");
        } else {
          router.navigate("/dashboard");
        }
        sidebarEl?.classList.remove("open");
      }
    });
  }

  eventBus.on("route:changed", updateActiveNav);
  eventBus.on("schema:loaded", onSchemaLoaded);
}

export function setConnectionStatus(online, title, detail) {
  if (connectionDotEl) {
    connectionDotEl.className = `dot ${online ? "online" : "offline"}`;
  }
  if (connectionTextEl) connectionTextEl.textContent = title || (online ? "API terhubung" : "Schema offline");
  if (connectionDetailEl) connectionDetailEl.textContent = detail || "";
}

function onSchemaLoaded() {
  if (schemaLabelEl && state.schema) {
    schemaLabelEl.textContent = `${state.schema.info?.title || "OpenAPI"} ${state.schema.info?.version || ""}`;
  }
  if (moduleCountEl) {
    moduleCountEl.textContent = state.modules.length;
  }
  setConnectionStatus(state.schemaSource === "live", state.schemaSource === "live" ? "API terhubung" : "Schema offline", state.base);
  renderModulesList();
}

export function updateActiveNav() {
  document.querySelectorAll(".nav-button").forEach(b => {
    b.classList.toggle("active", b.dataset.view === state.view);
  });
}

export function renderModulesList() {
  if (!moduleListEl) return;
  if (!state.modules.length) {
    moduleListEl.innerHTML = "";
    return;
  }

  const q = moduleSearchEl ? moduleSearchEl.value.toLowerCase().trim() : "";
  moduleListEl.innerHTML = state.modules
    .map(m => {
      const resources = m.resources.filter(r => `${m.name} ${r.title} ${r.path}`.toLowerCase().includes(q));
      if (q && !m.name.toLowerCase().includes(q) && !resources.length) return "";
      const open = state.module === m.name || Boolean(q);

      return `
        <div class="module-group">
          <button class="module-toggle ${state.module === m.name ? "active" : ""}" data-module-toggle="${attr(m.name)}">
            <span>${esc(m.name)}</span>
            <small>${m.resources.length}</small>
          </button>
          <div class="resource-links" ${open ? "" : "hidden"}>
            ${resources
              .slice(0, 80)
              .map(
                r => `
              <button class="resource-link ${state.resource?.path === r.path ? "active" : ""}" data-sidebar-resource="${attr(r.path)}">
                ${esc(r.title)}
              </button>
            `
              )
              .join("")}
          </div>
        </div>
      `;
    })
    .join("");

  moduleListEl.querySelectorAll("[data-module-toggle]").forEach(b => {
    b.addEventListener("click", () => {
      const links = b.closest(".module-group").querySelector(".resource-links");
      if (links) links.hidden = !links.hidden;
      state.module = b.dataset.moduleToggle;
      if (state.view !== "resources") {
        state.resource = null;
        router.navigate("/resources");
      }
    });
  });

  moduleListEl.querySelectorAll("[data-sidebar-resource]").forEach(b => {
    b.addEventListener("click", () => {
      state.resource = state.resources.find(r => r.path === b.dataset.sidebarResource);
      if (state.resource) {
        state.module = state.resource.module;
        router.navigate(`/resources/${encodeURIComponent(state.module)}/${encodeURIComponent(state.resource.slug || "item")}`);
      }
      sidebarEl?.classList.remove("open");
    });
  });
}
