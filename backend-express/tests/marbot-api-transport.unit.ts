import assert from 'node:assert/strict';
import express from 'express';
import { callResourceApi } from '../src/modules/marbot/marbot-resource.service';
import { executeCanonicalAction } from '../src/modules/marbot/marbot-execution.service';

async function main() {
  const app = express();
  const rows = new Map<string, any>();
  let writes = 0;
  app.use(express.json());
  app.use((req, res, next) => {
    if (req.headers.authorization !== 'Bearer actor') { res.status(401).json({ error: 'auth' }); return; }
    if (req.headers['x-company-id'] !== 'company-a') { res.status(403).json({ error: 'scope' }); return; }
    assert.equal(req.headers['x-forwarded-host'], undefined);
    next();
  });
  app.get('/api/v1/projects/projects/', (_req, res) => res.json({ count: rows.size, results: [...rows.values()] }));
  app.post('/api/v1/projects/projects/', async (req, res) => {
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(req.headers['idempotency-key'], 'marbot-ticket');
    writes++;
    const row = { id: 'project-a', ...req.body, status: 'PLANNED' };
    rows.set(row.id, row); res.status(201).json(row);
  });
  app.get('/api/v1/projects/projects/:id/', (req, res) => res.json(rows.get(req.params.id)));
  // Passenger/serverless requests need not expose a listening TCP port.
  const req = { app, socket: {}, headers: { authorization: 'Bearer actor', 'x-forwarded-host': 'evil.invalid' }, companyId: 'company-a' } as any;
  const empty = await callResourceApi(req, '/api/v1/projects/projects/');
  assert.equal(empty.count, 0);
  const answer = await executeCanonicalAction(req, { kind: 'project.create', payload: { project_name: 'Socketless agent', customer_name: 'QA', manager_name: 'Manager' } }, 'ticket');
  assert.match(answer, /project-a/); assert.equal(writes, 1);
  assert.equal((await callResourceApi(req, '/api/v1/projects/projects/')).count, 1);
  await assert.rejects(() => callResourceApi({ ...req, companyId: 'company-b' }, '/api/v1/projects/projects/'), /403/);
  await assert.rejects(() => callResourceApi({ ...req, headers: {} }, '/api/v1/projects/projects/'));
  console.log('PASS: socketless canonical resource read, confirmed action/readback, authentication and company scope remain enforced.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
