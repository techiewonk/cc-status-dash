# Development & Local Testing

A complete, copy-pasteable flow for hacking on cc-status-dash and verifying **every**
piece works locally — before you push or publish.

- [Prerequisites](#prerequisites)
- [Build](#build)
- [The render loop (how it runs)](#the-render-loop)
- [Automated tests](#automated-tests)
- [One-command functionality check (smoke)](#one-command-functionality-check)
- [Manual testing matrix](#manual-testing-matrix)
- [Testing live inside Claude Code](#testing-live-inside-claude-code)
- [Linux / CI parity (Docker)](#linux--ci-parity)
- [Extending: widgets, presets, themes](#extending)
- [Regenerating the demo GIF](#regenerating-the-demo-gif)
- [Release](#release)

---

## Prerequisites

| Tool | Why | Required? |
|---|---|---|
| **Bun** ≥ 1.0 | primary runtime + bundler + test runner | recommended |
| **Node** ≥ 18 | fallback runtime; `node:test` suite; runs the shipped bundle | required |
| **Docker** | reproduce Linux/CI test runs; render the demo GIF (VHS) | optional |

```bash
npm install -g bun     # if you don't have it
node --version         # >= 18
```

Source stays **runtime-agnostic** — no Bun-only APIs — so the same `src/` runs on both.

---

## Build

```bash
bun install
bun run build          # bun build src/index.ts --target=node --outdir dist --splitting
bun run demo           # render sample-input.json with the built bundle
```

The build is **code-split**: the render hot path (`dist/index.js`) never loads React/Ink —
the TUI lives in lazy chunks. `dist/` and `node_modules/` are gitignored; **always build
before testing the binary.**

**No Bun?** Use the Node/tsc path:

```bash
npm install
npm run build:node     # tsc -> dist/
node dist/index.js < sample-input.json
```

---

## The render loop

Claude Code pipes a JSON status payload on **stdin**; the program prints the rendered
line(s) to **stdout**. So you can drive it with any payload:

```bash
echo '{"model":{"display_name":"Opus 4.8"},"workspace":{"current_dir":"'"$PWD"'"}}' \
  | node dist/index.js

node dist/index.js < sample-input.json          # the canned example payload
```

`sample-input.json` is a realistic payload (model, context_window, rate_limits, cost, …).
Strip ANSI to eyeball plain text:

```bash
node dist/index.js < sample-input.json | sed -r 's/\x1b\[[0-9;]*m//g'
```

---

## Automated tests

| Command | What it runs |
|---|---|
| `bun test src` | full unit + integration suite (fast; primary) |
| `npm run test:node` | builds with `tsc`, runs the same suite under `node --test` |
| `npm run typecheck` | `tsc --noEmit` strict typecheck |
| `npm run lint` | Biome |

```bash
bun test src           # 283 tests across 13 files
npm run typecheck
```

The suite covers: the render matrix (every preset × every style × themes/charsets), all
101 widgets under all themes, config resolution & precedence, schema validation, security
hardening (control-char sanitization, untrusted-config widget stripping), the pure TUI
reducer/picker, and the wizard.

---

## One-command functionality check

`bun test src` proves individual units. The **smoke test** proves the whole surface
renders without crashing — every preset, every theme, every style, both charsets, all
flags, env toggles, stats persistence, and the never-crash fallbacks:

```bash
bun run build && bun run smoke      # or: bash scripts/smoke.sh
```

```
▸ inspection flags
▸ every preset (x default theme)
  (30 presets)
▸ every theme (x full preset)
▸ env + edge cases
▸ stats persistence (throwaway XDG_STATE_HOME, stats-backed widget)
▸ charset=text (ASCII) + minimalist via --config
smoke: 45 passed, 0 failed
```

It asserts **exit 0 + non-empty render** across the matrix and checks the fallbacks
(invalid JSON → `Claude`, empty stdin still renders, `NO_COLOR` emits no ANSI, stats.json
is written under `XDG_STATE_HOME`). Exit code is non-zero if anything regresses — wire it
into a pre-push hook if you like.

---

## Manual testing matrix

Work through these to exercise each subsystem by hand.

### Presets, themes, styles

```bash
node dist/index.js --list-presets               # 30 presets
node dist/index.js --list-themes                # 5 themes
node dist/index.js --list-widgets               # 101 widgets

node dist/index.js --preset oneline   < sample-input.json   # dense single line
node dist/index.js --preset dashboard < sample-input.json   # 4 layers
node dist/index.js --preset max       < sample-input.json   # 5 layers

for t in hud-clean tokyo-night gruvbox nord mono; do
  echo "== $t =="; node dist/index.js --preset full --theme "$t" < sample-input.json
done
```

### Charset / color / width

```bash
# ASCII fallback (no Nerd Font) + minimalist (no labels)
printf '{"charset":"text","minimalist":true,"preset":"full"}' > /tmp/c.json
node dist/index.js --config /tmp/c.json < sample-input.json

NO_COLOR=1 node dist/index.js < sample-input.json            # plain, no ANSI
COLUMNS=40 node dist/index.js --preset dashboard < sample-input.json   # wrap test
```

> Piped stdout has no width, so `autoWrap` needs `COLUMNS` set to test wrapping.

### Stats persistence (throwaway store)

```bash
export XDG_STATE_HOME=/tmp/ccsd-state
printf '{"lines":[{"widgets":[{"id":"message-count"},{"id":"tokens-per-min"}]}]}' > /tmp/s.json
node dist/index.js --config /tmp/s.json < sample-input.json   # run twice, >1s apart,
node dist/index.js --config /tmp/s.json < sample-input.json   # so token-speed has samples
cat "$XDG_STATE_HOME/cc-status-dash/stats.json"
unset XDG_STATE_HOME
```

### Git widgets (need a real repo)

Git widgets read the repo at the payload's `workspace.current_dir`. Point it at this repo:

```bash
printf '{"workspace":{"current_dir":"%s"},"preset":"git"}' "$PWD" \
  | node dist/index.js --preset git
```

### Transcript widgets (tools / agents / todos / tokens)

These read the session JSONL at the payload's `transcript_path`. Use a real Claude Code
transcript, or the fixtures the tests build under a temp dir (`src/__tests__/transcript.test.ts`
shows the JSONL shape).

### Config validation

```bash
node dist/index.js --validate                          # checks the resolution chain
printf '{"padding":"lots"}' > /tmp/bad.json
node dist/index.js --validate --config /tmp/bad.json   # FAIL + reason; exit 1
```

### Interactive editors (need a TTY — run in a real terminal, not piped)

```bash
node dist/index.js --configure      # @clack preset wizard
node dist/index.js --tui            # Ink config editor (fuzzy widget picker)
```

---

## Testing live inside Claude Code

Point Claude Code's `~/.claude/settings.json` at your local build:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node /ABSOLUTE/PATH/TO/cc-status-dash/dist/index.js",
    "padding": 0,
    "refreshInterval": 10
  }
}
```

Restart Claude Code once. Then iterate by editing `~/.claude/cc-status-dash.json` (or
`./.cc-status-dash.json`) — it reloads on every render, no restart needed. Rebuild
(`bun run build`) whenever you change `src/`.

> On Windows + git-bash, wrap with a shell that sets `COLUMNS` from the real terminal —
> see the snippet in the project root `CLAUDE.md` / the existing settings entry.

---

## Linux / CI parity

The CI matrix runs on **Linux**; a few behaviors differ from Windows/macOS (filesystem
case-sensitivity, `os.homedir()` env semantics). Reproduce a clean Linux run in Docker
before pushing:

```bash
# full suite on real Linux, container-private node_modules
docker run --rm -v "$PWD:/app" -v /app/node_modules -w /app oven/bun:latest \
  sh -c "bun install --frozen-lockfile && bun test src"

# verify the published/global install works on Linux
docker run --rm node:20-alpine sh -c \
  "npm i -g cc-status-dash >/dev/null 2>&1 && echo '{\"model\":{\"display_name\":\"Opus\"}}' | cc-status-dash"
```

(On Windows git-bash, prefix `docker` with `MSYS_NO_PATHCONV=1` so volume paths aren't mangled.)

---

## Extending

### Add a widget — `src/widgets/index.ts`

```ts
add(w("my-widget", "system", "My widget", ["stdin"], (_d, opts, ctx) => {
  const value = /* derive from ctx.input / ctx.data */;
  return value ? lv("Label", value, "label", ctx) : [];   // [] => culled
}));
```

`needs` (`"git" | "transcript" | "system" | "stats" | "rate_limits" | "stdin"`) controls
which providers run. Honor `ctx.config.minimalist` and `ctx.config.charset` via the `sym()`
/ `lv()` helpers. Then:

```bash
bun run build && node dist/index.js --list-widgets | grep my-widget
```

Add a render assertion in `src/__tests__/widgets.test.ts`.

### Add a preset — `src/config/defaults.ts`

Add a `LineConfig[]` builder and a `PRESET_CATALOG` entry (`id`, `name`, `lineCount`,
`description`, `lines`). The render-matrix test picks it up automatically; keep `lineCount`
accurate (it's asserted ≤ rendered lines).

### Add a theme — `src/themes/index.ts`

Add a palette to the themes map; `resolvePalette` merges custom `colors` over it. It shows
up in `--list-themes` and the every-widget-×-every-theme test.

---

## Regenerating the demo GIF

The README GIF is generated with [VHS](https://github.com/charmbracelet/vhs). Frames are
**real renders** captured into a self-contained `scripts/demo.sh` (base64) so playback
needs no Node:

```bash
bun run build
bun run demo:build        # bash scripts/build-demo.sh -> scripts/demo.sh

# render with the VHS Docker image (no local VHS install needed)
docker run --rm -v "$PWD:/vhs" -w /vhs ghcr.io/charmbracelet/vhs docs/demo.tape
# -> docs/demo.gif   (edit docs/demo.tape for size/theme/timing)
```

Add or reorder frames by editing the `FRAMES` array in `scripts/build-demo.sh`, then
re-run `demo:build` + the VHS command.

---

## Release

CI publishes to npm when a `v*` tag is pushed:

```bash
# 1. bump version in package.json AND .claude-plugin/plugin.json
# 2. make sure it's green on Linux:
docker run --rm -v "$PWD:/app" -v /app/node_modules -w /app oven/bun:latest \
  sh -c "bun install --frozen-lockfile && bun run typecheck && bun test src"
# 3. tag + push -> .github/workflows/release.yml runs npm publish --provenance
git tag -a vX.Y.Z -m "cc-status-dash vX.Y.Z" && git push origin vX.Y.Z
```

The release workflow re-runs typecheck + tests, then `npm publish --provenance` (needs the
`NPM_TOKEN` repo secret + a public repo). See `.github/workflows/`.
