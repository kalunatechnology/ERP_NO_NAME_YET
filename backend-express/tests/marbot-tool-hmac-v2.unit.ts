import assert from 'assert';
import { createHmacSignature, matchesHmac } from '../src/modules/marbot/marbot-signature.service';

const base = ['GET', '/internal/marbot/projects/summary?projectId=a', '1', 'n', 'hash',
  'tenant', 'user', 'STAFF', 'project.summary', 'request', 'company',
  'READ_PROJECT', '{"mode":"LIST","projectIds":["a"]}'];
const payload = base.join('\n');
const signature = createHmacSignature(payload, 'secret');
assert(matchesHmac(payload, signature, 'secret'));
for (const index of [10, 11, 12]) {
  const tampered = [...base]; tampered[index] += '-tampered';
  assert(!matchesHmac(tampered.join('\n'), signature, 'secret'));
}
console.log('MarBot tool HMAC V2 tamper protection: passed');
