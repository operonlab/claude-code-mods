# turn-nav

A pane that lists the prompts you sent this session. Press one and the
transcript jumps to it — useful once a session is long enough that scrolling
back to "what did I ask an hour ago" takes a while.

When the pane is closed, one line above the prompt keeps the count and your
newest prompt; press it to open the pane again. `/turn-nav` turns the navigator
off (it stays off in new sessions) and back on.

Jumping needs the fullscreen layout (`"tui": "fullscreen"` in settings); without
it the list still shows, and a press says why it cannot jump. Prompts from
before a `--resume` are not listed, and the list keeps the newest 200.

## Options

`language`: `en` (default) or `zh-TW`, from `/config` or settings:

```json
"pluginConfigs": { "turn-nav@claude-code-mods": { "options": { "language": "zh-TW" } } }
```
