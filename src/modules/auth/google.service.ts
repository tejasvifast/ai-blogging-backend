import { OAuth2Client } from 'google-auth-library'
import { env } from '../../config/env'
import { UnauthorizedError } from '../../utils/errors'

const client = new OAuth2Client(env.GOOGLE_CLIENT_ID)

export interface GoogleProfile {
  googleId: string
  email: string
  name: string
  avatar?: string
  emailVerified: boolean
}

/**
 * Verify a Google ID token (the credential Auth.js hands the frontend) and
 * return the normalized profile. Throws on any signature/audience/expiry issue.
 */
export async function verifyGoogleToken(idToken: string): Promise<GoogleProfile> {
  let ticket
  try {
    ticket = await client.verifyIdToken({
      idToken,
      audience: env.GOOGLE_CLIENT_ID,
    })
  } catch {
    throw new UnauthorizedError('Invalid Google token')
  }

  const payload = ticket.getPayload()
  if (!payload || !payload.sub || !payload.email) {
    throw new UnauthorizedError('Invalid Google token')
  }

  // Reject unverified Google emails — they can't prove ownership.
  if (payload.email_verified === false) {
    throw new UnauthorizedError('Google email is not verified')
  }

  return {
    googleId: payload.sub,
    email: payload.email.toLowerCase(),
    name: payload.name ?? payload.email.split('@')[0] ?? 'User',
    ...(payload.picture ? { avatar: payload.picture } : {}),
    emailVerified: payload.email_verified ?? false,
  }
}
