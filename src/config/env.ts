import { config as loadDotenv } from 'dotenv'
import { z } from 'zod'

// Load .env before we read anything off process.env.
loadDotenv()

/**
 * Comma-separated string -> trimmed, de-duped string[].
 * Empty / whitespace-only entries are dropped.
 */
const csv = () =>
  z
    .string()
    .transform((val) =>
      val
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.string()))

const envSchema = z
  .object({
    // ── App ────────────────────────────────────────────────
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    FRONTEND_URL: z.string().url(),
    API_URL: z.string().url(),

    // ── Database ───────────────────────────────────────────
    DATABASE_URL: z.string().url().startsWith('postgres'),

    // ── Redis ──────────────────────────────────────────────
    REDIS_URL: z.string().url(),

    // ── JWT ────────────────────────────────────────────────
    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 chars'),
    JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 chars'),
    JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
    JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
    COOKIE_DOMAIN: z.string().default('localhost'),

    // ── Google OAuth ───────────────────────────────────────
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),

    // ── Admin whitelist ────────────────────────────────────
    ADMIN_EMAILS: csv().default(''),

    // ── AI providers ───────────────────────────────────────
    ANTHROPIC_API_KEY: z.string().optional().default(''),
    OPENAI_API_KEY: z.string().optional().default(''),
    DEFAULT_AI_PROVIDER: z.enum(['anthropic', 'openai']).default('anthropic'),
    DEFAULT_AI_MODEL: z.string().default('claude-haiku-4-5-20251001'),

    // ── Images ─────────────────────────────────────────────
    CLOUDINARY_CLOUD_NAME: z.string().optional().default(''),
    CLOUDINARY_API_KEY: z.string().optional().default(''),
    CLOUDINARY_API_SECRET: z.string().optional().default(''),
    UNSPLASH_ACCESS_KEY: z.string().optional().default(''),

    // ── Email ──────────────────────────────────────────────
    RESEND_API_KEY: z.string().optional().default(''),
    FROM_EMAIL: z.string().email().default('noreply@example.com'),

    // ── Security ───────────────────────────────────────────
    ALLOWED_ORIGINS: csv().default(''),
    BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
    REVALIDATE_SECRET: z.string().min(16, 'REVALIDATE_SECRET must be at least 16 chars'),

    // ── Logging ────────────────────────────────────────────
    LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('info'),
  })
  .superRefine((val, ctx) => {
    // At least the default provider's key must be present outside of tests.
    if (val.NODE_ENV !== 'test') {
      if (val.DEFAULT_AI_PROVIDER === 'anthropic' && !val.ANTHROPIC_API_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ANTHROPIC_API_KEY'],
          message: 'ANTHROPIC_API_KEY is required when DEFAULT_AI_PROVIDER=anthropic',
        })
      }
      if (val.DEFAULT_AI_PROVIDER === 'openai' && !val.OPENAI_API_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['OPENAI_API_KEY'],
          message: 'OPENAI_API_KEY is required when DEFAULT_AI_PROVIDER=openai',
        })
      }
    }
  })

export type Env = z.infer<typeof envSchema>

function parseEnv(): Env {
  const parsed = envSchema.safeParse(process.env)

  if (!parsed.success) {
    // Fail fast with a readable report — no logger yet (it depends on env).
    const issues = parsed.error.issues
      .map((i) => `  • ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n')
    // eslint-disable-next-line no-console
    console.error(`\n❌ Invalid environment configuration:\n${issues}\n`)
    process.exit(1)
  }

  return parsed.data
}

export const env = parseEnv()

export const isProd = env.NODE_ENV === 'production'
export const isDev = env.NODE_ENV === 'development'
export const isTest = env.NODE_ENV === 'test'
