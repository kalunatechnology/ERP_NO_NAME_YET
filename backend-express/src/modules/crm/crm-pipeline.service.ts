import crypto from 'crypto';
import type { Prisma } from '@prisma/client';
import { ConflictError, NotFoundError, ValidationError } from '../../utils/errors';

export const CRM_OPEN_STAGES = ['PROSPECT', 'DISCOVERY', 'PROPOSAL_SENT', 'NEGOTIATION', 'FOLLOW_UP'] as const;
export type CrmOpenStage = typeof CRM_OPEN_STAGES[number];

const STAGE_PROBABILITY: Record<CrmOpenStage, number> = {
  PROSPECT: 10,
  DISCOVERY: 25,
  PROPOSAL_SENT: 50,
  NEGOTIATION: 75,
  FOLLOW_UP: 20,
};

export function normalizeCrmStage(value: unknown): CrmOpenStage | 'WON' | 'LOST' {
  const stage = String(value ?? '').trim().toUpperCase();
  const aliases: Record<string, CrmOpenStage | 'WON' | 'LOST'> = {
    OPEN: 'PROSPECT',
    QUALIFICATION: 'DISCOVERY',
    PROPOSAL: 'PROPOSAL_SENT',
    CLOSED_WON: 'WON',
    CLOSED_LOST: 'LOST',
  };
  if (aliases[stage]) return aliases[stage];
  if ([...CRM_OPEN_STAGES, 'WON', 'LOST'].includes(stage as any)) return stage as CrmOpenStage | 'WON' | 'LOST';
  throw new ValidationError('Tahap Opportunity tidak dikenal.');
}

export async function moveOpportunityStage(
  tx: Prisma.TransactionClient,
  params: {
    opportunityId: string;
    companyId: string;
    stage: CrmOpenStage;
    actorId?: string | null;
    reason?: string;
    nextFollowUpAt?: Date | null;
  },
) {
  if (params.stage === 'FOLLOW_UP' && !params.nextFollowUpAt) {
    throw new ValidationError('Tanggal follow-up wajib diisi untuk tahap Follow-up Kembali.');
  }
  await tx.$queryRaw`SELECT id FROM crm_opportunity WHERE id = ${params.opportunityId} AND company_id = ${params.companyId} FOR UPDATE`;
  const opportunity = await tx.crm_opportunity.findFirst({ where: { id: params.opportunityId, company_id: params.companyId } });
  if (!opportunity) throw new NotFoundError('Opportunity');
  if (['WON', 'CLOSED_WON', 'LOST', 'CLOSED_LOST', 'CANCELLED', 'CANCEL', 'BATAL'].includes(String(opportunity.status || '').toUpperCase())) {
    throw new ConflictError('Opportunity yang sudah ditutup tidak dapat dipindahkan tahapnya.');
  }
  if (params.stage === 'PROPOSAL_SENT' || params.stage === 'NEGOTIATION') {
    const sentQuotation = await tx.sales_quotation.findFirst({
      where: { opportunity_id: opportunity.id, company_id: params.companyId, status: { in: ['SENT', 'ACCEPTED', 'REJECTED'] } },
      select: { id: true },
    });
    if (!sentQuotation) throw new ConflictError('Kirim quotation terlebih dahulu sebelum memindahkan Opportunity ke Proposal Dikirim atau Negosiasi.');
  }

  const previousStageCode = String(opportunity.pipeline_stage || '').trim().toUpperCase();
  let previousStage: CrmOpenStage | 'WON' | 'LOST';
  try { previousStage = normalizeCrmStage(previousStageCode); }
  catch { previousStage = 'PROSPECT'; }
  const [fromStage, toStage] = await Promise.all([
    opportunity.stage_id
      ? tx.crm_pipeline_stage.findFirst({ where: { id: opportunity.stage_id, company_id: params.companyId }, select: { id: true } })
      : tx.crm_pipeline_stage.findFirst({ where: { stage_code: previousStageCode, company_id: params.companyId }, select: { id: true } }),
    tx.crm_pipeline_stage.findFirst({ where: { stage_code: params.stage, company_id: params.companyId }, select: { id: true } }),
  ]);
  const updated = await tx.crm_opportunity.update({
    where: { id: opportunity.id },
    data: {
      status: 'OPEN',
      pipeline_stage: params.stage,
      stage_id: toStage?.id ?? null,
      probability_percent: STAGE_PROBABILITY[params.stage],
      closed_at: null,
      next_follow_up_at: params.stage === 'FOLLOW_UP' ? params.nextFollowUpAt : null,
      follow_up_reason: params.stage === 'FOLLOW_UP' ? String(params.reason ?? '').trim() : '',
      updated_at: new Date(),
    },
  });
  if (previousStageCode !== params.stage) {
    await tx.crm_opportunity_stage_history.create({
      data: {
        id: crypto.randomUUID(), tenant_id: opportunity.tenant_id, company_id: params.companyId,
        opportunity_id: opportunity.id, from_stage_id: fromStage?.id ?? null, to_stage_id: toStage?.id ?? null,
        changed_by: params.actorId ?? null, changed_at: new Date(), change_reason: String(params.reason ?? '').trim(),
      },
    });
  }
  return updated;
}
