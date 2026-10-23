import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import type { HistoryNote, Turn, TurnNavChip } from '../types'
import { denyMessage, fitLine, historyTurns, navLabel, promptText, rowLabel } from './turns'
import { fuzzyScore } from './fuzzy'
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
const query = atom({ plugin: 'turn-nav', key: 'query' } as const, '')
// Set when a resumed session's earlier prompts could not all be listed; the pane says so.
const history = atom({ plugin: 'turn-nav', key: 'history' } as const, null as HistoryNote | null)

// The transcript file the classic SessionStart named; kept so a reload reads the same file.
const transcriptPath = atom({ plugin: 'turn-nav', key: 'transcriptPath' } as const, null as string | null)

// The prompts sent before this process started (a resume, or a reload of the mod) are only in the
// session's transcript file, which can run to gigabytes: `$2` itself (`$1` = path), or found by the
// session id (`$1` = id) as `<config>/projects/<project>/<id>.jsonl`, the newest if two projects hold
// one. grep keeps the rows whose origin is the person and tail the newest 4 MB of those (under
// $.process.run's 4 MiB stdout). Exit 3: no file yet; 4: no user row in it yet (both a session that
// has not started talking); 2: a file there but unreadable; with pipefail grep's own 1 (user rows,
// none the person's: the file's format may have moved) and 2 come through.
const TAIL_BYTES = 4_000_000
const READ_HISTORY = [
  'if [ "$1" = path ]; then f=$2; [ -e "$f" ] || exit 3',
  'else f=$(ls -t "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/projects/*/"$2".jsonl 2>/dev/null | head -n 1); [ -n "$f" ] || exit 3; fi',
  `LC_ALL=C grep -qm1 '"type":"user"' "$f"; rc=$?`,
  '[ $rc -eq 1 ] && exit 4',
  '[ $rc -eq 0 ] || exit $rc',
  'set -o pipefail',
  `LC_ALL=C grep -E '"origin":\\{"kind":"(human|composer|bridge)"' "$f" | tail -c ${TAIL_BYTES}`,
].join('\n')

// Only the newest read may write: a slower earlier one (a start, then a reload) is dropped.
let lastRead = 0

async function loadHistory($: EngineInterface, s: Strings): Promise<void> {
  const mine = ++lastRead
  let note: HistoryNote | null = null
  let found: Turn[] = []
  try {
    const path = await read($, transcriptPath)
    const target = path ? ['path', path] : ['id', await $.session.id()]
    const run = await $.process.run(['/bin/sh', '-c', READ_HISTORY, 'turn-nav', ...target], { timeoutMs: 15_000 })
    if (run.exitCode === 3 || run.exitCode === 4) {
      note = null
    } else if (run.exitCode === 1 && run.stdout === '') {
      note = { kind: 'none' }
    } else if (run.exitCode !== 0) {
      note = { kind: 'failed', reason: run.stderr.trim().split('\n')[0] || `exit ${run.exitCode}` }
    } else {
      const rows = historyTurns(run.stdout)
      found = rows.turns
      // tail keeping all it may means older rows were left behind, whether or not it cut one in half
      const isCut = new TextEncoder().encode(run.stdout).length >= TAIL_BYTES
      if (found.length === 0) note = { kind: 'none' }
      else if (isCut || rows.unreadable > 0 || run.isStdoutTruncated) note = { kind: 'cut' }
    }
  } catch (error) {
    note = { kind: 'failed', reason: error instanceof Error ? error.message : String(error) }
  }
  if (mine !== lastRead) return
  await update($, history, () => note)
  if (found.length > 0) {
    await update($, turns, list => {
      const seen = new Set(list.map(turn => turn.id))
      return [...found.filter(turn => !seen.has(turn.id)), ...list].slice(-200)
    })
  }
  await publish($, s)
}

// Keep the newest turn in view; a pane not drawn yet has nothing to scroll.
async function showNewest($: EngineInterface): Promise<void> {
  await $.ui.scroll({ in: PANE, to: 'end' }).catch(() => undefined)
}

// Only /turn-nav remembers off across sessions.
type Mode = 'open' | 'off'

async function readMode($: EngineInterface): Promise<Mode> {
  const mode = await $.store.get('mode')
  return mode === 'off' ? 'off' : 'open'
}

async function setMode($: EngineInterface, mode: Mode, s: Strings): Promise<void> {
  await $.store.set('mode', mode)
  await update($, paneTick, n => n + 1)
  await publish($, s)
}

async function publish($: EngineInterface, s: Strings): Promise<void> {
  const isPlaced = (await $.ui.panes()).some(p => p.id === PANE && p.isPlaced)
  const next = isPlaced || (await readMode($)) === 'off' ? null : { label: navLabel(await read($, turns), s) }
  await update($, chip, () => next)
}

// Set by the prompt-band mod, which then draws this mod's line in the row it shares.
async function hasPromptBand($: EngineInterface): Promise<boolean> {
  return (await $.env.get('PROMPT_BAND')) === '1'
}

async function openPane($: EngineInterface, open: { id: typeof PANE; title: string; rows: 6; columns: 32; focus: true; closeOnEscape: true }, s: Strings): Promise<void> {
  // Every open is the person's own: it starts unfiltered and takes the keys, so typing searches at once.
  await update($, query, () => '')
  await $.ui.open(open)
  await showNewest($)
  await update($, paneTick, n => n + 1)
  await publish($, s)
}

async function turnOff($: EngineInterface, s: Strings): Promise<void> {
  if ((await $.ui.panes()).some(p => p.id === PANE)) await $.ui.close({ id: PANE })
  await setMode($, 'off', s)
}

export const register: Register = (on, options) => {
  const s = stringsFor(options?.language)
  // Esc closes the pane while it holds the keys; its line above the prompt opens it again.
  const open = { id: PANE, title: s.title, rows: 6, columns: 32, focus: true, closeOnEscape: true } as const
  // session.start runs when the process starts (new, resumed, forked) and on every reload of this
  // mod, which keeps the list but not what came before the process: so the list is filled from the
  // transcript file each time. Not awaited: reading a long file must not hold up the start. Past the
  // read's own try only bookkeeping can fail (a state write, the band's line); the catch leaves the
  // list as it was and no unhandled rejection.
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'turn-nav', description: 'Show or hide the prompt navigator (remembered for new sessions)' })
    await publish($, s)
    const result = await next(e)
    void loadHistory($, s).catch(() => undefined)
    return result
  })

  // A resume names its transcript file outright: kept for this read and every reload's, so the list
  // does not hang on the session id matching the file name.
  on('classic.SessionStart', async ($, e, next) => {
    const result = await next(e)
    if (e.transcript_path && e.transcript_path !== (await read($, transcriptPath))) {
      await update($, transcriptPath, () => e.transcript_path)
      void loadHistory($, s).catch(() => undefined)
    }
    return result
  })

  on('session.append', { door: 'prompt' }, async ($, e, next) => {
    const stored = await next(e)
    try {
      const id = 'uuid' in stored ? stored.uuid : undefined
      const isPersons = e.origin.kind === 'composer' || e.origin.kind === 'bridge'
      if (id && isPersons && !e.agentId) {
        const text = promptText(e.message.content)
        if (text) {
          const at = await $.clock.now().catch(() => undefined)
          await update($, turns, list => [...list, { id, text, ...(at === undefined ? {} : { at }) }].slice(-200))
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
    // Only a drawn pane is turned off; off or waiting undrawn opens it.
    if ((await $.ui.panes()).some(p => p.id === PANE && p.isPlaced)) {
      await turnOff($, s)
      return { text: s.off }
    }
    await openPane($, open, s)
    await setMode($, 'open', s)
    return { text: s.on }
  })

  on('ui.close', async ($, e, next) => {
    // The engine skips a hook that returns nothing and says so in the transcript.
    const result = await next(e)
    if (e.id === PANE) {
      await update($, paneTick, n => n + 1)
      await publish($, s)
    }
    return result
  })

  // prompt-band's line for this mod: opened here, inside the person's press, the pane is
  // placed at any width (opened from any later event it would wait below 144 columns).
  on('ui.press', { plugin: 'prompt-band', element: 'turn-nav' }, async ($, e, next) => {
    await openPane($, open, s)
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
    return (
      <Box flexDirection="column">
        {/* No hotkey: a plain Button draws one as `n: ` ahead of the label. */}
        <Button key="nav-open" plain dimColor label={fitLine(navLabel(list, s), Math.max(24, e.props.bodyColumns - 4))} onPress={() => openPane($, open, s)} />
        {below}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const table = $.ui.resolve(e)
    const { Box, Button, Text } = table
    // A phone's table has no Input: there the list shows unfiltered.
    const Input = 'Input' in table ? table.Input : undefined
    const list = await read($, turns)
    const now = await $.clock.now().catch(() => Date.now())
    const note = await read($, history)
    const typed = Input ? await read($, query) : ''
    // A match keeps its prompt's own number and place, so the list still reads in order.
    const shown = list.map((turn, i) => ({ turn, i })).filter(({ turn }) => !typed.trim() || fuzzyScore(typed, turn.text) >= 0)
    const width = e.props.bodyColumns
    const jump = async (turn: Turn) => {
      const result = await $.ui.scroll({ to: { requestId: turn.id }, block: 'start' })
      if (result.deny) $.ui.toast(denyMessage(result.deny, s))
    }
    return <Box flexDirection="column">
      {e.viewport?.isFullscreen === false && <Text dimColor wrap="truncate-end">{s.notFullscreen}</Text>}
      {note && <Text key="history-note" dimColor>{s.history(note)}</Text>}
      {Input && list.length > 0 && <Input key="search" autoFocus placeholder={s.placeholder} value={typed} submitLabel={s.submit}
        onInput={value => { void update($, query, () => value) }}
        onSubmit={async value => {
          const newest = (await read($, turns)).filter(turn => fuzzyScore(value, turn.text) >= 0).at(-1)
          if (newest) await jump(newest)
        }} />}
      {typed.trim() !== '' && <Text dimColor>{s.count(shown.length, list.length)}</Text>}
      {list.length === 0 && <Text dimColor>{s.empty}</Text>}
      {list.length > 0 && shown.length === 0 && <Text dimColor>{s.noMatch}</Text>}
      {shown.map(({ turn, i }) => <Button key={`turn-${i}`} plain label={rowLabel(i + 1, turn.text, width - 1, turn.at, now)} onPress={() => jump(turn)} />)}
    </Box>
  })
}
