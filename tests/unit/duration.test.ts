import { parseDurationMs, expiryDate } from '../../src/utils/duration'

describe('parseDurationMs', () => {
  it.each([
    ['15m', 15 * 60 * 1000],
    ['7d', 7 * 24 * 60 * 60 * 1000],
    ['24h', 24 * 60 * 60 * 1000],
    ['30s', 30 * 1000],
    ['500ms', 500],
  ])('parses %s', (input, expected) => {
    expect(parseDurationMs(input)).toBe(expected)
  })

  it.each(['15', 'm', '15x', '', 'abc', '-5m'])('rejects "%s"', (bad) => {
    expect(() => parseDurationMs(bad)).toThrow()
  })
})

describe('expiryDate', () => {
  it('adds the duration to the base date', () => {
    const base = new Date('2026-01-01T00:00:00.000Z')
    expect(expiryDate('1h', base).toISOString()).toBe('2026-01-01T01:00:00.000Z')
  })
})
