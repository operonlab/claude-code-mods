import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'
import { stringsFor } from './strings'
import type { Strings } from './strings'

// ponytail: on/off lives in session state and resets to on each session; persist it in $.store if that gets annoying
const isOn = atom({ plugin: 'quiet-tools', key: 'isOn' } as const, true)

const FIELDS = ['description', 'command', 'file_path', 'pattern', 'url', 'query', 'prompt'] as const

// The card itself is the deliverable (a file put in front of the owner), so folding it hides the thing asked for.
const ALWAYS_FULL = new Set(['SendUserFile'])

export function summarize(input: unknown): string {
  if (typeof input !== 'object' || input === null) return ''
  const fields = input as Record<string, unknown>
  for (const name of FIELDS) {
    const value = fields[name]
    if (typeof value !== 'string' || value.trim() === '') continue
    const text = name === 'file_path' ? (value.split('/').pop() ?? value) : value
    return text.replace(/\s+/g, ' ').trim()
  }
  return ''
}

const GROUP_WORDS: Record<string, [string, string]> = {
  Read: ['read', 'file'],
  Grep: ['searched', 'pattern'],
  Glob: ['searched', 'pattern'],
  Bash: ['ran', 'command'],
}

export function summarizeGroup(tools: readonly string[]): string {
  const counts = new Map<string, number>()
  for (const tool of tools) counts.set(tool, (counts.get(tool) ?? 0) + 1)
  const parts = [...counts].map(([tool, n]) => {
    const words = GROUP_WORDS[tool]
    if (words === undefined) return `${tool} ×${n}`
    return `${words[0]} ${n} ${words[1]}${n === 1 ? '' : 's'}`
  })
  const text = parts.join(', ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// A PreToolUse hook refused the call before it ran: there is no output to read, and
// the reason fits on one line. A command that ran and failed is not this.
const HOOK_DENIED = /^(?:Error:\s*)?(?:<tool_use_error>\s*)?PreToolUse:(\S+) hook error:\s*/

/**
 * The first line of the refusing hook's reason when a PreToolUse hook refused this
 * call to `tool`; null otherwise, and null when the hook gave no reason (the full
 * row then says what little there is).
 */
export function hookDenial(output: unknown, tool: string): string | null {
  const text = typeof output === 'string'
    ? output
    : Array.isArray(output)
      ? output.map(block => (block && typeof block === 'object' && typeof block.text === 'string' ? block.text : '')).join('\n')
      : ''
  const trimmed = text.trimStart()
  const match = HOOK_DENIED.exec(trimmed)
  if (match === null || match[1] !== tool) return null
  const reason = trimmed.slice(match[0].length).replace(/<\/tool_use_error>\s*$/, '')
    .split(/\r?\n/).map(line => line.trim()).find(Boolean)
  return reason || null
}

function deniedLine(tool: string, detail: string, reason: string, s: Strings): string {
  return `✗ ${tool}${detail === '' ? '' : ` · ${detail}`} — ${s.blocked}${reason}`
}

export const register: Register = (on, options) => {
  const s = stringsFor(options?.language)

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'quiet-tools',
      description: 'Toggle one-line tool rows: successful calls draw as one dim line, their output hidden',
    })

    return next(e)
  })

  on('command.run', { command: 'quiet-tools' }, async $ => {
    const now = await update($, isOn, value => !value)

    return { text: now ? s.on : s.off }
  })

  // Failed and interrupted calls keep the engine's full row, so failures stay visible;
  // a call a hook refused is one red line naming the reason.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.isInterrupted || ALWAYS_FULL.has(e.props.tool)) return next(e)
    const denial = e.props.isErrored ? hookDenial(e.props.output, e.props.tool) : null
    if (e.props.isErrored && denial === null) return next(e)
    if (!(await read($, isOn))) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const detail = summarize(e.props.input)

    if (denial !== null) {
      return (
        <Box key="quiet-denied">
          <Text color="error" wrap="truncate-end">
            {deniedLine(e.props.tool, detail, denial, s)}
          </Text>
        </Box>
      )
    }

    return (
      <Box key="quiet-row">
        <Text dimColor wrap="truncate-end">
          {e.props.isRunning ? '… ' : '✓ '}
          {e.props.tool}
          {detail === '' ? '' : ` · ${detail}`}
        </Text>
      </Box>
    )
  })

  // isExpanded is ctrl+o or --verbose: the engine's expanded rows stay reachable there.
  // A refused call in the group gets its own red line; any other failure unfolds it.
  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.isExpanded) return next(e)
    const calls = e.props.calls.map(call => ({ call, denial: call.isErrored ? hookDenial(call.output, call.tool) : null }))
    if (calls.some(({ call, denial }) => (call.isErrored && denial === null) || call.isInterrupted || ALWAYS_FULL.has(call.tool))) return next(e)
    if (!(await read($, isOn))) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const ran = calls.filter(({ denial }) => denial === null).map(({ call }) => call)
    const isRunning = ran.some(call => call.isRunning)

    return (
      <Box key="quiet-group" flexDirection="column">
        {ran.length > 0 && (
          <Box key="quiet-group-ran">
            <Text dimColor wrap="truncate-end">
              {isRunning ? '… ' : '✓ '}
              {summarizeGroup(ran.map(call => call.tool))}
            </Text>
          </Box>
        )}
        {calls.flatMap(({ call, denial }, i) => denial === null ? [] : [
          <Box key={`quiet-group-denied-${i}`}>
            <Text color="error" wrap="truncate-end">
              {deniedLine(call.tool, summarize(call.input), denial, s)}
            </Text>
          </Box>,
        ])}
      </Box>
    )
  })

  // The refused call's row already carries the reason; its error block would repeat it.
  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || ALWAYS_FULL.has(e.props.tool)) return next(e)
    if (e.props.isErrored && hookDenial(e.props.output, e.props.tool) === null) return next(e)
    if (!(await read($, isOn))) return next(e)

    const { Box } = $.ui.resolve(e)

    return <Box key="quiet-result" />
  })
}
