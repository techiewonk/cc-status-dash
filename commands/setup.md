---
description: Install and configure the cc-status-dash statusline for Claude Code
---

You are setting up **cc-status-dash**, a statusline + HUD for Claude Code.

Do the following:

1. Detect a JavaScript runtime. Prefer **Bun** (`bunx cc-status-dash@latest`, ~4x faster per-render startup); fall back to Node (`npx cc-status-dash@latest`). If neither, tell the user to install Bun (`npm install -g bun`) or Node LTS and stop.
2. Run the preset wizard (preset choices: `minimal`, `essential` (default), `full`, `dashboard`).
3. Write the chosen config to `~/.claude/cc-status-dash.json`.
4. Add/merge this block into the user's Claude Code `~/.claude/settings.json`:

   ```json
   {
     "statusLine": {
       "type": "command",
       "command": "bunx cc-status-dash@latest",
       "padding": 0,
       "refreshInterval": 10
     }
   }
   ```

5. Tell the user to fully restart Claude Code so the new `statusLine` config loads.

Notes:
- `refreshInterval` keeps elapsed timers (pace, activity) ticking while idle; only write it on Claude Code >= 2.1.97.
- For terminals without a Nerd Font, set `"charset": "text"` in the config.
