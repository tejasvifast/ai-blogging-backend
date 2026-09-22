import type { Request, Response, NextFunction, RequestHandler } from 'express'

/**
 * Wraps an async route handler so a rejected promise is forwarded to Express's
 * error middleware instead of crashing the process with an unhandled rejection.
 *
 *   router.get('/', asyncHandler(async (req, res) => { ... }))
 */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
