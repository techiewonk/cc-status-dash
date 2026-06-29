# Dependency plan — adopting ccstatusline's stack

ccstatusline declares **no runtime `dependencies`** — it bundles everything into one
file with `bun build` (`--target=node`), so users `npx` a single artifact with nothing
to install. cc-status-dash currently ships pure `tsc` output with zero deps. To adopt
their libraries we add a **bundler** so the hot path stays a single file and heavy TUI
deps are bundled + lazy-loaded.

**Decision legend:** ✅ adopt · 🧪 adopt for tests · 🎨 optional · 🕒 defer · ⛔ skip

## Complete coverage of all 31 ccstatusline devDependencies

### Runtime libraries (bundled into dist)
| Package | What it does | Where in cc-status-dash | Decision | Priority |
|---|---|---|---|---|
| `ink` | React renderer for terminals | the interactive config TUI (menus, live preview) | ✅ | High |
| `react` | UI runtime Ink builds on | required by Ink (TUI only, lazy-loaded) | ✅ | High |
| `react-dom` | React DOM/runtime peer for Ink | required by Ink | ✅ | High |
| `ink-select-input` | selectable list component | widget picker + preset/theme/line/style menus in the TUI | ✅ | High |
| `ink-gradient` | gradient text in Ink | TUI title/header styling | ✅ | Low |
| `react-devtools-core` | inspect Ink component tree | dev-only debugging of the TUI | 🎨 | Dev only |
| `zod` | runtime schema validation | validate `cc-status-dash.json`, version + migrations (mirrors their `Settings.ts`/`CURRENT_VERSION`); replaces hand validation in `config/load.ts` | ✅ | High |
| `strip-ansi` | strip ANSI/OSC8 sequences | accurate width math — replace the regex in `render/renderer.ts` `plainLen()` (auto-wrap) | ✅ | Med |
| `tinyglobby` | fast cross-platform glob | `config-counts` (CLAUDE.md/rules), skills/file discovery in `data/system.ts` | ✅ | Med |
| `https-proxy-agent` | HTTP(S) over a proxy | `HTTPS_PROXY` support for the future usage-API fallback | ✅ | Med |
| `pluralize` | pluralize words | nicer labels ("1 file" / "2 files") in widgets | ✅ | Low |
| `chalk` | terminal color strings | we already have `render/colors.ts` (16/256/truecolor + NO_COLOR/FORCE_COLOR); adopt only if we delete ours | 🎨 | Low |

### Testing
| Package | Where | Decision | Priority |
|---|---|---|---|
| `vitest` | unit tests for `config/mutations.ts`, providers, `contextPct`/pace math, widgets | 🧪 | High |

### Lint / code-style toolchain (all work together)
| Package | Role | Decision |
|---|---|---|
| `eslint` | the linter core | ✅ |
| `typescript-eslint` | TypeScript rules + parser | ✅ |
| `@eslint/js` | ESLint's recommended JS rules preset | ✅ |
| `@stylistic/eslint-plugin` | formatting/style rules (spacing, quotes) | ✅ |
| `globals` | predefined global var sets for eslint config | ✅ |
| `eslint-plugin-import-x` | import correctness/order linting | ✅ |
| `eslint-import-resolver-typescript` | lets the import plugin resolve TS path/`.js` specifiers | ✅ |
| `eslint-plugin-import-newlines` | enforce newline style in imports | 🎨 (style nicety) |
| `eslint-plugin-react` | React rules — only once the Ink TUI (JSX) exists | ✅ (with TUI) |
| `eslint-plugin-react-hooks` | hooks rules — for the Ink TUI | ✅ (with TUI) |

### Type definitions
| Package | Pairs with | Decision |
|---|---|---|
| `@types/react` | `react` (TUI) | ✅ with Ink |
| `@types/react-dom` | `react-dom` (TUI) | ✅ with Ink |
| `@types/pluralize` | `pluralize` | ✅ with pluralize |
| `@types/bun` | Bun runtime types | ⛔ we target Node, not Bun (use `@types/node`) |

### Build / docs / demo
| Package | Role | Decision | Notes |
|---|---|---|---|
| `typescript` | compiler | ✅ | already used; keep |
| `typedoc` | API docs from JSDoc | ✅ | Low priority |
| `remotion` | programmatic video rendering | 🕒 | only for the demo GIF/MP4 — marketing, not core |
| `@remotion/cli` | Remotion CLI | 🕒 | same as above |

> Not in their list but needed by us: a **bundler** (`tsup`/`esbuild`) and **`@types/node`**.

## Architectural prerequisite: a bundler
**Decision: the project is Bun-first — use Bun's built-in bundler** (`bun build src/index.ts --target=node --outfile=dist/index.js`). No separate bundler dependency needed. `--target=node` keeps the artifact Node-compatible so `npx`/`node` users still work. (tsdown/esbuild remain Node-only fallbacks via `build:node` = `tsc`.)
- **Lazy-`import()` the TUI** (Ink/React) only when launched interactively, so the render
  path (run every ~300ms) never loads React.
- Keep `package.json` `dependencies` empty; everything lives in `devDependencies` + bundled.

## Rollout order
1. **`tsup` bundler** + lazy TUI import — prerequisite; keeps single-file, zero runtime deps.
2. **`vitest`** — lock current behavior (mutations, providers, pace/context math) before refactors.
3. **`zod`** — validated config + `version`/migrations.
4. **Ink stack** (`ink`, `react`, `react-dom`, `ink-select-input`, `ink-gradient`, `@types/react*`, `eslint-plugin-react*`) — TUI on top of the existing `config/mutations.ts` engine.
5. **`strip-ansi`, `tinyglobby`, `pluralize` (+`@types/pluralize`)** — correctness/quality.
6. **`https-proxy-agent`** — with the usage-API fallback.
7. **eslint cluster + `typedoc`** — quality + docs. **`remotion`/@remotion/cli** last (demo), if ever.

## Notes
- ccstatusline pins `ink@6.2.0` with a local patch (`patches/ink@6.2.0.patch`); if we hit the
  same issue, apply an equivalent via `patch-package`.
- They build `--target-version=14` / `engines.node >=14`; we target Node >=18 — fine for all.

---

## Recommended alternatives (2026 research)

Theme: **prefer Node built-ins (zero dep)**, then Rust/Zig-fast tools. Many of ccstatusline's
deps now have a native Node replacement or a faster successor. This would cut our dependency
count dramatically while being faster.

| ccstatusline dep | Recommended instead | Why it's better | Decision |
|---|---|---|---|
| `tsup` (bundler) | **Bun's built-in `bun build`** (project is Bun-first); tsdown as Node-only fallback | no extra bundler dep on Bun; tsdown (Rolldown/Rust) is the Node fallback since tsup is unmaintained | ✅ bun build |
| `zod` | **valibot** | ~10× smaller bundle (1.4KB vs ~15KB), 16× faster init, similar runtime; ideal for a small CLI config schema | ✅ use valibot (zod v4 acceptable fallback) |
| `eslint` + `typescript-eslint` + `@eslint/js` + `@stylistic/eslint-plugin` + `globals` + `eslint-plugin-import-x` + `eslint-import-resolver-typescript` + `eslint-plugin-import-newlines` | **Biome** (Rust) | one tool replaces ~8 packages; lint+format ~25× faster (10k files: 0.8s vs 45s); v2.3 has 420+ rules | ✅ use Biome as primary |
| `eslint-plugin-react` / `eslint-plugin-react-hooks` | keep **only if** TUI uses React/Ink | Biome can't do hooks rules yet; add a minimal ESLint just for these two if we go Ink+JSX | 🎨 conditional |
| `strip-ansi` | **`node:util.stripVTControlCharacters`** | built into Node (zero dep); replaces our regex `plainLen()` too | ✅ use built-in |
| `chalk` | **`node:util.styleText`** (Node 20.12+) or **picocolors** | styleText is built-in and NO_COLOR/FORCE_COLOR-aware; picocolors is 14× smaller / 2× faster if a lib is wanted. We already have `colors.ts` | ✅ keep our `colors.ts` / built-in |
| `tinyglobby` | **`node:fs.glob`** (Node 22+) | built-in globbing; fall back to `tinyglobby` only for Node 18–21. We mostly use `fs.readdir` already | ✅ built-in (tinyglobby fallback) |
| `https-proxy-agent` | **global `fetch` + undici `EnvHttpProxyAgent`** | undici ships in Node; honors `HTTP(S)_PROXY`/`NO_PROXY` with no extra dep | ✅ use built-in |
| `pluralize` | **`Intl.PluralRules`** | built-in; enough for "file/files"-style labels (keep `pluralize` only for irregular plurals) | ✅ built-in |
| `vitest` | **`node:test`** (built-in) | zero-dep test runner; our suite is small. Use `vitest` only if we want richer DX/watch | ✅ node:test (vitest optional) |
| `ink` (+react/react-dom) | **@clack/prompts** for the wizard; **Ink** (or **OpenTUI**) for the live-preview editor | @clack/prompts is tiny/modern for the preset wizard; Ink stays for the stateful editor; OpenTUI (Zig core, no 30fps cap, lower memory) is the forward-looking successor if we need performance | ✅ @clack/prompts + Ink (OpenTUI later) |
| `remotion` / `@remotion/cli` | **charmbracelet VHS** | declarative `.tape` files purpose-built for terminal GIFs; far simpler than Remotion for a CLI demo (needs `ttyd`+`ffmpeg`) | ✅ use VHS |
| `typedoc` | keep **typedoc** | still the standard for TS API docs; no clearly better lighter option | ✅ keep (low priority) |
| `react-devtools-core` | keep (dev only) | only if we adopt Ink | 🎨 dev only |
| `@types/bun` | **`@types/node`** | we target Node | ⛔ skip |

### Net effect
Adopting the built-ins + Biome + tsdown + valibot collapses ccstatusline's ~31 dev-deps into
roughly: **tsdown, biome, valibot, @clack/prompts (+ ink & react only if we build the advanced
editor), @types/node** — most width/color/glob/proxy/plural/test needs are covered by Node itself.

### Revised rollout
1. **bun build --target=node** (built-in; single file, lazy-load TUI).
2. **node:test** for the mutation engine + pace/context math.
3. **valibot** config schema + version/migrations.
4. **Biome** for lint+format (replaces the whole ESLint cluster).
5. Built-ins: `util.stripVTControlCharacters` (wrap width), `util.styleText`/`colors.ts`, `fs.glob`, `EnvHttpProxyAgent`, `Intl.PluralRules`.
6. **@clack/prompts** wizard → then **Ink** (or **OpenTUI**) live-preview editor.
7. **VHS** demo GIF; **typedoc** docs.


## Adopted so far
- ✅ **Already dependency-free**: no chalk/glob/proxy/pluralize libs — we use our own `colors.ts` and Node APIs.
- ✅ **`node:util.stripVTControlCharacters`** now powers `plainLen()` (auto-wrap width) — replaced the hand regex (zero dep).
- ✅ **Tests**: `src/__tests__/mutations.test.ts` via `node:test` (run `npm run test:node`, or `bun test`). 6 passing.
- ✅ **Bun-first build**: `bun build --target=node`; `build:node` (tsc) fallback.
- ✅ **Biome** configured (`biome.json`, `npm run lint` / `npm run format`) — replaces the ESLint cluster; `bun add -d @biomejs/biome` to enable.
- 🗺️ Next (need a Bun session to install): **valibot** config schema, **@clack/prompts** wizard, **Ink** advanced editor, **VHS** demo.
