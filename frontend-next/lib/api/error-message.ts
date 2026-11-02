type ApiErrorData = {
  detail?: unknown;
  message?: unknown;
  error?: unknown;
  errors?: unknown;
  request_id?: unknown;
};

type ApiErrorLike = {
  response?: { status?: number; data?: ApiErrorData };
  code?: string;
};

const SOD_ACTIONS: Record<string, string> = {
  approve: "disetujui",
  verify: "diverifikasi",
  reject: "ditolak",
  post: "dibukukan",
  execute: "diproses",
};

function statusMessage(status: number | undefined, fallback: string, requestId?: unknown): string {
  if (status === 401) return "Sesi Anda sudah berakhir. Silakan masuk kembali.";
  if (status === 403) return "Anda belum memiliki izin untuk melakukan tindakan ini. Periksa role aktif atau hubungi admin.";
  if (status === 404) return "Data tidak ditemukan atau sudah berubah. Muat ulang halaman, lalu coba lagi.";
  if (status === 409) return "Tindakan tidak dapat dilanjutkan karena data atau statusnya sudah berubah. Muat ulang dan periksa status terbaru.";
  if (status === 422) return `${fallback} Periksa kembali data yang ditandai.`;
  if (status === 429) return "Terlalu banyak permintaan dalam waktu singkat. Tunggu sebentar, lalu coba lagi.";
  if (status !== undefined && status >= 500) {
    const reference = typeof requestId === "string" && requestId.trim() ? ` (Referensi: ${requestId})` : "";
    return `Layanan sedang mengalami gangguan. Coba lagi beberapa saat${reference}.`;
  }
  return fallback;
}

function normalizeMessage(message: string, fallback: string, status?: number, requestId?: unknown): string {
  const sod = message.match(/(?:\[SoD Violation\].*?)?aksi\s+["“]([^"”]+)["”]/i);
  if (/SoD Violation|maker\s*(?:dan|&|-)\s*checker|pengguna yang membuat dokumen/i.test(message)) {
    const action = sod?.[1]?.toLowerCase();
    const verb = action ? SOD_ACTIONS[action] : undefined;
    return verb
      ? `Dokumen ini tidak dapat ${verb} oleh pembuatnya. Silakan minta pengguna lain yang berwenang untuk melanjutkan.`
      : "Pembuat dokumen tidak dapat melanjutkan tindakan pada dokumen yang sama. Silakan minta pengguna lain yang berwenang.";
  }

  const trimmed = message.trim();
  if (!trimmed || /^[A-Z][A-Z0-9_]{2,}$/.test(trimmed)
    || /^(?:internal server error|unexpected error|something went wrong|request failed(?: with status code\s+\d+)?)\.?$/i.test(trimmed)) {
    return statusMessage(status, fallback, requestId);
  }
  if (/\b(PrismaClient|Prisma\.|SQLSTATE|SELECT\s|INSERT\s|UPDATE\s|stack trace|UnhandledPromiseRejection|ECONNREFUSED)\b/i.test(trimmed)
    || /^(?:request failed with status code\s+\d+|network error)$/i.test(trimmed)) {
    return statusMessage(status, fallback, requestId);
  }

  return trimmed
    .replace(/\[SoD Violation\]\s*/gi, "")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "data terkait")
    .replace(/\s+/g, " ");
}

/** Converts an API failure into a safe, actionable message for a non-technical user. */
export function getUserFacingApiError(error: unknown, fallback = "Permintaan belum berhasil. Periksa data dan coba lagi."): string {
  const apiError = error as ApiErrorLike;
  const data = apiError?.response?.data;
  const status = apiError?.response?.status;

  if (data?.errors && typeof data.errors === "object") {
    const firstFieldError = Object.values(data.errors as Record<string, unknown>)
      .flatMap((value) => Array.isArray(value) ? value : [value])
      .find((value): value is string => typeof value === "string" && Boolean(value.trim()));
    if (firstFieldError) return normalizeMessage(firstFieldError, fallback, status, data.request_id);
  }

  const nestedError = data?.error && typeof data.error === "object" && "message" in data.error
    ? (data.error as { message?: unknown }).message : undefined;
  const raw = [data?.detail, data?.message, nestedError, data?.error]
    .find((value): value is string => typeof value === "string" && Boolean(value.trim()));
  if (raw) return normalizeMessage(raw, fallback, status, data?.request_id);

  if (apiError?.code === "ECONNABORTED" || apiError?.code === "ETIMEDOUT") {
    return "Permintaan berlangsung terlalu lama. Periksa koneksi Anda, lalu coba lagi.";
  }
  if (!apiError?.response && error && typeof error === "object" && "request" in error) {
    return "Tidak dapat terhubung ke server. Periksa koneksi Anda, lalu coba lagi.";
  }
  if (!apiError?.response && error instanceof Error && error.message.trim()) {
    return normalizeMessage(error.message, fallback);
  }
  return statusMessage(status, fallback, data?.request_id);
}

