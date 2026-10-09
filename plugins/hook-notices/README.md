# hook-notices

Hook messages — a SessionStart banner, a reminder on every Stop, a lint warning
after an edit — normally print as rows in the transcript, between the work you
are reading. hook-notices folds them into one line above the prompt:

```
🪝 Hook messages · 3 · ⚠ 1 · deploy check failed                    Open ›
```

The count is what you have not read yet, `⚠` counts alerts among them, and the
headline is the newest alert (or the newest message). Press the line, or run
`/hook-notices`, to open every message of the session in a scrollable pane.

## Your hooks have to hand their messages over

hook-notices does not intercept hook output. It shows what hooks write to one
file per session, and sets `HOOK_NOTICES_SINK=1` in the environment of every
hook so a hook can tell it is there:

- **File**: `$HOOK_NOTICES_DIR/<session_id>.jsonl`, default
  `~/.claude/data/hook-notices/<session_id>.jsonl`
- **Line**: one JSON object per line —
  `{"ts": "2026-10-09T08:47:58Z", "event": "Stop", "level": "info", "text": "…"}`
  (`level` is `"info"` or `"alert"`; anything else reads as info)
- A hook that wrote its message should **not** also print it as a
  `systemMessage`, or you will see it twice.

[`examples/notify.py`](examples/notify.py) does this from any hook command
(Python 3, standard library only). It reads the hook's own JSON on stdin and
exits 2 when hook-notices is not installed, so the hook can fall back:

```sh
#!/bin/sh
input=$(cat)
msg='3 lint warnings in src/'
printf '%s' "$input" | ~/path/to/notify.py "$msg"
# 2 = hook-notices is off: show it the usual way (json.dumps does the quoting)
if [ $? -eq 2 ]; then
  python3 -c 'import json, sys; print(json.dumps({"systemMessage": sys.argv[1]}))' "$msg"
fi
```

Files are small and one per session; nothing deletes them for you.

## Options

`language`: `en` (default) or `zh-TW`, from `/config` or settings:

```json
"pluginConfigs": { "hook-notices@claude-code-mods": { "options": { "language": "zh-TW" } } }
```

## With prompt-band

Installed together with [prompt-band](../prompt-band), this line and
turn-nav's share one row.
