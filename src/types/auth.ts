import type { Role } from '@prisma/client'

/**
 * Claims embedded in the short-lived JWT access token.
 * Signed by jwt.service (Step 5) and verified by auth.middleware.
 */
export interface AccessTokenPayload {
  sub: string // user id
  email: string
  role: Role
  type: 'access'
}

/**
 * Claims in the long-lived refresh token. `jti` maps to the RefreshToken row
 * so a specific token can be revoked server-side.
 */
export interface RefreshTokenPayload {
  sub: string // user id
  jti: string // RefreshToken.id
  type: 'refresh'
}

/** The authenticated principal attached to `req.user`. */
export interface AuthUser {
  id: string
  email: string
  role: Role
}
