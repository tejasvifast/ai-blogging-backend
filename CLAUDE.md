# CLAUDE.md — AI Blogging Backend

Guide for working in this repo. Keep it current when architecture changes.

## What this is
REST API for an AI-assisted blogging platform. Serves the public blog reads,
admin CRUD, auth, and an async AI article-generation pipeline. Paired with the
Next.js app in `../ai-blogging-frontend`.

## Stack
- **Node + Express 4.21** (TypeScript, compiled to `dist/`)
- **Prisma 5.22** ORM → **PostgreSQL** (Neon serverless)
- **BullMQ 5** + **ioredis** → Redis (Upstash) for job queue & rate limiting
- **Zod 3** for request validation & env parsing
- **JWT** (jsonwebtoken) access/refresh tokens; **bcryptjs** password hashing
- **@anthropic-ai/sdk** (default) / **openai** for generation
- **Cloudinary** + **Unsplash** for cover images; **Resend** for email
- **helmet**, **cors**, **rate-limit-redis**, **compression**

## Run
```bash
npm run dev        # ts-node-dev, watches src/
npm run build      # tsc → dist/
npm start          # node dist/server.js
npm run worker     # BullMQ worker — REQUIRED for AI generation & cron jobs
npx prisma db push # sync schema.prisma to the DB (no migration files yet)
npx prisma db seed # seed initial data (prisma/seed.ts)
npx prisma studio  # DB browser
```
Env is validated at boot in `src/config/env.ts` (Zod). Missing/invalid vars →
process exits with a printed list. Copy `.env.example` → `.env`.

## Layout
```
src/
  server.ts              # entry: connect DB+Redis, createApp(), listen, graceful shutdown
  app.ts                 # express app: middleware + mounts all module routers
  config/                # env.ts, database.ts (prisma), redis.ts, logger.ts
  middleware/            # auth, error, validate, rateLimit
  modules/<name>/        # feature modules (see pattern below)
  queues/                # postGeneration.queue.ts, worker.ts, connection.ts
  utils/                 # errors.ts, apiResponse.ts, asyncHandler.ts, text.ts
  types/                 # express.d.ts (req.user), auth.ts
prisma/                  # schema.prisma, seed.ts, migrations/ (empty — using db push)
tests/                   # jest
```

## Module pattern (`src/modules/<name>/`)
Each module = `*.routes.ts` → `*.controller.ts` → `*.service.ts` + `*.validator.ts`
(Zod schemas). Routes attach middleware; controllers are thin (`asyncHandler` wraps
them); services hold logic + Prisma calls. Modules: `auth`, `posts`, `categories`,
`tags`, `ai`, `scheduler`, `newsletter`, `revalidation`, `sitemap`, `health`.

## Routing — IMPORTANT
Routers mount at **ROOT, no `/api` prefix** (the frontend hardcodes this).
- Public: `GET /posts`, `/posts/:slug`, `/categories`, `/tags`, `/health`, `/sitemap.xml`, `/rss.xml`, `/robots.txt`
- Auth: `POST /auth/{register,login,google,refresh,logout,logout-all}`, `GET /auth/me`
- Admin posts: `GET/POST /admin/posts`, `GET/PATCH/DELETE /admin/posts/:id`, `POST /admin/posts/:id/publish`
- Admin taxonomy: `POST/PATCH/DELETE /admin/categories/:id?`, same for `/admin/tags`
- AI: `POST /admin/ai/generate`, `GET /admin/ai/jobs/:id`, `GET /admin/ai/logs`
- Scheduler (ADMIN): `.../admin/scheduler/cron-jobs*`, `POST /admin/scheduler/maintenance/:task/run`
- `POST /admin/revalidate` (ADMIN) — triggers frontend ISR webhook

## Auth & roles
- `requireAuth` verifies the Bearer access token, sets `req.user` ({id,email,role}).
- `requireRole('ADMIN','EDITOR')` gates writes. **DELETEs and all scheduler/revalidate
  routes are ADMIN-only**; other `/admin` writes allow EDITOR too.
- Role is computed from the `ADMIN_EMAILS` allowlist on every login/OAuth
  (`resolveRole` in `auth.service.ts`) — whitelisted ⇒ ADMIN, else EDITOR.
- Access token ~15m; refresh token 7d, stored in `RefreshToken` (rotation + reuse
  detection), delivered as an httpOnly cookie.

## Response contract
Success: `{ success: true, data: <T>, meta?: { page, limit, total, totalPages } }`
Error: `{ success: false, error: { code, message, details? } }` where `details.fieldErrors`
holds Zod validation errors. Error classes in `src/utils/errors.ts`
(`BadRequestError`, `NotFoundError`, `ConflictError`, `UnauthorizedError`, …);
the error middleware maps Zod + Prisma (P2002→409, P2025→404, P2003→400).

## Prisma models
`User` (role, provider, googleId), `Post` (status: DRAFT|SCHEDULED|PUBLISHED|ARCHIVED,
slug unique, views, readingTime, SEO fields, isAIGenerated + aiProvider/aiModel,
relations author/category/tags), `Category`, `Tag` (M:N `PostTags`), `CronJob`
(cronExpression + `config` Json), `GenerationLog` (tokens/cost/duration/status),
`RefreshToken`, `Newsletter`. Enums: `Role`, `Provider`, `PostStatus`.

## AI pipeline
`POST /admin/ai/generate` enqueues a BullMQ job (queue `post-generation`, 3 retries,
backoff) → **the separate `npm run worker` process** runs outline → sections → FAQ →
SEO → cover image, writes a `Post` (isAIGenerated) and a `GenerationLog`. Poll
`GET /admin/ai/jobs/:id`. Cron jobs (`CronJob`) enqueue the same pipeline on schedule.
Without the worker running, jobs stay `waiting`.

## Gotchas
- No `/api` prefix — don't add one.
- Neon: use a pooled URL for the app; `prisma db push` targets whatever `DATABASE_URL`
  points at (currently the `production` branch).
- AI/cron do nothing unless the worker process is up.
- `REVALIDATE_SECRET` must match the frontend's for ISR webhooks to authenticate.
