/**
 * File: backend-express/src/modules/inventory/workflow-engine.service.ts
 *
 * Purpose: Universal Inventory Phase 2 — Configurable Workflow Engine & DoA Thresholds.
 * Evaluates company-configured transition rules (`inv_workflow_rule`) for
 * inventory documents (TRANSFER_ORDER, STOCK_COUNT, INTERCOMPANY_STO, STOCK_MOVE),
 * enforcing Segregation of Duties (SoD), financial threshold tier checks, and
 * minimum shelf-life (FEFO) compliance rules.
 */
import prisma from '../../config/database';
import { ForbiddenError, ValidationError } from '../../utils/errors';
import { isCompanyAdmin, isSuperAdmin, RoleCode, parseRoleCode } from '../../types/roles';

export interface EvaluateWorkflowInput {
  companyId: string;
  documentType: 'TRANSFER_ORDER' | 'STOCK_COUNT' | 'INTERCOMPANY_STO' | 'STOCK_MOVE';
  fromStatus: string;
  toStatus: string;
  transactionAmount?: number;
  requesterId?: string | null;
  actorUser: {
    id: string;
    roles?: string[];
    active_role_code?: string | null;
  };
  lotIds?: string[];
}

async function resolveActorInventoryTier(companyId: string, user: EvaluateWorkflowInput['actorUser']): Promise<number> {
  const roles = user.roles || [];
  if (isSuperAdmin(roles) || isCompanyAdmin(roles)) return 1;
  const active = user.active_role_code ? parseRoleCode(user.active_role_code) : null;
  if (active === RoleCode.DIRECTOR || active === RoleCode.COMPANY_ADMIN) return 1;
  if (active === RoleCode.OPERATIONAL_MANAGER) return 1;

  const assignment = await (prisma as any).iam_user_module_assignment
    ?.findFirst?.({
      where: {
        company_id: companyId,
        user_id: user.id,
        module_code: 'INVENTORY',
        status: 'ACTIVE',
      },
      select: { tier_level: true },
    })
    .catch(() => null);

  if (assignment?.tier_level) return Number(assignment.tier_level);
  if (active === RoleCode.SUPERVISOR || active === RoleCode.PROJECT_MANAGER) return 2;
  return 3;
}

export async function evaluateWorkflowTransition(
  input: EvaluateWorkflowInput,
  tx: any = prisma,
): Promise<{ ruleMatched: boolean; requiredTier: number }> {
  const rules: any[] = await tx.inv_workflow_rule
    ?.findMany?.({
      where: {
        company_id: input.companyId,
        document_type: input.documentType,
        from_status: input.fromStatus,
        is_active: true,
      },
      orderBy: { min_amount_threshold: 'desc' },
    })
    .catch(() => []) ?? [];

  if (!rules.length) {
    return { ruleMatched: false, requiredTier: 3 };
  }

  const targetRules = rules.filter((r) => r.to_status === input.toStatus);
  if (!targetRules.length) {
    throw new ValidationError(
      `Transisi workflow ${input.documentType} dari ${input.fromStatus} ke ${input.toStatus} tidak diizinkan oleh aturan perusahaan.`,
    );
  }

  const amount = Number(input.transactionAmount ?? 0);
  const matchingRule =
    targetRules.find((r) => amount >= Number(r.min_amount_threshold ?? 0)) ||
    targetRules[targetRules.length - 1];

  if (matchingRule.enforce_sod && input.requesterId && input.requesterId === input.actorUser.id) {
    throw new ForbiddenError(
      `Segregation of Duties (SoD): Pembuat dokumen tidak dapat melakukan transisi ke ${input.toStatus}.`,
    );
  }

  const requiredTier = Number(matchingRule.required_tier_level ?? 2);
  const actorTier = await resolveActorInventoryTier(input.companyId, input.actorUser);
  if (actorTier > requiredTier) {
    throw new ForbiddenError(
      `Otorisasi DoA: Transaksi senilai ${amount.toLocaleString('id-ID')} memerlukan persetujuan minimal Tier ${requiredTier} (Anda saat ini Tier ${actorTier}).`,
    );
  }

  const minExpiryDays = Number(matchingRule.require_expiry_min_days ?? 0);
  if (minExpiryDays > 0 && input.lotIds?.length) {
    const lots = await tx.inv_lot.findMany({
      where: { company_id: input.companyId, id: { in: input.lotIds } },
    });
    const minDate = new Date(Date.now() + minExpiryDays * 86_400_000);
    for (const lot of lots) {
      if (lot.expiry_date && new Date(lot.expiry_date) < minDate) {
        throw new ValidationError(
          `FEFO Workflow Policy: Lot ${lot.lot_number} memiliki sisa masa kedaluwarsa kurang dari ${minExpiryDays} hari.`,
        );
      }
    }
  }

  return { ruleMatched: true, requiredTier };
}

