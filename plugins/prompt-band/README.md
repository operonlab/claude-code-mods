# prompt-band

hook-notices and turn-nav each draw a line above the prompt. prompt-band puts
both on one row, so they take one line instead of two:

```
🪝 Hook messages · 3 · ⚠ 1 · deploy ch…  Open › │ 🧭 Prompts · 9 · fix the…  Open › ✕
```

On a narrow terminal the two stack again. Pressing either half does what the
mod's own line does; `✕` turns the navigator off.

Needs [hook-notices](../hook-notices) and [turn-nav](../turn-nav); it shows
nothing on its own.
