# Dependency plan — adopting ccstatusline's stack

ccstatusline declares **no runtime `dependencies`** — it bundles everything into one
file with `bun build` (`--target=node`), so end users `npx` a single artifact with
nothing to install. cc-status-dash currently ships pure `tsc` output with zero deps.
To adopt their libraries we should add a **bundler** so the hot path stays a single
file and heavy TUI deps are bundled + lazy-loaded.

## Architectural prerequisite: a bundler
- Add `tsup` (or `esbuild`/`bun build`) to bundle `src/index.ts` → one `dist/index.js`.
- Lazy-`import()` the TUI (Ink/React) only when launched interactively, so the render
  path (the common case, run every ~300ms) never pays for React.
- Keep `package.json` `dependencies` empty; libs live in `devDependencies` + bundled.

## Library-by-library mapping

### Adopt — high value
| Package | ccstatusline use | Use in cc-status-dash | Priority | Maps to |
|---|---|---|---|---|
| `ink` (+ patch) | the whole config TUI | Interactive config editor (live preview, menus) | **High** | Ink TUI (STATUS in-progress) |
| `react` / `react-dom` | Ink renderer | required by Ink | High | Ink TUI |
| `ink-select-input` | menu/list selection | widget picker, preset/theme/line menus | High | Ink TUI |
| `ink-gradient` | TUI title styling | nice headers in the TUI | Low | Ink TUI polish |
| `zod` | `Settings` schema + versioned migrations | runtime-validate `cc-status-dash.json`, graceful fallback, schema version bumps | **High** | replaces hand-written validation in `config/load.ts` |
| `strip-ansi` | width math | replace our regex `plainLen()` in `render/renderer.ts` (robust ANSI/OSC8 strip) | **Med** | auto-wrap correctness |
| `https-proxy-agent` | usage API over proxy | when we add the usage-API fallback, honor `HTTPS_PROXY` | Med | roadmap: usage-API fallback |
| `tinyglobby` | file globbing | `config-counts` (CLAUDE.md/rules), git/skill discovery — faster + cross-platform | Med | `data/system.ts` |
| `pluralize` | label text | nicer labels ("1 file" / "2 files") | Low | widget labels |

### Adopt — tooling / quality (helps "test and fix")
| Package | Use in cc-status-dash | Priority |
|---|---|---|
| `vitest` | real unit tests for `config/mutations.ts`, providers, widgets (we only smoke-tested) | **High** |
| `eslint` + `typescript-eslint` + `@stylistic/eslint-plugin` + `@eslint/js` | lint + consistent style; `npm run lint` | Med |
| `@types/*` (react, react-dom, pluralize, node) | types for the above | with each dep |
| `typedoc` | generate API docs from the widget/types JSDoc | Low |

### Skip / defer
| Package | Why |
|---|---|
| `remotion` / `@remotion/cli` | only renders the demo GIF/video — nice-to-have marketing, not core. Defer. |
| `react-devtools-core` | Ink dev debugging only; add ad hoc if needed. |
| `chalk` | we already have a working `render/colors.ts` (16/256/truecolor, NO_COLOR/FORCE_COLOR). Revisit only if we want to delete our color layer. |
| `@types/bun` | we target Node, not Bun. |

## Suggested rollout order
1. **Bundler (`tsup`)** + lazy TUI import — prerequisite for everything below. Keep runtime deps empty.
2. **`vitest`** — lock current behavior with unit tests before refactors (mutations engine, providers, contextPct, pace math).
3. **`zod`** — validate config + add a `version` field and migrations (mirrors ccstatusline `CURRENT_VERSION`).
4. **Ink stack** — build the TUI on top of the existing pure `config/mutations.ts` engine.
5. **`strip-ansi`, `tinyglobby`, `pluralize`** — small correctness/quality wins.
6. **`https-proxy-agent`** — alongside the usage-API fallback.
7. **eslint/typedoc** — code quality + docs. `remotion` last (demo video) if ever.

## Notes
- ccstatusline pins `ink@6.2.0` with a local patch (`patches/ink@6.2.0.patch`) — if we hit
  the same Ink issue we can apply an equivalent patch via `patch-package`.
- They build with `--target-version=14` / `engines.node >=14`; we target Node >=18, which is
  fine for all of the above.
