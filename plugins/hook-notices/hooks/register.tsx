import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import type { HookNotice, HookNoticesChip } from '../types'
import { bandLabel, fitRow, formatNotice, parseNotices } from './notices'
import { stringsFor } from './strings'
import type { Strings } from './strings'

const PANE = 'hook-notices'
// rows sizes the block seated above the prompt (narrow or main-screen terminals);
// columns sizes the dock beside a fullscreen transcript (110 columns and up).
const notices = atom({ plugin: 'hook-notices', key: 'notices' } as const, [] as HookNotice[])
const seen = atom({ plugin: 'hook-notices', key: 'seen' } as const, 0)
// Bumped on every open and close so the prompt band re-reads whether the pane is drawn.
const paneTick = atom({ plugin: 'hook-notices', key: 'paneTick' } as const, 0)
// This mod's line as the prompt-band mod draws it in the row it shares; null while
// there is nothing to show. prompt-band cannot list this mod's panes, so it is told.
const chip = atom({ plugin: 'hook-notices', key: 'chip' } as const, null as HookNoticesChip | null)
let isPolling = false
let lastSize: number | undefined
// How many notices the pane last drew; closing it marks those read, not any the poll
// added after that draw.
let shown = 0

async function poll($: EngineInterface, s: Strings): Promise<void> {
  if (isPolling) return
  isPolling = true
  try {
    const dir = (await $.env.get('HOOK_NOTICES_DIR')) || `${await $.env.get('HOME')}/.claude/data/hook-notices`
    const path = `${dir}/${await $.session.id()}.jsonl`
    if (!(await $.fs.exists(path))) return
    const { size } = await $.fs.stat(path)
    if (size === lastSize) return
    const text = await $.fs.read(path)
    lastSize = size
    await update($, notices, () => parseNotices(text))
    await publish($, s)
  } finally {
    isPolling = false
  }
}

async function isPlaced($: EngineInterface): Promise<boolean> {
  return (await $.ui.panes()).some(p => p.id === PANE && p.isPlaced)
}

async function publish($: EngineInterface, s: Strings): Promise<void> {
  const list = await read($, notices)
  const next = list.length === 0 || (await isPlaced($)) ? null : { label: bandLabel(list, await read($, seen), s), action: s.action }
  await update($, chip, () => next)
}

// Set by the prompt-band mod, which then draws this mod's line in the row it shares.
async function hasPromptBand($: EngineInterface): Promise<boolean> {
  return (await $.env.get('PROMPT_BAND')) === '1'
}

async function openPane($: EngineInterface, open: { id: typeof PANE; title: string; rows: 12; columns: 48 }, s: Strings): Promise<void> {
  await $.ui.open(open)
  await update($, paneTick, n => n + 1)
  await publish($, s)
}

// Whatever the pane drew counts as read once it closes; marking twice is harmless.
async function markRead($: EngineInterface, s: Strings): Promise<void> {
  await update($, seen, count => Math.max(count, shown))
  await update($, paneTick, n => n + 1)
  await publish($, s)
}

export const register: Register = (on, options) => {
  const s = stringsFor(options?.language)
  const open = { id: PANE, title: s.title, rows: 12, columns: 48 } as const
  on('session.start', async ($, e, next) => {
    await $.env.set('HOOK_NOTICES_SINK', '1')
    await $.command.register({ name: 'hook-notices', description: "Show or hide this session's hook messages" })
    lastSize = undefined
    shown = 0
    // A reload drops this mod's pane without telling its hooks; the line it published
    // while the pane was up would keep the shared row from offering it again.
    await publish($, s)
    $.clock.every(1000, () => poll($, s))
    return next(e)
  })

  on('command.run', { command: 'hook-notices' }, async $ => {
    if (await isPlaced($)) {
      await $.ui.close({ id: PANE })
      await markRead($, s)
      return { text: s.folded }
    }
    await openPane($, open, s)
    return { text: s.open }
  })

  // prompt-band's line for this mod: opened here, inside the person's press, the pane is
  // placed at any width (opened from any later event it would wait below 144 columns).
  on('ui.press', { plugin: 'prompt-band', element: 'hook-notices' }, async ($, e, next) => {
    await openPane($, open, s)
    return next(e)
  })

  on('ui.close', async ($, e, next) => {
    const result = await next(e)
    // The engine's own close (`unload`: the mod unloaded or its drawing threw) is not
    // sent to the opener's hooks; the check only keeps that close from marking anything.
    if (e.id === PANE && e.origin.kind !== 'unload') await markRead($, s)
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await hasPromptBand($))) return next(e)
    await read($, paneTick)
    const list = await read($, notices)
    if (list.length === 0 || (await isPlaced($))) return next(e)
    const { Box, Button } = $.ui.resolve(e)
    const below = await next(e)
    // No hotkey on this row: a plain Button draws one as `h: ` ahead of the label.
    // Three cells stay free at the right so the › lines up with the navigator line's ✕.
    const width = Math.max(24, e.props.bodyColumns - 4)
    return (
      <Box flexDirection="column">
        <Button key="open" plain dimColor label={fitRow(bandLabel(list, await read($, seen), s), s.action, width)} onPress={() => openPane($, open, s)} />
        {below}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const list = await read($, notices)
    shown = list.length
    if (list.length === 0) return <Text dimColor>{s.empty}</Text>
    return (
      <Box flexDirection="column">
        {list.slice().reverse().map((item, index) => {
          const { title, details } = formatNotice(item.text)
          const isAlert = item.level === 'alert'
          return (
            // Padding, not leading spaces, indents the body: a wrapped line keeps the indent.
            <Box key={`notice-${index}`} flexDirection="column" marginTop={index > 0 ? 1 : 0}>
              {/* The icon gets a fixed two cells: measured as its own Text, ⚠ lost its space. */}
              <Box flexDirection="row">
                <Box width={2} flexShrink={0}><Text bold color={isAlert ? 'warning' : undefined}>{isAlert ? '⚠' : '•'}</Text></Box>
                <Box flexGrow={1} flexShrink={1}><Text bold color={isAlert ? 'warning' : undefined}>{title}</Text></Box>
              </Box>
              <Box flexDirection="column" paddingLeft={2}>
                <Text dimColor>{item.event} · {new Date(item.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</Text>
                {details.map((detail, detailIndex) => <Text key={`detail-${detailIndex}`}>{detail}</Text>)}
              </Box>
            </Box>
          )
        })}
      </Box>
    )
  })
}
