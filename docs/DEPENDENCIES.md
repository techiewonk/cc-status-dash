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
- Add `tsup` (or `esbuild`/`bun build`) to bundle `src/index.ts` → one `dist/index.js`.
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
