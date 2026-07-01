# CLAUDE.md — cc-status-dash

Guidance for Claude Code (and humans) working in this repo.

## What this is
A feature-rich **statusline + HUD** for Claude Code, in TypeScript. It fuses
ccstatusline's widget-pipeline config with Claude HUD's clean look and live
tools/agents/todos activity, plus pace-aware usage and a persistent stats store.
**115 widgets**, 10 themes, 35 presets (1–9 layers), 3 render styles.

Tagline: *ccstatusline's brain, Claude HUD's face.*

## How it runs
Claude Code pipes a JSON status payload to a `statusLine` command on **stdin**;
the program prints the rendered line(s) to **stdout**. Entry point: `src/index.ts`.

## Build & run (do this first)
**Bun-first** (the project targets Bun; `bun build --target=node` emits
Node-compatible output, so the artifact runs on both runtimes). The build is
**code-split** (`--outdir dist --splitting`) so the render hot path
(`dist/index.js`) never loads React/Ink — the TUI lives in lazy chunks.
```bash
bun install
bun run build           # bun build src/index.ts --target=node --outdir dist --splitting
bun run demo            # bun run src/index.ts < sample-input.json
bun test src            # full suite (also: npm run test:node for node:test on tsc output)
# pipe your own payload:
echo '{ ... }' | bun run src/index.ts
# Node fallback (no Bun): npm install && npm run build:node ; node dist/index.js < sample-input.json
```
Useful flags: `--list-widgets`, `--list-themes`, `--preset <id>`, `--theme <id>`, `--config <path>`,
`--validate` (check config files), `--configure`/`--wizard` (@clack preset wizard), `--tui`/`--edit` (Ink editor),
`--hook` (consume a Claude Code hook payload on stdin → append to the skills cache; prints nothing),
`--install [--install-hooks] [--dry-run]` (write the statusLine block + opt-in skills hooks into settings.json).

`dist/` and `node_modules/` are gitignored — always build before testing.
Source must stay **runtime-agnostic** (no Bun-only APIs) so it runs on Node too.

## Test it live in Claude Code
Build, then point Claude Code's `~/.claude/settings.json` at the built file:
```json
{
  "statusLine": {
    "type": "command",
    "command": "bun /ABSOLUTE/PATH/TO/cc-status-dash/dist/index.js",
    "padding": 0,
    "refreshInterval": 10
  }
}
```
Restart Claude Code. Edit `~/.claude/cc-status-dash.json` (or `./.cc-status-dash.json`) to configure; it reloads each render (no restart).

## Repo map
```
src/
  index.ts            entry: parse stdin flags + JSON, load config, render, print
  types.ts            ALL shared types (stdin schema, Config, Widget, Segment, providers)
  config/
    defaults.ts       preset catalog (PRESET_CATALOG/PRESET_LINES), DEFAULT_CONFIG, MAX_LAYERS
    load.ts           config resolution chain (CLI > env > project > user > XDG > defaults) + validation
    schema.ts         valibot partial-config schema, version/migrations, validatePartialConfig
    install.ts        write statusLine block (+ skills hooks) into Claude Code settings.json
    mutations.ts      PURE config edits the TUI/`/configure` drive (add/move/clone/...)
    wizard.ts         @clack/prompts preset wizard (buildWizardConfig is pure/tested)
  tui/                Ink editor (lazy-loaded; never on the render path)
    reducer.ts        PURE editor state machine (keys → config edits via mutations.ts)
    picker.ts         fuzzy widget picker (subsequence-ranked)
    app.tsx           Ink view (keys-in / frame-out); launch.ts mounts it
  data/               providers — run only if a visible widget needs them
    git.ts            git porcelain (branch, counts, sha, worktree, origin/upstream, ...)
    transcript.ts     JSONL tail parse (tools/agents/todos/skills/mcp/tokens/compaction)
    system.ts         memory, tmux, terminal width, ~/.claude config (email/mcp/hooks/rules)
    stats.ts          persistent stats store (~/.local/state/cc-status-dash/stats.json)
    skills-cache.ts   skills hook cache (JSONL): `--hook` writer + mergeSkills reader
    providers.ts      figures out needed DataSources and invokes the right providers
  render/
    renderer.ts       inline / powerline / capsule; merge + auto-wrap; padding/bold
    colors.ts         ANSI 16/256/truecolor, NO_COLOR/FORCE_COLOR, theme color resolution
    bars.ts           progress-bar styles + threshold colors
  themes/index.ts     built-in themes + resolvePalette (theme < custom colors)
  widgets/index.ts    ALL widgets + registry (getWidget/listWidgets)
commands/             /setup, /configure slash commands (plugin)
.claude-plugin/       plugin + marketplace manifests
docs/                 ANALYSIS.md (plan), PARITY.md (feature matrix), STATUS.md (live tracker)
sample-input.json     example stdin payload for `npm run demo`
```

## Widget model (the core contract)
Every widget implements `Widget` (see `src/types.ts`):
```ts
{ id, category, label, needs: DataSource[], collect(ctx), render(data, opts, ctx) => Segment[] }
```
- `needs` lists data sources (`"git" | "transcript" | "system" | "stats" | "rate_limits" | "stdin"`) so providers run lazily.
- `render` returns `Segment[]`; return `[]` to render nothing (empty widgets are auto-culled).
- Honor `ctx.config.minimalist` (drop labels) and `ctx.config.charset` (unicode vs ASCII) — use the `sym()` and `lv()` helpers at the top of `widgets/index.ts`.

### Add a widget (recipe)
In `src/widgets/index.ts`:
```ts
add(w("my-widget", "system", "My widget", ["stdin"], (_d, opts, ctx) => {
  const value = /* derive from ctx.input / ctx.data */;
  return value ? lv("Label", value, "label", ctx) : [];
}));
```
Then `npm run build` and `node dist/index.js --list-widgets | grep my-widget`. Reference it from a line's `widgets[]` in a config to see it render.

## stdin schema gotchas (grounded in real Claude Code payloads)
- Context metrics live under `context_window` (NOT `context`): `used_percentage`, `context_window_size`, `current_usage.{input,output,cache_*}_tokens`.
- `rate_limits.five_hour/seven_day`: `used_percentage` + `resets_at` (epoch **seconds** per CC docs; `epochMs()` normalizes seconds/ms/ISO — never subtract it from `Date.now()` raw).
- `effort` may be a bare string OR `{ level }`.
- `cost`: `total_cost_usd`, `total_duration_ms`, `total_api_duration_ms`, `total_lines_added/removed`.

## Testing tips
- Themes/charset: `--theme tokyo-night`, `"charset":"text"` for ASCII; `NO_COLOR=1` disables color.
- Auto-wrap: piped stdout has no width — set `COLUMNS=40` to test wrapping.
- Stats widgets: set `XDG_STATE_HOME=/tmp/x` to use a throwaway stats file; render twice (>1s apart) so token-speed has samples.
- Strip ANSI to eyeball output: `... | sed -r 's/\x1b\[[0-9;]*m//g'`.
- Git/PR widgets need a real git repo as the payload's `workspace.current_dir`.

## Conventions
- TypeScript strict, ESM (`.js` import specifiers). **Bun-first, Node 18+ compatible** — no Bun-only APIs. No runtime deps yet.
- Never throw into the render path — providers and `index.ts` swallow errors and fall back (worst case prints `Claude`).
- Keep the hot path fast: short timeouts on git, lazy providers, tail-only transcript reads.

## Status & plan
- Live status (done / in progress / remaining / out-of-scope): **docs/STATUS.md**
- Full feature-by-feature parity vs all 7 surveyed tools: **docs/PARITY.md**
- Original design/plan + deep dive: **docs/ANALYSIS.md**
- Dependency adoption plan (Ink TUI, zod, bundler, vitest, ...): **docs/DEPENDENCIES.md**

Stack adoption progress is in docs/DEPENDENCIES.md (valibot, @clack, Ink, Biome adopted).

The **Ink TUI** config editor is built (`src/tui/`, `--tui`) — pure reducer/picker are
unit-tested and the Ink view is tested headlessly via ink-testing-library. It is now
multi-screen (ccstatusline-parity): **layout** (lines/widgets) · **options** (per-widget,
spec-driven by `tui/optionSpec.ts` → `setWidgetOption`) · **global** (settings → `setGlobal`,
incl. `refreshInterval` + `powerlineSeparator`) · **colors** (palette overrides → `setColor`).
Powerline separator glyph is configurable (`powerlineSeparator`: arrow/round/triangle/flame/pixel).
Nav wraps around (widgets/lines/field-rows/picker); color fields use a palette **picker** (`"color"`
field kind, ←→ cycles `COLOR_CHOICES`, custom hex still typeable) with **in-frame swatches**.
The `i` key opens an **install overlay** → writes the `statusLine` block (+ opt-in skills hooks) into
`settings.json` via `config/install.ts` (`h` toggles hooks). Same as the `--install` CLI flag.
