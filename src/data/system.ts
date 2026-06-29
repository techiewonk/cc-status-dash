import { totalmem, freemem } from "node:os";
import type { SystemInfo } from "../types.js";

// System provider: memory + tmux + terminal width.
export function collectSystem(): SystemInfo {
  const total = totalmem();
  const free = freemem();
  const used = total - free;
  return {
    memTotalBytes: total,
    memUsedBytes: used,
    memUsedPct: total > 0 ? Math.round((used / total) * 100) : undefined,
    tmuxSession: process.env.TMUX ? (process.env.TMUX_PANE ? undefined : undefined) : undefined,
    terminalWidth: process.stdout.columns || undefined,
  };
}
