import winston from 'winston'
import { env, isProd } from './env'

const { combine, timestamp, printf, colorize, errors, json } = winston.format

/**
 * Human-friendly console format for local dev.
 */
const devFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'HH:mm:ss.SSS' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: ts, stack, ...meta }) => {
    const rest = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : ''
    return `${ts} ${level}: ${stack || message}${rest}`
  }),
)

/**
 * Structured JSON for production log aggregation.
 */
const prodFormat = combine(timestamp(), errors({ stack: true }), json())

export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: isProd ? prodFormat : devFormat,
  defaultMeta: { service: 'ai-blogging-backend' },
  transports: [
    new winston.transports.Console({
      stderrLevels: ['error'],
    }),
  ],
  // Don't crash the process on a logging error.
  exitOnError: false,
})

/**
 * Morgan pipes HTTP access logs through here at the `http` level.
 */
export const httpLogStream = {
  write: (message: string) => {
    logger.http(message.trim())
  },
}
