import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

import { logger } from '../lib/logger';
import { ApiError, formatZodError } from '../lib/http';

export function notFoundHandler(_req: Request, _res: Response, next: NextFunction) {
  next(new ApiError(404, 'not_found', 'Resource not found'));
}

export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction,
) {
  void next;

  if (error instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: 'validation_error',
        message: 'Request validation failed',
        details: formatZodError(error),
      },
      requestId: req.id,
    });
  }

  if (error instanceof ApiError) {
    return res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
      requestId: req.id,
    });
  }

  logger.error({ err: error, requestId: req.id }, 'Unhandled API error');

  return res.status(500).json({
    error: {
      code: 'internal_error',
      message: 'Unexpected error',
    },
    requestId: req.id,
  });
}
