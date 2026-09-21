import assert from 'assert';
import { env } from '../src/config/env';
import { decryptMarbotSecret, encryptMarbotSecret } from '../src/modules/marbot/marbot-secret.service';

(env as any).MARBOT_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
const encrypted = encryptMarbotSecret('tenant-secret-value');
assert.ok(encrypted.startsWith('enc:v1:'));
assert.notEqual(encrypted, 'tenant-secret-value');
assert.equal(decryptMarbotSecret(encrypted), 'tenant-secret-value');
const tampered = encrypted.slice(0, -2) + 'aa';
assert.throws(() => decryptMarbotSecret(tampered));
assert.equal(decryptMarbotSecret('legacy-plaintext'), 'legacy-plaintext');
console.log('MarBot AES-256-GCM secret storage: passed');
