/**
 * File: backend-express/src/middlewares/not-found.middleware.ts
 *
 * Purpose: Implements request middleware responsibilities for the platform domain.
 * Responsibility: Defines the executable contracts in this file and connects them to their callers without owning unrelated domain behavior.
 * Integration: Used through static imports, Express/Next framework discovery, or an explicit npm/script entry point as applicable.
 * Dependencies and side effects: See each documented function; database, browser storage, network, and response mutations are called out where present.
 */
import { Request, Response } from 'express';

/**
 * 404 Not Found Middleware.
 * Must be registered AFTER all routes.
 */
export function notFound(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: 'NOT_FOUND',
    detail: `Endpoint ${req.method} ${req.originalUrl} tidak ditemukan.`,
  });
}
