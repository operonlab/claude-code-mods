import { expect, mock, test } from 'claude-code/testing'
import { STRINGS, stringsFor } from '../hooks/strings'
import { cellWidth, denyMessage, label, promptText, rowLabel } from '../hooks/turns'
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

// `placeNext` is whether the engine draws the next open: below its width threshold an
// unasked open (session start) waits undrawn, while an asked one (command, press) is drawn.
function panes(on: Parameters<typeof mock.store>[0]) {
  const state = { open: false, placed: false, placeNext: true, opened: 0, args: {} as Record<string, unknown>, promptBand: undefined as string | undefined }
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
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

test('a new session opens the pane by default', { options: { language: 'zh-TW' } }, async ($, on) => {
  mock.store(on)
  const state = panes(on)
  await $.session.start(start)
  expect(state.opened).toBe(1)
})

test('closing with /turn-nav is remembered by the next session, and reopening too', { options: { language: 'zh-TW' } }, async ($, on) => {
  mock.store(on)
  const state = panes(on)
  await $.session.start(start)
  expect((await $.command.run(command)).text).toMatch(/^導覽已關閉/)

  await $.session.start(start)
  expect(state.opened).toBe(1)
  expect(state.open).toBe(false)

  expect((await $.command.run(command)).text).toBe('導覽已開啟')
  state.open = false
  await $.session.start(start)
  expect(state.open).toBe(true)
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
  expect(state.args).toMatchObject({ id: 'turn-nav', rows: 6, columns: 32 })
})

test('a pane waiting undrawn shows a one-line entry that opens it', { options: { language: 'zh-TW' } }, async ($, on) => {
  mock.store(on)
  const state = panes(on)
  state.placeNext = false
  await $.session.start(start)
  const ui = await $.ui.mount(above)
  expect((await ui.find({ key: 'nav-open' }))).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'engine band' })).toBeDefined()

  state.placeNext = true
  await ui.press({ key: 'nav-open' })
  expect(state.placed).toBe(true)
  expect(await ui.find({ key: 'nav-open' })).toBeUndefined()
})

test('no entry while the pane is drawn, or after it is closed', { options: { language: 'zh-TW' } }, async ($, on) => {
  mock.store(on)
  const state = panes(on)
  await $.session.start(start)
  const ui = await $.ui.mount(above)
  expect(await ui.find({ key: 'nav-open' })).toBeUndefined()
  await $.command.run(command)
  expect(state.open).toBe(false)
  expect(await ui.find({ key: 'nav-open' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'engine band' })).toBeDefined()
})

// Opening the pane scrolls it to the newest turn. The kit answers a pane's own scroll
// without exposing the offset, so that is verified by opening it in a real session.

// Closing by the pane's own mark (or ctrl+x x) raises ui.close with origin person, which
// collapses the navigator to its one line. The kit has no call that raises ui.close, so that
// path is verified by closing it in a real session; the collapsed state itself is seeded below.

test('a collapsed navigator is one line that opens it again, or turns it off', { options: { language: 'zh-TW' } }, async ($, on) => {
  mock.store(on, { mode: 'collapsed' })
  const state = panes(on)
  await $.session.start(start)
  expect(state.opened).toBe(0)
  const ui = await $.ui.mount(above)
  expect((await ui.find({ key: 'nav-open' }))?.text).toMatch(/^🧭 導覽 · 0 則 +開啟 ›$/)

  await ui.press({ key: 'nav-open' })
  expect(state.placed).toBe(true)
  expect(await ui.find({ key: 'nav-open' })).toBeUndefined()
})

test('the collapsed line carries no hotkey, which a plain Button draws as `n: ` ahead of the label', { options: { language: 'zh-TW' } }, async ($, on) => {
  mock.store(on, { mode: 'collapsed' })
  panes(on)
  await $.session.start(start)
  const ui = await $.ui.mount(above)
  const plainWithHotkey = (await ui.findAll({ type: 'Button' })).filter(b => b.props.plain && b.props.hotkey !== undefined)
  expect(plainWithHotkey.map(b => b.key)).toEqual([])
  // The line, a one-cell gap and the ✕ fill the band less one cell, the › level with the hook line's.
  expect(cellWidth((await ui.find({ key: 'nav-open' }))?.text ?? '')).toBe(above.props.bodyColumns - 4)
})

test('turning the collapsed line off hides it in this and later sessions', { options: { language: 'zh-TW' } }, async ($, on) => {
  mock.store(on, { mode: 'collapsed' })
  const state = panes(on)
  await $.session.start(start)
  const ui = await $.ui.mount(above)
  await ui.press({ key: 'nav-off' })
  expect(await ui.find({ key: 'nav-open' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'engine band' })).toBeDefined()

  await $.session.start(start)
  expect(state.opened).toBe(0)
  expect(await ui.find({ key: 'nav-open' })).toBeUndefined()
  expect((await $.command.run(command)).text).toBe('導覽已開啟')
  expect(state.placed).toBe(true)
})

test('the collapsed line matches the hook line: name · count · newest prompt, › aligned, a small ✕', { options: { language: 'zh-TW' } }, async ($, on) => {
  mock.store(on, { mode: 'collapsed' })
  mock.session(on)
  panes(on)
  await $.session.start(start)
  await $.session.append(prompt('first'))
  await $.session.append(prompt('你知道wormgpt?\nmore'))
  const ui = await $.ui.mount(above)
  const open = (await ui.find({ key: 'nav-open' }))?.text ?? ''
  expect(open).toMatch(/^🧭 導覽 · 2 則 · 你知道wormgpt\? +開啟 ›$/)
  expect(cellWidth(open)).toBe(above.props.bodyColumns - 4)
  expect((await ui.find({ key: 'nav-off' }))?.text).toBe('✕')
})

test('a navigator closed by its mark before this change starts collapsed', { options: { language: 'zh-TW' } }, async ($, on) => {
  mock.store(on, { isOpen: false })
  const state = panes(on)
  await $.session.start(start)
  expect(state.opened).toBe(0)
  const ui = await $.ui.mount(above)
  expect(await ui.find({ key: 'nav-open' })).toBeDefined()
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

test('in fullscreen the pane shows only the turns', { options: { language: 'zh-TW' } }, async ($, on) => {
  mock.session(on)
  await $.session.append(prompt('first'))
  const ui = await $.ui.mount({ ...pane, viewport: { columns: 120, rows: 40, isFullscreen: true } })
  expect(await ui.find({ type: 'Text', text: '非全螢幕' })).toBeUndefined()
})

test('empty pane explains that there is no conversation yet', { options: { language: 'zh-TW' } }, async $ => {
  const ui = await $.ui.mount(pane)
  expect((await ui.find({ type: 'Text' }))?.text).toBe('還沒有對話')
})

// A stand-in for prompt-band: draws the line this mod publishes, and its ✕, as its own Buttons.
const BAND = {
  name: 'prompt-band',
  register(on: Parameters<typeof mock.store>[0]) {
    on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
      const { value } = await $.state.get({ plugin: 'turn-nav', key: 'chip' } as const)
      const below = await next(e)
      const { Box, Button, Text } = $.ui.resolve(e)
      return h(Box, { flexDirection: 'column' }, value
        ? h(Box, { flexDirection: 'row' }, h(Button, { key: 'turn-nav', label: `${value.label} | ${value.action}`, onPress: () => undefined }), h(Button, { key: 'turn-nav-off', label: '✕', onPress: () => undefined }))
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
  expect((await ui.find({ key: 'turn-nav' }))?.text).toBe('🧭 導覽 · 0 則 | 開啟')
  await $.session.append(prompt('第一個問題\nmore'))
  expect((await ui.find({ key: 'turn-nav' }))?.text).toBe('🧭 導覽 · 1 則 · 第一個問題 | 開啟')
  state.placeNext = true
  await $.ui.press({ plugin: 'prompt-band', key: 'turn-nav' })
  expect(state.placed).toBe(true)
  expect(await ui.find({ type: 'Text', text: 'no line' })).toBeDefined()
})

test("pressing prompt-band's ✕ turns the navigator off", { plugins: [BAND], options: { language: 'zh-TW' } }, async ($, on) => {
  mock.store(on)
  const state = panes(on)
  state.placeNext = false
  state.promptBand = '1'
  await $.session.start(start)
  const ui = await $.ui.mount(above)
  await $.ui.press({ plugin: 'prompt-band', key: 'turn-nav-off' })
  expect(await ui.find({ type: 'Text', text: 'no line' })).toBeDefined()
  await $.session.start(start)
  expect(state.opened).toBe(1)
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
  mock.store(on, { mode: 'collapsed' })
  panes(on)
  await $.session.start(start)
  const ui = await $.ui.mount(above)
  expect((await ui.find({ key: 'nav-open' }))?.text).toMatch(/^🧭 Prompts · 0 +Open ›$/)
})

test('unknown and missing languages use English strings', () => {
  expect(stringsFor('fr')).toBe(STRINGS.en)
  expect(stringsFor(undefined)).toBe(STRINGS.en)
})
