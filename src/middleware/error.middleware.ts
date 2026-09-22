import type { ErrorRequestHandler, RequestHandler } from 'express'
import { Prisma } from '@prisma/client'
import { ZodError } from 'zod'
import { AppError, NotFoundError } from '../utils/errors'
import { logger } from '../config/logger'
import { isProd } from '../config/env'

/**
 * 404 handler — mounted after all routes. Turns "no route matched" into a
 * normal AppError so it flows through the same envelope below.
 */
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(`Route not found: ${req.method} ${req.originalUrl}`))
}

/** Map known third-party errors onto our AppError shape. */
function normalize(err: unknown): AppError {
  if (err instanceof AppError) return err

  // Zod — thrown when we validate outside the validate middleware.
  if (err instanceof ZodError) {
    return new AppError('Validation failed', 422, 'VALIDATION_ERROR', true, err.flatten())
  }

  // Prisma known request errors → friendly HTTP codes.
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002': // unique constraint
        return new AppError(
          `A record with this ${(err.meta?.target as string[])?.join(', ') ?? 'value'} already exists`,
          409,
          'CONFLICT',
          true,
        )
      case 'P2025': // record not found
        return new AppError('Resource not found', 404, 'NOT_FOUND', true)
      case 'P2003': // foreign key constraint
        return new AppError('Related resource does not exist', 400, 'BAD_REQUEST', true)
      default:
        return new AppError('Database request failed', 400, 'DB_ERROR', true, { code: err.code })
    }
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    return new AppError('Invalid database query', 400, 'DB_VALIDATION_ERROR', true)
  }

  // Unknown → non-operational 500.
  const message = err instanceof Error ? err.message : 'Unexpected error'
  return new AppError(message, 500, 'INTERNAL_ERROR', false)
}

/**
 * Global error handler — the last middleware. Must keep all four args so
 * Express recognizes it as an error handler.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const appErr = normalize(err)

  const logMeta = {
    reqId: req.id,
    method: req.method,
    path: req.originalUrl,
    statusCode: appErr.statusCode,
    code: appErr.code,
  }

  if (appErr.statusCode >= 500 || !appErr.isOperational) {
    logger.error(appErr.message, { ...logMeta, stack: appErr.stack })
  } else {
    logger.warn(appErr.message, logMeta)
  }

  const body: Record<string, unknown> = {
    success: false,
    error: {
      code: appErr.code,
      message:
        appErr.isOperational || !isProd ? appErr.message : 'Something went wrong on our end',
    },
  }

  // Attach validation/detail payloads for operational errors only.
  if (appErr.details && appErr.isOperational) {
    ;(body.error as Record<string, unknown>).details = appErr.details
  }

  // Never leak stack traces in production.
  if (!isProd && appErr.stack) {
    ;(body.error as Record<string, unknown>).stack = appErr.stack
  }

  res.status(appErr.statusCode).json(body)
}
