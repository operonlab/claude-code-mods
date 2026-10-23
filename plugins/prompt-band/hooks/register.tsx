import type { Register } from 'claude-code'
import { cellWidth, fitRow, sharedWidths } from './band'

// What hook-notices and turn-nav publish for this row; null when there is nothing to show.
const HOOK = { plugin: 'hook-notices', key: 'chip' } as const
const NAV = { plugin: 'turn-nav', key: 'chip' } as const

// A press is answered by the mod whose line it is, in its ui.press hook: opened there,
// inside the person's press, its pane is placed at any width. These handlers have
// nothing left to do.
const answeredByOwner = () => undefined

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // hook-notices and turn-nav read this and leave their own lines to this row.
    // ponytail: no event tells a mod it unloads, so disabling this mod mid-session
    // leaves both lines hidden until the session restarts.
    await $.env.set('PROMPT_BAND', '1')
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const { value: hook } = await $.state.get(HOOK)
    const { value: nav } = await $.state.get(NAV)
    if (!hook && !nav) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const below = await next(e)
    // No hotkeys: a plain Button draws one as `h: ` ahead of the label.
    const hookLine = (width: number) => hook && <Button key="hook-notices" plain dimColor label={fitRow(hook.label, width)} onPress={answeredByOwner} />
    const navLine = (width: number) => nav && <Button key="turn-nav" plain dimColor label={fitRow(nav.label, width)} onPress={answeredByOwner} />
    const shared = hook && nav ? sharedWidths(e.props.bodyColumns, cellWidth(nav.label) + 1) : undefined

    if (shared) {
      return (
        <Box flexDirection="column">
          <Box flexDirection="row">
            {navLine(shared[0])}
            <Text dimColor> │ </Text>
            {hookLine(shared[1])}
          </Box>
          {below}
        </Box>
      )
    }
    // A row each, as the two mods draw them on their own.
    const width = Math.max(12, e.props.bodyColumns - 4)
    return (
      <Box flexDirection="column">
        {navLine(width)}
        {hookLine(width)}
        {below}
      </Box>
    )
  })
}
