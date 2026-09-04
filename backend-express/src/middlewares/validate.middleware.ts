/**
 * File: backend-express/src/middlewares/validate.middleware.ts
 *
 * Purpose: Implements request middleware responsibilities for the platform domain.
 * Responsibility: Defines the executable contracts in this file and connects them to their callers without owning unrelated domain behavior.
 * Integration: Used through static imports, Express/Next framework discovery, or an explicit npm/script entry point as applicable.
 * Dependencies and side effects: See each documented function; database, browser storage, network, and response mutations are called out where present.
 */
import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

/**
 * validate implements a request-bound security or governance step.
 *
 * Input/output: Reads the Express request/response context, attaches only the identity/scope metadata declared in the implementation, then either calls `next` or rejects the request.
 * Security intent: The check runs before protected business handlers so unauthenticated, cross-company, unauthorized, or invalid requests cannot reach persistence mutations.
 * Data/side effects: May mutate request metadata or the response, as shown in the implementation.
 */
export function validate(
  schema: ZodSchema,
  source: 'body' | 'query' | 'params' = 'body',
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const { fieldErrors } = (result.error as ZodError).flatten();
      res.status(400).json({
        success: false,
        status_code: 400,
        errors: fieldErrors,
      });
      return;
    }
    (req as any)[source] = result.data;
    next();
  };
}

/**
 * validateRequest implements a request-bound security or governance step.
 *
 * Input/output: Reads the Express request/response context, attaches only the identity/scope metadata declared in the implementation, then either calls `next` or rejects the request.
 * Security intent: The check runs before protected business handlers so unauthenticated, cross-company, unauthorized, or invalid requests cannot reach persistence mutations.
 * Data/side effects: May mutate request metadata or the response, as shown in the implementation.
 */
export function validateRequest(schemas: {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const allErrors: Record<string, unknown> = {};

    for (const [source, schema] of Object.entries(schemas) as Array<
      ['body' | 'query' | 'params', ZodSchema]
    >) {
      const result = schema.safeParse(req[source]);
      if (!result.success) {
        const { fieldErrors } = (result.error as ZodError).flatten();
        Object.assign(allErrors, fieldErrors);
      } else {
        (req as any)[source] = result.data;
      }
    }

    if (Object.keys(allErrors).length > 0) {
      res.status(400).json({
        success: false,
        status_code: 400,
        errors: allErrors,
      });
      return;
    }

    next();
  };
}
