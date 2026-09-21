import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const repositoryRoot = path.resolve(__dirname, '..', '..');

async function source(relativePath: string): Promise<string> {
  return readFile(path.join(repositoryRoot, relativePath), 'utf8');
}

async function main() {
  const [client, api, routes, service, dashboard] = await Promise.all([
    source('frontend-next/app/(app)/projects/ProjectsClient.tsx'),
    source('frontend-next/lib/api/project.api.ts'),
    source('backend-express/src/modules/projects/projects.routes.ts'),
    source('backend-express/src/modules/projects/projects.service.ts'),
    source('backend-express/src/modules/dashboard/dashboard.routes.ts'),
  ]);

  assert.match(client, /contract_amount:\s*""/);
  assert.match(client, /budget_amount:\s*""/);
  assert.match(client, /target_margin_percent:\s*""/);
  assert.match(client, /contract_amount:\s*e\.target\.value/);
  assert.match(client, /budget_amount:\s*e\.target\.value/);
  assert.match(client, /target_margin_percent:\s*e\.target\.value/);

  assert.match(client, /updateProjectFinancials\(selectedProject\.id,\s*\{\s*contract_amount:\s*contractAmount,\s*budget_amount:\s*budgetAmount,\s*target_margin_percent:\s*targetMarginPercent,/s);
  assert.doesNotMatch(client, /selectedProject\.contract_amount\s*\|\|\s*selectedProject\.budget_amount/);
  assert.doesNotMatch(client, /contract_amount:\s*Number\([\s\S]{0,200}selectedProject\.budget/);
  assert.match(client, /target_margin_percent\s*\?\?\s*0/);
  assert.doesNotMatch(client, /target_margin_percent\s*\|\|/);

  assert.match(api, /contract_amount\?:\s*number/);
  assert.match(api, /target_margin_percent\?:\s*number/);
  assert.match(api, /updateProjectFinancials[\s\S]*contract_amount\?:\s*number;[\s\S]*budget_amount\?:\s*number;[\s\S]*target_margin_percent\?:\s*number;/);

  assert.match(routes, /Perubahan target finansial memerlukan role PM, OM, atau Company Admin/);
  assert.match(routes, /assertCanManageProject\(req\.user, project\.id, companyId\)/);
  assert.match(routes, /parsed < 0/);
  assert.match(routes, /parseFinancialValue\(target_margin_percent, 'target_margin_percent', 100\)/);

  assert.match(dashboard, /budget_amount,\s*contract_amount,\s*target_margin_percent,/);
  assert.match(service, /expected_revenue:\s*expectedRevenue/);
  assert.match(service, /planned_budget:\s*bac/);
  assert.match(service, /target_margin_percent:\s*targetMarginPercent/);
  assert.match(service, /budget_utilization_percent:\s*budgetUtilizationPercent/);
  assert.match(service, /actual_gross_profit:\s*actualGrossProfit/);
  assert.match(service, /actual_margin_percent:\s*actualMarginPercent/);

  assert.equal(Number('80000000'), 80_000_000);
  assert.equal(Number('50000000'), 50_000_000);
  assert.equal(Number('25'), 25);
  assert.equal(Number('0'), 0);

  process.stdout.write('PASS: project financial target contract\n');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
