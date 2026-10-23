// East Asian wide and fullwidth ranges plus emoji: a terminal cell pair each.
const WIDE = /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦\u{1F300}-\u{1FAFF}\u{20000}-\u{3FFFD}]/u

/** Terminal cells a string takes: wide characters count two. */
export function cellWidth(text: string): number {
  let width = 0
  for (const char of text) width += WIDE.test(char) ? 2 : 1
  return width
}

/** Cut with … when needed, then pad the whole tap target to `width` cells. */
export function fitRow(text: string, width: number): string {
  let body = text
  if (cellWidth(body) > width) {
    let out = ''
    for (const char of body) {
      if (cellWidth(out + char) > width - 1) break
      out += char
    }
    body = `${out}…`
  }
  return body + ' '.repeat(Math.max(0, width - cellWidth(body)))
}

// Narrower than this, a line cut to share the row says too little; each keeps a row.
export const MIN_SHARED = 26
// The shared row reserves ` │ ` (3 cells) plus the 4 cells each line leaves at the right.
const SHARED_EXTRA = 7

/**
 * Each line's width when they share the row, or undefined when they keep a row each.
 * The navigator line takes what its text needs, at least MIN_SHARED and at most half;
 * the hook line, whose headline is the longer read, takes the rest.
 * Returns [navigator width, hook width] in display order.
 */
export function sharedWidths(bodyColumns: number, navNeeds: number): [number, number] | undefined {
  const room = bodyColumns - SHARED_EXTRA
  const nav = Math.min(Math.max(MIN_SHARED, navNeeds), Math.floor(room / 2))
  return nav < MIN_SHARED ? undefined : [nav, room - nav]
}
