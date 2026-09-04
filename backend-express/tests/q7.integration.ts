/**
 * File: backend-express/tests/q7.integration.ts
 *
 * Purpose: Implements integration verification responsibilities in the backend application.
 * Responsibility: Owns the contracts declared here and connects them to framework discovery or explicit imports without changing unrelated domain state.
 * Integration: Consumers reach this file through static imports, framework conventions, or an explicit script entry point.
 * Dependencies and side effects: Function-level documentation identifies HTTP, database, browser-state, and security effects where they occur.
 */
import assert from 'node:assert/strict';
import prisma from '../src/config/database';

const BASE = process.env.Q7_BASE_URL ?? 'http://localhost:8001';
const PASSWORD = process.env.Q7_DEMO_PASSWORD ?? 'DummyPass123!';

/**
 * main implements this file's named function contract.
 *
 * @param input - Uses the typed parameters declared by the signature.
 * @returns The value or Promise declared by the implementation.
 * Database: reads or mutates `iam_company_module_access` exactly as shown; no wider transaction is implied.
 * Failure/side effects: propagates validation, authorization, persistence, or dependency failures according to the existing caller contract.
 */
async function main() {
  const loginResponse = await fetch(`${BASE}/api/v1/auth/token`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'finance.lead@arsalynk.id', password: PASSWORD }),
  });
  assert.equal(loginResponse.status, 200);
  const login = await loginResponse.json() as any;
  const companyId = login.user.company_id as string;
  const entitlement = await prisma.iam_company_module_access.findUniqueOrThrow({
    where: { company_id_module_code: { company_id: companyId, module_code: 'FINANCE' } },
  });
  let createdId: string | undefined;

/**
 * call implements this file's named function contract.
 *
 * @param input - Uses the typed parameters declared by the signature.
 * @returns The value or Promise declared by the implementation.
 * Database: reads or mutates `iam_company_module_access`, `fin_billing_document` exactly as shown; no wider transaction is implied.
 * Failure/side effects: propagates validation, authorization, persistence, or dependency failures according to the existing caller contract.
 */
  const call = (path: string, method: string, body: unknown, key: string) => fetch(`${BASE}${path}`, {
    method,
    headers: { authorization: `Bearer ${login.access}`, 'content-type': 'application/json', 'idempotency-key': key },
    body: JSON.stringify(body),
  });

  try {
    await prisma.iam_company_module_access.update({ where: { id: entitlement.id }, data: { enabled: true, allow_read: true, allow_write: true } });
    const key = `Q7-TEST-${crypto.randomUUID()}`;
    const payload = {
      billing_type: 'SUPPLIER_INVOICE', invoice_number: `Q7-TEST-${Date.now()}`,
      subtotal: 100000, tax_amount: 11000, total_amount: 111000,
      paid_amount: 0, outstanding_amount: 111000, payment_status: 'UNPAID', status: 'DRAFT', rejection_reason: '',
    };
    const first = await call('/api/v1/finance/billing-documents/', 'POST', payload, key);
    assert.equal(first.status, 201);
    const firstBody = await first.json() as any;
    createdId = firstBody.id;

    const replay = await call('/api/v1/finance/billing-documents/', 'POST', payload, key);
    assert.equal(replay.status, 201);
    assert.equal(replay.headers.get('x-idempotent-replay'), 'true');
    assert.equal((await replay.json() as any).id, createdId);

    const mismatch = await call('/api/v1/finance/billing-documents/', 'POST', { ...payload, total_amount: 222000 }, key);
    assert.equal(mismatch.status, 409);

    const missingKey = await fetch(`${BASE}/api/v1/finance/billing-documents/`, {
      method: 'POST', headers: { authorization: `Bearer ${login.access}`, 'content-type': 'application/json' }, body: JSON.stringify(payload),
    });
    assert.equal(missingKey.status, 400);

    const posted = await call(`/api/v1/finance/billing-documents/${createdId}/`, 'PATCH', { status: 'POSTED' }, `Q7-TEST-${crypto.randomUUID()}`);
    assert.equal(posted.status, 200);
    const blockedDelete = await call(`/api/v1/finance/billing-documents/${createdId}/`, 'DELETE', {}, `Q7-TEST-${crypto.randomUUID()}`);
    assert.equal(blockedDelete.status, 409);

    const duplicates = await prisma.fin_billing_document.count({ where: { invoice_number: payload.invoice_number } });
    assert.equal(duplicates, 1);
    console.log(JSON.stringify({ passed: 6, failed: 0, replayed_record_id: createdId, duplicates }, null, 2));
  } finally {
    if (createdId) await prisma.fin_billing_document.deleteMany({ where: { id: createdId } });
    await prisma.iam_company_module_access.update({ where: { id: entitlement.id }, data: {
      enabled: entitlement.enabled, allow_read: entitlement.allow_read, allow_write: entitlement.allow_write,
      source: entitlement.source, effective_from: entitlement.effective_from, effective_until: entitlement.effective_until,
      enabled_by_id: entitlement.enabled_by_id,
    } });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
