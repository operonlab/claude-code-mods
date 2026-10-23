import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import type { NavItem } from '../types'
import { denyMessage, fileItems, filterItems, fitLine, linkItems, mergeItems, openArgs, rowText } from './links'
import type { Found } from './links'
import { stringsFor } from './strings'
import type { Strings } from './strings'

const PANE = 'link-nav'
// Change the tag when NavItem's fields change: it declines what an earlier version stored.
const items = atom({ plugin: 'link-nav', key: 'items' } as const, [] as NavItem[], { shape: 'items-1' })
const query = atom({ plugin: 'link-nav', key: 'query' } as const, '')
// Bumped on every open and close so the line above the prompt re-reads whether the pane is drawn.
const paneTick = atom({ plugin: 'link-nav', key: 'paneTick' } as const, 0)
// ponytail: a long session lists every row; draw the best 200 of a search, the newest 200 without one
const DRAWN = 200

type Mode = 'open' | 'off'

async function readMode($: EngineInterface): Promise<Mode> {
  return (await $.store.get('mode')) === 'off' ? 'off' : 'open'
}

async function home($: EngineInterface): Promise<string | undefined> {
  return (await $.env.get('HOME')) || undefined
}

async function add($: EngineInterface, found: Found[]): Promise<void> {
  if (found.length) await update($, items, list => mergeItems(list, found))
}

// The transcript so far: a resumed session's earlier replies, and on a reload what was listed already.
async function readTranscript($: EngineInterface): Promise<void> {
  const messages = await $.session.messages()
  if (!Array.isArray(messages)) return
  const cwd = await $.session.cwd()
  const h = await home($)
  const found: Found[] = []
  for (const message of messages) {
    if (message.role !== 'assistant') continue
    found.push(...linkItems(message.text, undefined, h))
    for (const use of message.toolUses) {
      if (use.tool === 'SendUserFile' && !use.isError) found.push(...fileItems(use.input.files, use.tool_use_id, cwd, h))
    }
  }
  await add($, found)
}

async function openPane($: EngineInterface, s: Strings): Promise<void> {
  // A pane opened for a look starts unfiltered; it takes the keys so typing searches at once.
  await update($, query, () => '')
  await $.ui.open({ id: PANE, title: s.title, rows: 10, columns: 40, focus: true })
  await update($, paneTick, n => n + 1)
}

async function openItem($: EngineInterface, item: NavItem, s: Strings): Promise<void> {
  // ponytail: macOS `open` on the machine the session runs on; elsewhere the press toasts the error
  const { argv, revealed } = openArgs(item)
  const run = await $.process.run(argv).catch((error: unknown) => ({ exitCode: -1, stderr: String(error) }))
  if (run.exitCode !== 0) $.ui.toast(`${s.openFailed}${run.stderr.trim().slice(0, 200)}`)
  else if (revealed) $.ui.toast(s.revealed)
}

async function jumpTo($: EngineInterface, item: NavItem, s: Strings): Promise<void> {
  if (!item.jump) return
  const result = await $.ui.scroll({ to: { requestId: item.jump }, block: 'start' })
  if (result.deny) $.ui.toast(denyMessage(result.deny, s))
}

export const register: Register = (on, options) => {
  const s = stringsFor(options?.language)

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'link-nav', description: 'Show or hide the files and links of this session (remembered for new sessions)' })
    const started = await next(e)
    try {
      await readTranscript($)
    } catch {
      // Reading back what came before must not hold up the session.
    }
    return started
  })

  // A card's files, with the call's id: the ToolUse row the card is drawn in answers to it.
  on('tool.call', { tool: 'SendUserFile' }, async ($, e, next) => {
    const result = await next(e)
    try {
      // ponytail: a subagent's cards are not listed
      const files = (e as unknown as { files?: unknown }).files
      if (!e.agentId && !('deny' in result) && !('isError' in result && result.isError)) {
        await add($, fileItems(files, e.tool_use_id, await $.session.cwd(), await home($)))
      }
    } catch {
      // Listing must not change what the tool answered.
    }
    return result
  })

  on('session.append', { door: 'response' }, async ($, e, next) => {
    const stored = await next(e)
    try {
      if (!e.agentId) {
        const id = 'uuid' in stored ? stored.uuid : undefined
        const content: unknown = e.message.content
        const text = typeof content === 'string' ? content : Array.isArray(content)
          ? content.filter(block => block && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string')
            .map(block => block.text as string).join('\n')
          : ''
        await add($, linkItems(text, id, await home($)))
      }
    } catch {
      // Listing must not interrupt the transcript append.
    }
    return stored
  })

  on('command.run', { command: 'link-nav' }, async $ => {
    if ((await $.ui.panes()).some(p => p.id === PANE && p.isPlaced)) {
      await $.ui.close({ id: PANE })
      await $.store.set('mode', 'off')
      await update($, paneTick, n => n + 1)
      return { text: s.off }
    }
    await $.store.set('mode', 'open')
    await openPane($, s)
    return { text: s.on }
  })

  on('ui.close', async ($, e, next) => {
    const result = await next(e)
    if (e.id === PANE) await update($, paneTick, n => n + 1).catch(() => undefined)
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    await read($, paneTick)
    const list = await read($, items)
    if (list.length === 0 || (await readMode($)) === 'off') return next(e)
    if ((await $.ui.panes()).some(p => p.id === PANE && p.isPlaced)) return next(e)
    const { Box, Button } = $.ui.resolve(e)
    const below = await next(e)
    const newest = filterItems(list, '')[0]
    return (
      <Box flexDirection="column">
        {/* No hotkey: a plain Button draws one as `n: ` ahead of the label. */}
        <Button key="link-nav-open" plain dimColor label={fitLine(s.navLabel(list.length, newest?.label), Math.max(24, e.props.bodyColumns - 4))} onPress={() => openPane($, s)} />
        {below}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    // Input is not in every surface's table (a phone has none): there the list shows unfiltered.
    const table = $.ui.resolve(e)
    const { Box, Button, Text } = table
    const Input = 'Input' in table ? table.Input : undefined
    const all = await read($, items)
    const typed = Input ? await read($, query) : ''
    const shown = filterItems(all, typed)
    const width = Math.max(12, e.props.bodyColumns - 1)
    return (
      <Box flexDirection="column">
        {Input && (
          <Input
            key="search"
            autoFocus
            placeholder={s.placeholder}
            value={typed}
            submitLabel={s.submit}
            onInput={value => { void update($, query, () => value) }}
            onSubmit={async value => {
              const first = filterItems(await read($, items), value)[0]
              if (first) await openItem($, first, s)
            }}
          />
        )}
        {typed.trim() !== '' && <Text dimColor>{s.count(shown.length, all.length)}</Text>}
        {all.length === 0 && <Text dimColor>{s.empty}</Text>}
        {all.length > 0 && shown.length === 0 && <Text dimColor>{s.noMatch}</Text>}
        {shown.slice(0, DRAWN).map((item, i) => (
          <Box flexDirection="row">
            <Button key={`open-${i}`} plain label={rowText(item, width - 2)} onPress={() => openItem($, item, s)} />
            {item.jump
              ? <Button key={`jump-${i}`} plain label=" ›" onPress={() => jumpTo($, item, s)} />
              : <Text>{'  '}</Text>}
          </Box>
        ))}
      </Box>
    )
  })
}
