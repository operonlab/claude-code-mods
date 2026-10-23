/**
 * How well `query` matches `text`, or -1: each whitespace-separated token must appear in order (letters may
 * have gaps); adjacent letters, letters opening a word and a token found whole score more.
 * Twin of link-nav's fuzzyScore in hooks/links.ts: change both.
 */
export function fuzzyScore(query: string, text: string): number {
  const hay = text.toLowerCase()
  let total = 0
  for (const token of query.toLowerCase().split(/\s+/).filter(Boolean)) {
    let at = -1
    let prev = -2
    for (const char of token) {
      at = hay.indexOf(char, at + 1)
      if (at < 0) return -1
      total += 1 + (at === prev + char.length ? 3 : 0) + (at === 0 || /[\s/._\-·:#]/.test(hay[at - 1] ?? '') ? 2 : 0)
      prev = at
    }
    if (hay.includes(token)) total += 2 * token.length
  }
  return total
}
