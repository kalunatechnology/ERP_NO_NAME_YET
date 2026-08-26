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
