# Claude Code Statusline Tools — Feature Analysis & Design Plan

> Implementation status is tracked in [STATUS.md](STATUS.md) and the full feature matrix in [PARITY.md](PARITY.md). This doc is the original design plan.

This document does three things:

1. **Complete feature catalog** across all 7 statusline projects.
2. **Deep dive** on the two tools we want to combine — `ccstatusline` and `Claude HUD`.
3. **Design plan** for a new, more feature-rich statusline (TypeScript/Node, distributed as both a Claude Code plugin and via `npx`).

All data was extracted from each project's README/docs (as of June 2026). Star counts are point-in-time and only used as a rough popularity signal.

---

## 1. The Landscape at a Glance

| Tool | Lang | Distribution | Config | Stars | One-line identity |
|---|---|---|---|---|---|
| **ccstatusline** (sirmalloc) | TypeScript | `npx`/`bunx`, pinned global | Ink TUI → `settings.json` | ~9.2k | The most widget-rich, fully customizable formatter |
| **Claude HUD** (jarrodwatts) | TS/JS | CC plugin marketplace | Guided `/configure` + `config.json` | ~16.6k | "What's happening now" HUD: tools, agents, todos, context health |
| **CCometixLine** (Haleclipse) | Rust | npm binary / releases | TOML + TUI | ~3.1k | Fast Rust binary + Claude Code patcher utilities |
| **claude-code-statusline** (rz1989s) | Bash | curl installer | TOML (227 settings) | — | 28 atomic components, 1–9 lines, MCP + prayer times |
| **claude-pace** (Astro-Han) | Bash + jq | plugin / `npx` / manual | env / minimal | ~71 | Pace-aware: burn rate vs. time remaining |
| **claude-powerline** (Owloops) | TypeScript | CC plugin / `npx` | JSON + web "Studio" | ~1.1k | Vim-style powerline + CSS-grid TUI panel engine |
| **claudia-statusline** (hagan) | Rust | curl installer / releases | TOML | ~24 | SQLite-backed persistent stats + cloud sync |

Two clear philosophies emerge:

- **Formatter/widget school** (ccstatusline, claude-powerline, CCometixLine, rz1989s, claudia): "compose a status line from configurable data widgets, style it heavily."
- **HUD/activity school** (Claude HUD, partly claude-pace): "show me what Claude is *doing right now* and whether I'm about to hit a wall."

The opportunity for the new tool is to **merge both schools**: ccstatusline's deep widget/theming customization + Claude HUD's live activity awareness (tools/agents/todos) and pace intelligence.

---

## 2. Complete Feature Catalog

Grouped by capability area. Each row notes which projects implement it so we can see where features are common vs. unique.

### 2.1 Data / Metric Widgets

**Model & session**
- Model name display, with simplified/abbreviated names (e.g. `Sonnet 4`, `O4.5`) — all tools
- Strip context suffixes like `(1M context)` — ccstatusline
- Multiple model formats: abbreviation / full / name / version — claudia (4 formats)
- Provider/auth label (`Bedrock`, `API`) — Claude HUD
- Session name / custom title from `/rename` — ccstatusline, Claude HUD
- Session ID — claude-powerline
- Claude account email (from `~/.claude.json`) — ccstatusline
- Claude Code version display — ccstatusline (implied), Claude HUD, claude-powerline
- Voice input state widget — ccstatusline
- Vim mode widget — ccstatusline
- Thinking effort level (`low…xhigh`, `default`, `?` unknown) — ccstatusline, claude-powerline
- Extended-thinking on/off state — claude-powerline

**Context window**
- Context usage % (used or remaining/countdown modes) — all
- Context as tokens (`45k/200k`), percent, remaining, or both — Claude HUD, claude-powerline
- Visual context bar (green→yellow→red thresholds) — Claude HUD, ccstatusline, claude-powerline, claudia
- Context Window widget (total model window size) separate from usage — ccstatusline
- Auto-compact buffer awareness (usable % before compaction fires) — claude-powerline
- Token breakdown at high context (85%+) — Claude HUD
- 1M-context model detection (from `[1m]` / "1M context" labels) — ccstatusline, CCometixLine
- Per-model context limits config (sonnet/opus/default) — claude-powerline, CCometixLine
- Adaptive context-limit learning (observes real usage) — claudia (experimental)
- Compaction counter (per-session) — ccstatusline
- Real-time compaction detection via hooks (`Compacting…`, `✓`) — claudia

**Usage / rate limits / cost**
- Session cost in USD — ccstatusline, claude-powerline, claudia, CCometixLine
- Cost source: calculated (ccusage-style) vs. official hook data — claude-powerline
- Daily / weekly / monthly cost (atomic) — rz1989s, claude-powerline (today), claudia
- Burn rate ($/hr, tokens/min) — claude-pace, rz1989s, claudia
- Configurable burn-rate modes (wall_clock / active_time / auto_reset) — claudia
- Cost projections / estimates — rz1989s
- 5-hour block timer (elapsed, progress bar, reset countdown) — ccstatusline, claude-powerline, claudia, rz1989s
- Block reset timer w/ exact timestamps (12/24h, IANA tz, locale) — ccstatusline
- Weekly (7-day) rolling usage window — ccstatusline, claude-powerline, Claude HUD
- Per-model weekly usage (Sonnet/Opus split, mirrors `/usage`) — ccstatusline
- Native `rate_limits` from stdin (CC ≥ 2.1.80) — claude-pace, Claude HUD, claude-powerline
- Usage API fallback (Anthropic API, cached, async) — ccstatusline, claude-pace
- **Pace tracking: usage rate vs. time remaining (⇡/⇣ delta)** — claude-pace (unique)
- Budget limits + warning thresholds (session/today/block) — claude-powerline
- Cache efficiency / hit ratio / ROI — claudia, rz1989s
- Token speed (input/output/total tok/s, rolling window) — ccstatusline, claudia, Claude HUD
- Subagent-aware speed reporting — ccstatusline

**Git**
- Branch name + icon — all
- Dirty indicator (`*`) — all
- Ahead/behind remote (`↑n ↓n`) — most
- Staged / unstaged / untracked counts — ccstatusline, claude-powerline, Claude HUD, CCometixLine
- Conflicts indicator — ccstatusline, claude-powerline, CCometixLine
- Insertions / deletions (diff stats `+24 -7`) — ccstatusline, claude-pace, claudia
- Commit SHA — ccstatusline, claude-powerline
- Nearest tag — claude-powerline
- Time since last commit — claude-powerline
- Stash count — claude-powerline
- Upstream branch — ccstatusline, claude-powerline
- Repo name / origin owner / owner-repo — ccstatusline, claude-powerline
- Is-fork flag — ccstatusline
- Ongoing operation (MERGE/REBASE/CHERRY-PICK) — claude-powerline
- Worktree mode / name / branch / original branch — ccstatusline, claude-powerline
- Clean-status widget — ccstatusline
- Commit count (atomic) — rz1989s
- Submodule status — rz1989s
- GitHub **and** GitLab PR/MR support (`gh`/`glab`) — ccstatusline
- Clickable PR links + status/title — ccstatusline
- Clickable GitHub branch links — ccstatusline

**Filesystem / environment**
- Current working directory (segment count, `~` abbrev, fish-style, basename, full) — all
- Git root dir (with clickable IDE links for VS Code/Cursor) — ccstatusline
- Path levels 1–3 — Claude HUD
- Arbitrary environment-variable widget — claude-powerline, ccstatusline (custom)
- tmux session/window info — claude-powerline
- Memory / system RAM usage — ccstatusline, Claude HUD
- Config counts (CLAUDE.md, rules, MCPs, hooks) — Claude HUD
- MCP server health/connection status — rz1989s
- Current time / clock — rz1989s, CCometixLine (Time segment)

**Live activity (the "HUD" features)**
- **Tool activity line** (Read/Edit/Grep as it happens, with counts) — Claude HUD
- **Agent/subagent tracking** (which subagents run, model, elapsed) — Claude HUD, claude-powerline (active agent name)
- **Todo progress** (`▸ Fix bug (2/5)`) — Claude HUD
- Session duration / total API time / last-response time / message count — claude-powerline, Claude HUD, claudia
- Lines added/removed during session — claude-powerline, claudia
- Cache timer (time since last turn vs. 5-min prompt-cache TTL) — claude-powerline

**Custom / extensibility**
- Custom text widget (with emoji + merge into labels) — ccstatusline
- Custom symbol widget — ccstatusline
- Link widget (clickable OSC8) — ccstatusline
- Custom command / shell composition segment — claude-powerline, ccstatusline-adjacent (AIWatch)
- Skills widget (last/count/list, hide-when-empty) — ccstatusline
- Islamic prayer times + Hijri calendar (AlAdhan API) — rz1989s

### 2.2 Layout & Styling

- Multi-line status lines (unlimited) — ccstatusline; 1–9 lines — rz1989s; multi-line — claude-powerline, Claude HUD (expanded/compact)
- Powerline mode (arrow separators, caps, custom fonts) — ccstatusline, claude-powerline, CCometixLine
- Multiple separator styles (minimal / powerline / capsule / tui) — claude-powerline
- Progress-bar styles galore (bar, blocks, dots, line, ball, squares, geometric, filled, capped…) — claude-powerline (11), plus short/compact bars — ccstatusline
- Auto-wrap to terminal width / flex separators / smart width detection — ccstatusline, claude-powerline
- Widget merging (with/without padding) — ccstatusline
- Powerline auto-alignment across lines (columnar) — ccstatusline
- Padding control, show/hide icons globally or per-segment — claude-powerline
- Minimalist / raw-value mode (label-free) — ccstatusline (global), Claude HUD (presets)
- **CSS-grid TUI panel engine** (rows/columns/spans/breakpoints, title/footer, box chars, segment templates, automatic culling) — claude-powerline (unique, very powerful)
- Layout presets (Full/Essential/Minimal) — Claude HUD; (default/compact/detailed/minimal/power) — claudia
- Nerd Font icons + ASCII/text charset fallback — most

### 2.3 Theming & Color

- Built-in themes — ccstatusline (multiple), claude-powerline (6: dark/light/nord/tokyo-night/rose-pine/gruvbox), CCometixLine (cometix/minimal/gruvbox/nord/powerline-dark), claudia (11 incl. monokai/solarized/dracula/catppuccin/one-dark), rz1989s (catppuccin etc.)
- Custom themes (file-based TOML/JSON) — all configurable ones
- Color depth: 16 / 256 / truecolor (hex) — ccstatusline, claude-powerline
- Per-widget fg/bg/bold — ccstatusline, claude-powerline, Claude HUD
- Threshold-based colors (warning/critical) — Claude HUD, claude-powerline
- `NO_COLOR` / `FORCE_COLOR` / `COLORTERM` standards — claude-powerline, claudia
- Color compatibility modes (auto/ansi/ansi256/truecolor) — claude-powerline
- Web visual configurator ("Powerline Studio") — claude-powerline

### 2.4 Configuration & UX

- Interactive Ink TUI config with live preview — ccstatusline, CCometixLine
- Guided setup wizard / preset picker — Claude HUD (`/configure`), claude-powerline (`/powerline`), CCometixLine
- Slash commands (`/setup`, `/configure`) — Claude HUD, claude-pace, claude-powerline
- Config file auto-reload (no restart) — claude-powerline
- Config priority chain (CLI > env > project > user > XDG > defaults) — claude-powerline
- Custom config path flag (`--config`) — ccstatusline, claude-powerline
- `CLAUDE_CONFIG_DIR` support — ccstatusline
- Fast/fuzzy widget picker (substring/initialism/fuzzy, ranked) — ccstatusline
- Clone/duplicate widget shortcut — ccstatusline
- Wrap-around TUI navigation — ccstatusline
- Set Claude Code `statusLine.refreshInterval` from TUI — ccstatusline
- Zero-config sensible defaults — most

### 2.5 Platform / Engineering

- Cross-platform (macOS/Linux/Windows/WSL) — all (varying)
- Windows-specific handling (UTF-8 code page, path parsing) — ccstatusline, CCometixLine
- Bun + Node support — ccstatusline
- Single compiled binary — CCometixLine, claudia (Rust)
- Single Bash file, zero npm — claude-pace, rz1989s
- Caching (block timer cache, git cache w/ TTL, usage cache) — ccstatusline, claude-pace
- SQLite persistent stats DB — claudia
- Cloud sync (Turso) across machines — claudia
- Dedupe streaming JSONL entries for accurate counts — ccstatusline
- Async/background refresh so statusline never blocks — claude-pace
- HTTPS_PROXY support for usage API — ccstatusline
- npm provenance / trusted publishing / version pinning — ccstatusline
- Claude Code patcher (disable context warnings, verbose mode) — CCometixLine
- Hook integration (PreCompact/SessionStart for compaction) — claudia
- Localizations (Chinese fork) — ccstatusline; bilingual README — CCometixLine

---

## 3. Deep Dive: The Two Tools to Combine

### 3.1 ccstatusline (sirmalloc) — the formatter

**Core model.** A *widget pipeline*. You build one or more status lines, each an ordered list of widgets. Every widget supports enable/disable, per-widget color (16/256/truecolor), raw-value vs. labeled mode, merging with neighbors, and powerline backgrounds.

**Standout strengths**
- **Breadth of widgets** — easily the largest catalog: ~40+ git widgets alone, token-speed widgets, per-model weekly usage, skills, voice, vim mode, thinking effort, links, custom text/symbol.
- **Powerline done right** — arrow separators, configurable caps (more than 3), custom hex separators up to U+10FFFF, auto font install, auto-alignment across multiple lines, theme color continuity.
- **Excellent TUI** — React/Ink config with live preview, fuzzy widget picker, clone widget, wrap-around nav, can write `refreshInterval` back to CC settings.
- **Correctness focus** — dedupes streaming JSONL so token counts don't overcount; infers 1M context; collapses separators around empty widgets.
- **Distribution polish** — `npx`/`bunx`, pinned global installs, npm provenance.

**Gaps (relative to HUD)**
- It's a *formatter*, not a *monitor*. It does not surface live tool activity, running subagents, or todo progress as first-class activity lines.
- No guided preset picker — power comes through the TUI, which is more involved than HUD's 3-preset flow.

### 3.2 Claude HUD (jarrodwatts) — the monitor

**Core model.** A *heads-up display* with a fixed-ish 2-line core (model/path/git; context bar + usage) plus optional **activity lines** driven by parsing the transcript JSONL.

**Standout strengths**
- **Live activity awareness** (the differentiator):
  - *Tools line* — `◐ Edit: auth.ts | ✓ Read ×3 | ✓ Grep ×2`
  - *Agents line* — `◐ explore [haiku]: Finding auth code (2m 15s)`
  - *Todos line* — `▸ Fix authentication bug (2/5)`
- **Context health framing** — green→yellow→red bar, token breakdown at 85%+, scales to 1M-context sessions, native token data (not estimated).
- **Approachable config** — presets (Full / Essential / Minimal), then per-element toggles via `/claude-hud:configure`; `elementOrder` array controls expanded-mode order; advanced color/threshold overrides in `config.json`.
- **Usage limits** — reads native `rate_limits` (5h + 7d), shows 7-day only above a threshold, handles free/weekly accounts and Bedrock gracefully.
- **Updates ~every 300ms**, plugin-native (no tmux/separate window).

**Gaps (relative to ccstatusline)**
- Far fewer widgets and no powerline/theme depth.
- Activity lines are great but the layout is more fixed; no arbitrary multi-line widget composition or grid engine.

### 3.3 What "combining" should mean

| Take from ccstatusline | Take from Claude HUD |
|---|---|
| Widget-pipeline architecture + huge widget catalog | Live **tools / agents / todos** activity lines |
| Powerline rendering, caps, separators, auto-align | **Preset-first** onboarding (Full/Essential/Minimal) |
| Ink TUI with live preview + fuzzy picker | Context **health** framing + token breakdown at high % |
| Color depth (16/256/truecolor), themes, merging | Graceful usage handling (free/weekly/Bedrock) |
| JSONL dedupe correctness; `refreshInterval` writing | `elementOrder` simplicity for casual users |

Plus genuinely unique ideas worth pulling from the others:
- **Pace delta** (⇡/⇣ burn vs. time-left) from claude-pace — the single most useful "am I going to hit the wall?" signal.
- **CSS-grid TUI panel** from claude-powerline — for a premium "panel" layout mode.
- **Persistent stats (SQLite) + burn-rate modes** from claudia — for historical cost/$-per-active-hour.

---

## 4. Design Plan: the New Statusline

> Working name: **ClaudeLine** (placeholder — rename freely). Package id used in the scaffold: `claudeline`.

### 4.0 Locked decisions

- **Config pattern → from ccstatusline.** The widget-pipeline model is the source of truth: ordered `widgets[]` per line, each widget carrying its own options (color, raw/labeled mode, merge, powerline bg); global overrides; multiple independent lines; settings in a single JSON file edited by an Ink TUI with a fuzzy widget picker. This is the most flexible and proven config UX of the seven.
- **Theme / visual aesthetic → from Claude HUD.** The *default look* follows HUD's clean palette and restraint: `[Model]` cyan badge, project yellow, git magenta/cyan, context bar green→yellow→red, dim secondary labels, preset-first defaults that look good with zero tuning. Heavy powerline/256-color styling is available but opt-in, not the default.

> In short: **ccstatusline's brain, Claude HUD's face.**

### 4.1 Goals & principles

1. **Two faces, one engine.** A *formatter* (compose any line) and a *monitor* (live activity), driven by the same widget registry.
2. **Preset-first, power-deep.** New users pick Full/Essential/Minimal in 10 seconds (HUD-style); power users get the full ccstatusline-style Ink TUI and JSON config.
3. **Correct by construction.** Native stdin data first (token counts, `rate_limits`), JSONL dedupe, graceful fallbacks, never block the render.
4. **Fast enough.** Target < ~120ms cold; cache git + usage with short TTLs; lazy-load the TUI so the render path stays lean.
5. **Themeable & accessible.** 16/256/truecolor, `NO_COLOR`/`FORCE_COLOR`, Nerd Font + ASCII charset fallback.

### 4.2 Architecture

```
stdin JSON  ─┐
             ├─►  context loader  ──►  data providers (cached)
transcript ──┘                          ├─ git
JSONL                                    ├─ usage / rate_limits / pace
                                         ├─ transcript activity (tools/agents/todos)
                                         └─ system (mem, tmux, env, version)
                                                  │
                                                  ▼
                                     widget registry  (each widget: id, category,
                                                        collect(ctx) → data,
                                                        render(data, opts) → Segment[])
                                                  │
                                                  ▼
                                  layout engine (lines → segments)
                                                  │
                              ┌───────────────────┼───────────────────┐
                              ▼                    ▼                   ▼
                       inline renderer      powerline renderer   grid/panel renderer
                              └───────────────────┼───────────────────┘
                                                  ▼
                                  color layer (theme + depth + NO_COLOR)
                                                  ▼
                                              stdout
```

Configuration is a separate concern (TUI + slash commands write the same JSON the renderer reads).

### 4.3 Widget model

Every widget implements one interface so the registry, TUI picker, and renderers treat them uniformly:

```ts
interface Widget<TData = unknown> {
  id: string;                       // "git.branch", "context.bar", "activity.tools"
  category: WidgetCategory;         // model | context | usage | git | activity | system | custom
  label: string;                    // human label for the picker
  needs: DataSource[];              // ["transcript"] | ["git"] | ["rate_limits"] ...
  collect(ctx: RenderContext): TData | Promise<TData>;
  render(data: TData, opts: WidgetOptions): Segment[];   // [] = render nothing (auto-culled)
}
```

This is the bridge between the two schools: `git.branch`, `context.bar`, `usage.block` are ccstatusline-style data widgets; `activity.tools`, `activity.agents`, `activity.todos` are Claude-HUD-style monitor widgets — same interface, same config surface.

### 4.4 Config schema (sketch)

```jsonc
{
  "preset": "essential",            // full | essential | minimal | custom
  "charset": "unicode",             // unicode | text
  "theme": "tokyo-night",
  "colorDepth": "auto",             // auto | ansi | ansi256 | truecolor
  "refreshInterval": 10,            // seconds; also written to CC settings.json
  "lines": [
    { "style": "powerline",
      "widgets": [
        { "id": "model" },
        { "id": "git.branch", "showDirty": true, "showAheadBehind": true },
        { "id": "context.bar", "mode": "remaining", "barStyle": "blocks" }
      ] },
    { "style": "inline",
      "widgets": [
        { "id": "usage.block", "showPace": true },
        { "id": "usage.weekly", "threshold": 80 }
      ] },
    { "style": "inline", "showWhen": "activity",   // hide line when nothing active
      "widgets": [
        { "id": "activity.tools" },
        { "id": "activity.agents" },
        { "id": "activity.todos" }
      ] }
  ],
  "colors": { "context": "green", "warning": "yellow", "critical": "red" }
}
```

Resolution order: CLI flags > env vars > `./.claudeline.json` > `~/.claude/claudeline.json` > XDG > defaults. Auto-reload, no restart.

### 4.5 Feature roadmap (phased)

- **Phase 0 — Scaffold (this deliverable):** project skeleton, types, config load, renderer (inline + powerline), registry, working widgets (model, cwd, git branch, context bar, usage block/pace), theme + color layer, plugin manifest + slash commands, sample-input runner.
- **Phase 1 — Parity core:** full git widget set, weekly/session usage, cost, thinking effort, version, env, tmux; ASCII charset; NO_COLOR/FORCE_COLOR.
- **Phase 2 — HUD activity:** transcript JSONL parser → `activity.tools` / `activity.agents` / `activity.todos`; context token breakdown at high %; `showWhen: "activity"` lines.
- **Phase 3 — Config UX:** Ink TUI with live preview + fuzzy picker; preset wizard; `/setup` + `/configure`; write `refreshInterval` back to CC settings.
- **Phase 4 — Premium layout:** powerline auto-align, grid/panel mode (à la claude-powerline), more bar styles, widget merging.
- **Phase 5 — Stats & pace+:** optional SQLite persistence, burn-rate modes, cost projections, historical $/active-hour.

### 4.6 Distribution

- **Plugin** (`.claude-plugin/`) with a marketplace entry and `/claudeline:setup` + `/claudeline:configure` commands (Claude-HUD style).
- **npx**: `npx -y claudeline@latest` launches the TUI; install writes a `statusLine` command block to `settings.json` (ccstatusline style). Pinned-global option later.

### 4.7 Open design choices to revisit

- Default preset (lean toward **Essential**: model+git+context bar+usage with pace).
- Whether activity lines are on by default (HUD has them off by default to avoid clutter — recommend off, surfaced in the wizard).
- Whether to ship SQLite in core or keep it an opt-in variant (recommend opt-in to keep the hot path fast, like claudia's two-binary split).

---

*Sources: project READMEs/docs for ccstatusline, Claude HUD, CCometixLine, claude-code-statusline (rz1989s), claude-pace, claude-powerline, and claudia-statusline (June 2026).*
