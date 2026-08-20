/**
 * Authentication Service (JWT Lifecycle, Switch Account, Profile)
 */

import { AUTH_ENDPOINTS } from "../config/constants.js";
import { state, setTokens, setCompany } from "../core/state.js";
import { requestJSON } from "../core/http.js";
import { normalizeBase, normalizeList } from "../utils/formatters.js";
import { eventBus } from "../core/event-bus.js";

export async function loginUser(email, password, apiBase) {
  if (apiBase) {
    state.base = normalizeBase(apiBase);
  }
  const payload = await requestJSON(AUTH_ENDPOINTS.token, {
    method: "POST",
    body: { email: email.trim(), username: email.trim(), password },
    auth: false,
    retry: false,
  });

  if (!payload?.access) {
    throw new Error("Response login tidak memiliki access token.");
  }

  setTokens(payload.access, payload.refresh || "");
  state.user = payload.user || null;
  state.offline = false;

  try {
    await loadUserProfile(true);
  } catch (pe) {
    console.warn("Could not load user profile:", pe);
  }

  eventBus.emit("auth:loggedIn", state.user);
  return state.user;
}

export async function loadUserProfile(silent = false) {
  if (!state.access) return null;
  try {
    const userProfile = await requestJSON(AUTH_ENDPOINTS.me, { method: "GET" });
    state.user = userProfile;

    const roleCompany = state.user?.roles?.find(x => x.company_id)?.company_id;
    if (roleCompany) {
      setCompany(roleCompany);
    }

    try {
      const compsRes = await requestJSON("/api/v1/core/companies/", { method: "GET" });
      const comps = normalizeList(compsRes).rows;
      if (comps && comps.length > 0) {
        state.companies = comps;
        if (!state.company || !comps.some(c => String(c.id) === String(state.company))) {
          setCompany(comps[0].id);
        }
      }
    } catch (ce) {
      console.warn("Could not fetch companies", ce);
    }

    eventBus.emit("auth:profileLoaded", state.user);
    return state.user;
  } catch (error) {
    if (!silent) throw error;
    return null;
  }
}

export async function logoutUser() {
  try {
    if (state.refresh && state.access) {
      await requestJSON(AUTH_ENDPOINTS.logout, {
        method: "POST",
        body: { refresh: state.refresh },
        retry: false,
      });
    }
  } catch (err) {
    console.warn("Logout request failed:", err);
  }
  setTokens("", "");
  state.user = null;
  state.offline = false;
  state.pm.loaded = false;
  state.pm.fundingLoaded = false;
  state.pm.accountingLoaded = false;
  state.pm.projects = [];
  state.pm.fundings = [];
  state.pm.costEntries = [];
  state.pm.billingProposals = [];
  state.pm.selectedId = "";
  eventBus.emit("auth:loggedOut");
}

export async function verifyCurrentToken() {
  return requestJSON(AUTH_ENDPOINTS.verify, {
    method: "POST",
    body: { token: state.access },
    auth: false,
    retry: false,
  });
}

export async function changeUserPassword(currentPassword, newPassword) {
  return requestJSON(AUTH_ENDPOINTS.change, {
    method: "POST",
    body: { current_password: currentPassword, new_password: newPassword },
  });
}
