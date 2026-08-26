import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

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
