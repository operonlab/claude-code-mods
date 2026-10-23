# link-nav

A pane that lists every file sent to you as a card (SendUserFile) and every
link in Claude's replies this session, newest first. Type in the search field
to filter: fuzzy, so `rprt` finds `report`, and every word you type must match.
Press a row to open it with macOS `open` on the machine the session runs on: the
browser for a URL, the default app for a file (elsewhere a press shows the error).
A file that would run when opened (an app, a script, an installer) is shown in
Finder instead. Press `›` to jump the transcript to where it was
sent. Enter in the search field opens the first match; Esc closes the pane.

Each row reads `number  time  name · where`: its number in order of arrival
(kept while a search reorders the rows) and the time it was handed over,
`HH:MM`, or `MM-DD HH:MM` when not today. Rows read back after a resume have no
time.

A line above the prompt shows the count and the newest one while the pane is
closed; press it to open the pane with the search field focused. `/link-nav`
shows or hides the pane, and hidden stays hidden in new sessions until you run
it again.

Links inside code (backticks or fences) are left out: a URL in a command is not
one being handed over. A file linked in a reply and the same file sent as a
card share one row.

Jumping needs the fullscreen layout. Rows read back from earlier in a resumed
session open but only cards there can jump; links found live can. Files and
links a subagent sends are not listed.

## Options

`language`: `en` (default) or `zh-TW`, from `/config` or settings:

```json
"pluginConfigs": { "link-nav@claude-code-mods": { "options": { "language": "zh-TW" } } }
```
