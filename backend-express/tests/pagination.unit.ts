import assert from 'node:assert/strict';
import { Request } from 'express';
import { paginateCursor, parsePagination } from '../src/utils/response';

function request(query: Record<string, string> = {}): Request {
  return {
    query,
    protocol: 'https',
    path: '/api/v1/projects/projects/',
    get: (name: string) => name.toLowerCase() === 'host' ? 'erp.example.test' : undefined,
  } as unknown as Request;
}

const negative = parsePagination(request({ page: '-9', page_size: '-100' }));
assert.equal(negative.page, 1);
assert.equal(negative.pageSize, 1);
assert.equal(negative.skip, 0);

const normal = parsePagination(request({ page: '3', page_size: '20' }));
assert.deepEqual(normal, { page: 3, pageSize: 20, skip: 40 });

const cursorPage = paginateCursor(
  request({ cursor: 'old-id', page_size: '2', search: 'pump' }),
  [{ id: 'new-1' }, { id: 'new-2' }, { id: 'lookahead' }],
  12,
  2,
  true,
);
assert.equal(cursorPage.count, 12);
assert.deepEqual(cursorPage.results, [{ id: 'new-1' }, { id: 'new-2' }]);
assert.equal(cursorPage.previous, null);
assert.match(cursorPage.next ?? '', /cursor=new-2/);
assert.match(cursorPage.next ?? '', /search=pump/);
assert.doesNotMatch(cursorPage.next ?? '', /cursor=old-id/);

const finalPage = paginateCursor(request({ cursor: 'new-2' }), [{ id: 'final' }], 3, 20, false);
assert.equal(finalPage.next, null);

console.log(JSON.stringify({ suite: 'pagination.unit', passed: 12, failed: 0 }));
