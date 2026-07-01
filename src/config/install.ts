import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, copyFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

// Install-into-settings.json: writes the `statusLine` block (and, optionally, the
// managed skills hooks) into the user's Claude Code settings. The merge is a pure
// function (buildSettings) so it can be exhaustively unit-tested; the IO wrapper
// (installStatusline) is defensive — it preserves every unmanaged key, backs the
// file up before writing, writes atomically, and never throws.

/** Tag stamped on hook blocks we manage, so re-installs are idempotent (strip-then-add). */
export const HOOK_TAG = "cc-status-dash";

export interface InstallOptions {
  /** Command Claude Code should invoke for the statusline (also used, + " --hook", for hooks). */
  command: string;
  refreshInterval?: number;
  padding?: number;
  /** Also register the PreToolUse(Skill) + UserPromptSubmit skill-cache hooks. */
  installHooks?: boolean;
}

interface HookBlock { matcher?: string; _source?: string; hooks?: { type: string; command: string }[] }

/** Resolve Claude Code's settings.json ($CLAUDE_CONFIG_DIR aware, else ~/.claude). */
export function settingsPath(): string {
  const dir = process.env.CLAUDE_CONFIG_DIR
    ?? join((process.platform === "win32" ? process.env.USERPROFILE : process.env.HOME) || homedir(), ".claude");
  return join(dir, "settings.json");
}

/** Best-effort command that re-invokes THIS build. Falls back to the published bunx form. */
export function detectCommand(): string {
  const script = process.argv[1];
  if (script && /index\.(js|ts)$/.test(script)) {
    const runtime = /bun/i.test(process.execPath) ? "bun" : "node";
    // Quote to survive spaces in the path.
    return `${runtime} "${script}"`;
  }
  return "bunx cc-status-dash@latest";
}

/** Remove any hook blocks we previously wrote, dropping now-empty event arrays. */
function stripManaged(hooks: Record<string, HookBlock[]>): void {
  for (const event of Object.keys(hooks)) {
    const kept = (Array.isArray(hooks[event]) ? hooks[event] : []).filter((b) => b?._source !== HOOK_TAG);
    if (kept.length) hooks[event] = kept;
    else delete hooks[event];
  }
}

/**
 * Pure merge: returns a new settings object with our `statusLine` (and optional
 * managed hooks) folded into `existing`. Every unmanaged key is preserved; our own
 * previously-managed hooks are replaced rather than duplicated.
 */
export function buildSettings(existing: Record<string, unknown>, opts: InstallOptions): Record<string, unknown> {
  const next: Record<string, unknown> = { ...existing };

  const statusLine: Record<string, unknown> = {
    type: "command",
    command: opts.command,
    padding: opts.padding ?? 0,
  };
  if (opts.refreshInterval != null) statusLine.refreshInterval = opts.refreshInterval;
  next.statusLine = statusLine;

  // Always reconcile our managed hooks: strip stale ones first so toggling the option
  // off (installHooks:false) cleanly removes them.
  const hooks: Record<string, HookBlock[]> = {};
  const prev = existing.hooks;
  if (prev && typeof prev === "object") {
    for (const [k, v] of Object.entries(prev as Record<string, unknown>)) {
      if (Array.isArray(v)) hooks[k] = v.map((b) => ({ ...(b as HookBlock) }));
    }
  }
  stripManaged(hooks);

  if (opts.installHooks) {
    const hookCmd = `${opts.command} --hook`;
    (hooks.PreToolUse ??= []).push({ matcher: "Skill", _source: HOOK_TAG, hooks: [{ type: "command", command: hookCmd }] });
    (hooks.UserPromptSubmit ??= []).push({ _source: HOOK_TAG, hooks: [{ type: "command", command: hookCmd }] });
  }

  if (Object.keys(hooks).length) next.hooks = hooks;
  else if ("hooks" in next) delete next.hooks; // drop an emptied hooks object we created

  return next;
}

export interface InstallResult { ok: boolean; path: string; error?: string; backedUp?: boolean }

/** Read → merge → back up (.bak) → atomic write. Best-effort; returns an error string, never throws. */
export function installStatusline(opts: InstallOptions): InstallResult {
  const path = settingsPath();
  try {
    let existing: Record<string, unknown> = {};
    if (existsSync(path)) {
      try {
        const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
        if (parsed && typeof parsed === "object") existing = parsed as Record<string, unknown>;
      } catch {
        return { ok: false, path, error: "existing settings.json is not valid JSON — refusing to overwrite" };
      }
    }
    const merged = buildSettings(existing, opts);

    mkdirSync(dirname(path), { recursive: true });
    let backedUp = false;
    if (existsSync(path)) {
      try { copyFileSync(path, `${path}.bak`); backedUp = true; } catch { /* non-fatal */ }
    }
    const tmp = `${path}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(merged, null, 2) + "\n", "utf8");
    renameSync(tmp, path);
    return { ok: true, path, backedUp };
  } catch (e) {
    return { ok: false, path, error: (e as Error).message };
  }
}
