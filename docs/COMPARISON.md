# Option-level comparison: cc-status-dash vs ccstatusline vs claude-hud

A three-way, option-level comparison of how each tool lets you customize the statusline,
and where cc-status-dash now stands. (Source of truth: local clones `D:\ccstatusline`,
`D:\claude-hud`, and this repo.)

## Customization model

| | **ccstatusline** | **claude-hud** | **cc-status-dash** |
|---|---|---|---|
| Paradigm | per-widget items in a pipeline | global `display.*` toggles | both — preset **or** per-widget pipeline |
| Interactive TUI | ✅ multi-screen Ink | ❌ | ✅ multi-screen Ink (`--tui`) |
| In-Claude-Code config | ❌ | ✅ slash command (LLM) | ✅ slash command + `--configure` wizard |
| Widgets | ~80 (incl. Jujutsu, Vim, Voice) | fixed element set | **107** |

## Universal per-widget styling options

ccstatusline applies these to *every* widget instance; claude-hud has mostly global
equivalents. cc-status-dash now supports the same per-widget set (rendered **and**
editable in the `--tui` options screen for every widget).

| Option | ccstatusline | claude-hud | cc-status-dash (render) | …in `--tui` |
|---|---|---|---|---|
| `color` (fg override) | ✅ per-widget | `colors.*` global | ✅ | ✅ |
| `bgColor` (bg) | ✅ per-widget | — | ✅ | ✅ |
| `bold` | ✅ per-widget | — | ✅ (+ global `globalBold`) | ✅ |
| `dim` | ✅ per-widget | — | ✅ | ✅ |
| `rawValue` (drop label) | ✅ per-widget | global only | ✅ (+ global `minimalist`) | ✅ |
| `merge` (join, no sep) | ✅ | `mergeGroups` | ✅ | ✅ |
| `maxWidth` (truncate) | ✅ | `toolNameMaxLength` etc. | ✅ | ✅ |

## Percentage → bar, and used / remaining / full

All three can render usage/context as a **bar** and flip between **used** and **remaining**:

| | bar | used/remaining/full |
|---|---|---|
| ccstatusline | `ContextBar` widget + progress toggle | `ContextPercentage` used/remaining |
| claude-hud | `display.usageBarEnabled` | `display.usageValue`, `display.contextValue` (remaining/used/full) |
| **cc-status-dash** | **`barStyle` on any percentage widget** | **`mode: used \| remaining` on every usage + context widget** |

Bar applies to: `context.bar`, `context-percentage`, `usage.block` (5h), `usage.weekly` (7d)
— 10 styles, or `barStyle: "none"` for text only.
`mode` applies to: `context.bar`, `context-percentage`, `usage.block`, `usage.weekly`,
`session-usage`, `weekly-usage`. (Token *counts* / context "full" use the dedicated
`context-length` / `context-window` / `tokens-*` widgets.)

Examples:
- `{ "id": "usage.block", "barStyle": "blocks", "showPace": true }` → `5h ███░░░░░ 40% ⇣40%`
- `{ "id": "usage.block", "mode": "remaining" }` → `5h 60% left`
- `{ "id": "usage.weekly", "mode": "remaining", "barStyle": "dots" }` → `7d ●●●●●○○○ 39% left`

## Per-widget functional options (selected)

| Widget | ccstatusline | claude-hud | cc-status-dash |
|---|---|---|---|
| model | rawValue | `modelFormat`, `modelOverride` | `show1M`, `format` |
| cwd | home `~`, segments, fish | `pathLevels` | `segments`, `style` (fish/basename/full) |
| context bar/% | used/remaining, progress | `contextValue`, `usageBarEnabled` | `mode`, `barStyle` |
| usage 5h/7d | format toggles | `usageValue`, `usageCompact`, thresholds | `barStyle`, `showPace`, `threshold` |
| git.branch | link | — | `showDirty`, `showAheadBehind`, `showDiff`, `link` |
| custom-command | edit, width, timeout, preserve-colors | `customLine` | `command` |
| skills | view, hide-empty, limit | `showSkills` | `mode` |
| compaction | format, nerd, split, tokens, hide-zero | `showCompactions` | `hideWhenZero` |

## Widget coverage

**Only in ccstatusline (not us):** Jujutsu VCS (8 widgets), `VimMode`, `VoiceStatus`,
`RemoteControlStatus`, `ExtraUsage*` (external usage), per-model weekly
(`WeeklyOpusUsage`/`WeeklySonnetUsage`).

**Only in cc-status-dash (not ccstatusline):** `burn-rate`, `budget`, `cost-projection`,
`daily/weekly/monthly-cost`, `token-breakdown`, `tokens-per-min`, `message-count`,
`total-api-time`, `last-response-time`, `config-counts`, `mcp-count`, `session-duration`,
`cache-timer`, `provider`, and more (107 total).

## Complete per-widget option reference (cc-status-dash)

**Every one of the 107 widgets** also accepts the 7 universal options
(`color`, `bgColor`, `bold`, `dim`, `rawValue`, `merge`, `maxWidth`) — not repeated below.
These **23 widgets** add their own options:

| Widget | Widget-specific options |
|---|---|
| `model` | `show1M`, `format` (abbr/name/id/version) |
| `cwd` / `current-working-dir` | `segments`, `style` (fish/basename/full), `home` (~) |
| `context.bar` | `mode` (remaining/used), `barStyle` (10 styles) |
| `context-percentage` | `mode` (remaining/used), `barStyle` (none + 10) |
| `context-percentage-usable` | `autocompactBuffer` |
| `usage.block` (5h) | `mode` (used/remaining), `showPace`, `barStyle`, `threshold` |
| `usage.weekly` (7d) | `mode`, `barStyle`, `threshold` |
| `session-usage` | `mode`, `showPace`, `barStyle` |
| `weekly-usage` | `mode`, `barStyle`, `threshold` |
| `external-usage` | `path`, `label`, `mode`, `barStyle`, `maxAgeMs` |
| `cache-roi` | `savedPerMTok` ($ estimate) |
| `git.branch` | `showDirty`, `showAheadBehind`, `showDiff`, `link` |
| `git-pr` | `showStatus`, `showTitle` |
| `budget` | `amount`, `warningThreshold`, `scope` (session/today/month) |
| `reset-timer` / `weekly-reset-timer` | `timestamp`, `hoursOnly` |
| `compaction-counter` | `hideWhenZero` |
| `env` | `variable` |
| `custom-text` | `text`, `prefix` |
| `custom-symbol` | `symbol` |
| `custom-command` | `command` |
| `link` | `url`, `label` |

The other ~80 widgets (tokens, cache, git-status family, system, activity, cost) take only
the universal options. Full per-option types: [docs/OPTIONS.md](OPTIONS.md). All of the above
are editable in the `--tui` options screen (`o`).

## Gaps remaining vs ccstatusline

- `compaction-counter` `format`/`split-by-trigger`/`tokens-reclaimed` (we don't capture the
  per-trigger / reclaimed-tokens data, only the count).
- Niche widget families we don't carry: Jujutsu, Vim, Voice, per-model weekly (all need data
  sources the Claude Code payload doesn't expose). **External usage is now supported** via the
  `external-usage` widget (reads a JSON file — `path`/`mode`/`barStyle`/`maxAgeMs`).

Everything else is at parity: the universal styling options (`color`, `bgColor`, `bold`,
`dim`, `rawValue`, `merge`, `maxWidth`), per-widget colors, percentage bars, `cwd` home
abbreviation, and `git-pr` status/title toggles — all rendered **and** editable in the TUI.
