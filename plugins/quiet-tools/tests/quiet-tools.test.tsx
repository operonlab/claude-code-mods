import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import { summarize, summarizeGroup } from '../hooks/register'

// Stands for the engine's own row beneath the plugin, so next(e) has something to draw.
const engineDraws = (on: On) =>
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)

    return <Box key="engine-row" />
  })

const TOGGLE = {
  command: 'quiet-tools',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 100 },
} as const

const bash = (over: { isErrored?: boolean; isInterrupted?: boolean; isRunning?: boolean; output?: unknown } = {}) => ({
  tool_use_id: 'toolu_1',
  tool: 'Bash',
  input: { command: 'ls -la /tmp', description: 'List  temp\nfiles' },
  isRunning: false,
  isErrored: false,
  isInterrupted: false,
  output: { stdout: 'a\nb', stderr: '', interrupted: false },
  ...over,
})

const result = (isErrored: boolean) => ({
  tool_use_id: 'toolu_1',
  tool: 'Bash',
  output: { stdout: 'a\nb', stderr: '', interrupted: false },
  isErrored,
})

test('a successful call draws as one dim line naming the tool and what it did', async ($, on) => {
  engineDraws(on)
  const ui = await $.ui.mount({ plugin: 'quiet-tools', surface: 'terminal', component: 'ToolUse', props: bash() })

  expect((await ui.find({ key: 'quiet-row' }))?.text).toBe('✓ Bash · List temp files')
  expect(await ui.find({ type: 'Text', text: /✓ Bash/ })).toMatchObject({ props: { dimColor: true } })
  expect(await ui.find({ key: 'engine-row' })).toBeUndefined()
})

test('a running call is marked as running, not as done', async ($, on) => {
  engineDraws(on)
  const ui = await $.ui.mount({ plugin: 'quiet-tools', surface: 'terminal', component: 'ToolUse', props: bash({ isRunning: true }) })

  expect((await ui.find({ key: 'quiet-row' }))?.text).toBe('… Bash · List temp files')
})

test('errored and interrupted calls keep the engine row, so failures stay visible', async ($, on) => {
  engineDraws(on)
  for (const over of [{ isErrored: true }, { isInterrupted: true }]) {
    const ui = await $.ui.mount({ plugin: 'quiet-tools', surface: 'terminal', component: 'ToolUse', props: bash(over) })

    expect(await ui.find({ key: 'quiet-row' })).toBeUndefined()
    expect(await ui.find({ key: 'engine-row' })).toBeDefined()
  }
})

test('a successful result draws nothing, an errored one keeps the engine row', async ($, on) => {
  engineDraws(on)
  const ok = await $.ui.mount({ plugin: 'quiet-tools', surface: 'terminal', component: 'ToolResult', props: result(false) })
  expect(await ok.find({ key: 'quiet-result' })).toBeDefined()
  expect(await ok.find({ key: 'engine-row' })).toBeUndefined()

  const failed = await $.ui.mount({ plugin: 'quiet-tools', surface: 'terminal', component: 'ToolResult', props: result(true) })
  expect(await failed.find({ key: 'quiet-result' })).toBeUndefined()
  expect(await failed.find({ key: 'engine-row' })).toBeDefined()
})

test('other surfaces keep their own rows', async ($, on) => {
  engineDraws(on)
  for (const surface of ['desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ plugin: 'quiet-tools', surface, component: 'ToolUse', props: bash() })

    expect(await ui.find({ key: 'quiet-row' })).toBeUndefined()
    expect(await ui.find({ key: 'engine-row' })).toBeDefined()
  }
})

test('/quiet-tools turns it off and on again', async ($, on) => {
  engineDraws(on)
  const off = await $.command.run(TOGGLE)
  expect(off.text).toMatch(/off/)

  const full = await $.ui.mount({ plugin: 'quiet-tools', surface: 'terminal', component: 'ToolUse', props: bash() })
  expect(await full.find({ key: 'quiet-row' })).toBeUndefined()
  expect(await full.find({ key: 'engine-row' })).toBeDefined()

  const back = await $.command.run(TOGGLE)
  expect(back.text).toMatch(/ on/)

  const quiet = await $.ui.mount({ plugin: 'quiet-tools', surface: 'terminal', component: 'ToolUse', props: bash() })
  expect(await quiet.find({ key: 'quiet-row' })).toBeDefined()
})

const call = (tool: string, over: { isErrored?: boolean; isInterrupted?: boolean; isRunning?: boolean } = {}): {
  tool_use_id: string; tool: string; input: unknown; isRunning: boolean; isErrored: boolean; isInterrupted: boolean; output?: unknown
} => ({
  tool_use_id: `toolu_${tool}`,
  tool,
  input: {},
  isRunning: false,
  isErrored: false,
  isInterrupted: false,
  ...over,
})

const group = (calls: ReturnType<typeof call>[], isExpanded = false) => ({
  calls,
  isActive: false,
  isExpanded,
})

test('a folded group draws as one dim line counting its calls', async ($, on) => {
  engineDraws(on)
  const ui = await $.ui.mount({
    plugin: 'quiet-tools',
    surface: 'terminal',
    component: 'ToolGroup',
    props: group([call('Read'), call('Read'), call('Grep')]),
  })

  expect((await ui.find({ key: 'quiet-group' }))?.text).toBe('✓ Read 2 files, searched 1 pattern')
  expect(await ui.find({ key: 'engine-row' })).toBeUndefined()
})

test('a group with a running call is marked as running', async ($, on) => {
  engineDraws(on)
  const ui = await $.ui.mount({
    plugin: 'quiet-tools',
    surface: 'terminal',
    component: 'ToolGroup',
    props: group([call('Read', { isRunning: true })]),
  })

  expect((await ui.find({ key: 'quiet-group' }))?.text).toBe('… Read 1 file')
})

test('an expanded group, or one holding a failed call, keeps the engine rows', async ($, on) => {
  engineDraws(on)
  const cases = [
    group([call('Read')], true),
    group([call('Read'), call('Grep', { isErrored: true })]),
    group([call('Read', { isInterrupted: true })]),
  ]
  for (const props of cases) {
    const ui = await $.ui.mount({ plugin: 'quiet-tools', surface: 'terminal', component: 'ToolGroup', props })

    expect(await ui.find({ key: 'quiet-group' })).toBeUndefined()
    expect(await ui.find({ key: 'engine-row' })).toBeDefined()
  }
})

test('a file sent to the owner keeps its full card: call, result and any group holding it', async ($, on) => {
  engineDraws(on)
  const sent = { tool_use_id: 'toolu_send', tool: 'SendUserFile', input: { files: ['/tmp/a.png'] }, isRunning: false, isErrored: false, isInterrupted: false }
  const use = await $.ui.mount({ plugin: 'quiet-tools', surface: 'terminal', component: 'ToolUse', props: sent })
  expect(await use.find({ key: 'quiet-row' })).toBeUndefined()
  expect(await use.find({ key: 'engine-row' })).toBeDefined()

  const res = await $.ui.mount({
    plugin: 'quiet-tools',
    surface: 'terminal',
    component: 'ToolResult',
    props: { tool_use_id: 'toolu_send', tool: 'SendUserFile', output: {}, isErrored: false },
  })
  expect(await res.find({ key: 'quiet-result' })).toBeUndefined()
  expect(await res.find({ key: 'engine-row' })).toBeDefined()

  const grouped = await $.ui.mount({ plugin: 'quiet-tools', surface: 'terminal', component: 'ToolGroup', props: group([call('Read'), call('SendUserFile')]) })
  expect(await grouped.find({ key: 'quiet-group' })).toBeUndefined()
  expect(await grouped.find({ key: 'engine-row' })).toBeDefined()
})

const GATE = 'PreToolUse:Bash hook error: ⚠️ VERIFICATION GATE: commit/PR 前必須先驗證。\n1. 執行測試\n2. 重新嘗試 commit'

test('a call a hook refused is one red line with the reason, and its error block is hidden', async ($, on) => {
  engineDraws(on)
  for (const output of [GATE, `Error: ${GATE}`, [{ type: 'text', text: GATE }]]) {
    const use = await $.ui.mount({ plugin: 'quiet-tools', surface: 'terminal', component: 'ToolUse', props: bash({ isErrored: true, output }) })
    expect((await use.find({ key: 'quiet-denied' }))?.text).toBe('✗ Bash · List temp files — blocked by hook: ⚠️ VERIFICATION GATE: commit/PR 前必須先驗證。')
    expect(await use.find({ type: 'Text', text: /✗ Bash/ })).toMatchObject({ props: { color: 'error' } })
    expect(await use.find({ key: 'engine-row' })).toBeUndefined()

    const res = await $.ui.mount({ plugin: 'quiet-tools', surface: 'terminal', component: 'ToolResult', props: { ...result(true), output } })
    expect(await res.find({ key: 'quiet-result' })).toBeDefined()
    expect(await res.find({ key: 'engine-row' })).toBeUndefined()
  }
})

test('a command that ran and failed keeps the full row, even when its output mentions a hook', async ($, on) => {
  engineDraws(on)
  for (const output of ['Exit code 1\nFAILED test_x', 'Exit code 1\nPreToolUse:Bash hook error: quoted in a log', 'PostToolUse:Bash hook error: lint']) {
    const use = await $.ui.mount({ plugin: 'quiet-tools', surface: 'terminal', component: 'ToolUse', props: bash({ isErrored: true, output }) })
    expect(await use.find({ key: 'quiet-denied' })).toBeUndefined()
    expect(await use.find({ key: 'engine-row' })).toBeDefined()

    const res = await $.ui.mount({ plugin: 'quiet-tools', surface: 'terminal', component: 'ToolResult', props: { ...result(true), output } })
    expect(await res.find({ key: 'engine-row' })).toBeDefined()
  }
})

test('a refusal wrapped in <tool_use_error> is recognised; one for another tool, or with no reason, is not', async ($, on) => {
  engineDraws(on)
  const wrapped = await $.ui.mount({ plugin: 'quiet-tools', surface: 'terminal', component: 'ToolUse', props: bash({ isErrored: true, output: `<tool_use_error>${GATE}</tool_use_error>` }) })
  expect((await wrapped.find({ key: 'quiet-denied' }))?.text).toContain('blocked by hook: ⚠️ VERIFICATION GATE')

  for (const output of ['PreToolUse:Read hook error: not this call', 'PreToolUse:Bash hook error:', 'PreToolUse:Bash hook error:   \n  ']) {
    const use = await $.ui.mount({ plugin: 'quiet-tools', surface: 'terminal', component: 'ToolUse', props: bash({ isErrored: true, output }) })
    expect(await use.find({ key: 'quiet-denied' })).toBeUndefined()
    expect(await use.find({ key: 'engine-row' })).toBeDefined()
  }
})

test('a group holding a refused call folds the rest and gives the refusal its own red line', async ($, on) => {
  engineDraws(on)
  const refused = { ...call('Bash', { isErrored: true }), input: { command: 'git commit' }, output: GATE }
  const mixed = await $.ui.mount({ plugin: 'quiet-tools', surface: 'terminal', component: 'ToolGroup', props: group([call('Read'), refused]) })
  expect((await mixed.find({ key: 'quiet-group-ran' }))?.text).toBe('✓ Read 1 file')
  expect((await mixed.find({ key: 'quiet-group-denied-1' }))?.text).toBe('✗ Bash · git commit — blocked by hook: ⚠️ VERIFICATION GATE: commit/PR 前必須先驗證。')
  expect(await mixed.find({ type: 'Text', text: /✗ Bash/ })).toMatchObject({ props: { color: 'error' } })
  expect(await mixed.find({ key: 'engine-row' })).toBeUndefined()

  const alone = await $.ui.mount({ plugin: 'quiet-tools', surface: 'terminal', component: 'ToolGroup', props: group([refused]) })
  expect(await alone.find({ key: 'quiet-group-ran' })).toBeUndefined()
  expect(await alone.find({ key: 'quiet-group-denied-0' })).toBeDefined()
})

test('a successful call whose output quotes a hook refusal stays a plain ✓ line', async ($, on) => {
  engineDraws(on)
  const use = await $.ui.mount({ plugin: 'quiet-tools', surface: 'terminal', component: 'ToolUse', props: bash({ output: [{ type: 'text', text: GATE }] }) })
  expect((await use.find({ key: 'quiet-row' }))?.text).toBe('✓ Bash · List temp files')
  expect(await use.find({ key: 'quiet-denied' })).toBeUndefined()
})

test('the refusal label follows the language option', { options: { language: 'zh-TW' } }, async ($, on) => {
  engineDraws(on)
  const use = await $.ui.mount({ plugin: 'quiet-tools', surface: 'terminal', component: 'ToolUse', props: bash({ isErrored: true, output: GATE }) })
  expect((await use.find({ key: 'quiet-denied' }))?.text).toBe('✗ Bash · List temp files — hook 擋下：⚠️ VERIFICATION GATE: commit/PR 前必須先驗證。')
})

test('with quiet-tools off, a refused call keeps the engine row', async ($, on) => {
  engineDraws(on)
  await $.command.run(TOGGLE)
  const use = await $.ui.mount({ plugin: 'quiet-tools', surface: 'terminal', component: 'ToolUse', props: bash({ isErrored: true, output: GATE }) })
  expect(await use.find({ key: 'quiet-denied' })).toBeUndefined()
  expect(await use.find({ key: 'engine-row' })).toBeDefined()
})

test('summarizeGroup names unknown tools by count', () => {
  expect(summarizeGroup(['Bash', 'Bash'])).toBe('Ran 2 commands')
  expect(summarizeGroup(['mcp__x__y'])).toBe('Mcp__x__y ×1')
})

test('summarize picks the most telling field and shortens paths', () => {
  expect(summarize({ file_path: '/Users/x/workshop/README.md' })).toBe('README.md')
  expect(summarize({ command: '  git   status ' })).toBe('git status')
  expect(summarize({ description: '', pattern: 'TODO' })).toBe('TODO')
  expect(summarize({ other: 1 })).toBe('')
  expect(summarize(null)).toBe('')
})
