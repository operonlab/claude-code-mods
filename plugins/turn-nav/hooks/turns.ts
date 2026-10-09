export function promptText(content: unknown): string {
  try {
    const text = typeof content === 'string' ? content : Array.isArray(content)
      ? content.filter(block => block && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string')
        .map(block => block.text).join('\n')
      : ''
    return text.replace(/^\s*<system-reminder>[\s\S]*?<\/system-reminder>\s*/, '')
  } catch {
    return ''
  }
}

// East Asian wide and fullwidth ranges plus emoji: a terminal cell pair each.
const WIDE = /[\u1100-\u115F\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6\u{1F300}-\u{1FAFF}\u{20000}-\u{3FFFD}]/u

/** Terminal cells a string takes: wide characters count two. */
export function cellWidth(text: string): number {
  let width = 0
  for (const char of text) width += WIDE.test(char) ? 2 : 1
  return width
}

/** `n first-line`, cut to `width` terminal cells (at least 8) with an ellipsis. */
export function label(n: number, text: string, width: number): string {
  const first = text.split(/\r?\n/).map(line => line.replace(/\s+/g, ' ').trim()).find(Boolean) ?? ''
  const full = `${n} ${first}`
  const limit = Math.max(8, width)
  if (cellWidth(full) <= limit) return full
  let out = ''
  for (const char of full) {
    if (cellWidth(out + char) > limit - 1) break
    out += char
  }
  return `${out}…`
}

/**
 * A turn's row of exactly `width` cells, `›` at the right end. Drawn as one Button,
 * the whole row is the tap target; a phone column is about 4px wide, too narrow to
 * aim at the short label alone.
 */
/** The one-line summary: how many prompts, and the newest one's first line. */
export function navLabel(list: { text: string }[], s: import('./strings').Strings): string {
  const newest = list.at(-1)?.text.split(/\r?\n/).map(line => line.replace(/\s+/g, ' ').trim()).find(Boolean)
  return s.navLabel(list.length, newest)
}

/** `text`, padding, then ` action ›`: exactly `width` cells, text cut with … when it must be. */
export function fitLine(text: string, action: string, width: number): string {
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

export function rowLabel(n: number, text: string, width: number): string {
  const base = label(n, text, width - 2)
  return base + ' '.repeat(Math.max(1, width - 1 - cellWidth(base))) + '›'
}

// The engine moves transcript rows only in the fullscreen layout; on the main screen
// the terminal's own scrollback holds them and it answers this deny.
const NOT_FULLSCREEN = 'transcript not scrollable here'

/** What to tell the person when a jump is refused, naming fullscreen only when that is why. */
export function denyMessage(deny: string, s: import('./strings').Strings): string {
  return deny === NOT_FULLSCREEN ? s.denyFullscreen : `${s.denyPrefix}${deny}`
}
