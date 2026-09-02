/**
 * Sublime Text–style subsequence filter: query characters must appear in
 * order in the candidate, but need not be contiguous. Higher scores rank first
 * (consecutive runs and path-segment starts preferred).
 */
export function fuzzyScore(text: string, query: string): number | null {
  const q = query.trim().toLowerCase()
  if (!q) return 0

  const t = text.toLowerCase()
  let score = 0
  let ti = 0
  let prevMatch = -2

  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi]
    if (ch === ' ') continue
    const found = t.indexOf(ch, ti)
    if (found === -1) return null

    if (found === prevMatch + 1) score += 5
    const atBoundary =
      found === 0 || '/_-.'.includes(t[found - 1] ?? '')
    if (atBoundary) score += 3
    score += 1

    prevMatch = found
    ti = found + 1
  }

  // Prefer shorter paths when scores otherwise tie.
  return score - t.length * 0.01
}

/** Filter and rank strings by fuzzy subsequence match. Empty query returns items as-is. */
export function fuzzyFilter(items: string[], query: string): string[] {
  const q = query.trim()
  if (!q) return items

  return items
    .map(item => ({ item, score: fuzzyScore(item, q) }))
    .filter((row): row is { item: string; score: number } => row.score !== null)
    .sort((a, b) => b.score - a.score)
    .map(row => row.item)
}
