import { Resend } from 'resend'
import { env } from '../config/env'
import { logger } from '../config/logger'

const configured = Boolean(env.RESEND_API_KEY)
const resend = configured ? new Resend(env.RESEND_API_KEY) : null

export interface EmailInput {
  to: string
  subject: string
  html: string
  text?: string
}

/**
 * Send a transactional email via Resend. When Resend isn't configured, logs
 * and no-ops (returns false) so local dev / tests don't require a key.
 * Never throws — email failures shouldn't break the calling flow.
 */
export async function sendEmail(input: EmailInput): Promise<boolean> {
  if (!resend) {
    logger.warn('email skipped — RESEND_API_KEY not configured', { to: input.to, subject: input.subject })
    return false
  }

  try {
    const { error } = await resend.emails.send({
      from: env.FROM_EMAIL,
      to: input.to,
      subject: input.subject,
      html: input.html,
      ...(input.text ? { text: input.text } : {}),
    })
    if (error) {
      logger.error('email send failed', { to: input.to, error: error.message })
      return false
    }
    logger.debug('email sent', { to: input.to, subject: input.subject })
    return true
  } catch (err) {
    logger.error('email send threw', {
      to: input.to,
      error: err instanceof Error ? err.message : String(err),
    })
    return false
  }
}
