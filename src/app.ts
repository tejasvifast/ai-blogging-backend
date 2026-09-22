import express, { type Application } from 'express'
import helmet from 'helmet'
import cors, { type CorsOptions } from 'cors'
import compression from 'compression'
import cookieParser from 'cookie-parser'
import { env, isProd } from './config/env'
import { logger } from './config/logger'
import { setupSwagger } from './config/swagger'
import { requestId, httpLogger } from './middleware/requestLogger.middleware'
import { generalLimiter } from './middleware/rateLimit.middleware'
import { notFoundHandler, errorHandler } from './middleware/error.middleware'

// Routers
import healthRouter from './modules/health/health.routes'
import authRouter from './modules/auth/auth.routes'
import { publicPostRouter, adminPostRouter } from './modules/posts/posts.routes'
import { publicCategoryRouter, adminCategoryRouter } from './modules/categories/categories.routes'
import { publicTagRouter, adminTagRouter } from './modules/tags/tags.routes'
import { adminAiRouter } from './modules/ai/ai.routes'
import { adminSchedulerRouter } from './modules/scheduler/scheduler.routes'
import { adminRevalidationRouter } from './modules/revalidation/revalidation.routes'
import { newsletterRouter } from './modules/newsletter/newsletter.routes'
import { sitemapRouter } from './modules/sitemap/sitemap.routes'

export function createApp(): Application {
  const app = express()

  // Behind a single reverse proxy (Render/Railway/Fly) — trust it so req.ip
  // and rate limiting see the real client address.
  app.set('trust proxy', 1)
  app.disable('x-powered-by')

  // ── Security ──────────────────────────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          defaultSrc: ["'self'"],
          // Swagger UI (Step 13) needs inline styles/scripts; scoped there.
          scriptSrc: ["'self'"],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: isProd ? [] : null,
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  )

  // CORS — only whitelisted origins, credentials on (for the refresh cookie).
  const allowlist = new Set([env.FRONTEND_URL, ...env.ALLOWED_ORIGINS])
  const corsOptions: CorsOptions = {
    origin(origin, cb) {
      // Allow same-origin / server-to-server (no Origin header) and tools.
      if (!origin || allowlist.has(origin)) return cb(null, true)
      cb(new Error(`Origin not allowed by CORS: ${origin}`))
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id'],
  }
  app.use(cors(corsOptions))

  // ── Parsing & infra ───────────────────────────────────────
  app.use(compression())
  app.use(express.json({ limit: '1mb' }))
  app.use(express.urlencoded({ extended: true, limit: '1mb' }))
  app.use(cookieParser())
  app.use(requestId)
  app.use(httpLogger)

  // ── Routes ────────────────────────────────────────────────
  // Health is unthrottled so orchestrators can probe freely.
  app.use('/health', healthRouter)

  // SEO endpoints (sitemap/rss/robots) are unthrottled + cached — crawlers hit
  // them often and they carry no sensitive data.
  app.use('/', sitemapRouter)

  // General throttle applies to everything below.
  app.use(generalLimiter)

  app.use('/auth', authRouter)
  app.use('/posts', publicPostRouter)
  app.use('/categories', publicCategoryRouter)
  app.use('/tags', publicTagRouter)
  app.use('/newsletter', newsletterRouter)
  app.use('/admin/posts', adminPostRouter)
  app.use('/admin/categories', adminCategoryRouter)
  app.use('/admin/tags', adminTagRouter)
  app.use('/admin/ai', adminAiRouter)
  app.use('/admin/scheduler', adminSchedulerRouter)
  app.use('/admin/revalidate', adminRevalidationRouter)

  app.get('/', (_req, res) => {
    res.json({ name: 'ai-blogging-backend', status: 'ok', docs: '/api/docs' })
  })

  // API documentation (Swagger UI + raw spec).
  setupSwagger(app)

  // ── Errors (must be last) ─────────────────────────────────
  app.use(notFoundHandler)
  app.use(errorHandler)

  logger.debug('Express app configured')
  return app
}
