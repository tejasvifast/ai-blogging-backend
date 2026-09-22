import type { Server } from 'node:http'
import { createApp } from './app'
import { env } from './config/env'
import { logger } from './config/logger'
import { connectDatabase, disconnectDatabase } from './config/database'
import { connectRedis, disconnectRedis } from './config/redis'
import { closeQueues } from './queues'

async function bootstrap(): Promise<void> {
  // Fail fast if a core dependency is unreachable.
  await connectDatabase()
  await connectRedis()

  const app = createApp()
  const server: Server = app.listen(env.PORT, () => {
    logger.info(`🚀 API listening on ${env.API_URL} (port ${env.PORT}, ${env.NODE_ENV})`)
  })

  setupGracefulShutdown(server)
}

function setupGracefulShutdown(server: Server): void {
  let shuttingDown = false

  const shutdown = async (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    logger.info(`${signal} received — shutting down gracefully`)

    // Stop accepting new connections, then drain dependencies.
    server.close(async (err) => {
      if (err) logger.error('Error closing HTTP server', { error: String(err) })
      try {
        await closeQueues()
        await disconnectDatabase()
        await disconnectRedis()
      } catch (e) {
        logger.error('Error during shutdown cleanup', { error: String(e) })
      } finally {
        logger.info('Shutdown complete')
        process.exit(err ? 1 : 0)
      }
    })

    // Hard cap — don't hang forever if a connection won't close.
    setTimeout(() => {
      logger.error('Forced shutdown after timeout')
      process.exit(1)
    }, 10_000).unref()
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', { reason: String(reason) })
  })
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception — exiting', { error: err.message, stack: err.stack })
    process.exit(1)
  })
}

bootstrap().catch((err) => {
  logger.error('Fatal error during bootstrap', {
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  })
  process.exit(1)
})
