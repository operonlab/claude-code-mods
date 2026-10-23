import { expect, mock, test } from 'claude-code/testing'
import { fileItem, fileItems, filterItems, fuzzyScore, linkItems, mergeItems, openArgs, rowText, cellWidth } from '../hooks/links'
import type { NavItem } from '../types'

const HOME = '/Users/me'

const pane = <S extends 'terminal' | 'desktop' | 'vscode' | 'mobile'>(surface: S) => ({
  plugin: 'link-nav', surface, component: 'Pane', requestId: 'link-nav',
  props: {
    title: '連結與檔案', isFocused: true, bodyColumns: 40, placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 }, view: {},
  },
} as const)

const reply = (text: string, uuid: string, agentId?: string) => ({
  door: 'response' as const, origin: { kind: 'model' as const, model: 'm' }, uuid, agentId,
  message: { type: 'assistant' as const, content: [{ type: 'text' as const, text }] },
})

const items = (...found: ReturnType<typeof linkItems>): NavItem[] => mergeItems([], found)

test('markdown links and bare URLs are read in order; code is not', () => {
  const text = [
    'See [the issue](https://github.com/openai/codex/issues/49214) and https://pypi.org/project/cclinks/.',
    'Run `curl https://example.com/in-code` or',
    '```\nopen https://example.com/in-fence\n```',
    'A file: [/Users/me/w/a b.png](file:///Users/me/w/a%20b.png)（完）',
    'Bare at the end https://x.dev/path）。',
  ].join('\n')
  const found = linkItems(text, 'row-1', HOME)
  expect(found.map(f => f.href)).toEqual([
    'https://github.com/openai/codex/issues/49214',
    'https://pypi.org/project/cclinks/',
    'file:///Users/me/w/a%20b.png',
    'https://x.dev/path',
  ])
  expect(found[0]).toEqual({ kind: 'url', href: 'https://github.com/openai/codex/issues/49214', label: 'the issue', where: 'github.com', jump: 'row-1' })
  expect(found[1]?.label).toBe('pypi.org/project/cclinks/')
  expect(found[2]).toEqual({ kind: 'file', href: 'file:///Users/me/w/a%20b.png', label: 'a b.png', where: '~/w', jump: 'row-1' })
})

test('a bare URL before a markdown link keeps its place in the text', () => {
  expect(linkItems('https://a.example then [B](https://b.example)', 'r', HOME).map(f => f.href)).toEqual(['https://a.example', 'https://b.example'])
})

test('parentheses inside an address are kept; one closing the prose around it is not', () => {
  const wiki = 'https://en.wikipedia.org/wiki/Foo_(bar)'
  expect(linkItems(`[條目](${wiki})`, 'r', HOME).map(f => f.href)).toEqual([wiki])
  expect(linkItems(`bare ${wiki}.`, 'r', HOME).map(f => f.href)).toEqual([wiki])
  expect(linkItems('(see https://x.dev/p) and (https://y.dev/q).', 'r', HOME).map(f => f.href)).toEqual(['https://x.dev/p', 'https://y.dev/q'])
})

test('a file sent as a card and the same file linked in a reply share one address', () => {
  const card = fileItem('/Users/me/w/a b.png', 'toolu_1', '/tmp', HOME)
  const [linked] = linkItems('[x](file:///Users/me/w/a%20b.png)', 'row-2', HOME)
  expect(linked?.href).toBe(card.href)
  expect(mergeItems([], [card, linked!]).length).toBe(1)
})

test('card paths: absolute, home, relative to the working folder; junk gives none', () => {
  expect(fileItem('/a/b/c.txt', undefined, '/w', HOME)).toEqual({ kind: 'file', href: 'file:///a/b/c.txt', label: 'c.txt', where: '/a/b' })
  expect(fileItem('~/x/y.md', undefined, '/w', HOME).href).toBe('file:///Users/me/x/y.md')
  expect(fileItem('./r/z.html', undefined, '/w/', HOME).href).toBe('file:///w/r/z.html')
  expect(fileItem('/top.txt', undefined, '/w', HOME).where).toBe('/')
  expect(fileItem('/Users/me/中文.png', undefined, '/w', HOME).href).toBe(`file://${encodeURI('/Users/me/中文.png')}`)
  expect(fileItems('nope', 't', '/w', HOME)).toEqual([])
  expect(fileItems(['/a.txt', 3, ''], 't', '/w', HOME).map(f => f.label)).toEqual(['a.txt'])
})

test('merging keeps one row per address, moves a repeat to newest and keeps its jump', () => {
  const a = linkItems('[A](https://a.dev)', 'row-a', HOME)
  const b = linkItems('[B](https://b.dev)', 'row-b', HOME)
  let list = mergeItems([], [...a, ...b])
  // A reload re-reads the transcript: no row ids, and a bare repeat of A.
  list = mergeItems(list, linkItems('https://a.dev', undefined, HOME))
  expect(list.map(i => i.href)).toEqual(['https://b.dev', 'https://a.dev'])
  expect(list[1]).toMatchObject({ label: 'A', jump: 'row-a' })
  expect(mergeItems(list, [], 1).map(i => i.href)).toEqual(['https://a.dev'])
})

test('fuzzy search: letters in order with gaps, every word must match, whole words rank first', () => {
  expect(fuzzyScore('cdx', 'openai/codex issue')).toBeGreaterThan(0)
  expect(fuzzyScore('xdc', 'openai/codex issue')).toBe(-1)
  expect(fuzzyScore('codex 492', 'codex issues/49214')).toBeGreaterThan(0)
  expect(fuzzyScore('codex zzz', 'codex issues/49214')).toBe(-1)
  expect(fuzzyScore('渲染', '04 渲染 對照圖.png')).toBeGreaterThan(0)
  expect(fuzzyScore('CODEX', 'codex')).toBe(fuzzyScore('codex', 'codex'))
  const list = items(
    ...linkItems('[codex repo](https://github.com/openai/codex)', 'r1', HOME),
    ...linkItems('[cat docs](https://c.dev/o/d/e/x)', 'r2', HOME),
    fileItem('/Users/me/out/中文.png', 't1', '/w', HOME),
  )
  expect(filterItems(list, '').map(i => i.label)).toEqual(['中文.png', 'cat docs', 'codex repo'])
  expect(filterItems(list, 'codex')[0]?.label).toBe('codex repo')
  // A file's encoded address is not searched: %E4%B8%AD holds an "e4".
  expect(filterItems(list, 'e4').map(i => i.label)).toEqual([])
  expect(filterItems(list, '中文').map(i => i.label)).toEqual(['中文.png'])
})

test('a row fits its width in terminal cells', () => {
  const [item] = items(fileItem('/Users/me/很長的中文檔名很長的中文檔名很長的中文檔名.png', 't', '/w', HOME))
  expect(cellWidth(rowText(item!, 30))).toBe(30)
})

test('reply links and card files are listed; a subagent\'s are not; search filters', { options: { language: 'zh-TW' } }, async ($, on) => {
  mock.session(on)
  mock.env(on, { HOME })
  on('session.cwd', () => ({ value: '/work' }))
  on('tool.call', () => ({ result: {} }))
  await $.session.append(reply('Done: [report](https://example.com/report) and [/Users/me/a.png](file:///Users/me/a.png)', 'row-1'))
  await $.session.append(reply('agent link https://agent.dev/x', 'row-2', 'agent-1'))
  await $.tool.call({ tool: 'SendUserFile', tool_use_id: 'toolu_1', files: ['out/chart.svg'], status: 'normal' })

  const ui = await $.ui.mount(pane('terminal'))
  const rows = async () => {
    const out: string[] = []
    for (let i = 0; i < 10; i++) {
      const row = await ui.find({ key: `open-${i}` })
      if (row?.text) out.push(row.text.trim())
    }
    return out
  }
  expect(await rows()).toEqual([
    '📄 chart.svg · /work/out',
    '📄 a.png · ~',
    '🔗 report · example.com',
  ])
  expect(await ui.find({ key: 'jump-0' })).toBeDefined()
  await ui.input({ key: 'search', text: 'rprt', kind: 'change' })
  expect(await rows()).toEqual(['🔗 report · example.com'])
  await ui.input({ key: 'search', text: 'nothing-like-it', kind: 'change' })
  expect(await rows()).toEqual([])
  expect(await ui.find({ type: 'Text', text: /沒有符合的/ })).toBeDefined()
  await ui.unmount()
})

test('every surface draws the list; a phone, which has no Input, draws it unfiltered', async ($, on) => {
  mock.session(on)
  mock.env(on, { HOME })
  await $.session.append(reply('[one](https://one.dev)', 'row-1'))
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount(pane(surface))
    expect((await ui.find({ key: 'open-0' }))?.text.trim()).toBe('🔗 one · one.dev')
    if (surface === 'mobile') expect(await ui.find({ key: 'search' })).toBeUndefined()
    else expect(await ui.find({ key: 'search' })).toBeDefined()
    await ui.unmount()
  }
})

test('/link-nav opens and closes the pane', { options: { language: 'zh-TW' } }, async ($, on) => {
  mock.store(on)
  let open = false
  on('ui.panes', () => ({ value: open ? [{ id: 'link-nav', title: '連結與檔案', isShown: true, isFocused: true, isPlaced: true }] : [] }))
  on('ui.open', () => { open = true; return { value: { isPlaced: true } } })
  on('ui.close', () => { open = false; return { value: undefined } })
  const command = { command: 'link-nav', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } } as const
  expect((await $.command.run(command)).text).toBe('連結導覽已開啟')
  expect(open).toBe(true)
  expect((await $.command.run(command)).text).toMatch(/^連結導覽已關閉/)
  expect(open).toBe(false)
})

test('labels are English unless zh-TW is chosen', async ($, on) => {
  mock.store(on)
  on('ui.panes', () => ({ value: [] }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  const command = { command: 'link-nav', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } } as const
  expect((await $.command.run(command)).text).toBe('Link navigator on')
})

test('a press opens a URL or a file, but only reveals a file that would run', () => {
  const [url] = items(...linkItems('[a](https://a.dev/x)', 'r', HOME))
  expect(openArgs(url!)).toEqual({ argv: ['/usr/bin/open', 'https://a.dev/x'], revealed: false })
  const [png] = items(fileItem('/Users/me/out/a b.png', 't', '/w', HOME))
  expect(openArgs(png!)).toEqual({ argv: ['/usr/bin/open', '/Users/me/out/a b.png'], revealed: false })
  for (const name of ['payload.command', 'Tool.app', 'setup.PKG', 'run.sh', 'x.webloc', 'Thing.app/']) {
    const [f] = items(...linkItems(`[x](file:///Users/me/Downloads/${encodeURI(name)})`, 'r', HOME))
    expect(openArgs(f!).revealed).toBe(true)
    expect(openArgs(f!).argv.slice(0, 2)).toEqual(['/usr/bin/open', '-R'])
  }
})
