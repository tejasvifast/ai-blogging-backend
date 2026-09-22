import type { CookieOptions, Request, Response } from 'express'
import { env, isProd } from '../../config/env'
import { parseDurationMs } from '../../utils/duration'
import { sendSuccess, sendCreated } from '../../utils/apiResponse'
import { UnauthorizedError } from '../../utils/errors'
import * as authService from './auth.service'

const REFRESH_COOKIE = 'refreshToken'

/**
 * Refresh-token cookie config.
 *
 * NOTE: SameSite=Strict (per spec) only works when the frontend and API share
 * a site. For a cross-domain production deploy (e.g. app.example.com calling
 * api.example.com over CORS) switch to `sameSite: 'none'` — which requires
 * `secure: true`. That's the single knob to flip here.
 */
function refreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'strict',
    domain: env.COOKIE_DOMAIN,
    path: '/',
    maxAge: parseDurationMs(env.JWT_REFRESH_EXPIRES_IN),
  }
}

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, refreshCookieOptions())
}

function clearRefreshCookie(res: Response): void {
  const { maxAge: _maxAge, ...opts } = refreshCookieOptions()
  res.clearCookie(REFRESH_COOKIE, opts)
}

/** Refresh token can come from the httpOnly cookie or (fallback) the body. */
function readRefreshToken(req: Request): string | undefined {
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies
  return cookies?.[REFRESH_COOKIE] ?? (req.body?.refreshToken as string | undefined)
}

// ── Handlers ───────────────────────────────────────────────────

export async function register(req: Request, res: Response): Promise<void> {
  const { user, accessToken, refreshToken } = await authService.register(req.body)
  setRefreshCookie(res, refreshToken)
  sendCreated(res, { user, accessToken })
}

export async function login(req: Request, res: Response): Promise<void> {
  const { user, accessToken, refreshToken } = await authService.login(req.body)
  setRefreshCookie(res, refreshToken)
  sendSuccess(res, { user, accessToken })
}

export async function google(req: Request, res: Response): Promise<void> {
  const { user, accessToken, refreshToken } = await authService.googleAuth(req.body.idToken)
  setRefreshCookie(res, refreshToken)
  sendSuccess(res, { user, accessToken })
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const token = readRefreshToken(req)
  if (!token) throw new UnauthorizedError('No refresh token provided')
  const { user, accessToken, refreshToken } = await authService.refresh(token)
  setRefreshCookie(res, refreshToken)
  sendSuccess(res, { user, accessToken })
}

export async function logout(req: Request, res: Response): Promise<void> {
  await authService.logout(readRefreshToken(req))
  clearRefreshCookie(res)
  sendSuccess(res, { message: 'Logged out' })
}

export async function logoutAll(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError('Authentication required')
  await authService.logoutAll(req.user.id)
  clearRefreshCookie(res)
  sendSuccess(res, { message: 'Logged out of all sessions' })
}

export async function me(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError('Authentication required')
  const user = await authService.getMe(req.user.id)
  sendSuccess(res, { user })
}
