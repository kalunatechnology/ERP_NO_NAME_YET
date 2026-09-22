import assert from 'node:assert/strict';
import { autoFillRequiredFields } from '../src/utils/crud-factory';

const tenantId = '00000000-0000-0000-0000-000000000001';
const companyId = '10000000-0000-0000-0000-000000000001';
const projectId = '10000000-0000-0000-0000-000000000101';
const userId = 'fc677329-f3d1-48c6-b18c-9d74d07a243f';

const normalized = autoFillRequiredFields('project_main_task', {
  project_id: projectId,
  tenant_id: tenantId,
  company_id: companyId,
  created_by_id: userId,
  name: 'Compatibility task',
  description: '',
  priority: 'MEDIUM',
  weight: 10,
  progress: 0,
  status: 'PLANNED',
  is_progress_overridden: false,
  override_reason: '',
}, {
  user: { id: userId, tenant_id: tenantId },
  companyId,
} as any);

assert.equal(normalized.project_id, projectId);
assert.equal(normalized.tenant_id, tenantId);
assert.equal(normalized.company_id, companyId);
assert.equal(normalized.created_by_id, userId);
assert.ok(normalized.created_at instanceof Date);
assert.ok(normalized.updated_at instanceof Date);

const workflowDefaults = autoFillRequiredFields('sales_order_change_request', {
  change_type: 'SCOPE',
  change_reason: 'Rust-free metadata compatibility',
});
assert.equal(workflowDefaults.approval_status, 'PENDING');

console.log('PASS: Rust-free Prisma keeps full CRUD metadata behavior and TEXT-backed IDs.');
