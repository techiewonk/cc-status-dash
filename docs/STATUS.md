# Project status — cc-status-dash

_Last updated: 2026-06-30. Living tracker of what's done, in progress, and remaining._

Snapshot: **94 widgets**, 5 themes, 18 presets (1–5 layers), persistent stats store, config-mutation engine. Builds clean (`tsc`), renders all presets. See [PARITY.md](PARITY.md) for the full feature-by-feature matrix.

## ✅ Done
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
- Repo: committed under user identity; `docs/ANALYSIS.md`, `docs/PARITY.md`, `docs/STATUS.md`.

## 🔄 In progress
- **Ink TUI**: the mutation engine (`src/config/mutations.ts`) is done and tested; the interactive Ink UI layer (live preview, fuzzy widget picker, clone/reorder keys, preset wizard) is the next build — best verified in a real terminal.

## 🗺️ Remaining (roadmap)
- Ink TUI UI layer (see above) + write `refreshInterval` from TUI.
- Metrics: burn-rate `auto-reset` mode, last-response time, per-model weekly (sonnet/opus), usage-API fallback for non-subscriber accounts, tokens/min.
- Git: auto clickable PR/branch links (OSC8), worktree original-branch.
- Layout: TUI-panel (CSS-grid) style, auto-wrap / flex separators, widget merging, powerline caps + auto-align, per-segment icon toggles.
- Context: per-model context-limit config, 1M auto-detect from label, real-time compaction via hooks.
- Misc: Claude account email, vim mode, voice status, config counts (CLAUDE.md/rules/hooks), `CLAUDE_CONFIG_DIR`, git/usage caching TTL, COLORTERM detection, fish-style cwd.
- Engineering: JSONL dedupe, HTTPS_PROXY, hook integration, npm provenance/version pinning, Windows UTF-8 codepage.

## ⛔ Out of scope (by design)
- SQLite stats / Turso cloud sync, web visual configurator, Islamic prayer times, Claude Code patcher, single compiled binary / single-bash build, localizations. (Other tools' niche/infra features; tracked for completeness in PARITY.md.)
