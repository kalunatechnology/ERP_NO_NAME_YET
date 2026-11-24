import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import prisma from '../../config/database';
import { env } from '../../config/env';
import { decryptMfaSecret, encryptMfaSecret } from '../../utils/mfa';
import { ForbiddenError, NotFoundError, ValidationError } from '../../utils/errors';

let enterpriseAuthInitialized = false;

export async function ensureEnterpriseAuthTables(): Promise<void> {
  if (enterpriseAuthInitialized) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "iam_webauthn_credential" (
        "id" TEXT PRIMARY KEY,
        "user_id" TEXT NOT NULL,
        "credential_id" TEXT NOT NULL UNIQUE,
        "public_key_spki" TEXT NOT NULL,
        "alg" INTEGER NOT NULL DEFAULT -7,
        "counter" INTEGER NOT NULL DEFAULT 0,
        "device_label" TEXT NOT NULL DEFAULT 'Passkey',
        "transports" JSONB NOT NULL DEFAULT '[]'::jsonb,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "last_used_at" TIMESTAMP(3)
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "iam_tenant_sso_config" (
        "id" TEXT PRIMARY KEY,
        "company_id" TEXT NOT NULL UNIQUE,
        "tenant_id" TEXT,
        "provider_type" TEXT NOT NULL DEFAULT 'OIDC',
        "display_name" TEXT NOT NULL DEFAULT 'Enterprise SSO',
        "enabled" BOOLEAN NOT NULL DEFAULT false,
        "enforce_sso" BOOLEAN NOT NULL DEFAULT false,
        "oidc_issuer" TEXT NOT NULL DEFAULT '',
        "oidc_client_id" TEXT NOT NULL DEFAULT '',
        "oidc_client_secret_encrypted" TEXT NOT NULL DEFAULT '',
        "oidc_authorization_endpoint" TEXT NOT NULL DEFAULT '',
        "oidc_token_endpoint" TEXT NOT NULL DEFAULT '',
        "oidc_userinfo_endpoint" TEXT NOT NULL DEFAULT '',
        "saml_entity_id" TEXT NOT NULL DEFAULT '',
        "saml_sso_url" TEXT NOT NULL DEFAULT '',
        "saml_x509_cert_pem" TEXT NOT NULL DEFAULT '',
        "allowed_domains" JSONB NOT NULL DEFAULT '[]'::jsonb,
        "jit_default_role_code" TEXT NOT NULL DEFAULT 'ROLE-STAFF',
        "updated_by_id" TEXT,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    enterpriseAuthInitialized = true;
  } catch {
    // Graceful degradation if DDL is restricted
  }
}

export function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function base64UrlDecode(str: string): Buffer {
  const normalized = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + pad, 'base64');
}

export function signChallengeJwt(payload: Record<string, unknown>, ttlSeconds = 300): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: ttlSeconds });
}

export function verifyChallengeJwt<T = any>(token: string, expectedPurpose: string): T | null {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as Record<string, any>;
    if (decoded?.purpose !== expectedPurpose) return null;
    return decoded as T;
  } catch {
    return null;
  }
}

export function resolveRpIdFromRequest(originHeader?: string, hostHeader?: string): { rpId: string; expectedOrigins: string[] } {
  const candidates: string[] = [];
  if (originHeader) candidates.push(originHeader);
  for (const origin of env.CORS_ALLOWED_ORIGINS) candidates.push(origin);
  const parsedOrigin = originHeader ? (() => { try { return new URL(originHeader); } catch { return null; } })() : null;
  const rawHost = parsedOrigin?.hostname || String(hostHeader || 'localhost').split(':')[0] || 'localhost';
  const rpId = rawHost.trim().toLowerCase();
  return {
    rpId,
    expectedOrigins: [...new Set(candidates)],
  };
}

export function verifyWebAuthnAssertionSignature(params: {
  publicKeySpkiBase64: string;
  alg: number;
  authenticatorData: Buffer;
  clientDataJSON: Buffer;
  signature: Buffer;
  expectedRpId: string;
  storedCounter: number;
}): { valid: boolean; nextCounter: number; reason?: string } {
  const { publicKeySpkiBase64, alg, authenticatorData, clientDataJSON, signature, expectedRpId, storedCounter } = params;
  if (authenticatorData.length < 37) {
    return { valid: false, nextCounter: storedCounter, reason: 'authenticatorData tidak valid.' };
  }
  const rpIdHash = authenticatorData.subarray(0, 32);
  const expectedRpIdHash = crypto.createHash('sha256').update(expectedRpId).digest();
  if (!crypto.timingSafeEqual(rpIdHash, expectedRpIdHash)) {
    return { valid: false, nextCounter: storedCounter, reason: 'RP ID hash tidak cocok.' };
  }
  const flags = authenticatorData[32];
  const userPresent = (flags & 0x01) !== 0;
  const userVerified = (flags & 0x04) !== 0;
  if (!userPresent || !userVerified) {
    return { valid: false, nextCounter: storedCounter, reason: 'User presence/verification passkey tidak terpenuhi.' };
  }
  const signCount = authenticatorData.readUInt32BE(33);
  if (storedCounter > 0 && signCount > 0 && signCount <= storedCounter) {
    return { valid: false, nextCounter: storedCounter, reason: 'Anomali signature counter passkey terdeteksi.' };
  }

  const clientDataHash = crypto.createHash('sha256').update(clientDataJSON).digest();
  const signedData = Buffer.concat([authenticatorData, clientDataHash]);
  const keyDer = base64UrlDecode(publicKeySpkiBase64);
  const publicKey = crypto.createPublicKey({ key: keyDer, format: 'der', type: 'spki' });

  const hashAlg = alg === -35 ? 'sha384' : alg === -36 ? 'sha512' : 'sha256';
  const verified = crypto.verify(hashAlg, signedData, publicKey, signature);
  if (!verified) {
    return { valid: false, nextCounter: storedCounter, reason: 'Signature WebAuthn tidak valid.' };
  }
  return { valid: true, nextCounter: Math.max(storedCounter, signCount) };
}

export async function getCompanySsoConfig(companyId: string) {
  await ensureEnterpriseAuthTables();
  const company = await prisma.core_company.findUnique({
    where: { id: companyId },
    select: { id: true, tenant_id: true, legal_name: true, company_code: true },
  });
  if (!company) throw new NotFoundError('Company');

  const rows = await prisma.$queryRawUnsafe<Array<any>>(
    `SELECT * FROM "iam_tenant_sso_config" WHERE "company_id" = $1 LIMIT 1`,
    companyId,
  );
  const cfg = rows[0] ?? null;
  return {
    company: {
      id: company.id,
      tenant_id: company.tenant_id,
      name: company.legal_name,
      company_code: company.company_code,
    },
    config: cfg
      ? {
          id: cfg.id,
          company_id: cfg.company_id,
          provider_type: cfg.provider_type,
          display_name: cfg.display_name,
          enabled: Boolean(cfg.enabled),
          enforce_sso: Boolean(cfg.enforce_sso),
          oidc_issuer: cfg.oidc_issuer || '',
          oidc_client_id: cfg.oidc_client_id || '',
          oidc_client_secret_masked: cfg.oidc_client_secret_encrypted ? '••••••••' : '',
          oidc_authorization_endpoint: cfg.oidc_authorization_endpoint || '',
          oidc_token_endpoint: cfg.oidc_token_endpoint || '',
          oidc_userinfo_endpoint: cfg.oidc_userinfo_endpoint || '',
          saml_entity_id: cfg.saml_entity_id || '',
          saml_sso_url: cfg.saml_sso_url || '',
          saml_x509_cert_pem: cfg.saml_x509_cert_pem || '',
          allowed_domains: Array.isArray(cfg.allowed_domains) ? cfg.allowed_domains : [],
          jit_default_role_code: cfg.jit_default_role_code || 'ROLE-STAFF',
          updated_at: cfg.updated_at,
        }
      : {
          company_id: companyId,
          provider_type: 'OIDC',
          display_name: `${company.legal_name} SSO`,
          enabled: false,
          enforce_sso: false,
          oidc_issuer: '',
          oidc_client_id: '',
          oidc_client_secret_masked: '',
          oidc_authorization_endpoint: '',
          oidc_token_endpoint: '',
          oidc_userinfo_endpoint: '',
          saml_entity_id: '',
          saml_sso_url: '',
          saml_x509_cert_pem: '',
          allowed_domains: [],
          jit_default_role_code: 'ROLE-STAFF',
        },
  };
}

export async function upsertCompanySsoConfig(companyId: string, actorUserId: string, body: Record<string, any>) {
  await ensureEnterpriseAuthTables();
  const company = await prisma.core_company.findUnique({
    where: { id: companyId },
    select: { id: true, tenant_id: true, legal_name: true },
  });
  if (!company) throw new NotFoundError('Company');

  const providerType = String(body.provider_type || 'OIDC').trim().toUpperCase();
  if (!['OIDC', 'SAML2'].includes(providerType)) {
    throw new ValidationError('provider_type harus OIDC atau SAML2.');
  }

  const existingRows = await prisma.$queryRawUnsafe<Array<any>>(
    `SELECT "id", "oidc_client_secret_encrypted" FROM "iam_tenant_sso_config" WHERE "company_id" = $1 LIMIT 1`,
    companyId,
  );
  const existing = existingRows[0] ?? null;

  const rawSecret = String(body.oidc_client_secret || '').trim();
  const secretEncrypted = rawSecret && rawSecret !== '••••••••'
    ? encryptMfaSecret(rawSecret)
    : existing?.oidc_client_secret_encrypted || '';

  const allowedDomains = Array.isArray(body.allowed_domains)
    ? body.allowed_domains.map((d: unknown) => String(d).trim().toLowerCase()).filter(Boolean)
    : String(body.allowed_domains || '')
        .split(',')
        .map((d) => d.trim().toLowerCase())
        .filter(Boolean);

  const id = existing?.id || crypto.randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "iam_tenant_sso_config" (
      "id", "company_id", "tenant_id", "provider_type", "display_name", "enabled", "enforce_sso",
      "oidc_issuer", "oidc_client_id", "oidc_client_secret_encrypted", "oidc_authorization_endpoint",
      "oidc_token_endpoint", "oidc_userinfo_endpoint", "saml_entity_id", "saml_sso_url",
      "saml_x509_cert_pem", "allowed_domains", "jit_default_role_code", "updated_by_id", "updated_at"
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7,
      $8, $9, $10, $11,
      $12, $13, $14, $15,
      $16, $17::jsonb, $18, $19, NOW()
    )
    ON CONFLICT ("company_id") DO UPDATE SET
      "provider_type" = EXCLUDED."provider_type",
      "display_name" = EXCLUDED."display_name",
      "enabled" = EXCLUDED."enabled",
      "enforce_sso" = EXCLUDED."enforce_sso",
      "oidc_issuer" = EXCLUDED."oidc_issuer",
      "oidc_client_id" = EXCLUDED."oidc_client_id",
      "oidc_client_secret_encrypted" = EXCLUDED."oidc_client_secret_encrypted",
      "oidc_authorization_endpoint" = EXCLUDED."oidc_authorization_endpoint",
      "oidc_token_endpoint" = EXCLUDED."oidc_token_endpoint",
      "oidc_userinfo_endpoint" = EXCLUDED."oidc_userinfo_endpoint",
      "saml_entity_id" = EXCLUDED."saml_entity_id",
      "saml_sso_url" = EXCLUDED."saml_sso_url",
      "saml_x509_cert_pem" = EXCLUDED."saml_x509_cert_pem",
      "allowed_domains" = EXCLUDED."allowed_domains",
      "jit_default_role_code" = EXCLUDED."jit_default_role_code",
      "updated_by_id" = EXCLUDED."updated_by_id",
      "updated_at" = NOW()`,
    id,
    companyId,
    company.tenant_id,
    providerType,
    String(body.display_name || `${company.legal_name} SSO`).trim(),
    Boolean(body.enabled),
    Boolean(body.enforce_sso),
    String(body.oidc_issuer || '').trim(),
    String(body.oidc_client_id || '').trim(),
    secretEncrypted,
    String(body.oidc_authorization_endpoint || '').trim(),
    String(body.oidc_token_endpoint || '').trim(),
    String(body.oidc_userinfo_endpoint || '').trim(),
    String(body.saml_entity_id || '').trim(),
    String(body.saml_sso_url || '').trim(),
    String(body.saml_x509_cert_pem || '').trim(),
    JSON.stringify(allowedDomains),
    String(body.jit_default_role_code || 'ROLE-STAFF').trim().toUpperCase(),
    actorUserId,
  );

  return getCompanySsoConfig(companyId);
}

export async function discoverSsoByEmailOrCompany(params: { email?: string; companyCode?: string }) {
  await ensureEnterpriseAuthTables();
  const email = String(params.email || '').trim().toLowerCase();
  const companyCode = String(params.companyCode || '').trim().toUpperCase();
  const domain = email.includes('@') ? email.split('@')[1] : '';

  const rows = await prisma.$queryRawUnsafe<Array<any>>(
    `SELECT cfg.*, c."legal_name", c."company_code"
     FROM "iam_tenant_sso_config" cfg
     INNER JOIN "core_company" c ON c."id" = cfg."company_id"
     WHERE cfg."enabled" = true`,
  );

  const match = rows.find((row) => {
    if (companyCode && String(row.company_code || '').toUpperCase() === companyCode) return true;
    const domains: string[] = Array.isArray(row.allowed_domains) ? row.allowed_domains : [];
    return Boolean(domain && domains.map((d) => String(d).toLowerCase()).includes(domain));
  });

  if (!match) {
    return { sso_available: false };
  }

  return {
    sso_available: true,
    company_id: match.company_id,
    company_name: match.legal_name,
    company_code: match.company_code,
    provider_type: match.provider_type,
    display_name: match.display_name,
    enforce_sso: Boolean(match.enforce_sso),
    oidc_start_path: match.provider_type === 'OIDC' ? `/api/v1/auth/sso/oidc/start?company_id=${encodeURIComponent(match.company_id)}` : null,
    saml_sso_url: match.provider_type === 'SAML2' ? match.saml_sso_url : null,
  };
}

export async function buildOidcAuthorizationUrl(companyId: string, callbackUrl: string): Promise<string> {
  await ensureEnterpriseAuthTables();
  const rows = await prisma.$queryRawUnsafe<Array<any>>(
    `SELECT * FROM "iam_tenant_sso_config" WHERE "company_id" = $1 AND "enabled" = true LIMIT 1`,
    companyId,
  );
  const cfg = rows[0];
  if (!cfg || cfg.provider_type !== 'OIDC' || !cfg.oidc_authorization_endpoint || !cfg.oidc_client_id) {
    throw new ForbiddenError('Konfigurasi OIDC SSO belum aktif atau tidak lengkap untuk company ini.');
  }

  const state = signChallengeJwt({ purpose: 'sso_oidc_state', companyId, nonce: crypto.randomUUID() }, 600);
  const authUrl = new URL(cfg.oidc_authorization_endpoint);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', cfg.oidc_client_id);
  authUrl.searchParams.set('redirect_uri', callbackUrl);
  authUrl.searchParams.set('scope', 'openid email profile');
  authUrl.searchParams.set('state', state);
  return authUrl.toString();
}

export function decryptSsoSecret(encrypted: string): string {
  if (!encrypted) return '';
  return decryptMfaSecret(encrypted);
}
