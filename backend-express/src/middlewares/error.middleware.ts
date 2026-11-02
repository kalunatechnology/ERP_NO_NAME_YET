/**
 * File: backend-express/src/middlewares/error.middleware.ts
 *
 * Purpose: Implements request middleware responsibilities for the platform domain.
 * Responsibility: Defines the executable contracts in this file and connects them to their callers without owning unrelated domain behavior.
 * Integration: Used through static imports, Express/Next framework discovery, or an explicit npm/script entry point as applicable.
 * Dependencies and side effects: See each documented function; database, browser storage, network, and response mutations are called out where present.
 */
import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError, userFacingMessage } from '../utils/errors';

type DriverAdapterErrorLike =
  Error & {
    cause?: {
      kind?: unknown;
      constraint?: unknown;
      originalCode?: unknown;
      originalMessage?: unknown;
    };
  };

function getDriverAdapterErrorKind(
  err: unknown,
): string | null {
  if (!(err instanceof Error)) {
    return null;
  }

  if (err.name !== 'DriverAdapterError') {
    return null;
  }

  const adapterError =
    err as DriverAdapterErrorLike;

  const kind =
    adapterError.cause?.kind;

  if (typeof kind === 'string') {
    return kind;
  }

  return err.message || null;
}

function readableFieldName(field: string): string {
  const labels: Record<string, string> = {
    customer_party_id: 'pelanggan',
    party_id: 'pelanggan atau rekanan',
    project_id: 'proyek',
    estimate_id: 'estimasi biaya',
    quotation_id: 'quotation',
    invoice_id: 'invoice',
    company_id: 'perusahaan',
    tenant_id: 'ruang kerja',
    user_id: 'pengguna',
    email: 'alamat email',
    phone: 'nomor telepon',
    quantity: 'jumlah',
    amount: 'nominal',
    due_date: 'tanggal jatuh tempo',
    payment_date: 'tanggal pembayaran',
    reference_number: 'nomor referensi',
    invoice_number: 'nomor invoice',
    estimate_number: 'nomor estimasi',
    quotation_code: 'kode quotation',
  };
  if (labels[field]) return labels[field];
  if (field.includes('_')) return 'data terkait';
  return field
    .replace(/_id$/i, '')
    .replace(/_+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLocaleLowerCase('id-ID');
}

/**
 * Global Error Handler Middleware.
 *
 * Handles all error types and returns DRF-compatible response shapes:
 *   - AppError subclasses (NotFoundError, UnauthorizedError, etc.)
 *   - Prisma errors (unique constraints, foreign key violations, not found)
 *   - ZodError (validation failures)
 *   - Generic errors
 *
 * Matches Django's custom_exception_handler behavior.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  // -----------------------------------------------------------------------
  // 1. AppError subclasses (our own typed errors)
  // -----------------------------------------------------------------------
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: err.code,
      detail: userFacingMessage(err.message),
      ...(err.errors !== undefined ? { errors: err.errors } : {}),
      request_id: req.requestId,
    });
    return;
  }

  // -----------------------------------------------------------------------
  // 2. Prisma Errors
  // -----------------------------------------------------------------------
  if (
    err instanceof Prisma.PrismaClientInitializationError ||
    err instanceof Prisma.PrismaClientRustPanicError
  ) {
    console.error('[database-unavailable]', err.message);
    res.status(503).json({
      success: false,
      error: 'DATABASE_UNAVAILABLE',
      detail: 'Layanan database sementara tidak tersedia. Silakan coba kembali.',
      request_id: req.requestId,
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      // Unique constraint violation → 409
      case 'P2002': {
/**
 * fields implements a request-bound security or governance step.
 *
 * Input/output: Reads the Express request/response context, attaches only the identity/scope metadata declared in the implementation, then either calls `next` or rejects the request.
 * Security intent: The check runs before protected business handlers so unauthenticated, cross-company, unauthorized, or invalid requests cannot reach persistence mutations.
 * Data/side effects: May mutate request metadata or the response, as shown in the implementation.
 */
        const target = err.meta?.['target'];
        const fields = Array.isArray(target)
          ? [...new Set(target.map((field) => readableFieldName(String(field))))].join(', ')
          : '';
        res.status(409).json({
          success: false,
          error: 'UNIQUE_CONSTRAINT_ERROR',
          detail: fields
            ? `Data dengan ${fields} yang sama sudah ada. Ubah nilainya atau buka data yang sudah tersedia.`
            : 'Data serupa sudah ada. Periksa kembali nomor atau kode yang dimasukkan.',
          request_id: req.requestId,
        });
        return;
      }
      // Record not found → 404
      case 'P2025': {
        res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          detail: 'Data tidak ditemukan atau sudah berubah. Muat ulang halaman, lalu periksa kembali.',
          request_id: req.requestId,
        });
        return;
      }
      // Foreign key constraint violation → 400
      case 'P2003': {
        res.status(400).json({
          success: false,
          error: 'FOREIGN_KEY_ERROR',
          detail: 'Data belum dapat disimpan karena salah satu pilihan terkait sudah tidak tersedia. Muat ulang halaman, pilih data yang masih tersedia, lalu coba lagi.',
          request_id: req.requestId,
        });
        return;
      }
      // Foreign key / required relation violation → 400
      case 'P2014': {
        res.status(400).json({
          success: false,
          error: 'REQUIRED_RELATION_ERROR',
          detail: 'Lengkapi pilihan data terkait sebelum melanjutkan. Jika pilihan yang diperlukan tidak tersedia, muat ulang halaman.',
          request_id: req.requestId,
        });
        return;
      }
      default: {
        console.error('[prisma]', err.code, err.message);
        res.status(500).json({
          success: false,
          error: 'DATABASE_ERROR',
          detail: 'Data belum dapat diproses. Periksa kembali isian Anda, lalu coba lagi. Jika masalah berulang, hubungi administrator dan sertakan nomor laporan.',
          request_id: req.requestId,
        });
        return;
      }
    }
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      detail: 'Sebagian data belum sesuai. Periksa kembali isian yang wajib diisi, lalu coba lagi.',
      request_id: req.requestId,
    });
    return;
  }

  // -----------------------------------------------------------------------
  // 3. Zod Validation Errors
  // -----------------------------------------------------------------------
  if (err instanceof ZodError) {
    const { fieldErrors } = err.flatten();
    res.status(400).json({
      success: false,
      status_code: 400,
      error: 'VALIDATION_ERROR',
      detail: 'Beberapa isian belum sesuai. Periksa isian yang ditandai, lalu coba lagi.',
      errors: fieldErrors,
      request_id: req.requestId,
    });
    return;
  }

  // -----------------------------------------------------------------------
  // 4. Prisma Driver Adapter Errors (Neon/Pg adapter error interception)
  // -----------------------------------------------------------------------
  const driverAdapterErrorKind = getDriverAdapterErrorKind(err);
  if (driverAdapterErrorKind) {
    console.error('[prisma-driver-adapter]', driverAdapterErrorKind);

    if (driverAdapterErrorKind.includes('ForeignKeyConstraintViolation')) {
      res.status(400).json({
        success: false,
        error: 'FOREIGN_KEY_ERROR',
        detail: 'Data belum dapat disimpan karena salah satu pilihan terkait sudah tidak tersedia. Muat ulang halaman, pilih data yang masih tersedia, lalu coba lagi.',
        request_id: req.requestId,
      });
      return;
    }

    if (driverAdapterErrorKind.includes('UniqueConstraintViolation')) {
      res.status(409).json({
        success: false,
        error: 'UNIQUE_CONSTRAINT_ERROR',
        detail: 'Data serupa sudah ada. Periksa kembali nomor atau kode yang dimasukkan.',
        request_id: req.requestId,
      });
      return;
    }

    res.status(400).json({
      success: false,
      error: 'DATABASE_DRIVER_ERROR',
      detail: 'Data belum berhasil disimpan karena ada informasi terkait yang tidak cocok. Periksa kembali pilihan Anda, lalu coba lagi.',
      request_id: req.requestId,
    });
    return;
  }

  // -----------------------------------------------------------------------
  // 5. Generic / Unknown Errors
  // -----------------------------------------------------------------------
  if (err instanceof Error) {
    console.error('[unhandled]', err.stack ?? err.message);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      detail: 'Permintaan belum berhasil diproses karena kendala sementara. Coba lagi. Jika kendala berulang, hubungi administrator dan sertakan nomor laporan ini.',
      request_id: req.requestId,
    });
    return;
  }

  res.status(500).json({
    success: false,
    error: 'INTERNAL_SERVER_ERROR',
    detail: 'Permintaan belum berhasil diproses karena kendala sementara. Coba lagi. Jika kendala berulang, hubungi administrator dan sertakan nomor laporan ini.',
    request_id: req.requestId,
  });
}
