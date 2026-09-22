/**
 * Parse a short duration string ("15m", "7d", "24h", "30s", "500ms") into
 * milliseconds. Used to derive a concrete DB expiry Date from the same env
 * string we hand to jsonwebtoken's `expiresIn`.
 */
const UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
}

export function parseDurationMs(input: string): number {
  const match = /^(\d+)(ms|s|m|h|d)$/.exec(input.trim())
  if (!match) {
    throw new Error(`Invalid duration string: "${input}" (expected e.g. "15m", "7d")`)
  }
  const value = Number(match[1])
  const unit = match[2] as keyof typeof UNIT_MS
  return value * UNIT_MS[unit]!
}

/** Convenience: now + duration, as a Date. */
export function expiryDate(duration: string, from: Date = new Date()): Date {
  return new Date(from.getTime() + parseDurationMs(duration))
}
