import assert from 'node:assert/strict';
import {
  clearAllAuthRateLimitsForTests,
  isAccountLocked,
  loginRateLimiter,
  recordAuthFailure,
  recordAuthSuccess,
  unlockAuthAccount,
} from '../src/middlewares/auth-rate-limit.middleware';
import {
  buildOtpAuthUri,
  decryptMfaSecret,
  encryptMfaSecret,
  generateBase32Secret,
  generateRecoveryCodes,
  generateTotpCode,
  hashRecoveryCode,
  signMfaChallengeToken,
  verifyMfaChallengeToken,
  verifyTotpCode,
} from '../src/utils/mfa';

function main() {
  clearAllAuthRateLimitsForTests();

  // 1. Per-account lockout after 5 failures + manual admin unlock
  for (let i = 1; i <= 4; i += 1) {
    const res = recordAuthFailure('10.0.0.1', 'admin@markasuite.id');
    assert.equal(res.locked, false);
  }
  const fifth = recordAuthFailure('10.0.0.1', 'admin@markasuite.id');
  assert.equal(fifth.locked, true);
  assert.equal(isAccountLocked('admin@markasuite.id'), true);

  let statusCode = 0;
  let body: any = null;
  loginRateLimiter(
    { ip: '10.0.0.1', body: { email: 'admin@markasuite.id' }, headers: {} } as any,
    { setHeader: () => {}, status: (c: number) => ({ json: (b: any) => { statusCode = c; body = b; } }) } as any,
    () => { throw new Error('Locked account must not pass loginRateLimiter'); },
  );
  assert.equal(statusCode, 423);
  assert.equal(body.error_code, 'ACCOUNT_LOCKED');

  assert.equal(unlockAuthAccount('admin@markasuite.id'), true);
  assert.equal(isAccountLocked('admin@markasuite.id'), false);

  // Success resets failure counter
  recordAuthFailure('10.0.0.2', 'user@markasuite.id');
  recordAuthSuccess('10.0.0.2', 'user@markasuite.id');

  // 2. MFA TOTP + AES-256-GCM + Recovery Codes + Challenge JWT
  const secret = generateBase32Secret();
  const encrypted = encryptMfaSecret(secret);
  assert.notEqual(encrypted, secret);
  assert.equal(decryptMfaSecret(encrypted), secret);

  const otp = generateTotpCode(secret);
  assert.equal(otp.length, 6);
  assert.equal(verifyTotpCode(secret, otp), true);
  assert.equal(verifyTotpCode(secret, '000000') && otp !== '000000', false);
  assert.ok(buildOtpAuthUri('admin@markasuite.id', secret).startsWith('otpauth://totp/'));

  const recovery = generateRecoveryCodes(8);
  assert.equal(recovery.plain.length, 8);
  assert.equal(recovery.hashes[0], hashRecoveryCode(recovery.plain[0]));

  const mfaToken = signMfaChallengeToken('user-1', 'mfa_pending');
  assert.equal(verifyMfaChallengeToken(mfaToken, 'mfa_pending')?.userId, 'user-1');
  assert.equal(verifyMfaChallengeToken(mfaToken, 'mfa_setup'), null);

  console.log('auth-security.unit.ts: ALL PASSED');
}

main();
