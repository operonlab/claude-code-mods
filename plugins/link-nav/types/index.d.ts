/** One file or link the session handed over. */
export type NavItem = {
  kind: 'file' | 'url'
  /** What it opens: an http(s) URL, or a file:// URL of an absolute path. */
  href: string
  /** A file's name, or a link's own text. */
  label: string
  /** A file's folder, or a link's host. */
  where: string
  /** The transcript row it came in: a SendUserFile call's tool_use_id, or a reply row's uuid. */
  jump?: string
  /** Order of arrival, newest highest. */
  seq: number
  /** When it was last handed over (ms since the epoch); absent for what a resume read back. */
  at?: number
}

declare module 'claude-code' {
  interface PluginState {
    'link-nav': { items: Shaped<NavItem[]>; query: string; paneTick: number }
  }
}
