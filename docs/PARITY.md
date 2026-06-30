# Feature parity matrix

Maps the complete union feature catalog (all 7 surveyed statuslines) to cc-status-dash status.

**Legend:** ✅ implemented · 🟡 partial · ⚙️ automatic/config-driven · 🗺️ roadmap · ⛔ out-of-scope (reason)

Run `npx cc-status-dash --list-widgets` to see all widget ids (111 registered).

## Model & session
| Feature | Status | Where |
|---|---|---|
| Model name + abbreviation (strips `Claude`, `(1M context)`) | ✅ | `model` |
| Multiple model formats (abbr/full/name/version) | ✅ | `model` `format: abbr\|name\|id\|version` |
| Provider/auth label (Bedrock/Vertex/API) | ✅ | `provider` |
| Session name from `/rename` | ✅ | `session-name` |
| Session ID | ✅ | `claude-session-id` |
| Claude account email (`~/.claude.json`) | ✅ | `claude-account-email` |
| Claude Code version | ✅ | `version` |
| Thinking effort level | ✅ | `thinking-effort` |
| Extended-thinking on/off | 🟡 | `thinking-effort` (level); on/off roadmap |
| Voice input state | 🗺️ | roadmap (needs CC state) |
| Vim mode | 🗺️ | roadmap (needs `~/.claude` state) |

## Context window
| Feature | Status | Where |
|---|---|---|
| Context % (used / remaining) | ✅ | `context.bar` (mode), `context-percentage` |
| Context as tokens | ✅ | `context-length` |
| Visual bar with green→yellow→red thresholds | ✅ | `context.bar` |
| Context window size (separate) | ✅ | `context-window` |
| Auto-compact buffer usable % | ✅ | `context-percentage-usable` |
| Token breakdown at high context | ✅ | `token-breakdown` |
| 1M-context detection | ✅ | `modelLimit` detects `[1m]`/`1m context`; label strip in `model` |
| Per-model context limits config | ✅ | `modelContextLimits` (sonnet/opus/haiku/default) |
| Compaction counter | ✅ | `compaction-counter` |
| Adaptive context-limit learning | ⛔ | out-of-scope (claudia experimental) |
| Real-time compaction via hooks | 🗺️ | roadmap (hook integration) |

## Usage / rate limits / cost
| Feature | Status | Where |
|---|---|---|
| Session cost (USD) | ✅ | `cost` / `session-cost` |
| 5-hour block usage + reset | ✅ | `usage.block`, `block-timer`, `reset-timer` |
| Weekly (7-day) usage + reset | ✅ | `usage.weekly`, `weekly-reset-timer` |
| Native `rate_limits` from stdin | ✅ | usage widgets |
| Pace delta (⇡/⇣ burn vs time-left) | ✅ | `usage.block` `showPace` |
| Burn rate ($/hr) | ✅ | `burn-rate` (tok/min roadmap) |
| Cache efficiency / hit ratio | ✅ | `cache-hit-rate` |
| Cost source: official vs calculated | ⚙️ | uses stdin official cost; calculated roadmap |
| Block reset exact timestamp (tz/12-24h) | ✅ | timer widgets `timestamp`/`hour12`/`timezone` |
| Daily / weekly / monthly cost | ✅ | `daily-cost`, `weekly-cost`, `monthly-cost` (stats store) |
| Burn-rate modes (wall/active/auto-reset) | ✅ | `burn-rate` `mode: wall\|active\|auto-reset` |
| Cost projections / estimates | ✅ | `cost-projection` (block) |
| Per-model weekly usage (sonnet/opus) | 🗺️ | roadmap (not in stdin; needs API) |
| Usage API fallback (cached/async) | 🗺️ | roadmap |
| Budgets + warning thresholds | ✅ | `budget` (session/today/month, threshold) |
| Token speed (tok/s, rolling window) | ✅ | `input-speed`, `output-speed`, `total-speed` |
| Subagent-aware speed | 🗺️ | roadmap |

## Git
| Feature | Status | Where |
|---|---|---|
| Branch + icon | ✅ | `git.branch` |
| Dirty indicator | ✅ | `git.branch`, `git-status` |
| Ahead/behind | ✅ | `git-ahead-behind`, `git.branch` |
| Staged / unstaged / untracked (counts + files) | ✅ | `git-staged(-files)`, `git-unstaged(-files)`, `git-untracked(-files)` |
| Conflicts | ✅ | `git-conflicts` |
| Insertions / deletions | ✅ | `git-insertions`, `git-deletions`, `git-changes` |
| Commit SHA | ✅ | `git-sha` |
| Nearest tag | ✅ | `git-tag` |
| Time since last commit | ✅ | `git-time-since-commit` |
| Stash count | ✅ | `git-stash` |
| Upstream owner/repo | ✅ | `git-upstream-owner/-repo/-owner-repo` |
| Origin owner/repo | ✅ | `git-origin-owner/-repo/-owner-repo` |
| Is-fork flag | ✅ | `git-is-fork` |
| Ongoing operation (MERGE/REBASE/…) | ✅ | `git-operation` |
| Worktree mode / name / branch | ✅ | `worktree-mode/-name/-branch`, `git-worktree` |
| Worktree original branch | ✅ | `worktree-original-branch` (reads main worktree HEAD) |
| Clean-status widget | ✅ | `git-clean-status`, `git-status` |
| Commit count | ✅ | `git-commit-count` |
| Submodule status | ✅ | `git-submodules` |
| Repo root dir | ✅ | `git-root-dir` |
| GitHub + GitLab PR/MR | ✅ | `git-pr` (`gh` then `glab`) |
| Clickable PR / branch links | 🟡 | `git.branch` `link` (OSC8 to GitHub); PR auto-link roadmap |

## Filesystem / environment
| Feature | Status | Where |
|---|---|---|
| Current working directory (segment count) | ✅ | `cwd` / `current-working-dir` |
| CWD styles (fish / basename / full) | ✅ | `cwd` `style: segments|fish|basename|full` |
| Git root dir (+ IDE links) | ✅ | `git-root-dir` (IDE links roadmap) |
| Arbitrary env-var widget | ✅ | `env` |
| tmux session/window | 🟡 | `system` field; detection partial |
| Memory / RAM usage | ✅ | `free-memory` |
| Config counts (CLAUDE.md/rules/MCP/hooks) | ✅ | `config-counts` (CLAUDE.md/MCP/hooks/rules) |
| MCP server health/connection | 🟡 | `mcp-count` (health roadmap) |
| Current time / clock | ✅ | `session-clock` |
| Terminal width | ✅ | `terminal-width` |

## Live activity (HUD)
| Feature | Status | Where |
|---|---|---|
| Tool activity line | ✅ | `activity.tools` |
| Agent/subagent tracking | ✅ | `activity.agents` |
| Todo progress | ✅ | `activity.todos` |
| Session duration | ✅ | `session-duration` |
| Lines added / removed | ✅ | `lines-added`, `lines-removed` |
| Cache TTL timer | ✅ | `cache-timer` |
| Total API time / last-response / msg count | ✅ | `total-api-time`, `last-response-time`, `message-count` |

## Custom / extensibility
| Feature | Status | Where |
|---|---|---|
| Custom text (emoji) | ✅ | `custom-text` |
| Custom symbol | ✅ | `custom-symbol` |
| Link (OSC8 clickable) | ✅ | `link` |
| Custom command / shell composition | ✅ | `custom-command` |
| Skills (last/count/list) | ✅ | `skills` |
| Islamic prayer times | ⛔ | out-of-scope (rz1989s niche) |

## Layout & styling
| Feature | Status | Where |
|---|---|---|
| Multi-line status lines | ✅ | up to 5 layers |
| Powerline mode (arrows) | ✅ | `style: powerline` (caps/custom fonts roadmap) |
| Progress-bar styles | ✅ | 10 styles: blocks/bar/line/dots/ball/squares/geometric/filled/capped/blocks-line |
| Minimalist / raw-value mode | ✅ | `minimalist` |
| Padding control | ✅ | `padding` |
| Nerd Font + ASCII fallback | ✅ | `charset` |
| Layout presets | ✅ | preset catalog grouped by line count |
| Separator styles (capsule / tui) | 🟡 | inline + powerline + capsule; tui-panel roadmap |
| Auto-wrap / flex separators | 🟡 | auto-wrap done (`autoWrap`); flex separators roadmap |
| Widget merging | ✅ | `merge: true` per widget |
| Powerline auto-align across lines | 🗺️ | roadmap |
| Per-segment show/hide icons | 🟡 | charset-level; per-segment roadmap |
| CSS-grid TUI panel engine | 🗺️ | roadmap (claude-powerline style) |

## Theming & color
| Feature | Status | Where |
|---|---|---|
| Built-in themes | ✅ | hud-clean, tokyo-night, gruvbox, nord, mono |
| Custom themes / colors | ✅ | `colors` overrides (theme < custom) |
| Color depth 16 / 256 / truecolor | ✅ | color layer (hex, 256-index, named) |
| Threshold-based colors | ✅ | context/usage warning→critical |
| NO_COLOR / FORCE_COLOR / COLORTERM | ✅ | color layer (auto depth sniffs COLORTERM/FORCE_COLOR/TERM) |
| Per-widget fg/bg/bold/dim | ✅ | `color`/`bgColor`/`bold`/`dim` on any widget config (value recolored, dim label preserved) |
| Per-widget gradients (fg) | 🗺️ | roadmap (ccstatusline newer feature) |
| Compatibility modes (auto/ansi/256/truecolor) | ✅ | `colorDepth` + hex/256 downsampling to honor depth |
| Web visual configurator | ⛔ | out-of-scope (separate site) |

## Configuration & UX
| Feature | Status | Where |
|---|---|---|
| Slash commands `/setup`, `/configure` | ✅ | `commands/` |
| Config auto-reload (read each run) | ✅ | `config/load.ts` |
| Priority chain (CLI > env > project > user > XDG > defaults) | ✅ | `config/load.ts` |
| `--config` custom path | ✅ | CLI flag |
| Write `refreshInterval` to CC settings | ✅ | `/setup` |
| Preset picker / guided wizard | ✅ | `--configure` @clack/prompts wizard (density→preset→theme→style→save) |
| Zero-config defaults | ✅ | essential preset |
| Ink TUI w/ live preview | ✅ | `--tui`/`--edit` (`src/tui/`); live preview, add/del/clone/reorder, line/style/theme/preset, save |
| Fuzzy widget picker / clone | ✅ | `tui/picker.ts` (subsequence-ranked) + `cloneWidget`; nav clamps (wrap-around roadmap) |
| `CLAUDE_CONFIG_DIR` support | ✅ | config path + claude-config reads honor it |

## Platform / engineering
| Feature | Status | Where |
|---|---|---|
| Cross-platform (macOS/Linux/Windows/WSL) | ✅ | Node 18+ |
| Bun + Node support | ✅ | runs on both |
| Non-blocking render (timeouts on git) | ✅ | git provider 300ms timeout |
| Windows-specific handling | 🟡 | path handling; UTF-8 codepage roadmap |
| Caching (git/usage TTL) | 🟡 | persistent stats store; git/usage TTL roadmap |
| JSONL dedupe | 🟡 | tail parse; full dedupe roadmap |
| HTTPS_PROXY for usage API | 🗺️ | roadmap (with API fallback) |
| Hook integration (PreCompact/SessionStart) | 🗺️ | roadmap |
| npm provenance / version pinning | 🗺️ | release infra |
| Persistent stats store | 🟡 | JSON store (`~/.local/state/cc-status-dash`); SQLite opt-in roadmap |
| Cloud sync (Turso) | ⛔ | out-of-scope |
| Single compiled binary / single bash file | ⛔ | n/a (TypeScript by design) |
| Claude Code patcher | ⛔ | out-of-scope (CCometixLine) |
| Localizations | ⛔ | out-of-scope |

## Newly surveyed upstream features (June 2026 refresh)
Found in a fresh README pass (ccstatusline v2.2.22, Claude HUD, claude-powerline, CCometixLine) — not previously in the matrix.
| Feature | Source | Status | Where / plan |
|---|---|---|---|
| Per-widget value color / bg / bold / dim | ccstatusline, powerline, HUD | ✅ | `color`/`bgColor`/`bold`/`dim` widget options |
| 10 progress-bar styles | claude-powerline | ✅ | `bars.ts` (was 4, now 10) |
| Model format abbr/name/id/version | claudia | ✅ | `model` `format` |
| Token rounding (999950→1.0M) | ccstatusline | ✅ | `fmtTokens` |
| Per-widget foreground gradients | ccstatusline | 🗺️ | needs gradient color layer |
| Extra-usage utilization / remaining | ccstatusline | 🗺️ | overage widgets (needs usage API) |
| Prompt-cache countdown (Pro 300s / Max 3600s TTL) | Claude HUD | ✅ | `cache-timer` `ttlSeconds` (counts down remaining) |
| Added-directories (`/add-dir`) display | Claude HUD | 🗺️ | new widget |
| Push warning/critical thresholds (ahead/behind color) | Claude HUD | ✅ | `git-ahead-behind` `pushWarnThreshold`/`pushCritThreshold` |
| transparent / none backgrounds | claude-powerline | ✅ | `bgColor: none\|transparent` |
| COLORTERM detection | claude-powerline | ✅ | `effectiveDepth` (auto) + truecolor→256→16 downsampling |
| Burn-rate auto-reset mode | claudia | ✅ | `burn-rate` `mode: auto-reset` |
| Block-reset exact timestamp (12/24h, tz) | ccstatusline | ✅ | timer `timestamp`/`hour12`/`timezone` |
| Worktree original branch | ccstatusline, powerline | ✅ | `worktree-original-branch` |
| Advisor model (`/advisor`) | Claude HUD | 🗺️ | new widget (needs CC state) |
| Output-style display | Claude HUD | ✅ | `output-style` |
| CSS-grid TUI-panel layout | claude-powerline | 🗺️ | premium layout mode |
