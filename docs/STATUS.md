# Project status — cc-status-dash

_Last updated: 2026-06-30. Living tracker of what is done, in progress, and remaining._

Snapshot: **111 widgets**, 10 themes, 35 presets (1–9 layers), persistent stats store, config-mutation engine, valibot-validated config. Builds clean (`bun build` split + `tsc`), 306 tests pass (incl. preset×style + config-location matrices + a security/resilience hardening suite), renders all presets, Ink TUI editor + @clack wizard. See [PARITY.md](PARITY.md) for the full feature-by-feature matrix.

## ✅ Done
- **Runtime: Bun-first**, Node-compatible (`bun build --target=node` → single `dist/index.js`; `build:node` tsc fallback). Source stays runtime-agnostic.
- Core engine: stdin parse, provider loading (git / transcript / system / stats), widget registry, inline + powerline + **capsule** renderers, color layer (16/256/truecolor, NO_COLOR), themes + custom colors.
- Widgets (94): model, provider label, version, session id/name, thinking effort, output style, compaction counter.
- Context: bar, %, usable %, length, window, token breakdown.
- Tokens/cache: input/output/cached/total, cache read/write, hit-rate.
- Usage/cost: 5h + 7d windows, pace delta, block/reset/weekly-reset timers, session cost, burn rate (wall/active), cost projection, **daily/weekly/monthly cost**, budgets, token speed (in/out/total).
- Git (35): branch, status, staged/unstaged/untracked (+files), conflicts, insertions/deletions/changes, sha, tag, time-since-commit, stash, ahead/behind, origin/upstream owner-repo, is-fork, operation, worktree mode/name/branch, clean, commit-count, submodules, root-dir, **PR via gh/glab**.
- System: cwd, git-root, free-memory, terminal-width, clock, env var.
- Activity (HUD): tools, agents, todos, skills, mcp-count, session-duration, total-api-time, lines ±, cache-timer, message-count.
- Custom: text, symbol, command, OSC8 link.
- Config: JSON file, priority chain, `--config`, presets by line count, global options (minimalist/globalBold/padding/charset), **config-mutation engine** (add/remove/move/clone/setOption/preset/theme), slash commands `/setup` + `/configure`.
- Persistent stats store (`~/.local/state/cc-status-dash/stats.json`).
- Batch 4: account email, config-counts (CLAUDE.md/MCP/hooks), last-response-time, fish/basename/full cwd, clickable git branch link (OSC8), per-model context limits + 1M auto-detect, `CLAUDE_CONFIG_DIR` support.
- Batch 5: widget merging (`merge`), auto-wrap to terminal width (`autoWrap`), tokens-per-min, rules-count in config-counts.
- Repo: committed under user identity; `docs/ANALYSIS.md`, `docs/PARITY.md`, `docs/STATUS.md`.

- Modern stack started: `node:util.stripVTControlCharacters` for width math; `node:test`/`bun test` suite (106 passing: mutations, render, widgets, schema); Biome configured for lint/format.
- **valibot config validation** (`src/config/schema.ts`): versioned partial-config schema + `migrateConfig`, wired into `load.ts` (invalid files warn to stderr and fall back, never throwing into render), plus a `--validate` inspection flag. Deps now recorded in `package.json`.
- **Batch A — formatter brain**: per-widget `color`/`bgColor`/`bold`/`dim` overrides on any widget (value recolored, dim label preserved, per-widget `bold:false` opts out of globalBold); 10 progress-bar styles (added ball/squares/geometric/filled/capped/blocks-line); `model` `format: abbr|name|id|version`; token rounding 999950→1.0M.
- **Batch B — git + color**: `worktree-original-branch` widget (reads main worktree HEAD); `git-ahead-behind` push thresholds (`pushWarnThreshold`/`pushCritThreshold`); `bgColor: none|transparent`.
- **Batch C — usage/metrics**: `burn-rate` `mode: auto-reset` (per-5h-block rate); timer widgets `timestamp`/`hour12`/`timezone` (exact reset clock); `cache-timer` `ttlSeconds` prompt-cache countdown.
- **Batch D — color depth**: hex/256 downsampling (truecolor→256→16) so `colorDepth: ansi256|ansi` actually emit narrower codes; `auto` sniffs COLORTERM/FORCE_COLOR/TERM (`effectiveDepth`).
- **@clack/prompts preset wizard** (`src/config/wizard.ts`, `--configure`/`--wizard`): density→preset→theme→style→save flow; pure `buildWizardConfig`/`serializeConfig` are tested and round-trip through the valibot schema; @clack lazy-imported (off the render path); non-TTY guarded.
- **Ink TUI live-preview editor** (`src/tui/`, `--tui`/`--edit`): live preview, navigate, add (fuzzy picker)/delete/clone/reorder widgets, add/remove lines, cycle style/theme, apply preset, save. Pure `reduce` (reducer) + `picker.ts` are unit-tested; the Ink view is tested **headlessly** via ink-testing-library (mount + simulated keystrokes). Ink/React lazy-loaded in a split chunk so the render hot path never loads React.
- Build is now **code-split** (`bun build --outdir dist --splitting`): `dist/index.js` hot path has zero react/ink refs; TUI lives in lazy chunks. `react-devtools-core` marked external.
- **1M-context fix + presets**: `modelLimit` now auto-detects `(1M context)`/`[1m]` from the model name **regardless of config** (previously skipped when `modelContextLimits` was unset, so context widgets culled by default) + sensible 200k default; new `context-1m` badge widget and `model` `show1M` option; 8 new presets (vibe/pace/powerline/hud/tokens/capsule/pace-focus/tokens-plus → 25 total).
- **1M badge wired into default**: `essential` (and the `idPL`/`idInline`/`modelContext` identity helpers) carry `model show1M: true` — the "1M" badge auto-appears on 1M-context models, culls otherwise.
- **Permutation test matrices**: `matrix.test.ts` renders every preset × every line style (inline/powerline/capsule) + charset × minimalist × colorDepth combos + every widget × every theme; `location.test.ts` exercises the full config-resolution ladder (XDG < CLAUDE_CONFIG_DIR < ~/.claude < project < --config < env < CLI flag) in isolated temp HOME/cwd.
- **111 widgets**, **306 tests** passing (mutations, render, widgets, schema, styling, wizard, tui-logic, tui, presets, matrix, location, transcript, hardening). Refreshed upstream survey (ccstatusline v2.2.22 etc.) — see PARITY.md "Newly surveyed".
- **12-domain expert review + fixes**: security (project-config trust scoping → no RCE/secret-leak from a repo-local config; control-char sanitization of all untrusted strings via `data/sanitize.ts`; OSC8 URL validation), schema fidelity (**`resets_at` epoch-seconds normalization** — was silently breaking every rate-limit timer; `session_name` from stdin; subagent `isSidechain` filtering), resilience (per-provider try/catch isolation; transcript/stats type guards), concurrency (atomic stats/config writes), perf/platform (`git --no-optional-locks`, `windowsHide`, local-date cost buckets, `%LOCALAPPDATA%` stats path, Windows cwd drive-letter), rendering (**restored powerline/capsule glyphs**, charset-aware separators, `FORCE_COLOR=0`, bg covers padding), and agent done/running state.
- **Perf + cleanup round**: git provider coalesces 6 `rev-parse` spawns → 2 and adds a 2s disk TTL cache (most renders skip git entirely at 300ms cadence); `plainLen` now measures real terminal columns (CJK/emoji=2, combining=0) so auto-wrap aligns; `agent.elapsedSec` computed from Task tool_use→tool_result timestamps; removed dead `Painter.rawFg` + dead agent `model` branch. `LICENSE` added; package metadata (repo/author/homepage/provenance) set for publishing. Evaluated `noUncheckedIndexedAccess` (62 mechanical errors on already-runtime-safe code) — deferred as low-ROI churn.
- **Multi-agent review pass** (4 reviewers): fixed render-path crash on bad `timezone` (now any widget throw is culled, never collapses the line), agent done/running state (was stuck "running"), tool-results miscounted as user prompts, unknown-preset blanking the line, lossy+unguarded TUI/wizard save (now lossless + mkdir + try/catch), tightened `has1M` regex, schema rejects negative padding/refreshInterval, `tokens-per-min` formatting, `block-timer` clamp; plus strengthened tests (running-detection edge cases, exact color-downsample codes, per-preset content floor, hermetic location test).

## 🔄 In progress
- Stack adoption (docs/DEPENDENCIES.md): Done — bun build (split), node:test + ink-testing-library, Biome, **valibot validation**, **@clack/prompts wizard**, **Ink TUI**. Remaining: VHS demo, typedoc, eslint-react (only if needed).
- **Ink TUI polish**: wrap-around navigation, per-widget option editor (color/mode picker), write `refreshInterval` from the TUI, color preview in-frame. Core editor (`src/tui/`) is built + headlessly tested; final UX best confirmed in a real terminal.

## 🗺️ Remaining (roadmap)
- Ink TUI UI layer (see above) + write `refreshInterval` from TUI.
- Metrics: burn-rate `auto-reset` mode, per-model weekly (sonnet/opus), usage-API fallback for non-subscriber accounts, tokens/min.
- Git: auto clickable PR/branch links (OSC8), worktree original-branch.
- Layout: TUI-panel (CSS-grid) style, flex separators, powerline caps + auto-align, per-segment icon toggles.
- Context: real-time compaction via hooks.
- Misc: vim mode, voice status, rules-count, git/usage caching TTL, COLORTERM detection.
- Engineering: JSONL dedupe, HTTPS_PROXY, hook integration, npm provenance/version pinning, Windows UTF-8 codepage.

## ⛔ Out of scope (by design)
- SQLite stats / Turso cloud sync, web visual configurator, Islamic prayer times, Claude Code patcher, single compiled binary / single-bash build, localizations. (Other tools' niche/infra features; tracked for completeness in PARITY.md.)
