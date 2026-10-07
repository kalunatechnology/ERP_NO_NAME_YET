import crypto from 'crypto';
import { NotFoundError, ValidationError } from '../../utils/errors';

type EnsureCustomerPartyInput = {
  customerName: string;
  companyId: string;
  tenantId: string | null;
  userId: string | null;
};

type EnsureProjectCustomerPartyInput = {
  projectId: string;
  companyId: string;
  userId: string | null;
};

/**
 * Keeps project.customer_party_id aligned with master_party.
 *
 * Legacy projects may only have customer_name populated. This service resolves
 * that name to an ACTIVE CUSTOMER party, creates one when necessary, and
 * backfills project.customer_party_id so Finance can safely use the FK.
 */
export class CustomerPartyService {
  static async ensureByName(db: any, input: EnsureCustomerPartyInput) {
    const customerName = String(input.customerName ?? '').trim();

    if (!customerName) {
      throw new ValidationError('Nama customer wajib diisi.');
    }

    const existing = await db.master_party.findFirst({
      where: {
        company_id: input.companyId,
        ...(input.tenantId ? { tenant_id: input.tenantId } : {}),
        party_type: 'CUSTOMER',
        status: 'ACTIVE',
        OR: [
          { display_name: { equals: customerName, mode: 'insensitive' } },
          { legal_name: { equals: customerName, mode: 'insensitive' } },
        ],
      },
    });

    if (existing) {
      return existing;
    }

    const cleanCode = customerName
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 6)
      .toUpperCase();

    return db.master_party.create({
      data: {
        id: crypto.randomUUID(),
        tenant_id: input.tenantId,
        company_id: input.companyId,
        created_by_id: input.userId,
        party_code: `CUST-${cleanCode || 'CLIENT'}-${Date.now().toString().slice(-6)}`,
        party_type: 'CUSTOMER',
        legal_name: customerName,
        display_name: customerName,
        tax_number: '',
        status: 'ACTIVE',
      },
    });
  }

  static async ensureForProject(db: any, input: EnsureProjectCustomerPartyInput) {
    const project = await db.project_project.findFirst({
      where: {
        id: input.projectId,
        company_id: input.companyId,
      },
    });

    if (!project) {
      throw new NotFoundError('Project');
    }

    if (project.customer_party_id) {
      const linkedParty = await db.master_party.findFirst({
        where: {
          id: project.customer_party_id,
          company_id: input.companyId,
          party_type: 'CUSTOMER',
          status: 'ACTIVE',
        },
      });

      if (linkedParty) {
        return {
          project,
          party: linkedParty,
          backfilled: false,
        };
      }
    }

    const party = await this.ensureByName(db, {
      customerName: project.customer_name,
      companyId: input.companyId,
      tenantId: project.tenant_id,
      userId: input.userId,
    });

    const updatedProject = await db.project_project.update({
      where: { id: project.id },
      data: {
        customer_party_id: party.id,
      },
    });

    return {
      project: updatedProject,
      party,
      backfilled: true,
    };
  }
}
