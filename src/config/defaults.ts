import type { Config, LineConfig } from "../types.js";

// Preset catalog. Presets are the "fast path" (Claude HUD style); "custom" lets
// users hand-edit lines (ccstatusline style). Presets are grouped by line count
// (lineCount), with several variants per count so users pick the density first,
// then the flavor. Layouts support up to MAX_LAYERS lines.

/** Hard cap on layers (status lines) per layout. */
export const MAX_LAYERS = 5;

// ---- reusable building-block lines ----

// `show1M` on the model surfaces a "1M" badge automatically when the session is
// on a 1M-context model (auto-detected from the name); it culls otherwise.
const idPL = (diff = false): LineConfig => ({
  style: "powerline",
  widgets: [
    { id: "model", show1M: true },
    { id: "cwd", segments: 2 },
    { id: "git.branch", showDirty: true, showAheadBehind: true, ...(diff ? { showDiff: true } : {}) },
  ],
});

const idInline = (): LineConfig => ({
  style: "inline",
  widgets: [
    { id: "model", show1M: true },
    { id: "cwd", segments: 1 },
    { id: "git.branch", showDirty: true },
  ],
});

const modelContext = (): LineConfig => ({
  style: "inline",
  widgets: [{ id: "model", show1M: true }, { id: "context.bar", mode: "remaining" }],
});

const ctx = (): LineConfig => ({
  style: "inline",
  widgets: [{ id: "context.bar", mode: "remaining", barStyle: "blocks" }],
});

const ctxUsage = (): LineConfig => ({
  style: "inline",
  widgets: [
    { id: "context.bar", mode: "remaining", barStyle: "blocks" },
    { id: "usage.block", showPace: true },
  ],
});

const ctxCost = (): LineConfig => ({
  style: "inline",
  widgets: [
    { id: "context.bar", mode: "remaining", barStyle: "blocks" },
    { id: "cost" },
  ],
});

const usage5h = (): LineConfig => ({
  style: "inline",
  widgets: [{ id: "usage.block", showPace: true }],
});

const usagePair = (): LineConfig => ({
  style: "inline",
  widgets: [
    { id: "usage.block", showPace: true },
    { id: "usage.weekly", threshold: 0 },
  ],
});

const weeklyCost = (): LineConfig => ({
  style: "inline",
  widgets: [
    { id: "usage.weekly", threshold: 0 },
    { id: "cost" },
  ],
});

const fullMetrics = (): LineConfig => ({
  style: "inline",
  widgets: [
    { id: "context.bar", mode: "remaining", barStyle: "blocks" },
    { id: "usage.block", showPace: true },
    { id: "usage.weekly", threshold: 80 },
    { id: "cost" },
  ],
});

const tokenLine = (): LineConfig => ({
  style: "inline",
  widgets: [
    { id: "context.bar", mode: "remaining", barStyle: "blocks" },
    { id: "tokens-total" },
    { id: "tokens-per-min" },
  ],
});

const vibeLine = (): LineConfig => ({
  style: "inline",
  widgets: [{ id: "model", show1M: true }, { id: "context.bar", mode: "remaining" }, { id: "cost" }],
});

const activity = (): LineConfig => ({
  style: "inline",
  showWhen: "activity",
  widgets: [{ id: "activity.tools" }, { id: "activity.agents" }, { id: "activity.todos" }],
});

const activityTools = (): LineConfig => ({
  style: "inline",
  showWhen: "activity",
  widgets: [{ id: "activity.tools" }],
});

const activityAgentsTodos = (): LineConfig => ({
  style: "inline",
  showWhen: "activity",
  widgets: [{ id: "activity.agents" }, { id: "activity.todos" }],
});

// ---- preset catalog ----

export interface PresetDef {
  id: string;
  name: string;
  lineCount: number;
  description: string;
  lines: LineConfig[];
}

export const PRESET_CATALOG: PresetDef[] = [
  // 1 line
  { id: "minimal", name: "Minimal", lineCount: 1, description: "model + context", lines: [modelContext()] },

  // 2 lines
  { id: "essential", name: "Essential", lineCount: 2, description: "identity (inline, 1M badge) + context & 5h usage", lines: [{ style: "inline", widgets: [{ id: "model", show1M: true }, { id: "cwd", segments: 1 }, { id: "git.branch", showDirty: true, showAheadBehind: true }] }, ctxUsage()] },
  { id: "compact", name: "Compact", lineCount: 2, description: "inline identity + context & cost", lines: [idInline(), ctxCost()] },
  { id: "usage", name: "Usage focus", lineCount: 2, description: "inline identity + 5h & 7d usage", lines: [idInline(), usagePair()] },
  { id: "git", name: "Git focus", lineCount: 2, description: "powerline identity w/ diff + context & usage", lines: [idPL(true), ctxUsage()] },

  // 3 lines
  { id: "full", name: "Full", lineCount: 3, description: "identity + all metrics + live activity", lines: [idPL(true), fullMetrics(), activity()] },
  { id: "dev", name: "Developer", lineCount: 3, description: "identity w/ diff + context/usage + 5h/7d", lines: [idPL(true), ctxUsage(), usagePair()] },
  { id: "monitor", name: "Monitor", lineCount: 3, description: "inline identity + context/usage + activity", lines: [idInline(), ctxUsage(), activity()] },
  { id: "cost", name: "Cost watch", lineCount: 3, description: "identity + context/cost + 5h/7d", lines: [idPL(false), ctxCost(), usagePair()] },

  // 4 lines
  { id: "dashboard", name: "Dashboard", lineCount: 4, description: "identity / context+cost / usage / activity", lines: [idPL(true), ctxCost(), usagePair(), activity()] },
  { id: "dashboard-git", name: "Dashboard (git)", lineCount: 4, description: "identity w/ diff / context / usage / activity", lines: [idPL(true), ctx(), usagePair(), activity()] },
  { id: "dashboard-usage", name: "Dashboard (usage)", lineCount: 4, description: "identity / context / 5h / 7d+cost", lines: [idPL(false), ctx(), usage5h(), weeklyCost()] },
  { id: "dashboard-monitor", name: "Dashboard (monitor)", lineCount: 4, description: "identity / context+cost / tools / agents+todos", lines: [idPL(false), ctxCost(), activityTools(), activityAgentsTodos()] },

  // 5 lines
  { id: "max", name: "Max", lineCount: 5, description: "identity / context+cost / 5h / 7d+cost / activity", lines: [idPL(true), ctxCost(), usage5h(), weeklyCost(), activity()] },
  { id: "max-usage", name: "Max (usage)", lineCount: 5, description: "identity / context / 5h / 7d / activity", lines: [idPL(true), ctx(), usage5h(), { style: "inline", widgets: [{ id: "usage.weekly", threshold: 0 }] }, activity()] },
  { id: "max-monitor", name: "Max (monitor)", lineCount: 5, description: "identity / context / usage / tools / agents+todos", lines: [idPL(true), ctx(), usagePair(), activityTools(), activityAgentsTodos()] },
  { id: "max-cost", name: "Max (cost)", lineCount: 5, description: "identity / context / cost / 7d / activity", lines: [idPL(false), ctx(), ctxCost(), weeklyCost(), activity()] },

  // ---- extra flavors ----
  // 1 line
  { id: "vibe", name: "Vibe", lineCount: 1, description: "model (1M badge) + context + cost", lines: [vibeLine()] },
  { id: "pace", name: "Pace", lineCount: 1, description: "context + 5h pace (claude-pace style)", lines: [ctxUsage()] },
  { id: "powerline", name: "Powerline", lineCount: 1, description: "single powerline identity bar", lines: [idPL(false)] },
  // 2 lines
  { id: "hud", name: "HUD", lineCount: 2, description: "identity + live tools/agents/todos (Claude HUD style)", lines: [idInline(), activity()] },
  { id: "tokens", name: "Tokens", lineCount: 2, description: "identity + token throughput (total + tok/min)", lines: [idInline(), tokenLine()] },
  { id: "capsule", name: "Capsule", lineCount: 2, description: "capsule identity + context & usage", lines: [{ style: "capsule", widgets: [{ id: "model", show1M: true }, { id: "cwd", segments: 1 }, { id: "git.branch", showDirty: true }] }, ctxUsage()] },
  // 3 lines
  { id: "pace-focus", name: "Pace focus", lineCount: 3, description: "identity / context+pace / 7d+cost", lines: [idPL(false), ctxUsage(), weeklyCost()] },
  { id: "tokens-plus", name: "Tokens+", lineCount: 3, description: "identity / tokens / 5h+7d", lines: [idInline(), tokenLine(), usagePair()] },
];

/** id -> lines, used by config loading. */
export const PRESET_LINES: Record<string, LineConfig[]> = Object.fromEntries(
  PRESET_CATALOG.map((p) => [p.id, p.lines]),
);

/** Presets grouped by line count, for the wizard ("pick density, then flavor"). */
export function presetsByLineCount(): Record<number, PresetDef[]> {
  const out: Record<number, PresetDef[]> = {};
  for (const p of PRESET_CATALOG) (out[p.lineCount] ??= []).push(p);
  return out;
}

export const DEFAULT_COLORS: Record<string, string> = {
  model: "cyan",
  cwd: "yellow",
  git: "magenta",
  gitBranch: "cyan",
  context: "green",
  usage: "brightBlue",
  warning: "yellow",
  critical: "red",
  label: "dim",
  paceGood: "green",
  paceBad: "red",
};

export const DEFAULT_CONFIG: Config = {
  preset: "essential",
  charset: "unicode",
  theme: "hud-clean",
  colorDepth: "auto",
  refreshInterval: 10,
  separator: "│",
  minimalist: false,
  globalBold: false,
  padding: 1,
  autoWrap: false,
  lines: PRESET_LINES["essential"],
  colors: DEFAULT_COLORS,
};
