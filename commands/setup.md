---
description: Install and configure the cc-status-dash statusline for Claude Code
allowed-tools: Bash, Read, Write, AskUserQuestion
---

# Setup cc-status-dash

You are installing **cc-status-dash**, a statusline + HUD for Claude Code. Unlike
a hand-rolled shell install, this project ships a tested CLI (`--install`,
`--dry-run`, `--validate`) that does the actual settings.json merge/backup —
your job is to drive it safely, not to hand-write JSON.

## Step 1: Detect runtime

Prefer **Bun** (`bunx cc-status-dash@latest`, ~4x faster per-render startup);
fall back to **Node** (`npx cc-status-dash@latest`).

```bash
command -v bun 2>/dev/null || command -v node 2>/dev/null
```

If neither is found, tell the user to install Bun (`npm install -g bun`) or
Node LTS, then stop — do not proceed to Step 2 without a working runtime.

**Windows note**: if the current shell is Git Bash/MSYS2 (`echo $OSTYPE` returns
`msys` or `cygwin`), the runtime lookup above still works, but any command you
later construct must stay in **bash** syntax — do not switch to PowerShell
mid-flow. If the shell is genuinely PowerShell/cmd (not MSYS bash), use Node,
not Bun, for the statusLine command — Bun-on-PowerShell startup is not the
supported path for this project.

## Step 2: Prove the binary actually runs

Before touching any config, confirm the tool produces real output:

```bash
echo '{"model":{"display_name":"Test"}}' | bunx cc-status-dash@latest
```

(swap `bunx cc-status-dash@latest` for `npx cc-status-dash@latest` if using Node,
or for the local dev path if this session is running inside the plugin's own repo
— i.e. `bun src/index.ts` or `node dist/index.js`, run from the repo root)

If this errors or hangs, **stop here** — do not write to settings.json with a
command you haven't confirmed works. Debug the runtime first (see Step 6's
troubleshooting table for common causes).

## Step 3: Detect an existing statusLine before touching anything

Run:

```bash
cc-status-dash --install --dry-run
```

(use the same runtime-prefixed form validated in Step 2, e.g.
`bunx cc-status-dash@latest --install --dry-run`)

The first line tells you what's already configured:

| First line says | Meaning | Action |
|---|---|---|
| `existing statusLine: none (clean install)` | Nothing configured yet | Continue to Step 4, no confirmation needed |
| `existing statusLine: cc-status-dash (reinstall/update — safe to replace)` | Already using this tool | Continue to Step 4, no confirmation needed — this is an idempotent update |
| `existing statusLine: <tool> — ask before replacing` | A **different**, recognized statusline tool (ccstatusline, claude-hud, claude-pace, claude-powerline, claudia-statusline) is installed | **Use AskUserQuestion before continuing** (see below) |
| `existing statusLine: custom/unknown script — ask before replacing` | Some other command is configured | **Use AskUserQuestion before continuing** (see below) |

**When consent is required**, use AskUserQuestion:
- header: "Existing statusline"
- question: "Found an existing statusLine command:\n\n  {the command printed after '# command:'}\n\nWhat would you like to do?"
- options:
  - "Replace it with cc-status-dash" — `installStatusline()` (called in Step 5) automatically backs up the current `settings.json` to `settings.json.bak` before writing, so this is reversible.
  - "Keep my current statusline and stop" — make no changes, end setup here.
  - "Cancel"

If the user chooses "Keep" or "Cancel", stop immediately — do not run `--install`
for real. Tell them no changes were made.

## Step 4: Run the preset wizard

Ask (keep to ≤4 questions; use sensible defaults):

**Q1 — Density.** "How many status lines do you want?"
- 1 line — `minimal`, `oneline`, `vibe`, `powerline`
- 2 lines (Recommended) — `essential` (default), `compact`, `hud`, `capsule`
- 3 lines — `full`, `dev`, `monitor`, `cost`
- 4–5 lines — `dashboard*`, `max*`

**Q2 — Flavor.** Run `cc-status-dash --list-presets` and show the presets matching
the chosen density with their descriptions. Offer "Custom layout" to hand-pick widgets.

**Q3 — Theme.** Run `cc-status-dash --list-themes` (currently 10: `hud-clean`
(default), `tokyo-night`, `gruvbox`, `nord`, `catppuccin`, `dracula`, `one-dark`,
`rose-pine`, `hud-light`, `mono`) and list all of them — don't hand-pick a subset,
the catalog grows over time and a stale hardcoded list under-represents real options.

**Q4 — Tweaks** (multiSelect):
- **ASCII mode** → `"charset": "text"` — for terminals without a Nerd Font
- **Minimalist** → `"minimalist": true` — drop labels, e.g. `Ctx 46%` becomes just `46%`
- **Align labels** → `"alignLabels": true` — right-pads labels on separate lines so values line up, e.g. `Ctx 46%` / `5h  38%` (both 4-char labels)
- **Bold everything** → `"globalBold": true`
- **Auto-wrap to width** → `"autoWrap": true`
- **Live activity line** → append `{ "style": "inline", "showWhen": "activity", "widgets": [{"id":"activity.tool-counts"},{"id":"activity.agents"},{"id":"activity.todos"}] }`

If "Custom layout": build `lines[]` directly — each line has a `style`
(`inline` | `powerline` | `capsule` | `panel`), optional `showWhen`
(`always` | `activity`), and an ordered `widgets` array of `{ "id": "...", ...options }`.
Run `cc-status-dash --list-widgets` for the full catalog (currently 116 widgets)
— reference `docs/OPTIONS.md` for per-widget option docs.

## Step 5: Write config, then apply via the tested installer

1. Write the wizard's answers to `~/.claude/cc-status-dash.json` (this file
   reloads on every render — no restart needed for config changes).
2. Apply the statusLine block:
   ```bash
   cc-status-dash --install
   ```
   This is the **same tested code path** validated in Step 3's dry-run — it
   preserves every unrelated settings.json key, creates a `.bak` backup
   automatically, and writes atomically. Do not hand-write the `statusLine`
   JSON block yourself; always go through `--install`.

## Step 6: Optional — skills hook cache

**Only if** the chosen config uses the `skills` widget: offer to enable the
skills hook cache (more accurate than the transcript tail — it also catches
`/slash` skill invocations and survives context compaction):

```bash
cc-status-dash --install --install-hooks
```

This re-runs the same idempotent installer with `PreToolUse(Skill)` +
`UserPromptSubmit` hooks added (tagged, so re-running is safe and toggling
back off with a plain `--install` cleanly removes them). The `--hook`
subprocess only appends to a local cache file — it prints nothing and is safe
to skip; the `skills` widget falls back to scanning the transcript directly.

## Step 7: Restart and verify

Tell the user: **restart Claude Code now** (quit and run `claude` again) —
`refreshInterval`/`statusLine.command` changes need a restart; `cc-status-dash.json`
config edits do not.

Use AskUserQuestion: "Setup complete! Is the statusline showing up correctly?"
— "Yes" / "No, something's wrong"

**If no**, debug in this order:

1. **Confirm the restart happened.** Most common cause — the statusLine
   command is only re-read at Claude Code startup.
2. **Re-run the exact command manually** and read the error:
   ```bash
   cc-status-dash --install --dry-run   # confirm settings.json looks right
   echo '{}' | <the exact statusLine.command from settings.json>
   ```
3. **`cc-status-dash --validate`** — checks every config file in the
   resolution chain (XDG < `~/.claude` < project-local < `--config`) and
   reports which one is invalid, if any.
4. **Mojibake / garbled glyphs** (e.g. `â±` instead of `✱`, `â` instead of `│`)
   — this is a Windows console codepage issue (the console is decoding our
   UTF-8 output as CP1252/OEM437), not something the tool's output bytes get
   wrong. Fix: set `"charset": "text"` in `cc-status-dash.json` for pure-ASCII
   output that can't be misinterpreted by any codepage, or have the user fix
   their terminal's encoding themselves (Windows Terminal handles UTF-8
   correctly by default; legacy `conhost.exe`/old PowerShell consoles often
   don't). Do **not** have this command shell out to `chcp.com` automatically
   on every render — that was tried and explicitly rejected as a fix for this
   project (adds an unconditional subprocess spawn to the render hot path).
5. **`node`/`bun` not found**: re-check Step 1's detection; on Windows, `bun`
   may exist but not be on the PATH Claude Code's subprocess inherits — prefer
   an absolute path (`command -v bun` / `command -v node` gives one) baked
   into the statusLine command rather than a bare `bun`/`node`.
6. **Still stuck**: show the user the exact `statusLine.command` from
   settings.json and whatever error Step 7.2 produced, so they can report it.
