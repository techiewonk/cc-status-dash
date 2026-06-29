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

export function collectSystem(cwd?: string): SystemInfo {
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
  };
}
