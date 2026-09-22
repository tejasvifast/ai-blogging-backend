# AI Auto-Blogging Backend

A production-grade Node.js + TypeScript REST API that powers an AI auto-blogging site: it serves blog content to a Next.js frontend, generates SEO articles with Claude/GPT on a schedule, supports Google OAuth + email/password auth, auto-publishes scheduled posts, and triggers frontend ISR revalidation on content changes.

---

## ✨ Features

- **Content API** — posts, categories, tags with pagination, filtering, search, and public/admin separation.
- **Auth** — email/password (bcrypt) **and Google OAuth**, JWT access tokens + rotating refresh tokens (httpOnly cookie, reuse detection), admin email whitelist.
- **AI generation** — provider abstraction (Claude Haiku default, GPT-4o-mini fallback), multi-step pipeline (outline → sections → FAQ → SEO → cover image), anti-AI-detection prompting, cost logging.
- **Jobs & scheduling** — BullMQ workers; cron-driven generation, `publish-scheduled` (every 5 min), `cleanup-drafts` (daily).
- **SEO** — dynamic `sitemap.xml`, RSS feed, `robots.txt`, ISR revalidation webhooks.
- **Ops** — Zod-validated env, structured logging, health checks, graceful shutdown, Docker, rate limiting, Swagger docs.

---

## 🛠 Tech Stack

| Area | Choice |
|------|--------|
| Runtime | Node.js 20 LTS + TypeScript (strict) |
| Framework | Express 4 |
| Database | PostgreSQL (Neon) via Prisma 5 |
| Cache/Queue | Redis (Upstash) + BullMQ |
| AI | Anthropic SDK (Claude) + OpenAI SDK |
| Auth | jsonwebtoken, bcryptjs, google-auth-library |
| Validation | Zod | 
| Email / Images | Resend, Cloudinary, Unsplash |
| Docs / Tests | Swagger UI, Jest + Supertest |

---

## 📋 Prerequisites

- **Node.js 20 LTS** (`.nvmrc` pins `20` — run `nvm use`). Node 16/18 will not work.
- A **Neon** Postgres database (free tier) — https://neon.tech
- An **Upstash** Redis instance (free tier) — https://upstash.com
- API keys as needed: Anthropic, OpenAI, Google OAuth, Cloudinary, Unsplash, Resend.
- Docker + Docker Compose (optional, for the local one-command stack).

---

## 🚀 Quick Start

### Option A — Docker Compose (Postgres + Redis + API + worker)

```bash
cp .env.example .env          # fill in secrets (AI keys, Google, etc.)
docker compose up --build
```

Compose runs its own Postgres + Redis and overrides `DATABASE_URL`/`REDIS_URL`, so you don't need Neon/Upstash locally. The API applies migrations on boot. Then seed:

```bash
docker compose exec api npx prisma db seed
```

API is at http://localhost:4000, docs at http://localhost:4000/api/docs.

### Option B — Local Node (external Neon + Upstash)

```bash
nvm use                       # Node 20
npm install
cp .env.example .env          # fill in DATABASE_URL, REDIS_URL, secrets

npx prisma migrate dev --name init   # create + apply schema
npm run db:seed                       # admin user + categories + sample posts

npm run dev                   # API (http://localhost:4000)
npm run worker                # in a second terminal — BullMQ worker
```

Default seeded login: the first email in `ADMIN_EMAILS` (or `admin@example.com`) / `ChangeMe123!` — override with `SEED_ADMIN_PASSWORD`.

---

## 🔑 Environment Variables

Copy `.env.example` and fill these in. Env is validated at startup (Zod) — the app **fails fast** with a readable report if anything is missing or malformed.

| Variable | Required | Notes |
|----------|----------|-------|
| `NODE_ENV` | — | `development` \| `test` \| `production` |
| `PORT` | — | default `4000` |
| `FRONTEND_URL` | ✅ | Next.js site URL (CORS + revalidation target) |
| `API_URL` | ✅ | This API's public URL |
| `DATABASE_URL` | ✅ | Neon Postgres connection string (`?sslmode=require`) |
| `REDIS_URL` | ✅ | Upstash `rediss://…` URL |
| `JWT_ACCESS_SECRET` | ✅ | ≥32 chars |
| `JWT_REFRESH_SECRET` | ✅ | ≥32 chars, different from access |
| `JWT_ACCESS_EXPIRES_IN` | — | default `15m` |
| `JWT_REFRESH_EXPIRES_IN` | — | default `7d` |
| `COOKIE_DOMAIN` | — | `localhost` in dev |
| `GOOGLE_CLIENT_ID` | ✅ | from Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | ✅ | from Google Cloud Console |
| `ADMIN_EMAILS` | — | comma-separated; these emails get the `ADMIN` role |
| `ANTHROPIC_API_KEY` | ✅* | required if `DEFAULT_AI_PROVIDER=anthropic` |
| `OPENAI_API_KEY` | ✅* | required if `DEFAULT_AI_PROVIDER=openai` |
| `DEFAULT_AI_PROVIDER` | — | `anthropic` (default) \| `openai` |
| `DEFAULT_AI_MODEL` | — | default `claude-haiku-4-5-20251001` |
| `CLOUDINARY_*`, `UNSPLASH_ACCESS_KEY` | — | cover images (optional — degrades gracefully) |
| `RESEND_API_KEY`, `FROM_EMAIL` | — | newsletter email (optional) |
| `ALLOWED_ORIGINS` | — | extra CORS origins (comma-separated) |
| `BCRYPT_ROUNDS` | — | default `12` |
| `REVALIDATE_SECRET` | ✅ | ≥16 chars; shared with the frontend `/api/revalidate` |
| `LOG_LEVEL` | — | default `info` |

Generate strong secrets: `openssl rand -base64 48`.

> **A note on the AI pricing in the original spec:** it quoted Haiku at "$0.25/1M". Current Claude Haiku 4.5 pricing is **$1.00 in / $5.00 out per 1M** — the cost tracker in `src/modules/ai/cost.ts` uses correct current figures. Update that table if pricing changes.

---

## 🔐 Google OAuth Setup (Google Cloud Console)

1. Go to https://console.cloud.google.com and create (or select) a project.
2. **APIs & Services → OAuth consent screen**:
   - User type: **External**. Fill in app name, support email, developer email.
   - Add scopes: `.../auth/userinfo.email`, `.../auth/userinfo.profile`, `openid`.
   - Add your Google account under **Test users** while in testing.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**.
   - **Authorized JavaScript origins**: your frontend URL (e.g. `http://localhost:3000`, and your production domain).
   - **Authorized redirect URIs**: whatever Auth.js/your frontend uses (e.g. `http://localhost:3000/api/auth/callback/google`).
4. Copy the **Client ID** and **Client Secret** into `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

**How the flow works here:** the frontend performs Google sign-in and obtains a **Google ID token**, then `POST`s `{ idToken }` to `POST /auth/google`. The backend verifies the token with `google-auth-library`, upserts the user, applies the `ADMIN_EMAILS` whitelist (whitelisted → `ADMIN`, others → `EDITOR`), and returns a JWT access token + sets the refresh cookie.

---

## 🗄 Database

```bash
npx prisma migrate dev --name <name>   # create & apply a migration (dev)
npx prisma migrate deploy              # apply migrations (prod / CI)
npm run db:seed                        # seed admin + categories + posts
npx prisma studio                      # inspect data in a browser
```

Schema lives in `prisma/schema.prisma`. Models: `User`, `Post`, `Category`, `Tag`, `CronJob`, `GenerationLog`, `RefreshToken`, `Newsletter`.

---

## 🏃 Running

| Command | What it does |
|---------|--------------|
| `npm run dev` | API with hot reload (tsx) |
| `npm run worker` | BullMQ worker (AI generation + scheduler jobs) |
| `npm run build` | `prisma generate` + `tsc` → `dist/` |
| `npm start` | Run built API (`dist/server.js`) |
| `npm run worker:prod` | Run built worker |
| `npm run typecheck` / `lint` / `format` | Quality gates |
| `npm test` | Jest + Supertest |

**You need two processes in production**: the web server *and* the worker (they scale independently).

---

## 🌐 API Overview

Base URL: `API_URL`. All responses use `{ success, data, meta? }` (success) or `{ success: false, error: { code, message, details? } }`.

- **Auth** — `POST /auth/register`, `/auth/login`, `/auth/google`, `/auth/refresh`, `/auth/logout`, `/auth/logout-all`, `GET /auth/me`
- **Posts** — `GET /posts`, `GET /posts/:slug` · admin: `GET/POST /admin/posts`, `GET/PATCH/DELETE /admin/posts/:id`, `POST /admin/posts/:id/publish`
- **Categories / Tags** — `GET /categories`, `/categories/:slug`, `/tags`, `/tags/:slug` · admin CRUD under `/admin/categories`, `/admin/tags`
- **AI** — `POST /admin/ai/generate` (202 + jobId), `GET /admin/ai/jobs/:id`, `GET /admin/ai/logs`
- **Scheduler** — `/admin/scheduler/cron-jobs` CRUD, `POST /admin/scheduler/cron-jobs/:id/run`, `POST /admin/scheduler/maintenance/:task/run`
- **Newsletter** — `POST /newsletter/subscribe`, `GET /newsletter/verify`, `/unsubscribe`
- **SEO** — `GET /sitemap.xml`, `/rss.xml`, `/robots.txt`
- **Revalidation** — `POST /admin/revalidate`
- **Health** — `GET /health`, `/health/live`, `/health/ready`

📖 **Interactive docs:** `GET /api/docs` (Swagger UI) · raw spec at `/api/docs.json`.

---

## 📁 Project Structure

```
src/
├── config/          env, database, redis, logger, swagger
├── middleware/       auth, error, rateLimit, validate, requestLogger
├── modules/
│   ├── auth/         + google.service, jwt.service
│   ├── posts/ categories/ tags/
│   ├── ai/           providers/, prompts/, cost, image.service
│   ├── scheduler/    jobs/ (generate, publish, cleanup)
│   ├── newsletter/ sitemap/ revalidation/ health/
├── queues/           BullMQ connection, queues, worker.ts
├── utils/            errors, asyncHandler, text, duration, json, sanitize, email
├── types/            auth + express augmentation
├── app.ts            Express app factory
└── server.ts         boot + graceful shutdown
prisma/               schema.prisma + seed.ts
tests/                unit/ + integration/
```

---

## ☁️ Deployment

Includes a multi-stage, non-root **`Dockerfile`**, **`docker-compose.yml`** (local), **`railway.json`**, and **`render.yaml`**.

- **Railway** — deploys via `railway.json` (Dockerfile builder, `/health` check). Add a second service for the worker with start command `node dist/queues/worker.js` and `RUN_MIGRATIONS=false`.
- **Render** — `render.yaml` defines a `web` + `worker` service. Use external Neon/Upstash; set secrets in the dashboard (a shared **Environment Group** linked to both services is easiest). The worker validates the full env schema too, so it needs the same variables.
- **Fly.io** — Dockerfile works as-is; run a separate `worker` process.

**Migrations** run automatically via `docker-entrypoint.sh` when `RUN_MIGRATIONS=true` (set on the API service only — the worker sets it `false` so they don't race).

> **Lockfile:** `package-lock.json` is committed and the `Dockerfile` uses `npm ci` for reproducible builds. Re-run `npm install` and commit the updated lockfile whenever dependencies change.

---

## 🔒 Security

- Helmet with a strict CSP (relaxed only on `/api/docs`), CORS allowlist, `express-rate-limit` (`/auth` 5/min, `/admin/ai/generate` 10/hr, general 100/15min) backed by Redis.
- JWT: 15-min access + 7-day rotating refresh (httpOnly, `Secure` in prod, `SameSite=Strict`), refresh-token **reuse detection**.
- bcrypt (12 rounds), Zod validation on every route, DOMPurify on AI HTML, secrets length-checked at boot.

> **Cross-domain cookies:** `SameSite=Strict` only works when the frontend and API share a site. For `app.example.com` ↔ `api.example.com`, switch the refresh cookie to `SameSite=None; Secure` — see the comment in `src/modules/auth/auth.controller.ts`.

---

## 🧪 Testing

```bash
npm test              # all tests
npm run test:coverage # with coverage
```

Unit tests cover the pure utilities and JWT logic; the integration test drives the Express app via Supertest with infra mocked. For full end-to-end DB tests, point `DATABASE_URL` at a disposable Postgres (e.g. the compose one) and add specs that hit real routes.

---

## 🩺 Troubleshooting

- **`Invalid environment configuration` at boot** — a required env var is missing/malformed; the log lists exactly which.
- **Prisma `Cannot find module '@prisma/client'`** — run `npx prisma generate` (also part of `npm run build`).
- **AI generation stuck in `waiting`** — the worker isn't running. Start `npm run worker`.
- **Redis connection errors** — check `REDIS_URL` (Upstash uses `rediss://`), and that BullMQ's connection has `maxRetriesPerRequest: null` (it does, in `src/queues/connection.ts`).
- **Google auth fails** — verify the ID token's audience matches `GOOGLE_CLIENT_ID` and the email is verified.

---

## 📄 API Contract

The build referenced `docs/API_CONTRACT.md`, which isn't present in this repo. Routes were built to the spec in the project brief. **Drop that file into `docs/` and the routes/response shapes can be reconciled against it.**

## License

MIT
