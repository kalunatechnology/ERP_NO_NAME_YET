import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { env } from '../../config/env';
import { ValidationError } from '../../utils/errors';

const PREFIX = 'enc:v1:';

export function hasMarbotEncryptionKey(): boolean {
  return Boolean(env.MARBOT_ENCRYPTION_KEY?.trim());
}

function encryptionKey(): Buffer {
  const raw = env.MARBOT_ENCRYPTION_KEY?.trim();
  if (!raw) throw new ValidationError('MARBOT_ENCRYPTION_KEY belum dikonfigurasi.');
  const key = /^[a-f0-9]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new ValidationError('MARBOT_ENCRYPTION_KEY harus tepat 32 byte.');
  return key;
}

export function encryptMarbotSecret(plaintext: string): string {
  if (plaintext.startsWith(PREFIX)) return plaintext;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptMarbotSecret(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored; // legacy rows remain readable during key rollout
  const [ivRaw, tagRaw, ciphertextRaw] = stored.slice(PREFIX.length).split(':');
  if (!ivRaw || !tagRaw || !ciphertextRaw) throw new ValidationError('Format credential MarBot terenkripsi tidak valid.');
  try {
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivRaw, 'base64'));
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextRaw, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new ValidationError('Credential MarBot tidak dapat didekripsi.');
  }
}
