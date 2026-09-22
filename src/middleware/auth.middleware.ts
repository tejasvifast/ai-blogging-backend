import type { Request, RequestHandler } from 'express'
import jwt from 'jsonwebtoken'
import type { Role } from '@prisma/client'
import { env } from '../config/env'
import { UnauthorizedError, ForbiddenError } from '../utils/errors'
import type { AccessTokenPayload, AuthUser } from '../types/auth'

/**
 * Pull a bearer token from the Authorization header.
 * Access tokens live in memory on the client and are sent as `Bearer <jwt>`;
 * refresh tokens ride in the httpOnly cookie and are handled by the auth
 * controller, never here.
 */
function extractToken(req: Request): string | null {
  const header = req.headers.authorization
  if (header && header.startsWith('Bearer ')) {
    return header.slice(7).trim()
  }
  return null
}

function verifyAccessToken(token: string): AuthUser {
  let decoded: unknown
  try {
    decoded = jwt.verify(token, env.JWT_ACCESS_SECRET)
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) throw new UnauthorizedError('Access token expired')
    throw new UnauthorizedError('Invalid access token')
  }

  const payload = decoded as AccessTokenPayload
  if (!payload || payload.type !== 'access' || !payload.sub) {
    throw new UnauthorizedError('Malformed access token')
  }

  return { id: payload.sub, email: payload.email, role: payload.role }
}

/**
 * Hard gate — 401 if no valid access token is present.
 */
export const requireAuth: RequestHandler = (req, _res, next) => {
  try {
    const token = extractToken(req)
    if (!token) throw new UnauthorizedError('Authentication required')
    req.user = verifyAccessToken(token)
    next()
  } catch (err) {
    next(err)
  }
}

/**
 * Soft gate — attaches req.user when a valid token exists, but never blocks.
 * Useful for public endpoints that personalize when logged in.
 */
export const optionalAuth: RequestHandler = (req, _res, next) => {
  try {
    const token = extractToken(req)
    if (token) req.user = verifyAccessToken(token)
  } catch {
    // ignore — treat as anonymous
  }
  next()
}

/**
 * Role gate — must run after requireAuth. Passing ADMIN implicitly allows only
 * ADMIN; list every role that should be permitted.
 *
 *   router.post('/', requireAuth, requireRole('ADMIN'), handler)
 */
export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(new UnauthorizedError('Authentication required'))
    if (!roles.includes(req.user.role)) {
      return next(new ForbiddenError('You do not have permission to perform this action'))
    }
    next()
  }
