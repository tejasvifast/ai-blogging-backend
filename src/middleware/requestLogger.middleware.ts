import morgan from 'morgan'
import { randomUUID } from 'node:crypto'
import type { RequestHandler } from 'express'
import { httpLogStream } from '../config/logger'
import { isProd } from '../config/env'

/**
 * Assign a correlation id to every request so log lines (and error responses)
 * can be traced end to end. Honors an inbound `x-request-id` if the proxy set one.
 */
export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.headers['x-request-id']
  const id = (Array.isArray(incoming) ? incoming[0] : incoming) || randomUUID()
  req.id = id
  res.setHeader('x-request-id', id)
  next()
}

// Expose the request id to Morgan tokens.
morgan.token('id', (req) => (req as { id?: string }).id ?? '-')

/**
 * HTTP access logging piped into Winston at the `http` level.
 * Compact combined-ish format in prod, colored dev format locally.
 */
export const httpLogger = morgan(
  isProd
    ? ':id :remote-addr :method :url :status :res[content-length] - :response-time ms'
    : ':id :method :url :status :response-time ms',
  {
    stream: httpLogStream,
    // Health checks would flood the logs; skip them. (morgan types req as the
    // bare IncomingMessage, so read originalUrl off the Express-augmented req.)
    skip: (req) => {
      const url = (req as { originalUrl?: string }).originalUrl ?? req.url
      return url === '/health' || url === '/health/live'
    },
  },
)
