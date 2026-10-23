export type Turn = { id: string; text: string }
/** One line above the prompt: its text as one tap target. */
export type TurnNavChip = { label: string }
/**
 * What reading a resumed session's earlier prompts from its transcript file came to, when it did
 * not give a full list: `none` (the file holds no prompt this mod recognises), `cut` (more than one
 * read could carry; the newest are listed), `failed` (the read itself failed, with why).
 */
export type HistoryNote = { kind: 'none' } | { kind: 'cut' } | { kind: 'failed'; reason: string }

declare module 'claude-code' {
  interface PluginState {
    'turn-nav': { turns: Turn[]; paneTick: number; chip: TurnNavChip | null; history: HistoryNote | null; query: string; transcriptPath: string | null }
  }
}
