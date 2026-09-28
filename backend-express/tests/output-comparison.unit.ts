import assert from 'node:assert/strict';
import { compareTaskOutput } from '../src/modules/projects/output-comparison';

const exact = compareTaskOutput(
  'Laporan penjualan September dalam format PDF',
  'Laporan penjualan September dalam format PDF',
);
assert.equal(exact.score, 100);
assert.equal(exact.category, 'SUFFICIENTLY_ALIGNED');

const related = compareTaskOutput(
  'Laporan penjualan September dalam format PDF yang sudah direview',
  'Laporan penjualan September format PDF sudah selesai dibuat dan direview oleh supervisor',
);
assert.equal(related.category, 'SUFFICIENTLY_ALIGNED');

const unrelated = compareTaskOutput(
  'Laporan penjualan September dalam format PDF',
  'Mengatur ulang kata sandi akun email kantor',
);
assert.equal(unrelated.category, 'QUESTIONABLE');

const missing = compareTaskOutput('Laporan penjualan September', '');
assert.deepEqual(missing, { score: 0, category: 'NOT_EVALUATED' });

console.log('output-comparison.unit: ok');
