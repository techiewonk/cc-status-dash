import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { basename, isAbsolute, join } from "node:path";
import type { GitInfo } from "../types.js";

// Git provider. Fast porcelain commands with a short timeout so the render path
// never blocks. Covers the full ccstatusline git widget set.

function git(args: string[], cwd: string): string | null {
  try {
    return execFileSync("git", args, {
      cwd, timeout: 300, stdio: ["ignore", "pipe", "ignore"], encoding: "utf8",
    }).trim();
  } catch {
    return null;
  }
}

function parseRemote(url: string | null): { owner?: string; repo?: string } {
  if (!url) return {};
  const m = /[:/]([^/]+)\/([^/]+?)(?:\.git)?$/.exec(url.trim());
  return m ? { owner: m[1], repo: m[2] } : {};
}

export function collectGit(cwd: string): GitInfo {
  if (git(["rev-parse", "--is-inside-work-tree"], cwd) !== "true") return { isRepo: false };

  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"], cwd) ?? undefined;
  const sha = git(["rev-parse", "--short", "HEAD"], cwd) ?? undefined;
  const rootDir = git(["rev-parse", "--show-toplevel"], cwd) ?? undefined;
  const status = git(["status", "--porcelain", "--branch"], cwd) ?? "";

  let staged = 0, unstaged = 0, untracked = 0, conflicts = 0, ahead = 0, behind = 0;
  for (const line of status.split("\n")) {
    if (line.startsWith("##")) {
      const a = /ahead (\d+)/.exec(line);
      const b = /behind (\d+)/.exec(line);
      if (a) ahead = Number(a[1]);
      if (b) behind = Number(b[1]);
      continue;
    }
    if (!line) continue;
    const xy = line.slice(0, 2);
    const x = line[0], y = line[1];
    if (x === "?" && y === "?") { untracked++; continue; }
    if (xy === "UU" || x === "U" || y === "U" || xy === "AA" || xy === "DD") { conflicts++; continue; }
    if (x !== " " && x !== "?") staged++;
    if (y !== " " && y !== "?") unstaged++;
  }
  const dirty = staged + unstaged + untracked + conflicts > 0;

  let insertions = 0, deletions = 0;
  const shortstat = git(["diff", "--shortstat"], cwd);
  if (shortstat) {
    insertions = Number(/(\d+) insertion/.exec(shortstat)?.[1] ?? 0);
    deletions = Number(/(\d+) deletion/.exec(shortstat)?.[1] ?? 0);
  }

  const stashOut = git(["stash", "list"], cwd);
  const stash = stashOut ? stashOut.split("\n").filter(Boolean).length : 0;
  const tag = git(["describe", "--tags", "--abbrev=0"], cwd) ?? undefined;
  const lastCommitTs = git(["log", "-1", "--format=%ct"], cwd);
  const secondsSinceCommit = lastCommitTs ? Math.floor(Date.now() / 1000) - Number(lastCommitTs) : undefined;
  const submodulesOut = git(["submodule", "status"], cwd);
  const submodules = submodulesOut ? submodulesOut.split("\n").filter(Boolean).length : 0;
  const commitCountStr = git(["rev-list", "--count", "HEAD"], cwd);
  const commitCount = commitCountStr ? Number(commitCountStr) : undefined;

  const gitDir = git(["rev-parse", "--git-dir"], cwd) ?? ".git";
  const gdBase = isAbsolute(gitDir) ? gitDir : join(cwd, gitDir);
  const has = (p: string) => existsSync(join(gdBase, p));
  let operation: string | undefined;
  if (has("MERGE_HEAD")) operation = "MERGE";
  else if (has("rebase-merge") || has("rebase-apply")) operation = "REBASE";
  else if (has("CHERRY_PICK_HEAD")) operation = "CHERRY-PICK";
  else if (has("REVERT_HEAD")) operation = "REVERT";

  const origin = parseRemote(git(["remote", "get-url", "origin"], cwd));
  const upstreamUrl = git(["remote", "get-url", "upstream"], cwd);
  const upstream = parseRemote(upstreamUrl);
  const isFork = !!upstreamUrl;

  const commonDir = git(["rev-parse", "--git-common-dir"], cwd) ?? "";
  const inWorktree = gitDir !== commonDir && gitDir.includes("worktrees");
  let originalBranch: string | undefined;
  if (inWorktree && commonDir) {
    // The "original" branch is the main working tree's current branch — read it
    // from the shared common git dir (ccstatusline / claude-powerline parity).
    const commonAbs = isAbsolute(commonDir) ? commonDir : join(cwd, commonDir);
    originalBranch = git(["--git-dir", commonAbs, "symbolic-ref", "--short", "HEAD"], cwd) ?? undefined;
  }
  const worktree = inWorktree
    ? { mode: true, name: rootDir ? basename(rootDir) : undefined, branch, originalBranch }
    : { mode: false };

  return {
    isRepo: true, branch, dirty, clean: !dirty, ahead, behind,
    staged, unstaged, untracked, conflicts, insertions, deletions, sha, rootDir,
    originOwner: origin.owner, originRepo: origin.repo,
    upstreamOwner: upstream.owner, upstreamRepo: upstream.repo, isFork,
    stash, tag, secondsSinceCommit, submodules, commitCount, operation, worktree,
  };
}
