import api from "./axios";
import type { UserProfile } from "./auth.api";

function base64UrlToBuffer(b64url: string): ArrayBuffer {
  const normalized = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  const binary = atob(normalized + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function bufferToBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export interface PasskeyItem {
  id: string;
  credential_id: string;
  alg: number;
  device_label: string;
  created_at: string;
  last_used_at?: string | null;
}

export interface SsoDiscoveryResult {
  sso_available: boolean;
  company_id?: string;
  company_name?: string;
  company_code?: string;
  provider_type?: "OIDC" | "SAML2";
  display_name?: string;
  enforce_sso?: boolean;
  oidc_start_path?: string | null;
  saml_sso_url?: string | null;
}

export async function listPasskeys(): Promise<PasskeyItem[]> {
  const { data } = await api.get("/api/v1/auth/passkey/list", { headers: { "X-Company-ID": "" } });
  return Array.isArray(data?.results) ? data.results : [];
}

export async function deletePasskey(credentialId: string): Promise<void> {
  await api.delete(`/api/v1/auth/passkey/${encodeURIComponent(credentialId)}`, {
    headers: { "X-Company-ID": "" },
  });
}

export async function registerSuperAdminPasskey(deviceLabel = "Super Admin Passkey") {
  if (typeof window === "undefined" || !window.PublicKeyCredential || !navigator.credentials) {
    throw new Error("Browser Anda tidak mendukung WebAuthn / FIDO2 Passkey.");
  }

  const { data: optRes } = await api.post(
    "/api/v1/auth/passkey/register-options",
    {},
    { headers: { "X-Company-ID": "" } },
  );
  const opts = optRes.options;
  const creationOptions: PublicKeyCredentialCreationOptions = {
    rp: opts.rp,
    user: {
      id: base64UrlToBuffer(opts.user.id),
      name: opts.user.name,
      displayName: opts.user.displayName,
    },
    challenge: base64UrlToBuffer(opts.challenge),
    pubKeyCredParams: opts.pubKeyCredParams,
    timeout: opts.timeout || 60000,
    attestation: "none",
    authenticatorSelection: opts.authenticatorSelection,
    excludeCredentials: (opts.excludeCredentials || []).map((c: any) => ({
      id: base64UrlToBuffer(c.id),
      type: "public-key",
    })),
  };

  const credential = (await navigator.credentials.create({
    publicKey: creationOptions,
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error("Pembuatan passkey dibatalkan.");

  const response = credential.response as AuthenticatorAttestationResponse;
  const spkiBuffer = typeof response.getPublicKey === "function" ? response.getPublicKey() : null;
  const alg = typeof response.getPublicKeyAlgorithm === "function" ? response.getPublicKeyAlgorithm() : -7;
  if (!spkiBuffer) {
    throw new Error("Browser tidak menyediakan public key SPKI untuk registrasi passkey.");
  }

  const { data: verified } = await api.post(
    "/api/v1/auth/passkey/register-verify",
    {
      challenge_token: optRes.challenge_token,
      credential_id: bufferToBase64Url(credential.rawId),
      public_key_spki: bufferToBase64Url(spkiBuffer),
      alg,
      device_label: deviceLabel,
      clientDataJSON: bufferToBase64Url(response.clientDataJSON),
      transports: typeof response.getTransports === "function" ? response.getTransports() : [],
    },
    { headers: { "X-Company-ID": "" } },
  );
  return verified;
}

export async function loginWithSuperAdminPasskey(email: string): Promise<{ user?: UserProfile }> {
  if (typeof window === "undefined" || !window.PublicKeyCredential || !navigator.credentials) {
    throw new Error("Browser Anda tidak mendukung WebAuthn / FIDO2 Passkey.");
  }

  const cleanEmail = email.trim().toLowerCase();
  const { data: optRes } = await api.post(
    "/api/v1/auth/passkey/login-options",
    { email: cleanEmail },
    { headers: { "X-Company-ID": "" } },
  );
  const opts = optRes.options;

  const requestOptions: PublicKeyCredentialRequestOptions = {
    challenge: base64UrlToBuffer(opts.challenge),
    rpId: opts.rpId,
    timeout: opts.timeout || 60000,
    userVerification: "required",
    allowCredentials: (opts.allowCredentials || []).map((c: any) => ({
      id: base64UrlToBuffer(c.id),
      type: "public-key",
      transports: c.transports,
    })),
  };

  const assertion = (await navigator.credentials.get({
    publicKey: requestOptions,
  })) as PublicKeyCredential | null;
  if (!assertion) throw new Error("Autentikasi passkey dibatalkan.");

  const response = assertion.response as AuthenticatorAssertionResponse;
  const { data } = await api.post(
    "/api/v1/auth/passkey/login-verify",
    {
      challenge_token: optRes.challenge_token,
      credential_id: bufferToBase64Url(assertion.rawId),
      clientDataJSON: bufferToBase64Url(response.clientDataJSON),
      authenticatorData: bufferToBase64Url(response.authenticatorData),
      signature: bufferToBase64Url(response.signature),
    },
    { headers: { "X-Company-ID": "" } },
  );

  if (data?.user) {
    localStorage.setItem("erp.user", JSON.stringify(data.user));
  }
  return data;
}

export async function discoverTenantSso(params: { email?: string; companyCode?: string }): Promise<SsoDiscoveryResult> {
  const query = new URLSearchParams();
  if (params.email) query.set("email", params.email.trim());
  if (params.companyCode) query.set("company_code", params.companyCode.trim());
  const { data } = await api.get(`/api/v1/auth/sso/discovery?${query.toString()}`, {
    headers: { "X-Company-ID": "" },
  });
  return data;
}

export async function getCompanySsoConfig(companyId?: string) {
  const query = companyId ? `?company_id=${encodeURIComponent(companyId)}` : "";
  const { data } = await api.get(`/api/v1/auth/sso/config${query}`);
  return data;
}

export async function updateCompanySsoConfig(payload: Record<string, unknown>) {
  const { data } = await api.put("/api/v1/auth/sso/config", payload);
  return data;
}
