import { extractJson } from '../../src/utils/json'

describe('extractJson', () => {
  it('parses plain JSON', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 })
  })
  it('parses fenced ```json blocks', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 })
  })
  it('parses bare ``` fences', () => {
    expect(extractJson('```\n[1,2,3]\n```')).toEqual([1, 2, 3])
  })
  it('slices JSON out of surrounding prose', () => {
    expect(extractJson('Sure! Here it is: {"ok":true} — done.')).toEqual({ ok: true })
  })
  it('throws when there is no JSON', () => {
    expect(() => extractJson('no json here')).toThrow()
  })
})
