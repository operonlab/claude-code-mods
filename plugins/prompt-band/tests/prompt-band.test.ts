import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
import { cellWidth, MIN_SHARED, sharedWidths } from '../hooks/band'

const above = (bodyColumns: number) => ({
  plugin: 'prompt-band', surface: 'terminal', component: 'AbovePrompt', requestId: 'above-prompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns, scroll: { offset: 0, bodyRows: 20 }, view: {} },
}) as const

// Stand-ins for the two mods: each publishes the line the test hands it through the
// environment (a plugin closes over nothing of the test file), and says which press
// reached it with a toast.
const HOOK_NOTICES = {
  name: 'hook-notices',
  register(on: On) {
    on('session.start', async ($, e, next) => {
      const line = await $.env.get('TEST_HOOK_CHIP')
      await $.state.set({ plugin: 'hook-notices', key: 'chip' } as const, line ? JSON.parse(line) : null)
      return next(e)
    })
    on('ui.press', { plugin: 'prompt-band', element: 'hook-notices' }, async ($, e, next) => {
      $.ui.toast('pressed hook-notices')
      return next(e)
    })
  },
}
const TURN_NAV = {
  name: 'turn-nav',
  register(on: On) {
    on('session.start', async ($, e, next) => {
      const line = await $.env.get('TEST_NAV_CHIP')
      await $.state.set({ plugin: 'turn-nav', key: 'chip' } as const, line ? JSON.parse(line) : null)
      return next(e)
    })
    on('ui.press', { plugin: 'prompt-band', element: 'turn-nav' }, async ($, e, next) => {
      $.ui.toast('pressed turn-nav')
      return next(e)
    })
    on('ui.press', { plugin: 'prompt-band', element: 'turn-nav-off' }, async ($, e, next) => {
      $.ui.toast('pressed turn-nav-off')
      return next(e)
    })
  },
}
const PLUGINS = { plugins: [HOOK_NOTICES, TURN_NAV] }

const HOOK_CHIP = { label: '🪝 hook 訊息 · 85 則 · 已讀', action: '展開' }
const NAV_CHIP = { label: '🧭 導覽 · 3 則 · 最新的問題', action: '開啟' }

function world(on: On, chips: { hook?: object; nav?: object }) {
  const env: Array<[string, string | undefined]> = []
  const toasts: string[] = []
  on('env.get', (_$, e) => ({ value: e.name === 'TEST_HOOK_CHIP' ? chips.hook && JSON.stringify(chips.hook) : e.name === 'TEST_NAV_CHIP' ? chips.nav && JSON.stringify(chips.nav) : undefined }))
  on('env.set', (_$, e) => { env.push([e.name, e.value]); return { value: undefined } })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('ui.toast', (_$, e) => { toasts.push(e.text); return { value: undefined } })
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['engine band'] }))
  return { env, toasts }
}

async function start($: Engine) {
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
}

test('the navigator line takes what it needs, within its floor and half; the hook line the rest', () => {
  expect(sharedWidths(120, 22)).toEqual([120 - 7 - MIN_SHARED, MIN_SHARED])
  expect(sharedWidths(120, 40)).toEqual([120 - 7 - 40, 40])
  expect(sharedWidths(120, 90)).toEqual([57, 56])
  expect(sharedWidths(2 * MIN_SHARED + 7, 10)).toEqual([MIN_SHARED, MIN_SHARED])
  expect(sharedWidths(2 * MIN_SHARED + 6, 10)).toBeUndefined()
})

test('session start tells the two mods to leave their lines to this row', PLUGINS, async ($, on) => {
  const { env } = world(on, {})
  await start($)
  expect(env).toEqual([['PROMPT_BAND', '1']])
})

test('both lines on one row, ending where the navigator line ends on its own', PLUGINS, async ($, on) => {
  world(on, { hook: HOOK_CHIP, nav: NAV_CHIP })
  await start($)
  const ui = await $.ui.mount(above(120))
  const hook = (await ui.find({ key: 'hook-notices' }))?.text ?? ''
  const nav = (await ui.find({ key: 'turn-nav' }))?.text ?? ''
  expect(hook).toMatch(/^🪝 hook 訊息 · 85 則 · 已讀 +展開 ›$/)
  expect(nav).toMatch(/^🧭 導覽 · 3 則 · 最新的問題 +開啟 ›$/)
  // Uncut: the navigator line gets what its text needs, the hook line the rest.
  expect(cellWidth(nav)).toBe(cellWidth(NAV_CHIP.label) + 1 + cellWidth(' 開啟 ›'))
  // The hook line, ` │ `, the navigator line, ` ✕`.
  expect(cellWidth(hook) + 3 + cellWidth(nav) + 2).toBe(120 - 2)
  expect((await ui.find({ key: 'turn-nav-off' }))?.text).toBe('✕')
  expect(await ui.find({ type: 'Text', text: 'engine band' })).toBeDefined()
})

test('too narrow to share, each line keeps a row of its own as wide as the band allows', PLUGINS, async ($, on) => {
  world(on, { hook: HOOK_CHIP, nav: NAV_CHIP })
  await start($)
  const ui = await $.ui.mount(above(50))
  expect(cellWidth((await ui.find({ key: 'hook-notices' }))?.text ?? '')).toBe(50 - 4)
  expect(cellWidth((await ui.find({ key: 'turn-nav' }))?.text ?? '')).toBe(50 - 4)
  expect((await ui.find({ key: 'turn-nav-off' }))?.text).toBe('✕')
})

test('a very narrow band still fits the navigator row with its ✕', PLUGINS, async ($, on) => {
  world(on, { hook: HOOK_CHIP, nav: NAV_CHIP })
  await start($)
  const ui = await $.ui.mount(above(24))
  // The navigator line, a gap, ✕.
  expect(cellWidth((await ui.find({ key: 'turn-nav' }))?.text ?? '') + 2).toBeLessThanOrEqual(24)
})

test('one line alone takes the whole row', PLUGINS, async ($, on) => {
  world(on, { nav: NAV_CHIP })
  await start($)
  const ui = await $.ui.mount(above(120))
  expect(await ui.find({ key: 'hook-notices' })).toBeUndefined()
  expect(cellWidth((await ui.find({ key: 'turn-nav' }))?.text ?? '')).toBe(120 - 4)
})

test('no line at all leaves only the engine band', PLUGINS, async ($, on) => {
  world(on, {})
  await start($)
  const ui = await $.ui.mount(above(120))
  expect(await ui.findAll({ type: 'Button' })).toHaveLength(0)
  expect(await ui.find({ type: 'Text', text: 'engine band' })).toBeDefined()
})

test('each press reaches the mod whose line it is', PLUGINS, async ($, on) => {
  const { toasts } = world(on, { hook: HOOK_CHIP, nav: NAV_CHIP })
  await start($)
  const ui = await $.ui.mount(above(120))
  await ui.press({ key: 'hook-notices' })
  await ui.press({ key: 'turn-nav' })
  await ui.press({ key: 'turn-nav-off' })
  expect(toasts).toEqual(['pressed hook-notices', 'pressed turn-nav', 'pressed turn-nav-off'])
})
