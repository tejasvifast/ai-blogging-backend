import type { Response } from 'express'

/**
 * Standard success envelope used by every controller.
 *
 *   { "success": true, "data": <payload>, "meta"?: {...} }
 */
export interface Paginated {
  page: number
  limit: number
  total: number
  totalPages: number
}

export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode = 200,
  meta?: Record<string, unknown>,
): Response {
  return res.status(statusCode).json({
    success: true,
    data,
    ...(meta ? { meta } : {}),
  })
}

export function sendCreated<T>(res: Response, data: T): Response {
  return sendSuccess(res, data, 201)
}

export function sendNoContent(res: Response): Response {
  return res.status(204).send()
}

/** Build pagination meta from query params + a total count. */
export function paginationMeta(page: number, limit: number, total: number): Paginated {
  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  }
}
