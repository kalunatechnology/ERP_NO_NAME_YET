/**
 * Vanilla JS Hash Router with Dynamic Parameter Matching and Browser History Support
 */

import { eventBus } from "./event-bus.js";
import { state } from "./state.js";

class Router {
  constructor() {
    this.routes = [];
    this.currentRoute = null;
    this.notFoundHandler = null;
    this._onHashChange = this._handleHashChange.bind(this);
  }

  add(pattern, handler) {
    const keys = [];
    const regexPattern = pattern
      .replace(/:([a-zA-Z0-9_]+)/g, (_, key) => {
        keys.push(key);
        return "([^/]+)";
      })
      .replace(/\//g, "\\/");

    const regex = new RegExp(`^${regexPattern}$`);
    this.routes.push({ pattern, regex, keys, handler });
    return this;
  }

  notFound(handler) {
    this.notFoundHandler = handler;
    return this;
  }

  start() {
    window.addEventListener("hashchange", this._onHashChange);
    this._handleHashChange();
  }

  stop() {
    window.removeEventListener("hashchange", this._onHashChange);
  }

  navigate(path) {
    const cleanPath = path.startsWith("#") ? path.slice(1) : path;
    const targetHash = cleanPath.startsWith("/") ? `#${cleanPath}` : `#/${cleanPath}`;
    if (window.location.hash === targetHash) {
      this._handleHashChange();
    } else {
      window.location.hash = targetHash;
    }
  }

  _handleHashChange() {
    const fullHash = window.location.hash.slice(1) || "/dashboard";
    const [pathPart, queryPart] = fullHash.split("?");
    const path = pathPart.startsWith("/") ? pathPart : `/${pathPart}`;

    const query = {};
    if (queryPart) {
      new URLSearchParams(queryPart).forEach((v, k) => {
        query[k] = v;
      });
    }

    let matched = false;
    for (const route of this.routes) {
      const match = path.match(route.regex);
      if (match) {
        matched = true;
        const params = {};
        route.keys.forEach((key, index) => {
          params[key] = decodeURIComponent(match[index + 1]);
        });

        this.currentRoute = {
          pattern: route.pattern,
          path,
          params,
          query,
        };

        state.routeParams = params;
        state.view = this._deriveViewName(route.pattern, params);

        eventBus.emit("route:changed", this.currentRoute);
        try {
          route.handler({ path, params, query });
        } catch (err) {
          console.error(`[Router] Error executing route handler for ${path}:`, err);
        }
        break;
      }
    }

    if (!matched) {
      if (this.notFoundHandler) {
        this.notFoundHandler({ path, query });
      } else {
        console.warn(`[Router] No route matched for ${path}`);
      }
    }
  }

  _deriveViewName(pattern, params) {
    if (pattern.startsWith("/finance")) return "finance-flow";
    if (pattern.startsWith("/crm")) return "crm-flow";
    if (pattern.startsWith("/projects")) return "project-flow";
    if (pattern.startsWith("/reporting")) return "reporting-flow";
    if (pattern.startsWith("/resources")) return "resources";
    if (pattern.startsWith("/console")) return "console";
    if (pattern.startsWith("/auth")) return "auth";
    if (pattern.startsWith("/logs")) return "logs";
    if (pattern.startsWith("/settings")) return "settings";
    return "dashboard";
  }
}

export const router = new Router();
