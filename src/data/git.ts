import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { basename, dirname, isAbsolute, join } from "node:path";
import type { GitInfo } from "../types.js";
import { clean as san } from "./sanitize.js";

// Git provider. Fast porcelain commands with a short timeout so the render path
// never blocks. Covers the full ccstatusline git widget set. Results are cached to
// disk with a short TTL so the ~300ms render cadence doesn't re-spawn git every time.

const GIT_CACHE_TTL_MS = 2000;

function gitCacheFile(cwd: string): string {
  const base = process.env.XDG_CACHE_HOME ?? join(tmpdir(), "cc-status-dash");
  return join(base, `git-${createHash("sha1").update(cwd).digest("hex").slice(0, 16)}.json`);
}
function readGitCache(file: string): GitInfo | null {
  try {
    const { ts, data } = JSON.parse(readFileSync(file, "utf8")) as { ts: number; data: GitInfo };
    if (typeof ts === "number" && Date.now() - ts < GIT_CACHE_TTL_MS) return data;
  } catch { /* miss */ }
  return null;
}
function writeGitCache(file: string, data: GitInfo): void {
  try {
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify({ ts: Date.now(), data }));
    renameSync(tmp, file);
  } catch { /* best-effort */ }
}

function git(args: string[], cwd: string): string | null {
  try {
    // --no-optional-locks: read-only commands won't take index.lock, so the
    // statusline never contends with the user's foreground git. windowsHide:
    // no console flash on Windows.
    return execFileSync("git", ["--no-optional-locks", ...args], {
      cwd, timeout: 300, stdio: ["ignore", "pipe", "ignore"], encoding: "utf8", windowsHide: true,
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
  const cf = gitCacheFile(cwd);
  const cached = readGitCache(cf);
  if (cached) return cached;
  const fresh = computeGit(cwd);
  writeGitCache(cf, fresh);
  return fresh;
}

function computeGit(cwd: string): GitInfo {
  // One coalesced rev-parse instead of 5 separate spawns. (--short HEAD is kept
  // separate because it errors on an unborn HEAD, which would abort the batch.)
  const rp = git(["rev-parse", "--is-inside-work-tree", "--show-toplevel", "--git-dir", "--git-common-dir", "--abbrev-ref", "HEAD"], cwd);
  if (!rp) return { isRepo: false };
  const lines = rp.split("\n");
  if (lines[0] !== "true") return { isRepo: false };
  const rootDir = lines[1] || undefined;
  const gitDir = lines[2] || ".git";
  const commonDir = lines[3] || "";
  const branch = lines[4] || undefined;
  const sha = git(["rev-parse", "--short", "HEAD"], cwd) ?? undefined;
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
    isRepo: true, branch: san(branch), dirty, clean: !dirty, ahead, behind,
    staged, unstaged, untracked, conflicts, insertions, deletions, sha: san(sha), rootDir: san(rootDir),
    originOwner: san(origin.owner), originRepo: san(origin.repo),
    upstreamOwner: san(upstream.owner), upstreamRepo: san(upstream.repo), isFork,
    stash, tag: san(tag), secondsSinceCommit, submodules, commitCount, operation: san(operation),
    worktree: worktree.mode
      ? { mode: true, name: san(worktree.name), branch: san(worktree.branch), originalBranch: san(worktree.originalBranch) }
      : worktree,
  };
}
