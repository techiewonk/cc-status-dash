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
| Widgets | ~80 (incl. Jujutsu, Vim, Voice) | fixed element set | **101** |

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
| `maxWidth` (truncate) | ✅ | `toolNameMaxLength` etc. | ❌ (planned) | ❌ |

## Percentage → bar

All three can render usage/context as a **bar** instead of (or with) a number:

| | how |
|---|---|
| ccstatusline | `ContextBar` widget + progress toggle |
| claude-hud | `display.usageBarEnabled`, `display.usageValue` |
| **cc-status-dash** | **`barStyle` option on any percentage widget** — `context.bar`, `context-percentage`, `usage.block` (5h), `usage.weekly` (7d). 10 bar styles. Set `barStyle: "none"` for text-only. |

Example: `{ "id": "usage.block", "barStyle": "blocks", "showPace": true }` →
`5h ███░░░░░ 40% ⇣40%`.

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
`cache-timer`, `provider`, and more (101 total).

## Gaps remaining vs ccstatusline

- `maxWidth` per-widget truncation (option not yet implemented).
- A few widget-specific toggles (cwd `home ~`, compaction `format`/`split`, git-pr
  `status`/`title`, weekly-reset `hours-only`).
- Niche widget families we don't carry: Jujutsu, Vim, Voice, external-usage, per-model weekly.

Everything else — the universal styling options, per-widget colors, and percentage bars —
is now at parity, rendered and editable in the TUI.
