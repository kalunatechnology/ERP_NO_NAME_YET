/**
 * File: backend-express/src/modules/crm/crm.service.ts
 *
 * Purpose: Implements domain service responsibilities for the crm domain.
 * Responsibility: Defines the executable contracts in this file and connects them to their callers without owning unrelated domain behavior.
 * Integration: Used through static imports, Express/Next framework discovery, or an explicit npm/script entry point as applicable.
 * Dependencies and side effects: See each documented function; database, browser storage, network, and response mutations are called out where present.
 */
import prisma from '../../config/database';
import { ConflictError, NotFoundError, ValidationError } from '../../utils/errors';
import { RoleCode } from '../../types/roles';
import type { Prisma } from '@prisma/client';
import { queueWebhookEvent } from './crm-outbound-webhook.service';

const CRM_TRANSACTION_OPTIONS = { maxWait: 5_000, timeout: 30_000 } as const;

export class CRMService {
/**
 * qualifyInquiry implements a named method within this file's domain service boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: No database operation is implied unless explicitly present in the implementation.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
  static async qualifyInquiry(inquiryId: string, userId: string, companyId: string) {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        return await prisma.$transaction(async (tx) => {
      // Serialize qualification on the source row. A regular transaction at
      // READ COMMITTED can still let two requests both observe a null link.
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM crm_customer_inquiry
        WHERE id = ${inquiryId} AND company_id = ${companyId}
        FOR UPDATE
      `;
      const inquiry = await tx.crm_customer_inquiry.findFirst({
        where: { id: inquiryId, company_id: companyId },
      });
      if (!inquiry) throw new NotFoundError('CustomerInquiry');

      let opportunityId = inquiry.opportunity_id;
      const opportunityFromSource = await tx.crm_opportunity.findUnique({
        where: { source_inquiry_id: inquiry.id },
        select: { id: true },
      });
      if (opportunityFromSource) opportunityId = opportunityFromSource.id;
      if (!opportunityId) {
        const opp = await tx.crm_opportunity.create({
          data: {
            id: crypto.randomUUID(),
            tenant_id: inquiry.tenant_id,
            company_id: inquiry.company_id,
            customer_party_id: inquiry.customer_party_id,
            source_inquiry_id: inquiry.id,
            owner_user_id: inquiry.owner_user_id ?? userId,
            opportunity_name: inquiry.subject ?? 'New Opportunity from Inquiry',
            pipeline_stage: 'PROSPECT',
            probability_percent: 10,
            expected_close_date: inquiry.expected_delivery_date,
            status: 'OPEN',
            opened_at: new Date(),
            lost_reason: '',
          },
        });
        opportunityId = opp.id;

        await tx.crm_customer_inquiry.update({
          where: { id: inquiryId },
          data: {
            opportunity_id: opportunityId,
            status: 'QUALIFIED',
            qualified_at: new Date(),
            updated_at: new Date(),
          },
        });
      } else {
        await tx.crm_customer_inquiry.update({
          where: { id: inquiryId },
          data: {
            status: 'QUALIFIED',
            qualified_at: new Date(),
            updated_at: new Date(),
          },
        });
      }

      const updatedInquiry = await tx.crm_customer_inquiry.findUnique({
        where: { id: inquiryId },
      });

      return {
        inquiry: updatedInquiry,
        opportunity_id: opportunityId,
      };
        }, { ...CRM_TRANSACTION_OPTIONS, isolationLevel: 'Serializable' });
      } catch (error: any) {
        // PostgreSQL serialization/deadlock and the database uniqueness guard
        // can race under load. Retry a bounded number of times; the source row
        // lock makes the retry observe and return the winning opportunity.
        if (!['P2034', 'P2002'].includes(error?.code) || attempt === 3) throw error;
        await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1)));
      }
    }
    throw new Error('Unable to qualify inquiry after bounded concurrency retries.');
  }

/**
 * calculateEstimate implements a named method within this file's domain service boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: No database operation is implied unless explicitly present in the implementation.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
  static async calculateEstimate(
    estimateId: string,
    userId: string,
    companyId: string,
    db?: Prisma.TransactionClient,
  ) {
    const calculate = async (tx: Prisma.TransactionClient) => {
      await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM crm_cost_estimate WHERE id = ${estimateId} AND company_id = ${companyId} FOR UPDATE`;
      const estimate = await tx.crm_cost_estimate.findFirst({
        where: { id: estimateId, company_id: companyId },
      });
      if (!estimate) throw new NotFoundError('CostEstimate');
      if (String(estimate.status || '').toUpperCase() === 'QUOTED') {
        throw new ConflictError('Estimate yang sudah menjadi quotation tidak dapat dihitung ulang. Buat revisi estimate/quotation baru.');
      }
      if (estimate.opportunity_id) {
        const opportunity = await tx.crm_opportunity.findFirst({
          where: { id: estimate.opportunity_id, company_id: companyId },
          select: { status: true, pipeline_stage: true },
        });
        if (opportunity && (['LOST', 'CLOSED_LOST', 'CANCELLED', 'CANCEL', 'BATAL'].includes(String(opportunity.status || '').toUpperCase())
          || ['LOST', 'CLOSED_LOST', 'CANCELLED', 'CANCEL', 'BATAL'].includes(String(opportunity.pipeline_stage || '').toUpperCase()))) {
          throw new ConflictError('Estimate dari Opportunity yang sudah ditutup tidak dapat dihitung ulang.');
        }
      }

      let lines = await tx.crm_cost_estimate_line.findMany({
        where: { estimate_id: estimateId, company_id: companyId },
      });

      if (lines.length === 0) {
        const directAmt = Number(estimate.direct_cost ?? 0);
        const overheadAmt = Number(estimate.overhead_cost ?? 0);
        const contingencyAmt = Number(estimate.contingency_amount ?? 0);
        if (directAmt <= 0 && overheadAmt <= 0 && contingencyAmt <= 0) {
          throw new ValidationError('Tambahkan minimal satu baris biaya atau masukkan biaya sebelum menghitung estimate.');
        }
        if (directAmt > 0) {
          await tx.crm_cost_estimate_line.create({
            data: {
              id: crypto.randomUUID(),
              tenant_id: estimate.tenant_id,
              company_id: companyId,
              estimate_id: estimateId,
              cost_element: 'MATERIAL',
              description: 'Biaya Langsung Material / Pekerjaan',
              quantity: 1,
              unit_cost: directAmt,
              amount: directAmt,
              calculation_source: 'MANUAL',
            },
          });
        }
        if (overheadAmt > 0) {
          await tx.crm_cost_estimate_line.create({
            data: {
              id: crypto.randomUUID(),
              tenant_id: estimate.tenant_id,
              company_id: companyId,
              estimate_id: estimateId,
              cost_element: 'OVERHEAD',
              description: 'Biaya Overhead & Operasional',
              quantity: 1,
              unit_cost: overheadAmt,
              amount: overheadAmt,
              calculation_source: 'MANUAL',
            },
          });
        }
        lines = await tx.crm_cost_estimate_line.findMany({
          where: { estimate_id: estimateId, company_id: companyId },
        });
      }

      let direct = 0;
      let overhead = 0;
      for (const line of lines) {
        const amt = Number(line.amount ?? 0);
        if (line.cost_element === 'OVERHEAD') {
          overhead += amt;
        } else {
          direct += amt;
        }
      }

      const contingency = Number(estimate.contingency_amount ?? 0);
      const totalCost = direct + overhead + contingency;
      if (!Number.isFinite(totalCost) || totalCost <= 0) throw new ValidationError('Total biaya estimate harus lebih dari nol.');
      const markupPercent = Number(estimate.markup_percent ?? 0);
      const offered = totalCost * (1 + markupPercent / 100);
      if (!Number.isFinite(offered) || offered <= 0) throw new ValidationError('Nilai quotation harus lebih dari nol.');
      const margin = offered - totalCost;
      const marginPercent = offered > 0 ? (margin / offered) * 100 : 0;

      const updated = await tx.crm_cost_estimate.update({
        where: { id: estimateId },
        data: {
          direct_cost: direct,
          overhead_cost: overhead,
          total_cost: totalCost,
          offered_amount: offered,
          margin_amount: margin,
          margin_percent: marginPercent,
          status: 'CALCULATED',
          calculated_at: new Date(),
          calculated_by_id: userId,
          updated_at: new Date(),
        },
      });

      return updated;
    };
    return db
      ? calculate(db)
      : prisma.$transaction(calculate, CRM_TRANSACTION_OPTIONS);
  }

  static async createCostEstimate(
    payload: { opportunity_id?: string | null; inquiry_id?: string | null; direct_cost?: unknown; overhead_cost?: unknown; contingency_amount?: unknown; markup_percent?: unknown; tax_percent?: unknown; description?: string },
    userId: string,
    companyId: string,
  ) {
    const direct = Number(payload.direct_cost ?? 0);
    const overhead = Number(payload.overhead_cost ?? 0);
    const contingency = Number(payload.contingency_amount ?? 0);
    const markup = Number(payload.markup_percent ?? 0);
    const taxPercent = Number(payload.tax_percent ?? 0);
    if (![direct, overhead, contingency, markup, taxPercent].every(Number.isFinite) || [direct, overhead, contingency, markup, taxPercent].some((value) => value < 0) || taxPercent > 100) {
      throw new ValidationError('Biaya, contingency, dan markup harus berupa angka valid dan tidak boleh negatif.');
    }
    if (direct + overhead + contingency <= 0) throw new ValidationError('Isi minimal satu biaya langsung, overhead, atau contingency.');

    return prisma.$transaction(async (tx) => {
      const opportunityId = payload.opportunity_id ? String(payload.opportunity_id) : null;
      const opportunity = opportunityId ? await tx.crm_opportunity.findFirst({
        where: { id: opportunityId, company_id: companyId },
        select: { id: true, tenant_id: true, status: true, pipeline_stage: true },
      }) : null;
      if (opportunityId && !opportunity) throw new NotFoundError('Opportunity');
      if (opportunity && (['LOST', 'CLOSED_LOST', 'CANCELLED', 'CANCEL', 'BATAL'].includes(String(opportunity.status || '').toUpperCase())
        || ['LOST', 'CLOSED_LOST', 'CANCELLED', 'CANCEL', 'BATAL'].includes(String(opportunity.pipeline_stage || '').toUpperCase()))) {
        throw new ConflictError('Estimasi tidak dapat dibuat dari Opportunity yang sudah ditutup.');
      }
      const inquiryId = payload.inquiry_id ? String(payload.inquiry_id) : null;
      const inquiry = inquiryId ? await tx.crm_customer_inquiry.findFirst({ where: { id: inquiryId, company_id: companyId }, select: { id: true, tenant_id: true } }) : null;
      if (inquiryId && !inquiry) throw new NotFoundError('CustomerInquiry');

      const tenantId = opportunity?.tenant_id ?? inquiry?.tenant_id;
      if (!tenantId) throw new ValidationError('Hubungkan estimasi ke Opportunity atau Inquiry pada company aktif.');
      const now = new Date();
      const estimate = await tx.crm_cost_estimate.create({
        data: {
          id: crypto.randomUUID(), tenant_id: tenantId, company_id: companyId,
          created_by_id: userId, opportunity_id: opportunity?.id ?? null, inquiry_id: inquiry?.id ?? null,
          estimate_number: `EST-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, version_number: 1,
          direct_cost: direct, overhead_cost: overhead, contingency_amount: contingency,
          total_cost: 0, markup_percent: markup, tax_percent: taxPercent, offered_amount: 0, margin_amount: 0, margin_percent: 0,
          status: 'DRAFT', created_at: now, updated_at: now,
        },
      });
      if (direct > 0) await tx.crm_cost_estimate_line.create({
        data: {
          id: crypto.randomUUID(), tenant_id: tenantId, company_id: companyId,
          created_by_id: userId, estimate_id: estimate.id, cost_element: 'MATERIAL',
          description: String(payload.description ?? '').trim() || 'Biaya langsung pekerjaan',
          quantity: 1, unit_cost: direct, amount: direct, calculation_source: 'MANUAL',
        },
      });
      if (overhead > 0) await tx.crm_cost_estimate_line.create({
        data: {
          id: crypto.randomUUID(), tenant_id: tenantId, company_id: companyId,
          created_by_id: userId, estimate_id: estimate.id, cost_element: 'OVERHEAD',
          description: 'Biaya overhead dan operasional', quantity: 1, unit_cost: overhead,
          amount: overhead, calculation_source: 'MANUAL',
        },
      });
      return estimate;
    }, CRM_TRANSACTION_OPTIONS);
  }

/**
 * createQuotationFromEstimate implements a named method within this file's domain service boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: No database operation is implied unless explicitly present in the implementation.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
  static async createQuotationFromEstimate(estimateId: string, userId: string, companyId: string) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM crm_cost_estimate WHERE id = ${estimateId} AND company_id = ${companyId} FOR UPDATE`;
      let estimate = await tx.crm_cost_estimate.findFirst({
        where: { id: estimateId, company_id: companyId },
      });
      if (!estimate) throw new NotFoundError('CostEstimate');

      if (estimate.status !== 'CALCULATED' && estimate.status !== 'QUOTED') {
        estimate = await this.calculateEstimate(estimateId, userId, companyId, tx);
      }

      const existingVersion = await tx.crm_quotation_version.findFirst({
        where: { estimate_id: estimateId, company_id: companyId },
      });
      if (existingVersion && existingVersion.quotation_id) {
        const existingQuotation = await tx.sales_quotation.findFirst({
          where: { id: existingVersion.quotation_id, company_id: companyId },
          select: { status: true },
        });
        return {
          quotation_id: existingVersion.quotation_id,
          status: existingQuotation?.status ?? 'UNKNOWN',
          created: false,
        };
      }

      if (!estimate.opportunity_id) {
        throw new ValidationError('Hubungkan estimasi ke opportunity sebelum membuat quotation.');
      }
      const opportunity = await tx.crm_opportunity.findFirst({
        where: { id: estimate.opportunity_id, company_id: companyId },
        select: { id: true, customer_party_id: true, status: true, pipeline_stage: true },
      });
      if (!opportunity) throw new ValidationError('Opportunity estimasi tidak ditemukan pada company ini.');
      if (['LOST', 'CLOSED_LOST', 'CANCELLED', 'CANCEL', 'BATAL'].includes(String(opportunity.status || '').toUpperCase())
        || ['LOST', 'CLOSED_LOST', 'CANCELLED', 'CANCEL', 'BATAL'].includes(String(opportunity.pipeline_stage || '').toUpperCase())) {
        throw new ConflictError('Quotation tidak dapat dibuat dari Opportunity yang sudah ditutup sebagai kalah/batal.');
      }
      if (!opportunity.customer_party_id) throw new ValidationError('Lengkapi customer party pada opportunity sebelum membuat quotation.');
      const customer = await tx.master_party.findFirst({
        where: { id: opportunity.customer_party_id, company_id: companyId, party_type: 'CUSTOMER', status: 'ACTIVE' },
        select: { id: true },
      });
      if (!customer) throw new ValidationError('Customer opportunity tidak aktif atau bukan milik company ini.');
      const customerPartyId = customer.id;

      const document = await tx.core_business_document.create({
        data: {
          id: crypto.randomUUID(),
          tenant_id: estimate.tenant_id,
          company_id: estimate.company_id,
          document_type: 'SALES_QUOTATION',
          document_number: `QUO-${estimate.id.slice(0, 8).toUpperCase()}`,
          status: 'DRAFT',
          document_date: new Date(),
          version: 1,
          created_by: userId,
          created_at: new Date(),
          updated_at: new Date(),
        },
      });

      const quotation = await tx.sales_quotation.create({
        data: {
          id: crypto.randomUUID(),
          tenant_id: estimate.tenant_id,
          company_id: companyId,
          created_by_id: userId,
          document_id: document.id,
          opportunity_id: estimate.opportunity_id,
          customer_party_id: customerPartyId,
          subtotal: estimate.offered_amount,
          tax_amount: Number(estimate.offered_amount ?? 0) * Number(estimate.tax_percent ?? 0) / 100,
          total_amount: Number(estimate.offered_amount ?? 0) * (1 + Number(estimate.tax_percent ?? 0) / 100),
          estimated_total_cost: estimate.total_cost,
          estimated_margin: estimate.margin_percent,
          status: 'DRAFT',
        },
      });

      const estimateLines = await tx.crm_cost_estimate_line.findMany({
        where: { estimate_id: estimateId, company_id: companyId },
      });
      const markup = Number(estimate.markup_percent ?? 0) / 100;

      for (const el of estimateLines) {
        const qty = Number(el.quantity ?? 1);
        const lineTotal = Number(el.amount ?? 0) * (1 + markup);
        const unitPrice = qty > 0 ? lineTotal / qty : 0;

        await tx.sales_quotation_line.create({
          data: {
            id: crypto.randomUUID(),
            tenant_id: estimate.tenant_id,
            company_id: companyId,
            created_by_id: userId,
            quotation_id: quotation.id,
            product_id: el.product_id,
            description: el.description,
            quantity: qty,
            unit_price: unitPrice,
            discount_amount: 0,
            line_total: lineTotal,
          },
        });
      }
      const contingency = Number(estimate.contingency_amount ?? 0);
      if (contingency > 0) {
        const contingencyTotal = contingency * (1 + markup);
        await tx.sales_quotation_line.create({
          data: {
            id: crypto.randomUUID(), tenant_id: estimate.tenant_id, company_id: companyId,
            created_by_id: userId, quotation_id: quotation.id,
            description: 'Contingency / cadangan biaya', quantity: 1,
            unit_price: contingencyTotal, discount_amount: 0, line_total: contingencyTotal,
          },
        });
      }

      await tx.crm_quotation_version.create({
        data: {
          id: crypto.randomUUID(),
          tenant_id: estimate.tenant_id,
          company_id: companyId,
          quotation_id: quotation.id,
          estimate_id: estimateId,
          version_number: 1,
          subtotal: estimate.offered_amount,
          tax_amount: Number(estimate.offered_amount ?? 0) * Number(estimate.tax_percent ?? 0) / 100,
          total_amount: Number(estimate.offered_amount ?? 0) * (1 + Number(estimate.tax_percent ?? 0) / 100),
          estimated_cost: estimate.total_cost,
          margin_percent: estimate.margin_percent,
          payload_json: '{}',
          created_by_id: userId,
          created_at: new Date(),
        },
      });

      await tx.crm_opportunity.update({
        where: { id: opportunity.id },
        data: {
          expected_amount: quotation.total_amount,
          expected_margin: estimate.margin_percent,
        },
      });

      await tx.crm_cost_estimate.update({
        where: { id: estimateId },
        data: { status: 'QUOTED', updated_at: new Date() },
      });

      if (estimate.inquiry_id) {
        await tx.crm_customer_inquiry.update({
          where: { id: estimate.inquiry_id },
          data: { status: 'QUOTED', quoted_at: new Date(), updated_at: new Date() },
        });
      }

      return {
        quotation_id: quotation.id,
        status: quotation.status,
        created: true,
      };
    }, CRM_TRANSACTION_OPTIONS);
  }

/**
 * calculateCreditSnapshot implements a named method within this file's domain service boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: Reads or mutates Prisma model(s) `master_customer_profile`, `fin_billing_document`, `crm_credit_status_snapshot`; transaction boundaries are exactly those visible in the body.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
  static async calculateCreditSnapshot(customerPartyId: string, companyId?: string | null, db: any = prisma) {
    const profile = await db.master_customer_profile.findFirst({
      where: { party_id: customerPartyId, ...(companyId ? { company_id: companyId } : { company_id: null }) },
    });
    const creditLimit = Number(profile?.credit_limit ?? 0);

    const bills = await db.fin_billing_document.findMany({
      where: {
        party_id: customerPartyId,
        ...(companyId ? { company_id: companyId } : { company_id: null }),
        billing_type: 'CUSTOMER_INVOICE',
        status: 'POSTED',
      },
    });

    let outstanding = 0;
    let overdue = 0;
    const now = new Date();

    for (const b of bills) {
      const outAmt = Number(b.outstanding_amount ?? 0);
      outstanding += outAmt;
      if (b.due_date && new Date(b.due_date) < now && outAmt > 0) {
        overdue += outAmt;
      }
    }

    const available = creditLimit - outstanding;
    const status = profile?.credit_hold
      ? 'HOLD'
      : creditLimit <= 0
        ? 'NO_LIMIT'
        : available < 0
          ? 'HOLD'
          : 'AVAILABLE';
    const risk = profile?.risk_category || (overdue > 0 ? 'HIGH' : 'LOW');

    return db.crm_credit_status_snapshot.create({
      data: {
        id: crypto.randomUUID(),
        tenant_id: profile?.tenant_id ?? null,
        customer_party_id: customerPartyId,
        company_id: companyId ?? null,
        snapshot_at: new Date(),
        credit_limit: creditLimit,
        outstanding_receivable: outstanding,
        overdue_amount: overdue,
        available_credit: available,
        risk_category: risk,
        credit_status: status,
      },
    });
  }

/**
 * processDealWon implements a named method within this file's domain service boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: No database operation is implied unless explicitly present in the implementation.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
  static async processDealWon(opportunityId: string, user: any, explicitCompanyId?: string | null, db: Prisma.TransactionClient | typeof prisma = prisma) {
    const execute = async (tx: Prisma.TransactionClient) => {
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM crm_opportunity
        WHERE id = ${opportunityId} AND company_id = ${explicitCompanyId ?? null}
        FOR UPDATE
      `;
      const opportunity = await tx.crm_opportunity.findFirst({
        where: { id: opportunityId, ...(explicitCompanyId ? { company_id: explicitCompanyId } : { company_id: null }) },
      });
      if (!opportunity) throw new NotFoundError('Opportunity');
      if (['LOST', 'CLOSED_LOST', 'CANCELLED', 'CANCEL', 'BATAL'].includes(String(opportunity.status || '').toUpperCase())
        || ['LOST', 'CLOSED_LOST', 'CANCELLED', 'CANCEL', 'BATAL'].includes(String(opportunity.pipeline_stage || '').toUpperCase())) {
        throw new ConflictError('Opportunity yang sudah ditutup sebagai kalah/batal tidak dapat diproses menjadi Deal Won.');
      }

      const previousHandoff = await tx.crm_deal_handoff.findUnique({ where: { opportunity_id: opportunity.id } });
      let depositSettled = false;
      if (previousHandoff) {
        const proforma = previousHandoff.proforma_invoice_id ? await tx.fin_billing_document.findFirst({
          where: { id: previousHandoff.proforma_invoice_id, company_id: opportunity.company_id ?? explicitCompanyId, billing_type: 'PROFORMA_INVOICE' },
          select: { payment_status: true, outstanding_amount: true },
        }) : null;
        depositSettled = Boolean(proforma && proforma.payment_status === 'PAID' && Number(proforma.outstanding_amount ?? 0) <= 0);
        if (!depositSettled) return {
          opportunity_id: opportunity.id,
          opportunity_name: opportunity.opportunity_name,
          stage: 'WON',
          decision: previousHandoff.decision,
          handoff: {
            sales_order_id: previousHandoff.sales_order_id,
            project_id: previousHandoff.project_id,
            proforma_invoice_id: previousHandoff.proforma_invoice_id,
            note: 'Handoff CRM sebelumnya dikembalikan; transaksi tidak dibuat ulang.',
          },
        };
      }

      const customerPartyId = opportunity.customer_party_id;
      if (!customerPartyId) {
        throw new ValidationError('Opportunity harus memiliki customer party.');
      }

      const companyId = opportunity.company_id ?? explicitCompanyId;
      if (!companyId || !opportunity.tenant_id) throw new ValidationError('Opportunity harus memiliki tenant dan company yang valid.');

      const acceptedQuotation = await tx.sales_quotation.findFirst({
        where: { opportunity_id: opportunity.id, company_id: companyId, status: 'ACCEPTED' },
        orderBy: { created_at: 'desc' },
      });
      if (!acceptedQuotation) throw new ValidationError('Deal hanya dapat diproses setelah quotation terkait opportunity berstatus ACCEPTED.');
      const customerParty = await tx.master_party.findFirst({ where: { id: customerPartyId, company_id: companyId } });
      if (!customerParty) throw new ValidationError('Customer tidak ditemukan dalam company aktif.');

      const [fromStage, wonStage] = await Promise.all([
        opportunity.stage_id
          ? tx.crm_pipeline_stage.findFirst({ where: { id: opportunity.stage_id, company_id: companyId }, select: { id: true } })
          : null,
        tx.crm_pipeline_stage.findFirst({ where: { stage_code: 'WON', company_id: companyId }, select: { id: true } }),
      ]);
      await tx.crm_opportunity.update({
        where: { id: opportunityId },
        data: {
          status: 'WON',
          pipeline_stage: 'WON',
          ...(wonStage?.id ? { stage_id: wonStage.id } : {}),
          probability_percent: 100,
          closed_at: new Date(),
        },
      });
      if (!['WON', 'CLOSED_WON'].includes(String(opportunity.status || '').toUpperCase())) {
        await tx.crm_opportunity_stage_history.create({
          data: {
            id: crypto.randomUUID(),
            tenant_id: opportunity.tenant_id,
            company_id: companyId,
            opportunity_id: opportunity.id,
            from_stage_id: fromStage?.id ?? null,
            to_stage_id: wonStage?.id ?? null,
            changed_by: user?.id ?? null,
            changed_at: new Date(),
            change_reason: 'DEAL_WON',
          },
        });
      }

      const snapshot = await this.calculateCreditSnapshot(customerPartyId, companyId, tx);
      const dealAmount = Number(acceptedQuotation.total_amount ?? opportunity.expected_amount ?? 0);
      const isSafe = depositSettled || (
        snapshot.credit_status === 'AVAILABLE' &&
        Number(snapshot.credit_limit) > 0 &&
        Number(snapshot.available_credit) >= dealAmount &&
        Number(snapshot.overdue_amount) <= 0
      );

      let createdOrder: any = null;
      let createdProject: any = null;
      let proformaBilling: any = null;

      if (isSafe) {
        createdOrder = await tx.sales_order.findFirst({
          where: { quotation_id: acceptedQuotation.id, company_id: companyId },
        });
        if (!createdOrder) {
          createdOrder = await tx.sales_order.create({
            data: {
              id: crypto.randomUUID(),
              tenant_id: opportunity.tenant_id,
              company_id: companyId,
              created_by_id: user?.id,
              customer_party_id: customerPartyId,
              quotation_id: acceptedQuotation.id,
              currency_id: acceptedQuotation.currency_id,
              payment_term_id: acceptedQuotation.payment_term_id,
              order_date: new Date(),
              subtotal: acceptedQuotation.subtotal,
              tax_amount: acceptedQuotation.tax_amount,
              total_amount: dealAmount,
              status: 'CONFIRMED',
            },
          });
        }
        await tx.sales_quotation.update({
          where: { id: acceptedQuotation.id },
          data: { status: 'CONVERTED' },
        });

        const pmRoles = await tx.iam_role.findMany({
          where: { tenant_id: opportunity.tenant_id, company_id: companyId, role_code: RoleCode.PROJECT_MANAGER },
          select: { id: true },
        });
        const pmAssignments = pmRoles.length ? await tx.iam_user_role.findMany({
          where: { tenant_id: opportunity.tenant_id, company_id: companyId, role_id: { in: pmRoles.map((role) => role.id) } },
          select: { user_id: true },
        }) : [];
        const pmIds = [...new Set(pmAssignments.flatMap((assignment) => assignment.user_id ? [assignment.user_id] : []))];
        const pmUser = pmIds.length ? await tx.iam_user.findFirst({
          where: { id: { in: pmIds }, tenant_id: opportunity.tenant_id, status: 'ACTIVE', is_active: true },
          orderBy: { date_joined: 'asc' },
        }) : null;

        createdProject = await tx.project_project.findFirst({
          where: { sales_order_id: createdOrder.id, company_id: companyId },
        });
        if (!createdProject) {
          createdProject = await tx.project_project.create({
            data: {
              id: crypto.randomUUID(),
              tenant_id: opportunity.tenant_id,
              company_id: companyId,
              customer_party_id: customerPartyId,
              customer_name: customerParty.display_name ?? customerParty.legal_name ?? opportunity.opportunity_name,
              description: opportunity.opportunity_name,
              sales_order_id: createdOrder.id,
              project_manager_id: pmUser?.id,
              manager_name: pmUser?.full_name ?? pmUser?.username ?? '',
              project_code: `PRJ-CRM-${opportunity.id.replace(/-/g, '').toUpperCase()}`,
              project_name: opportunity.opportunity_name ?? 'New Project from CRM',
              budget_amount: dealAmount,
              contract_amount: dealAmount,
              status: 'PLANNED',
              lifecycle_status: 'INCOMING',
              stage_entered_at: new Date(),
              verified_at: null,
              verified_by: null,
              health_status: 'GOOD',
              source_type: 'CRM',
            },
          });

        if (pmUser && createdProject) {
          await tx.project_member.create({
            data: {
              id: crypto.randomUUID(),
              tenant_id: opportunity.tenant_id,
              company_id: companyId,
              created_by_id: user?.id,
              project_id: createdProject.id,
              user_id: pmUser.id,
              project_role: 'PROJECT_MANAGER',
              status: 'ACTIVE',
              permissions_json: '{}',
            },
          });
        }
        }
      } else {
        const invoiceNumber = `PROFORMA-${opportunity.id.replace(/-/g, '').toUpperCase()}`;
        proformaBilling = await tx.fin_billing_document.findFirst({ where: { invoice_number: invoiceNumber, company_id: companyId } });
        if (!proformaBilling) {
          proformaBilling = await tx.fin_billing_document.create({
            data: {
              id: crypto.randomUUID(),
              tenant_id: opportunity.tenant_id,
              company_id: companyId,
              created_by_id: user?.id,
              party_id: customerPartyId,
              billing_type: 'PROFORMA_INVOICE',
              status: 'DRAFT',
              payment_status: 'UNPAID',
              rejection_reason: '',
              total_amount: dealAmount,
              invoice_number: invoiceNumber,
            },
          });
        }
      }

      const handoffData = {
        decision: isSafe ? 'SEND_TO_PROJECT_MANAGEMENT' : 'SEND_BILL_TO_CLIENT_MANUALLY',
        credit_snapshot_id: snapshot.id,
        sales_order_id: createdOrder?.id ?? null,
        project_id: createdProject?.id ?? null,
        proforma_invoice_id: isSafe ? null : proformaBilling?.id ?? previousHandoff?.proforma_invoice_id ?? null,
      };
      if (previousHandoff) await tx.crm_deal_handoff.update({ where: { id: previousHandoff.id }, data: handoffData });
      else await tx.crm_deal_handoff.create({ data: {
        id: crypto.randomUUID(), tenant_id: opportunity.tenant_id, company_id: companyId,
        opportunity_id: opportunity.id, ...handoffData, created_by_id: user?.id,
      } });

      await queueWebhookEvent(tx, companyId, 'deal.won', {
        opportunity_id: opportunity.id,
        decision: isSafe ? 'SEND_TO_PROJECT_MANAGEMENT' : 'SEND_BILL_TO_CLIENT_MANUALLY',
        handoff: {
          sales_order_id: createdOrder?.id ?? null,
          project_id: createdProject?.id ?? null,
          proforma_invoice_id: proformaBilling?.id ?? null,
        },
      });

      return {
        opportunity_id: opportunity.id,
        opportunity_name: opportunity.opportunity_name,
        stage: 'WON',
        deal_amount: String(dealAmount),
        credit_evaluation: {
          snapshot_id: snapshot.id,
          credit_limit: String(snapshot.credit_limit),
          outstanding_receivable: String(snapshot.outstanding_receivable),
          overdue_amount: String(snapshot.overdue_amount),
          available_credit: String(snapshot.available_credit),
          credit_status: snapshot.credit_status,
          risk_category: snapshot.risk_category,
          is_safe: isSafe,
        },
        decision: isSafe ? 'SEND_TO_PROJECT_MANAGEMENT' : 'SEND_BILL_TO_CLIENT_MANUALLY',
        handoff: {
          sales_order_id: createdOrder?.id ?? null,
          project_id: createdProject?.id ?? null,
          proforma_invoice_id: proformaBilling?.id ?? null,
          note: isSafe
            ? 'Proyek siap dijalankan di Project Management Workspace.'
            : 'Batas kredit terlampaui. Minta Executive Override.',
        },
      };
    };
    return db === prisma ? prisma.$transaction(execute, CRM_TRANSACTION_OPTIONS) : execute(db as Prisma.TransactionClient);
  }

/**
 * executiveOverride implements a named method within this file's domain service boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: No database operation is implied unless explicitly present in the implementation.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
  static async executiveOverride(opportunityId: string, user: any, companyId: string | null | undefined, remarks: string) {
    const reason = String(remarks ?? '').trim();
    if (!reason) throw new ValidationError('Alasan executive override wajib diisi.');
    if (reason.length > 2000) throw new ValidationError('Alasan executive override maksimal 2.000 karakter.');

    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM crm_opportunity
        WHERE id = ${opportunityId} AND company_id = ${companyId ?? null}
        FOR UPDATE
      `;
      const opportunity = await tx.crm_opportunity.findFirst({
        where: { id: opportunityId, ...(companyId ? { company_id: companyId } : { company_id: null }) },
      });
      if (!opportunity) throw new NotFoundError('Opportunity');
      if (['LOST', 'CLOSED_LOST', 'CANCELLED', 'CANCEL', 'BATAL'].includes(String(opportunity.status || '').toUpperCase())
        || ['LOST', 'CLOSED_LOST', 'CANCELLED', 'CANCEL', 'BATAL'].includes(String(opportunity.pipeline_stage || '').toUpperCase())) {
        throw new ConflictError('Opportunity yang sudah ditutup tidak dapat di-override.');
      }
      if (!['WON', 'CLOSED_WON'].includes(String(opportunity.status || '').toUpperCase())) {
        throw new ConflictError('Executive override hanya tersedia untuk Opportunity berstatus WON.');
      }
      if (!opportunity.customer_party_id) throw new ValidationError('Opportunity harus memiliki customer sebelum di-override.');

      const company = companyId ?? opportunity.company_id;
      if (!company || !opportunity.tenant_id) throw new ValidationError('Opportunity harus memiliki tenant dan company aktif.');
      const customer = await tx.master_party.findFirst({
        where: { id: opportunity.customer_party_id, company_id: company, party_type: 'CUSTOMER', status: 'ACTIVE' },
      });
      if (!customer) throw new ValidationError('Customer aktif pada company ini tidak ditemukan.');

      const priorHandoff = await tx.crm_deal_handoff.findUnique({ where: { opportunity_id: opportunity.id } });
      if (priorHandoff?.project_id) {
        return { success: true, already_handled: true, message: 'Project untuk opportunity ini sudah terbentuk.', sales_order_id: priorHandoff.sales_order_id, project_id: priorHandoff.project_id };
      }

      const quotation = await tx.sales_quotation.findFirst({
        where: { opportunity_id: opportunity.id, company_id: company, status: { in: ['ACCEPTED', 'CONVERTED'] } },
        orderBy: { created_at: 'desc' },
      });
      if (!quotation) throw new ValidationError('Executive override memerlukan quotation yang sudah diterima customer.');
      const dealAmount = Number(quotation.total_amount ?? opportunity.expected_amount ?? 0);
      if (!Number.isFinite(dealAmount) || dealAmount <= 0) throw new ValidationError('Nilai quotation harus lebih besar dari nol.');

      const creditSnapshot = priorHandoff?.credit_snapshot_id
        ? await tx.crm_credit_status_snapshot.findFirst({ where: { id: priorHandoff.credit_snapshot_id, company_id: company } })
        : await this.calculateCreditSnapshot(customer.id, company, tx);
      if (!creditSnapshot) throw new ValidationError('Credit snapshot tidak tersedia untuk mencatat override.');
      const creditIsSafe = creditSnapshot.credit_status === 'AVAILABLE'
        && Number(creditSnapshot.credit_limit) > 0
        && Number(creditSnapshot.available_credit) >= dealAmount
        && Number(creditSnapshot.overdue_amount) <= 0;
      if (creditIsSafe) throw new ConflictError('Credit customer aman. Gunakan proses Deal Won tanpa executive override.');

      let salesOrder = await tx.sales_order.findFirst({ where: { quotation_id: quotation.id, company_id: company } });
      if (!salesOrder) {
        salesOrder = await tx.sales_order.create({
          data: {
            id: crypto.randomUUID(), tenant_id: opportunity.tenant_id, company_id: company,
            created_by_id: user?.id, customer_party_id: customer.id, quotation_id: quotation.id,
            currency_id: quotation.currency_id, payment_term_id: quotation.payment_term_id,
            order_date: new Date(), subtotal: quotation.subtotal, tax_amount: quotation.tax_amount,
            total_amount: dealAmount, status: 'CONFIRMED',
          },
        });
      }

      let project = await tx.project_project.findFirst({ where: { sales_order_id: salesOrder.id, company_id: company } });
      if (!project) {
        const pmRoles = await tx.iam_role.findMany({ where: { tenant_id: opportunity.tenant_id, company_id: company, role_code: RoleCode.PROJECT_MANAGER }, select: { id: true } });
        const pmAssignments = pmRoles.length ? await tx.iam_user_role.findMany({ where: { tenant_id: opportunity.tenant_id, company_id: company, role_id: { in: pmRoles.map((role) => role.id) } }, select: { user_id: true } }) : [];
        const pmIds = [...new Set(pmAssignments.flatMap((assignment) => assignment.user_id ? [assignment.user_id] : []))];
        const pmUser = pmIds.length ? await tx.iam_user.findFirst({ where: { id: { in: pmIds }, tenant_id: opportunity.tenant_id, status: 'ACTIVE', is_active: true }, orderBy: { date_joined: 'asc' } }) : null;
        project = await tx.project_project.create({
          data: {
            id: crypto.randomUUID(), tenant_id: opportunity.tenant_id, company_id: company,
            customer_party_id: customer.id, customer_name: customer.display_name ?? customer.legal_name ?? '',
            description: opportunity.opportunity_name, sales_order_id: salesOrder.id,
            project_manager_id: pmUser?.id, manager_name: pmUser?.full_name ?? pmUser?.username ?? '',
            project_code: `PRJ-CRM-OVR-${opportunity.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`,
            project_name: opportunity.opportunity_name || 'Project dari CRM', budget_amount: dealAmount,
            contract_amount: dealAmount, status: 'PLANNED', lifecycle_status: 'INCOMING',
            stage_entered_at: new Date(), verified_at: null, verified_by: null,
            health_status: 'GOOD', source_type: 'CRM',
          },
        });
        if (pmUser) await tx.project_member.create({
          data: {
            id: crypto.randomUUID(), tenant_id: opportunity.tenant_id, company_id: company,
            created_by_id: user?.id, project_id: project.id, user_id: pmUser.id,
            project_role: 'PROJECT_MANAGER', status: 'ACTIVE', permissions_json: '{}',
          },
        });
      }

      await tx.sales_quotation.update({ where: { id: quotation.id }, data: { status: 'CONVERTED' } });
      const approval = await tx.crm_executive_approval.create({
        data: {
          id: crypto.randomUUID(), tenant_id: opportunity.tenant_id, company_id: company,
          opportunity_id: opportunity.id, quotation_id: quotation.id,
          requested_by: user?.id, approver_user_id: user?.id,
          approval_type: 'CREDIT_OVERRIDE', requested_amount: dealAmount,
          decision: 'APPROVED', remarks: reason, requested_at: new Date(), decided_at: new Date(),
        },
      });
      const handoffData = {
        decision: 'EXECUTIVE_OVERRIDE', credit_snapshot_id: creditSnapshot.id,
        sales_order_id: salesOrder.id, project_id: project.id, proforma_invoice_id: null,
      };
      if (priorHandoff) await tx.crm_deal_handoff.update({ where: { id: priorHandoff.id }, data: handoffData });
      else await tx.crm_deal_handoff.create({
        data: {
          id: crypto.randomUUID(), tenant_id: opportunity.tenant_id, company_id: company,
          opportunity_id: opportunity.id, ...handoffData, created_by_id: user?.id,
        },
      });

      await queueWebhookEvent(tx, company, 'deal.won', {
        opportunity_id: opportunity.id, decision: 'EXECUTIVE_OVERRIDE',
        handoff: { sales_order_id: salesOrder.id, project_id: project.id, proforma_invoice_id: null },
      });
      return {
        success: true, message: 'Executive override dicatat dan project masuk antrean verifikasi.',
        approval_id: approval.id, sales_order_id: salesOrder.id, project_id: project.id,
      };
    }, CRM_TRANSACTION_OPTIONS);
  }
}
