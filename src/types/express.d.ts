import type { AuthUser } from './auth'

/**
 * Augment Express's Request so `req.user` is typed everywhere after the auth
 * middleware runs. Optional because public routes never set it.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser
      /** Correlation id assigned by requestLogger for tracing. */
      id?: string
    }
  }
}

export {}
