---
description: Configure cc-status-dash — guided setup of preset, theme, layout, widgets, colors, and global options
allowed-tools: Read, Write, Bash, AskUserQuestion
---

# Configure cc-status-dash

You are the in-Claude-Code config manager for **cc-status-dash** (the statusline +
HUD). Drive a short guided flow with `AskUserQuestion`, then write and validate the
config file. This is the conversational alternative to the standalone `--tui` editor.

## 0. Load current state

**FIRST**, Read `~/.claude/cc-status-dash.json` (and `./.cc-status-dash.json` if present).
- If it exists → **Update flow** (offer to tweak what's there; preserve unknown/advanced keys).
- If not → **New-user flow** (start from a preset).

If you need the live catalogs, run (the binary is `npx cc-status-dash` or `node <dist>/index.js`):
- `cc-status-dash --list-presets` → 30 presets (id, line-count, description)
- `cc-status-dash --list-themes` → 5 themes
- `cc-status-dash --list-widgets` → 101 widget ids (id, category, label)

Full option reference: the repo's `docs/OPTIONS.md`.

## 1. Ask (keep to ≤4 questions; use sensible defaults)

### Q1 — Density (line count)
"How many status lines do you want?"
- **1 line** — `minimal`, `oneline` (everything on one line), `vibe`, `powerline`
- **2 lines (Recommended)** — `essential` (default), `compact`, `hud`, `capsule`
- **3 lines** — `full`, `dev`, `monitor`, `cost`
- **4–5 lines** — `dashboard*`, `max*` dashboards

### Q2 — Flavor (preset)
Show the 3–4 presets matching the chosen density (from `--list-presets`) with their
descriptions. Map the choice to a `preset` id. Offer **"Custom layout"** to hand-pick widgets.

### Q3 — Theme
`hud-clean` (default) · `tokyo-night` · `gruvbox` · `nord` · `mono`.

### Q4 — Tweaks (multiSelect)
- **ASCII mode** → `"charset": "text"` (terminals without a Nerd Font)
- **Minimalist** → `"minimalist": true` (drop labels, values only)
- **Bold everything** → `"globalBold": true`
- **Auto-wrap to width** → `"autoWrap": true`
- **Live activity line** → append a line `{ "style": "inline", "showWhen": "activity", "widgets": [{"id":"activity.tool-counts"},{"id":"activity.agents"},{"id":"activity.todos"}] }`

If the user picked **Custom layout**, instead build `lines[]` directly: each line has a
`style` (`inline` | `powerline` | `capsule`), optional `showWhen` (`always` | `activity`),
and an ordered `widgets` array of `{ "id": "...", ...options }`. Common per-widget options
(see `docs/OPTIONS.md`): `model.show1M`, `cwd.segments`, `context.bar.{mode,barStyle}`,
`usage.block.showPace`, `usage.weekly.threshold`, `git.branch.{showDirty,showAheadBehind,showDiff}`.

### Optional — Custom colors
If the user wants brand colors, set keys under `"colors"` (named like `cyan`/`dim`, a
256-index like `"208"`, or hex like `"#ff6600"`): `model`, `cwd`, `git`, `gitBranch`,
`context`, `usage`, `warning`, `critical`, `label`, `paceGood`, `paceBad`.

## 2. Write

Merge the answers over the **existing** config (preserve any keys you didn't ask about),
then Write `~/.claude/cc-status-dash.json`. Use a named `preset` when the user took a
preset unchanged; use `"preset": "custom"` + explicit `lines` when they customized layout.

Example (custom layout, tokyo-night, with an activity line):

```json
{
  "preset": "custom",
  "theme": "tokyo-night",
  "charset": "unicode",
  "colors": { "model": "#7dcfff" },
  "lines": [
    { "style": "powerline", "widgets": [
      { "id": "model", "show1M": true },
      { "id": "cwd", "segments": 2 },
      { "id": "git.branch", "showDirty": true, "showAheadBehind": true, "showDiff": true }
    ]},
    { "style": "inline", "widgets": [
      { "id": "context.bar", "mode": "remaining", "barStyle": "blocks" },
      { "id": "usage.block", "showPace": true },
      { "id": "cost" }
    ]},
    { "style": "inline", "showWhen": "activity", "widgets": [
      { "id": "activity.tool-counts" }, { "id": "activity.agents" }, { "id": "activity.todos" }
    ]}
  ]
}
```

## 3. Validate & confirm

Run `cc-status-dash --validate` — if it reports `FAIL`, fix the offending field and
re-write. Then show the user a live preview by piping a sample payload through the binary,
e.g. `cat <repo>/sample-input.json | cc-status-dash` (or describe the resulting lines).

The config **reloads on every render** — no restart needed. If the statusline isn't wired
up yet, point them at `/cc-status-dash:setup`.
