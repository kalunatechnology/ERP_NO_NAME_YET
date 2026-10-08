const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

async function main() {
  const frontend = path.resolve(__dirname, '../../frontend-next');
  const fixtureDir = path.join(frontend, 'app', 'minor-forms-fixture');
  assert(!fs.existsSync(fixtureDir), 'Never overwrite an existing route');
  fs.mkdirSync(fixtureDir);
  const fixtureFile = path.join(fixtureDir, 'page.tsx');
  fs.writeFileSync(fixtureFile, '"use client";\nimport { Suspense } from "react";\nimport dynamic from "next/dynamic";\nimport { useSearchParams } from "next/navigation";\nconst Finance = dynamic(() => import("@/app/(app)/finance/FinanceClient"), {ssr:false});\nconst Projects = dynamic(() => import("@/app/(app)/projects/ProjectsClient"), {ssr:false});\nconst Tasks = dynamic(() => import("@/app/(app)/tasks/TasksClient"), {ssr:false});\nfunction Surface(){const surface=useSearchParams().get("surface");return surface==="finance"?<Finance/>:surface==="tasks"?<Tasks/>:<Projects/>;}\nexport default function Fixture(){return <Suspense><Surface/></Suspense>;}');
  let app, server, browser;
  try {
    const { chromium } = require(path.join(process.env.MARBOT_TEST_RUNTIME_PACKAGES, 'playwright'));
    const next = require(path.join(frontend, 'node_modules/next'));
    process.chdir(frontend);
    app = next({ dev: true, dir: frontend, hostname: '127.0.0.1', port: 3013 });
    await app.prepare();
    server = http.createServer(app.getRequestHandler());
    await new Promise(resolve => server.listen(3013, '127.0.0.1', resolve));
    browser = await chromium.launch({ headless: true, channel: 'msedge' });
    const page = await browser.newPage({ viewport: { width: 1366, height: 1000 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const artifacts = path.resolve(frontend, '../.tmp/minor-forms-20261008');
    fs.mkdirSync(artifacts, { recursive: true });
    let role = 'ROLE-FINANCE';
    const actorId = '20000000-0000-0000-0000-000000000099';
    const company = '10000000-0000-0000-0000-000000000099';
    const profile = () => ({ id: actorId, email: 'forms@qa.invalid', full_name: 'Forms QA', company_id: company, active_role_code: role, enabled_modules: ['PROJECTS','FINANCE'], delegated_modules: role === 'ROLE-SUPERVISOR' ? ['PROJECTS'] : [], roles: [{role_code: role, company_id: company}] });
    const projects = [{ id: 'a', project_name: 'Project A', project_code: 'A', customer_name: 'QA', manager_name: 'Forms QA', status: 'IN_PROGRESS', progress: 0 }];
    const mainTasks = [{ id: 'main-a', project_id: 'a', title: 'Main A', name: 'Main A', weight: 100, status: 'PLANNED' }];
    const assignments = [{ id:'assign-a', main_task_id:'main-a', assignee_id:actorId, assignee_name:'Forms QA' }];
    const weeklyTasks = [{ id: 'week-a', main_task_id: 'main-a', assignee_id: actorId, week_number: 1, target_description: 'Approved target', status: 'PLANNED', progress: 0 }];
    const dailyTasks = [], fundings = [], costs = [], mainBodies = [], projectBodies = [];
    const receipts=[];
    let receiptPosts=0, receiptFailure=false, banksAvailable=true;
    const bundle = () => ({ projects, mainTasks, assignments, weeklyTasks, dailyTasks, tasks:[], milestones:[], stages:[], costEntries:[], proposals:[], fundings:[], users:[] });
    const token = `e30.${Buffer.from(JSON.stringify({exp:4102444800})).toString('base64url')}.fixture`;
    await page.context().addCookies([{name:'access_token',value:token,url:'http://127.0.0.1:3013'}]);
    await page.addInitScript(({token,company,user}) => {localStorage.setItem('erp.access',token);localStorage.setItem('erp.company',company);localStorage.setItem('erp.user',JSON.stringify(user));}, {token,company,user:profile()});
    await page.route('**/api/v1/**', async route => {
      const req = route.request(), endpoint = new URL(req.url()).pathname;
      const json = data => route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
      if (endpoint.includes('/auth/me')) return json(profile());
      if (endpoint.includes('/dashboard/bootstrap')) return json({data:{projects:bundle()}});
      if (endpoint.endsWith('/authority')) return json({project_id:'a',can_manage_project:true,can_manage_wbs:true,can_manage_weekly_tasks:true,can_view_financials:true,can_assign_team:false,is_acting_project_manager:role==='ROLE-SUPERVISOR'});
      if (endpoint.endsWith('/supervisor')) return json(null);
      if (endpoint.endsWith('/project-options')) return json(projects);
      if (endpoint.replace(/\/$/,'') === '/api/v1/finance/bank-accounts') return json({results:banksAvailable?[{id:'bank-a',account_name:'Kas QA',account_number:'123',status:'ACTIVE'}]:[]});
      if (endpoint.replace(/\/$/,'') === '/api/v1/finance/customer-receipts') {
        if(req.method()==='POST') {
          receiptPosts++; const body=req.postDataJSON();
          for(const field of ['status','execution_reference','execution_note','failure_reason']) assert(!(field in body),'Receipt must not write lifecycle fields');
          assert.equal(body.bank_account_id,'bank-a'); assert.equal(body.payment_type,'CUSTOMER_RECEIPT');
          if(receiptFailure) return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({detail:'Rekening penerima tidak tersedia atau tidak aktif pada company ini.',errors:{bank_account:'Pilih rekening kas / bank yang aktif pada company Anda.'}})});
          const row={...body,id:'receipt-a',status:'DRAFT'}; receipts.push(row); return json(row);
        }
        return json({results:receipts});
      }
      if (endpoint.includes('/core/organizations')) return json({results:[{id:'division-a',name:'Engineering',organization_name:'Engineering',status:'ACTIVE'}]});
      for (const [suffix, rows] of [['project-fundings',fundings],['project-cost-entries',costs]]) {
        if (endpoint.replace(/\/$/,'') === `/api/v1/finance/${suffix}`) {
          if (req.method()==='POST') {const row={...req.postDataJSON(),id:`${suffix}-${rows.length}`,status:'DRAFT'};rows.push(row);return json(row);}
          return json({results:rows});
        }
      }
      for (const [suffix, rows] of [['projects',projects],['main-tasks',mainTasks],['task-assignments',assignments],['weekly-tasks',weeklyTasks],['daily-tasks',dailyTasks]]) {
        if (endpoint.replace(/\/$/,'') === `/api/v1/projects/${suffix}`) {
          if (req.method()==='POST') {
            const body = req.postDataJSON();
            if(suffix==='main-tasks') mainBodies.push(body);
            if(suffix==='projects') projectBodies.push(body);
            const row={...body,id:`new-${suffix}-${rows.length}`,project_id:body.project_id||body.project,main_task_id:body.main_task_id||body.main_task,weekly_task_id:body.weekly_task_id||body.weekly_task,owner_id:actorId,name:body.title,project_name:body.project_name||body.name,project_code:body.project_code||body.code};
            rows.push(row); return json(row);
          }
          return json({results:rows});
        }
      }
      return json({results:[]});
    });
    const origin = 'http://127.0.0.1:3013/minor-forms-fixture';
    const clearZero = async input => {await input.fill('0');await input.fill('');assert.equal(await input.inputValue(),'');};
    await page.goto(`${origin}?surface=finance&tab=fundings`,{waitUntil:'networkidle',timeout:120000});
    await page.getByRole('button',{name:'Request Dana',exact:true}).click();
    let dialog=page.getByRole('dialog');
    await clearZero(dialog.getByLabel('Jumlah Dana (Rp) *',{exact:true}));
    await dialog.getByLabel('Jumlah Dana (Rp) *',{exact:true}).fill('250000');
    await dialog.getByLabel('Jenis Kebutuhan *',{exact:true}).selectOption('Pengadaan Vendor dan Mitra Proyek');
    assert.equal(await dialog.locator('textarea').inputValue(),'','Selecting a need must not fill its detail');
    await dialog.getByLabel('Jenis Kebutuhan *',{exact:true}).selectOption('Lainnya');
    assert.equal(await dialog.locator('textarea').inputValue(),'');
    await dialog.getByRole('button',{name:'Ajukan Request Dana',exact:true}).click();
    assert.equal(fundings.length,0,'Other requires a manual explanation');
    await dialog.getByLabel('Keterangan Kebutuhan Lainnya *',{exact:true}).fill('Sewa alat survei tambahan');
    assert.equal(await dialog.getByLabel('Jenis Kebutuhan *',{exact:true}).inputValue(),'Lainnya');
    await dialog.screenshot({path:path.join(artifacts,'funding.png')});
    await dialog.getByRole('button',{name:'Ajukan Request Dana',exact:true}).click();
    await dialog.waitFor({state:'hidden'});
    assert.equal(fundings[0].requested_amount,250000);assert.equal(fundings[0].purpose,'Lainnya\nSewa alat survei tambahan');
    assert.equal(fundings[0].funding_type,'INTERNAL','Need category must not change the financing source');
    await page.getByText('Lainnya\nSewa alat survei tambahan',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Request Dana',exact:true}).click();
    assert.equal(await dialog.getByLabel('Jumlah Dana (Rp) *',{exact:true}).inputValue(),'');
    assert.equal(await dialog.locator('textarea').inputValue(),'');await page.keyboard.press('Escape');
    await page.goto(`${origin}?surface=finance&tab=costing`,{waitUntil:'networkidle'});
    await page.getByRole('button',{name:'Catat Biaya',exact:true}).click();
    dialog=page.getByRole('dialog');
    await dialog.getByRole('button',{name:'Simpan & Catat Biaya'}).click();assert.equal(costs.length,0);
    await dialog.locator('select').first().selectOption('a');
    await clearZero(dialog.getByLabel('Jumlah Biaya (Rp) *',{exact:true}));
    await dialog.getByLabel('Jumlah Biaya (Rp) *',{exact:true}).fill('175000');
    await dialog.getByLabel('Deskripsi Pengeluaran *',{exact:true}).fill('Pembelian material');
    await dialog.getByRole('button',{name:'Simpan & Catat Biaya'}).click();await dialog.waitFor({state:'hidden'});
    assert.equal(costs[0].total_cost,175000);assert.equal(costs[0].description,'Pembelian material');
    await page.goto(`${origin}?surface=finance&tab=ar`,{waitUntil:'networkidle'});
    await page.getByRole('button',{name:'Catat Uang Masuk (Customer Payment)',exact:true}).click(); dialog=page.getByRole('dialog');
    await dialog.getByLabel('Tanggal Terima Dana *',{exact:true}).fill('');
    await dialog.getByRole('button',{name:'Konfirmasi & Simpan Penerimaan',exact:true}).click();
    for(const field of ['customer_name','project_name','amount','bank_account','payment_date','reference_number']) await dialog.locator(`#receipt-${field}-error`).waitFor();
    assert.equal(receiptPosts,0,'Empty receipt must not call API');
    await dialog.screenshot({path:path.join(artifacts,'receipt-required-warnings.png')});
    await dialog.getByLabel('Nama Klien / Perusahaan *',{exact:true}).fill('   ');
    await dialog.getByRole('button',{name:'Konfirmasi & Simpan Penerimaan',exact:true}).click(); assert.equal(receiptPosts,0);
    await dialog.getByLabel('Nama Klien / Perusahaan *',{exact:true}).fill('PT QA');
    await dialog.getByLabel('Nama Proyek Terkait *',{exact:true}).fill('Project QA');
    await clearZero(dialog.getByLabel('Nominal Uang Masuk (Rp) *',{exact:true}));
    await dialog.getByLabel('Nominal Uang Masuk (Rp) *',{exact:true}).fill('999');
    await dialog.getByLabel('Rekening Kas / Bank Penerima Dana *',{exact:true}).selectOption('bank-a');
    await dialog.getByLabel('Tanggal Terima Dana *',{exact:true}).fill('2026-10-08');
    await dialog.getByLabel('No. Bukti Transfer / Resi Bank Klien *',{exact:true}).fill('QA-REF');
    await dialog.getByRole('button',{name:'Konfirmasi & Simpan Penerimaan',exact:true}).click();
    await dialog.getByText('Nominal uang masuk wajib diisi, minimal Rp 1.000.',{exact:true}).waitFor(); assert.equal(receiptPosts,0);
    await dialog.getByLabel('Nominal Uang Masuk (Rp) *',{exact:true}).fill('250000');
    receiptFailure=true;
    await dialog.getByRole('button',{name:'Konfirmasi & Simpan Penerimaan',exact:true}).click();
    await dialog.getByText('Pilih rekening kas / bank yang aktif pada company Anda.',{exact:true}).waitFor();
    await page.getByText('Rekening penerima tidak tersedia atau tidak aktif pada company ini.',{exact:true}).waitFor();
    assert.equal(await dialog.getByLabel('Nama Klien / Perusahaan *',{exact:true}).inputValue(),'PT QA'); assert.equal(receipts.length,0);
    receiptFailure=false;
    await dialog.getByLabel('Rekening Kas / Bank Penerima Dana *',{exact:true}).selectOption('bank-a');
    await dialog.getByRole('button',{name:'Konfirmasi & Simpan Penerimaan',exact:true}).click(); await dialog.waitFor({state:'hidden'});
    assert.equal(receipts[0].amount,250000); assert.equal(receipts[0].allocation_plan.customer_name,'PT QA');
    await page.getByText('QA-REF',{exact:true}).waitFor(); await page.getByRole('cell',{name:'DRAFT',exact:true}).waitFor();
    await page.getByRole('button',{name:'Catat Uang Masuk (Customer Payment)',exact:true}).click();
    assert.equal(await dialog.getByLabel('Nominal Uang Masuk (Rp) *',{exact:true}).inputValue(),''); await page.keyboard.press('Escape');
    banksAvailable=false;
    await page.reload({waitUntil:'networkidle'});
    await page.getByRole('button',{name:'Catat Uang Masuk (Customer Payment)',exact:true}).click();
    await dialog.getByRole('button',{name:'Konfirmasi & Simpan Penerimaan',exact:true}).click();
    await dialog.getByText('Belum ada rekening kas / bank. Tambahkan rekening penerima di menu Kas & Bank terlebih dahulu.',{exact:true}).waitFor(); assert.equal(receiptPosts,2);
    await page.keyboard.press('Escape');
    role='ROLE-PM';
    await page.goto(`${origin}?project=a&tab=TREE`,{waitUntil:'networkidle'});
    await page.getByRole('button',{name:'Proyek Baru',exact:true}).click();dialog=page.getByRole('dialog');
    await clearZero(dialog.getByLabel('Total Anggaran (Rp)',{exact:true}));
    await dialog.getByLabel('Total Anggaran (Rp)',{exact:true}).fill('1500000');
    await dialog.getByPlaceholder('Contoh: Implementasi Sistem Otomasi Pabrik').fill('Proyek QA');
    await dialog.getByPlaceholder('PRJ-AUTO-01').fill('QA-01');
    await dialog.getByPlaceholder('Pilih dari database atau ketik klien baru...').fill('Customer QA');
    await dialog.getByRole('button',{name:/Simpan/}).click();await dialog.waitFor({state:'hidden'});assert.equal(projectBodies[0].budget_amount,1500000);
    assert.deepEqual(errors,[]);
    console.log('PASS: Funding/cost/project budget regressions, all receipt field warnings, minimum amount, bank selection/unavailable banks, actionable backend errors with draft preserved, lifecycle-safe save and visible Draft history.');
  } finally {
    if(browser) await browser.close();
    if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    if(app) await app.close();
    fs.unlinkSync(fixtureFile);fs.rmdirSync(fixtureDir);
    const generatedDir=path.join(frontend,'.next/types/app/minor-forms-fixture');
    const generatedFile=path.join(generatedDir,'page.ts');
    if(fs.existsSync(generatedFile)) fs.unlinkSync(generatedFile);
    if(fs.existsSync(generatedDir)&&fs.readdirSync(generatedDir).length===0)fs.rmdirSync(generatedDir);
  }
}
main().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
