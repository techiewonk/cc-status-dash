# cc-status-dash

A feature-rich statusline **and** HUD dashboard for Claude Code.

> ccstatusline's brain, Claude HUD's face.

It combines the two most popular Claude Code statusline tools:

- **Config pattern from [ccstatusline](https://github.com/sirmalloc/ccstatusline)** — a widget pipeline: ordered `widgets[]` per line, each with its own options; multiple lines; one JSON config; an Ink TUI editor (planned) with a fuzzy widget picker.
- **Theme / clean look from [Claude HUD](https://github.com/jarrodwatts/claude-hud)** — a restrained default palette, preset-first onboarding, context-health framing, and live tool / agent / todo activity lines.

Plus the best ideas from the wider ecosystem: **pace delta** (burn vs. time-left) from claude-pace, multiple bar styles from claude-powerline, and a 4-layer dashboard layout.

## Status

Scaffold (v0.1.0) with 97 widgets across model, context, tokens, usage, git, system, activity, and custom categories. See [docs/PARITY.md](docs/PARITY.md) for the full feature-by-feature parity matrix against all 7 surveyed statuslines. The render pipeline, widget registry, themes, config loading, and several widgets work today. The Ink TUI, full git/usage widget set, and SQLite stats are on the roadmap (see `docs/ANALYSIS.md`).

## Install

### As a Claude Code plugin

```
/plugin marketplace add <owner>/cc-status-dash
/plugin install cc-status-dash
/cc-status-dash:setup
```

### Via npx (manual)

Add to `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "npx -y cc-status-dash@latest",
    "padding": 0,
    "refreshInterval": 10
  }
}
```

## Presets

| Preset | Layers | Shows |
|---|---|---|
| `minimal` | 1 | model + context |
| `essential` (default) | 2 | model, path, git · context bar + 5h usage with pace |
| `full` | 3 | essential + weekly usage, cost, and a live activity line |
| `dashboard` | 4 | identity · context+cost · 5h+7d usage · activity |

## Configuration

Config lives at `~/.claude/cc-status-dash.json` (also `./.cc-status-dash.json`, XDG, or `--config <path>`). Resolution order: CLI flags > env > project > user > XDG > defaults. Reloads with no restart.

```json
{
  "preset": "custom",
  "theme": "tokyo-night",
  "charset": "unicode",
  "colors": { "model": "#7dcfff", "context": "#9ece6a" },
  "lines": [
    { "style": "powerline", "widgets": [
      { "id": "model" },
      { "id": "cwd", "segments": 2 },
      { "id": "git.branch", "showDirty": true, "showAheadBehind": true, "showDiff": true }
    ]},
    { "style": "inline", "widgets": [
      { "id": "context.bar", "mode": "remaining", "barStyle": "blocks" },
      { "id": "usage.block", "showPace": true },
      { "id": "cost" }
    ]},
    { "style": "inline", "showWhen": "activity", "widgets": [
      { "id": "activity.tools" }, { "id": "activity.agents" }, { "id": "activity.todos" }
    ]}
  ]
}
```

### Themes & custom colors

Built-in themes: `hud-clean` (default), `tokyo-night`, `gruvbox`, `nord`, `mono`. Pick one with `"theme"` or `--theme`. Override any individual color under `"colors"` — values can be a named color (`cyan`, `dim`), a 256-index (`208`), or hex (`#ff6600`). Theme is the base; your custom colors layer on top.

```
npx cc-status-dash --list-themes
npx cc-status-dash --list-widgets
```

`NO_COLOR` is honored; `charset: "text"` gives ASCII-only output for terminals without a Nerd Font.

## Develop

```
npm install
npm run build
npm run demo        # renders sample-input.json
echo '{ ... }' | node dist/index.js
```

## Architecture

```
stdin JSON + transcript JSONL
        │
   providers (git, transcript, system) — only what the config needs
        │
   widget registry  (collect → render → Segment[])
        │
   layout engine (lines → inline | powerline)
        │
   color layer (theme palette + custom colors + NO_COLOR)
        │
      stdout
```

See `src/` — `types.ts` (schema, grounded in real Claude Code stdin), `widgets/`, `render/`, `themes/`, `config/`, `data/`.

## License

MIT
