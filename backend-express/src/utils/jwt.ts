/**
 * Purpose: Defines shared utility contracts and their integration boundary for the backend application.
 * Responsibility: Documents and exposes only the behavior implemented in this file; function comments identify inputs, outputs, dependencies, and side effects.
 * JWT Utilities
 *
 * Compatible with SimpleJWT claims structure:
 *   { userId, email, full_name, tenant_id, roles }
 */

import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface JwtPayload {
  userId: string;
  email: string;
  full_name: string;
  tenant_id: string | null;
  company_id?: string | null;
  roles: string[];
  iat?: number;
  exp?: number;
}

export interface TokenPair {
  access: string;
  refresh: string;
}

// ERP access sessions are intentionally fixed at 24 hours. Keeping this in the
// signing boundary prevents a stale deployment environment variable from
// silently shortening browser sessions after a redeploy.
const ACCESS_TOKEN_LIFETIME: jwt.SignOptions['expiresIn'] = '24h';

/** Sign an access token with a fixed 24-hour lifetime. */
export function signAccessToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: ACCESS_TOKEN_LIFETIME,
  });
}

/** Sign a refresh token (default: 7d). */
export function signRefreshToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

/** Sign both access and refresh tokens for a user. */
export function signTokenPair(payload: Omit<JwtPayload, 'iat' | 'exp'>): TokenPair {
  return {
    access: signAccessToken(payload),
    refresh: signRefreshToken(payload),
  };
}

/** Verify and decode an access token. Returns null if invalid/expired. */
export function verifyAccessToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

/** Verify and decode a refresh token. Returns null if invalid/expired. */
export function verifyRefreshToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, env.JWT_REFRESH_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

/** Decode a JWT without verifying the signature (for inspecting expired tokens, etc.). */
export function decodeToken(token: string): JwtPayload | null {
  try {
    return jwt.decode(token) as JwtPayload | null;
  } catch {
    return null;
  }
}
