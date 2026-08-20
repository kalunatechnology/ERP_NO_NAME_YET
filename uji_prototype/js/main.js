/**
 * Antigravity ERP Frontend Architecture Entry Point
 * Pure Vanilla JavaScript ES Modules (No Frameworks)
 */

import { state } from "./core/state.js";
import { router } from "./core/router.js";
import { initSidebar } from "./components/sidebar.js";
import { initTopbar } from "./components/topbar.js";
import { loadOpenAPISchema } from "./services/schema.service.js";
import { loadUserProfile } from "./services/auth.service.js";

// Pages
import { renderLoginPage } from "./pages/login.page.js";
import { renderDashboardPage } from "./pages/dashboard.page.js";
import { renderFinancePage } from "./pages/finance.page.js";
import { renderCRMPage } from "./pages/crm.page.js";
import { renderProjectPage } from "./pages/project.page.js";
import { renderReportingPage } from "./pages/reporting.page.js";
import { renderResourcesPage } from "./pages/resources.page.js";
import { renderConsolePage } from "./pages/console.page.js";
import { renderAuthTesterPage } from "./pages/auth-tester.page.js";
import { renderLogsPage } from "./pages/logs.page.js";
import { renderSettingsPage } from "./pages/settings.page.js";

document.addEventListener("DOMContentLoaded", bootstrap);

async function bootstrap() {
  initSidebar();
  initTopbar();

  // Register Application Routes
  router
    .add("/dashboard", () => renderDashboardPage())
    .add("/finance", req => renderFinancePage(req))
    .add("/finance/:tab", req => renderFinancePage(req))
    .add("/crm", req => renderCRMPage(req))
    .add("/crm/:tab", req => renderCRMPage(req))
    .add("/projects", req => renderProjectPage(req))
    .add("/projects/:id", req => renderProjectPage(req))
    .add("/reporting", req => renderReportingPage(req))
    .add("/reporting/:tab", req => renderReportingPage(req))
    .add("/resources", req => renderResourcesPage(req))
    .add("/resources/:module/:resource", req => renderResourcesPage(req))
    .add("/console", () => renderConsolePage())
    .add("/auth", () => renderAuthTesterPage())
    .add("/logs", () => renderLogsPage())
    .add("/settings", () => renderSettingsPage())
    .notFound(() => router.navigate("/dashboard"));

  const loginView = document.getElementById("loginView");
  const appView = document.getElementById("appView");

  // Initialize Login Page Handlers Always
  renderLoginPage();

  // Check Authentication Session
  if (state.access) {
    if (loginView) loginView.hidden = true;
    if (appView) appView.hidden = false;

    // Start Router immediately
    router.start();

    // Load profile & schema in background asynchronously
    loadUserProfile(true).catch(e => {
      console.warn("Background profile load error:", e);
      // If token expired/invalid, return to login page cleanly
      if (loginView) loginView.hidden = false;
      if (appView) appView.hidden = true;
      renderLoginPage();
    });
    loadOpenAPISchema(false).catch(e => console.warn("Background schema load error:", e));
  } else {
    if (loginView) loginView.hidden = false;
    if (appView) appView.hidden = true;

    // Start router so hash navigation works
    router.start();

    // Load schema in background
    loadOpenAPISchema(false).catch(e => console.warn("Background schema load error:", e));
  }
}
