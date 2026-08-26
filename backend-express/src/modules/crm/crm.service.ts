import prisma from '../../config/database';
import { NotFoundError, ValidationError } from '../../utils/errors';

export class CRMService {
  static async qualifyInquiry(inquiryId: string, userId: string) {
    return prisma.$transaction(async (tx) => {
      const inquiry = await tx.crm_customer_inquiry.findUnique({
        where: { id: inquiryId },
      });
      if (!inquiry) throw new NotFoundError('CustomerInquiry');

      let opportunityId = inquiry.opportunity_id;
      if (!opportunityId) {
        const opp = await tx.crm_opportunity.create({
          data: {
            id: crypto.randomUUID(),
            tenant_id: inquiry.tenant_id,
            company_id: inquiry.company_id,
            customer_party_id: inquiry.customer_party_id,
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
    });
  }

  static async calculateEstimate(estimateId: string, userId: string) {
    return prisma.$transaction(async (tx) => {
      const estimate = await tx.crm_cost_estimate.findUnique({
        where: { id: estimateId },
      });
      if (!estimate) throw new NotFoundError('CostEstimate');

      let lines = await tx.crm_cost_estimate_line.findMany({
        where: { estimate_id: estimateId },
      });

      if (lines.length === 0) {
        const directAmt = Number(estimate.direct_cost) > 0 ? Number(estimate.direct_cost) : 100000000;
        await tx.crm_cost_estimate_line.create({
          data: {
            id: crypto.randomUUID(),
            estimate_id: estimateId,
            cost_element: 'MATERIAL',
            description: 'Biaya Langsung Material / Pekerjaan',
            quantity: 1,
            unit_cost: directAmt,
            amount: directAmt,
            calculation_source: 'MANUAL',
          },
        });
        if (Number(estimate.overhead_cost) > 0) {
          await tx.crm_cost_estimate_line.create({
            data: {
              id: crypto.randomUUID(),
              estimate_id: estimateId,
              cost_element: 'OVERHEAD',
              description: 'Biaya Overhead & Operasional',
              quantity: 1,
              unit_cost: Number(estimate.overhead_cost),
              amount: Number(estimate.overhead_cost),
              calculation_source: 'MANUAL',
            },
          });
        }
        lines = await tx.crm_cost_estimate_line.findMany({
          where: { estimate_id: estimateId },
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
      const markupPercent = Number(estimate.markup_percent ?? 0);
      const offered = totalCost * (1 + markupPercent / 100);
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
    });
  }

  static async createQuotationFromEstimate(estimateId: string, userId: string) {
    return prisma.$transaction(async (tx) => {
      let estimate = await tx.crm_cost_estimate.findUnique({
        where: { id: estimateId },
      });
      if (!estimate) throw new NotFoundError('CostEstimate');

      if (estimate.status !== 'CALCULATED' && estimate.status !== 'QUOTED') {
        estimate = await this.calculateEstimate(estimateId, userId);
      }

      const existingVersion = await tx.crm_quotation_version.findFirst({
        where: { estimate_id: estimateId },
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
        const opp = await tx.crm_opportunity.findUnique({
          where: { id: estimate.opportunity_id },
        });
        customerPartyId = opp?.customer_party_id;
      }
      if (!customerPartyId && estimate.inquiry_id) {
        const inq = await tx.crm_customer_inquiry.findUnique({
          where: { id: estimate.inquiry_id },
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
        where: { estimate_id: estimateId },
      });
      const markup = Number(estimate.markup_percent ?? 0) / 100;

      for (const el of estimateLines) {
        const qty = Number(el.quantity ?? 1);
        const lineTotal = Number(el.amount ?? 0) * (1 + markup);
        const unitPrice = qty > 0 ? lineTotal / qty : 0;

        await tx.sales_quotation_line.create({
          data: {
            id: crypto.randomUUID(),
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
    });
  }

  static async calculateCreditSnapshot(customerPartyId: string, companyId?: string | null) {
    const profile = await prisma.master_customer_profile.findFirst({
      where: { party_id: customerPartyId },
    });
    const creditLimit = Number(profile?.credit_limit ?? 0);

    const bills = await prisma.fin_billing_document.findMany({
      where: {
        party_id: customerPartyId,
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

    return prisma.crm_credit_status_snapshot.create({
      data: {
        id: crypto.randomUUID(),
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

  static async processDealWon(opportunityId: string, user: any, explicitCompanyId?: string | null) {
    return prisma.$transaction(async (tx) => {
      const opportunity = await tx.crm_opportunity.findUnique({
        where: { id: opportunityId },
      });
      if (!opportunity) throw new NotFoundError('Opportunity');

      let customerPartyId = opportunity.customer_party_id;
      if (!customerPartyId) {
        const firstParty = await tx.master_party.findFirst({
          where: { status: 'ACTIVE' },
        });
        if (firstParty) {
          customerPartyId = firstParty.id;
          await tx.crm_opportunity.update({
            where: { id: opportunityId },
            data: { customer_party_id: firstParty.id },
          });
        }
      }
      if (!customerPartyId) {
        throw new ValidationError('Opportunity harus memiliki customer party.');
      }

      const companyId = opportunity.company_id ?? explicitCompanyId;

      await tx.crm_opportunity.update({
        where: { id: opportunityId },
        data: {
          status: 'WON',
          pipeline_stage: 'WON',
          probability_percent: 100,
          closed_at: new Date(),
        },
      });

      const snapshot = await this.calculateCreditSnapshot(customerPartyId, companyId);
      const dealAmount = Number(opportunity.expected_amount ?? 0);
      const isSafe =
        snapshot.credit_status !== 'HOLD' &&
        Number(snapshot.available_credit) >= dealAmount &&
        Number(snapshot.overdue_amount) <= 0;

      let createdOrder: any = null;
      let createdProject: any = null;
      let proformaBilling: any = null;

      if (isSafe) {
        const quotation = await tx.sales_quotation.findFirst({
          where: { customer_party_id: customerPartyId },
        });

        createdOrder = await tx.sales_order.create({
          data: {
            id: crypto.randomUUID(),
            customer_party_id: customerPartyId,
            quotation_id: quotation?.id,
            order_date: new Date(),
            total_amount: dealAmount,
            status: 'CONFIRMED',
          },
        });

        const pmUser =
          (await tx.iam_user.findFirst({ where: { username: 'pm' } })) ?? user;

        createdProject = await tx.project_project.create({
          data: {
            id: crypto.randomUUID(),
            tenant_id: opportunity.tenant_id,
            company_id: companyId,
            customer_party_id: customerPartyId,
            customer_name: '',
            description: '',
            sales_order_id: createdOrder.id,
            project_manager_id: pmUser?.id,
            manager_name: pmUser?.full_name ?? pmUser?.username ?? '',
            project_code: `PRJ-CRM-${opportunity.id.slice(0, 6).toUpperCase()}`,
            project_name: opportunity.opportunity_name ?? 'New Project from CRM',
            budget_amount: dealAmount,
            status: 'PLANNED',
            lifecycle_status: 'DRAFT',
            health_status: 'GOOD',
            source_type: 'CRM',
          },
        });

        if (pmUser) {
          await tx.project_member.create({
            data: {
              id: crypto.randomUUID(),
              project_id: createdProject.id,
              user_id: pmUser.id,
              project_role: 'PROJECT_MANAGER',
              status: 'ACTIVE',
              permissions_json: '{}',
            },
          });
        }
      } else {
        proformaBilling = await tx.fin_billing_document.create({
          data: {
            id: crypto.randomUUID(),
            company_id: companyId,
            party_id: customerPartyId,
            billing_type: 'PROFORMA_INVOICE',
            status: 'DRAFT',
            payment_status: 'UNPAID',
            rejection_reason: '',
            total_amount: dealAmount,
            invoice_number: `PROFORMA-${opportunity.id.slice(0, 6).toUpperCase()}`,
          },
        });
      }

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
    });
  }

  static async executiveOverride(opportunityId: string, user: any, companyId?: string | null) {
    return prisma.$transaction(async (tx) => {
      const opportunity = await tx.crm_opportunity.findUnique({
        where: { id: opportunityId },
      });
      if (!opportunity) throw new NotFoundError('Opportunity');

      const customerPartyId = opportunity.customer_party_id;
      const dealAmount = Number(opportunity.expected_amount ?? 0);

      const createdOrder = await tx.sales_order.create({
        data: {
          id: crypto.randomUUID(),
          customer_party_id: customerPartyId,
          order_date: new Date(),
          total_amount: dealAmount,
          status: 'CONFIRMED',
        },
      });

      const pmUser =
        (await tx.iam_user.findFirst({ where: { username: 'pm' } })) ?? user;

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
          lifecycle_status: 'DRAFT',
          health_status: 'GOOD',
          source_type: 'CRM',
        },
      });

      if (pmUser) {
        await tx.project_member.create({
          data: {
            id: crypto.randomUUID(),
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
