import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { Role, Provider, type User } from '@prisma/client'
import { prisma } from '../../config/database'
import { env } from '../../config/env'
import { logger } from '../../config/logger'
import { expiryDate } from '../../utils/duration'
import { ConflictError, UnauthorizedError } from '../../utils/errors'
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from './jwt.service'
import { verifyGoogleToken } from './google.service'
import type { RegisterInput, LoginInput } from './auth.validator'

export type SafeUser = Omit<User, 'password'>

export interface AuthResult {
  user: SafeUser
  accessToken: string
  refreshToken: string
}

// ── Helpers ────────────────────────────────────────────────────

/** Whitelisted emails become ADMIN; everyone else is a limited EDITOR. */
function resolveRole(email: string): Role {
  return env.ADMIN_EMAILS.includes(email.toLowerCase()) ? Role.ADMIN : Role.EDITOR
}

function sanitize(user: User): SafeUser {
  const { password: _password, ...safe } = user
  return safe
}

/**
 * Create a persisted refresh-token record and sign both tokens. The row id
 * doubles as the token's `jti`, which is how we revoke/rotate a single token.
 */
async function issueTokens(user: User): Promise<AuthResult> {
  const jti = randomUUID()
  const refreshToken = signRefreshToken(user.id, jti)

  await prisma.refreshToken.create({
    data: {
      id: jti,
      token: refreshToken,
      userId: user.id,
      expiresAt: expiryDate(env.JWT_REFRESH_EXPIRES_IN),
    },
  })

  const accessToken = signAccessToken({ id: user.id, email: user.email, role: user.role })
  return { user: sanitize(user), accessToken, refreshToken }
}

// ── Public API ─────────────────────────────────────────────────

export async function register(input: RegisterInput): Promise<AuthResult> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } })
  if (existing) throw new ConflictError('An account with this email already exists')

  const hashed = await bcrypt.hash(input.password, env.BCRYPT_ROUNDS)
  const user = await prisma.user.create({
    data: {
      email: input.email,
      password: hashed,
      name: input.name,
      role: resolveRole(input.email),
      provider: Provider.CREDENTIALS,
      emailVerified: false,
    },
  })

  logger.info('user registered', { userId: user.id, role: user.role })
  return issueTokens(user)
}

export async function login(input: LoginInput): Promise<AuthResult> {
  const user = await prisma.user.findUnique({ where: { email: input.email } })

  // Google-only accounts have no password. Give a uniform error either way so
  // we don't reveal which emails exist / how they signed up.
  if (!user || !user.password) {
    throw new UnauthorizedError('Invalid email or password')
  }

  const ok = await bcrypt.compare(input.password, user.password)
  if (!ok) throw new UnauthorizedError('Invalid email or password')

  logger.info('user logged in', { userId: user.id })
  return issueTokens(user)
}

/**
 * Verify a Google ID token and upsert the user. The admin whitelist is
 * authoritative: role is (re)computed from ADMIN_EMAILS on every sign-in.
 */
export async function googleAuth(idToken: string): Promise<AuthResult> {
  const profile = await verifyGoogleToken(idToken)
  const role = resolveRole(profile.email)

  // Prefer matching by googleId, then fall back to an existing email account
  // (which we then link to Google).
  let user =
    (await prisma.user.findUnique({ where: { googleId: profile.googleId } })) ??
    (await prisma.user.findUnique({ where: { email: profile.email } }))

  if (user) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        googleId: profile.googleId,
        avatar: user.avatar ?? profile.avatar ?? null,
        emailVerified: user.emailVerified || profile.emailVerified,
        // Whitelist stays authoritative across logins.
        role,
        // If this was a credentials account, mark it as also Google-linked.
        provider: user.provider === Provider.CREDENTIALS ? user.provider : Provider.GOOGLE,
      },
    })
  } else {
    user = await prisma.user.create({
      data: {
        email: profile.email,
        name: profile.name,
        avatar: profile.avatar ?? null,
        googleId: profile.googleId,
        provider: Provider.GOOGLE,
        emailVerified: profile.emailVerified,
        role,
        // password stays null for Google-only accounts
      },
    })
    logger.info('user created via Google', { userId: user.id, role })
  }

  logger.info('google auth success', { userId: user.id, role: user.role })
  return issueTokens(user)
}

/**
 * Rotate a refresh token: validate → detect reuse → revoke old → issue new.
 */
export async function refresh(oldToken: string): Promise<AuthResult> {
  const payload = verifyRefreshToken(oldToken)

  const stored = await prisma.refreshToken.findUnique({ where: { id: payload.jti } })
  if (!stored) throw new UnauthorizedError('Refresh token not recognized')

  // Reuse detection: a revoked token being presented again means it may have
  // been stolen. Nuke every session for that user and force re-login.
  if (stored.revoked) {
    await prisma.refreshToken.updateMany({
      where: { userId: stored.userId, revoked: false },
      data: { revoked: true },
    })
    logger.warn('refresh token reuse detected — revoked all sessions', { userId: stored.userId })
    throw new UnauthorizedError('Refresh token has been revoked')
  }

  if (stored.token !== oldToken || stored.expiresAt < new Date()) {
    throw new UnauthorizedError('Refresh token is no longer valid')
  }

  const user = await prisma.user.findUnique({ where: { id: stored.userId } })
  if (!user) throw new UnauthorizedError('User no longer exists')

  // Revoke the presented token, then mint a fresh pair.
  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revoked: true },
  })

  return issueTokens(user)
}

/** Revoke a single refresh token (logout on this device). */
export async function logout(refreshToken: string | undefined): Promise<void> {
  if (!refreshToken) return
  try {
    const payload = verifyRefreshToken(refreshToken)
    await prisma.refreshToken.updateMany({
      where: { id: payload.jti, revoked: false },
      data: { revoked: true },
    })
  } catch {
    // Token already invalid/expired — nothing to revoke.
  }
}

/** Revoke every refresh token for a user (logout everywhere). */
export async function logoutAll(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revoked: false },
    data: { revoked: true },
  })
}

export async function getMe(userId: string): Promise<SafeUser> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new UnauthorizedError('User no longer exists')
  return sanitize(user)
}
