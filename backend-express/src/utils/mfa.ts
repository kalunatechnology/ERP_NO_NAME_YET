import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import prisma from '../config/database';
import { env } from '../config/env';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
let mfaColumnsEnsured = false;

export async function ensureMfaColumns(): Promise<void> {
  if (mfaColumnsEnsured) return;
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "iam_user"
        ADD COLUMN IF NOT EXISTS "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "mfa_secret_encrypted" TEXT,
        ADD COLUMN IF NOT EXISTS "mfa_recovery_codes" JSONB,
        ADD COLUMN IF NOT EXISTS "mfa_verified_at" TIMESTAMP(3)
    `);
    mfaColumnsEnsured = true;
  } catch {
    // Allow graceful fallback if DB user lacks DDL privileges
  }
}

function encryptionKey(): Buffer {
  const raw = process.env.MFA_ENCRYPTION_KEY || env.JWT_ACCESS_SECRET;
  return crypto.createHash('sha256').update(raw).digest();
}

export function encryptMfaSecret(secret: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptMfaSecret(payload: string): string {
  const [ivHex, tagHex, dataHex] = String(payload || '').split(':');
  if (!ivHex || !tagHex || !dataHex) throw new Error('Format secret MFA tidak valid.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
}

export function generateBase32Secret(bytes = 20): string {
  const buf = crypto.randomBytes(bytes);
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function decodeBase32(secret: string): Buffer {
  const cleaned = secret.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateTotpCode(secret: string, counterOffset = 0, timestampMs = Date.now()): string {
  const key = decodeBase32(secret);
  const step = Math.floor(timestampMs / 1000 / 30) + counterOffset;
  const msg = Buffer.alloc(8);
  msg.writeUInt32BE(Math.floor(step / 0x100000000), 0);
  msg.writeUInt32BE(step >>> 0, 4);
  const hmac = crypto.createHmac('sha1', key).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24)
    | ((hmac[offset + 1] & 0xff) << 16)
    | ((hmac[offset + 2] & 0xff) << 8)
    | (hmac[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, '0');
}

export function verifyTotpCode(secret: string, code: string): boolean {
  const normalized = String(code || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(normalized)) return false;
  for (const offset of [-1, 0, 1]) {
    const expected = generateTotpCode(secret, offset);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(normalized))) {
      return true;
    }
  }
  return false;
}

export function buildOtpAuthUri(email: string, secret: string, issuer = 'MarkaSuite'): string {
  const label = encodeURIComponent(`${issuer}:${email}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

export function generateRecoveryCodes(count = 8): { plain: string[]; hashes: string[] } {
  const plain: string[] = [];
  const hashes: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const raw = crypto.randomBytes(4).toString('hex').toUpperCase();
    const formatted = `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
    plain.push(formatted);
    hashes.push(hashRecoveryCode(formatted));
  }
  return { plain, hashes };
}

export function hashRecoveryCode(code: string): string {
  const normalized = String(code || '').trim().toUpperCase();
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

export function signMfaChallengeToken(userId: string, scope: 'mfa_pending' | 'mfa_setup'): string {
  return jwt.sign(
    { userId, scope },
    env.JWT_ACCESS_SECRET,
    { expiresIn: scope === 'mfa_pending' ? '5m' : '10m' },
  );
}

export function verifyMfaChallengeToken(token: string, expectedScope?: 'mfa_pending' | 'mfa_setup'): { userId: string; scope: string } | null {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as { userId?: string; scope?: string };
    if (!decoded?.userId || !decoded?.scope) return null;
    if (expectedScope && decoded.scope !== expectedScope) return null;
    return { userId: decoded.userId, scope: decoded.scope };
  } catch {
    return null;
  }
}
