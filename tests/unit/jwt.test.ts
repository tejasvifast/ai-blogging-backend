import { signRefreshToken, verifyRefreshToken } from '../../src/modules/auth/jwt.service'

describe('jwt.service refresh tokens', () => {
  it('round-trips a refresh token', () => {
    const token = signRefreshToken('user-123', 'jti-abc')
    const payload = verifyRefreshToken(token)
    expect(payload.sub).toBe('user-123')
    expect(payload.jti).toBe('jti-abc')
    expect(payload.type).toBe('refresh')
  })

  it('rejects a tampered token', () => {
    const token = signRefreshToken('user-123', 'jti-abc')
    expect(() => verifyRefreshToken(token + 'tampered')).toThrow()
  })

  it('rejects a garbage token', () => {
    expect(() => verifyRefreshToken('not-a-jwt')).toThrow()
  })
})
