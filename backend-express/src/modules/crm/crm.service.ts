/**
 * File: backend-express/src/modules/crm/crm.service.ts
 *
 * Purpose: Implements domain service responsibilities for the crm domain.
 * Responsibility: Defines the executable contracts in this file and connects them to their callers without owning unrelated domain behavior.
 * Integration: Used through static imports, Express/Next framework discovery, or an explicit npm/script entry point as applicable.
 * Dependencies and side effects: See each documented function; database, browser storage, network, and response mutations are called out where present.
 */
import prisma from '../../config/database';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { RoleCode } from '../../types/roles';
import type { Prisma } from '@prisma/client';

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
      const estimate = await tx.crm_cost_estimate.findFirst({
        where: { id: estimateId, company_id: companyId },
      });
      if (!estimate) throw new NotFoundError('CostEstimate');

      let lines = await tx.crm_cost_estimate_line.findMany({
        where: { estimate_id: estimateId, company_id: companyId },
      });

      if (lines.length === 0) {
        const directAmt = Number(estimate.direct_cost ?? 0);
        const overheadAmt = Number(estimate.overhead_cost ?? 0);
        if (directAmt <= 0 && overheadAmt <= 0) {
          throw new ValidationError('Tambahkan minimal satu baris biaya atau masukkan direct_cost/overhead_cost sebelum menghitung estimate.');
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

      if (estimate.opportunity_id) {
        await tx.crm_opportunity.update({
          where: { id: estimate.opportunity_id },
          data: {
            expected_amount: offered,
            expected_margin: marginPercent,
          },
        });
      }

      return updated;
    };
    return db
      ? calculate(db)
      : prisma.$transaction(calculate, CRM_TRANSACTION_OPTIONS);
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
        return {
          quotation_id: existingVersion.quotation_id,
          status: 'DRAFT',
          created: false,
        };
      }

      let customerPartyId = null;
      if (estimate.opportunity_id) {
        const opp = await tx.crm_opportunity.findFirst({
          where: { id: estimate.opportunity_id, company_id: companyId },
        });
        customerPartyId = opp?.customer_party_id;
      }
      if (!customerPartyId && estimate.inquiry_id) {
        const inq = await tx.crm_customer_inquiry.findFirst({
          where: { id: estimate.inquiry_id, company_id: companyId },
        });
        customerPartyId = inq?.customer_party_id;
      }

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
          tax_amount: 0,
          total_amount: estimate.offered_amount,
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

      await tx.crm_quotation_version.create({
        data: {
          id: crypto.randomUUID(),
          tenant_id: estimate.tenant_id,
          company_id: companyId,
          quotation_id: quotation.id,
          estimate_id: estimateId,
          version_number: 1,
          subtotal: estimate.offered_amount,
          tax_amount: 0,
          total_amount: estimate.offered_amount,
          estimated_cost: estimate.total_cost,
          margin_percent: estimate.margin_percent,
          payload_json: '{}',
          created_by_id: userId,
          created_at: new Date(),
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
    const status = profile?.credit_hold || available < 0 ? 'HOLD' : 'AVAILABLE';
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
  static async processDealWon(opportunityId: string, user: any, explicitCompanyId?: string | null) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM crm_opportunity
        WHERE id = ${opportunityId} AND company_id = ${explicitCompanyId ?? null}
        FOR UPDATE
      `;
      const opportunity = await tx.crm_opportunity.findFirst({
        where: { id: opportunityId, ...(explicitCompanyId ? { company_id: explicitCompanyId } : { company_id: null }) },
      });
      if (!opportunity) throw new NotFoundError('Opportunity');

      const previousHandoff = await tx.crm_deal_handoff.findUnique({ where: { opportunity_id: opportunity.id } });
      if (previousHandoff) {
        return {
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

      await tx.crm_opportunity.update({
        where: { id: opportunityId },
        data: {
          status: 'WON',
          pipeline_stage: 'WON',
          probability_percent: 100,
          closed_at: new Date(),
        },
      });

      const snapshot = await this.calculateCreditSnapshot(customerPartyId, companyId, tx);
      const dealAmount = Number(acceptedQuotation.total_amount ?? opportunity.expected_amount ?? 0);
      const isSafe =
        snapshot.credit_status !== 'HOLD' &&
        Number(snapshot.available_credit) >= dealAmount &&
        Number(snapshot.overdue_amount) <= 0;

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
              order_date: new Date(),
              total_amount: dealAmount,
              status: 'CONFIRMED',
            },
          });
        }

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

      await tx.crm_deal_handoff.create({
        data: {
          id: crypto.randomUUID(),
          tenant_id: opportunity.tenant_id,
          company_id: companyId,
          opportunity_id: opportunity.id,
          decision: isSafe ? 'SEND_TO_PROJECT_MANAGEMENT' : 'SEND_BILL_TO_CLIENT_MANUALLY',
          credit_snapshot_id: snapshot.id,
          sales_order_id: createdOrder?.id ?? null,
          project_id: createdProject?.id ?? null,
          proforma_invoice_id: proformaBilling?.id ?? null,
          created_by_id: user?.id,
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
    }, CRM_TRANSACTION_OPTIONS);
  }

/**
 * executiveOverride implements a named method within this file's domain service boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: No database operation is implied unless explicitly present in the implementation.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
  static async executiveOverride(opportunityId: string, user: any, companyId?: string | null) {
    return prisma.$transaction(async (tx) => {
      const opportunity = await tx.crm_opportunity.findFirst({
        where: { id: opportunityId, ...(companyId ? { company_id: companyId } : { company_id: null }) },
      });
      if (!opportunity) throw new NotFoundError('Opportunity');

      const customerPartyId = opportunity.customer_party_id;
      const dealAmount = Number(opportunity.expected_amount ?? 0);

      const createdOrder = await tx.sales_order.create({
        data: {
          id: crypto.randomUUID(),
          tenant_id: opportunity.tenant_id,
          company_id: companyId ?? opportunity.company_id,
          created_by_id: user?.id,
          customer_party_id: customerPartyId,
          order_date: new Date(),
          total_amount: dealAmount,
          status: 'CONFIRMED',
        },
      });

      const pmUser =
        (await tx.iam_user.findFirst({ where: { username: 'pm', tenant_id: opportunity.tenant_id } })) ?? user;

      const createdProject = await tx.project_project.create({
        data: {
          id: crypto.randomUUID(),
          tenant_id: opportunity.tenant_id,
          company_id: companyId ?? opportunity.company_id,
          customer_party_id: customerPartyId,
          customer_name: '',
          description: '',
          sales_order_id: createdOrder.id,
          project_manager_id: pmUser?.id,
          manager_name: pmUser?.full_name ?? pmUser?.username ?? '',
          project_code: `PRJ-CRM-OVR-${opportunity.id.slice(0, 6).toUpperCase()}`,
          project_name: `[OVERRIDE] ${opportunity.opportunity_name ?? 'Project'}`,
          budget_amount: dealAmount,
          status: 'PLANNED',
          // Executive override also converts an opportunity into an approved order.
          lifecycle_status: 'VERIFIED',
          stage_entered_at: new Date(),
          verified_at: new Date(),
          verified_by: user?.id ?? null,
          health_status: 'GOOD',
          source_type: 'CRM',
        },
      });

      if (pmUser) {
        await tx.project_member.create({
          data: {
            id: crypto.randomUUID(),
            tenant_id: opportunity.tenant_id,
            company_id: companyId ?? opportunity.company_id,
            created_by_id: user?.id,
            project_id: createdProject.id,
            user_id: pmUser.id,
            project_role: 'PROJECT_MANAGER',
            status: 'ACTIVE',
            permissions_json: '{}',
          },
        });
      }

      return {
        success: true,
        message: 'Executive override disetujui.',
        sales_order_id: createdOrder.id,
        project_id: createdProject.id,
      };
    });
  }
}
