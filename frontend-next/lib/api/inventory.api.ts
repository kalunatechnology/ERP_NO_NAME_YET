import api from "./axios";
import { normalizeList } from "./auth.api";

export interface InventoryDocument {
  id: string;
  title: string;
  category: string;
  description: string;
  file_name: string;
  mime_type: string;
  file_size: number | string | bigint;
  checksum: string;
  created_at: string;
}

export interface InventoryProductCategory {
  id: string;
  category_code: string;
  category_name: string;
  serial_controlled: boolean;
  status: string;
}

export async function loadInventoryProductCategories(): Promise<InventoryProductCategory[]> {
  const response = await api.get("/api/v1/master-data/product-categories/?page_size=500");
  return normalizeList<InventoryProductCategory>(response.data).rows;
}

export async function saveInventoryProductCategory(payload: Record<string, unknown>) {
  return (await api.post("/api/v1/master-data/product-categories/", payload)).data as InventoryProductCategory;
}

export async function loadInventoryProducts() {
  const response = await api.get("/api/v1/master-data/products/?page_size=500");
  return normalizeList<any>(response.data).rows;
}

export async function saveInventoryProduct(payload: Record<string, unknown>, id?: string) {
  const response = id
    ? await api.patch(`/api/v1/master-data/products/${id}/`, payload)
    : await api.post("/api/v1/master-data/products/", payload);
  return response.data;
}

export async function loadSerialNumbers() {
  const response = await api.get("/api/v1/inventory/serial-numbers/?page_size=500");
  return normalizeList<any>(response.data).rows;
}

export async function createSerialNumber(payload: Record<string, unknown>) {
  return (await api.post("/api/v1/inventory/serial-numbers/", payload)).data;
}

export async function loadInventoryDocuments(): Promise<InventoryDocument[]> {
  const response = await api.get("/api/v1/inventory/internal-documents");
  return Array.isArray(response.data) ? response.data : [];
}

export async function uploadInventoryDocument(payload: {
  title: string;
  category: string;
  description?: string;
  file_name: string;
  mime_type: string;
  content_base64: string;
}) {
  return (await api.post("/api/v1/inventory/internal-documents", payload)).data as InventoryDocument;
}

export async function downloadInventoryDocument(id: string, fileName: string) {
  const response = await api.get(`/api/v1/inventory/internal-documents/${id}/download`, { responseType: "blob" });
  const url = URL.createObjectURL(response.data);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
