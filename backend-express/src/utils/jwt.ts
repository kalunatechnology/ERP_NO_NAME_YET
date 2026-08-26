/**
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
  roles: string[];
  iat?: number;
  exp?: number;
}

export interface TokenPair {
  access: string;
  refresh: string;
}

/**
 * Sign an access token (default: 30m, matches Django SIMPLE_JWT ACCESS_TOKEN_LIFETIME)
 */
export function signAccessToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

/**
 * Sign a refresh token (default: 7d, matches Django SIMPLE_JWT REFRESH_TOKEN_LIFETIME)
 */
export function signRefreshToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

/**
 * Sign both access and refresh tokens for a user.
 */
export function signTokenPair(payload: Omit<JwtPayload, 'iat' | 'exp'>): TokenPair {
  return {
    access: signAccessToken(payload),
    refresh: signRefreshToken(payload),
  };
}

/**
 * Verify and decode an access token. Returns null if invalid/expired.
 */
export function verifyAccessToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

/**
 * Verify and decode a refresh token. Returns null if invalid/expired.
 */
export function verifyRefreshToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, env.JWT_REFRESH_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

/**
 * Decode a JWT without verifying the signature (for inspecting expired tokens, etc.)
 */
export function decodeToken(token: string): JwtPayload | null {
  try {
    return jwt.decode(token) as JwtPayload | null;
  } catch {
    return null;
  }
}
