/**
 * Master Data Service
 */

import { requestJSON } from "../core/http.js";
import { normalizeList } from "../utils/formatters.js";

export async function fetchParties() {
  const res = await requestJSON("/api/v1/master-data/parties/?page_size=300", { method: "GET" }).catch(() => []);
  return normalizeList(res).rows;
}

export async function fetchProducts() {
  const res = await requestJSON("/api/v1/master-data/products/?page_size=300", { method: "GET" }).catch(() => []);
  return normalizeList(res).rows;
}

export async function fetchWarehouses() {
  const res = await requestJSON("/api/v1/master-data/warehouses/?page_size=100", { method: "GET" }).catch(() => []);
  return normalizeList(res).rows;
}

export async function fetchMachines() {
  const res = await requestJSON("/api/v1/master-data/machines/?page_size=200", { method: "GET" }).catch(() => []);
  return normalizeList(res).rows;
}

export async function fetchUsers() {
  const res = await requestJSON("/api/v1/accounts/users/?page_size=200", { method: "GET" }).catch(() => []);
  return normalizeList(res).rows;
}

export async function fetchCompanies() {
  const res = await requestJSON("/api/v1/core/companies/?page_size=100", { method: "GET" }).catch(() => []);
  return normalizeList(res).rows;
}
