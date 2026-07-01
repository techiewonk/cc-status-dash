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

5. **Only if the chosen preset/config uses the `skills` widget**, offer to enable the
   skills hook cache (more accurate than the transcript tail: it also captures `/slash`
   skill invocations and survives context compaction). If the user agrees, merge these
   entries into `hooks` in `~/.claude/settings.json`, using the **same command string**
   as the statusLine above plus ` --hook`:

   ```json
   {
     "hooks": {
       "PreToolUse": [
         { "matcher": "Skill", "hooks": [{ "type": "command", "command": "bunx cc-status-dash@latest --hook" }] }
       ],
       "UserPromptSubmit": [
         { "hooks": [{ "type": "command", "command": "bunx cc-status-dash@latest --hook" }] }
       ]
     }
   }
   ```

6. Tell the user to fully restart Claude Code so the new `statusLine` (and any hooks) load.

Notes:
- `refreshInterval` keeps elapsed timers (pace, activity) ticking while idle; only write it on Claude Code >= 2.1.97.
- For terminals without a Nerd Font, set `"charset": "text"` in the config.
- The `--hook` process only records the skill invocation to a per-session cache under
  `$XDG_CACHE_HOME/cc-status-dash/skills/` (or `%LOCALAPPDATA%` / `~/.cache`); it prints
  nothing and is safe to omit — the `skills` widget falls back to the transcript scan.
