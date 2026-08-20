/**
 * DOM and string sanitization utilities
 */

export function esc(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function attr(str) {
  return esc(str);
}

export function truncate(str, max = 100) {
  if (!str) return "";
  const s = String(str);
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

export function humanize(str) {
  if (!str) return "";
  return String(str)
    .replace(/[-_]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

export function mask(token) {
  if (!token) return "-";
  if (token.length <= 16) return token;
  return `${token.slice(0, 8)}...${token.slice(-8)}`;
}

export function replacePath(path, params = {}) {
  let res = path;
  Object.entries(params).forEach(([k, v]) => {
    res = res.replace(new RegExp(`\\{${k}\\}`, "g"), encodeURIComponent(v ?? ""));
  });
  return res;
}

export function parseJSON(raw, fallback = null) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function jsonOrThrow(raw, msg = "Invalid JSON") {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(msg);
  }
}

export function sanitize(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const clone = Array.isArray(obj) ? [...obj] : { ...obj };
  Object.keys(clone).forEach(k => {
    if (/password|secret|token/i.test(k)) clone[k] = "******";
    else if (typeof clone[k] === "object") clone[k] = sanitize(clone[k]);
  });
  return clone;
}

export function copyToClipboard(text) {
  return navigator.clipboard.writeText(text);
}

export function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
