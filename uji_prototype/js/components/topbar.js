/**
 * Topbar Header & User Switcher Component
 */

import { state, setCompany } from "../core/state.js";
import { router } from "../core/router.js";
import { displayName } from "../utils/formatters.js";
import { esc } from "../utils/dom.js";
import { eventBus } from "../core/event-bus.js";
import { loginUser, logoutUser, loadUserProfile } from "../services/auth.service.js";
import { DEMO_USERS } from "../config/demo-users.js";
import { toast } from "./toast.js";

let pageEyebrowEl = null;
let pageTitleEl = null;
let companyInputEl = null;
let userButtonEl = null;
let userNameEl = null;
let userRoleEl = null;
let avatarEl = null;
let userMenuEl = null;

export function initTopbar() {
  pageEyebrowEl = document.getElementById("pageEyebrow");
  pageTitleEl = document.getElementById("pageTitle");
  companyInputEl = document.getElementById("companyInput");
  userButtonEl = document.getElementById("userButton");
  userNameEl = document.getElementById("userName");
  userRoleEl = document.getElementById("userRole");
  avatarEl = document.getElementById("avatar");
  userMenuEl = document.getElementById("userMenu");

  if (companyInputEl) {
    companyInputEl.value = state.company;
    companyInputEl.addEventListener("change", () => {
      setCompany(companyInputEl.value.trim());
      toast("Company Scope Disimpan", state.company || "X-Company-ID dikosongkan.", "success");
    });
    companyInputEl.addEventListener("input", () => {
      setCompany(companyInputEl.value.trim());
    });
  }

  if (userMenuEl) {
    userMenuEl.innerHTML = `
      <div style="padding: 6px 8px 4px; font-size: 10px; font-weight: 800; color: var(--muted); border-bottom: 1px solid var(--line); margin-bottom: 4px;">GANTI AKUN CEPAT (${DEMO_USERS.length} USER)</div>
      ${DEMO_USERS.map(u => `
        <button data-switch-user="${esc(u.email)}" type="button" style="text-align:left;display:flex;align-items:center;gap:6px;width:100%;">
          <span>${u.icon || "👤"}</span>
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(u.name)} <small style="opacity:0.75;">(${esc(u.email)})</small></span>
        </button>
      `).join("")}
      <div style="border-top: 1px solid var(--line); margin: 6px 0;"></div>
      <button data-user-action="me" type="button">Refresh profile</button>
      <button data-user-action="auth" type="button">Auth tester</button>
      <button data-user-action="logout" class="danger" type="button">Logout</button>
    `;
  }

  if (userButtonEl && userMenuEl) {
    userButtonEl.addEventListener("click", () => {
      userMenuEl.hidden = !userMenuEl.hidden;
    });
  }

  if (userMenuEl) {
    userMenuEl.addEventListener("click", async event => {
      const switchBtn = event.target.closest("[data-switch-user]");
      if (switchBtn) {
        const email = switchBtn.dataset.switchUser;
        userMenuEl.hidden = true;
        toast("Mengganti akun...", `Beralih ke ${email}`, "info");
        try {
          await loginUser(email, "DummyPass123!");
          toast("Login Berhasil", `Sekarang masuk sebagai ${email}`, "success");
          router.navigate("/dashboard");
        } catch (err) {
          toast("Gagal Mengganti Akun", err.message, "error");
        }
        return;
      }

      const button = event.target.closest("[data-user-action]");
      if (!button) return;
      userMenuEl.hidden = true;

      if (button.dataset.userAction === "logout") {
        await logoutUser();
        window.location.reload();
      }
      if (button.dataset.userAction === "me") {
        await loadUserProfile(false);
        toast("Profil Diperbarui", displayName(state.user), "success");
      }
      if (button.dataset.userAction === "auth") {
        router.navigate("/auth");
      }
    });
  }

  document.addEventListener("click", event => {
    if (!event.target.closest(".topbar-right") && userMenuEl) {
      userMenuEl.hidden = true;
    }
  });

  eventBus.on("auth:profileLoaded", updateTopbarUser);
  eventBus.on("auth:tokenChanged", updateTopbarUser);
  eventBus.on("company:changed", comp => {
    if (companyInputEl && companyInputEl.value !== comp) companyInputEl.value = comp;
  });

  updateTopbarUser();
}

export function setPageHeader(eyebrow, title) {
  if (pageEyebrowEl) pageEyebrowEl.textContent = eyebrow || "Overview";
  if (pageTitleEl) pageTitleEl.textContent = title || "Dashboard";
}

export function updateTopbarUser() {
  const u = state.user?.user || state.user || null;
  const roles = state.user?.roles || u?.roles || [];
  const name = displayName(u, state.offline);

  if (userNameEl) userNameEl.textContent = name;
  if (userRoleEl) {
    userRoleEl.textContent =
      roles?.[0]?.role_name || roles?.[0]?.role_code || (state.access ? "Authenticated" : "Schema mode");
  }
  if (avatarEl) avatarEl.textContent = (name || "U").charAt(0).toUpperCase();
  if (companyInputEl && state.company) companyInputEl.value = state.company;
}
