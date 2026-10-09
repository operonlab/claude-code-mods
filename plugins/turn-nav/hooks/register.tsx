import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import type { Turn, TurnNavChip } from '../types'
import { denyMessage, fitLine, navLabel, promptText, rowLabel } from './turns'
import { stringsFor } from './strings'
import type { Strings } from './strings'

const PANE = 'turn-nav'
// rows sizes the block seated above the prompt (narrow or main-screen terminals);
// columns sizes the dock beside a fullscreen transcript (110 columns and up).
const turns = atom({ plugin: 'turn-nav', key: 'turns' } as const, [] as Turn[])
// Bumped on every open and close so the prompt band re-reads whether the pane is drawn.
const paneTick = atom({ plugin: 'turn-nav', key: 'paneTick' } as const, 0)
// This mod's line as the prompt-band mod draws it in the row it shares; null while
// there is nothing to show. prompt-band cannot list this mod's panes, so it is told.
// ponytail: a pane waiting undrawn that a widened terminal places leaves the line up
// until the next publish (no event says so); the press then just reopens it.
const chip = atom({ plugin: 'turn-nav', key: 'chip' } as const, null as TurnNavChip | null)

// Keep the newest turn in view; a pane not drawn yet has nothing to scroll.
async function showNewest($: EngineInterface): Promise<void> {
  await $.ui.scroll({ in: PANE, to: 'end' }).catch(() => undefined)
}

// open: the pane; collapsed: one line above the prompt (the pane's close mark);
// off: nothing until /turn-nav. Remembered for new sessions.
type Mode = 'open' | 'collapsed' | 'off'

async function readMode($: EngineInterface): Promise<Mode> {
  const mode = await $.store.get('mode')
  if (mode === 'open' || mode === 'collapsed' || mode === 'off') return mode
  // Before modes, a close by the pane's mark was stored as isOpen: false.
  return (await $.store.get('isOpen')) === false ? 'collapsed' : 'open'
}

async function setMode($: EngineInterface, mode: Mode, s: Strings): Promise<void> {
  await $.store.set('mode', mode)
  await update($, paneTick, n => n + 1)
  await publish($, s)
}

async function publish($: EngineInterface, s: Strings): Promise<void> {
  const isPlaced = (await $.ui.panes()).some(p => p.id === PANE && p.isPlaced)
  const next = isPlaced || (await readMode($)) === 'off' ? null : { label: navLabel(await read($, turns), s), action: s.action }
  await update($, chip, () => next)
}

// Set by the prompt-band mod, which then draws this mod's line in the row it shares.
async function hasPromptBand($: EngineInterface): Promise<boolean> {
  return (await $.env.get('PROMPT_BAND')) === '1'
}

async function openPane($: EngineInterface, open: { id: typeof PANE; title: string; rows: 6; columns: 32 }, s: Strings): Promise<void> {
  await $.ui.open(open)
  await showNewest($)
  await setMode($, 'open', s)
}

async function turnOff($: EngineInterface, s: Strings): Promise<void> {
  if ((await $.ui.panes()).some(p => p.id === PANE)) await $.ui.close({ id: PANE })
  await setMode($, 'off', s)
}

export const register: Register = (on, options) => {
  const s = stringsFor(options?.language)
  const open = { id: PANE, title: s.title, rows: 6, columns: 32 } as const
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'turn-nav', description: 'Show or hide the prompt navigator (remembered for new sessions)' })
    // An open nobody asked for is drawn only on a wide terminal; narrower, the band offers it.
    if ((await readMode($)) === 'open') void $.ui.open(open).then(() => showNewest($)).then(() => update($, paneTick, n => n + 1)).then(() => publish($, s))
      // The session can end before this open settles; nothing is left to redraw then.
      .catch(() => undefined)
    await publish($, s)
    return next(e)
  })

  // ponytail: only prompts appended this run; a resumed session's earlier prompts are not listed
  on('session.append', { door: 'prompt' }, async ($, e, next) => {
    const stored = await next(e)
    try {
      const id = 'uuid' in stored ? stored.uuid : undefined
      const isPersons = e.origin.kind === 'composer' || e.origin.kind === 'bridge'
      if (id && isPersons && !e.agentId) {
        const text = promptText(e.message.content)
        if (text) {
          await update($, turns, list => [...list, { id, text }].slice(-200))
          await publish($, s)
          void showNewest($)
        }
      }
    } catch {
      // Navigation bookkeeping must not interrupt the transcript append.
    }
    return stored
  })

  on('command.run', { command: 'turn-nav' }, async $ => {
    // Only a drawn pane is turned off; collapsed, off, or waiting undrawn, it opens.
    if ((await $.ui.panes()).some(p => p.id === PANE && p.isPlaced)) {
      await turnOff($, s)
      return { text: s.off }
    }
    await openPane($, open, s)
    return { text: s.on }
  })

  on('ui.close', async ($, e, next) => {
    // The engine skips a hook that returns nothing and says so in the transcript.
    const result = await next(e)
    if (e.id === PANE) {
      if (e.origin.kind === 'person') await setMode($, 'collapsed', s)
      else {
        await update($, paneTick, n => n + 1)
        await publish($, s)
      }
    }
    return result
  })

  // prompt-band's line for this mod: opened here, inside the person's press, the pane is
  // placed at any width (opened from any later event it would wait below 144 columns).
  on('ui.press', { plugin: 'prompt-band', element: 'turn-nav' }, async ($, e, next) => {
    await openPane($, open, s)
    return next(e)
  })

  on('ui.press', { plugin: 'prompt-band', element: 'turn-nav-off' }, async ($, e, next) => {
    await turnOff($, s)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await hasPromptBand($))) return next(e)
    await read($, paneTick)
    if ((await readMode($)) === 'off') return next(e)
    const pane = (await $.ui.panes()).find(p => p.id === PANE)
    if (pane?.isPlaced) return next(e)
    const { Box, Button } = $.ui.resolve(e)
    const list = await read($, turns)
    const below = await next(e)
    // Same shape as the hook line above it (icon name · count · newest, › at the
    // same column); the ✕ sits where that line has the engine's [-].
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" columnGap={1}>
          {/* No hotkey: a plain Button draws one as `n: ` ahead of the label. */}
          <Button key="nav-open" plain dimColor label={fitLine(navLabel(list, s), s.action, Math.max(24, e.props.bodyColumns - 4))} onPress={() => openPane($, open, s)} />
          <Button key="nav-off" plain dimColor label="✕" onPress={() => turnOff($, s)} />
        </Box>
        {below}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const list = await read($, turns)
    if (list.length === 0) return <Text dimColor>{s.empty}</Text>
    const width = e.props.bodyColumns
    return <Box flexDirection="column">
      {e.viewport?.isFullscreen === false && <Text dimColor wrap="truncate-end">{s.notFullscreen}</Text>}
      {list.map((turn, i) => <Button key={`turn-${i}`} plain label={rowLabel(i + 1, turn.text, width - 1)} onPress={async () => {
        const result = await $.ui.scroll({ to: { requestId: turn.id }, block: 'start' })
        if (result.deny) $.ui.toast(denyMessage(result.deny, s))
      }} />)}
    </Box>
  })
}
