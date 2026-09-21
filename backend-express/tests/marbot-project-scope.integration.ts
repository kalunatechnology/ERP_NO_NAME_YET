import assert from 'assert';
import { normalizeProjectScope } from '../src/modules/marbot/marbot-access.service';

assert.deepEqual(normalizeProjectScope({ mode: 'LIST', projectIds: ['c', 'a', 'a'] }), {
  mode: 'LIST', projectIds: ['a', 'c'],
});
assert.deepEqual(normalizeProjectScope({ mode: 'ALL', projectIds: ['ignored'] }), {
  mode: 'ALL', projectIds: [],
});
assert.throws(() => normalizeProjectScope({ mode: 'LIST', projectIds: 'a,c' }));
console.log('MarBot canonical project scope: passed');
