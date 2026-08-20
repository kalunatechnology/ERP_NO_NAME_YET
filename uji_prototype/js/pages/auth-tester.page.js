/**
 * Auth Tester Page Controller
 */

import { state } from "../core/state.js";
import { setPageHeader } from "../components/topbar.js";
import { esc, mask, copyToClipboard } from "../utils/dom.js";
import { displayName } from "../utils/formatters.js";
import { refreshAccessToken } from "../core/http.js";
import { verifyCurrentToken, loadUserProfile, changeUserPassword, logoutUser } from "../services/auth.service.js";
import { toast } from "../components/toast.js";

export function renderAuthTesterPage() {
  setPageHeader("JWT Lifecycle", "Auth Tester");
  const workspace = document.getElementById("workspace");
  if (!workspace) return;

  const u = state.user?.user || state.user || {};
  const roles = state.user?.roles || u.roles || [];

  workspace.innerHTML = `
    <section class="two-grid">
      <article class="card">
        <h3>Access Token</h3>
        <p>Dipakai pada header Authorization: Bearer.</p>
        <div class="token">${esc(mask(state.access))}</div>
        <div class="toolbar" style="margin-top:12px;display:flex;gap:8px;">
          <button id="btnVerifyToken" class="button primary" ${state.access ? "" : "disabled"}>Verify</button>
          <button id="btnCopyAccess" class="button secondary" ${state.access ? "" : "disabled"}>Copy</button>
        </div>
      </article>

      <article class="card">
        <h3>Refresh Token</h3>
        <p>Digunakan untuk meminta access token baru secara berkala.</p>
        <div class="token">${esc(mask(state.refresh))}</div>
        <div class="toolbar" style="margin-top:12px;display:flex;gap:8px;">
          <button id="btnRefreshToken" class="button primary" ${state.refresh ? "" : "disabled"}>Refresh Token</button>
          <button id="btnCopyRefresh" class="button secondary" ${state.refresh ? "" : "disabled"}>Copy</button>
        </div>
      </article>

      <article class="card">
        <h3>Current User Profile</h3>
        <div class="profile" style="display:grid;gap:6px;margin:12px 0;">
          <div style="display:flex;justify-content:space-between;"><span>Nama:</span><strong>${esc(displayName(u))}</strong></div>
          <div style="display:flex;justify-content:space-between;"><span>Email:</span><strong>${esc(u.email || "-")}</strong></div>
          <div style="display:flex;justify-content:space-between;"><span>Tenant:</span><strong>${esc(u.tenant || u.tenant_id || "-")}</strong></div>
          <div style="display:flex;justify-content:space-between;"><span>Role:</span><strong>${esc(roles.map(r => r.role_name || r.role_code || r).join(", ") || "-")}</strong></div>
        </div>
        <button id="btnReloadMe" class="button secondary" ${state.access ? "" : "disabled"}>Reload Profile</button>
      </article>

      <article class="card">
        <h3>Change Password</h3>
        <form id="formChangePassword" class="stack" style="display:grid;gap:10px;margin-top:10px;">
          <label class="field"><span>Current Password</span><input name="current_password" type="password" required></label>
          <label class="field"><span>New Password</span><input name="new_password" type="password" minlength="8" required></label>
          <button class="button primary" ${state.access ? "" : "disabled"}>Ganti Password</button>
        </form>
      </article>
    </section>

    <section class="panel" style="margin-top:16px;">
      <header class="panel-head" style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <h2>Session Termination</h2>
          <p>Logout akan menghapus token dan menguji blacklist refresh token pada backend.</p>
        </div>
        <button id="btnAuthLogout" class="button danger" ${state.access ? "" : "disabled"}>Logout Sesi</button>
      </header>
    </section>
  `;

  document.getElementById("btnVerifyToken")?.addEventListener("click", async () => {
    try {
      await verifyCurrentToken();
      toast("Token Valid", "JWT Access Token terverifikasi sukses oleh backend.", "success");
    } catch (error) {
      toast("Token Tidak Valid", error.message, "error");
    }
  });

  document.getElementById("btnRefreshToken")?.addEventListener("click", async () => {
    try {
      await refreshAccessToken();
      toast("Token Diperbarui", "Access token baru berhasil disimpan.", "success");
      renderAuthTesterPage();
    } catch (error) {
      toast("Refresh Gagal", error.message, "error");
    }
  });

  document.getElementById("btnCopyAccess")?.addEventListener("click", async () => {
    await copyToClipboard(state.access);
    toast("Access Token Disalin", "Token disalin ke clipboard.", "success");
  });

  document.getElementById("btnCopyRefresh")?.addEventListener("click", async () => {
    await copyToClipboard(state.refresh);
    toast("Refresh Token Disalin", "Token disalin ke clipboard.", "success");
  });

  document.getElementById("btnReloadMe")?.addEventListener("click", async () => {
    await loadUserProfile();
    renderAuthTesterPage();
    toast("Profil Disinkronkan", displayName(state.user), "success");
  });

  document.getElementById("btnAuthLogout")?.addEventListener("click", async () => {
    await logoutUser();
    window.location.reload();
  });

  document.getElementById("formChangePassword")?.addEventListener("submit", async e => {
    e.preventDefault();
    const form = e.target;
    const btn = form.querySelector("button");
    try {
      btn.disabled = true;
      await changeUserPassword(form.elements.current_password.value, form.elements.new_password.value);
      form.reset();
      toast("Password Berhasil Diubah", "Gunakan password baru pada login berikutnya.", "success");
    } catch (err) {
      toast("Gagal Mengubah Password", err.message, "error");
    } finally {
      btn.disabled = false;
    }
  });
}
