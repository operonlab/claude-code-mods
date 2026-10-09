export type Turn = { id: string; text: string }
/** One line above the prompt: its text, and the word for what pressing it does. */
export type TurnNavChip = { label: string; action: string }

declare module 'claude-code' {
  interface PluginState {
    'turn-nav': { turns: Turn[]; paneTick: number; chip: TurnNavChip | null }
  }
}
