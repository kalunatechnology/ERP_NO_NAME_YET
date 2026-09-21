import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { Request } from 'express';

/**
 * Deterministically formats JSON payloads with sorted keys for consistent HMAC hashing.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
}

/**
 * Verifies that an HMAC hex signature matches the calculated SHA-256 HMAC of a payload in constant time.
 */
export function matchesHmac(payload: string, signature: string, secret: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(payload).digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}

/**
 * Alias for matchesHmac.
 */
export const verifyHmacSignature = matchesHmac;

/**
 * Creates an HMAC-SHA256 hex signature for a payload using the provided secret.
 */
export function createHmacSignature(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Constructs the canonical multi-line string for tool request verification.
 */
export function toolSignaturePayload(
  req: Request,
  toolName: string,
  config: { externalTenantId: string },
): string {
  const timestamp = String(req.header('X-Timestamp') || '');
  const nonce = String(req.header('X-Nonce') || '');
  const requestId = String(req.header('X-Request-Id') || '');
  const userId = String(req.header('X-User-Id') || '');
  const roles = String(req.header('X-User-Roles') || '')
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean)
    .sort()
    .join(',');
  const query = Object.keys(req.query)
    .sort()
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(req.query[key]))}`)
    .join('&');
  const pathAndQuery = req.baseUrl + req.path + (query ? `?${query}` : '');
  const bodyHash = createHash('sha256').update('').digest('hex');
  return [
    'GET',
    pathAndQuery,
    timestamp,
    nonce,
    bodyHash,
    config.externalTenantId,
    userId,
    roles,
    toolName,
    requestId,
  ].join('\n');
}

/**
 * Alias for toolSignaturePayload for cross-service consistency.
 */
export const buildToolSignaturePayload = toolSignaturePayload;
