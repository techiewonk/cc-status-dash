---
description: Reconfigure cc-status-dash — presets, theme, custom colors, widgets, and layers
---

You are reconfiguring **cc-status-dash**. Edit `~/.claude/cc-status-dash.json`.

Offer the user these controls:

- **Preset**: `minimal` | `essential` | `full` | `dashboard` (up to 4 layers/lines).
- **Theme**: `hud-clean` (default) | `tokyo-night` | `gruvbox` | `nord` | `mono`.
- **Custom colors**: any semantic key under `"colors"` overrides the theme. Values may be
  a named color (`cyan`, `dim`), a 256-color index (`208`), or a hex (`#ff6600`).
- **Charset**: `unicode` (Nerd Font) | `text` (ASCII fallback).
- **Layers/lines**: each line has a `style` (`inline` | `powerline`) and an ordered
  `widgets` array; set `"showWhen": "activity"` to hide a line when nothing is running.
- **Activity widgets** (`activity.tools`, `activity.agents`, `activity.todos`) are off by
  default — add them to a line to enable the live HUD view.

Example config:

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

Run `npx cc-status-dash --list-widgets` to show all available widget ids, and
`npx cc-status-dash --list-themes` to list themes. Config reloads with no restart.
