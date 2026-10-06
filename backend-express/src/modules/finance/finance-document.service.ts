import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { NotFoundError, ValidationError } from '../../utils/errors';

export type EnsureFinanceDocumentInput = {
  tenantId: string | null;
  companyId: string | null;
  userId: string | null;

  documentType: string;
  documentNumber: string;

  documentDate?: Date | null;
  postingDate?: Date | null;
  status?: string;

  existingDocumentId?: string | null;
};

/**
 * Semua fin_journal_entry.source_document_id wajib menunjuk ke
 * core_business_document.id.
 *
 * Service ini menjadi satu-satunya pintu untuk memastikan source document
 * keuangan valid.
 */
export class FinanceDocumentService {
  static async ensure(
    tx: Prisma.TransactionClient,
    input: EnsureFinanceDocumentInput,
  ) {
    const documentNumber = input.documentNumber.trim();

    if (!documentNumber) {
      throw new ValidationError('Nomor business document wajib diisi.');
    }

    // Jika domain object sudah mempunyai document_id, validasi dahulu.
    if (input.existingDocumentId) {
      const existingById = await tx.core_business_document.findFirst({
        where: {
          id: input.existingDocumentId,
          company_id: input.companyId,
        },
      });

      if (!existingById) {
        throw new NotFoundError('BusinessDocument');
      }

      if (
        input.tenantId &&
        existingById.tenant_id &&
        existingById.tenant_id !== input.tenantId
      ) {
        throw new ValidationError(
          'Business document berada di tenant yang berbeda.',
        );
      }

      return existingById;
    }

    // Idempotency guard.
    const existing = await tx.core_business_document.findFirst({
      where: {
        company_id: input.companyId,
        document_type: input.documentType,
        document_number: documentNumber,
      },
    });

    if (existing) {
      if (
        input.tenantId &&
        existing.tenant_id &&
        existing.tenant_id !== input.tenantId
      ) {
        throw new ValidationError(
          'Nomor business document sudah digunakan tenant lain.',
        );
      }

      return existing;
    }

    const now = new Date();

    return tx.core_business_document.create({
      data: {
        id: crypto.randomUUID(),

        tenant_id: input.tenantId,
        company_id: input.companyId,
        created_by_id: input.userId,

        document_type: input.documentType,
        document_number: documentNumber,

        status: input.status ?? 'DRAFT',
        document_date: input.documentDate ?? now,
        posting_date: input.postingDate ?? null,

        version: 1,

        created_by: input.userId,
        posted_by:
          (input.status ?? 'DRAFT') === 'POSTED'
            ? input.userId
            : null,

        created_at: now,
        updated_at: now,
      },
    });
  }

  static async markPosted(
    tx: Prisma.TransactionClient,
    documentId: string,
    userId: string,
    postingDate: Date,
  ) {
    return tx.core_business_document.update({
      where: { id: documentId },
      data: {
        status: 'POSTED',
        posting_date: postingDate,
        posted_by: userId,
        updated_at: postingDate,
      },
    });
  }
}
