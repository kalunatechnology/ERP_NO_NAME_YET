# Audit Kontrol Keamanan Menuju Standar OWASP ASVS 5.0 Level 2

**Dokumen ID:** AUD-SEC-ASVS5-L2-01  
**Berlaku Untuk:** MarkaSuite (`backend-express` & `frontend-next`)  
**Standar Acuan:** OWASP Application Security Verification Standard (ASVS) 5.0 — Level 2 (Standard / Enterprise B2B)  

---

## 1. Ringkasan Kesiapan ASVS 5.0 Level 2

| Domain ASVS 5.0 | Cakupan Kontrol di MarkaSuite | Status Kesiapan | Bukti / File Implementasi |
| :--- | :--- | :---: | :--- |
| **V1: Architecture, Design & Threat Modeling** | Pemisahan router publik vs terautentikasi, batas modul per-tenant (`requireModuleAccess`), DPIA untuk modul AI/Marbot. | **Terpenuhi** | `backend-express/src/app.ts`, `docs/DPIA_MODUL_AI_MARBOT_DAN_ANALITIK_OTOMATIS.md` |
| **V2: Authentication** | Hashing password kuat, lockout 5× gagal, rate limiting per-IP & per-email, MFA TOTP wajib Admin (`ERP_ENFORCE_ADMIN_MFA=true`), WebAuthn/FIDO2 Passkey untuk Super Admin, serta SAML 2.0 / OIDC per tenant B2B. | **Terpenuhi** | `auth-rate-limit.middleware.ts`, `utils/mfa.ts`, `enterprise-auth.service.ts`, `accounts.routes.ts` |
| **V3: Session Management** | Cookie `HttpOnly`, `SameSite=Lax`, `Secure` (production), tanpa penyimpanan token di `localStorage`, rotasi refresh token via `/token/refresh`, pembatalan cookie saat `/logout`. | **Terpenuhi** | `utils/session-cookie.ts`, `frontend-next/lib/api/axios.ts`, `auth.api.ts` |
| **V4: Access Control** | RBAC berbasis modul (`ASSIGNMENT` & `LEGACY`), `permission_overrides`, isolasi `company_id`/`tenant_id`, SoD Maker–Checker, otoritas project-scoped SPV. | **Terpenuhi** | `rbac.middleware.ts`, `sod.middleware.ts`, `entitlement.middleware.ts`, `projects.service.ts` |
| **V5: Validation, Sanitization & Encoding** | Skema validasi Zod (`env.ts`), parameterized query Prisma ORM, sanitasi input HTML/Markdown, validasi header `X-Company-ID` UUID. | **Terpenuhi** | `config/env.ts`, `frontend-next/lib/api/axios.ts` |
| **V6: Stored Cryptography** | Enkripsi `AES-256-GCM` untuk secret MFA & client secret SSO/CRM, hashing `SHA-256` dokumen legal & recovery codes. | **Terpenuhi** | `utils/mfa.ts`, `enterprise-auth.service.ts`, `governance.routes.ts` |
| **V7: Error Handling & Logging** | Error terstruktur tanpa stack trace ke klien produksi, audit trail (`core_audit_event`, `AUTH_RATE_LIMITED`, `gov_consent_ledger`, `RETENTION_AUTO_PURGE_EXECUTED`). | **Terpenuhi Sebagian** | `utils/errors.ts`, `auth-rate-limit.middleware.ts`, `retention-scheduler.ts` |
| **V8: Data Protection** | Header `Cache-Control: private, no-store` pada auth/PII/keuangan, `iam_field_permission` masking, `secret-scrubber.ts`, jadwal retensi & auto-purge PP 33/2026. | **Terpenuhi** | `utils/session-cookie.ts`, `policy.service.ts`, `retention-scheduler.ts` |
| **V12/V13: API, Web Services & SSO** | `helmet`, CORS origin whitelist, `Idempotency-Key` pada mutasi, verifikasi state JWT pada OIDC & validasi XML Issuer/NameID pada SAML 2.0 ACS, HMAC webhook. | **Terpenuhi Sebagian** | `app.ts`, `enterprise-auth.service.ts`, `crm-integration.service.ts` |

---

## 2. Rekomendasi Penguatan Lanjutan untuk Lulus Penuh Audit ASVS 5.0 L2
1. **Verifikasi Tanda Tangan XML Penuh (`xmldsig`) pada SAML 2.0:** Pastikan pada produksi yang menggunakan IdP SAML 2.0, validasi sertifikat X.509 mencakup verifikasi tanda tangan XML canonicalized (*XMLDSig*) secara penuh menggunakan pustaka XML-crypto terverifikasi.
2. **Nonce Replay Cache & PKCE pada OIDC:** Tambahkan penyimpanan *single-use* untuk `jti`/nonce `state` OIDC (mis. Redis/DB) serta `code_challenge` PKCE (`S256`) untuk mencegah *authorization code interception*.
3. **SIEM & Deteksi Anomali Terpusat:** Teruskan `core_audit_event` ke SIEM eksternal dengan alerting real-time untuk lonjakan `401`/`403`/`429` dan kegagalan verifikasi WebAuthn counter.
4. **Penetration Testing & Dependency Audit Berkala:** Jalankan `npm audit` di pipeline CI/CD serta uji penetrasi tahunan oleh pihak independen.
