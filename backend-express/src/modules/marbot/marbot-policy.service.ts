import prisma from '../../config/database';
import type { NativeScope } from './marbot-native.service';

/** Fail closed for configured custom policies until their expression has a supported evaluator. */
export async function loadNativePolicyRestrictions(scope: NativeScope, db = prisma) {
  const boundary = { AND: [
    { OR: [{ tenant_id: scope.tenantId }, { tenant_id: null }] },
    { OR: [{ company_id: scope.companyId }, { company_id: null }] },
    { OR: [{ role_id: scope.roleId }, { role_id: null }] },
  ] };
  const [fields, assignments] = await Promise.all([
    db.iam_field_permission.findMany({ where: boundary, select: { module_code: true, can_view: true, can_edit: true, masking_type: true } }),
    db.iam_role_data_scope.findMany({ where: boundary, select: { policy_id: true } }),
  ]);
  const policies = assignments.length ? await db.iam_data_scope_policy.findMany({ where: {
    id: { in: assignments.map(a => a.policy_id).filter((id): id is string => Boolean(id)) }, active: true,
    AND: [{ OR: [{ tenant_id: scope.tenantId }, { tenant_id: null }] }, { OR: [{ company_id: scope.companyId }, { company_id: null }] }],
  }, select: { module_code: true } }) : [];
  const custom = policies.map(p => p.module_code.toUpperCase());
  const blockedReadModules = [...new Set([...custom, ...fields.filter(f => !f.can_view || !['', 'NONE', 'NO_MASK', 'UNMASKED'].includes(f.masking_type.toUpperCase())).map(f => f.module_code.toUpperCase())])].sort();
  const blockedWriteModules = [...new Set([...custom, ...fields.filter(f => !f.can_edit).map(f => f.module_code.toUpperCase())])].sort();
  return { blockedReadModules, blockedWriteModules };
}
