/**
 * Login Page Controller
 */

import { DEMO_USERS } from "../config/demo-users.js";
import { loginUser } from "../services/auth.service.js";
import { state } from "../core/state.js";
import { esc } from "../utils/dom.js";
import { toast } from "../components/toast.js";
import { eventBus } from "../core/event-bus.js";
import { router } from "../core/router.js";
import { updateTopbarUser } from "../components/topbar.js";

export function renderLoginPage() {
  const loginView = document.getElementById("loginView");
  const appView = document.getElementById("appView");

  if (loginView) loginView.hidden = false;
  if (appView) appView.hidden = true;

  const cardList = document.getElementById("userCardList");
  if (cardList) {
    cardList.innerHTML = DEMO_USERS.map(user => `
      <div class="role-select-card" data-cat="${esc(user.category)}" style="display: flex; align-items: center; justify-content: space-between; padding: 9px 12px; border: 1px solid #cbd7f5; border-radius: 10px; background: #f8faff; cursor: pointer; transition: all 0.15s ease;" data-user-email="${esc(user.email)}" data-user-password="${esc(user.password)}">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 18px;">${user.icon}</span>
          <div style="display: grid; text-align: left;">
            <strong style="font-size: 12px; color: #202b4c;">${esc(user.name)}</strong>
            <small style="color: #6d7485; font-size: 10px;">${esc(user.roleLabel)}</small>
          </div>
        </div>
        <button type="button" class="button primary small" style="padding: 4px 10px; font-size: 11px; pointer-events: none;">⚡ Masuk</button>
      </div>
    `).join("");

    cardList.querySelectorAll(".role-select-card").forEach(card => {
      card.addEventListener("click", async () => {
        const email = card.dataset.userEmail;
        const pass = card.dataset.userPassword;
        const emailInput = document.getElementById("emailLogin");
        const passInput = document.getElementById("passwordLogin");
        if (emailInput) emailInput.value = email;
        if (passInput) passInput.value = pass;
        
        card.style.opacity = "0.6";
        await handleLoginSubmit();
        card.style.opacity = "1";
      });
    });
  }

  // Filter category buttons
  const filterBtns = loginView?.querySelectorAll("[data-filter-cat]");
  filterBtns?.forEach(btn => {
    btn.addEventListener("click", () => {
      const cat = btn.dataset.filterCat;
      filterBtns.forEach(b => (b.className = "button small ghost"));
      btn.className = "button small primary";

      const cards = cardList?.querySelectorAll(".role-select-card");
      cards?.forEach(card => {
        if (cat === "all" || card.dataset.cat === cat) {
          card.style.display = "flex";
        } else {
          card.style.display = "none";
        }
      });
    });
  });

  const form = document.getElementById("loginForm");
  const offlineBtn = document.getElementById("offlineButton");

  if (form) {
    form.onsubmit = async e => {
      e.preventDefault();
      await handleLoginSubmit();
    };
  }

  if (offlineBtn) {
    offlineBtn.onclick = () => {
      state.offline = true;
      if (loginView) loginView.hidden = true;
      if (appView) appView.hidden = false;
      eventBus.emit("auth:offlineMode");
      toast("Schema Mode Aktif", "API belum dipanggil sampai endpoint dijalankan.", "warning");
      router.navigate("/dashboard");
    };
  }
}

export async function handleLoginSubmit() {
  const loginError = document.getElementById("loginError");
  const loginBtn = document.getElementById("loginButton");
  const apiBaseInput = document.getElementById("apiBaseLogin");
  const emailInput = document.getElementById("emailLogin");
  const passInput = document.getElementById("passwordLogin");
  const loginView = document.getElementById("loginView");
  const appView = document.getElementById("appView");

  if (loginError) loginError.hidden = true;
  if (loginBtn) {
    loginBtn.disabled = true;
    loginBtn.textContent = "Menghubungkan...";
  }

  try {
    const email = emailInput?.value.trim() || "";
    const pass = passInput?.value || "";
    const base = apiBaseInput?.value.trim() || state.base;

    if (!email || !pass) {
      throw new Error("Email dan Password tidak boleh kosong.");
    }

    await loginUser(email, pass, base);

    if (loginView) loginView.hidden = true;
    if (appView) appView.hidden = false;

    updateTopbarUser();
    toast("Login Berhasil", `Selamat datang, ${email}`, "success");
    
    const currentHash = window.location.hash.slice(1) || "/dashboard";
    if (currentHash === "" || currentHash === "/" || currentHash === "/login") {
      router.navigate("/dashboard");
    } else {
      router.navigate(currentHash);
    }
  } catch (err) {
    if (loginError) {
      loginError.textContent = err.message || "Gagal masuk ke sistem.";
      loginError.hidden = false;
    }
    toast("Login Gagal", err.message, "error");
  } finally {
    if (loginBtn) {
      loginBtn.disabled = false;
      loginBtn.textContent = "Masuk Manual";
    }
  }
}

// Expose global compatibility functions on window
if (typeof window !== "undefined") {
  window.selectUser = function(email, password = "DummyPass123!") {
    const emailInput = document.getElementById("emailLogin");
    const passInput = document.getElementById("passwordLogin");
    if (emailInput) emailInput.value = email;
    if (passInput) passInput.value = password;
  };

  window.quickLogin = async function(email, password = "DummyPass123!") {
    window.selectUser(email, password);
    await handleLoginSubmit();
  };
}
