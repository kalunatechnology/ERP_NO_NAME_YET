import assert from 'node:assert/strict';
import express from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../src/config/database';
import { financeRouter } from '../src/modules/finance/finance.routes';
import { errorHandler } from '../src/middlewares/error.middleware';

async function main() {
  const db = prisma as any;
  // Every persistence operation is a fixture; this test never connects to ERP data.
  for (const model of Prisma.dmmf.datamodel.models) {
    const delegate = db[model.name[0].toLowerCase() + model.name.slice(1)];
    for (const method of ['findFirst', 'findUnique', 'findMany', 'count', 'create', 'update', 'delete']) {
      delegate[method] = async () => { throw new Error(`Unexpected database call: ${model.name}.${method}`); };
    }
  }
  let writes = 0;
  db.fin_bank_account.findFirst = async ({ where }: any) => {
    assert.equal(where.company_id, 'company-a'); assert.equal(where.tenant_id, 'tenant-a'); assert.equal(where.status, 'ACTIVE');
    return where.id === 'bank-a' ? { id:'bank-a',account_name:'Kas QA',bank_name:'QA Bank',account_number:'123' } : null;
  };
  db.fin_payment.create = async ({ data }: any) => {
    writes++; assert.equal(data.company_id,'company-a'); assert.equal(data.tenant_id,'tenant-a');
    assert.equal(data.status,'DRAFT'); assert.equal(data.payment_type,'CUSTOMER_RECEIPT'); assert.equal(data.bank_account_id,'bank-a');
    return { ...data,id:'receipt-a' };
  };
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { req.companyId='company-a'; req.user={id:'finance-a',tenant_id:'tenant-a',roles:['ROLE-FINANCE'],active_role_code:'ROLE-FINANCE'} as any; next(); });
  app.use('/finance',financeRouter); app.use(errorHandler);
  const server = app.listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${(server.address() as any).port}/finance/customer-receipts/`;
  const post=(body: any)=>fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const valid={amount:250000,bank_account_id:'bank-a',payment_date:'2026-10-08',payment_method:'BANK_TRANSFER',reference_number:'  QA-REF  ',allocation_plan:{customer_name:'  PT QA  ',project_name:' Project QA ',invoice_ref:'',notes:''}};
  try {
    const empty=await post({}); assert.equal(empty.status,400);
    const emptyBody=await empty.json() as any;
    for(const field of ['customer_name','project_name','amount','bank_account','payment_date','reference_number','payment_method']) assert.equal(typeof emptyBody.errors[field],'string');
    for(const amount of [0,-1,999,null,'','not-a-number']) assert.equal((await post({...valid,amount})).status,400);
    assert.equal((await post({...valid,payment_date:'2026-02-31'})).status,400);
    const missingBank=await post({...valid,bank_account_id:'other-company-bank'}); assert.equal(missingBank.status,400); assert((await missingBank.json() as any).errors.bank_account);
    const oldPayload=await post({...valid,status:'RECEIVED',execution_reference:'',execution_note:'',failure_reason:''}); assert.equal(oldPayload.status,400);
    assert.match((await oldPayload.json() as any).detail,/lifecycle/); assert.equal(writes,0);
    const success=await post(valid); assert.equal(success.status,201,await success.clone().text());
    const saved=await success.json() as any; assert.equal(saved.status,'DRAFT'); assert.equal(saved.amount,250000); assert.equal(saved.reference_number,'QA-REF');
    assert.equal(saved.allocation_plan.customer_name,'PT QA'); assert.equal(saved.allocation_plan.bank_account,'Kas QA'); assert.equal(writes,1);
    console.log('PASS: real receipt HTTP route validates all required fields, amounts/date/scoped bank, rejects old lifecycle payload, and saves valid scoped Draft through generic CRUD with fixture persistence.');
  } finally { server.closeAllConnections(); await new Promise<void>(resolve=>server.close(()=>resolve())); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
