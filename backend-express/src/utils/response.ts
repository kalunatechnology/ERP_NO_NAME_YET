/**
 * File: backend-express/src/utils/response.ts
 *
 * Purpose: Implements shared utility responsibilities in the backend application.
 * Responsibility: Owns the contracts declared here and connects them to framework discovery or explicit imports without changing unrelated domain state.
 * Integration: Consumers reach this file through static imports, framework conventions, or an explicit script entry point.
 * Dependencies and side effects: Function-level documentation identifies HTTP, database, browser-state, and security effects where they occur.
 */
import { Request, Response } from 'express';
import { env } from '../config/env';

/**
 * DRF-compatible pagination envelope.
 * Matches: { count, next, previous, results }
 */
export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

/**
 * Build DRF-style paginated response from a flat array.
 */
export function paginateArray<T>(
  req: Request,
  items: T[],
  totalCount: number,
  page: number,
  pageSize: number,
): PaginatedResponse<T> {
  const base = `${req.protocol}://${req.get('host')}${req.path}`;
  const totalPages = Math.ceil(totalCount / pageSize);

/**
 * buildUrl implements this file's named function contract.
 *
 * @param input - Uses the typed parameters declared by the signature.
 * @returns The value or Promise declared by the implementation.
 * Database: no direct Prisma operation is present in this function; persistence may be delegated to an imported service.
 * Failure/side effects: propagates validation, authorization, persistence, or dependency failures according to the existing caller contract.
 */
  const buildUrl = (p: number) => {
    const params = new URLSearchParams(req.query as Record<string, string>);
    params.set('page', String(p));
    return `${base}?${params.toString()}`;
  };

  return {
    count: totalCount,
    next: page < totalPages ? buildUrl(page + 1) : null,
    previous: page > 1 ? buildUrl(page - 1) : null,
    results: items,
  };
}

/**
 * Parse pagination parameters from request query.
 */
export function parsePagination(req: Request): { page: number; pageSize: number; skip: number } {
  const page = Math.max(1, parseInt(String(req.query['page'] ?? '1'), 10) || 1);
  const requestedSize = parseInt(String(req.query['page_size'] ?? String(env.PAGE_SIZE)), 10) || env.PAGE_SIZE;
  const pageSize = Math.min(requestedSize, env.MAX_PAGE_SIZE);
  const skip = (page - 1) * pageSize;
  return { page, pageSize, skip };
}

/**
 * Standard success response.
 */
export function sendSuccess(res: Response, data: unknown, statusCode = 200): void {
  res.status(statusCode).json(data);
}

/**
 * Standard created response.
 */
export function sendCreated(res: Response, data: unknown): void {
  res.status(201).json(data);
}

/**
 * DRF-compatible error response:
 *   { success: false, detail: string, errors?: any }
 */
export function sendError(
  res: Response,
  message: string,
  statusCode = 400,
  errors?: unknown,
): void {
  const body: Record<string, unknown> = {
    success: false,
    detail: message,
  };
  if (errors !== undefined) {
    body['errors'] = errors;
  }
  res.status(statusCode).json(body);
}

/**
 * Validation error response (matches DRF 400 format).
 */
export function sendValidationError(res: Response, errors: unknown): void {
  res.status(400).json({
    success: false,
    status_code: 400,
    errors,
  });
}

/**
 * Protected relation error (matches Django ProtectedError handler).
 */
export function sendProtectedError(res: Response, referencedEntities: string[]): void {
  const detail =
    `Data tidak dapat dihapus karena masih digunakan atau terikat dengan entitas lain ` +
    `(${referencedEntities.join(', ')}). Harap selesaikan atau hapus relasi terkait terlebih dahulu.`;
  res.status(400).json({
    success: false,
    error: 'PROTECTED_RELATION_ERROR',
    message: detail,
    detail,
    referenced_entities: referencedEntities,
  });
}

/**
 * Delete success response (matches Django 200 OK on soft-delete).
 */
export function sendDeleteSuccess(res: Response): void {
  res.status(200).json({ success: true, message: 'Data berhasil dihapus.' });
}
