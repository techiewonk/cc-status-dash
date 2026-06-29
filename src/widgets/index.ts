import type { RenderContext, Segment, Widget, WidgetOptions } from "../types.js";
import { renderBar, thresholdColor, type BarStyle } from "../render/bars.js";

// ---------- small helpers ----------

function sym(unicode: string, text: string, ctx: RenderContext): string {
  return ctx.config.charset === "text" ? text : unicode;
}

function shortModel(input: RenderContext["input"]): string {
  const name = input.model?.display_name ?? input.model?.id ?? "Claude";
  return name.replace(/^Claude\s+/i, "").replace(/\s*\(1M context\)\s*/i, "").trim();
}

function contextPct(ctx: RenderContext): number | null {
  const cw = ctx.input.context_window;
  if (!cw) return null;
  if (typeof cw.used_percentage === "number") return cw.used_percentage;
  const u = cw.current_usage;
  if (u && cw.context_window_size) {
    const used = (u.input_tokens ?? 0) + (u.output_tokens ?? 0);
    return Math.round((used / cw.context_window_size) * 100);
  }
  return null;
}

function fmtCountdown(resetsAt: number | string | null | undefined): string {
  if (resetsAt == null) return "";
  const ms = (typeof resetsAt === "number" ? resetsAt : Date.parse(resetsAt)) - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ---------- widgets ----------

const model: Widget = {
  id: "model",
  category: "model",
  label: "Model",
  needs: ["stdin"],
  collect: (ctx) => shortModel(ctx.input),
  render: (data, _opts, ctx) => [
    { text: `${sym("✱", "M", ctx)} ${data}`, color: "model", bold: true },
  ],
};

const cwd: Widget = {
  id: "cwd",
  category: "system",
  label: "Working directory",
  needs: ["stdin"],
  collect: (ctx) => ctx.input.workspace?.current_dir ?? ctx.input.cwd ?? process.cwd(),
  render: (data: string, opts: WidgetOptions, _ctx) => {
    const segments = Number(opts.segments ?? 1);
    const parts = data.replace(/[\\/]+$/, "").split(/[\\/]/).filter(Boolean);
    const shown = parts.slice(-segments).join("/");
    return [{ text: shown || data, color: "cwd" }];
  },
};

const gitBranch: Widget = {
  id: "git.branch",
  category: "git",
  label: "Git branch",
  needs: ["git"],
  collect: (ctx) => ctx.data.git,
  render: (_data, opts, ctx) => {
    const g = ctx.data.git;
    if (!g?.isRepo || !g.branch) return [];
    let text = `${sym("", "git:", ctx)} ${g.branch}`.trim();
    if (opts.showDirty && g.dirty) text += " *";
    if (opts.showAheadBehind) {
      if (g.ahead) text += ` ${sym("↑", "^", ctx)}${g.ahead}`;
      if (g.behind) text += ` ${sym("↓", "v", ctx)}${g.behind}`;
    }
    if (opts.showDiff) {
      if (g.insertions) text += ` +${g.insertions}`;
      if (g.deletions) text += ` -${g.deletions}`;
    }
    return [{ text, color: "gitBranch" }];
  },
};

const contextBar: Widget = {
  id: "context.bar",
  category: "context",
  label: "Context bar",
  needs: ["stdin"],
  collect: (ctx) => contextPct(ctx),
  render: (_data, opts, ctx) => {
    const used = contextPct(ctx);
    if (used == null) return [];
    const mode = (opts.mode as string) ?? "remaining";
    const shownPct = mode === "remaining" ? 100 - used : used;
    const color = thresholdColor(used);
    const segs: Segment[] = [{ text: `Context `, color: "label" }];
    if (opts.barStyle) {
      const bar = renderBar(used, 10, opts.barStyle as BarStyle, ctx.config.charset);
      segs.push({ text: bar.filled, color });
      segs.push({ text: bar.empty, color: "barEmpty" });
      segs.push({ text: ` ` });
    }
    segs.push({ text: `${shownPct}%${mode === "remaining" ? " left" : ""}`, color });
    return segs;
  },
};

const usageBlock: Widget = {
  id: "usage.block",
  category: "usage",
  label: "5h usage (block)",
  needs: ["rate_limits"],
  collect: (ctx) => ctx.input.rate_limits?.five_hour ?? null,
  render: (_data, opts, ctx) => {
    const w = ctx.input.rate_limits?.five_hour;
    if (!w || typeof w.used_percentage !== "number") return [];
    const pct = w.used_percentage;
    const segs: Segment[] = [
      { text: `5h `, color: "label" },
      { text: `${pct}%`, color: "usage" },
    ];
    if (opts.showPace && w.resets_at != null) {
      const resetMs = (typeof w.resets_at === "number" ? w.resets_at : Date.parse(String(w.resets_at))) - Date.now();
      const WINDOW = 5 * 60 * 60 * 1000;
      const elapsedPct = ((WINDOW - resetMs) / WINDOW) * 100;
      const delta = Math.round(pct - elapsedPct);
      if (Number.isFinite(delta)) {
        const ahead = delta <= 0; // using slower than the clock = headroom
        segs.push({
          text: ` ${ahead ? sym("⇣", "v", ctx) : sym("⇡", "^", ctx)}${Math.abs(delta)}%`,
          color: ahead ? "paceGood" : "paceBad",
        });
      }
    }
    return segs;
  },
};

const usageWeekly: Widget = {
  id: "usage.weekly",
  category: "usage",
  label: "7d usage (weekly)",
  needs: ["rate_limits"],
  collect: (ctx) => ctx.input.rate_limits?.seven_day ?? null,
  render: (_data, opts, ctx) => {
    const w = ctx.input.rate_limits?.seven_day;
    if (!w || typeof w.used_percentage !== "number") return [];
    const threshold = Number(opts.threshold ?? 0);
    if (w.used_percentage < threshold) return [];
    const color = w.used_percentage >= 85 ? "critical" : w.used_percentage >= 60 ? "warning" : "usage";
    return [
      { text: `7d `, color: "label" },
      { text: `${w.used_percentage}%`, color },
    ];
  },
};

const cost: Widget = {
  id: "cost",
  category: "usage",
  label: "Session cost",
  needs: ["stdin"],
  collect: (ctx) => ctx.input.cost?.total_cost_usd ?? null,
  render: (_data, _opts, ctx) => {
    const c = ctx.input.cost?.total_cost_usd;
    if (typeof c !== "number") return [];
    return [{ text: `$${c.toFixed(2)}`, color: "paceGood" }];
  },
};

// ---- HUD activity widgets (off by default; only render when there's activity) ----

const activityTools: Widget = {
  id: "activity.tools",
  category: "activity",
  label: "Tool activity",
  needs: ["transcript"],
  collect: (ctx) => ctx.data.transcript?.recentTools ?? [],
  render: (_data, _opts, ctx) => {
    const tools = ctx.data.transcript?.recentTools ?? [];
    if (!tools.length) return [];
    const check = sym("✓", "ok", ctx);
    const out: Segment[] = [];
    tools.slice(0, 3).forEach((t, i) => {
      if (i > 0) out.push({ text: " │ ", color: "label" });
      out.push({ text: `${check} ${t.name}`, color: "doneTool" });
      if (t.target) out.push({ text: ` ${t.target}`, color: "label" });
    });
    return out;
  },
};

const activityAgents: Widget = {
  id: "activity.agents",
  category: "activity",
  label: "Agent activity",
  needs: ["transcript"],
  collect: (ctx) => ctx.data.transcript?.agents ?? [],
  render: (_data, _opts, ctx) => {
    const agents = ctx.data.transcript?.agents ?? [];
    if (!agents.length) return [];
    const out: Segment[] = [];
    agents.forEach((a, i) => {
      if (i > 0) out.push({ text: "  " });
      out.push({ text: `${sym("◐", ">", ctx)} ${a.name}`, color: "agent" });
      if (a.model) out.push({ text: `[${a.model}]`, color: "label" });
    });
    return out;
  },
};

const activityTodos: Widget = {
  id: "activity.todos",
  category: "activity",
  label: "Todo progress",
  needs: ["transcript"],
  collect: (ctx) => ctx.data.transcript?.todos ?? null,
  render: (_data, _opts, ctx) => {
    const t = ctx.data.transcript?.todos;
    if (!t || t.total === 0) return [];
    const label = t.current ? t.current : "Tasks";
    return [
      { text: `${sym("▸", ">", ctx)} ${label} `, color: "todo" },
      { text: `(${t.completed}/${t.total})`, color: "label" },
    ];
  },
};

// ---------- registry ----------

export const WIDGETS: Record<string, Widget> = {};
for (const w of [
  model,
  cwd,
  gitBranch,
  contextBar,
  usageBlock,
  usageWeekly,
  cost,
  activityTools,
  activityAgents,
  activityTodos,
]) {
  WIDGETS[w.id] = w;
}

export function getWidget(id: string): Widget | undefined {
  return WIDGETS[id];
}

export function listWidgets(): Widget[] {
  return Object.values(WIDGETS);
}
