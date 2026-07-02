---
description: Configure cc-status-dash — guided setup of preset, theme, layout, widgets, colors, and global options
allowed-tools: Read, Write, Bash, AskUserQuestion
---

# Configure cc-status-dash

You are the in-Claude-Code config manager for **cc-status-dash** (the statusline +
HUD). Drive a short guided flow with `AskUserQuestion`, then write and validate the
config file. This is the conversational alternative to the standalone `--tui` editor.

**Always pull live catalogs from the binary — never hardcode counts or a subset
of the list in this file.** The catalog grows over releases; a stale hardcoded
list under-represents real options (this file itself shipped with "5 themes"
for a long time after the real count reached 10 — don't repeat that mistake):

```bash
cc-status-dash --list-presets   # id, line-count, description
cc-status-dash --list-themes    # theme ids only
cc-status-dash --list-widgets   # id, category, label
```

Full per-widget option reference: the repo's `docs/OPTIONS.md`.

## 0. Load current state — pick Flow A or Flow B

**FIRST**, Read `~/.claude/cc-status-dash.json` (and `./.cc-status-dash.json` if present).

- **Doesn't exist** → **Flow A: New user** (start from a preset, 4 questions).
- **Exists** → **Flow B: Update** (show what's currently set, offer targeted
  tweaks, preserve everything you don't touch — including advanced keys this
  flow doesn't ask about: `colors.*`, per-widget `color`/`bgColor`/`maxWidth`,
  `powerlineTheme`, `flexMode`, `gitCacheTtlSeconds`, `compactThreshold`).

## Flow A: New User (4 Questions)

### Q1 — Density (line count)
"How many status lines do you want?"
- **1 line** — `minimal`, `oneline`, `vibe`, `powerline`
- **2 lines (Recommended)** — `essential` (default), `compact`, `hud`, `capsule`
- **3 lines** — `full`, `dev`, `monitor`, `cost`
- **4–5 lines** — `dashboard*`, `max*` dashboards

### Q2 — Flavor (preset)
Run `cc-status-dash --list-presets` and show the 3–4 presets matching the chosen
density, each with its real description from the catalog. Map the choice to a
`preset` id. Offer **"Custom layout"** to hand-pick widgets instead.

### Q3 — Theme
Run `cc-status-dash --list-themes` and offer **all** returned ids (currently 10)
with a one-line vibe each — do not truncate to a "popular" subset:

- `hud-clean` (default) — Claude HUD's restrained neutral palette
- `tokyo-night` — cool blues/purples, dark background
- `gruvbox` — warm retro oranges/greens, high contrast
- `nord` — arctic blue-grays, muted and cool
- `catppuccin` — soft pastel, warm dark background
- `dracula` — vivid purple/pink/cyan on near-black
- `one-dark` — Atom-editor blue/green, balanced dark
- `rose-pine` — muted rose/pine, low-contrast and calm
- `hud-light` — the one light-background theme in the catalog
- `mono` — no color, structure-only (closest to a plain-text terminal)

### Q4 — Tweaks (multiSelect)
Each option below is a real toggle with a real effect shown inline so the user
sees what they're picking, not just a flag name:

- **ASCII mode** → `"charset": "text"` — for terminals without a Nerd Font; glyphs like `✱`/`│`/`⏱` become `M`/`|`/plain text
- **Minimalist** → `"minimalist": true` — drops labels: `Ctx 46%` becomes just `46%`
- **Align labels** → `"alignLabels": true` — right-pads labels across separate lines so values line up: `Ctx 46%` / `5h  38%` (both padded to the same width)
- **Icons off** → `"icons": false` — hides decorative glyphs (`✱ ✦ ⚙ ⏱`) but keeps structural ones (separators, arrows, bars)
- **Bold everything** → `"globalBold": true`
- **Auto-wrap to width** → `"autoWrap": true`
- **Live activity line** → append `{ "style": "inline", "showWhen": "activity", "widgets": [{"id":"activity.tool-counts"},{"id":"activity.agents"},{"id":"activity.todos"}] }` — only appears while tools/agents/todos are actually active

If **Custom layout** was chosen in Q2, instead build `lines[]` directly: each line
has a `style` (`inline` | `powerline` | `capsule` | `panel`), optional `showWhen`
(`always` | `activity`), and an ordered `widgets` array of `{ "id": "...", ...options }`.
Common per-widget options (see `docs/OPTIONS.md`): `model.show1M`, `cwd.segments`,
`context.bar.{mode,barStyle}`, `usage.block.{showPace,scope}`, `usage.weekly.threshold`,
`git.branch.{showDirty,showAheadBehind,showDiff}`, `cache-hit-rate.scope` (`turn`|`block`),
`budget.scope` (`session`|`today`|`month`|`block`|`repo`).

### Optional — Custom colors
If the user wants brand colors, set keys under `"colors"` (named like `cyan`/`dim`,
a 256-index like `"208"`, or hex like `"#ff6600"`): `model`, `cwd`, `git`, `gitBranch`,
`context`, `usage`, `warning`, `critical`, `label`, `paceGood`, `paceBad`.

## Flow B: Update Config (existing config found)

Show the user their current `preset`/`theme`/`lines` summary first, then ask a
**scoped** set of questions rather than re-running the full wizard:

### Q1 — What do you want to change?
multiSelect:
- "Theme" — re-run Q3 from Flow A
- "Density/preset" — re-run Q1+Q2 from Flow A (warns: replaces `lines[]`)
- "Tweaks" — re-run Q4 from Flow A, pre-checking whichever are already set
- "Add/remove a widget" — ask which line, which widget id (from `--list-widgets`), add after which existing widget or remove which one
- "Colors" — the Optional Custom colors step from Flow A

Only touch the keys implied by what the user picked in Q1 — everything else in
the existing config carries over untouched, including advanced keys this
command never asks about (see the list in Step 0).

## Write

Merge the answers over the **existing** config (preserve any keys you didn't
ask about — this matters most in Flow B), then Write `~/.claude/cc-status-dash.json`.
Use a named `preset` when the user took a preset unchanged; use `"preset": "custom"`
+ explicit `lines` when they customized layout.

Example (custom layout, tokyo-night, with alignLabels and an activity line):

```json
{
  "preset": "custom",
  "theme": "tokyo-night",
  "charset": "unicode",
  "alignLabels": true,
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

## Validate & confirm

Run `cc-status-dash --validate` — if it reports `FAIL`, fix the offending field
and re-write; don't leave an invalid config in place. Then show the user a live
preview by piping a sample payload through the binary:

```bash
cat sample-input.json | cc-status-dash    # from the repo root; use a minimal JSON payload elsewhere
```

If the preview looks wrong (missing widgets, garbled glyphs, wrong colors),
diagnose before telling the user it's done — don't just describe what the
config *should* produce, show what it *actually* produces.

The config **reloads on every render** — no restart needed for `cc-status-dash.json`
edits. If the statusline isn't wired into Claude Code's `settings.json` yet
(check with `cc-status-dash --install --dry-run`), point the user at `/cc-status-dash:setup`.
