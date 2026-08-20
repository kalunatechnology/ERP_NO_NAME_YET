/**
 * Formatters and data normalizers
 */

export function formatMoney(amount, currency = "IDR") {
  if (amount === null || amount === undefined || isNaN(Number(amount))) return "Rp 0";
  const num = Number(amount);
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: currency,
    maximumFractionDigits: 0,
  }).format(num);
}

export function number(val) {
  if (val === null || val === undefined || isNaN(Number(val))) return "0";
  return new Intl.NumberFormat("id-ID").format(Number(val));
}

export function formatDate(val) {
  if (!val) return "-";
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    return d.toLocaleDateString("id-ID", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return String(val);
  }
}

export function formatDateTime(val) {
  if (!val) return "-";
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    return d.toLocaleString("id-ID", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(val);
  }
}

export function formatData(data) {
  if (data === null || data === undefined) return "No content";
  if (typeof data === "string") return data;
  return JSON.stringify(data, null, 2);
}

export function normalizeList(res) {
  if (!res) return { rows: [], count: 0, next: null, previous: null };
  if (Array.isArray(res)) return { rows: res, count: res.length, next: null, previous: null };
  if (Array.isArray(res.results)) return { rows: res.results, count: res.count ?? res.results.length, next: res.next, previous: res.previous };
  if (Array.isArray(res.data)) return { rows: res.data, count: res.count ?? res.data.length, next: res.next, previous: res.previous };
  return { rows: [res], count: 1, next: null, previous: null };
}

export function normalizeBase(url) {
  if (!url) return "http://127.0.0.1:8000";
  return url.replace(/\/+$/, "");
}

export function displayName(u, offline = false) {
  if (!u) return offline ? "Offline User" : "ERP User";
  const user = u.user || u;
  return user.full_name || [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email || user.username || "ERP User";
}
