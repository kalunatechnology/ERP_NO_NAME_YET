/**
 * File: backend-express/src/utils/password.ts
 *
 * Purpose: Implements shared utility responsibilities in the backend application.
 * Responsibility: Owns the contracts declared here and connects them to framework discovery or explicit imports without changing unrelated domain state.
 * Integration: Consumers reach this file through static imports, framework conventions, or an explicit script entry point.
 * Dependencies and side effects: Function-level documentation identifies HTTP, database, browser-state, and security effects where they occur.
 */
import crypto from 'crypto';
import bcrypt from 'bcrypt';

const BCRYPT_PREFIX = /^\$2[aby]\$/;

/**
 * verifyDjangoPbkdf2 implements this file's named function contract.
 *
 * @param input - Uses the typed parameters declared by the signature.
 * @returns The value or Promise declared by the implementation.
 * Database: no direct Prisma operation is present in this function; persistence may be delegated to an imported service.
 * Failure/side effects: propagates validation, authorization, persistence, or dependency failures according to the existing caller contract.
 */
function verifyDjangoPbkdf2(password: string, encoded: string): boolean {
  const [algorithm, iterationsRaw, salt, digest] = encoded.split('$');
  if (!algorithm || !iterationsRaw || salt === undefined || !digest) return false;

  const iterations = Number(iterationsRaw);
  if (!Number.isSafeInteger(iterations) || iterations <= 0) return false;

  const hashAlgorithm = algorithm === 'pbkdf2_sha256'
    ? 'sha256'
    : algorithm === 'pbkdf2_sha1'
      ? 'sha1'
      : null;
  if (!hashAlgorithm) return false;

  try {
    const expected = Buffer.from(digest, 'base64');
    if (expected.length === 0) return false;
    const actual = crypto.pbkdf2Sync(password, salt, iterations, expected.length, hashAlgorithm);
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/**
 * isLegacyDjangoPassword implements this file's named function contract.
 *
 * @param input - Uses the typed parameters declared by the signature.
 * @returns The value or Promise declared by the implementation.
 * Database: no direct Prisma operation is present in this function; persistence may be delegated to an imported service.
 * Failure/side effects: propagates validation, authorization, persistence, or dependency failures according to the existing caller contract.
 */
export function isLegacyDjangoPassword(encoded: string): boolean {
  return encoded.startsWith('pbkdf2_sha256$') || encoded.startsWith('pbkdf2_sha1$');
}

/**
 * verifyPassword implements this file's named function contract.
 *
 * @param input - Uses the typed parameters declared by the signature.
 * @returns The value or Promise declared by the implementation.
 * Database: no direct Prisma operation is present in this function; persistence may be delegated to an imported service.
 * Failure/side effects: propagates validation, authorization, persistence, or dependency failures according to the existing caller contract.
 */
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  if (!password || !encoded) return false;
  if (isLegacyDjangoPassword(encoded)) return verifyDjangoPbkdf2(password, encoded);
  if (!BCRYPT_PREFIX.test(encoded)) return false;

  try {
    return await bcrypt.compare(password, encoded);
  } catch {
    return false;
  }
}

/**
 * hashPassword implements this file's named function contract.
 *
 * @param input - Uses the typed parameters declared by the signature.
 * @returns The value or Promise declared by the implementation.
 * Database: no direct Prisma operation is present in this function; persistence may be delegated to an imported service.
 * Failure/side effects: propagates validation, authorization, persistence, or dependency failures according to the existing caller contract.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}
