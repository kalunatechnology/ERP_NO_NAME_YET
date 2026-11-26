import api from "./axios";

export async function uploadHrEvidence(file: File): Promise<string> {
  const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
  if (!allowed.has(file.type)) throw new Error("Pilih gambar JPG, PNG, atau WebP.");
  if (file.size > 4 * 1024 * 1024) throw new Error("Ukuran gambar maksimal 4 MB.");
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Gambar gagal dibaca."));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });
  const contentBase64 = dataUrl.split(",", 2)[1] ?? "";
  const response = await api.post("/api/v1/hr/attachments", {
    file_name: file.name,
    mime_type: file.type,
    content_base64: contentBase64,
  });
  return String(response.data?.data?.attachment_url ?? "");
}

export async function loadHrEvidence(attachmentUrl: string, forHr = false): Promise<string> {
  const id = attachmentUrl.replace(/^hr-attachment:/, "");
  const path = forHr ? `/api/v1/hr/attachments/${id}` : `/api/v1/hr/attachments/my/${id}`;
  const response = await api.get(path, { responseType: "blob" });
  return URL.createObjectURL(response.data);
}
