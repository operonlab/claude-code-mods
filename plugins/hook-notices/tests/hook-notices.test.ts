import { expect, mock, test } from 'claude-code/testing'
import { STRINGS, stringsFor } from '../hooks/strings'
import type { Engine } from 'claude-code/testing'
import type { On, RenderElement } from 'claude-code'
import { cellWidth, fitRow, formatNotice, headline, parseNotices } from '../hooks/notices'

const FIRST = { ts: '2026-10-08T08:01:00Z', event: 'SessionStart', level: 'info', text: 'first notice' }
const SECOND = { ts: '2026-10-08T08:02:00Z', event: 'Stop', level: 'alert', text: 'second notice\nfull detail' }
const THIRD = { ts: '2026-10-08T08:03:00Z', event: 'Stop', level: 'info', text: 'third notice' }
const COMMAND = { command: 'hook-notices', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as const
const PANE = {
  plugin: 'hook-notices', surface: 'terminal', component: 'Pane', requestId: 'hook-notices',
  props: { title: 'hook 訊息', isFocused: false, bodyColumns: 48, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const
const ABOVE = {
  plugin: 'hook-notices', surface: 'terminal', component: 'AbovePrompt', requestId: 'above-prompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 120, scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

// `placed` is whether the pane is drawn; the kit has no engine beneath ui.open to draw it.
function world(on: On, file: { text: string | undefined }, promptBand?: string) {
  const clock = mock.clock(on)
  const sets: Array<[string, string | undefined]> = []
  const pane = { placed: false, args: {} as Record<string, unknown> }
  on('env.get', (_$, e) => ({ value: e.name === 'HOOK_NOTICES_DIR' ? '/notices' : e.name === 'HOME' ? '/home/test' : e.name === 'PROMPT_BAND' ? promptBand : undefined }))
  on('env.set', (_$, e) => { sets.push([e.name, e.value]); return { value: undefined } })
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: 'session-1' }))
  on('fs.exists', (_$, e) => ({ value: e.path === '/notices/session-1.jsonl' && file.text !== undefined }))
  on('fs.stat', () => ({ value: { kind: 'file', size: file.text?.length ?? 0, mtimeMs: 0, isLink: false } }))
  on('fs.read', () => ({ value: file.text ?? '' }))
  on('ui.panes', () => ({ value: pane.placed ? [{ id: 'hook-notices', title: 'hook 訊息', isShown: true, isFocused: false, isPlaced: true }] : [] }))
  on('ui.open', (_$, e) => { pane.placed = true; pane.args = { ...e }; return { value: { isPlaced: true } } })
  on('ui.close', () => { pane.placed = false; return { value: undefined } })
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['engine band'] }))
  return { clock, sets, pane }
}

async function start($: Engine) {
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
}

test('parseNotices accepts valid lines, normalizes levels and skips malformed entries', () => {
  const lines = [JSON.stringify(FIRST), 'not json', '{}', JSON.stringify({ ...SECOND, level: 'unknown' }), JSON.stringify({ event: 'Stop', text: 'missing ts' }), ''].join('\n')
  expect(parseNotices(lines)).toEqual([FIRST, { ...SECOND, level: 'info' }])
  expect(parseNotices(' \n')).toEqual([])
})

test('headline takes the first non-empty line and truncates it', () => {
  expect(headline('\n  \n  hello world  \nother')).toBe('hello world')
  expect(headline('hello world', 6)).toBe('hello…')
  // hook-observatory prefixes each notice with · (info) or ⚠ (alert); the summary line has its own.
  expect(headline('· 沒有進行中的 issue')).toBe('沒有進行中的 issue')
  expect(headline('⚠ 排程有 1 個 job 失敗\n  → cat log')).toBe('排程有 1 個 job 失敗')
  expect(headline('## GitHub PM Status\n### Ready')).toBe('GitHub PM Status')
  expect(headline('#81 auto-survey times out')).toBe('#81 auto-survey times out')
})

test('formatNotice cleans headings, markers, and Markdown while keeping issue numbers', () => {
  expect(formatNotice('⚠ 排程有 1 個 job 失敗\nws-assets-backup — 從未執行過\n  → cat ~/x.err')).toEqual({
    title: '排程有 1 個 job 失敗', details: ['ws-assets-backup — 從未執行過', '→ cat ~/x.err'],
  })
  expect(formatNotice('## GitHub PM Status\n### Ready\n- #81 auto-survey: slow\n**Total**: 3 open')).toEqual({
    title: 'GitHub PM Status', details: ['Ready', '• #81 auto-survey: slow', 'Total: 3 open'],
  })
  expect(formatNotice('#81 keeps its hash').title).toBe('#81 keeps its hash')
  expect(formatNotice('  \n')).toEqual({ title: '', details: [] })
})

test('fitRow fills the width so the whole line is the tap target, the action at its right end', () => {
  const row = fitRow('🪝 2 則 hook 訊息', '展開', 30)
  expect(cellWidth(row)).toBe(30)
  expect(row).toMatch(/^🪝 2 則 hook 訊息 +展開 ›$/)
  const long = fitRow('🪝 9 則 hook 訊息 · ⚠ 1 · 排程有 1 個 job 上次執行失敗、1 個從未執行過', '展開', 30)
  expect(cellWidth(long)).toBe(30)
  expect(long).toMatch(/… +展開 ›$/)
})

test('the collapsed line is one button as wide as the band', { options: { language: 'zh-TW' } }, async ($, on) => {
  const { clock } = world(on, { text: JSON.stringify(FIRST) })
  await start($)
  const ui = await $.ui.mount(ABOVE)
  await clock.advance(1000)
  // Three cells are left at the right so the › lines up with the navigator line's ✕.
  expect(cellWidth((await ui.find({ key: 'open' }))?.text ?? '')).toBe(ABOVE.props.bodyColumns - 4)
  expect((await ui.find({ key: 'open' }))?.text).toMatch(/^🪝 hook 訊息 · 1 則 · first notice +展開 ›$/)
})

test('the line carries no hotkey, which a plain Button draws as `h: ` ahead of the label', { options: { language: 'zh-TW' } }, async ($, on) => {
  const { clock } = world(on, { text: [FIRST, SECOND].map(notice => JSON.stringify(notice)).join('\n') })
  await start($)
  const ui = await $.ui.mount(ABOVE)
  await clock.advance(1000)
  const hotkeys = async () => (await ui.findAll({ type: 'Button' })).filter(b => b.props.plain && b.props.hotkey !== undefined).map(b => b.key)
  expect(await hotkeys()).toEqual([])
})

test('session start enables the sink', { options: { language: 'zh-TW' } }, async ($, on) => {
  const { sets } = world(on, { text: undefined })
  await start($)
  expect(sets).toEqual([['HOOK_NOTICES_SINK', '1']])
})

test('the line opens a scrollable pane, steps aside while it is drawn, and comes back read', { options: { language: 'zh-TW' } }, async ($, on) => {
  const file = { text: [FIRST, SECOND].map(notice => JSON.stringify(notice)).join('\n') }
  const { clock, pane } = world(on, file)
  await start($)
  const ui = await $.ui.mount(ABOVE)
  await clock.advance(1000)
  expect((await ui.find({ key: 'open' }))?.text).toMatch(/2 則.*⚠ 1/)
  expect(await ui.find({ type: 'Text', text: 'engine band' })).toBeDefined()

  await ui.press({ key: 'open' })
  expect(pane.placed).toBe(true)
  expect(pane.args).toMatchObject({ id: 'hook-notices', rows: 12, columns: 48 })
  expect(await ui.find({ key: 'open' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'engine band' })).toBeDefined()
  await $.ui.mount(PANE)

  expect((await $.command.run(COMMAND)).text).toBe('hook 訊息已收起')
  expect(pane.placed).toBe(false)
  expect((await ui.find({ key: 'open' }))?.text).toMatch(/2 則.*已讀/)

  file.text += `\n${JSON.stringify(THIRD)}`
  await clock.advance(1000)
  expect((await ui.find({ key: 'open' }))?.text).toMatch(/1 則.*third notice/)
})

// The person's close mark raises ui.close, which the kit cannot raise; that path calls
// the same markRead as /hook-notices and was checked by pressing ✕ in a real session.
test('a notice that arrives while the pane is drawn is drawn too, so closing marks it read', { options: { language: 'zh-TW' } }, async ($, on) => {
  const file = { text: JSON.stringify(FIRST) }
  const { clock } = world(on, file)
  await start($)
  const ui = await $.ui.mount(ABOVE)
  await clock.advance(1000)
  await $.command.run(COMMAND)
  const pane = await $.ui.mount(PANE)
  file.text += `\n${JSON.stringify(SECOND)}`
  await clock.advance(1000)
  expect(await pane.find({ type: 'Text', text: 'second notice' })).toBeDefined()
  await $.command.run(COMMAND)
  expect((await ui.find({ key: 'open' }))?.text).toMatch(/2 則 · 已讀/)
})

test('a pane opened but never drawn marks nothing read', { options: { language: 'zh-TW' } }, async ($, on) => {
  const { clock } = world(on, { text: JSON.stringify(FIRST) })
  await start($)
  const ui = await $.ui.mount(ABOVE)
  await clock.advance(1000)
  await $.command.run(COMMAND)
  await $.command.run(COMMAND)
  expect((await ui.find({ key: 'open' }))?.text).toMatch(/1 則 · first notice/)
})

test('the line names the unread alert, even when an info notice arrived after it', { options: { language: 'zh-TW' } }, async ($, on) => {
  const { clock } = world(on, { text: [SECOND, THIRD].map(notice => JSON.stringify(notice)).join('\n') })
  await start($)
  const ui = await $.ui.mount(ABOVE)
  await clock.advance(1000)
  expect((await ui.find({ key: 'open' }))?.text).toMatch(/2 則.*second notice/)
})

test('the pane lists every notice newest first, with all of its detail', { options: { language: 'zh-TW' } }, async ($, on) => {
  const many = Array.from({ length: 8 }, (_, i) => ({ ...FIRST, text: `notice ${i}` }))
  const long = { ...THIRD, text: 'title\nd1\nd2\nd3\nd4\nd5' }
  const { clock } = world(on, { text: [...many, long].map(notice => JSON.stringify(notice)).join('\n') })
  await start($)
  await clock.advance(1000)
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ key: 'notice-0' }))?.text).toMatch(/title[\s\S]*Stop · \d\d:\d\d[\s\S]*d1[\s\S]*d5/)
  expect((await ui.find({ key: 'notice-8' }))?.text).toMatch(/notice 0/)
})

test('an empty pane says so', { options: { language: 'zh-TW' } }, async ($, on) => {
  world(on, { text: undefined })
  await start($)
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: '還沒有 hook 訊息' })).toBeDefined()
})

test('missing file leaves only the engine band', { options: { language: 'zh-TW' } }, async ($, on) => {
  const { clock } = world(on, { text: undefined })
  await start($)
  const ui = await $.ui.mount(ABOVE)
  await clock.advance(1000)
  expect(await ui.find({ key: 'open' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'engine band' })).toBeDefined()
})

test('/hook-notices opens and closes the pane', { options: { language: 'zh-TW' } }, async ($, on) => {
  const { clock, pane } = world(on, { text: JSON.stringify(FIRST) })
  await start($)
  await clock.advance(1000)
  expect((await $.command.run(COMMAND)).text).toBe('hook 訊息已展開')
  expect(pane.placed).toBe(true)
  expect((await $.command.run(COMMAND)).text).toBe('hook 訊息已收起')
  expect(pane.placed).toBe(false)
})

// A stand-in for prompt-band: draws the line this mod publishes as its own Button.
const BAND = {
  name: 'prompt-band',
  register(on: On) {
    on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
      const { value } = await $.state.get({ plugin: 'hook-notices', key: 'chip' } as const)
      const below = await next(e)
      const { Box, Button, Text } = $.ui.resolve(e)
      return h(Box, { flexDirection: 'column' }, value ? h(Button, { key: 'hook-notices', label: `${value.label} | ${value.action}`, onPress: () => undefined }) : h(Text, {}, 'no line'), below) as RenderElement
    })
  },
}

test('the line is published for prompt-band: the summary while closed, nothing while the pane is drawn', { plugins: [BAND], options: { language: 'zh-TW' } }, async ($, on) => {
  const { clock } = world(on, { text: [FIRST, SECOND].map(notice => JSON.stringify(notice)).join('\n') })
  await start($)
  const ui = await $.ui.mount(ABOVE)
  expect(await ui.find({ type: 'Text', text: 'no line' })).toBeDefined()
  await clock.advance(1000)
  expect((await ui.find({ key: 'hook-notices' }))?.text).toBe('🪝 hook 訊息 · 2 則 · ⚠ 1 · second notice | 展開')
  await $.command.run(COMMAND)
  expect(await ui.find({ type: 'Text', text: 'no line' })).toBeDefined()
  await $.ui.mount(PANE)
  await $.command.run(COMMAND)
  expect((await ui.find({ key: 'hook-notices' }))?.text).toBe('🪝 hook 訊息 · 2 則 · 已讀 | 展開')
})

test('a reload republishes the line, so a pane the reload dropped is offered again', { plugins: [BAND], options: { language: 'zh-TW' } }, async ($, on) => {
  const { clock, pane } = world(on, { text: JSON.stringify(FIRST) }, '1')
  await start($)
  const ui = await $.ui.mount(ABOVE)
  await clock.advance(1000)
  await $.ui.press({ plugin: 'prompt-band', key: 'hook-notices' })
  expect(await ui.find({ type: 'Text', text: 'no line' })).toBeDefined()
  pane.placed = false
  await start($)
  expect((await ui.find({ key: 'hook-notices' }))?.text).toMatch(/1 則 · first notice \| 展開$/)
})

test("pressing prompt-band's line opens the pane", { plugins: [BAND], options: { language: 'zh-TW' } }, async ($, on) => {
  const { clock, pane } = world(on, { text: JSON.stringify(FIRST) }, '1')
  await start($)
  await $.ui.mount(ABOVE)
  await clock.advance(1000)
  await $.ui.press({ plugin: 'prompt-band', key: 'hook-notices' })
  expect(pane.placed).toBe(true)
})

test('with prompt-band loaded the mod leaves its line to the shared row', { options: { language: 'zh-TW' } }, async ($, on) => {
  const { clock } = world(on, { text: JSON.stringify(FIRST) }, '1')
  await start($)
  const ui = await $.ui.mount(ABOVE)
  await clock.advance(1000)
  expect(await ui.find({ key: 'open' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'engine band' })).toBeDefined()
})

test('default language renders English hook label', async ($, on) => {
  const { clock } = world(on, { text: JSON.stringify(FIRST) })
  await start($)
  const ui = await $.ui.mount(ABOVE)
  await clock.advance(1000)
  expect((await ui.find({ key: 'open' }))?.text).toMatch(/^🪝 Hook messages · 1 · first notice +Open ›$/)
})

test('unknown and missing languages use English strings', () => {
  expect(stringsFor('fr')).toBe(STRINGS.en)
  expect(stringsFor(undefined)).toBe(STRINGS.en)
})
