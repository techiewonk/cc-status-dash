import { totalmem, freemem, homedir } from "node:os";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { SystemInfo } from "../types.js";

// System provider: memory, tmux, terminal width, plus Claude config facts
// (account email, MCP/hook/CLAUDE.md counts) read from ~/.claude.json and
// settings.json — honoring CLAUDE_CONFIG_DIR.

function claudeConfigDir(): string {
  return process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude");
}
function readJson(path: string): any | null {
  try { return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null; } catch { return null; }
}

/** Effective `voice.enabled` across Claude Code's 4 layered settings files
 * (project local/json > user local/json). Returns undefined when CC never
 * initialised (no file), false when files exist but none sets it. */
function readVoiceEnabled(cwd?: string): boolean | undefined {
  const dir = claudeConfigDir();
  const candidates = [
    cwd ? join(cwd, ".claude", "settings.local.json") : "",
    cwd ? join(cwd, ".claude", "settings.json") : "",
    join(dir, "settings.local.json"),
    join(dir, "settings.json"),
  ].filter(Boolean);
  let anyExisted = false;
  for (const f of candidates) {
    if (!existsSync(f)) continue;
    anyExisted = true;
    const v = readJson(f)?.voice;
    if (v && typeof v.enabled === "boolean") return v.enabled;
  }
  return anyExisted ? false : undefined;
}

/** Whether the current session has a remote-control bridge attached, by scanning
 * `<config>/sessions/<pid>.json` for a manifest matching `sessionId` with a
 * non-empty `bridgeSessionId`. Undefined when no matching manifest exists. */
function readRemoteControl(sessionId?: string): boolean | undefined {
  if (!sessionId) return undefined;
  const sessionsDir = join(claudeConfigDir(), "sessions");
  let entries: string[];
  try { entries = readdirSync(sessionsDir); } catch { return undefined; }
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    const m = readJson(join(sessionsDir, entry));
    if (m?.sessionId === sessionId) {
      return typeof m.bridgeSessionId === "string" && m.bridgeSessionId.length > 0;
    }
  }
  return undefined;
}

export function collectSystem(cwd?: string, sessionId?: string): SystemInfo {
  const total = totalmem();
  const used = total - freemem();

  const dir = claudeConfigDir();
  const dotClaude = readJson(join(homedir(), ".claude.json")) ?? readJson(join(dir, ".claude.json"));
  const settings = readJson(join(dir, "settings.json"));

  const accountEmail = dotClaude?.oauthAccount?.emailAddress ?? dotClaude?.email ?? undefined;
  const mcpConfigCount = dotClaude?.mcpServers ? Object.keys(dotClaude.mcpServers).length : undefined;
  const hooksCount = settings?.hooks ? Object.keys(settings.hooks).length : undefined;

  const countDir = (pp: string) => { try { return existsSync(pp) ? readdirSync(pp).length : 0; } catch { return 0; } };
  const rulesCount = (countDir(join(dir, "rules")) + (cwd ? countDir(join(cwd, ".cursor", "rules")) + countDir(join(cwd, ".claude", "rules")) : 0)) || undefined;
  let claudeMdCount = 0;
  if (existsSync(join(dir, "CLAUDE.md"))) claudeMdCount++;
  if (cwd && existsSync(join(cwd, "CLAUDE.md"))) claudeMdCount++;

  return {
    memTotalBytes: total,
    memUsedBytes: used,
    memUsedPct: total > 0 ? Math.round((used / total) * 100) : undefined,
    tmuxSession: process.env.TMUX ? (process.env.TMUX.split(",")[0]?.split("/").pop() ?? undefined) : undefined,
    terminalWidth: process.stdout.columns || undefined,
    accountEmail,
    claudeMdCount: claudeMdCount || undefined,
    mcpConfigCount,
    hooksCount,
    rulesCount,
    voiceEnabled: readVoiceEnabled(cwd),
    remoteControlEnabled: readRemoteControl(sessionId),
  };
}
