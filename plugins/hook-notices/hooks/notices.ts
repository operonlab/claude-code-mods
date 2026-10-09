import type { HookNotice } from '../types'
import type { Strings } from './strings'

export function parseNotices(text: string): HookNotice[] {
  const notices: HookNotice[] = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try {
      const value: unknown = JSON.parse(line)
      if (typeof value !== 'object' || value === null) continue
      const entry = value as Record<string, unknown>
      if (typeof entry.ts !== 'string' || typeof entry.event !== 'string' || typeof entry.text !== 'string') continue
      notices.push({ ts: entry.ts, event: entry.event, level: entry.level === 'alert' ? 'alert' : 'info', text: entry.text })
    } catch {
      // An incomplete or malformed line must not hide later notices.
    }
  }
  return notices
}

export function headline(text: string, max = 80): string {
  const first = (text.split(/\r?\n/).map(line => line.trim()).find(Boolean) ?? '').replace(/^(?:[·⚠]\s*|#+\s+)/u, '')
  const chars = Array.from(first)
  return chars.length > max ? `${chars.slice(0, Math.max(0, max - 1)).join('')}…` : first
}

/** The one-line summary: all read, or the unread count with the alert to look at first. */
export function bandLabel(list: HookNotice[], seen: number, s: Strings): string {
  const unseen = list.slice(seen)
  if (unseen.length === 0) return s.bandRead(list.length)
  const alerts = unseen.filter(item => item.level === 'alert').length
  const lead = unseen.findLast(item => item.level === 'alert') ?? unseen.at(-1)
  return s.bandUnread(unseen.length, alerts, headline(lead?.text ?? ''))
}

export function formatNotice(text: string): { title: string; details: string[] } {
  const lines = text.split(/\r?\n/)
    .filter(line => line.trim())
    .map(line => line.trimEnd().trimStart()
      .replace(/^[·⚠]\s*/u, '')
      .replace(/^#+\s+/, '')
      .replace(/\*\*/g, '')
      .replace(/^[-*] /, '• '))
    .filter(Boolean)
  return { title: lines[0] ?? '', details: lines.slice(1) }
}

// East Asian wide and fullwidth ranges plus emoji: a terminal cell pair each.
const WIDE = /[\u1100-\u115F\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6\u{1F300}-\u{1FAFF}\u{20000}-\u{3FFFD}]/u

/** Terminal cells a string takes: wide characters count two. */
export function cellWidth(text: string): number {
  let width = 0
  for (const char of text) width += WIDE.test(char) ? 2 : 1
  return width
}

/**
 * One row of exactly `width` cells: the text (cut with … when it must be), then the
 * action at the right end. Drawn as one Button, the whole row is the tap target; a
 * phone column is about 4px wide, too narrow to aim at a short label.
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
