import { expect, mock, test } from 'claude-code/testing'
import { STRINGS, stringsFor } from '../hooks/strings'
import { cellWidth, denyMessage, fitLine, historyTurns, label, promptText, rowLabel } from '../hooks/turns'
import { fuzzyScore } from '../hooks/fuzzy'
import type { RenderElement } from 'claude-code'

const pane = {
  plugin: 'turn-nav', surface: 'terminal', component: 'Pane', requestId: 'turn-nav',
  props: {
    title: '導覽', isFocused: false, bodyColumns: 32, placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 }, view: {},
  },
} as const

const prompt = (text: string, origin: { kind: 'composer' | 'bridge' | 'task-notification' } = { kind: 'composer' }, agentId?: string) => ({
  door: 'prompt' as const, origin, uuid: 'incoming', agentId,
  message: { type: 'user' as const, content: [{ type: 'text' as const, text }] },
})

const command = {
  command: 'turn-nav', args: '', origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 100 },
} as const

test('promptText reads text blocks and strips a leading reminder', () => {
  expect(promptText([{ type: 'text', text: 'one' }, { type: 'image' }, { type: 'text', text: 'two' }])).toBe('one\ntwo')
  expect(promptText('hello')).toBe('hello')
  expect(promptText('<system-reminder>private</system-reminder>hello')).toBe('hello')
  expect(promptText([{ type: 'text', text: '<system-reminder>private</system-reminder>' }, { type: 'text', text: 'hello' }])).toBe('hello')
  expect(promptText({ junk: true })).toBe('')
})

test('label numbers, collapses whitespace, truncates, and keeps minimum width', () => {
  expect(label(2, '\n  hello   world\nother', 30)).toBe('2 hello world')
  expect(label(1, 'abcdefghijk', 8)).toBe('1 abcde…')
  expect(label(1, 'abcdefghijk', 2)).toBe('1 abcde…')
})

test('rowLabel fills the width so the whole row is the tap target', () => {
  expect(rowLabel(2, '你知道wormgpt?', 30)).toMatch(/^2 你知道wormgpt\? +›$/)
  expect(cellWidth(rowLabel(2, '你知道wormgpt?', 30))).toBe(30)
  expect(cellWidth(rowLabel(3, '但整瓶拿出來退冰不會讓整瓶變質嗎但整瓶拿出來退冰不會讓整瓶變質嗎', 30))).toBe(30)
})

test('labels are cut by terminal cells, so CJK text fits the pane', () => {
  expect(cellWidth('ab中文')).toBe(6)
  const cut = label(3, '但整瓶拿出來退冰不會讓整瓶變質嗎', 12)
  expect(cut).toBe('3 但整瓶拿…')
  expect(cellWidth(cut)).toBeLessThanOrEqual(12)
  expect(label(1, '短', 12)).toBe('1 短')
})

test("only the person's own prompts in the main conversation appear, typed or from the phone", { options: { language: 'zh-TW' } }, async ($, on) => {
  mock.session(on)
  await $.session.append(prompt('first'))
  await $.session.append(prompt('notification', { kind: 'task-notification' }))
  await $.session.append(prompt('agent', { kind: 'composer' }, 'agent-1'))
  await $.session.append(prompt('from phone', { kind: 'bridge' }))
  const ui = await $.ui.mount(pane)
  expect((await ui.find({ key: 'turn-0' }))?.text).toMatch(/^1 first +›$/)
  expect(cellWidth((await ui.find({ key: 'turn-0' }))?.text ?? '')).toBe(pane.props.bodyColumns - 1)
  expect((await ui.find({ key: 'turn-1' }))?.text).toMatch(/^2 from phone/)
  expect(await ui.find({ key: 'turn-2' })).toBeUndefined()
})

// Pressing a turn calls $.ui.scroll on a transcript row. The engine moves transcript rows
// itself (the ui.scroll event covers a plugin's own Pane and band only), so the testing kit
// has nothing beneath it to answer: that path is verified by clicking in a real session.

test('/turn-nav opens and closes the pane', { options: { language: 'zh-TW' } }, async ($, on) => {
  mock.store(on)
  let open = false
  on('ui.panes', () => ({ value: open ? [{ id: 'turn-nav', title: '導覽', isShown: true, isFocused: false, isPlaced: true }] : [] }))
  on('ui.open', () => { open = true; return { value: { isPlaced: true } } })
  on('ui.close', () => { open = false; return { value: undefined } })
  expect((await $.command.run(command)).text).toBe('導覽已開啟')
  expect(open).toBe(true)
  expect((await $.command.run(command)).text).toMatch(/^導覽已關閉/)
  expect(open).toBe(false)
})

// `placeNext` models whether the engine draws the next requested open.
// `read` answers the host command that reads the transcript file (default: no file yet).
function panes(on: Parameters<typeof mock.store>[0], read: (argv: readonly string[]) => Run | Promise<Run> = () => ran('', { exitCode: 3 })) {
  const state = { open: false, placed: false, placeNext: true, opened: 0, args: {} as Record<string, unknown>, promptBand: undefined as string | undefined, reads: [] as (readonly string[])[] }
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: 'sid-1' }))
  on('classic.SessionStart', () => ({}))
  on('process.run', async (_$, e) => { state.reads.push(e.argv); return { value: await read(e.argv) } })
  on('ui.panes', () => ({ value: state.open ? [{ id: 'turn-nav', title: '導覽', isShown: state.placed, isFocused: false, isPlaced: state.placed }] : [] }))
  on('ui.open', (_$, e) => {
    state.open = true; state.placed = state.placeNext; state.opened += 1; state.args = { ...e }
    return { value: state.placed ? { isPlaced: true } : { isPlaced: false, reason: 'narrow' } }
  })
  on('ui.close', () => { state.open = false; state.placed = false; return { value: undefined } })
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['engine band'] }))
  on('env.get', (_$, e) => ({ value: e.name === 'PROMPT_BAND' ? state.promptBand : undefined }))
  return state
}

const above = {
  plugin: 'turn-nav', surface: 'terminal', component: 'AbovePrompt', requestId: 'above-prompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 86, scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

const start = { cwd: '/work', surface: 'terminal', isInteractive: true } as const

test('a new session leaves the pane closed and shows its line', { options: { language: 'zh-TW' } }, async ($, on) => {
  mock.store(on)
  const state = panes(on)
  await $.session.start(start)
  expect(state.opened).toBe(0)
  const ui = await $.ui.mount(above)
  expect(await ui.find({ key: 'nav-open' })).toBeDefined()
})

test('closing with /turn-nav is remembered by the next session, and reopening too', { options: { language: 'zh-TW' } }, async ($, on) => {
  mock.store(on)
  const state = panes(on)
  await $.session.start(start)
  expect((await $.command.run(command)).text).toBe('導覽已開啟')
  expect(state.opened).toBe(1)
  expect((await $.command.run(command)).text).toMatch(/^導覽已關閉/)

  await $.session.start(start)
  expect(state.opened).toBe(1)
  expect(state.open).toBe(false)
  const ui = await $.ui.mount(above)
  expect(await ui.find({ key: 'nav-open' })).toBeUndefined()

  expect((await $.command.run(command)).text).toBe('導覽已開啟')
  state.open = false
  await $.session.start(start)
  expect(state.open).toBe(false)
  expect(state.opened).toBe(2)
  expect(await ui.find({ key: 'nav-open' })).toBeDefined()
})

test('/turn-nav opens a pane that is open but not drawn, instead of closing it', { options: { language: 'zh-TW' } }, async ($, on) => {
  mock.store(on)
  const state = panes(on)
  state.placeNext = false
  await $.session.start(start)
  state.placeNext = true
  expect((await $.command.run(command)).text).toBe('導覽已開啟')
  expect(state.placed).toBe(true)
})

test('the pane asks for a short inline block and a narrow dock', { options: { language: 'zh-TW' } }, async ($, on) => {
  mock.store(on)
  const state = panes(on)
  await $.session.start(start)
  await $.command.run(command)
  expect(state.args).toMatchObject({ id: 'turn-nav', rows: 6, columns: 32 })
})

test('the line opens the pane on request', { options: { language: 'zh-TW' } }, async ($, on) => {
  mock.store(on)
  const state = panes(on)
  await $.session.start(start)
  const ui = await $.ui.mount(above)
  expect((await ui.find({ key: 'nav-open' }))).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'engine band' })).toBeDefined()

  await ui.press({ key: 'nav-open' })
  expect(state.placed).toBe(true)
  expect(await ui.find({ key: 'nav-open' })).toBeUndefined()
})

test('no entry while the pane is drawn, or after it is closed', { options: { language: 'zh-TW' } }, async ($, on) => {
  mock.store(on)
  const state = panes(on)
  await $.session.start(start)
  const ui = await $.ui.mount(above)
  expect(await ui.find({ key: 'nav-open' })).toBeDefined()
  await ui.press({ key: 'nav-open' })
  expect(await ui.find({ key: 'nav-open' })).toBeUndefined()
  await $.command.run(command)
  expect(state.open).toBe(false)
  expect(await ui.find({ key: 'nav-open' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'engine band' })).toBeDefined()
})

// Opening the pane scrolls it to the newest turn. The kit answers a pane's own scroll
// without exposing the offset, so that is verified by opening it in a real session.

test('legacy collapsed and isOpen false show the line without opening', { options: { language: 'zh-TW' } }, async ($, on) => {
  mock.store(on, { mode: 'collapsed', isOpen: false })
  const state = panes(on)
  await $.session.start(start)
  expect(state.opened).toBe(0)
  const ui = await $.ui.mount(above)
  expect(await ui.find({ key: 'nav-open' })).toBeDefined()
})

test('undrawn line has no close button or action word', { options: { language: 'zh-TW' } }, async ($, on) => {
  mock.store(on)
  const state = panes(on)
  state.placeNext = false
  await $.session.start(start)
  const ui = await $.ui.mount(above)
  const line = (await ui.find({ key: 'nav-open' }))?.text ?? ''
  expect(line).toMatch(/^🧭 導覽 · 0 則 +$/)
  expect(cellWidth(line)).toBe(above.props.bodyColumns - 4)
  expect(await ui.find({ key: 'nav-off' })).toBeUndefined()
  expect(line.includes('開啟')).toBe(false)
  expect(line.includes('✕')).toBe(false)
  expect((await ui.findAll({ type: 'Button' })).filter(b => b.props.hotkey !== undefined)).toHaveLength(0)
})

test('fitLine cuts wide text and pads without an action tail', () => {
  expect(cellWidth(fitLine('🧭 導覽', 20))).toBe(20)
  expect(fitLine('abcdefghijk', 8)).toBe('abcdefg…')
})

test('a refused jump names fullscreen only when that is the reason', () => {
  expect(denyMessage('transcript not scrollable here', STRINGS['zh-TW'])).toMatch(/不是全螢幕/)
  expect(denyMessage('no such row', STRINGS['zh-TW'])).toBe('跳不過去：no such row')
})

test('outside fullscreen the pane says it can only list, not jump', { options: { language: 'zh-TW' } }, async ($, on) => {
  mock.session(on)
  await $.session.append(prompt('first'))
  const ui = await $.ui.mount({ ...pane, viewport: { columns: 86, rows: 40, isFullscreen: false } })
  expect((await ui.find({ type: 'Text', text: '非全螢幕' }))).toBeDefined()
  expect((await ui.find({ key: 'turn-0' }))?.text).toMatch(/^1 first/)
})

test("the pane draws no close button of its own: the frame's close mark is the engine's", { options: { language: 'zh-TW' } }, async ($, on) => {
  mock.session(on)
  await $.session.append(prompt('first'))
  const ui = await $.ui.mount(pane)
  expect(await ui.find({ key: 'close' })).toBeUndefined()
  expect((await ui.findAll({ type: 'Button' })).map(b => b.key)).toEqual(['turn-0'])
})

test('in fullscreen the pane shows only the turns', { options: { language: 'zh-TW' } }, async ($, on) => {
  mock.session(on)
  await $.session.append(prompt('first'))
  const ui = await $.ui.mount({ ...pane, viewport: { columns: 120, rows: 40, isFullscreen: true } })
  expect(await ui.find({ type: 'Text', text: '非全螢幕' })).toBeUndefined()
})

test('empty pane explains that there is no conversation yet', { options: { language: 'zh-TW' } }, async $ => {
  const ui = await $.ui.mount(pane)
  expect(await ui.find({ type: 'Text', text: '還沒有對話' })).toBeDefined()
})

// A stand-in for prompt-band: draws the line this mod publishes.
const BAND = {
  name: 'prompt-band',
  register(on: Parameters<typeof mock.store>[0]) {
    on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
      const { value } = await $.state.get({ plugin: 'turn-nav', key: 'chip' } as const)
      const below = await next(e)
      const { Box, Button, Text } = $.ui.resolve(e)
      return h(Box, { flexDirection: 'column' }, value
        ? h(Button, { key: 'turn-nav', label: value.label, onPress: () => undefined })
        : h(Text, {}, 'no line'), below) as RenderElement
    })
  },
}

test('the line is published for prompt-band: nothing while the pane is drawn or the navigator is off', { plugins: [BAND], options: { language: 'zh-TW' } }, async ($, on) => {
  mock.store(on)
  mock.session(on)
  const state = panes(on)
  state.placeNext = false
  state.promptBand = '1'
  await $.session.start(start)
  const ui = await $.ui.mount(above)
  expect((await ui.find({ key: 'turn-nav' }))?.text).toBe('🧭 導覽 · 0 則')
  await $.session.append(prompt('第一個問題\nmore'))
  expect((await ui.find({ key: 'turn-nav' }))?.text).toBe('🧭 導覽 · 1 則 · 第一個問題')
  state.placeNext = true
  await $.ui.press({ plugin: 'prompt-band', key: 'turn-nav' })
  expect(state.placed).toBe(true)
  expect(await ui.find({ type: 'Text', text: 'no line' })).toBeDefined()
})

test('with prompt-band loaded the mod leaves its line to the shared row', { options: { language: 'zh-TW' } }, async ($, on) => {
  mock.store(on)
  const state = panes(on)
  state.placeNext = false
  state.promptBand = '1'
  await $.session.start(start)
  const ui = await $.ui.mount(above)
  expect(await ui.find({ key: 'nav-open' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'engine band' })).toBeDefined()
})

test('default language renders English prompt label', async ($, on) => {
  mock.store(on)
  const state = panes(on)
  state.placeNext = false
  await $.session.start(start)
  const ui = await $.ui.mount(above)
  expect((await ui.find({ key: 'nav-open' }))?.text).toMatch(/^🧭 Prompts · 0 +$/)
})

// A transcript-file row as Claude Code writes one (only the fields the reader looks at).
const fileRow = (uuid: string, content: unknown, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ type: 'user', uuid, isSidechain: false, origin: { kind: 'human' }, message: { role: 'user', content }, ...extra })

test("historyTurns keeps the person's own main-conversation prompts, oldest first", () => {
  const lines = [
    '{"type":"user","uuid":"cut-in-half","mess',
    fileRow('a', 'first'),
    fileRow('b', '<task-notification>x', { origin: { kind: 'task-notification' } }),
    fileRow('c', 'a subagent prompt', { isSidechain: true }),
    fileRow('d', 'meta', { isMeta: true }),
    fileRow('e', 'another session', { origin: { kind: 'peer' } }),
    fileRow('f', [{ type: 'text', text: '<system-reminder>r</system-reminder>second' }, { type: 'image' }]),
    '',
  ].join('\n')
  const read = historyTurns(lines)
  expect(read.turns).toEqual([{ id: 'a', text: 'first' }, { id: 'f', text: 'second' }])
  expect(read.unreadable).toBe(1)
  expect(historyTurns(lines, 1).turns).toEqual([{ id: 'f', text: 'second' }])
})

type Run = { exitCode: number; stdout: string; stderr: string; isStdoutTruncated: boolean; isStderrTruncated: boolean }
const ran = (stdout: string, extra: Partial<Run> = {}): Run =>
  ({ exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false, ...extra })

// The read runs after the start event has answered; look again until the pane shows what it settled to.
async function shown<T>(find: () => Promise<T | undefined>): Promise<T | undefined> {
  for (let i = 0; i < 200; i++) {
    const found = await find()
    if (found) return found
  }
  return undefined
}

test('a session lists the prompts its transcript file already holds, before the new ones', { options: { language: 'zh-TW' } }, async ($, on) => {
  mock.store(on)
  mock.session(on)
  const state = panes(on, () => ran(`${fileRow('old-1', '早先的問題')}\n${fileRow('old-2', '第二個')}\n`))
  await $.session.start(start)
  const ui = await $.ui.mount(pane)
  expect((await shown(() => ui.find({ key: 'turn-1' })))?.text).toMatch(/^2 第二個 +›$/)
  await $.session.append(prompt('new one'))
  expect((await ui.find({ key: 'turn-0' }))?.text).toMatch(/^1 早先的問題/)
  expect((await ui.find({ key: 'turn-2' }))?.text).toMatch(/^3 new one/)
  for (const text of Object.values(notes)) expect(await ui.find({ type: 'Text', text })).toBeUndefined()
  expect(state.reads).toHaveLength(1)
  expect(state.reads[0]?.[0]).toBe('/bin/sh')
  expect(state.reads[0]?.slice(-2)).toEqual(['id', 'sid-1'])
})

test('a resume reads the file it names, and so does every reload after it', { options: { language: 'zh-TW' } }, async ($, on) => {
  mock.store(on)
  const state = panes(on, () => ran(`${fileRow('p-1', 'by path')}\n`))
  await $.session.start(start)
  await $.classic.SessionStart({ source: 'resume', transcript_path: '/t/named.jsonl' })
  const ui = await $.ui.mount(pane)
  expect((await shown(() => ui.find({ key: 'turn-0' })))?.text).toMatch(/^1 by path/)
  await $.session.start(start)
  for (let i = 0; i < 200 && state.reads.length < 3; i++) await ui.find({ key: 'turn-0' })
  expect(state.reads.map(argv => argv.slice(-2))).toEqual([['id', 'sid-1'], ['path', '/t/named.jsonl'], ['path', '/t/named.jsonl']])
  expect(await ui.find({ key: 'turn-1' })).toBeUndefined()
})

test('a reload reads the file again and lists each prompt once', { options: { language: 'zh-TW' } }, async ($, on) => {
  mock.store(on)
  mock.session(on)
  let file = `${fileRow('a', 'first')}\n${fileRow('b', 'second')}\n`
  const state = panes(on, () => ran(file))
  await $.session.start(start)
  const ui = await $.ui.mount(pane)
  expect(await shown(() => ui.find({ key: 'turn-1' }))).toBeDefined()
  await $.session.append(prompt('third'))
  file += `${fileRow('incoming', 'third')}\n`
  await $.session.start(start)
  for (let i = 0; i < 200 && state.reads.length < 2; i++) await ui.find({ key: 'turn-0' })
  expect(await shown(() => ui.find({ key: 'turn-3' }))).toBeUndefined()
  expect((await ui.find({ key: 'turn-2' }))?.text).toMatch(/^3 third/)
  expect(state.reads).toHaveLength(2)
})

test('a session with no transcript yet, or none of its rows a user\'s, shows nothing and no note', { options: { language: 'zh-TW' } }, async ($, on) => {
  mock.store(on)
  let answer = ran('', { exitCode: 3 })
  const state = panes(on, () => answer)
  await $.session.start(start)
  const ui = await $.ui.mount(pane)
  for (let i = 0; i < 200 && state.reads.length < 1; i++) await ui.find({ key: 'turn-0' })
  answer = ran('', { exitCode: 4 })
  await $.session.start(start)
  expect(await shown(() => ui.find({ key: 'turn-0' }))).toBeUndefined()
  const zh = STRINGS['zh-TW']
  const quiet = [...Object.values(notes), zh.history({ kind: 'failed', reason: 'exit 3' }), zh.history({ kind: 'failed', reason: 'exit 4' })]
  for (const text of quiet) expect(await ui.find({ type: 'Text', text })).toBeUndefined()
  expect(state.reads).toHaveLength(2)
})

test('a read that fails, finds no prompt of the person\'s, or was cut says so in the pane', { options: { language: 'zh-TW' } }, async ($, on) => {
  mock.store(on)
  let answer = ran('', { exitCode: 2, stderr: 'grep: /t/gone.jsonl: No such file or directory\n' })
  panes(on, () => answer)
  await $.session.start(start)
  const ui = await $.ui.mount(pane)
  expect(await shown(() => ui.find({ type: 'Text', text: notes.failed }))).toBeDefined()

  answer = ran('', { exitCode: 1 })
  await $.session.start(start)
  expect(await shown(() => ui.find({ type: 'Text', text: notes.none }))).toBeDefined()
  expect(await ui.find({ type: 'Text', text: notes.failed })).toBeUndefined()

  answer = ran(`"uuid":"half-a-row"}\n${fileRow('n', 'newest')}\n`)
  await $.session.start(start)
  expect((await shown(() => ui.find({ key: 'turn-0' })))?.text).toMatch(/^1 newest/)
  expect(await ui.find({ type: 'Text', text: notes.cut })).toBeDefined()
})

test('a read that took every byte it may is noted as cut, even with no row cut in half', { options: { language: 'zh-TW' } }, async ($, on) => {
  mock.store(on)
  const row = fileRow('r', 'x'.repeat(1000))
  const lines = `${row}\n`.repeat(Math.ceil(4_000_000 / (row.length + 1)))
  panes(on, () => ran(lines))
  await $.session.start(start)
  const ui = await $.ui.mount(pane)
  expect(await shown(() => ui.find({ type: 'Text', text: notes.cut }))).toBeDefined()
})

test('when two reads overlap, the later start wins even if its read finishes first', { options: { language: 'zh-TW' } }, async ($, on) => {
  mock.store(on)
  let releaseFirst: (run: Run) => void = () => undefined
  let call = 0
  panes(on, () => {
    call += 1
    if (call === 1) return new Promise<Run>(resolve => { releaseFirst = resolve })
    return ran(`${fileRow('new-1', 'from the later start')}\n`)
  })
  await $.session.start(start)
  await $.session.start(start)
  const ui = await $.ui.mount(pane)
  expect((await shown(() => ui.find({ key: 'turn-0' })))?.text).toMatch(/^1 from the later start/)
  releaseFirst(ran(`${fileRow('stale-1', 'stale read')}\n`))
  expect(await shown(() => ui.find({ key: 'turn-1' }))).toBeUndefined()
  expect((await ui.find({ key: 'turn-0' }))?.text).toMatch(/^1 from the later start/)
})

const notes = {
  failed: '先前的對話讀不到：grep: /t/gone.jsonl: No such file or directory',
  none: 'session 檔裡找不到先前的對話',
  cut: '先前的對話：session 檔太長，只列出最新的',
}

test('unknown and missing languages use English strings', () => {
  expect(stringsFor('fr')).toBe(STRINGS.en)
  expect(stringsFor(undefined)).toBe(STRINGS.en)
})

test('fuzzy search: letters in order with gaps, every word must match', () => {
  expect(fuzzyScore('ath', 'fix the auth middleware')).toBeGreaterThan(0)
  expect(fuzzyScore('hta', 'auth')).toBe(-1)
  expect(fuzzyScore('auth mid', 'fix the auth middleware')).toBeGreaterThan(0)
  expect(fuzzyScore('auth zzz', 'fix the auth middleware')).toBe(-1)
  expect(fuzzyScore('退冰', '但整瓶拿出來退冰不會讓整瓶變質嗎')).toBeGreaterThan(0)
  expect(fuzzyScore('AUTH', 'auth')).toBe(fuzzyScore('auth', 'auth'))
})

test('search keeps the matching prompts in order with their own numbers', { options: { language: 'zh-TW' } }, async ($, on) => {
  mock.session(on)
  await $.session.append(prompt('fix the auth middleware'))
  await $.session.append(prompt('render 04 views'))
  await $.session.append(prompt('auth cookie flags'))
  const ui = await $.ui.mount(pane)
  await ui.input({ key: 'search', text: 'auth', kind: 'change' })
  expect((await ui.findAll({ type: 'Button' })).map(b => b.key)).toEqual(['turn-0', 'turn-2'])
  expect((await ui.find({ key: 'turn-2' }))?.text).toMatch(/^3 auth cookie flags/)
  expect(await ui.find({ type: 'Text', text: '2 / 3' })).toBeDefined()
  await ui.input({ key: 'search', text: 'zzz', kind: 'change' })
  expect(await ui.findAll({ type: 'Button' })).toHaveLength(0)
  expect(await ui.find({ type: 'Text', text: '沒有符合的' })).toBeDefined()
})

test('opening the pane takes the keys and starts unfiltered', { options: { language: 'zh-TW' } }, async ($, on) => {
  mock.store(on)
  mock.session(on)
  const state = panes(on)
  await $.session.start(start)
  await $.session.append(prompt('one'))
  await $.session.append(prompt('two'))
  const ui = await $.ui.mount(pane)
  await ui.input({ key: 'search', text: 'one', kind: 'change' })
  expect(await ui.findAll({ type: 'Button' })).toHaveLength(1)
  await $.command.run(command)
  expect(state.args).toMatchObject({ focus: true })
  expect((await ui.findAll({ type: 'Button' })).map(b => b.key)).toEqual(['turn-0', 'turn-1'])
})

test('a phone has no search field and lists every prompt', { options: { language: 'zh-TW' } }, async ($, on) => {
  mock.session(on)
  await $.session.append(prompt('one'))
  const ui = await $.ui.mount({ ...pane, surface: 'mobile' })
  expect(await ui.find({ key: 'search' })).toBeUndefined()
  expect((await ui.find({ key: 'turn-0' }))?.text).toMatch(/^1 one/)
})

test('no search field before the first prompt', { options: { language: 'zh-TW' } }, async $ => {
  const ui = await $.ui.mount(pane)
  expect(await ui.find({ key: 'search' })).toBeUndefined()
})
