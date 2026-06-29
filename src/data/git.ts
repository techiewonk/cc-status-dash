import { execFileSync } from "node:child_process";
import type { GitInfo } from "../types.js";

// Lightweight git provider. Runs a couple of fast porcelain commands with a
// short timeout so the render path never blocks. Real implementation would add
// caching (claude-pace uses a 5s TTL); kept simple in the scaffold.

function git(args: string[], cwd: string): string | null {
  try {
    return execFileSync("git", args, {
      cwd,
      timeout: 250,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim();
  } catch {
    return null;
  }
}

export function collectGit(cwd: string): GitInfo {
  const inside = git(["rev-parse", "--is-inside-work-tree"], cwd);
  if (inside !== "true") return { isRepo: false };

  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"], cwd) ?? undefined;
  const status = git(["status", "--porcelain", "--branch"], cwd) ?? "";

  let staged = 0;
  let unstaged = 0;
  let untracked = 0;
  let ahead = 0;
  let behind = 0;

  for (const line of status.split("\n")) {
    if (line.startsWith("##")) {
      const a = /ahead (\d+)/.exec(line);
      const b = /behind (\d+)/.exec(line);
      if (a) ahead = Number(a[1]);
      if (b) behind = Number(b[1]);
      continue;
    }
    if (!line) continue;
    const x = line[0];
    const y = line[1];
    if (x === "?" && y === "?") untracked++;
    else {
      if (x !== " " && x !== "?") staged++;
      if (y !== " " && y !== "?") unstaged++;
    }
  }

  const dirty = staged + unstaged + untracked > 0;

  // Diff stats (insertions/deletions) for uncommitted changes.
  let insertions: number | undefined;
  let deletions: number | undefined;
  const shortstat = git(["diff", "--shortstat"], cwd);
  if (shortstat) {
    const ins = /(\d+) insertion/.exec(shortstat);
    const del = /(\d+) deletion/.exec(shortstat);
    insertions = ins ? Number(ins[1]) : 0;
    deletions = del ? Number(del[1]) : 0;
  }

  return { isRepo: true, branch, dirty, ahead, behind, staged, unstaged, untracked, insertions, deletions };
}
