export type QuietToolsMode = boolean

declare module 'claude-code' {
  interface PluginState {
    'quiet-tools': { isOn: QuietToolsMode }
  }
}
