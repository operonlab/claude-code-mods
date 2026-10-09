# quiet-tools

A long turn reads and searches dozens of times, and every call draws its own
block with its output under it. quiet-tools draws each successful call as one
dim line and hides its output:

```
✓ Read · README.md
✓ Bash · Run the unit tests
✓ Read 3 files, searched 2 patterns
```

A call still running shows `…` in place of `✓`.

A call that a PreToolUse hook refused never ran, so there is nothing to read
but the reason; it becomes one red line:

```
✗ Bash · git commit -m "…" — blocked by hook: ⚠️ VERIFICATION GATE: run the tests first
```

Calls that ran and failed, and interrupted ones, keep the full row, so errors
stay where you will see them. `SendUserFile` cards also stay full: the file
they put in front of you is the point of the call. `ctrl+o` (or `--verbose`)
still expands everything as usual.

`/quiet-tools` turns it off and on for the current session.

## Options

`language`: `en` (default) or `zh-TW`, from `/config` or settings:

```json
"pluginConfigs": { "quiet-tools@claude-code-mods": { "options": { "language": "zh-TW" } } }
```
