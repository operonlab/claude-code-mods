import type { NavItem } from '../types'

export type Found = Omit<NavItem, 'seq'>

// East Asian wide and fullwidth ranges plus emoji: a terminal cell pair each (turn-nav's table).
const WIDE = /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦\u{1F300}-\u{1FAFF}\u{20000}-\u{3FFFD}]/u

/** Terminal cells a string takes: wide characters count two. */
export function cellWidth(text: string): number {
  let width = 0
  for (const char of text) width += WIDE.test(char) ? 2 : 1
  return width
}

/** Cut with … when needed, then pad to `width` cells, so the whole row is the tap target. */
export function fitLine(text: string, width: number): string {
  let body = text.replace(/\s+/g, ' ')
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

// Code is not read for links: a URL inside a command or a log is not one the reply hands over.
const CODE = /```[\s\S]*?```|`[^`\n]*`/g
// An address may hold one level of parentheses, as Wikipedia's do: /wiki/Foo_(bar).
const MD_LINK = /\[([^\]\n]*)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g
const BARE = /\bhttps?:\/\/[^\s<>"'`\]]+/g
const TRAILING = /[.,;:!?。，、；：！？）》」』]+$/

const blank = (text: string) => ' '.repeat(text.length)
const count = (text: string, char: string) => text.split(char).length - 1

/** A bare URL less the punctuation after it and a `)` that closes the prose around it, not the URL. */
function trimUrl(raw: string): string {
  let url = raw.replace(TRAILING, '')
  while (url.endsWith(')') && count(url, '(') < count(url, ')')) url = url.slice(0, -1).replace(TRAILING, '')
  return url
}

function decode(text: string): string {
  try {
    return decodeURI(text)
  } catch {
    return text
  }
}

function shortDir(dir: string, home: string | undefined): string {
  return home && (dir === home || dir.startsWith(`${home}/`)) ? `~${dir.slice(home.length)}` : dir
}

/** A file the session sent; a relative path is read against `cwd`, as SendUserFile reads it. */
export function fileItem(path: string, jump: string | undefined, cwd: string, home: string | undefined): Found {
  const abs = path.startsWith('/') ? path
    : path.startsWith('~/') && home ? `${home}${path.slice(1)}`
    : `${cwd.replace(/\/+$/, '')}/${path.replace(/^\.\//, '')}`
  const at = abs.replace(/\/+$/, '').lastIndexOf('/')
  const dir = abs.slice(0, at) || '/'
  return { kind: 'file', href: `file://${encodeURI(abs)}`, label: abs.slice(at + 1), where: shortDir(dir, home), ...(jump ? { jump } : {}) }
}

/** The files of one SendUserFile call; anything that is not a list of paths gives none. */
export function fileItems(files: unknown, jump: string | undefined, cwd: string, home: string | undefined): Found[] {
  return Array.isArray(files) ? files.filter((f): f is string => typeof f === 'string' && f.length > 0).map(f => fileItem(f, jump, cwd, home)) : []
}

/** One link; a file:// one becomes a file, so it meets the same file sent as a card under one address. */
export function linkItem(href: string, text: string, jump: string | undefined, home: string | undefined): Found | undefined {
  if (href.startsWith('file://')) return fileItem(decode(href.slice('file://'.length)), jump, '/', home)
  const host = /^https?:\/\/([^/?#\s]+)/.exec(href)?.[1]
  if (!host) return undefined
  const own = text.trim()
  return { kind: 'url', href, label: own && own !== href ? own : href.replace(/^https?:\/\//, ''), where: host, ...(jump ? { jump } : {}) }
}

/** The markdown links and bare http(s) URLs of a reply's text, code left out, in the order written. */
export function linkItems(text: string, jump: string | undefined, home: string | undefined): Found[] {
  // Blanked to the same length, so every find keeps its place in the text.
  const hits: { at: number; item: Found }[] = []
  const rest = text.replace(CODE, blank).replace(MD_LINK, (whole: string, label: string, href: string, at: number) => {
    const item = linkItem(href, label, jump, home)
    if (item) hits.push({ at, item })
    return blank(whole)
  })
  for (const match of rest.matchAll(BARE)) {
    const item = linkItem(trimUrl(match[0]), '', jump, home)
    if (item) hits.push({ at: match.index ?? 0, item })
  }
  return hits.sort((a, b) => a.at - b.at).map(hit => hit.item)
}

const isBare = (item: Found) => item.kind === 'url' && item.label === item.href.replace(/^https?:\/\//, '')

/**
 * New finds merged into the list by address: a find already listed moves to newest and keeps the jump it had
 * when the find brings none (a reload's re-read of the transcript knows no reply row ids). Keeps the newest `keep`.
 */
export function mergeItems(list: NavItem[], found: Found[], keep = 500): NavItem[] {
  let seq = list.reduce((top, item) => Math.max(top, item.seq), 0)
  const byHref = new Map(list.map(item => [item.href, item]))
  for (const item of found) {
    const old = byHref.get(item.href)
    seq += 1
    const jump = item.jump ?? old?.jump
    const at = item.at ?? old?.at
    const label = old && isBare(item) ? old.label : item.label
    byHref.set(item.href, { ...item, label, seq, ...(jump ? { jump } : {}), ...(at === undefined ? {} : { at }) })
  }
  return [...byHref.values()].sort((a, b) => a.seq - b.seq).slice(-keep)
}

/**
 * How well `query` matches `text`, or -1: each whitespace-separated token must appear in order (letters may
 * have gaps); adjacent letters, letters opening a word and a token found whole score more.
 * Twin of turn-nav's hooks/fuzzy.ts: change both.
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

// A file's encoded address would match latin letters out of %E4%B8 runs; its name and folder say it all.
const haystack = (item: NavItem) => item.kind === 'file' ? `${item.label} ${item.where}` : `${item.label} ${item.href}`

/** Newest first; with a query, the matches only, best first. */
export function filterItems(list: NavItem[], query: string): NavItem[] {
  const newest = [...list].sort((a, b) => b.seq - a.seq)
  if (!query.trim()) return newest
  return newest
    .map(item => ({ item, score: fuzzyScore(query, haystack(item)) }))
    .filter(hit => hit.score >= 0)
    .sort((a, b) => b.score - a.score || b.item.seq - a.item.seq)
    .map(hit => hit.item)
}

const pad = (v: number) => String(v).padStart(2, '0')

/** `HH:MM` in local time; `MM-DD HH:MM` when `at` is not on the same day as `now`. Twin of turn-nav's stamp. */
export function stamp(at: number, now: number): string {
  const d = new Date(at)
  const n = new Date(now)
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const sameDay = d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()
  return sameDay ? time : `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${time}`
}

/** Each item's number in order of arrival, 1 for the first, kept while a search reorders the rows. */
export function arrivalNumbers(list: NavItem[]): Map<string, number> {
  return new Map([...list].sort((a, b) => a.seq - b.seq).map((item, i) => [item.href, i + 1]))
}

/** A row: its number, the time it came, kind, name, then where it lives, fitted to `width` cells. */
export function rowText(item: NavItem, n: number, now: number, width: number): string {
  const when = item.at === undefined ? '' : `${stamp(item.at, now)} `
  return fitLine(`${n} ${when}${item.kind === 'file' ? '📄' : '🔗'} ${item.label} · ${item.where}`, width)
}

/** What `open` is handed: a file's own path, or the URL. */
export function openTarget(item: NavItem): string {
  return item.kind === 'file' ? decode(item.href.slice('file://'.length)) : item.href
}

// Files `open` would run or install rather than show. Any reply can link one (a prompt injection in a page the model
// read is enough), so a press reveals these in Finder instead of opening them.
const RUNS = /\.(app|command|tool|terminal|sh|zsh|bash|py|rb|pl|scpt|scptd|applescript|workflow|action|pkg|mpkg|dmg|jar|exe|bat|ps1|webloc|inetloc|fileloc)\/?$/i

/** The argv for a press, and whether it only reveals the file. */
export function openArgs(item: NavItem): { argv: string[]; revealed: boolean } {
  const target = openTarget(item)
  const revealed = item.kind === 'file' && RUNS.test(target)
  return { argv: ['/usr/bin/open', ...(revealed ? ['-R'] : []), target], revealed }
}

// The engine moves transcript rows only in the fullscreen layout; elsewhere it answers this deny.
const NOT_FULLSCREEN = 'transcript not scrollable here'

export function denyMessage(deny: string, s: { denyFullscreen: string; denyPrefix: string }): string {
  return deny === NOT_FULLSCREEN ? s.denyFullscreen : `${s.denyPrefix}${deny}`
}
