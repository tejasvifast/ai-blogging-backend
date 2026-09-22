import { Router } from 'express'
import { asyncHandler } from '../../utils/asyncHandler'
import { validate } from '../../middleware/validate.middleware'
import { requireAuth } from '../../middleware/auth.middleware'
import { authLimiter } from '../../middleware/rateLimit.middleware'
import * as controller from './auth.controller'
import { registerSchema, loginSchema, googleAuthSchema } from './auth.validator'

const router = Router()

// Brute-force protection on every auth endpoint (5 req/min).
router.use(authLimiter)

/**
 * @route  POST /auth/register
 * @desc   Create a credentials account and issue tokens
 */
router.post('/register', validate({ body: registerSchema }), asyncHandler(controller.register))

/**
 * @route  POST /auth/login
 * @desc   Email/password login
 */
router.post('/login', validate({ body: loginSchema }), asyncHandler(controller.login))

/**
 * @route  POST /auth/google
 * @desc   Verify a Google ID token, upsert user, issue tokens
 */
router.post('/google', validate({ body: googleAuthSchema }), asyncHandler(controller.google))

/**
 * @route  POST /auth/refresh
 * @desc   Rotate refresh token (cookie or body) -> new access token
 */
router.post('/refresh', asyncHandler(controller.refresh))

/**
 * @route  POST /auth/logout
 * @desc   Revoke the current refresh token
 */
router.post('/logout', asyncHandler(controller.logout))

/**
 * @route  POST /auth/logout-all
 * @desc   Revoke every refresh token for the authenticated user
 */
router.post('/logout-all', requireAuth, asyncHandler(controller.logoutAll))

/**
 * @route  GET /auth/me
 * @desc   Current authenticated user profile
 */
router.get('/me', requireAuth, asyncHandler(controller.me))

export default router
