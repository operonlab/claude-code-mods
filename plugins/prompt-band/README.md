# prompt-band

hook-notices and turn-nav each draw a line above the prompt. prompt-band puts
both on one row, so they take one line instead of two:

```
🧭 Prompts · 9 · fix the… │ 🪝 Hook messages · 3 · ⚠ 1 · deploy ch…
```

On a narrow terminal the two stack again. Pressing either half does what the
mod's own line does.

Needs [hook-notices](../hook-notices) and [turn-nav](../turn-nav); it shows
nothing on its own.
