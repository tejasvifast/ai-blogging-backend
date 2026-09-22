import { PrismaClient, Prisma } from '@prisma/client'
import { isProd, isDev } from './env'
import { logger } from './logger'

/**
 * Single Prisma instance for the whole process.
 *
 * In dev, `tsx watch` reloads modules on every change; without caching on
 * `globalThis` we'd leak a new pool of DB connections on each reload and
 * eventually exhaust Neon's connection limit.
 */
// Factory so the cached client keeps its log-event generic — otherwise the
// global widens to the base PrismaClient and $on() event names type as `never`.
const createPrismaClient = () =>
  new PrismaClient({
    log: [
      { level: 'query', emit: 'event' },
      { level: 'error', emit: 'event' },
      { level: 'warn', emit: 'event' },
    ],
  })

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

// Route Prisma's internal logs through Winston.
prisma.$on('error', (e: Prisma.LogEvent) =>
  logger.error('prisma error', { target: e.target, message: e.message }),
)
if (isDev) {
  prisma.$on('warn', (e: Prisma.LogEvent) => logger.warn('prisma warn', { message: e.message }))
  prisma.$on('query', (e: Prisma.QueryEvent) =>
    logger.debug('prisma query', { query: e.query, params: e.params, durationMs: e.duration }),
  )
}

if (!isProd) globalForPrisma.prisma = prisma

/**
 * Verify connectivity at boot so we fail fast on a bad DATABASE_URL.
 */
export async function connectDatabase(): Promise<void> {
  await prisma.$connect()
  logger.info('✅ Database connected')
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect()
  logger.info('Database disconnected')
}
