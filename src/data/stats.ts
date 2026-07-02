import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import type { StatsInfo, StatuslineInput } from "../types.js";

// Lightweight persistent stats store. Records a small rolling sample of token /
// cost snapshots per session, plus per-session date so daily/weekly/monthly cost
// can be aggregated. Backs the token-speed, daily/weekly/monthly cost, budget,
// and projection widgets. Best-effort: never throws into the render path.

interface SessionStat {
  date: string;   // YYYY-MM-DD
  month: string;  // YYYY-MM
  startTs: number;
  lastTs: number;
  cost: number;
  messages: number;
  samples: { ts: number; total: number; input: number; output: number; cost?: number; cacheRead?: number }[];
  /** Working directory this session ran in (repo-cost aggregation). Simple cwd
   * match, not a resolved git root — good enough to bucket "sessions in this
   * project" without cross-provider coupling to the git data source. */
  repo?: string;
}
interface StatsFile { sessions: Record<string, SessionStat>; }

const MAX_SAMPLES = 40;
const MAX_SESSIONS = 200;

function statsPath(): string {
  const base = process.env.XDG_STATE_HOME
    ?? (process.platform === "win32" && process.env.LOCALAPPDATA
      ? process.env.LOCALAPPDATA
      : join(homedir(), ".local", "state"));
  return join(base, "cc-status-dash", "stats.json");
}

/** Local-calendar date key so daily/monthly buckets roll over at the user's midnight, not UTC. */
function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function load(): StatsFile {
  try {
    const p = statsPath();
    if (existsSync(p)) {
      const parsed = JSON.parse(readFileSync(p, "utf8")) as unknown;
      // Validate shape — a parseable-but-malformed file must not throw downstream.
      if (parsed && typeof parsed === "object" && typeof (parsed as StatsFile).sessions === "object" && (parsed as StatsFile).sessions) {
        return parsed as StatsFile;
      }
    }
  } catch { /* ignore */ }
  return { sessions: {} };
}

/** Atomic write (tmp + rename) so concurrent panes never read a half-written file. */
function save(data: StatsFile): void {
  try {
    const p = statsPath();
    mkdirSync(dirname(p), { recursive: true });
    const tmp = `${p}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(data));
    renameSync(tmp, p);
  } catch { /* ignore */ }
}

function tokensOf(input: StatuslineInput) {
  const u = input.context_window?.current_usage;
  const i = u?.input_tokens ?? 0;
  const o = u?.output_tokens ?? 0;
  const cacheRead = u?.cache_read_input_tokens ?? 0;
  const total = i + o + cacheRead + (u?.cache_creation_input_tokens ?? 0);
  return { input: i, output: o, total, cacheRead };
}

export function collectStats(input: StatuslineInput, windowSec = 60): StatsInfo {
  const data = load();
  const now = Date.now();
  // Guard against prototype-polluting session ids used as object keys.
  const rawId = input.session_id ?? "default";
  const id = rawId === "__proto__" || rawId === "constructor" || rawId === "prototype" ? "default" : rawId;
  const cost = input.cost?.total_cost_usd ?? 0;
  const t = tokensOf(input);
  const date = localDate(new Date());
  const month = date.slice(0, 7);
  const repo = input.workspace?.current_dir ?? input.cwd;

  let s = data.sessions[id];
  const isNew = !s;
  if (!s) { s = { date, month, startTs: now, lastTs: now, cost, messages: 0, samples: [], repo }; data.sessions[id] = s; }
  if (!Array.isArray(s.samples)) s.samples = []; // heal a malformed persisted session
  s.lastTs = now;
  s.cost = cost;
  s.date = date; s.month = month;
  if (repo) s.repo = repo; // keep a stale/missing repo current if it becomes known
  let pushed = false;
  if (s.samples.length === 0 || now - s.samples[s.samples.length - 1].ts > 1000) {
    s.samples.push({ ts: now, total: t.total, input: t.input, output: t.output, cost, cacheRead: t.cacheRead });
    if (s.samples.length > MAX_SAMPLES) s.samples = s.samples.slice(-MAX_SAMPLES);
    s.messages++;
    pushed = true;
  }

  // Prune old sessions to keep the file small.
  const ids = Object.keys(data.sessions);
  if (ids.length > MAX_SESSIONS) {
    ids.map((k) => [k, data.sessions[k].lastTs] as const)
      .sort((a, b) => a[1] - b[1])
      .slice(0, ids.length - MAX_SESSIONS)
      .forEach(([k]) => delete data.sessions[k]);
  }
  // Only rewrite the shared file when something meaningful changed (cuts ~5/6 of writes at 300ms cadence).
  if (isNew || pushed) save(data);

  // Aggregate cost across sessions.
  const weekAgo = localDate(new Date(now - 7 * 86400_000));
  let dailyCost = 0, weeklyCost = 0, monthlyCost = 0;
  // Per-repo cumulative cost (claude-code-statusline `cost_repo.sh` parity): every
  // session ever recorded (not date-scoped, unlike daily/weekly/monthly above)
  // whose cwd matches this one. Undefined when the current session has no cwd to
  // bucket by.
  let repoCost: number | undefined = repo ? 0 : undefined;
  for (const sess of Object.values(data.sessions)) {
    if (sess.date === date) dailyCost += sess.cost;
    if (sess.date >= weekAgo) weeklyCost += sess.cost;
    if (sess.month === month) monthlyCost += sess.cost;
    if (repo && sess.repo === repo) repoCost = (repoCost ?? 0) + sess.cost;
  }

  // Token speed over the rolling window (fallback: session average).
  const speed = (pick: (x: { input: number; output: number; total: number }) => number) => {
    if (s.samples.length < 2) return 0;
    const latest = s.samples[s.samples.length - 1];
    const cutoff = windowSec > 0 ? now - windowSec * 1000 : s.startTs;
    const base = s.samples.find((x) => x.ts >= cutoff) ?? s.samples[0];
    const dt = (latest.ts - base.ts) / 1000;
    if (dt <= 0) return 0;
    return Math.max(0, Math.round((pick(latest) - pick(base)) / dt));
  };

  // Block cost + cache-hit rate (current 5h window): accrued since the window
  // start, derived from cost/cacheRead-stamped samples. windowStart =
  // five_hour.resets_at − 5h. Undefined when there's no rate-limit window or no
  // suitable sample to anchor on.
  let blockCost: number | undefined;
  let blockCacheHitRate: number | undefined;
  const resetsAt = input.rate_limits?.five_hour?.resets_at;
  if (resetsAt != null) {
    const resetMs = typeof resetsAt === "number" ? (resetsAt < 1e12 ? resetsAt * 1000 : resetsAt) : Date.parse(String(resetsAt));
    if (Number.isFinite(resetMs)) {
      const windowStart = resetMs - 5 * 3600_000;
      const withCost = s.samples.filter((x) => typeof x.cost === "number");
      if (withCost.length) {
        // cost at/just-before the window start (0 if the session began inside the window)
        const before = [...withCost].reverse().find((x) => x.ts <= windowStart);
        const baseCost = before ? (before.cost ?? 0) : 0;
        blockCost = Math.max(0, cost - baseCost);
      }
      // Block-wide cache-hit ratio (claude-code-statusline `cache_efficiency.sh`
      // parity): cacheRead / (input + cacheRead), summed over the whole block via
      // the same latest-minus-baseline delta as blockCost — a ratio of block
      // totals, not a per-turn snapshot (which cache-hit-rate's default scope is).
      const withCache = s.samples.filter((x) => typeof x.cacheRead === "number");
      if (withCache.length) {
        const before = [...withCache].reverse().find((x) => x.ts <= windowStart);
        const baseCacheRead = before?.cacheRead ?? 0;
        const baseInput = before?.input ?? 0;
        const latest = withCache[withCache.length - 1];
        const cacheReadInBlock = Math.max(0, (latest.cacheRead ?? 0) - baseCacheRead);
        const inputInBlock = Math.max(0, latest.input - baseInput);
        const denom = inputInBlock + cacheReadInBlock;
        if (denom > 0) blockCacheHitRate = (cacheReadInBlock / denom) * 100;
      }
    }
  }

  return {
    sessionCost: cost,
    dailyCost, weeklyCost, monthlyCost,
    repoCost,
    blockCost,
    blockCacheHitRate,
    tokenSpeed: { input: speed((x) => x.input), output: speed((x) => x.output), total: speed((x) => x.total) },
    messageCount: s.messages,
  };
}
