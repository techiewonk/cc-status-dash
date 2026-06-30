---
name: Feature Gap Enhancement
overview: "Re-verified 2026-06-30: cc-status-dash is at ~94% of ccstatusline + Claude HUD union (102 widgets, 30 presets). external-usage and maxWidth shipped since first scan. This plan closes remaining HUD/ccstatusline gaps, adds ideas from the other 5 ANALYSIS tools, and proposes unique differentiators—re-prioritized by relevance."
todos:
  - id: hygiene-docs
    content: "DONE 2026-06-30: Synced STATUS.md/PARITY.md to 102 widgets / 30 presets / 298 tests; added widget-count snapshot test + optionSpec-key-validity test (widgets.test.ts). COMPARISON/README/OPTIONS already at 102."
    status: completed
  - id: tui-option-parity
    content: "DONE 2026-06-30 (Phase 0b): Exposed JSON-only options in optionSpec.ts — burn-rate.mode, skills.mode, cache-timer.ttlSeconds, git-ahead-behind push warn/crit thresholds, session-clock + reset timers hour12/timezone, activity.tool-counts.max, token-breakdown.threshold, provider.showApi/prefix."
    status: completed
  - id: hud-widgets
    content: "Phase 1 PARTIAL 2026-06-30: shipped added-dirs (workspace.added_dirs added to schema), session-tokens (existing transcript data), activity.mcp (live names). REMAINING: advisor + session-start-date (need transcript advisorModel/sessionStart parsing), hud-compact preset."
    status: in_progress
  - id: hud-ux
    content: "Phase 1 MOSTLY DONE 2026-06-30: limit-reached, usageCompact, effort symbols (thinking-effort.symbols), provider-aware cost cull (cost.hideOnProvider), context tokens/both (context-percentage.value), hud-compact preset. REMAINING: activity separators widget, mergeGroups width-fallback."
    status: in_progress
  - id: hud-render
    content: "Phase 1b: OSC-8-safe wrap, adaptive bar width, clickable cwd, git.files per-file line, session-start-date widget, colors.usageWarning"
    status: pending
  - id: cc-state-widgets
    content: "Phase 2: voice-status, remote-control-status, vim-mode + system.ts config readers; thinking-effort fallback chain"
    status: pending
  - id: option-depth
    content: "Phase 2: dim parens, merge no-padding, windowSeconds, compaction options, linkToIDE/linkToRepo, timer locale, hideNoGit flags, symbol overrides"
    status: pending
  - id: resilience-perf
    content: "Phase 2b: invalid-config hot-path badge, block-cache JSONL, separator collapse, CCSTATUSLINE_WIDTH env, bounded stdin read, CLAUDE_STATUS_DASH_DISABLE kill switch"
    status: pending
  - id: layout-powerline
    content: "Phase 3: flexMode, flex-separator, powerline caps, auto-align, gradients, inheritSeparatorColors, global FG/BG override, TUI wrap-around + refreshInterval sync + install screen"
    status: pending
  - id: usage-api
    content: "Phase 4: usage API provider, weekly sonnet/opus widgets, extra-usage-used (API-sourced); JSONL dedupe; external-usage write sidecar"
    status: pending
  - id: unique-features
    content: "Phase 5 PARTIAL 2026-06-30: shipped session-health widget, cache-roi widget, theme pack (+catppuccin/dracula/one-dark/rose-pine/hud-light → 10 themes). REMAINING: budget scope:block (needs per-block cost accumulator in stats), MAX_LAYERS 9 (test couples to preset coverage), config profiles, skills hook cache."
    status: in_progress
  - id: defer-jj
    content: "Defer Jujutsu (8 widgets) — opt-in jj provider only if user demand; document in PARITY"
    status: pending
  - id: defer-i18n
    content: "Defer i18n until contributor commitment — high maintenance, low immediate ROI for English-primary users"
    status: pending
isProject: false
---

# cc-status-dash Feature Verification & Enhancement Plan (v2 — re-scan)

**Re-verified:** 2026-06-30 via 4 parallel rescans of `cc-status-dash`, `claude-hud`, `ccstatusline`, and ANALYSIS §2.1–2.5 (other 5 tools).

---

## What changed since v1 plan

| Finding | Impact on plan |
|---------|----------------|
| **102 widgets** (+`external-usage`) | Closes ccstatusline ExtraUsage* and HUD external-usage read path |
| **`maxWidth`** in renderer + universal TUI options | Closes ccstatusline truncation gap |
| **`usage.*` `mode: remaining`** on all usage widgets | Closes partial HUD `usageValue: remaining` |
| **`hoursOnly`** on reset timers (code + COMPARISON) | Partial timer parity — still need locale/weekday in TUI |
| **Docs drift** | PARITY/STATUS still say 101; COMPARISON contradicts itself on ExtraUsage |
| **~15 widget options work in JSON but not TUI** | New Phase 0b — high ROI, no new features |

**Revised parity score:**

| Source | Implemented | Partial | Missing | Notes |
|--------|-------------|---------|---------|-------|
| Claude HUD | ~20 / 25 | ~3 | ~2 | i18n + compact layout engine deferred |
| ccstatusline | ~74 / 85 | ~5 | ~6 | jj/vim/voice/API families |
| ANALYSIS 7-tool union | **~94%** | ~4% | ~2% | Niche from other 5 tools |

---

## Current inventory (verified)

| Area | Count | Key files |
|------|-------|-----------|
| Widgets | **102** | [src/widgets/index.ts](src/widgets/index.ts) |
| Themes | **5** | [src/themes/index.ts](src/themes/index.ts) |
| Presets | **30** | [src/config/defaults.ts](src/config/defaults.ts) |
| Line styles | **3** | inline / powerline / capsule |
| TUI screens | **4** | layout / options / global / colors |
| Data providers | **6** | stdin, git, transcript, system, stats, rate_limits |
| Option reference | [docs/OPTIONS.md](docs/OPTIONS.md) | 22 widget-specific + 7 universal |

```mermaid
flowchart TB
  subgraph closed [Closed since v1]
    EU[external-usage widget]
    MW[maxWidth universal]
    UR[usage mode remaining]
  end
  subgraph phase1 [Phase 1 HUD]
    AD[added-dirs advisor session-tokens]
    MCP[activity.mcp live line]
  end
  subgraph phase2 [Phase 2 depth]
    VV[voice vim remote-control]
    PERF[block-cache invalid-config badge]
  end
  subgraph phase5 [Phase 5 unique]
    TH[themes cache-roi block-budget]
  end
  closed --> phase1 --> phase2 --> phase5
```

---

## Gap analysis — revised by relevance

### Tier 1 — High relevance (user-visible, implementable soon)

#### Claude HUD (not yet in plan detail)

| Gap | Why it matters | Suggested approach |
|-----|----------------|-------------------|
| **added-dirs** | `/add-dir` multi-root sessions are common | Widget + `workspace.added_dirs` in [src/types.ts](src/types.ts); OSC8 links |
| **advisor** | `/advisor` sessions need model visibility | Parse `advisorModel` in [src/data/transcript.ts](src/data/transcript.ts) |
| **session-tokens** | HUD shows cumulative in/out/cache | Widget using existing `sessionTokens` in transcript data |
| **activity.mcp** | Live server names vs `mcp-count` only | Port [claude-hud/skills-mcp-line.ts](D:\claude-hud\src\render\skills-mcp-line.ts) logic |
| **Provider-aware cull** | Bedrock/Vertex users see misleading usage/cost | Auto-return `[]` from usage/cost widgets when provider detected |
| **Limit reached @ 100%** | Clear UX when quota exhausted | `⚠ Limit reached` + reset time on usage widgets |
| **usageCompact** | Dense single-line usage `5h: 25% (1h 30m)` | Option on `usage.block` / preset |
| **context tokens/both** | `45k/200k` or `45% (45k/200k)` | `context-length` display mode or `context.bar` option |
| **git.files** | Per-file `+file.ts (+4 -1)` with OSC8 | New widget; git provider already has file stats potential |
| **showSeparators** | Visual break before activity lines | Global `activitySeparator: boolean` |
| **session-start-date** | Session age context | Widget from transcript `sessionStart` |
| **OSC-8-safe autoWrap** | Links break on wrap without close sequence | Port `closeOpenHyperlink` from claude-hud renderer |
| **modelOverride** | Manual label when model string ugly | Option on `model` widget |

#### ccstatusline (not yet in plan detail)

| Gap | Why it matters | Suggested approach |
|-----|----------------|-------------------|
| **Invalid-config hot-path badge** | Corrupt JSON shouldn't silently confuse users | Render defaults + `⚠ invalid config` prefix (ccstatusline pattern) |
| **Block-cache** | JSONL re-parse every 300ms is expensive | Disk cache `~/.cache/cc-status-dash/block-*.json` |
| **Separator collapse** | Empty widgets leave orphan `│` | Drop separators around culled widgets |
| **Skills hook cache** | More accurate than transcript tail grep | Optional hook file watcher or read ccstatusline cache format |
| **Thinking-effort fallback** | stdin may omit effort | Chain: stdin → transcript → settings; support `default`/`?` |
| **custom-command parity** | Power users pipe stdin JSON to commands | `preserveColors`, `timeout`, pass payload |
| **hideNoGit / hideNoRemote** | Cleaner lines outside repos | Per-git-widget option |
| **TUI option parity** | 15+ options JSON-only today | Phase 0b — see todo `tui-option-parity` |

#### From other 5 ANALYSIS tools (new in v2)

| Gap | Source | Why relevant |
|-----|--------|--------------|
| **Theme pack + light theme** | claudia, powerline, CCometixLine | 5 themes vs 11–20 upstream; light terminal users underserved |
| **cache-roi widget** | claudia, rz1989s | $/tokens saved from cache — complements `cache-hit-rate` |
| **budget scope: block** | claude-powerline | Dollar cap for current 5h window (not just % threshold) |
| **MAX_LAYERS > 5** | rz1989s (9), powerline (unlimited) | Power users want dashboard density; trivial schema change |
| **MCP health** | rz1989s | Beyond count — connection state if CC exposes it |

---

### Tier 2 — Medium relevance (power users, more effort)

| Gap | Source | Notes |
|-----|--------|-------|
| **mergeGroups** with width fallback + label align | HUD | Width-aware group merge; port `label-align.ts` |
| **flexMode + flex-separator** | ccstatusline | Smart truncation; pairs with separator widgets |
| **Powerline caps + auto-align + font install** | ccstatusline | Premium layout; TUI sub-screen |
| **Gradients** (14 presets) | ccstatusline | Color layer extension |
| **Adaptive bar width** (4/6/10 by terminal) | HUD | [src/render/bars.ts](src/render/bars.ts) |
| **timeFormat modes** on timers | HUD | absolute / elapsed / both |
| **autoCompactWindow** denominator | HUD | Fixed 200k context % matching `/context` |
| **Bounded stdin read** (256KB cap, timeouts) | HUD | Prevents statusline hangs |
| **CLAUDE_STATUS_DASH_DISABLE** kill switch | HUD | `CLAUDE_HUD_DISABLE` equivalent |
| **TUI install/update/uninstall** | ccstatusline | Pinned vs `@latest`; medium onboarding value |
| **Usage API + weekly sonnet/opus** | ccstatusline | Network + auth; async prefetch only |
| **JSONL streaming dedupe** | ccstatusline | Accurate tool/token counts |
| **dim: 'parens'**, **merge: 'no-padding'** | ccstatusline | Styling polish |
| **Bar invert / time cursor / slider modes** | ccstatusline | Beyond static `barStyle` |
| **Compaction glitch filter** | ccstatusline | Ignore transient <1% context frames |

---

### Tier 3 — Low relevance / defer

| Item | Reason to defer |
|------|-----------------|
| **Jujutsu (8 widgets)** | Requires `jj` CLI; tiny user base — opt-in only |
| **i18n (zh-Hans)** | High maintenance; defer until contributor |
| **CSS-grid TUI panel** | Large effort; flex mode may suffice |
| **SQLite / Turso** | JSON stats store works; out-of-scope |
| **--extra-cmd arbitrary shell** | Security risk on every refresh |
| **AIWatch integration** | Document as custom-command recipe only |
| **npm provenance / pinned global** | Release infra, not product feature |
| **Islamic prayer times** | Explicitly out-of-scope |
| **CCometixLine patcher** | Out-of-scope |
| **Web configurator** | Out-of-scope |
| **Compact layout engine** (`lineLayout`) | Achievable via `hud-compact` preset without global mode |
| **Remote control widget** | Niche; include in Phase 2 bundle (low cost) |

---

## Already shipped — remove from gap list

- `external-usage` widget (read JSON file; `path`/`mode`/`barStyle`/`maxAgeMs`; env `CC_STATUS_DASH_EXTERNAL_USAGE`)
- `maxWidth` truncation + TUI editing (all 102 widgets)
- Universal per-widget styling in TUI (`color`, `bgColor`, `bold`, `dim`, `rawValue`, `merge`, `maxWidth`)
- `usage.block` / `usage.weekly` / `session-usage` / `weekly-usage` **`mode: remaining`**
- `reset-timer` / `weekly-reset-timer` **`hoursOnly`** (in code; document in OPTIONS.md)
- CJK/emoji `displayWidth` for auto-wrap
- Pace delta, burn-rate modes, budget, cost-projection, daily/weekly/monthly cost
- Security: project-config trust scoping, OSC8 validation, sanitize

---

## Unique features to add (beyond all upstream)

Prioritized by differentiation value:

| Feature | Description | Effort |
|---------|-------------|--------|
| **`session-health`** | One widget: context % + pace ⇡/⇣ + minutes to reset | Low |
| **`cache-roi`** | Estimated $/tokens saved from prompt cache hits | Low |
| **`budget` scope: `block`** | Dollar cap for current 5h window | Low |
| **`preset: hud-compact`** | Single-line HUD mirror without layout engine | Low |
| **Theme pack** | +dracula, catppuccin, one-dark, rose-pine, **hud-light** | Low |
| **`MAX_LAYERS: 9`** | Match rz1989s density | Trivial |
| **Config profiles** | Named snapshots in TUI (`dev`/`monitor`) | Medium |
| **Usage sidecar writer** | Emit `rate_limits` JSON for external tools (pairs with `external-usage`) | Medium |
| **Hook compaction live state** | `Compacting…` via PreCompact hook file | Medium |
| **`--diff-config`** | Compare two configs / presets in CLI | Low |
| **Widget category filter in TUI picker** | 102 widgets need search/filter | Low |
| **`activity.separator` widget** | Composable `────` instead of global only | Low |

**cc-status-dash exclusives to keep marketing:** `activity.tool-counts`, `context-1m`, `context-percentage-usable`, `capsule` style, 30 presets, persistent stats store, pace + budget + projection stack.

---

## Implementation phases (revised)

### Phase 0 — Hygiene (1–2 days)

- Sync [docs/STATUS.md](docs/STATUS.md), [docs/PARITY.md](docs/PARITY.md), [docs/COMPARISON.md](docs/COMPARISON.md) to **102 widgets**
- Mark `external-usage` ✅; remove stale ExtraUsage gap bullets
- Remove duplicate "Remaining" items already Done (auto-reset, tokens/min, COLORTERM, worktree-original-branch)
- Widget ID snapshot test (`listWidgets()` vs documented set)
- Cross-check [docs/OPTIONS.md](docs/OPTIONS.md) with `optionSpec.ts`

### Phase 0b — TUI option parity (2–3 days, parallel with Phase 0)

Expose JSON-only options in [src/tui/optionSpec.ts](src/tui/optionSpec.ts):

`burn-rate.mode`, `skills.mode`, `cache-timer.ttlSeconds`, `git-ahead-behind` thresholds, `session-clock`/`reset-timer` `hour12`/`timezone`, `activity.tool-counts.max`, `token-breakdown.threshold`, `provider.showApi`, `env.prefix`

### Phase 1 — HUD closure (~1 week)

1. Stdin/transcript: `added_dirs`, `advisorModel`, `sessionStart`
2. Widgets: `added-dirs`, `advisor`, `session-tokens`, `activity.mcp`, `session-start-date`
3. UX: effort symbols, provider cull, limit-reached, `usageCompact`, context `tokens`/`both` modes, `showSeparators`
4. Preset: `hud-compact`
5. `model.override` option

**Tests:** transcript fixtures, sample-input.json updates, widget render tests

### Phase 1b — HUD render engine (~3–4 days)

- `git.files` per-file OSC8 widget
- OSC-8-safe `autoWrap`
- Adaptive bar width
- Clickable `cwd` (OSC8 `file://`)
- `colors.usageWarning` semantic key

### Phase 2 — ccstatusline state + resilience (~1 week)

- Widgets: `voice-status`, `remote-control-status`, `vim-mode`
- `data/system.ts` config readers (port from ccstatusline)
- Thinking-effort fallback chain
- Invalid-config badge on hot path
- Block-cache for JSONL metrics
- Separator collapse
- `CC_STATUS_DASH_DISABLE=1`, bounded stdin read
- `CCSTATUSLINE_WIDTH` env alias

### Phase 2b — Option depth (~3 days)

- `dim: 'parens'`, `merge: 'no-padding'`
- `windowSeconds` on speed widgets
- Compaction format/triggers/reclaimed (if transcript data available)
- `linkToIDE` / `linkToRepo` on git widgets
- `hideNoGit`, `hideNoRemote`, symbol overrides
- Timer `locale` / `weekday`

### Phase 3 — Layout & powerline (~2 weeks)

- flexMode, flex-separator, separator layout widgets
- Powerline caps, auto-align, custom hex separators
- Gradients (14 presets)
- Global overrides: inheritSeparatorColors, override FG/BG
- TUI: wrap-around nav, refreshInterval → `settings.json`, install/update screen, gradient picker

### Phase 4 — Usage API (~2 weeks)

- Async usage API provider (never blocks render)
- `weekly-sonnet-usage`, `weekly-opus-usage`, `extra-usage-used` (API-sourced — distinct from file-based `external-usage`)
- JSONL streaming dedupe
- Optional external-usage **write** sidecar from stats store

### Phase 5 — Unique differentiators (~1 week, can start after Phase 1)

- `session-health`, `cache-roi`, `budget scope: block`
- Theme pack (+5 palettes incl. `hud-light`)
- `MAX_LAYERS: 9`
- Config profiles in TUI
- Skills hook cache reader
- Widget category filter in picker

### Deferred

- Jujutsu provider (8 widgets) — on demand
- i18n — contributor-driven
- CSS-grid panel — after flex evaluation
- SQLite stats — opt-in variant later

---

## Relevance matrix (what to skip vs prioritize)

```mermaid
quadrantChart
  title Feature prioritization
  x-axis Low Effort --> High Effort
  y-axis Low User Value --> High User Value
  quadrant-1 Plan carefully
  quadrant-2 Do first
  quadrant-3 Skip or defer
  quadrant-4 Quick wins
  added-dirs: [0.2, 0.85]
  external-usage: [0.25, 0.7]
  tui-option-parity: [0.15, 0.75]
  session-health: [0.2, 0.8]
  theme-pack: [0.25, 0.7]
  block-cache: [0.4, 0.8]
  usage-api: [0.85, 0.75]
  jj-widgets: [0.7, 0.15]
  i18n: [0.9, 0.4]
  css-grid-panel: [0.95, 0.5]
  gradients: [0.55, 0.45]
```

**Do first (Q2+Q4):** Phase 0/0b, Phase 1, session-health, theme pack, block-cache  
**Plan carefully (Q1):** Usage API, powerline depth, mergeGroups  
**Skip/defer (Q3):** Jujutsu, prayer times, extra-cmd, patcher

---

## Verification checklist

- [ ] `bun run src/index.ts --list-widgets` → 102 ids match OPTIONS.md + snapshot test
- [ ] Every Claude HUD `HudElement` maps to widget or preset (table in PARITY.md)
- [ ] Every ccstatusline widget: ✅ / deferred-with-reason / out-of-scope
- [ ] `external-usage` marked ✅ in PARITY; ExtraUsage API widgets still 🗺️
- [ ] All `WIDGET_OPTION_SPECS` keys render correctly (matrix test)
- [ ] TUI `widgetFields()` covers every JSON-documented option
- [ ] sample-input.json includes `added_dirs`, `vim`, `advisorModel` after Phase 1

---

## Risk notes (updated)

- **external-usage** already trust-scoped — extend same pattern to write sidecar
- **Usage API** must use background prefetch + disk cache; never `await` on render path
- **Invalid-config badge** must not write corrupt file back
- **Block-cache** TTL must respect session boundaries
- **git.files** widget: cap file count + respect terminal width (HUD hides below 60 cols)
- **Theme pack**: test all 102 widgets × new themes in matrix.test.ts

---

## Suggested execution order

1. **Phase 0 + 0b** (docs + TUI option parity) — immediate trust win, no new widgets
2. **Phase 1 + 1b** (HUD closure) — closes largest visible gap vs claude-hud
3. **Phase 5 subset** (session-health, themes, cache-roi, block-budget) — parallel differentiation
4. **Phase 2 + 2b** (resilience + cc-state widgets) — production hardening
5. **Phase 3** (layout depth) — power users
6. **Phase 4** (usage API) — subscriber-only metrics

Phases 0–1 deliver the "complete vs HUD + ccstatusline" story. Phase 5 makes cc-status-dash **better than both**, not just equal.
