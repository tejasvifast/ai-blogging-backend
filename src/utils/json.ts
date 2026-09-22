/**
 * Extract the first JSON object/array from an LLM response, tolerating
 * ```json fences and surrounding prose. Throws if nothing parses.
 */
export function extractJson<T = unknown>(raw: string): T {
  const trimmed = raw.trim()

  // Strip a ```json ... ``` (or bare ```) fence if present.
  const fenced = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(trimmed)
  const candidate = fenced?.[1]?.trim() ?? trimmed

  // Fast path: whole thing is valid JSON.
  try {
    return JSON.parse(candidate) as T
  } catch {
    // Fall through to bracket slicing.
  }

  // Slice from the first { or [ to its matching last } or ].
  const firstObj = candidate.indexOf('{')
  const firstArr = candidate.indexOf('[')
  const start =
    firstObj === -1 ? firstArr : firstArr === -1 ? firstObj : Math.min(firstObj, firstArr)
  if (start === -1) throw new Error('No JSON found in model response')

  const openChar = candidate[start]
  const closeChar = openChar === '{' ? '}' : ']'
  const end = candidate.lastIndexOf(closeChar)
  if (end <= start) throw new Error('Malformed JSON in model response')

  return JSON.parse(candidate.slice(start, end + 1)) as T
}
