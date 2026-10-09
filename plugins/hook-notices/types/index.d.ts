export type HookNotice = { ts: string; event: string; level: 'alert' | 'info'; text: string }
/** One line above the prompt: its text, and the word for what pressing it does. */
export type HookNoticesChip = { label: string; action: string }

declare module 'claude-code' {
  interface PluginState {
    'hook-notices': { notices: HookNotice[]; seen: number; paneTick: number; chip: HookNoticesChip | null }
  }
}
