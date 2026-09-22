import { randomBytes } from 'node:crypto'
import { prisma } from '../../config/database'
import { env } from '../../config/env'
import { logger } from '../../config/logger'
import { BadRequestError } from '../../utils/errors'
import { sendEmail } from '../../utils/email'

const token = () => randomBytes(32).toString('hex')

function verifyUrl(t: string): string {
  return `${env.API_URL}/newsletter/verify?token=${t}`
}
function unsubUrl(t: string): string {
  return `${env.API_URL}/newsletter/unsubscribe?token=${t}`
}

async function sendVerificationEmail(email: string, verifyToken: string, unsubToken: string): Promise<void> {
  await sendEmail({
    to: email,
    subject: 'Confirm your subscription',
    html: `
      <h2>Almost there!</h2>
      <p>Tap the button below to confirm your subscription and start getting our latest posts.</p>
      <p><a href="${verifyUrl(verifyToken)}" style="display:inline-block;padding:10px 18px;background:#3b82f6;color:#fff;border-radius:6px;text-decoration:none">Confirm subscription</a></p>
      <p style="color:#666;font-size:12px">Didn't sign up? Ignore this email, or <a href="${unsubUrl(unsubToken)}">unsubscribe</a>.</p>
    `,
    text: `Confirm your subscription: ${verifyUrl(verifyToken)}`,
  })
}

/**
 * Subscribe an email. Idempotent: verified emails are a no-op, unverified ones
 * get a fresh verification link. Never reveals prior state details beyond the
 * message returned.
 */
export async function subscribe(email: string): Promise<{ status: 'verified' | 'pending' }> {
  const existing = await prisma.newsletter.findUnique({ where: { email } })

  if (existing?.verified) {
    return { status: 'verified' }
  }

  if (existing) {
    // Re-issue a verification token and resend.
    const verifyToken = token()
    await prisma.newsletter.update({ where: { id: existing.id }, data: { verifyToken } })
    await sendVerificationEmail(email, verifyToken, existing.unsubToken)
    return { status: 'pending' }
  }

  const verifyToken = token()
  const unsubToken = token()
  await prisma.newsletter.create({ data: { email, verifyToken, unsubToken } })
  await sendVerificationEmail(email, verifyToken, unsubToken)
  logger.info('newsletter subscription started', { email })
  return { status: 'pending' }
}

export async function verify(verifyToken: string): Promise<void> {
  const sub = await prisma.newsletter.findFirst({ where: { verifyToken } })
  if (!sub) throw new BadRequestError('Invalid or expired verification link')
  await prisma.newsletter.update({
    where: { id: sub.id },
    data: { verified: true, verifyToken: null },
  })
  logger.info('newsletter subscription verified', { email: sub.email })
}

export async function unsubscribe(unsubToken: string): Promise<void> {
  const sub = await prisma.newsletter.findUnique({ where: { unsubToken } })
  if (!sub) throw new BadRequestError('Invalid unsubscribe link')
  await prisma.newsletter.delete({ where: { id: sub.id } })
  logger.info('newsletter unsubscribed', { email: sub.email })
}
