/** Q11 regression suite for cross-module safety invariants. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assertRecordMutable, autoFillRequiredFields } from '../src/utils/crud-factory';

type Evidence = Record<string, unknown>;

async function scenario(name: string, run: () => Evidence | Promise<Evidence>): Promise<Evidence> {
  const evidence = await run();
  process.stdout.write(`PASS: ${name}\n`);
  return evidence;
}

async function main(): Promise<void> {
  const feature = await readFile(`${__dirname}/features/q11-system-guardrails.feature`, 'utf8');
  const names = [
    'Missing approval state never becomes approved',
    'Missing business identity is rejected',
    'Terminal finance records remain immutable',
    'Quick login stays isolated from operational data',
    'Production build enforces safety checks',
  ];
  names.forEach((name) => assert(feature.includes(`Scenario: ${name}`), `Missing feature scenario: ${name}`));

  const results: Evidence[] = [];

  results.push(await scenario(names[0], () => {
    const normalized = autoFillRequiredFields('sales_order_change_request', {
      change_type: 'SCOPE',
      change_reason: 'Q11 guardrail verification',
    });
    assert.equal(normalized.approval_status, 'PENDING');
    assert.notEqual(normalized.approval_status, 'APPROVED');
    return { default_approval_status: normalized.approval_status };
  }));

  results.push(await scenario(names[1], async () => {
    assert.throws(
      () => autoFillRequiredFields('project_project', {}),
      /Field project_name wajib diisi/,
    );
    assert.throws(
      () => autoFillRequiredFields('project_project', { name: 'Valid project name' }),
      /Field customer_name wajib diisi/,
    );
    assert.throws(() => autoFillRequiredFields('project_main_task', {}), /Field name wajib diisi/);
    assert.throws(() => autoFillRequiredFields('project_weekly_task', {}), /Field target_description wajib diisi/);
    assert.throws(() => autoFillRequiredFields('project_daily_task', {}), /Field title wajib diisi/);
    const projectRoutes = await readFile(`${__dirname}/../src/modules/projects/projects.routes.ts`, 'utf8');
    for (const syntheticValue of ['Untitled Project', "'Main Task'", "'Aktivitas Harian'", "'09.00 - 12.00'", "'Melika (Lead PM)'"]) {
      assert(!projectRoutes.includes(syntheticValue), `Project route still persists synthetic value ${syntheticValue}`);
    }
    return { synthetic_project_name: false, synthetic_customer_name: false, synthetic_task_fields: false };
  }));

  results.push(await scenario(names[2], async () => {
    assert.throws(() => assertRecordMutable('fin_billing_document', { status: 'POSTED' }), /immutable/);
    assert.throws(() => assertRecordMutable('fin_billing_document', { status: 'DRAFT', payment_status: 'PAID' }), /immutable/);
    assert.doesNotThrow(() => assertRecordMutable('fin_billing_document', { status: 'DRAFT' }));
    assert.doesNotThrow(() => assertRecordMutable('project_project', { status: 'CLOSED' }));
    const crudSource = await readFile(`${__dirname}/../src/utils/crud-factory.ts`, 'utf8');
    const bulkDeleteSection = crudSource.split('// 4. Bulk Delete')[1]?.split('// 5. List')[0] ?? '';
    assert(bulkDeleteSection.includes('assertRecordMutable(modelNameStr, existing)'), 'Bulk delete bypasses finance immutability');
    return { posted_finance: 'blocked', paid_finance: 'blocked', draft_finance: 'mutable', bulk_delete_guarded: true };
  }));

  results.push(await scenario(names[3], async () => {
    const [loginSource, projectApiSource] = await Promise.all([
      readFile(`${__dirname}/../../frontend-next/app/login/page.tsx`, 'utf8'),
      readFile(`${__dirname}/../../frontend-next/lib/api/project.api.ts`, 'utf8'),
    ]);
    assert(loginSource.includes('{isLocalDev && ('), 'Quick-login panel must remain local-only');
    assert(loginSource.includes('DummyPass123!'), 'Approved local quick-login fixture is missing');
    assert(!projectApiSource.includes('DEFAULT_TEAM_MEMBERS'), 'Operational project API contains a demo team fallback');
    assert(!projectApiSource.includes('Budi Santoso'));
    assert(!projectApiSource.includes('Ahmad Rizki'));
    assert(!projectApiSource.includes('Rina Sari'));
    return { quick_login: 'local-only', operational_team_fallback: false };
  }));

  results.push(await scenario(names[4], async () => {
    const [buildSource, seedSource] = await Promise.all([
      readFile(`${__dirname}/../scripts/build.js`, 'utf8'),
      readFile(`${__dirname}/../prisma/seed.ts`, 'utf8'),
    ]);
    assert(buildSource.includes("'tests/q11-system-guardrails.ts'"), 'Q11 is not enforced by the build');
    assert(seedSource.includes("process.env.NODE_ENV === 'production'"), 'Production seed guard is missing');
    return { q11_build_gate: true, production_demo_seed: 'blocked' };
  }));

  process.stdout.write(`${JSON.stringify({ status: 'PASS', suite: 'Q11 System Guardrails', scenarios: results }, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
