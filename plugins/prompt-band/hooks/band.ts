// East Asian wide and fullwidth ranges plus emoji: a terminal cell pair each.
const WIDE = /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦\u{1F300}-\u{1FAFF}\u{20000}-\u{3FFFD}]/u

/** Terminal cells a string takes: wide characters count two. */
export function cellWidth(text: string): number {
  let width = 0
  for (const char of text) width += WIDE.test(char) ? 2 : 1
  return width
}

/**
 * `text`, padding, then ` action ›`: exactly `width` cells, the text cut with … when it
 * must be. Drawn as one Button, the whole span is the tap target; a phone column is
 * about 4px wide, too narrow to aim at the short label alone.
 */
export function fitRow(text: string, action: string, width: number): string {
  const tail = ` ${action} ›`
  const room = width - cellWidth(tail) - 1
  let body = text
  if (cellWidth(body) > room) {
    let out = ''
    for (const char of body) {
      if (cellWidth(out + char) > room - 1) break
      out += char
    }
    body = `${out}…`
  }
  return body + ' '.repeat(Math.max(1, width - cellWidth(body) - cellWidth(tail))) + tail
}

// Narrower than this, a line cut to share the row says too little; each keeps a row.
export const MIN_SHARED = 26
// The shared row: the hook line, ` │ `, the navigator line, ` ✕`. It ends where the
// navigator's own row ends (its line, a gap, ✕), two cells short of the band's width.
const SHARED_EXTRA = 7

/**
 * Each line's width when they share the row, or undefined when they keep a row each.
 * The navigator line takes what its text needs, at least MIN_SHARED and at most half;
 * the hook line, whose headline is the longer read, takes the rest.
 */
export function sharedWidths(bodyColumns: number, navNeeds: number): [number, number] | undefined {
  const room = bodyColumns - SHARED_EXTRA
  const nav = Math.min(Math.max(MIN_SHARED, navNeeds), Math.floor(room / 2))
  return nav < MIN_SHARED ? undefined : [room - nav, nav]
}
