import assert from 'assert';
import jwt from 'jsonwebtoken';
import { signAccessToken } from '../src/utils/jwt';

const token = signAccessToken({
  userId: '00000000-0000-4000-8000-000000000001',
  email: 'expiry-test@example.com',
  full_name: 'Expiry Test',
  tenant_id: '00000000-0000-4000-8000-000000000002',
  company_id: '00000000-0000-4000-8000-000000000003',
  roles: [],
});
const decoded = jwt.decode(token) as jwt.JwtPayload;
assert.ok(decoded.iat && decoded.exp);
assert.equal(decoded.exp! - decoded.iat!, 86_400);
console.log('JWT access lifetime is exactly one day: passed');
