import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';
import prisma from '../config/database';

interface WindowCounter {
  count: number;
  resetAt: number;
}

const ipWindowStore = new Map<string, WindowCounter>();
const accountFailureStore = new Map<string, WindowCounter>();
const lockedAccounts = new Map<string, { lockedAt: number; reason: string; attempts: number }>();

const LOGIN_IP_MAX = 20;
const LOGIN_IP_WINDOW_MS = 15 * 60 * 1000; // 15 menit
const LOGIN_ACCOUNT_MAX_FAILURES = 5;
const LOGIN_ACCOUNT_WINDOW_MS = 15 * 60 * 1000; // 15 menit

const SIGNUP_IP_MAX = 3;
const SIGNUP_IP_WINDOW_MS = 60 * 60 * 1000; // 1 jam

const MFA_VERIFY_MAX_FAILURES = 5;
const MFA_VERIFY_WINDOW_MS = 10 * 60 * 1000; // 10 menit
const mfaFailureStore = new Map<string, WindowCounter>();

function pruneExpired(store: Map<string, WindowCounter>, now = Date.now()) {
  if (store.size < 500) return;
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt <= now) store.delete(key);
  }
}

function normalizeIdentifier(raw: unknown): string {
  return String(raw ?? '').trim().toLowerCase();
}

function hashIdentifier(identifier: string): string {
  return crypto.createHash('sha256').update(identifier).digest('hex').slice(0, 16);
}

function clientIp(req: Request): string {
  return String(req.ip || req.socket?.remoteAddress || 'unknown').trim();
}

async function logAuthSecurityEvent(action: string, req: Request, identifierHash?: string, detail?: string) {
  try {
    await (prisma as any).core_audit_event?.create?.({
      data: {
        id: crypto.randomUUID(),
        event_type: action,
        entity_name: 'AUTH_SECURITY',
        entity_id: identifierHash || clientIp(req),
        before_data: {},
        after_data: {
          detail: detail ?? null,
          identifier_hash: identifierHash ?? null,
          ip_address: clientIp(req),
          user_agent: String(req.headers['user-agent'] || '').slice(0, 255),
        },
        occurred_at: new Date(),
      },
    });
  } catch {
    // Non-blocking best-effort audit log
  }
}

function incrementWindow(store: Map<string, WindowCounter>, key: string, windowMs: number): WindowCounter {
  const now = Date.now();
  pruneExpired(store, now);
  const existing = store.get(key);
  if (!existing || existing.resetAt <= now) {
    const next = { count: 1, resetAt: now + windowMs };
    store.set(key, next);
    return next;
  }
  existing.count += 1;
  return existing;
}

export function isAccountLocked(identifier: string): boolean {
  const id = normalizeIdentifier(identifier);
  return Boolean(id && lockedAccounts.has(id));
}

export function unlockAuthAccount(identifier: string): boolean {
  const id = normalizeIdentifier(identifier);
  if (!id) return false;
  const existed = lockedAccounts.delete(id);
  for (const key of accountFailureStore.keys()) {
    if (key.endsWith(`:${id}`)) accountFailureStore.delete(key);
  }
  return existed;
}

export function recordAuthFailure(ip: string, identifier: string): { locked: boolean; attempts: number } {
  const id = normalizeIdentifier(identifier);
  if (!id) return { locked: false, attempts: 0 };
  const compositeKey = `${ip}:${id}`;
  const entry = incrementWindow(accountFailureStore, compositeKey, LOGIN_ACCOUNT_WINDOW_MS);
  if (entry.count >= LOGIN_ACCOUNT_MAX_FAILURES) {
    lockedAccounts.set(id, {
      lockedAt: Date.now(),
      reason: 'Terlalu banyak percobaan login gagal',
      attempts: entry.count,
    });
    return { locked: true, attempts: entry.count };
  }
  return { locked: false, attempts: entry.count };
}

export function recordAuthSuccess(ip: string, identifier: string): void {
  const id = normalizeIdentifier(identifier);
  if (!id) return;
  accountFailureStore.delete(`${ip}:${id}`);
}

export function loginRateLimiter(req: Request, res: Response, next: NextFunction): void {
  const ip = clientIp(req);
  const identifier = normalizeIdentifier(req.body?.email || req.body?.username);

  if (identifier && isAccountLocked(identifier)) {
    res.setHeader('Retry-After', String(Math.ceil(LOGIN_ACCOUNT_WINDOW_MS / 1000)));
    void logAuthSecurityEvent('AUTH_ACCOUNT_LOCKED', req, hashIdentifier(identifier), 'Locked account login attempt');
    res.status(423).json({
      success: false,
      error_code: 'ACCOUNT_LOCKED',
      message:
        'Akun dikunci karena terlalu banyak percobaan login gagal (maksimal 5 kali). Hubungi Administrator TI untuk membuka kunci akun.',
    });
    return;
  }

  const ipCounter = incrementWindow(ipWindowStore, `login:ip:${ip}`, LOGIN_IP_WINDOW_MS);
  if (ipCounter.count > LOGIN_IP_MAX) {
    const retryAfter = Math.max(1, Math.ceil((ipCounter.resetAt - Date.now()) / 1000));
    res.setHeader('Retry-After', String(retryAfter));
    void logAuthSecurityEvent('AUTH_RATE_LIMITED', req, identifier ? hashIdentifier(identifier) : undefined, 'IP login flood');
    res.status(429).json({
      success: false,
      error_code: 'RATE_LIMITED',
      message: `Terlalu banyak percobaan login dari jaringan Anda. Coba lagi dalam ${retryAfter} detik.`,
    });
    return;
  }

  next();
}

export function signupRateLimiter(req: Request, res: Response, next: NextFunction): void {
  const ip = clientIp(req);
  const ipCounter = incrementWindow(ipWindowStore, `signup:ip:${ip}`, SIGNUP_IP_WINDOW_MS);
  if (ipCounter.count > SIGNUP_IP_MAX) {
    const retryAfter = Math.max(1, Math.ceil((ipCounter.resetAt - Date.now()) / 1000));
    res.setHeader('Retry-After', String(retryAfter));
    void logAuthSecurityEvent('AUTH_SIGNUP_RATE_LIMITED', req, undefined, 'Signup rate limit exceeded');
    res.status(429).json({
      success: false,
      error_code: 'RATE_LIMITED',
      message: 'Terlalu banyak permintaan pendaftaran dari jaringan Anda. Silakan coba lagi nanti.',
    });
    return;
  }
  next();
}

export function checkMfaVerifyRateLimit(challengeKey: string): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  const existing = mfaFailureStore.get(challengeKey);
  if (existing && existing.resetAt > now && existing.count >= MFA_VERIFY_MAX_FAILURES) {
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) };
  }
  return { allowed: true, retryAfter: 0 };
}

export function recordMfaFailure(challengeKey: string): number {
  return incrementWindow(mfaFailureStore, challengeKey, MFA_VERIFY_WINDOW_MS).count;
}

export function clearMfaFailures(challengeKey: string): void {
  mfaFailureStore.delete(challengeKey);
}

export function clearAllAuthRateLimitsForTests(): void {
  ipWindowStore.clear();
  accountFailureStore.clear();
  lockedAccounts.clear();
  mfaFailureStore.clear();
}
