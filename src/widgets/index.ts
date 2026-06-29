import { execSync } from "node:child_process";
import { basename } from "node:path";
import type { DataSource, RenderContext, Segment, Widget, WidgetCategory, WidgetOptions } from "../types.js";
import { renderBar, thresholdColor, type BarStyle } from "../render/bars.js";

// ---------------- helpers ----------------

function sym(unicode: string, text: string, ctx: RenderContext): string {
  return ctx.config.charset === "text" ? text : unicode;
}
function fmtTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}
function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}
function fmtCountdown(resetsAt: number | string | null | undefined): string | null {
  if (resetsAt == null) return null;
  const ms = (typeof resetsAt === "number" ? resetsAt : Date.parse(resetsAt)) - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return fmtDuration(ms);
}
function usageTokens(ctx: RenderContext) {
  const u = ctx.input.context_window?.current_usage;
  const st = ctx.data.transcript?.sessionTokens;
  const input = u?.input_tokens ?? st?.input ?? 0;
  const output = u?.output_tokens ?? st?.output ?? 0;
  const cacheRead = u?.cache_read_input_tokens ?? st?.cacheRead ?? 0;
  const cacheCreation = u?.cache_creation_input_tokens ?? st?.cacheCreation ?? 0;
  return { input, output, cacheRead, cacheCreation, total: input + output + cacheRead + cacheCreation };
}
function modelLimit(ctx: RenderContext): number | undefined {
  const size = ctx.input.context_window?.context_window_size;
  if (size) return size;
  const lim = ctx.config.modelContextLimits;
  if (!lim) return undefined;
  const id = (ctx.input.model?.id ?? ctx.input.model?.display_name ?? "").toLowerCase();
  if (/\[1m\]|1m context/.test(id)) return 1_000_000;
  if (id.includes("opus")) return lim.opus ?? lim.default;
  if (id.includes("sonnet")) return lim.sonnet ?? lim.default;
  if (id.includes("haiku")) return lim.haiku ?? lim.default;
  return lim.default;
}
function contextPct(ctx: RenderContext): number | null {
  const cw = ctx.input.context_window;
  if (cw && typeof cw.used_percentage === "number") return cw.used_percentage;
  const limit = modelLimit(ctx);
  if (limit) return Math.round((usageTokens(ctx).total / limit) * 100);
  return null;
}
function shortModel(ctx: RenderContext): string {
  const name = ctx.input.model?.display_name ?? ctx.input.model?.id ?? "Claude";
  return name.replace(/^Claude\s+/i, "").replace(/\s*\(1M context\)\s*/i, "").trim();
}

/** label+value honoring minimalist mode (drops the dim label). */
function lv(label: string | null, value: string | number | null | undefined, color: string, ctx: RenderContext): Segment[] {
  if (value == null || value === "") return [];
  if (ctx.config.minimalist || !label) return [{ text: String(value), color }];
  return [{ text: `${label} `, color: "label" }, { text: String(value), color }];
}

function w(id: string, category: WidgetCategory, label: string, needs: DataSource[], render: Widget["render"]): Widget {
  return { id, category, label, needs, collect: () => null, render };
}

const ALL: Widget[] = [];
const add = (x: Widget) => { ALL.push(x); };

// ---------------- model / session ----------------

add(w("model", "model", "Model", ["stdin"], (_d, _o, ctx) =>
  [{ text: `${sym("✱", "M", ctx)} ${shortModel(ctx)}`, color: "model", bold: true }]));
add(w("version", "system", "Claude Code version", ["stdin"], (_d, _o, ctx) =>
  lv(null, ctx.input.version ? `v${ctx.input.version}` : null, "label", ctx)));
add(w("output-style", "system", "Output style", ["stdin"], (_d, _o, ctx) => {
  const os = ctx.input.output_style;
  const name = typeof os === "string" ? os : os?.name;
  return lv("style", name, "label", ctx);
}));
add(w("session-name", "system", "Session name", ["transcript"], (_d, _o, ctx) =>
  lv(null, ctx.data.transcript?.sessionName, "model", ctx)));
add(w("claude-session-id", "system", "Session id", ["stdin"], (_d, _o, ctx) =>
  lv(sym("⌗", "#", ctx), ctx.input.session_id?.slice(0, 8), "label", ctx)));
add(w("thinking-effort", "model", "Thinking effort", ["stdin"], (_d, _o, ctx) => {
  const e = ctx.input.effort;
  const level = typeof e === "string" ? e : e?.level;
  return lv(sym("✦", "T", ctx), level ?? undefined, "usage", ctx);
}));
add(w("compaction-counter", "context", "Compaction count", ["transcript"], (_d, o, ctx) => {
  const c = ctx.data.transcript?.compactionCount ?? 0;
  if (c === 0 && o.hideWhenZero !== false) return [];
  return lv(sym("⟳", "compact", ctx), c, "label", ctx);
}));

// ---------------- context ----------------

add(w("context.bar", "context", "Context bar", ["stdin"], (_d, opts, ctx) => {
  const used = contextPct(ctx);
  if (used == null) return [];
  const mode = (opts.mode as string) ?? "remaining";
  const shown = mode === "remaining" ? 100 - used : used;
  const color = thresholdColor(used);
  const segs: Segment[] = ctx.config.minimalist ? [] : [{ text: "Context ", color: "label" }];
  if (opts.barStyle) {
    const bar = renderBar(used, 10, opts.barStyle as BarStyle, ctx.config.charset);
    segs.push({ text: bar.filled, color }, { text: bar.empty, color: "barEmpty" }, { text: " " });
  }
  segs.push({ text: `${shown}%${mode === "remaining" && !ctx.config.minimalist ? " left" : ""}`, color });
  return segs;
}));
add(w("context-percentage", "context", "Context %", ["stdin"], (_d, _o, ctx) => {
  const u = contextPct(ctx);
  return u == null ? [] : lv("Ctx", `${u}%`, thresholdColor(u), ctx);
}));
add(w("context-percentage-usable", "context", "Context % (usable)", ["stdin"], (_d, opts, ctx) => {
  const cw = ctx.input.context_window;
  if (!cw?.context_window_size) return [];
  const buffer = Number(opts.autocompactBuffer ?? 33000);
  const used = usageTokens(ctx).total;
  const usablePct = Math.min(100, Math.round((used / Math.max(1, cw.context_window_size - buffer)) * 100));
  return lv("Ctx", `${usablePct}%`, thresholdColor(usablePct), ctx);
}));
add(w("context-length", "context", "Context length (tokens)", ["stdin"], (_d, _o, ctx) => {
  const t = usageTokens(ctx).total;
  return t ? lv("Ctx", fmtTokens(t), "usage", ctx) : [];
}));
add(w("context-window", "context", "Context window size", ["stdin"], (_d, _o, ctx) => {
  const size = modelLimit(ctx);
  return size ? lv("Win", fmtTokens(size), "label", ctx) : [];
}));

// ---------------- tokens / cache ----------------

const tokenWidget = (id: string, label: string, pick: (t: ReturnType<typeof usageTokens>) => number) =>
  add(w(id, "tokens", label, ["stdin"], (_d, _o, ctx) => {
    const v = pick(usageTokens(ctx));
    return v ? lv(label.replace(/ tokens$/, ""), fmtTokens(v), "usage", ctx) : [];
  }));
tokenWidget("tokens-input", "Input tokens", (t) => t.input);
tokenWidget("tokens-output", "Output tokens", (t) => t.output);
tokenWidget("tokens-cached", "Cached tokens", (t) => t.cacheRead + t.cacheCreation);
tokenWidget("tokens-total", "Total tokens", (t) => t.total);
tokenWidget("cache-read", "Cache read", (t) => t.cacheRead);
tokenWidget("cache-write", "Cache write", (t) => t.cacheCreation);
add(w("cache-hit-rate", "tokens", "Cache hit rate", ["stdin"], (_d, _o, ctx) => {
  const t = usageTokens(ctx);
  const denom = t.input + t.cacheRead;
  if (denom === 0) return [];
  return lv("Cache", `${Math.round((t.cacheRead / denom) * 100)}%`, "context", ctx);
}));

// ---------------- usage / cost / timers ----------------

const costWidget = (id: string) => add(w(id, "usage", "Session cost", ["stdin"], (_d, _o, ctx) => {
  const c = ctx.input.cost?.total_cost_usd;
  return typeof c === "number" ? [{ text: `$${c.toFixed(2)}`, color: "paceGood" }] : [];
}));
costWidget("cost"); costWidget("session-cost");

const usageWindow = (id: string, label: string, key: "five_hour" | "seven_day", critAt = 85) =>
  add(w(id, "usage", label, ["rate_limits"], (_d, opts, ctx) => {
    const win = ctx.input.rate_limits?.[key];
    if (!win || typeof win.used_percentage !== "number") return [];
    const pct = win.used_percentage;
    if (pct < Number(opts.threshold ?? 0)) return [];
    const color = pct >= critAt ? "critical" : pct >= 60 ? "warning" : "usage";
    const segs = lv(label, `${pct}%`, color, ctx);
    if (opts.showPace && win.resets_at != null) {
      const remMs = (typeof win.resets_at === "number" ? win.resets_at : Date.parse(String(win.resets_at))) - Date.now();
      const WINDOW = (key === "five_hour" ? 5 * 3600 : 7 * 24 * 3600) * 1000;
      const elapsedPct = ((WINDOW - remMs) / WINDOW) * 100;
      const delta = Math.round(pct - elapsedPct);
      if (Number.isFinite(delta)) {
        const ahead = delta <= 0;
        segs.push({ text: ` ${ahead ? sym("⇣", "v", ctx) : sym("⇡", "^", ctx)}${Math.abs(delta)}%`, color: ahead ? "paceGood" : "paceBad" });
      }
    }
    return segs;
  }));
usageWindow("usage.block", "5h", "five_hour");
usageWindow("usage.weekly", "7d", "seven_day");
usageWindow("session-usage", "5h", "five_hour");
usageWindow("weekly-usage", "7d", "seven_day");

const timerWidget = (id: string, label: string, key: "five_hour" | "seven_day", elapsed: boolean) =>
  add(w(id, "usage", label, ["rate_limits"], (_d, _o, ctx) => {
    const win = ctx.input.rate_limits?.[key];
    if (!win?.resets_at) return [];
    if (!elapsed) return lv(sym("⏱", label, ctx), fmtCountdown(win.resets_at) ?? undefined, "label", ctx);
    const remMs = (typeof win.resets_at === "number" ? win.resets_at : Date.parse(String(win.resets_at))) - Date.now();
    const WINDOW = (key === "five_hour" ? 5 * 3600 : 7 * 24 * 3600) * 1000;
    return lv(sym("⏱", label, ctx), fmtDuration(WINDOW - remMs), "label", ctx);
  }));
timerWidget("block-timer", "Block", "five_hour", true);
timerWidget("reset-timer", "Resets", "five_hour", false);
timerWidget("weekly-reset-timer", "7d resets", "seven_day", false);

add(w("session-clock", "system", "Clock", ["stdin"], (_d, _o, ctx) =>
  lv(null, new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), "label", ctx)));

// ---------------- git ----------------

const gitText = (id: string, label: string, color: string, pick: (g: NonNullable<RenderContext["data"]["git"]>, ctx: RenderContext, opts: WidgetOptions) => string | number | null | undefined) =>
  add(w(id, "git", label, ["git"], (_d, opts, ctx) => {
    const g = ctx.data.git;
    if (!g?.isRepo) return [];
    const v = pick(g, ctx, opts);
    return v == null || v === "" ? [] : lv(label, v, color, ctx);
  }));

add(w("git.branch", "git", "Git branch", ["git"], (_d, opts, ctx) => {
  const g = ctx.data.git;
  if (!g?.isRepo || !g.branch) return [];
  let text = `${sym("", "git:", ctx)} ${g.branch}`.trim();
  if (opts.showDirty && g.dirty) text += " *";
  if (opts.showAheadBehind) { if (g.ahead) text += ` ${sym("↑", "^", ctx)}${g.ahead}`; if (g.behind) text += ` ${sym("↓", "v", ctx)}${g.behind}`; }
  if (opts.showDiff) { if (g.insertions) text += ` +${g.insertions}`; if (g.deletions) text += ` -${g.deletions}`; }
  if (opts.link && g.originOwner && g.originRepo && g.branch) {
    const url = `https://github.com/${g.originOwner}/${g.originRepo}/tree/${g.branch}`;
    text = `\u001b]8;;${url}\u0007${text}\u001b]8;;\u0007`;
  }
  return [{ text, color: "gitBranch" }];
}));
add(w("git-status", "git", "Git status", ["git"], (_d, _o, ctx) => {
  const g = ctx.data.git;
  if (!g?.isRepo) return [];
  if (g.clean) return [{ text: sym("✓", "=", ctx), color: "context" }];
  const parts: string[] = [];
  if (g.staged) parts.push(`+${g.staged}`);
  if (g.unstaged) parts.push(`~${g.unstaged}`);
  if (g.untracked) parts.push(`?${g.untracked}`);
  if (g.conflicts) parts.push(`!${g.conflicts}`);
  return [{ text: `${sym("●", "*", ctx)} ${parts.join(" ")}`.trim(), color: "warning" }];
}));
add(w("git-changes", "git", "Git changes (+/-)", ["git"], (_d, _o, ctx) => {
  const g = ctx.data.git;
  if (!g?.isRepo) return [];
  const segs: Segment[] = [];
  if (g.insertions) segs.push({ text: `+${g.insertions}`, color: "context" });
  if (g.deletions) segs.push({ text: `${segs.length ? " " : ""}-${g.deletions}`, color: "critical" });
  return segs;
}));
gitText("git-insertions", "Insertions", "context", (g) => (g.insertions ? `+${g.insertions}` : null));
gitText("git-deletions", "Deletions", "critical", (g) => (g.deletions ? `-${g.deletions}` : null));
gitText("git-staged", "Staged", "context", (g) => g.staged || null);
gitText("git-unstaged", "Unstaged", "warning", (g) => g.unstaged || null);
gitText("git-untracked", "Untracked", "label", (g) => g.untracked || null);
gitText("git-staged-files", "Staged files", "context", (g) => (g.staged ? `${g.staged} staged` : null));
gitText("git-unstaged-files", "Unstaged files", "warning", (g) => (g.unstaged ? `${g.unstaged} unstaged` : null));
gitText("git-untracked-files", "Untracked files", "label", (g) => (g.untracked ? `${g.untracked} untracked` : null));
gitText("git-clean-status", "Clean status", "context", (g, ctx) => (g.clean ? sym("✓ clean", "clean", ctx) : sym("● dirty", "dirty", ctx)));
gitText("git-ahead-behind", "Ahead/behind", "gitBranch", (g, ctx) => {
  const p: string[] = [];
  if (g.ahead) p.push(`${sym("↑", "^", ctx)}${g.ahead}`);
  if (g.behind) p.push(`${sym("↓", "v", ctx)}${g.behind}`);
  return p.join(" ") || null;
});
gitText("git-conflicts", "Conflicts", "critical", (g) => g.conflicts || null);
gitText("git-sha", "Commit SHA", "label", (g, ctx) => (g.sha ? `${sym("", "#", ctx)}${g.sha}`.trim() : null));
gitText("git-root-dir", "Repo root dir", "cwd", (g) => (g.rootDir ? basename(g.rootDir) : null));
gitText("git-origin-owner", "Origin owner", "label", (g) => g.originOwner);
gitText("git-origin-repo", "Origin repo", "label", (g) => g.originRepo);
gitText("git-origin-owner-repo", "Origin", "label", (g) => (g.originOwner && g.originRepo ? `${g.originOwner}/${g.originRepo}` : null));
gitText("git-upstream-owner", "Upstream owner", "label", (g) => g.upstreamOwner);
gitText("git-upstream-repo", "Upstream repo", "label", (g) => g.upstreamRepo);
gitText("git-upstream-owner-repo", "Upstream", "label", (g) => (g.upstreamOwner && g.upstreamRepo ? `${g.upstreamOwner}/${g.upstreamRepo}` : null));
gitText("git-is-fork", "Is fork", "label", (g) => (g.isFork ? "fork" : null));
gitText("git-worktree", "Worktree", "label", (g) => g.worktree?.name);
gitText("worktree-name", "Worktree name", "label", (g) => g.worktree?.name);
gitText("worktree-branch", "Worktree branch", "gitBranch", (g) => g.worktree?.branch);
gitText("worktree-mode", "Worktree mode", "label", (g) => (g.worktree?.mode ? "worktree" : null));

// ---------------- filesystem / system ----------------

const cwdWidget = (id: string) => add(w(id, "system", "Working directory", ["stdin"], (_d, opts, ctx) => {
  const data = ctx.input.workspace?.current_dir ?? ctx.input.cwd ?? process.cwd();
  const parts = data.replace(/[\\/]+$/, "").split(/[\\/]/).filter(Boolean);
  const style = (opts.style as string) ?? "segments";
  let out: string;
  if (style === "full") out = data;
  else if (style === "basename") out = parts[parts.length - 1] ?? data;
  else if (style === "fish") out = parts.map((p, i) => (i < parts.length - 1 ? p.slice(0, 1) : p)).join("/");
  else out = parts.slice(-Number(opts.segments ?? 1)).join("/") || data;
  return [{ text: out, color: "cwd" }];
}));
cwdWidget("cwd"); cwdWidget("current-working-dir");

add(w("free-memory", "system", "Free memory", ["system"], (_d, _o, ctx) => {
  const s = ctx.data.system;
  if (!s?.memTotalBytes) return [];
  const gb = (b: number) => (b / 1024 ** 3).toFixed(1);
  return lv("Mem", `${gb(s.memUsedBytes ?? 0)}/${gb(s.memTotalBytes)}G`, s.memUsedPct && s.memUsedPct > 85 ? "warning" : "label", ctx);
}));
add(w("terminal-width", "system", "Terminal width", ["system"], (_d, _o, ctx) =>
  lv("W", ctx.data.system?.terminalWidth, "label", ctx)));

// ---------------- custom ----------------

add(w("custom-text", "custom", "Custom text", [], (_d, opts, _ctx) => {
  const t = opts.text as string | undefined;
  return t ? [{ text: t, color: (opts.color as string) ?? "label" }] : [];
}));
add(w("custom-symbol", "custom", "Custom symbol", [], (_d, opts, _ctx) => {
  const s = opts.symbol as string | undefined;
  return s ? [{ text: s, color: (opts.color as string) ?? "label" }] : [];
}));
add(w("custom-command", "custom", "Custom command", [], (_d, opts, _ctx) => {
  const cmd = opts.command as string | undefined;
  if (!cmd) return [];
  try {
    const out = execSync(cmd, { timeout: 300, stdio: ["ignore", "pipe", "ignore"], encoding: "utf8" }).trim();
    return out ? [{ text: out, color: (opts.color as string) ?? "label" }] : [];
  } catch { return []; }
}));
add(w("link", "custom", "Link (OSC8)", [], (_d, opts, _ctx) => {
  const url = opts.url as string | undefined;
  const text = (opts.label as string | undefined) ?? url;
  if (!url || !text) return [];
  return [{ text: `]8;;${url}${text}]8;;`, color: (opts.color as string) ?? "gitBranch" }];
}));

// ---------------- HUD activity ----------------

add(w("activity.tools", "activity", "Tool activity", ["transcript"], (_d, _o, ctx) => {
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
}));
add(w("activity.agents", "activity", "Agent activity", ["transcript"], (_d, _o, ctx) => {
  const agents = ctx.data.transcript?.agents ?? [];
  if (!agents.length) return [];
  const out: Segment[] = [];
  agents.forEach((a, i) => {
    if (i > 0) out.push({ text: "  " });
    out.push({ text: `${sym("◐", ">", ctx)} ${a.name}`, color: "agent" });
    if (a.model) out.push({ text: `[${a.model}]`, color: "label" });
  });
  return out;
}));
add(w("activity.todos", "activity", "Todo progress", ["transcript"], (_d, _o, ctx) => {
  const t = ctx.data.transcript?.todos;
  if (!t || t.total === 0) return [];
  return [{ text: `${sym("▸", ">", ctx)} ${t.current ?? "Tasks"} `, color: "todo" }, { text: `(${t.completed}/${t.total})`, color: "label" }];
}));
add(w("skills", "activity", "Skills used", ["transcript"], (_d, opts, ctx) => {
  const sk = ctx.data.transcript?.skills ?? [];
  if (!sk.length) return [];
  const mode = (opts.mode as string) ?? "count";
  if (mode === "last") return lv(sym("✦", "skill", ctx), sk[sk.length - 1], "todo", ctx);
  if (mode === "list") return lv(sym("✦", "skills", ctx), sk.slice(-3).join(", "), "todo", ctx);
  return lv(sym("✦", "skills", ctx), sk.length, "todo", ctx);
}));
add(w("mcp-count", "activity", "MCP servers", ["transcript"], (_d, _o, ctx) => {
  const m = ctx.data.transcript?.mcpServers ?? [];
  return m.length ? lv("MCP", m.length, "label", ctx) : [];
}));
add(w("session-duration", "activity", "Session duration", ["stdin"], (_d, _o, ctx) => {
  const ms = ctx.input.cost?.total_duration_ms;
  return ms ? lv(sym("⏱", "dur", ctx), fmtDuration(ms), "label", ctx) : [];
}));
add(w("lines-added", "activity", "Lines added", ["stdin"], (_d, _o, ctx) => {
  const n = ctx.input.cost?.total_lines_added;
  return n ? [{ text: `+${n}`, color: "context" }] : [];
}));
add(w("lines-removed", "activity", "Lines removed", ["stdin"], (_d, _o, ctx) => {
  const n = ctx.input.cost?.total_lines_removed;
  return n ? [{ text: `-${n}`, color: "critical" }] : [];
}));
add(w("cache-timer", "activity", "Cache TTL timer", ["transcript"], (_d, _o, ctx) => {
  const ms = ctx.data.transcript?.msSinceLastUser;
  if (ms == null) return [];
  const min = ms / 60000;
  const color = min >= 5 ? "critical" : min >= 3 ? "warning" : "context";
  return lv(sym("◴", "cache", ctx), fmtDuration(ms), color, ctx);
}));


// ---------------- git (extended) ----------------
gitText("git-stash", "Stash", "label", (g, ctx) => (g.stash ? `${sym("⧇", "S", ctx)}${g.stash}`.trim() : null));
gitText("git-tag", "Nearest tag", "label", (g, ctx) => (g.tag ? `${sym("⌂", "T", ctx)}${g.tag}`.trim() : null));
gitText("git-submodules", "Submodules", "label", (g) => g.submodules || null);
gitText("git-commit-count", "Commit count", "label", (g) => g.commitCount ?? null);
gitText("git-operation", "Git operation", "critical", (g) => g.operation ?? null);
gitText("git-time-since-commit", "Time since commit", "label", (g) => {
  const s = g.secondsSinceCommit;
  if (s == null) return null;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
});

// ---------------- environment / provider ----------------
add(w("env", "system", "Environment variable", [], (_d, opts, ctx) => {
  const name = opts.variable as string | undefined;
  if (!name) return [];
  const val = process.env[name];
  if (!val) return [];
  return lv((opts.prefix as string) ?? name, val, "label", ctx);
}));
add(w("provider", "model", "Provider/auth label", ["stdin"], (_d, opts, ctx) => {
  const bedrock = process.env.CLAUDE_CODE_USE_BEDROCK === "1" || /bedrock/i.test(ctx.input.model?.id ?? "");
  const vertex = process.env.CLAUDE_CODE_USE_VERTEX === "1";
  const label = bedrock ? "Bedrock" : vertex ? "Vertex" : (opts.showApi ? "API" : null);
  return lv(null, label, "label", ctx);
}));

// ---------------- usage (extended) ----------------
add(w("burn-rate", "usage", "Burn rate ($/hr)", ["stdin"], (_d, opts, ctx) => {
  const c = ctx.input.cost?.total_cost_usd;
  const mode = (opts.mode as string) ?? "wall";
  const ms = mode === "active" ? ctx.input.cost?.total_api_duration_ms : ctx.input.cost?.total_duration_ms;
  if (!c || !ms) return [];
  const hrs = ms / 3_600_000;
  return hrs > 0 ? [{ text: `$${(c / hrs).toFixed(2)}/hr`, color: "warning" }] : [];
}));
add(w("token-breakdown", "tokens", "Token breakdown (high context)", ["stdin"], (_d, opts, ctx) => {
  const used = contextPct(ctx);
  if (used == null || used < Number(opts.threshold ?? 85)) return [];
  const t = usageTokens(ctx);
  return [{ text: `in ${fmtTokens(t.input)} out ${fmtTokens(t.output)} cache ${fmtTokens(t.cacheRead + t.cacheCreation)}`, color: "label" }];
}));

// ---------------- stats-backed (persistence) ----------------
const speedWidget = (id: string, label: string, kind: "input" | "output" | "total") =>
  add(w(id, "tokens", label, ["stats"], (_d, _o, ctx) => {
    const v = ctx.data.stats?.tokenSpeed[kind];
    return v ? lv(label, `${v} tok/s`, "usage", ctx) : [];
  }));
speedWidget("input-speed", "In speed", "input");
speedWidget("output-speed", "Out speed", "output");
speedWidget("total-speed", "Speed", "total");

const aggCost = (id: string, label: string, pick: (s: NonNullable<RenderContext["data"]["stats"]>) => number) =>
  add(w(id, "usage", label, ["stats"], (_d, _o, ctx) => {
    const s = ctx.data.stats;
    if (!s) return [];
    const v = pick(s);
    return v > 0 ? lv(label, `$${v.toFixed(2)}`, "paceGood", ctx) : [];
  }));
aggCost("daily-cost", "Today", (s) => s.dailyCost);
aggCost("weekly-cost", "7d cost", (s) => s.weeklyCost);
aggCost("monthly-cost", "30d cost", (s) => s.monthlyCost);

add(w("message-count", "activity", "Message count", ["stats"], (_d, _o, ctx) => {
  const n = ctx.data.stats?.messageCount;
  return n ? lv(sym("⟐", "msgs", ctx), n, "label", ctx) : [];
}));

add(w("budget", "usage", "Budget", ["stats"], (_d, opts, ctx) => {
  const amount = Number(opts.amount ?? 0);
  if (amount <= 0) return [];
  const scope = (opts.scope as string) ?? "session";
  const s = ctx.data.stats;
  const val = scope === "today" ? s?.dailyCost : scope === "month" ? s?.monthlyCost : s?.sessionCost;
  if (val == null) return [];
  const pct = Math.round((val / amount) * 100);
  const warn = Number(opts.warningThreshold ?? 80);
  const color = pct >= 100 ? "critical" : pct >= warn ? "warning" : "usage";
  const mark = pct >= warn ? "!" : "";
  return lv(sym("◱", "budget", ctx), `${mark}${pct}%`, color, ctx);
}));

add(w("cost-projection", "usage", "Cost projection (block)", ["stats", "rate_limits"], (_d, _o, ctx) => {
  const cost = ctx.data.stats?.sessionCost;
  const win = ctx.input.rate_limits?.five_hour;
  if (!cost || !win?.resets_at) return [];
  const remMs = (typeof win.resets_at === "number" ? win.resets_at : Date.parse(String(win.resets_at))) - Date.now();
  const WINDOW = 5 * 3600 * 1000;
  const elapsedFrac = (WINDOW - remMs) / WINDOW;
  if (elapsedFrac <= 0.02) return [];
  return lv("Est", `$${(cost / elapsedFrac).toFixed(2)}`, "warning", ctx);
}));

// ---------------- git PR / API time ----------------
add(w("git-pr", "git", "Pull request (gh/glab)", ["git"], (_d, _o, ctx) => {
  const g = ctx.data.git;
  if (!g?.isRepo) return [];
  const cwd = ctx.input.workspace?.current_dir ?? ctx.input.cwd ?? process.cwd();
  const opts: import("node:child_process").ExecSyncOptionsWithStringEncoding = { cwd, timeout: 1200, stdio: ["ignore", "pipe", "ignore"], encoding: "utf8" };
  try {
    const j = JSON.parse(execSync("gh pr view --json number,title,state", opts).trim());
    return [{ text: `${sym("⎇", "PR", ctx)} ${String(j.state).toLowerCase()} #${j.number} ${j.title}`.trim(), color: "gitBranch" }];
  } catch { /* try glab */ }
  try {
    const j = JSON.parse(execSync("glab mr view -F json", opts).trim());
    return j?.iid ? [{ text: `${sym("⎇", "MR", ctx)} !${j.iid} ${j.title ?? ""}`.trim(), color: "gitBranch" }] : [];
  } catch { return []; }
}));
add(w("total-api-time", "activity", "Total API time", ["stdin"], (_d, _o, ctx) => {
  const ms = ctx.input.cost?.total_api_duration_ms;
  return ms ? lv(sym("⧖", "api", ctx), fmtDuration(ms), "label", ctx) : [];
}));

// ---------------- claude config / response time ----------------
add(w("claude-account-email", "model", "Account email", ["system"], (_d, _o, ctx) =>
  lv(sym("✉", "@", ctx), ctx.data.system?.accountEmail, "label", ctx)));
add(w("config-counts", "system", "Config counts (CLAUDE.md/MCP/hooks)", ["system"], (_d, _o, ctx) => {
  const s = ctx.data.system;
  if (!s) return [];
  const parts: string[] = [];
  if (s.claudeMdCount) parts.push(`${sym("⌘", "md", ctx)}${s.claudeMdCount}`);
  if (s.mcpConfigCount) parts.push(`${sym("⚙", "mcp", ctx)}${s.mcpConfigCount}`);
  if (s.hooksCount) parts.push(`${sym("⚓", "hk", ctx)}${s.hooksCount}`);
  if (s.rulesCount) parts.push(`${sym("§", "rules", ctx)}${s.rulesCount}`);
  return parts.length ? [{ text: parts.join(" "), color: "label" }] : [];
}));
add(w("last-response-time", "activity", "Last response time", ["transcript"], (_d, _o, ctx) => {
  const ms = ctx.data.transcript?.lastResponseMs;
  if (ms == null) return [];
  return lv(sym("Δ", "resp", ctx), ms >= 1000 ? fmtDuration(ms) : `${ms}ms`, "label", ctx);
}));

// ---------------- tokens/min ----------------
add(w("tokens-per-min", "tokens", "Tokens per minute", ["stats"], (_d, _o, ctx) => {
  const v = ctx.data.stats?.tokenSpeed.total;
  return v ? lv("tok/min", String(v * 60), "usage", ctx) : [];
}));
// ---------------- registry ----------------

export const WIDGETS: Record<string, Widget> = {};
for (const x of ALL) WIDGETS[x.id] = x;
export function getWidget(id: string): Widget | undefined { return WIDGETS[id]; }
export function listWidgets(): Widget[] { return Object.values(WIDGETS); }
