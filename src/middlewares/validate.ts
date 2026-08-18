import type { NextFunction, Request, Response } from 'express';
import type { ZodSchema } from 'zod';
import { Errors } from '../utils/ApiError.ts';

type Source = 'body' | 'query' | 'params';

export function validate(schema: ZodSchema, source: Source = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      next(Errors.badRequest('Validation failed', result.error.flatten()));
      return;
    }

    // Express 5: req.query (and sometimes params) are getter-only — cannot assign directly.
    if (source === 'query' || source === 'params') {
      Object.defineProperty(req, source, {
        value: result.data,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    } else {
      req.body = result.data;
    }
    next();
  };
}
