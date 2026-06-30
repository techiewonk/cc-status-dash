# Options & Settings Reference

Every configuration knob in cc-status-dash, with types, defaults, and examples.

Config is a JSON file merged over the built-in defaults. It lives at (first found wins,
highest priority last):

```
defaults  <  $XDG_CONFIG_HOME/cc-status-dash/config.json
          <  $CLAUDE_CONFIG_DIR/cc-status-dash.json
          <  ~/.claude/cc-status-dash.json
          <  ./.cc-status-dash.json            (project-local, UNTRUSTED — see Security)
          <  --config <path>
          <  environment variables
          <  CLI flags
```

The file is re-read on **every render**, so edits apply with no restart. Validate any
file with `cc-status-dash --validate`.

---

## Top-level options

| Key | Type | Default | Description |
|---|---|---|---|
| `preset` | string | `"essential"` | Preset id from the catalog (see [Presets](#presets)), or `"custom"` to drive `lines` by hand. A named preset expands to its `lines` unless you also provide `lines`. |
| `theme` | string | `"hud-clean"` | Base color palette (10): `hud-clean`, `tokyo-night`, `gruvbox`, `nord`, `catppuccin`, `dracula`, `one-dark`, `rose-pine`, `hud-light`, `mono`. |
| `charset` | `"unicode"` \| `"text"` | `"unicode"` | `unicode` uses Nerd Font glyphs + box drawing; `text` is pure ASCII for terminals without a Nerd Font. |
| `colorDepth` | `"auto"` \| `"ansi"` \| `"ansi256"` \| `"truecolor"` \| `"none"` | `"auto"` | Force a color depth. `auto` detects from the terminal; `none` disables color. |
| `separator` | string | `"│"` | Character drawn between widgets on an `inline` line. |
| `minimalist` | boolean | `false` | Drop widget labels — raw values only (e.g. `54%` instead of `Context 54%`). |
| `globalBold` | boolean | `false` | Force every segment bold. |
| `padding` | number (≥0) | `1` | Spaces of padding around each segment's text. |
| `autoWrap` | boolean | `false` | Wrap long `inline` lines to the terminal width (uses `COLUMNS`, else `stdout.columns`). |
| `refreshInterval` | number (≥0) | `10` | Hint (seconds) written into Claude Code's `statusLine` config; keeps elapsed timers ticking while idle. |
| `lines` | `LineConfig[]` | preset | The layout. Overrides `preset`'s lines when present. Up to **9** lines. |
| `modelContextLimits` | object | — | Per-model context-window sizes (tokens): `{ sonnet?, opus?, haiku?, default? }`. Used when the payload omits `context_window_size`. |
| `powerlineSeparator` | enum | `arrow` | Powerline separator glyph: `arrow` `round` `triangle` `flame` `pixel` (Nerd Font). Applies to `powerline`-style lines. |
| `powerlineCaps` | enum | `none` | Powerline end caps wrapping the bar: `none` `round` `flame` (Nerd Font). |
| `overrideForeground` | string | — | Force one foreground color on **every** segment (named/256/hex). |
| `overrideBackground` | string | — | Force one background color on every segment. |
| `colors` | object | theme | Per-key color overrides layered on top of the theme (incl. `usageWarning`/`usageCritical`). See [Colors](#colors). |

### Example

```json
{
  "preset": "custom",
  "theme": "tokyo-night",
  "charset": "unicode",
  "minimalist": false,
  "globalBold": false,
  "padding": 1,
  "autoWrap": true,
  "separator": "│",
  "colors": { "model": "#7dcfff", "context": "#9ece6a" },
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
      { "id": "activity.tools" }, { "id": "activity.agents" }, { "id": "activity.todos" }
    ]}
  ]
}
```

---

## Lines

Each entry in `lines` is one rendered row.

| Key | Type | Default | Description |
|---|---|---|---|
| `style` | `"inline"` \| `"powerline"` \| `"capsule"` | `"inline"` | Render style for the row. |
| `showWhen` | `"always"` \| `"activity"` | `"always"` | `activity` hides the whole line unless a live tool/agent/todo is running — the empty-HUD-collapses behavior. |
| `widgets` | `WidgetConfig[]` | — | Ordered list of widgets. Each is `{ "id": "...", ...options }`. A widget that has nothing to show renders empty and is culled. |

### Render styles

| Style | Looks like |
|---|---|
| `inline` | `seg │ seg │ seg` — values joined by `separator`. |
| `powerline` |  arrow-separated segments with background fills (needs a Nerd Font). |
| `capsule` | each segment in a rounded ` pill `. |

---

## Widgets

A widget is `{ "id": "<id>", ...options }`. List every id locally:

```bash
cc-status-dash --list-widgets     # 114 widgets: id, category, label
```

### Universal options (any widget)

These apply to **every** widget instance and are editable in the `--tui` options screen:

| Option | Type | Description |
|---|---|---|
| `color` | string | Override the foreground color (named / 256 / hex). |
| `bgColor` | string | Background color (also used by powerline). |
| `bold` | boolean | Force bold (or `false` to opt out of `globalBold`). |
| `dim` | boolean \| `"parens"` | `true` recolors the value dim; `"parens"` wraps it in dim parentheses instead. |
| `rawValue` | boolean | Drop the label for just this widget (scoped `minimalist`). |
| `merge` | boolean | Join with the next widget with no separator. |
| `maxWidth` | number | Truncate this widget to N columns with an ellipsis. |
| `barStyle` | enum | On percentage widgets (`context.bar`, `context-percentage`, `usage.block`, `usage.weekly`): render a progress bar — any of the 10 [bar styles](#bar-styles), or `none` for text only. |

### Common per-widget options

These options are read by the widgets noted; unknown options are ignored.

| Option | Type | Applies to | Description |
|---|---|---|---|
| `show1M` | boolean | `model` | Append a `1M` badge when on a 1M-context model (auto-detected). |
| `segments` | number | `cwd` | How many trailing path segments to show (`2` → `projects/app`). |
| `home` | boolean | `cwd` | Abbreviate the home directory to `~`. |
| `showStatus` / `showTitle` | boolean | `git-pr` | Show the PR state / title (both default on). |
| `mode` | `"remaining"` \| `"used"` | `context.bar` | Show context left vs context used. |
| `barStyle` | string | `context.bar`, usage bars | Progress-bar glyph set — see [Bar styles](#bar-styles). |
| `barWidth` | number | `context.bar`, usage/context bars | Fixed bar width in cells; `0`/unset = adaptive (4/6/10 by terminal columns). |
| `usageWarning` / `usageCritical` (colors) | string | `colors.*` | Recolor usage-window warnings/criticals independently of generic `warning`/`critical`. |
| `showPace` | boolean | `usage.block` | Show the burn-vs-time pace delta (`⇣`/`⇡`). |
| `threshold` | number | `usage.weekly`, `usage.block` | Only render when usage % is at/above this (`0` = always). |
| `showDirty` | boolean | `git.branch` | Mark the branch dirty when there are uncommitted changes. |
| `showAheadBehind` | boolean | `git.branch` | Append ahead/behind counts vs upstream. |
| `showDiff` | boolean | `git.branch` | Append `+insertions/-deletions`. |
| `variable` | string | `env` | Name of the environment variable to surface (trusted config only). |
| `command` | string | `custom-command` | Shell command whose stdout becomes the segment (trusted config only). |
| `text` / `symbol` | string | `custom-text`, `custom-symbol` | Literal text/glyph to print. |
| `link` | boolean | `git.branch`, `cwd`, `link` | Emit an OSC-8 hyperlink when a safe URL can be derived (`cwd` links to a `file://` path). |
| `path` | string | `external-usage` | JSON file to read usage from (`{ used_percentage }` or `{ used, limit }` or a bare number; optional `label`/`updated_at`). Trusted config only; or set `$CC_STATUS_DASH_EXTERNAL_USAGE`. |
| `maxAgeMs` | number | `external-usage` | Cull if the file's `updated_at` is older than this. |
| `max` | number | `activity.tool-counts`, `activity.mcp`, `git.files` | How many tools/servers/files to show before collapsing the rest into `+N more`. |
| `nameMax` | number | `activity.tools`, `activity.tool-counts` | Clamp each tool name to N chars (`0` = no clamp); MCP ids always collapse to their leaf (`mcp__github__search` → `search`). |
| `descMax` | number | `activity.agents` | Truncate each subagent's task description to N chars (`0` = hide description). Also shows `[model]` when known. |
| `length` / `glyph` | number / string | `activity.separator` | Width and glyph of the visual rule (default `8` × `─`). |
| `override` | string | `advisor` | Force a literal advisor label instead of the transcript's prettified model id. |
| `mode` | `"age"` \| `"date"` | `session-start-date` | `age` shows elapsed since session start; `date` shows the start time (`HH:MM`). |
| `format` | `"icon"` \| `"text"` \| `"both"` | `voice-status` | Microphone icon, on/off word, or both. |
| `default` / `showUnknown` | string / boolean | `thinking-effort` | Fallback level when stdin omits `effort`; `showUnknown` prints `?` instead of culling. |

### Widget categories (114 total)

| Category | Count | Examples |
|---|---|---|
| `git` | 36 | `git.branch`, `git.files`, `git-status`, `git-changes`, `git-ahead-behind`, `git-sha`, `git-worktree`, `git-stash`, `git-tag`, `git-pr`, `git-operation` |
| `usage` | 16 | `usage.block` (5h), `usage.weekly` (7d), `cost`, `burn-rate`, `budget`, `external-usage`, `cost-projection`, `daily-cost`, `weekly-cost`, `monthly-cost`, `reset-timer` |
| `activity` | 16 | `activity.tools`, `activity.tool-counts`, `activity.agents`, `activity.todos`, `activity.mcp`, `activity.separator`, `skills`, `mcp-count`, `message-count`, `session-duration`, `session-start-date`, `lines-added/removed` |
| `tokens` | 14 | `tokens-total`, `tokens-cached`, `cache-read/write`, `cache-hit-rate`, `cache-roi`, `tokens-per-min`, `input/output/total-speed` |
| `system` | 15 | `version`, `output-style`, `session-name`, `vim-mode`, `voice-status`, `remote-control-status`, `cwd`, `free-memory`, `terminal-width`, `session-clock`, `env`, `config-counts` |
| `context` | 8 | `context.bar`, `context-percentage`, `session-health`, `context-percentage-usable`, `context-length`, `context-window`, `context-1m`, `compaction-counter` |
| `model` | 5 | `model`, `thinking-effort`, `advisor`, `provider`, `claude-account-email` |
| `custom` | 4 | `custom-text`, `custom-symbol`, `custom-command`, `link` |

---

## Bar styles

Used by `context.bar` and usage widgets via `"barStyle"`. Each has a Unicode and an ASCII (`charset: "text"`) form.

| `barStyle` | Filled / empty (unicode) |
|---|---|
| `blocks` (default) | `█` `░` |
| `bar` | `▓` `░` |
| `line` | `━` `┄` |
| `dots` | `●` `○` |
| `ball` | `⬤` `◯` |
| `squares` | `■` `□` |
| `geometric` | `◆` `◇` |
| `filled` | `█` (space) |
| `capped` | `▰` `▱` |
| `blocks-line` | `▬` `▭` |

---

## Colors

Set any key under `"colors"` to override the theme. Values may be:

- a **named** color: `cyan`, `magenta`, `yellow`, `green`, `red`, `blue`, `brightBlue`, `dim`, …
- a **256-color** index: `"208"`
- a **hex** truecolor: `"#ff6600"`

The theme is the base; your `colors` overlay it. Default keys:

| Key | Default | Used for |
|---|---|---|
| `model` | `cyan` | model name |
| `cwd` | `yellow` | working directory |
| `git` | `magenta` | git segment |
| `gitBranch` | `cyan` | branch name |
| `context` | `green` | context bar/percent |
| `usage` | `brightBlue` | 5h / 7d usage |
| `warning` | `yellow` | warning threshold |
| `critical` | `red` | critical threshold |
| `label` | `dim` | widget labels |
| `paceGood` | `green` | under-pace delta |
| `paceBad` | `red` | over-pace delta |

```bash
cc-status-dash --list-themes
```

---

## Environment variables

| Var | Effect |
|---|---|
| `NO_COLOR` | Disables all color (sets `colorDepth: none`). |
| `FORCE_COLOR=0` | Also disables color; `FORCE_COLOR=1/2/3` forces ansi/256/truecolor. |
| `CC_STATUS_DASH_THEME` | Overrides `theme` (above files, below the `--theme` flag). |
| `CC_STATUS_DASH_DISABLE` | Kill switch — when set, the statusline emits nothing and exits. |
| `CC_STATUS_DASH_WIDTH` | Terminal width for `autoWrap` (highest priority, over `COLUMNS`). |
| `COLUMNS` | Terminal width used for `autoWrap` (overrides `stdout.columns`). |
| `XDG_CONFIG_HOME` | Config lookup location (see top). |
| `CLAUDE_CONFIG_DIR` | Config lookup location (Claude Code's config dir). |
| `XDG_STATE_HOME` | Where the persistent stats store lives (`…/cc-status-dash/stats.json`). |

---

## CLI flags

| Flag | Description |
|---|---|
| `--config <path>` | Use a specific config file (trusted — may use command/env widgets). |
| `--theme <id>` | Override the theme for this render. |
| `--preset <id>` | Override the preset for this render. |
| `--list-widgets` | Print all 114 widget ids (id, category, label). |
| `--list-themes` | Print the built-in theme ids. |
| `--list-presets` | Print the preset catalog (id, line-count, description). |
| `--validate` | Report on each config file in the resolution chain; exit 1 if any is invalid. |
| `--configure`, `--wizard` | Run the @clack preset wizard (interactive terminal). |
| `--tui`, `--edit` | Launch the Ink config editor (interactive terminal). |

---

## Presets

35 presets, grouped by layer count. Pick density first, then flavor. Full list any time
with `cc-status-dash --list-presets`.

| Lines | Presets |
|---|---|
| **1** | `minimal`, `vibe`, `pace`, `powerline`, `oneline`, `oneline-git`, `oneline-usage`, `oneline-activity`, `oneline-tokens` |
| **2** | `essential` (default), `compact`, `usage`, `git`, `hud`, `tokens`, `capsule` |
| **3** | `full`, `dev`, `monitor`, `cost`, `pace-focus`, `tokens-plus` |
| **4** | `dashboard`, `dashboard-git`, `dashboard-usage`, `dashboard-monitor` |
| **5** | `max`, `max-usage`, `max-monitor`, `max-cost` |

The `oneline*` family packs many widgets onto a **single** row — e.g. `oneline` shows
model · cwd · git · context · 5h pace · cost all in one line.

---

## Security: trusted vs untrusted config

Project-local `./.cc-status-dash.json` is read from whatever repo you open, so it is
**untrusted**: the `custom-command`, `git-pr`, and `env` widgets are stripped from it
(they execute shell commands / surface env vars — an RCE / secret-exfiltration risk from
merely opening a malicious repo). The same widgets are allowed from your user config and
from an explicit `--config <path>` you pass yourself. See `src/config/load.ts`.
