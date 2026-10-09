import assert from 'node:assert/strict';
import express from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../src/config/database';
import { financeRouter } from '../src/modules/finance/finance.routes';
import { DEFAULT_COA, FinanceService } from '../src/modules/finance/finance.service';
import { errorHandler } from '../src/middlewares/error.middleware';
import { assertRecordMutable } from '../src/utils/crud-factory';
import { parseRoleCode } from '../src/types/roles';

async function main() {
  const db = prisma as any;
  // Deny every unconfigured persistence call; no ERP database is contacted.
  for (const model of Prisma.dmmf.datamodel.models) {
    const delegate = db[model.name[0].toLowerCase() + model.name.slice(1)];
    for (const method of ['findFirst', 'findUnique', 'findMany', 'count', 'create', 'createMany', 'update', 'updateMany', 'delete']) {
      delegate[method] = async () => { throw new Error(`Unexpected DB call ${model.name}.${method}`); };
    }
  }
  const initial = () => ({
    payment: { id: 'receipt-a', tenant_id: 'tenant-a', company_id: 'company-a', payment_type: 'CUSTOMER_RECEIPT', status: 'DRAFT', amount: '1000000', payment_date: new Date('2026-10-08'), reference_number: 'REF-1', payment_method: 'BANK_TRANSFER', bank_account_id: 'bank-a', created_by_id: 'maker', allocation_plan: { customer_name: 'PT QA', project_name: 'QA', invoice_id: 'invoice-a', invoice_ref: 'INV-1' } } as any,
    bill: { id: 'invoice-a', tenant_id: 'tenant-a', company_id: 'company-a', billing_type: 'CUSTOMER_INVOICE', status: 'POSTED', invoice_number: 'INV-1', party_id: 'customer-a', currency_id: 'idr', total_amount: '1500000', paid_amount: '0', outstanding_amount: '1500000', payment_status: 'UNPAID' } as any,
    bank: { id: 'bank-a', tenant_id: 'tenant-a', company_id: 'company-a', ledger_account_id: 'ledger-bank', currency_id: 'idr', status: 'ACTIVE' } as any,
    entries: [] as any[], lines: [] as any[], allocations: [] as any[], documents: [] as any[], periodStatus: 'OPEN', failBill: false,
  });
  let state = initial();
  const accounts = DEFAULT_COA.map(row => ({ id: `coa-${row.code}`, account_code: row.code, account_type: row.type, normal_balance: row.balance, status: 'ACTIVE', company_id: 'company-a' }));
  const bankLedger = { id: 'ledger-bank', account_type: 'ASSET', normal_balance: 'DEBIT', status: 'ACTIVE', company_id: 'company-a' };
  const scoped = (where: any, row: any) => Object.entries(where).every(([key, value]: any) => {
    if (value && typeof value === 'object' && 'in' in value) return value.in.includes(row[key]);
    return row[key] === value;
  });
  db.$transaction = async (callback: any, options: any) => {
    assert.equal(options.isolationLevel, Prisma.TransactionIsolationLevel.Serializable);
    const snapshot = JSON.parse(JSON.stringify(state)); snapshot.payment.payment_date = new Date(snapshot.payment.payment_date);
    try { return await callback(db); } catch (error) { state = snapshot; throw error; }
  };
  db.fin_payment.findFirst = async ({ where }: any) => scoped(where, state.payment) ? state.payment : null;
  db.fin_payment.findMany = async ({ where }: any) => scoped(where, state.payment) ? [state.payment] : [];
  db.fin_payment.update = async ({ data }: any) => state.payment = { ...state.payment, ...data };
  db.fin_payment.updateMany = async ({ where, data }: any) => {
    if (!scoped(where, state.payment)) return { count: 0 };
    state.payment = { ...state.payment, ...data }; return { count: 1 };
  };
  db.fin_bank_account.findFirst = async ({ where }: any) => scoped(where, state.bank) ? state.bank : null;
  db.core_company.findFirst = async () => ({ id: 'company-a', base_currency_id: 'idr' });
  db.fin_account.findFirst = async ({ where }: any) => [...accounts, bankLedger].find(account => scoped(where, account)) ?? null;
  db.fin_payment_allocation.findMany = async () => state.allocations;
  db.fin_payment_allocation.create = async ({ data }: any) => { state.allocations.push(data); return data; };
  db.fin_billing_document.findMany = async ({ where }: any) => scoped(where, state.bill) ? [state.bill] : [];
  db.fin_billing_document.findFirst = async ({ where }: any) => scoped(where, state.bill) ? state.bill : null;
  db.fin_billing_document.update = async ({ data }: any) => { if (state.failBill) throw new Error('fixture failure'); return state.bill = { ...state.bill, ...data }; };
  db.fin_fiscal_period.findFirst = async () => ({ id: 'period-a', status: state.periodStatus, period_number: 10 });
  db.fin_journal.findFirst = async () => ({ id: 'journal-a' });
  db.core_business_document.findFirst = async () => state.documents[0] ?? null;
  db.core_business_document.create = async ({ data }: any) => { state.documents.push(data); return data; };
  db.core_business_document.update = async ({ data }: any) => Object.assign(state.documents[0], data);
  db.fin_journal_entry.create = async ({ data }: any) => { state.entries.push(data); return data; };
  db.fin_journal_entry.findMany = async () => state.entries;
  db.fin_journal_line.createMany = async ({ data }: any) => { state.lines.push(...data); return { count: data.length }; };
  db.fin_journal_line.findMany = async ({ where }: any) => state.lines.filter(line => scoped(where, line));
  db.iam_role.findMany = async () => [{ id: 'finance-role' }];
  db.iam_user_role.count = async () => 2;
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => {
    req.companyId = String(req.headers['x-company'] ?? 'company-a');
    const role = parseRoleCode(String(req.headers['x-role'] ?? 'ROLE-FINANCE'));
    req.user = { id: String(req.headers['x-actor'] ?? 'maker'), tenant_id: 'tenant-a', roles: [role], active_role_code: role } as any; next();
  });
  app.use('/finance', financeRouter); app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}/finance`;
  const request = (path: string, method = 'POST', actor = 'checker', role = 'ROLE-FINANCE', body = {}, company = 'company-a') => fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', 'x-actor': actor, 'x-role': role, 'x-company': company }, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) });
  const post = () => request('/customer-receipts/receipt-a/post');
  const ready = async (actor: string, role = 'ROLE-FINANCE') => (await (await request('/customer-receipts/workflow-readiness?ids=receipt-a', 'GET', actor, role)).json() as any)[0];
  try {
    assert.equal((await post()).status, 409, 'Draft cannot skip workflow');
    assert.equal((await request('/customer-receipts/receipt-a/approve-and-post')).status, 409);
    assert.equal((await ready('maker')).action, 'submit');
    assert.equal((await ready('checker')).allowed, false);
    assert.equal((await request('/payments/receipt-a/submit', 'POST', 'checker')).status, 403);
    assert.equal((await request('/payments/receipt-a/submit', 'POST', 'maker')).status, 200);
    assert.equal(state.payment.status, 'SUBMITTED');
    assert.equal((await ready('maker')).allowed, false);
    assert.equal((await request('/payments/receipt-a/approve', 'POST', 'maker')).status, 403);
    assert.equal((await ready('checker')).action, 'approve-and-post');
    assert.equal((await ready('checker')).allowed, true);
    assert.equal((await request('/customer-receipts/receipt-a/approve-and-post', 'POST', 'maker')).status, 403);
    assert.equal((await ready('maker')).allowed, false);
    assert.equal((await request('/customer-receipts/receipt-a/post', 'POST', 'maker')).status, 403);
    assert.equal((await request('/customer-receipts/receipt-a/post', 'POST', 'director', 'ROLE-DIRECTOR')).status, 403);
    assert.equal((await request('/customer-receipts/receipt-a/approve-and-post', 'POST', 'director', 'ROLE-DIRECTOR')).status, 403);
    const response = await request('/customer-receipts/receipt-a/approve-and-post'); assert.equal(response.status, 200, await response.clone().text());
    assert.equal(state.payment.status, 'POSTED'); assert.equal(state.entries.length, 1); assert.equal(state.lines.length, 2);
    assert.equal(state.payment.approved_by_id, 'checker'); assert.equal(state.payment.executed_by_id, 'checker');
    assert.equal(new Set([state.payment.created_by_id, state.payment.submitted_by_id, state.payment.approved_by_id, state.payment.executed_by_id]).size, 2, 'Exactly two Finance actors complete the workflow');
    assert.equal(state.lines[0].account_id, 'ledger-bank'); assert.equal(Number(state.lines[0].debit_base), 1000000); assert.equal(Number(state.lines[0].credit_base), 0);
    assert.equal(state.lines[1].account_id, 'coa-1130'); assert.equal(Number(state.lines[1].credit_base), 1000000); assert.equal(Number(state.lines[1].debit_base), 0);
    assert.equal(Number(state.bill.paid_amount), 1000000); assert.equal(Number(state.bill.outstanding_amount), 500000); assert.equal(state.bill.payment_status, 'PARTIALLY_PAID');
    assert.equal(state.documents[0].status, 'POSTED'); assert.equal(state.payment.payment_date.toISOString().slice(0, 10), '2026-10-08');
    assert.equal((await FinanceService.getBankAccountBalance('bank-a', 'company-a')).balance, 1000000);
    assert.equal((await post()).status, 200); assert.equal(state.entries.length, 1); assert.equal(state.allocations.length, 1); assert.equal(Number(state.bill.paid_amount), 1000000);
    assert.equal((await request('/customer-receipts/receipt-a/approve-and-post')).status, 200); assert.equal(state.entries.length, 1); assert.equal(state.allocations.length, 1);
    assert.equal((await request('/customer-receipts/receipt-a/approve-and-post', 'POST', 'maker')).status, 403);
    for (const status of ['SUBMITTED', 'APPROVED', 'POSTED']) assert.throws(() => assertRecordMutable('fin_payment', { status }));
    for (const failure of ['closed', 'posting-write']) {
      state = initial(); state.payment.status = 'SUBMITTED'; state.payment.submitted_by_id = 'maker';
      if (failure === 'closed') state.periodStatus = 'CLOSED'; else state.failBill = true;
      const rejected = await request('/customer-receipts/receipt-a/approve-and-post'); assert(rejected.status >= 400);
      assert.equal(state.payment.status, 'SUBMITTED'); assert.equal(state.payment.approved_by_id, undefined);
      assert.equal(state.entries.length, 0); assert.equal(state.lines.length, 0); assert.equal(state.allocations.length, 0); assert.equal(state.documents.length, 0);
    }
    state = initial(); state.payment.status = 'SUBMITTED'; state.payment.submitted_by_id = 'maker';
    assert.equal((await request('/payments/receipt-a/approve')).status, 200);
    assert.equal((await ready('checker')).allowed, true, 'The same Finance checker can post an already-approved receipt');
    assert.equal((await post()).status, 200); assert.equal(state.payment.executed_by_id, state.payment.approved_by_id);
    state = initial(); state.payment.status = 'SUBMITTED'; state.payment.submitted_by_id = 'checker';
    assert.equal((await request('/customer-receipts/receipt-a/approve-and-post')).status, 200, 'Legacy receipts submitted by a non-maker still do not require a third Finance');
    state = initial(); state.payment.status = 'SUBMITTED'; state.payment.submitted_by_id = 'maker';
    assert.equal((await ready('director', 'ROLE-DIRECTOR')).allowed, true);
    assert.equal((await request('/payments/receipt-a/approve', 'POST', 'director', 'ROLE-DIRECTOR')).status, 200);
    assert.equal((await post()).status, 200, 'Existing Director approval remains compatible');
    for (const scenario of ['advance', 'full', 'closed', 'overpay', 'missing-bank', 'wrong-invoice', 'foreign-currency', 'failure', 'outgoing']) {
      state = initial(); state.payment.status = 'APPROVED';
      if (scenario === 'advance') state.payment.allocation_plan = { customer_name: 'PT QA', project_name: 'QA' };
      if (scenario === 'full') state.bill.total_amount = '1000000';
      if (scenario === 'closed') state.periodStatus = 'CLOSED';
      if (scenario === 'overpay') state.bill.paid_amount = '1000000';
      if (scenario === 'missing-bank') state.bank.company_id = 'other-company';
      if (scenario === 'wrong-invoice') state.bill.billing_type = 'SUPPLIER_INVOICE';
      if (scenario === 'foreign-currency') state.bank.currency_id = 'usd';
      if (scenario === 'failure') state.failBill = true;
      if (scenario === 'outgoing') state.payment.payment_type = 'OUTGOING';
      const response = await post();
      if (['advance', 'full'].includes(scenario)) {
        assert.equal(response.status, 200, await response.clone().text());
        if (scenario === 'advance') { assert.equal(state.lines[1].account_id, 'coa-2140'); assert.equal(state.bill.paid_amount, '0'); }
        else { assert.equal(state.bill.payment_status, 'PAID'); assert.equal(Number(state.bill.outstanding_amount), 0); }
      } else {
        assert(response.status >= 400, scenario); assert.equal(state.payment.status, 'APPROVED'); assert.equal(state.entries.length, 0); assert.equal(state.lines.length, 0); assert.equal(state.allocations.length, 0);
      }
    }
    state = initial(); state.payment.status = 'APPROVED';
    assert.equal((await request('/payments/receipt-a/execute', 'POST', 'poster', 'ROLE-FINANCE', { execution_reference: 'REF-1' })).status, 400);
    assert.equal(state.entries.length, 0);
    assert.equal((await request('/customer-receipts/receipt-a/post', 'POST', 'poster', 'ROLE-FINANCE', {}, 'other-company')).status, 404);
    console.log('PASS: exactly two Finance actors complete receipt submission and atomic approval/posting; self processing is denied, legacy approvals remain compatible, failed posting rolls back approval, retry is idempotent, and bank/AR accounting and scope remain intact. Persistence uses fixtures.');
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
