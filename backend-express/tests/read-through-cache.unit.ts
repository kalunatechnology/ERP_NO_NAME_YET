import assert from 'node:assert/strict';
import { ReadThroughCache } from '../src/utils/read-through-cache';

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function main() {
  const cache = new ReadThroughCache<number>(2);
  let loads = 0;
  const options = { ttlMs: 20, staleMs: 200, timeoutMs: 10 };
  const loader = async () => { loads += 1; await delay(5); return loads; };

  const first = await cache.get('tenant|company|user', loader, options);
  assert.deepEqual(first, { value: 1, state: 'MISS' });
  const hit = await cache.get('tenant|company|user', loader, options);
  assert.deepEqual(hit, { value: 1, state: 'HIT' });
  assert.equal(loads, 1);

  await delay(25);
  const stale = await cache.get('tenant|company|user', async () => {
    loads += 1;
    await delay(40);
    return loads;
  }, options);
  assert.deepEqual(stale, { value: 1, state: 'STALE' });

  const coalesced = new ReadThroughCache<number>();
  let parallelLoads = 0;
  const parallelLoader = async () => { parallelLoads += 1; await delay(10); return 7; };
  const values = await Promise.all([
    coalesced.get('same', parallelLoader, options),
    coalesced.get('same', parallelLoader, options),
    coalesced.get('same', parallelLoader, options),
  ]);
  assert.equal(parallelLoads, 1);
  assert.deepEqual(values.map((item) => item.value), [7, 7, 7]);
  process.stdout.write('ReadThroughCache: PASS\n');
}

main().catch((error) => {
  process.stderr.write(`${error?.stack || error}\n`);
  process.exitCode = 1;
});
