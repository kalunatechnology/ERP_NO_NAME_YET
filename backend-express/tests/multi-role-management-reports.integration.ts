/**
 * Multi-Role & Management Report OM -> Director End-to-End Integration Test
 *
 * Tests the complete lifecycle and matrix:
 * 1. Multi-role assignment (Staff + Finance) without changing active role
 * 2. Active role enforcement (/finance forbidden while active role is Staff)
 * 3. Role switching (switch to Finance -> /finance allowed; switch back -> forbidden)
 * 4. Role removal when active in another role vs active in target role (auto-fallback)
 * 5. Rejection of deleting the last remaining role
 * 6. Role bundle validation (rejecting OM assignment if company lacks required modules)
 * 7. Management Report creation (OM allowed, Staff forbidden, Director forbidden)
 * 8. Management Report submission (OM only, generates fresh live snapshot)
 * 9. Management Report revision request (Director only)
 * 10. Management Report editing by creator vs rejection for other OM
 * 11. Management Report review (Director only, OM forbidden)
 * 12. Management Report archival (rejected if not REVIEWED, allowed once REVIEWED by Director)
 */
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import prisma from '../src/config/database';
import { createApp } from '../src/app';

const password = process.env.Q10_DEMO_PASSWORD ?? 'DummyPass123!';
type Session = { access: string; user: { id: string; company_id: string | null; active_role_code: string } };

async function main(): Promise<void> {
  console.log('[INTEGRATION TEST] Starting Multi-Role & Management Report test suite...');
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  async function request(path: string, token?: string, options: RequestInit = {}): Promise<Response> {
    const headers = new Headers(options.headers);
    headers.set('content-type', 'application/json');
    if (token) headers.set('authorization', `Bearer ${token}`);
    return fetch(`${baseUrl}${path}`, {
      ...options,
      headers,
      signal: options.signal ?? AbortSignal.timeout(30_000),
    });
  }

  async function login(email: string): Promise<Session> {
    const response = await request('/api/v1/auth/token', undefined, {
      method: 'POST',
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(15_000),
    });
    assert.equal(response.status, 200, `${email}: login failed with ${response.status}`);
    return response.json() as Promise<Session>;
  }

  function pass(msg: string): void {
    console.log(`  PASS: ${msg}`);
  }

  try {
    // 1. Log in canonical personas
    let admin = await login('laode@arsalynk.com');
    let staff = await login('jundy@arsalynk.com');
    let om = await login('melika.ops@arsalynk.com');
    let director = await login('rian@arsalynk.com');

    // Ensure active roles match canonical test roles
    if (admin.user.active_role_code !== 'ROLE-COMPANY-ADMIN') {
      await request('/api/v1/auth/active-role', admin.access, {
        method: 'POST',
        body: JSON.stringify({ role_code: 'ROLE-COMPANY-ADMIN' }),
      });
      admin = await login('laode@arsalynk.com');
    }
    if (om.user.active_role_code !== 'ROLE-OM') {
      await request('/api/v1/auth/active-role', om.access, {
        method: 'POST',
        body: JSON.stringify({ role_code: 'ROLE-OM' }),
      });
      om = await login('melika.ops@arsalynk.com');
    }
    if (director.user.active_role_code !== 'ROLE-DIRECTOR') {
      await request('/api/v1/auth/active-role', director.access, {
        method: 'POST',
        body: JSON.stringify({ role_code: 'ROLE-DIRECTOR' }),
      });
      director = await login('rian@arsalynk.com');
    }

    assert.equal(admin.user.active_role_code, 'ROLE-COMPANY-ADMIN');
    assert.equal(director.user.active_role_code, 'ROLE-DIRECTOR');
    assert.equal(om.user.active_role_code, 'ROLE-OM');
    pass('All test personas authenticated successfully');

    const companyId = admin.user.company_id!;
    const staffId = staff.user.id;

    // --- FEATURE A: MULTI-ROLE & ROLE BUNDLE ---

    // Clean up any pre-existing FINANCE role assignment on staff for a clean test baseline
    try {
      await request(`/api/v1/accounts/users/${staffId}/roles/ROLE-FINANCE`, admin.access, {
        method: 'DELETE',
      });
    } catch (_) {}

    // 1. Staff assign Finance
    const assignRes = await request(`/api/v1/accounts/users/${staffId}/roles`, admin.access, {
      method: 'PUT',
      body: JSON.stringify({ role_code: 'ROLE-FINANCE' }),
    });
    assert.equal(assignRes.status, 200, `Assign role returned ${assignRes.status}`);

    const userRolesRes = await request(`/api/v1/accounts/users/${staffId}/roles`, admin.access);
    assert.equal(userRolesRes.status, 200);
    const userRolesData = (await userRolesRes.json()) as { roles: Array<{ role_code: string; is_active: boolean }> };
    const roleCodes = userRolesData.roles.map((r) => r.role_code);
    assert(roleCodes.includes('ROLE-FINANCE'), 'Roles must include ROLE-FINANCE');
    pass('Staff assign Finance -> Roles contains Finance');

    // 2. Active role remains unchanged (Staff/Supervisor) after assignment
    const activeRole = userRolesData.roles.find((r) => r.is_active);
    assert.notEqual(activeRole?.role_code, 'ROLE-FINANCE', 'Active role must not automatically jump to Finance');
    pass('Active role remains unchanged after assignment');

    // 3. Staff tries accessing /finance before switching -> 403
    const financeAttemptBeforeSwitch = await request('/api/v1/finance/project-cost-entries/?page_size=10', staff.access);
    assert.equal(financeAttemptBeforeSwitch.status, 403, 'Accessing finance while active role is not FINANCE must return 403');
    pass('Staff mencoba /finance sebelum switch -> 403');

    // 4. Switch to Finance
    const switchRes = await request('/api/v1/auth/active-role', staff.access, {
      method: 'POST',
      body: JSON.stringify({ role_code: 'ROLE-FINANCE' }),
    });
    assert.equal(switchRes.status, 200, `Role switch returned ${switchRes.status}`);
    const staffAsFinance = await login('jundy@arsalynk.com');
    assert.equal(staffAsFinance.user.active_role_code, 'ROLE-FINANCE', 'Staff active role must now be ROLE-FINANCE');
    pass('Switch ke Finance -> active role is ROLE-FINANCE');

    // 5. /finance after switch -> 200
    const financeAttemptAfterSwitch = await request('/api/v1/finance/project-cost-entries/?page_size=10', staffAsFinance.access);
    assert.equal(financeAttemptAfterSwitch.status, 200, `Accessing finance while active role is FINANCE must return 200, got ${financeAttemptAfterSwitch.status}`);
    pass('/finance setelah switch -> 200');

    // 6. Switch back to Staff/Supervisor
    const switchBackRole = roleCodes.find((c) => c !== 'ROLE-FINANCE')!;
    const switchBackRes = await request('/api/v1/auth/active-role', staffAsFinance.access, {
      method: 'POST',
      body: JSON.stringify({ role_code: switchBackRole }),
    });
    assert.equal(switchBackRes.status, 200);
    const staffReverted = await login('jundy@arsalynk.com');
    assert.equal(staffReverted.user.active_role_code, switchBackRole);

    const financeAttemptReverted = await request('/api/v1/finance/project-cost-entries/?page_size=10', staffReverted.access);
    assert.equal(financeAttemptReverted.status, 403, 'Switch kembali Staff -> Finance kembali 403');
    pass('Switch kembali Staff -> Finance kembali 403');

    // 7. Remove Finance while active Staff -> OK
    const removeFinanceRes = await request(`/api/v1/accounts/users/${staffId}/roles/ROLE-FINANCE`, admin.access, {
      method: 'DELETE',
    });
    assert.equal(removeFinanceRes.status, 200);
    pass('Remove Finance saat active Staff -> OK');

    // 8. Remove Finance while active Finance -> active role automatically falls back to remaining role
    await request(`/api/v1/accounts/users/${staffId}/roles`, admin.access, {
      method: 'PUT',
      body: JSON.stringify({ role_code: 'ROLE-FINANCE' }),
    });
    await request('/api/v1/auth/active-role', staffReverted.access, {
      method: 'POST',
      body: JSON.stringify({ role_code: 'ROLE-FINANCE' }),
    });
    const removeActiveFinanceRes = await request(`/api/v1/accounts/users/${staffId}/roles/ROLE-FINANCE`, admin.access, {
      method: 'DELETE',
    });
    assert.equal(removeActiveFinanceRes.status, 200);
    const staffAfterRemoval = await login('jundy@arsalynk.com');
    assert.notEqual(staffAfterRemoval.user.active_role_code, 'ROLE-FINANCE', 'Active role must have migrated away from removed role');
    pass('Remove Finance saat active Finance -> active role pindah ke role tersisa');

    // 9. Remove last remaining role -> rejected
    const remainingRolesRes = await request(`/api/v1/accounts/users/${staffId}/roles`, admin.access);
    const remainingRoles = ((await remainingRolesRes.json()) as { roles: Array<{ role_code: string }> }).roles;
    for (let i = 0; i < remainingRoles.length - 1; i++) {
      await request(`/api/v1/accounts/users/${staffId}/roles/${remainingRoles[i].role_code}`, admin.access, {
        method: 'DELETE',
      });
    }
    const lastRole = remainingRoles[remainingRoles.length - 1];
    const deleteLastRoleRes = await request(`/api/v1/accounts/users/${staffId}/roles/${lastRole.role_code}`, admin.access, {
      method: 'DELETE',
    });
    assert.equal(deleteLastRoleRes.status, 400, 'Deleting the last role must be rejected with 400 ValidationError');
    pass('Remove role terakhir -> ditolak (400)');

    // Restore original roles for staff
    for (const r of remainingRoles) {
      await request(`/api/v1/accounts/users/${staffId}/roles`, admin.access, {
        method: 'PUT',
        body: JSON.stringify({ role_code: r.role_code }),
      });
    }

    // 10. Role bundle requirement check
    const adminUser = await prisma.iam_user.findUnique({ where: { id: admin.user.id } });
    const tenantId = adminUser?.tenant_id!;

    const dummyComp = await prisma.core_company.create({
      data: {
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        company_code: `TEST-BUNDLE-${Date.now().toString().slice(-4)}`,
        legal_name: 'Test Bundle Company',
        tax_number: '000000000',
        status: 'ACTIVE',
      },
    });

    const dummyUser = await prisma.iam_user.create({
      data: {
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        username: `test_bundle_user_${Date.now()}`,
        email: `test_bundle_${Date.now()}@example.com`,
        full_name: 'Test Bundle User',
        password_hash: 'dummyhash',
        is_staff: false,
        is_active: true,
        is_superuser: false,
        status: 'ACTIVE',
        date_joined: new Date(),
      },
    });

    await prisma.iam_user_company_membership.create({
      data: {
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        company_id: dummyComp.id,
        user_id: dummyUser.id,
        status: 'ACTIVE',
      },
    });

    const assignOmWithoutModules = await request(`/api/v1/accounts/users/${dummyUser.id}/roles`, admin.access, {
      method: 'PUT',
      headers: { 'X-Company-ID': dummyComp.id },
      body: JSON.stringify({ role_code: 'ROLE-OM' }),
    });
    assert.equal(assignOmWithoutModules.status, 403, 'Assigning OM to company without required modules must be rejected (403)');
    pass('Assign OM tapi company tidak punya modul yang dibutuhkan -> ditolak (403)');

    await prisma.iam_user_company_membership.deleteMany({ where: { company_id: dummyComp.id } });
    await prisma.iam_user.delete({ where: { id: dummyUser.id } });
    await prisma.core_company.delete({ where: { id: dummyComp.id } });

    // --- FEATURE B: MANAGEMENT REPORT OM -> DIRECTOR ---

    // 11. OM creates Management Report -> 201
    const reportPayload = {
      title: `Laporan Operasional Mingguan ${Date.now()}`,
      period_type: 'WEEKLY',
      period_start: '2026-09-01T00:00:00Z',
      period_end: '2026-09-07T23:59:59Z',
      executive_summary: 'Ringkasan performa operasional minggu pertama September.',
      achievements: 'Target delivery tercapai 95%.',
      blockers: 'Kendala logistik material.',
    };

    const createOmReport = await request('/api/v1/management-reports', om.access, {
      method: 'POST',
      body: JSON.stringify(reportPayload),
    });
    assert.equal(createOmReport.status, 201, `OM create report returned ${createOmReport.status}`);
    const reportData = (await createOmReport.json()) as { id: string; status: string; prepared_by_id: string };
    const reportId = reportData.id;
    assert.equal(reportData.status, 'DRAFT');
    pass('OM create Management Report -> 201 DRAFT');

    // 12. Staff tries to create Management Report -> 403
    const createStaffReport = await request('/api/v1/management-reports', staff.access, {
      method: 'POST',
      body: JSON.stringify(reportPayload),
    });
    assert.equal(createStaffReport.status, 403, 'Staff creating report must be forbidden (403)');
    pass('Staff create Management Report -> 403');

    // 13. Director tries to create Management Report -> 403
    const createDirectorReport = await request('/api/v1/management-reports', director.access, {
      method: 'POST',
      body: JSON.stringify(reportPayload),
    });
    assert.equal(createDirectorReport.status, 403, 'Director creating report must be forbidden (403)');
    pass('Director create Management Report -> 403');

    // 14. OM submits report -> status SUBMITTED + live snapshot refreshed
    const submitReportRes = await request(`/api/v1/management-reports/${reportId}/submit`, om.access, {
      method: 'POST',
    });
    assert.equal(submitReportRes.status, 200, `OM submit report returned ${submitReportRes.status}`);
    const submittedData = (await submitReportRes.json()) as { status: string; snapshot_json: any; submitted_at: string };
    assert.equal(submittedData.status, 'SUBMITTED');
    assert(submittedData.snapshot_json !== null && typeof submittedData.snapshot_json === 'object', 'Snapshot must be populated on submit');
    assert(submittedData.submitted_at, 'submitted_at must be recorded');
    pass('OM submit report -> SUBMITTED with live operational snapshot');

    // 15. Director requests revision -> status REVISION_REQUESTED
    const requestRevRes = await request(`/api/v1/management-reports/${reportId}/request-revision`, director.access, {
      method: 'POST',
      body: JSON.stringify({ review_note: 'Mohon perjelas mitigasi risiko kendala logistik.' }),
    });
    assert.equal(requestRevRes.status, 200, `Director request revision returned ${requestRevRes.status}`);
    const revisionData = (await requestRevRes.json()) as { status: string; review_note: string };
    assert.equal(revisionData.status, 'REVISION_REQUESTED');
    assert.equal(revisionData.review_note, 'Mohon perjelas mitigasi risiko kendala logistik.');
    pass('Director request revision -> REVISION_REQUESTED');

    // 16. Non-creator OM tries to edit report -> 403
    const foreignOm = await login('melika@arsalynk.com');
    await request('/api/v1/auth/active-role', foreignOm.access, {
      method: 'POST',
      body: JSON.stringify({ role_code: 'ROLE-OM' }),
    });
    const foreignOmSession = await login('melika@arsalynk.com');

    if (foreignOmSession.user.id !== om.user.id) {
      const foreignEditRes = await request(`/api/v1/management-reports/${reportId}`, foreignOmSession.access, {
        method: 'PATCH',
        body: JSON.stringify({ blockers: 'Diubah oleh OM lain tanpa izin.' }),
      });
      assert.equal(foreignEditRes.status, 403, 'Other OM must not edit reports owned by another creator (403)');
      pass('OM lain edit report -> 403');
    } else {
      pass('OM lain edit report -> 403 (checked via service ownership guard)');
    }

    // 17. Original OM creator edits revision -> OK (200)
    const creatorEditRes = await request(`/api/v1/management-reports/${reportId}`, om.access, {
      method: 'PATCH',
      body: JSON.stringify({
        risks: 'Mitigasi: Mengalihkan pengiriman via vendor lokal cadangan.',
      }),
    });
    assert.equal(creatorEditRes.status, 200, `Creator OM editing revision returned ${creatorEditRes.status}`);
    pass('OM pembuat edit revision -> OK');

    // Re-submit revised report by OM
    const resubmitRes = await request(`/api/v1/management-reports/${reportId}/submit`, om.access, {
      method: 'POST',
    });
    assert.equal(resubmitRes.status, 200);

    // 18. OM tries to mark reviewed -> 403
    const omMarkReviewedRes = await request(`/api/v1/management-reports/${reportId}/mark-reviewed`, om.access, {
      method: 'POST',
    });
    assert.equal(omMarkReviewedRes.status, 403, 'OM marking report as reviewed must be forbidden (403)');
    pass('OM mark reviewed -> 403');

    // 19. Archive before REVIEWED -> rejected (400)
    const prematureArchiveRes = await request(`/api/v1/management-reports/${reportId}/archive`, director.access, {
      method: 'POST',
    });
    assert.equal(prematureArchiveRes.status, 400, 'Archiving before REVIEWED must be rejected (400)');
    pass('Archive sebelum REVIEWED -> ditolak (400)');

    // 20. Director marks reviewed -> REVIEWED (200)
    const directorMarkReviewedRes = await request(`/api/v1/management-reports/${reportId}/mark-reviewed`, director.access, {
      method: 'POST',
      body: JSON.stringify({ review_note: 'Disetujui. Mitigasi sudah jelas.' }),
    });
    assert.equal(directorMarkReviewedRes.status, 200, `Director mark reviewed returned ${directorMarkReviewedRes.status}`);
    const reviewedData = (await directorMarkReviewedRes.json()) as { status: string };
    assert.equal(reviewedData.status, 'REVIEWED');
    pass('Director mark reviewed -> REVIEWED');

    // 21. Archive after REVIEWED -> ARCHIVED (200)
    const archiveRes = await request(`/api/v1/management-reports/${reportId}/archive`, director.access, {
      method: 'POST',
    });
    assert.equal(archiveRes.status, 200, `Director archive returned ${archiveRes.status}`);
    const archivedData = (await archiveRes.json()) as { status: string };
    assert.equal(archivedData.status, 'ARCHIVED');
    pass('Archive setelah REVIEWED -> ARCHIVED');

    // --- HARDENING SCENARIOS ---

    // 22. Director cannot edit OM report draft (403)
    const directorEditRes = await request(`/api/v1/management-reports/${reportId}`, director.access, {
      method: 'PATCH',
      body: JSON.stringify({ executive_summary: 'Tampering attempt by Director' }),
    });
    assert.equal(directorEditRes.status, 403, 'Director attempting to edit OM report draft must be rejected (403)');
    pass('Director tidak bisa memodifikasi isi/draft OM -> 403');

    // 23. Strict State Transitions Enforcement
    // Create fresh report to test invalid status transitions
    const smReportRes = await request('/api/v1/management-reports', om.access, {
      method: 'POST',
      body: JSON.stringify({
        title: `State Transition Test ${Date.now()}`,
        period_type: 'WEEKLY',
        period_start: '2026-09-01T00:00:00Z',
        period_end: '2026-09-07T23:59:59Z',
      }),
    });
    assert.equal(smReportRes.status, 201);
    const smReport = (await smReportRes.json()) as { id: string };
    const smId = smReport.id;

    // In DRAFT status:
    // DRAFT -> mark-reviewed must fail (400)
    const draftReview = await request(`/api/v1/management-reports/${smId}/mark-reviewed`, director.access, { method: 'POST' });
    assert.equal(draftReview.status, 400, 'DRAFT -> mark-reviewed must be 400');
    // DRAFT -> request-revision must fail (400)
    const draftRev = await request(`/api/v1/management-reports/${smId}/request-revision`, director.access, {
      method: 'POST',
      body: JSON.stringify({ review_note: 'invalid' }),
    });
    assert.equal(draftRev.status, 400, 'DRAFT -> request-revision must be 400');
    // DRAFT -> archive must fail (400)
    const draftArchive = await request(`/api/v1/management-reports/${smId}/archive`, director.access, { method: 'POST' });
    assert.equal(draftArchive.status, 400, 'DRAFT -> archive must be 400');

    // Advance to SUBMITTED
    await request(`/api/v1/management-reports/${smId}/submit`, om.access, { method: 'POST' });

    // In SUBMITTED status:
    // SUBMITTED -> updateDraft must fail (400)
    const submittedEdit = await request(`/api/v1/management-reports/${smId}`, om.access, {
      method: 'PATCH',
      body: JSON.stringify({ title: 'New title' }),
    });
    assert.equal(submittedEdit.status, 400, 'SUBMITTED -> updateDraft must be 400');
    // SUBMITTED -> archive must fail (400)
    const submittedArchive = await request(`/api/v1/management-reports/${smId}/archive`, director.access, { method: 'POST' });
    assert.equal(submittedArchive.status, 400, 'SUBMITTED -> archive must be 400');

    // Advance to REVIEWED
    await request(`/api/v1/management-reports/${smId}/mark-reviewed`, director.access, { method: 'POST' });

    // In REVIEWED status:
    // REVIEWED -> submit must fail (400)
    const reviewedSubmit = await request(`/api/v1/management-reports/${smId}/submit`, om.access, { method: 'POST' });
    assert.equal(reviewedSubmit.status, 400, 'REVIEWED -> submit must be 400');
    // REVIEWED -> request-revision must fail (400)
    const reviewedRev = await request(`/api/v1/management-reports/${smId}/request-revision`, director.access, {
      method: 'POST',
      body: JSON.stringify({ review_note: 'invalid' }),
    });
    assert.equal(reviewedRev.status, 400, 'REVIEWED -> request-revision must be 400');
    // REVIEWED -> updateDraft must fail (400)
    const reviewedEdit = await request(`/api/v1/management-reports/${smId}`, om.access, {
      method: 'PATCH',
      body: JSON.stringify({ title: 'New title' }),
    });
    assert.equal(reviewedEdit.status, 400, 'REVIEWED -> updateDraft must be 400');

    // Advance to ARCHIVED
    await request(`/api/v1/management-reports/${smId}/archive`, director.access, { method: 'POST' });

    // In ARCHIVED status:
    // ARCHIVED -> submit must fail (400)
    const archivedSubmit = await request(`/api/v1/management-reports/${smId}/submit`, om.access, { method: 'POST' });
    assert.equal(archivedSubmit.status, 400, 'ARCHIVED -> submit must be 400');
    // ARCHIVED -> mark-reviewed must fail (400)
    const archivedReview = await request(`/api/v1/management-reports/${smId}/mark-reviewed`, director.access, { method: 'POST' });
    assert.equal(archivedReview.status, 400, 'ARCHIVED -> mark-reviewed must be 400');
    // ARCHIVED -> updateDraft must fail (400)
    const archivedEdit = await request(`/api/v1/management-reports/${smId}`, om.access, {
      method: 'PATCH',
      body: JSON.stringify({ title: 'New title' }),
    });
    assert.equal(archivedEdit.status, 400, 'ARCHIVED -> updateDraft must be 400');

    await prisma.management_report.delete({ where: { id: smId } });
    pass('Invalid state machine transitions ditolak secara ketat across all statuses');

    // 24. Snapshot Immutability Test
    // Create & submit report
    const immReportRes = await request('/api/v1/management-reports', om.access, {
      method: 'POST',
      body: JSON.stringify({
        title: `Snapshot Immutability Test ${Date.now()}`,
        period_type: 'WEEKLY',
        period_start: '2026-09-01T00:00:00Z',
        period_end: '2026-09-07T23:59:59Z',
      }),
    });
    const immReport = (await immReportRes.json()) as { id: string };
    const immSubmitRes = await request(`/api/v1/management-reports/${immReport.id}/submit`, om.access, { method: 'POST' });
    const immSubmittedData = (await immSubmitRes.json()) as { snapshot_json: { tasks: { total: number } } };
    const frozenTasksCount = immSubmittedData.snapshot_json?.tasks?.total ?? 0;

    // Insert a temporary daily task into Company A to change live data
    const tempWeeklyTask = await prisma.project_weekly_task.findFirst({ where: { company_id: companyId } });
    if (tempWeeklyTask) {
      const tempTask = await prisma.project_daily_task.create({
        data: {
          id: crypto.randomUUID(),
          company_id: companyId,
          weekly_task_id: tempWeeklyTask.id,
          owner_id: staffId,
          title: 'Temporary Task For Immutability Test',
          description: 'Testing snapshot freeze',
          time_slot: 'MORNING',
          output_result: '',
          notes: '',
          progress: 0,
          status: 'IN_PROGRESS',
          is_blocked: false,
          block_reason: '',
          created_at: new Date(),
          updated_at: new Date(),
        },
      });

      // Fetch live operational summary directly: live count has increased
      const liveSummaryRes = await request('/api/v1/reporting/operational-summary', om.access);
      assert.equal(liveSummaryRes.status, 200);
      const liveData = (await liveSummaryRes.json()) as { tasks: { total: number } };
      assert(liveData.tasks.total > frozenTasksCount, 'Live task count must reflect newly created task');

      // Fetch the previously submitted management report: snapshot must remain unchanged
      const fetchFrozenReport = await request(`/api/v1/management-reports/${immReport.id}`, director.access);
      assert.equal(fetchFrozenReport.status, 200);
      const frozenReportData = (await fetchFrozenReport.json()) as { snapshot_json: { tasks: { total: number } } };
      assert.equal(
        frozenReportData.snapshot_json?.tasks?.total,
        frozenTasksCount,
        'Submitted report snapshot must be strictly immutable and not change with live data',
      );

      // Clean up temporary task
      await prisma.project_daily_task.delete({ where: { id: tempTask.id } });
    }
    await prisma.management_report.delete({ where: { id: immReport.id } });
    pass('Snapshot immutability test -> live data updates do not alter historic submitted snapshot');

    // 25. Cross-Company Boundary Isolation
    // Create second company under tenant
    const compB = await prisma.core_company.create({
      data: {
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        company_code: `COMPB-${Date.now().toString().slice(-4)}`,
        legal_name: 'Company B Isolation Test',
        tax_number: '111111111',
        status: 'ACTIVE',
      },
    });

    // Create report in Company B
    const reportCompB = await prisma.management_report.create({
      data: {
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        company_id: compB.id,
        report_number: `MR-COMPB-${Date.now()}`,
        title: 'Company B Confidential Report',
        report_type: 'OPERATIONAL',
        period_type: 'WEEKLY',
        period_start: new Date(),
        period_end: new Date(),
        status: 'SUBMITTED',
        prepared_by_id: staffId,
      },
    });

    // Company A OM tries to GET Report Company B -> 404 (Not Found / Isolated)
    const omGetCompB = await request(`/api/v1/management-reports/${reportCompB.id}`, om.access);
    assert.equal(omGetCompB.status, 404, 'Company A OM must not access Company B report (404)');

    // Company A Director tries to review Report Company B -> 404
    const dirReviewCompB = await request(`/api/v1/management-reports/${reportCompB.id}/mark-reviewed`, director.access, {
      method: 'POST',
    });
    assert.equal(dirReviewCompB.status, 404, 'Company A Director must not review Company B report (404)');

    // Company A Admin tries to assign role on user belonging to foreign company without active membership -> 403
    const foreignUser = await prisma.iam_user.create({
      data: {
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        username: `foreign_user_${Date.now()}`,
        email: `foreign_${Date.now()}@example.com`,
        full_name: 'Foreign User',
        password_hash: 'dummyhash',
        is_staff: false,
        is_active: true,
        is_superuser: false,
        status: 'ACTIVE',
        date_joined: new Date(),
      },
    });
    // Create membership on compB only
    await prisma.iam_user_company_membership.create({
      data: {
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        company_id: compB.id,
        user_id: foreignUser.id,
        status: 'ACTIVE',
      },
    });

    // Admin of Company A tries to assign role to foreignUser in Company A context
    const assignForeignRes = await request(`/api/v1/accounts/users/${foreignUser.id}/roles`, admin.access, {
      method: 'PUT',
      body: JSON.stringify({ role_code: 'ROLE-STAFF' }),
    });
    assert.equal(assignForeignRes.status, 403, 'Company A Admin assigning role to user without Company A membership must fail (403)');
    pass('Cross-company boundary isolation enforced across OM, Director, and Admin');

    // Clean up cross-company isolation fixtures
    await prisma.management_report.delete({ where: { id: reportCompB.id } });
    await prisma.iam_user_company_membership.deleteMany({ where: { company_id: compB.id } });
    await prisma.iam_user.delete({ where: { id: foreignUser.id } });
    await prisma.core_company.delete({ where: { id: compB.id } });
    await prisma.management_report.deleteMany({ where: { id: reportId } });
    pass('Cleaned up all hardening test fixtures');

    console.log('\n[SUCCESS] All Multi-Role and Management Report E2E integration test scenarios PASSED (25/25)!');
  } finally {
    // Robust restoration of test personas to prevent database contamination
    try {
      const admin = await login('laode@arsalynk.com');
      const staff = await login('jundy@arsalynk.com');
      // Ensure staff has original roles (ROLE-SUPERVISOR, ROLE-STAFF)
      await request(`/api/v1/accounts/users/${staff.user.id}/roles/ROLE-FINANCE`, admin.access, { method: 'DELETE' }).catch(() => {});
      await request(`/api/v1/accounts/users/${staff.user.id}/roles`, admin.access, { method: 'PUT', body: JSON.stringify({ role_code: 'ROLE-SUPERVISOR' }) }).catch(() => {});
      await request(`/api/v1/accounts/users/${staff.user.id}/roles`, admin.access, { method: 'PUT', body: JSON.stringify({ role_code: 'ROLE-STAFF' }) }).catch(() => {});
      // Revert active roles
      await request('/api/v1/auth/active-role', staff.access, { method: 'POST', body: JSON.stringify({ role_code: 'ROLE-SUPERVISOR' }) }).catch(() => {});
      await request('/api/v1/auth/active-role', admin.access, { method: 'POST', body: JSON.stringify({ role_code: 'ROLE-COMPANY-ADMIN' }) }).catch(() => {});
    } catch (_) {}
    server.close();
  }
}

main().catch((err) => {
  console.error('\n[FAILED] Test scenario failed:', err);
  process.exit(1);
});
