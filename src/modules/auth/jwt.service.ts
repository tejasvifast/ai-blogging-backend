import jwt, { type SignOptions } from 'jsonwebtoken'
import type { Role } from '@prisma/client'
import { env } from '../../config/env'
import { UnauthorizedError } from '../../utils/errors'
import type { AccessTokenPayload, RefreshTokenPayload } from '../../types/auth'

interface AccessSubject {
  id: string
  email: string
  role: Role
}

/**
 * Sign a short-lived access token (default 15m). Sent to the client in the
 * JSON body and kept in memory — never persisted server-side.
 */
export function signAccessToken(user: AccessSubject): string {
  const payload: Omit<AccessTokenPayload, 'iat' | 'exp'> = {
    sub: user.id,
    email: user.email,
    role: user.role,
    type: 'access',
  }
  const opts: SignOptions = {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as NonNullable<SignOptions['expiresIn']>,
  }
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, opts)
}

/**
 * Sign a long-lived refresh token (default 7d). `jti` is the RefreshToken row
 * id so the token can be revoked/rotated server-side.
 */
export function signRefreshToken(userId: string, jti: string): string {
  const payload: Omit<RefreshTokenPayload, 'iat' | 'exp'> = {
    sub: userId,
    jti,
    type: 'refresh',
  }
  const opts: SignOptions = {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as NonNullable<SignOptions['expiresIn']>,
  }
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, opts)
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  let decoded: unknown
  try {
    decoded = jwt.verify(token, env.JWT_REFRESH_SECRET)
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) throw new UnauthorizedError('Refresh token expired')
    throw new UnauthorizedError('Invalid refresh token')
  }
  const payload = decoded as RefreshTokenPayload
  if (!payload || payload.type !== 'refresh' || !payload.sub || !payload.jti) {
    throw new UnauthorizedError('Malformed refresh token')
  }
  return payload
}
