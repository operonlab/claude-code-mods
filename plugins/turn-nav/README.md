# turn-nav

A pane that lists the prompts you sent this session. Press one and the
transcript jumps to it — useful once a session is long enough that scrolling
back to "what did I ask an hour ago" takes a while.

The pane opens with a search field focused: type to keep only the prompts that
match (fuzzy, so `ath` finds `auth`; every word you type must match), each with
its own number. Enter jumps to the newest match; Esc goes back to the prompt.

New sessions show one line above the prompt with the count and newest prompt.
Press the line to expand the pane. Press the frame's close mark to collapse it
back to the line for this session. `/turn-nav` is the only
off switch: it stays off in new sessions until you run `/turn-nav` again.

Jumping needs the fullscreen layout (`"tui": "fullscreen"` in settings); without
it the list still shows, and a press says why it cannot jump. The list keeps
the newest 200.

The list also holds the prompts sent before this process started or the mod
was reloaded (a `--resume`, a `/reload-plugins`), read from the session's own
transcript file each time the mod starts: found by the session id under
`~/.claude/projects/` (or `$CLAUDE_CONFIG_DIR`), then `grep` and `tail` on the
host keep the newest 4 MB of prompt rows (through `/bin/sh` with `set -o pipefail`;
where a shell refuses that, the pane says the read failed). A session with no transcript yet shows
nothing more. The file's format is Claude Code's own and undocumented: when the
read fails, finds no prompt of yours, or had to drop the oldest, the pane says so
in a dim line at the top. A prompt from before a `/compact` or on a branch `/rewind` left
may no longer be in the transcript on screen; pressing it says it cannot jump.

## Options

`language`: `en` (default) or `zh-TW`, from `/config` or settings:

```json
"pluginConfigs": { "turn-nav@claude-code-mods": { "options": { "language": "zh-TW" } } }
```
