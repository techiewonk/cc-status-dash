import { readFileSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { clean as san } from "./sanitize.js";

// Skills hook cache (ccstatusline parity). The transcript tail only sees `Skill`
// tool_use blocks that are still inside the window we read; `/slash` skill
// invocations submitted as a prompt never become a tool_use at all. A tiny hook —
// wired via `--hook` on PreToolUse(Skill) + UserPromptSubmit — appends every
// invocation to a per-session JSONL so the skills widget can show an accurate,
// compaction-proof history. Claude HUD stays transcript-only; we do both and
// merge (see mergeSkills), so the feature degrades gracefully when no hook is set.

export interface SkillInvocation {
  timestamp: string;
  session_id: string;
  skill: string;
  source: string;
}

/** Cache root: $XDG_CACHE_HOME (or %LOCALAPPDATA% on Windows, else ~/.cache). */
function skillsDir(): string {
  const base = process.env.XDG_CACHE_HOME
    ?? (process.platform === "win32" && process.env.LOCALAPPDATA
      ? process.env.LOCALAPPDATA
      : join(homedir(), ".cache"));
  return join(base, "cc-status-dash", "skills");
}

/** Session ids are used in the filename; guard against path traversal / odd chars.
 * Dots are excluded from the allow-list so a `..` sequence can never survive. */
function safeSessionId(id: string): string {
  return id.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 128) || "default";
}

export function skillsFilePath(sessionId: string): string {
  return join(skillsDir(), `skills-${safeSessionId(sessionId)}.jsonl`);
}

interface HookInput {
  session_id?: string;
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: { skill?: string };
  prompt?: string;
}

/** Derive the skill name from a hook payload (Skill tool_use or a `/slash` prompt). */
export function skillFromHook(data: HookInput): string {
  if (data.hook_event_name === "PreToolUse" && data.tool_name === "Skill") {
    return typeof data.tool_input?.skill === "string" ? data.tool_input.skill : "";
  }
  if (data.hook_event_name === "UserPromptSubmit") {
    const match = /^\/([a-zA-Z0-9_:-]+)(?:\s|$)/.exec(data.prompt ?? "");
    return match?.[1] ?? "";
  }
  return "";
}

/**
 * `--hook` entry: parse a Claude Code hook payload on stdin and append the
 * invocation to the session's cache. Best-effort and side-effect-only — it
 * never prints and never throws (a hook must not disrupt the harness).
 */
export function handleSkillHook(raw: string | null | undefined): void {
  if (!raw) return;
  try {
    const data = JSON.parse(raw) as HookInput;
    const sessionId = typeof data.session_id === "string" ? data.session_id : "";
    if (!sessionId) return;
    const skill = san(skillFromHook(data)).trim();
    if (!skill) return;

    const filePath = skillsFilePath(sessionId);
    mkdirSync(join(filePath, ".."), { recursive: true });
    const entry: SkillInvocation = {
      timestamp: new Date().toISOString(),
      session_id: sessionId,
      skill,
      source: data.hook_event_name ?? "",
    };
    appendFileSync(filePath, JSON.stringify(entry) + "\n");
  } catch { /* ignore malformed hook input */ }
}

/** Chronological skill names recorded for a session (oldest → newest, with repeats). */
export function readSkillsCache(sessionId?: string): string[] {
  if (!sessionId) return [];
  const filePath = skillsFilePath(sessionId);
  if (!existsSync(filePath)) return [];
  try {
    return readFileSync(filePath, "utf8")
      .split("\n")
      .map((line) => {
        const t = line.trim();
        if (!t) return null;
        try {
          const e = JSON.parse(t) as SkillInvocation;
          return typeof e.skill === "string" ? san(e.skill) : null;
        } catch { return null; }
      })
      .filter((s): s is string => Boolean(s));
  } catch { return [] as string[]; }
}

/**
 * Merge transcript-derived skills with the hook cache into one unique list ordered
 * oldest → newest. Dedupe keeps the LAST occurrence, so `list[list.length - 1]` is
 * the most recently used skill (the cache is appended live at PreToolUse, so its
 * final entry is genuinely the latest). When no hook is installed the cache is
 * empty and this returns the transcript skills unchanged.
 */
export function mergeSkills(transcriptSkills: string[], sessionId?: string): string[] {
  const cache = readSkillsCache(sessionId);
  if (cache.length === 0) return transcriptSkills;
  const ordered = [...transcriptSkills, ...cache];
  const seen = new Set<string>();
  const out: string[] = [];
  // Walk from the end so the first time we see a name is its most-recent position;
  // collect there, then reverse to restore oldest → newest ordering.
  for (let i = ordered.length - 1; i >= 0; i--) {
    const s = ordered[i];
    if (!seen.has(s)) { seen.add(s); out.push(s); }
  }
  return out.reverse();
}
