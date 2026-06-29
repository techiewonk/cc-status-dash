import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
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
  samples: { ts: number; total: number; input: number; output: number }[];
}
interface StatsFile { sessions: Record<string, SessionStat>; }

const MAX_SAMPLES = 40;
const MAX_SESSIONS = 200;

function statsPath(): string {
  const base = process.env.XDG_STATE_HOME ?? join(homedir(), ".local", "state");
  return join(base, "cc-status-dash", "stats.json");
}

function load(): StatsFile {
  try {
    const p = statsPath();
    if (existsSync(p)) return JSON.parse(readFileSync(p, "utf8")) as StatsFile;
  } catch { /* ignore */ }
  return { sessions: {} };
}

function save(data: StatsFile): void {
  try {
    const p = statsPath();
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify(data));
  } catch { /* ignore */ }
}

function tokensOf(input: StatuslineInput) {
  const u = input.context_window?.current_usage;
  const i = u?.input_tokens ?? 0;
  const o = u?.output_tokens ?? 0;
  const total = i + o + (u?.cache_read_input_tokens ?? 0) + (u?.cache_creation_input_tokens ?? 0);
  return { input: i, output: o, total };
}

export function collectStats(input: StatuslineInput, windowSec = 60): StatsInfo {
  const data = load();
  const now = Date.now();
  const id = input.session_id ?? "default";
  const cost = input.cost?.total_cost_usd ?? 0;
  const t = tokensOf(input);
  const d = new Date();
  const date = d.toISOString().slice(0, 10);
  const month = date.slice(0, 7);

  let s = data.sessions[id];
  if (!s) { s = { date, month, startTs: now, lastTs: now, cost, messages: 0, samples: [] }; data.sessions[id] = s; }
  s.lastTs = now;
  s.cost = cost;
  s.date = date; s.month = month;
  if (s.samples.length === 0 || now - s.samples[s.samples.length - 1].ts > 1000) {
    s.samples.push({ ts: now, total: t.total, input: t.input, output: t.output });
    if (s.samples.length > MAX_SAMPLES) s.samples = s.samples.slice(-MAX_SAMPLES);
    s.messages++;
  }

  // Prune old sessions to keep the file small.
  const ids = Object.keys(data.sessions);
  if (ids.length > MAX_SESSIONS) {
    ids.map((k) => [k, data.sessions[k].lastTs] as const)
      .sort((a, b) => a[1] - b[1])
      .slice(0, ids.length - MAX_SESSIONS)
      .forEach(([k]) => delete data.sessions[k]);
  }
  save(data);

  // Aggregate cost across sessions.
  const weekAgo = new Date(now - 7 * 86400_000).toISOString().slice(0, 10);
  let dailyCost = 0, weeklyCost = 0, monthlyCost = 0;
  for (const sess of Object.values(data.sessions)) {
    if (sess.date === date) dailyCost += sess.cost;
    if (sess.date >= weekAgo) weeklyCost += sess.cost;
    if (sess.month === month) monthlyCost += sess.cost;
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

  return {
    sessionCost: cost,
    dailyCost, weeklyCost, monthlyCost,
    tokenSpeed: { input: speed((x) => x.input), output: speed((x) => x.output), total: speed((x) => x.total) },
    messageCount: s.messages,
  };
}
