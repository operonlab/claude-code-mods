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

// How a transcript file marks a row the person sent: `human` as the file writes it today; the live
// event's own kinds too, in case the file follows them. `peer` (another session) and notices are not.
const PERSON = new Set(['human', 'composer', 'bridge'])

/**
 * The person's prompts in transcript-file lines (JSONL), oldest first, the newest `max` kept: rows of
 * the main conversation (no subagent's, no meta row) whose origin is the person. A line that does not
 * parse (the last one when the read was cut) is counted in `unreadable`.
 */
export function historyTurns(lines: string, max = 200): { turns: { id: string; text: string; at?: number }[]; unreadable: number } {
  const turns: { id: string; text: string; at?: number }[] = []
  let unreadable = 0
  for (const line of lines.split('\n')) {
    if (!line.trim()) continue
    let row: any
    try {
      row = JSON.parse(line)
    } catch {
      unreadable += 1
      continue
    }
    if (row?.type !== 'user' || row.isSidechain || row.isMeta || typeof row.uuid !== 'string') continue
    if (!PERSON.has(row.origin?.kind)) continue
    const text = promptText(row.message?.content)
    const at = typeof row.timestamp === 'string' ? Date.parse(row.timestamp) : NaN
    if (text) turns.push({ id: row.uuid, text, ...(Number.isFinite(at) ? { at } : {}) })
  }
  return { turns: turns.slice(-max), unreadable }
}

// East Asian wide and fullwidth ranges plus emoji: a terminal cell pair each.
const WIDE = /[\u1100-\u115F\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6\u{1F300}-\u{1FAFF}\u{20000}-\u{3FFFD}]/u

/** Terminal cells a string takes: wide characters count two. */
export function cellWidth(text: string): number {
  let width = 0
  for (const char of text) width += WIDE.test(char) ? 2 : 1
  return width
}

const pad = (v: number) => String(v).padStart(2, '0')

/** `HH:MM` in local time; `MM-DD HH:MM` when `at` is not on the same day as `now`. Twin of link-nav's stamp. */
export function stamp(at: number, now: number): string {
  const d = new Date(at)
  const n = new Date(now)
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const sameDay = d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()
  return sameDay ? time : `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${time}`
}

/** `n [time] first-line`, cut to `width` terminal cells (at least 8) with an ellipsis. */
export function label(n: number, text: string, width: number, at?: number, now?: number): string {
  const first = text.split(/\r?\n/).map(line => line.replace(/\s+/g, ' ').trim()).find(Boolean) ?? ''
  const when = at === undefined ? '' : `${stamp(at, now ?? at)} `
  const full = `${n} ${when}${first}`
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

/** Cut with … when needed, then pad the whole tap target to `width` cells. */
export function fitLine(text: string, width: number): string {
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

export function rowLabel(n: number, text: string, width: number, at?: number, now?: number): string {
  const base = label(n, text, width - 2, at, now)
  return base + ' '.repeat(Math.max(1, width - 1 - cellWidth(base))) + '›'
}

// The engine moves transcript rows only in the fullscreen layout; on the main screen
// the terminal's own scrollback holds them and it answers this deny.
const NOT_FULLSCREEN = 'transcript not scrollable here'

/** What to tell the person when a jump is refused, naming fullscreen only when that is why. */
export function denyMessage(deny: string, s: import('./strings').Strings): string {
  return deny === NOT_FULLSCREEN ? s.denyFullscreen : `${s.denyPrefix}${deny}`
}
