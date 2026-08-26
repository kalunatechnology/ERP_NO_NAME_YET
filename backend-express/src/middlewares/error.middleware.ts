import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError } from '../utils/errors';

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
  _req: Request,
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
      detail: err.message,
      ...(err.errors !== undefined ? { errors: err.errors } : {}),
    });
    return;
  }

  // -----------------------------------------------------------------------
  // 2. Prisma Errors
  // -----------------------------------------------------------------------
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      // Unique constraint violation → 409
      case 'P2002': {
        const fields = (err.meta?.['target'] as string[])?.join(', ') ?? 'field';
        res.status(409).json({
          success: false,
          error: 'UNIQUE_CONSTRAINT_ERROR',
          detail: `Data dengan ${fields} yang sama sudah ada.`,
        });
        return;
      }
      // Record not found → 404
      case 'P2025': {
        res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          detail: 'Data tidak ditemukan.',
        });
        return;
      }
      // Foreign key constraint violation → 400
      case 'P2003': {
        res.status(400).json({
          success: false,
          error: 'FOREIGN_KEY_ERROR',
          detail: 'Relasi foreign key tidak valid. Pastikan ID referensi yang diberikan sudah ada.',
        });
        return;
      }
      // Foreign key / required relation violation → 400
      case 'P2014': {
        res.status(400).json({
          success: false,
          error: 'REQUIRED_RELATION_ERROR',
          detail: 'Relasi yang diperlukan tidak ditemukan.',
        });
        return;
      }
      default: {
        console.error('[prisma]', err.code, err.message);
        res.status(400).json({
          success: false,
          error: 'DATABASE_ERROR',
          detail: err.message,
        });
        return;
      }
    }
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      detail: 'Request data tidak valid untuk operasi database.',
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
      errors: fieldErrors,
    });
    return;
  }

  // -----------------------------------------------------------------------
  // 4. Generic / Unknown Errors
  // -----------------------------------------------------------------------
  if (err instanceof Error) {
    console.error('[unhandled]', err.stack ?? err.message);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      detail: process.env['NODE_ENV'] === 'production'
        ? 'Terjadi kesalahan internal server.'
        : err.message,
    });
    return;
  }

  res.status(500).json({
    success: false,
    error: 'INTERNAL_SERVER_ERROR',
    detail: 'Terjadi kesalahan internal server.',
  });
}
