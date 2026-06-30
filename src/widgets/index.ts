import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import type { DataSource, RenderContext, Segment, Widget, WidgetCategory, WidgetOptions } from "../types.js";
import { renderBar, thresholdColor, type BarStyle } from "../render/bars.js";
import { clean as san } from "../data/sanitize.js";

// ---------------- helpers ----------------

function sym(unicode: string, text: string, ctx: RenderContext): string {
  return ctx.config.charset === "text" ? text : unicode;
}
function fmtTokens(n: number): string {
  // Round up to "1.0M" once k-formatting would otherwise print "1000.0k"
  // (ccstatusline parity: 999950+ renders as 1.0M).
  if (n >= 999_950) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}
function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}
// Claude Code's rate_limits.*.resets_at is Unix epoch **seconds** (10-digit).
// Normalize defensively: treat <1e12 as seconds (→×1000), accept ms and ISO too.
function epochMs(v: number | string | null | undefined): number {
  if (v == null) return Number.NaN;
  if (typeof v === "number") return v < 1e12 ? v * 1000 : v;
  return Date.parse(v);
}
const WINDOW_MS = { five_hour: 5 * 3600 * 1000, seven_day: 7 * 24 * 3600 * 1000 } as const;

function fmtCountdown(resetsAt: number | string | null | undefined): string | null {
  if (resetsAt == null) return null;
  const ms = epochMs(resetsAt) - Date.now();
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
/** All current Claude models are at least a 200k window. */
const DEFAULT_MODEL_LIMIT = 200_000;

/** True when the model name advertises a 1M context (`[1m]`, `(1M context)`, …). */
function has1M(ctx: RenderContext): boolean {
  const name = `${ctx.input.model?.id ?? ""} ${ctx.input.model?.display_name ?? ""}`;
  // Explicit forms only — avoid a bare "1m" that could match unrelated id slugs.
  return /\[1m\]|1m[ -]context/i.test(name);
}

function modelLimit(ctx: RenderContext): number | undefined {
  const size = ctx.input.context_window?.context_window_size;
  if (size) return size;
  // 1M detection must run regardless of whether modelContextLimits is configured.
  if (has1M(ctx)) return 1_000_000;
  const lim = ctx.config.modelContextLimits;
  const id = (ctx.input.model?.id ?? ctx.input.model?.display_name ?? "").toLowerCase();
  if (lim) {
    if (id.includes("opus")) return lim.opus ?? lim.default ?? DEFAULT_MODEL_LIMIT;
    if (id.includes("sonnet")) return lim.sonnet ?? lim.default ?? DEFAULT_MODEL_LIMIT;
    if (id.includes("haiku")) return lim.haiku ?? lim.default ?? DEFAULT_MODEL_LIMIT;
    if (lim.default) return lim.default;
  }
  return DEFAULT_MODEL_LIMIT;
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

/** Model name in a chosen format (claudia parity): abbr | name | id | version. */
function modelText(ctx: RenderContext, fmt: unknown): string {
  const dn = ctx.input.model?.display_name ?? ctx.input.model?.id ?? "Claude";
  const id = ctx.input.model?.id ?? dn;
  switch (fmt) {
    case "name":
      return dn;
    case "id":
      return id;
    case "version": {
      const m = dn.match(/\d+(?:\.\d+)+/);
      return m ? m[0] : shortModel(ctx);
    }
    default:
      return shortModel(ctx);
  }
}

/** label+value honoring minimalist mode (drops the dim label). */
function lv(label: string | null, value: string | number | null | undefined, color: string, ctx: RenderContext): Segment[] {
  if (value == null || value === "") return [];
  if (ctx.config.minimalist || !label) return [{ text: String(value), color }];
  return [{ text: `${label} `, color: "label" }, { text: String(value), color }];
}

/** Whole-number percent string. Floors out float artifacts like `7.000000000000001%`
 * (raw API `used_percentage` / `100 - used` subtractions) into a clean `7%`. */
const pctStr = (n: number): string => `${Math.round(n)}%`;

/** Label + optional progress bar + percent text. When the widget config sets a
 * `barStyle` (and it isn't "none"), any percentage widget can render a bar — parity
 * with claude-hud's `usageBarEnabled` and ccstatusline's ContextBar progress toggle.
 * The bar always reflects `usedPct`; `text` is what's printed after it. */
function pctSegments(label: string, usedPct: number, text: string, color: string, opts: Record<string, unknown>, ctx: RenderContext): Segment[] {
  const style = opts.barStyle;
  if (typeof style === "string" && style !== "none") {
    const bar = renderBar(usedPct, 8, style as BarStyle, ctx.config.charset);
    const head: Segment[] = ctx.config.minimalist ? [] : [{ text: `${label} `, color: "label" }];
    return [...head, { text: bar.filled, color }, { text: bar.empty, color: "barEmpty" }, { text: " " }, { text, color }];
  }
  return lv(label, text, color, ctx);
}

function w(id: string, category: WidgetCategory, label: string, needs: DataSource[], render: Widget["render"]): Widget {
  return { id, category, label, needs, collect: () => null, render };
}

const ALL: Widget[] = [];
const add = (x: Widget) => { ALL.push(x); };

// ---------------- model / session ----------------

add(w("model", "model", "Model", ["stdin"], (_d, o, ctx) => {
  let text = `${sym("✱", "M", ctx)} ${san(modelText(ctx, o.format))}`;
  if (o.show1M && has1M(ctx)) text += " 1M"; // append a 1M-context badge when present
  return [{ text, color: "model", bold: true }];
}));
add(w("context-1m", "context", "1M context badge", ["stdin"], (_d, _o, ctx) =>
  has1M(ctx) ? [{ text: sym("◇ 1M", "1M", ctx), color: "context", bold: true }] : []));
add(w("version", "system", "Claude Code version", ["stdin"], (_d, _o, ctx) =>
  lv(null, ctx.input.version ? `v${ctx.input.version}` : null, "label", ctx)));
add(w("output-style", "system", "Output style", ["stdin"], (_d, _o, ctx) => {
  const os = ctx.input.output_style;
  const name = typeof os === "string" ? os : os?.name;
  return lv("style", name, "label", ctx);
}));
add(w("session-name", "system", "Session name", ["stdin", "transcript"], (_d, _o, ctx) =>
  lv(null, san(ctx.input.session_name) ?? ctx.data.transcript?.sessionName, "model", ctx)));
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
  segs.push({ text: `${pctStr(shown)}${mode === "remaining" && !ctx.config.minimalist ? " left" : ""}`, color });
  return segs;
}));
add(w("context-percentage", "context", "Context %", ["stdin"], (_d, opts, ctx) => {
  const u = contextPct(ctx);
  if (u == null) return [];
  const mode = (opts.mode as string) ?? "used";
  const shown = mode === "remaining" ? 100 - u : u;
  const text = pctStr(shown) + (mode === "remaining" && !ctx.config.minimalist ? " left" : "");
  return pctSegments("Ctx", u, text, thresholdColor(u), opts, ctx);
}));
add(w("context-percentage-usable", "context", "Context % (usable)", ["stdin"], (_d, opts, ctx) => {
  const cw = ctx.input.context_window;
  if (!cw?.context_window_size) return [];
  const buffer = Number(opts.autocompactBuffer ?? 33000);
  const used = usageTokens(ctx).total;
  const usablePct = Math.min(100, Math.round((used / Math.max(1, cw.context_window_size - buffer)) * 100));
  return lv("Ctx", pctStr(usablePct), thresholdColor(usablePct), ctx);
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
  return lv("Cache", pctStr((t.cacheRead / denom) * 100), "context", ctx);
}));
// cc-status-dash exclusive: estimated savings from prompt-cache reads (work avoided).
// Shows cached-token count by default, or a $ estimate when `savedPerMTok` is set.
add(w("cache-roi", "tokens", "Cache ROI", ["stdin"], (_d, opts, ctx) => {
  const t = usageTokens(ctx);
  if (!t.cacheRead) return [];
  const rate = Number(opts.savedPerMTok ?? 0); // $ saved per 1M tokens served from cache
  const saved = rate > 0 ? `$${((t.cacheRead / 1_000_000) * rate).toFixed(2)}` : fmtTokens(t.cacheRead);
  return lv(sym("♻", "roi", ctx), `${saved} saved`, "paceGood", ctx);
}));
// cc-status-dash exclusive: one-glance health — context left · 5h usage + pace · time to reset.
add(w("session-health", "context", "Session health", ["stdin", "rate_limits"], (_d, _o, ctx) => {
  const segs: Segment[] = [];
  const used = contextPct(ctx);
  if (used != null) {
    const c = thresholdColor(used);
    segs.push({ text: `${sym("◉", "health", ctx)} `, color: c }, { text: pctStr(100 - used), color: c });
    if (!ctx.config.minimalist) segs.push({ text: " ctx", color: "label" });
  }
  const win = ctx.input.rate_limits?.five_hour;
  if (win && typeof win.used_percentage === "number") {
    const u = win.used_percentage;
    if (segs.length) segs.push({ text: " · ", color: "label" });
    segs.push({ text: `5h ${pctStr(u)}`, color: u >= 85 ? "critical" : u >= 60 ? "warning" : "usage" });
    if (win.resets_at != null) {
      const W = 5 * 3_600_000;
      const elapsedPct = ((W - (epochMs(win.resets_at) - Date.now())) / W) * 100;
      const delta = Math.round(u - elapsedPct);
      if (Number.isFinite(delta)) {
        const ahead = delta <= 0;
        segs.push({ text: ` ${ahead ? sym("⇣", "v", ctx) : sym("⇡", "^", ctx)}${Math.abs(delta)}%`, color: ahead ? "paceGood" : "paceBad" });
      }
      const cd = fmtCountdown(win.resets_at);
      if (cd) segs.push({ text: ` · ${cd}`, color: "label" });
    }
  }
  return segs;
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
    // Limit reached (Claude HUD parity): at/over 100% show a clear warning + reset time.
    if (pct >= 100) {
      const seg: Segment[] = [{ text: `${sym("⚠", "!", ctx)} ${label} limit`, color: "critical" }];
      const cd = win.resets_at != null ? fmtCountdown(win.resets_at) : null;
      if (cd) seg.push({ text: ` (${cd})`, color: "label" });
      return seg;
    }
    const color = pct >= critAt ? "critical" : pct >= 60 ? "warning" : "usage";
    // mode: "used" (default) shows % consumed; "remaining" shows % left (claude-hud parity).
    // The bar/threshold/color always track the *used* pct; only the number flips.
    const mode = (opts.mode as string) ?? "used";
    const text = mode === "remaining" ? `${pctStr(100 - pct)}${ctx.config.minimalist ? "" : " left"}` : pctStr(pct);
    const segs = pctSegments(label, pct, text, color, opts, ctx);
    if (opts.showPace && win.resets_at != null) {
      const remMs = (epochMs(win.resets_at)) - Date.now();
      const WINDOW = WINDOW_MS[key];
      const elapsedPct = ((WINDOW - remMs) / WINDOW) * 100;
      const delta = Math.round(pct - elapsedPct);
      if (Number.isFinite(delta)) {
        const ahead = delta <= 0;
        segs.push({ text: ` ${ahead ? sym("⇣", "v", ctx) : sym("⇡", "^", ctx)}${Math.abs(delta)}%`, color: ahead ? "paceGood" : "paceBad" });
      }
    }
    // usageCompact (Claude HUD parity): append the reset countdown inline, e.g. "5h 38% (1h 30m)".
    if (opts.usageCompact && win.resets_at != null) {
      const cd = fmtCountdown(win.resets_at);
      if (cd) segs.push({ text: ` (${cd})`, color: "label" });
    }
    return segs;
  }));
usageWindow("usage.block", "5h", "five_hour");
usageWindow("usage.weekly", "7d", "seven_day");
usageWindow("session-usage", "5h", "five_hour");
usageWindow("weekly-usage", "7d", "seven_day");

// External usage (ccstatusline ExtraUsage / claude-hud externalUsagePath): read a usage
// percentage another process wrote to a JSON file. Self-contained (no payload dependency).
// Accepts `{ used_percentage }`, `{ used, limit }`, or a bare number; optional `label`/
// `updated_at`. Reads an arbitrary path -> TRUSTED config only (see UNSAFE_FROM_UNTRUSTED).
add(w("external-usage", "usage", "External usage", ["stdin"], (_d, o, ctx) => {
  const path = typeof o.path === "string" ? o.path : (process.env.CC_STATUS_DASH_EXTERNAL_USAGE || undefined);
  if (!path) return [];
  let raw: unknown;
  try {
    if (!existsSync(path)) return [];
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch { return []; }
  const r = raw as Record<string, unknown> | number;
  let pct: number | null = null;
  if (typeof r === "number") pct = r;
  else if (typeof r?.used_percentage === "number") pct = r.used_percentage;
  else if (typeof r?.used === "number" && typeof r?.limit === "number" && r.limit > 0) pct = (r.used / r.limit) * 100;
  if (pct == null || !Number.isFinite(pct)) return [];
  const maxAge = Number(o.maxAgeMs ?? 0);
  if (maxAge > 0 && typeof r === "object" && r.updated_at != null && Date.now() - epochMs(r.updated_at as number) > maxAge) return [];
  const clamped = Math.max(0, Math.min(100, pct));
  const label = san(typeof o.label === "string" ? o.label : (typeof r === "object" && typeof r.label === "string" ? r.label : "ext")) ?? "ext";
  const mode = (o.mode as string) ?? "used";
  const color = clamped >= 85 ? "critical" : clamped >= 60 ? "warning" : "usage";
  const text = mode === "remaining" ? `${pctStr(100 - clamped)}${ctx.config.minimalist ? "" : " left"}` : pctStr(clamped);
  return pctSegments(label, clamped, text, color, o, ctx);
}));

const timerWidget = (id: string, label: string, key: "five_hour" | "seven_day", elapsed: boolean) =>
  add(w(id, "usage", label, ["rate_limits"], (_d, opts, ctx) => {
    const win = ctx.input.rate_limits?.[key];
    if (!win?.resets_at) return [];
    if (!elapsed) {
      // hoursOnly: show the countdown as total hours (e.g. "27h") instead of "1d 3h".
      const hrsOnly = opts.hoursOnly === true ? (() => { const m = epochMs(win.resets_at) - Date.now(); return m > 0 ? `${Math.ceil(m / 3_600_000)}h` : undefined; })() : undefined;
      const cd = hrsOnly ?? fmtCountdown(win.resets_at) ?? undefined;
      // Optional exact reset timestamp (ccstatusline parity): 12/24h + IANA tz.
      if (opts.timestamp) {
        const at = new Date(epochMs(win.resets_at));
        const t = at.toLocaleTimeString([], {
          hour: "2-digit", minute: "2-digit",
          hour12: opts.hour12 === true,
          timeZone: typeof opts.timezone === "string" ? opts.timezone : undefined,
        });
        return lv(sym("⏱", label, ctx), cd ? `${cd} (${t})` : t, "label", ctx);
      }
      return lv(sym("⏱", label, ctx), cd, "label", ctx);
    }
    const remMs = (epochMs(win.resets_at)) - Date.now();
    const WINDOW = WINDOW_MS[key];
    return lv(sym("⏱", label, ctx), fmtDuration(Math.max(0, WINDOW - remMs)), "label", ctx);
  }));
timerWidget("block-timer", "Block", "five_hour", true);
timerWidget("reset-timer", "Resets", "five_hour", false);
timerWidget("weekly-reset-timer", "7d resets", "seven_day", false);

// Added directories from /add-dir (Claude HUD parity) — multi-root sessions.
add(w("added-dirs", "system", "Added directories", ["stdin"], (_d, opts, ctx) => {
  const dirs = ctx.input.workspace?.added_dirs;
  if (!Array.isArray(dirs) || !dirs.length) return [];
  const max = typeof opts.max === "number" ? opts.max : 3;
  const names = dirs.slice(0, max).map((d) => san(basename(String(d)))).filter((n): n is string => !!n);
  if (!names.length) return [];
  const extra = dirs.length > max ? ` +${dirs.length - max}` : "";
  return lv(sym("⊕", "+", ctx), names.map((n) => `+${n}`).join(" ") + extra, "cwd", ctx);
}));
// Cumulative session tokens (Claude HUD parity): input / output from the transcript.
add(w("session-tokens", "tokens", "Session tokens", ["transcript"], (_d, _o, ctx) => {
  const st = ctx.data.transcript?.sessionTokens;
  if (!st || (!st.input && !st.output)) return [];
  return lv("Sess", `${sym("↑", "in ", ctx)}${fmtTokens(st.input)} ${sym("↓", "out ", ctx)}${fmtTokens(st.output)}`, "usage", ctx);
}));
add(w("session-clock", "system", "Clock", ["stdin"], (_d, o, ctx) =>
  lv(null, new Date().toLocaleTimeString([], {
    hour: "2-digit", minute: "2-digit",
    hour12: o.hour12 === true,
    timeZone: typeof o.timezone === "string" ? o.timezone : undefined,
  }), "label", ctx)));

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
  if (opts.link && g.originOwner && g.originRepo && g.branch
      && /^[w.-]+$/.test(g.originOwner) && /^[w.-]+$/.test(g.originRepo)) {
    const url = `https://github.com/${g.originOwner}/${g.originRepo}/tree/${encodeURIComponent(g.branch)}`;
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
add(w("git-ahead-behind", "git", "Ahead/behind", ["git"], (_d, opts, ctx) => {
  const g = ctx.data.git;
  if (!g?.isRepo || (!g.ahead && !g.behind)) return [];
  // Push thresholds (Claude HUD parity): color unpushed (ahead) commits when they
  // pile up. warnThreshold → warning, critThreshold → critical.
  const warn = typeof opts.pushWarnThreshold === "number" ? opts.pushWarnThreshold : Number.POSITIVE_INFINITY;
  const crit = typeof opts.pushCritThreshold === "number" ? opts.pushCritThreshold : Number.POSITIVE_INFINITY;
  const aheadColor = g.ahead && g.ahead >= crit ? "critical" : g.ahead && g.ahead >= warn ? "warning" : "gitBranch";
  const parts: Segment[] = [];
  if (g.ahead) parts.push({ text: `${sym("↑", "^", ctx)}${g.ahead}`, color: aheadColor });
  if (g.behind) parts.push({ text: `${parts.length ? " " : ""}${sym("↓", "v", ctx)}${g.behind}`, color: "gitBranch" });
  if (!ctx.config.minimalist) parts.unshift({ text: "Ahead/behind ", color: "label" });
  return parts;
}));
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
gitText("worktree-original-branch", "Worktree base", "gitBranch", (g) => g.worktree?.originalBranch);
gitText("worktree-mode", "Worktree mode", "label", (g) => (g.worktree?.mode ? "worktree" : null));

// ---------------- filesystem / system ----------------

const cwdWidget = (id: string) => add(w(id, "system", "Working directory", ["stdin"], (_d, opts, ctx) => {
  let data = san(ctx.input.workspace?.current_dir ?? ctx.input.cwd ?? process.cwd());
  // `home` toggle: abbreviate the home directory to `~` (ccstatusline "(h)ome ~").
  const home = process.env.HOME || process.env.USERPROFILE || "";
  if (opts.home === true && home && data.startsWith(home)) data = `~${data.slice(home.length)}`;
  const parts = data.replace(/[\\/]+$/, "").split(/[\\/]/).filter(Boolean);
  const style = (opts.style as string) ?? "segments";
  const isDrive = (p: string) => /^[A-Za-z]:$/.test(p); // preserve a Windows drive letter
  let out: string;
  if (style === "full") out = data;
  else if (style === "basename") out = parts[parts.length - 1] ?? data;
  else if (style === "fish") out = parts.map((p, i) => (i < parts.length - 1 && !isDrive(p) ? p.slice(0, 1) : p)).join("/");
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
    const out = execSync(cmd, { timeout: 300, stdio: ["ignore", "pipe", "ignore"], encoding: "utf8", windowsHide: true }).trim();
    return out ? [{ text: out, color: (opts.color as string) ?? "label" }] : [];
  } catch { return []; }
}));
add(w("link", "custom", "Link (OSC8)", [], (_d, opts, _ctx) => {
  const url = san(opts.url as string | undefined);
  const text = san((opts.label as string | undefined) ?? url) ?? url;
  if (!url || !text) return [];
  return [{ text: `]8;;${encodeURI(url)}${text}]8;;`, color: (opts.color as string) ?? "gitBranch" }];
}));

// ---------------- HUD activity ----------------

add(w("activity.tools", "activity", "Tool activity", ["transcript"], (_d, _o, ctx) => {
  const tools = ctx.data.transcript?.recentTools ?? [];
  if (!tools.length) return [];
  const check = sym("✓", "ok", ctx);
  const out: Segment[] = [];
  tools.slice(0, 3).forEach((t, i) => {
    if (i > 0) out.push({ text: sym(" │ ", " | ", ctx), color: "label" });
    out.push({ text: `${check} ${t.name}`, color: "doneTool" });
    if (t.target) out.push({ text: ` ${t.target}`, color: "label" });
  });
  return out;
}));
// Claude HUD style aggregated tool tallies: `◐ Bash ×12 │ ✓ Edit ×5 │ ✓ Read ×2`.
// The in-flight tool (if any) sorts first and gets the running glyph.
add(w("activity.tool-counts", "activity", "Tool counts", ["transcript"], (_d, opts, ctx) => {
  const tc = ctx.data.transcript?.toolCounts ?? [];
  if (!tc.length) return [];
  const run = sym("◐", "*", ctx);
  const done = sym("✓", "ok", ctx);
  const max = typeof opts.max === "number" ? opts.max : 5;
  const out: Segment[] = [];
  tc.slice(0, max).forEach((t, i) => {
    if (i > 0) out.push({ text: sym(" │ ", " | ", ctx), color: "label" });
    out.push({ text: `${t.running ? run : done} ${t.name}`, color: t.running ? "agent" : "doneTool" });
    if (t.count > 1) out.push({ text: ` ×${t.count}`, color: "label" });
  });
  return out;
}));
add(w("activity.agents", "activity", "Agent activity", ["transcript"], (_d, _o, ctx) => {
  const agents = ctx.data.transcript?.agents ?? [];
  if (!agents.length) return [];
  const out: Segment[] = [];
  agents.forEach((a, i) => {
    if (i > 0) out.push({ text: "  " });
    const running = a.status !== "done";
    out.push({ text: `${sym(running ? "◐" : "✓", running ? ">" : "ok", ctx)} ${a.name}`, color: "agent" });
    if (a.elapsedSec) out.push({ text: ` (${fmtDuration(a.elapsedSec * 1000)})`, color: "label" });
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
// Live MCP server names (Claude HUD parity) — vs mcp-count's number only.
add(w("activity.mcp", "activity", "MCP servers (live)", ["transcript"], (_d, opts, ctx) => {
  const m = ctx.data.transcript?.mcpServers ?? [];
  if (!m.length) return [];
  const max = typeof opts.max === "number" ? opts.max : 3;
  const extra = m.length > max ? ` +${m.length - max}` : "";
  return lv(sym("⚙", "mcp", ctx), m.slice(0, max).join(", ") + extra, "agent", ctx);
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
add(w("cache-timer", "activity", "Cache TTL timer", ["transcript"], (_d, opts, ctx) => {
  const ms = ctx.data.transcript?.msSinceLastUser;
  if (ms == null) return [];
  // Prompt-cache countdown (Claude HUD parity): with ttlSeconds (Pro 300 / Max
  // 3600), show time *remaining* before the cache expires; else elapsed.
  const ttl = typeof opts.ttlSeconds === "number" ? opts.ttlSeconds : undefined;
  if (ttl) {
    const remMs = ttl * 1000 - ms;
    if (remMs <= 0) return lv(sym("◴", "cache", ctx), "expired", "critical", ctx);
    const color = remMs <= 60_000 ? "critical" : remMs <= 120_000 ? "warning" : "context";
    return lv(sym("◴", "cache", ctx), fmtDuration(remMs), color, ctx);
  }
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
  let ms: number | null | undefined;
  if (mode === "active") {
    ms = ctx.input.cost?.total_api_duration_ms;
  } else if (mode === "auto-reset") {
    // claudia parity: rate measured within the current 5h block (elapsed since
    // the block began), so it "resets" each window instead of averaging forever.
    const win = ctx.input.rate_limits?.five_hour;
    if (win?.resets_at) {
      const remMs = (epochMs(win.resets_at)) - Date.now();
      const elapsed = 5 * 3600 * 1000 - remMs;
      if (elapsed > 0) ms = elapsed;
    }
  } else {
    ms = ctx.input.cost?.total_duration_ms;
  }
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
  return lv(sym("◱", "budget", ctx), `${mark}${pctStr(pct)}`, color, ctx);
}));

add(w("cost-projection", "usage", "Cost projection (block)", ["stats", "rate_limits"], (_d, _o, ctx) => {
  const cost = ctx.data.stats?.sessionCost;
  const win = ctx.input.rate_limits?.five_hour;
  if (!cost || !win?.resets_at) return [];
  const remMs = (epochMs(win.resets_at)) - Date.now();
  const WINDOW = 5 * 3600 * 1000;
  const elapsedFrac = (WINDOW - remMs) / WINDOW;
  if (elapsedFrac <= 0.02) return [];
  return lv("Est", `$${(cost / elapsedFrac).toFixed(2)}`, "warning", ctx);
}));

// ---------------- git PR / API time ----------------
add(w("git-pr", "git", "Pull request (gh/glab)", ["git"], (_d, o, ctx) => {
  const g = ctx.data.git;
  if (!g?.isRepo) return [];
  const showStatus = o.showStatus !== false; // toggles (ccstatusline parity): status + title
  const showTitle = o.showTitle !== false;
  const cwd = ctx.input.workspace?.current_dir ?? ctx.input.cwd ?? process.cwd();
  const opts: import("node:child_process").ExecSyncOptionsWithStringEncoding = { cwd, timeout: 800, stdio: ["ignore", "pipe", "ignore"], encoding: "utf8", windowsHide: true };
  try {
    const j = JSON.parse(execSync("gh pr view --json number,title,state", opts).trim());
    const parts = [sym("⎇", "PR", ctx), ...(showStatus ? [String(j.state).toLowerCase()] : []), `#${j.number}`, ...(showTitle ? [san(String(j.title ?? ""))] : [])];
    return [{ text: parts.join(" ").trim(), color: "gitBranch" }];
  } catch { /* try glab */ }
  try {
    const j = JSON.parse(execSync("glab mr view -F json", opts).trim());
    if (!j?.iid) return [];
    const parts = [sym("⎇", "MR", ctx), `!${j.iid}`, ...(showTitle ? [san(String(j.title ?? ""))] : [])];
    return [{ text: parts.join(" ").trim(), color: "gitBranch" }];
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
  return v ? lv("tok/min", fmtTokens(Math.round(v * 60)), "usage", ctx) : [];
}));
// ---------------- registry ----------------

export const WIDGETS: Record<string, Widget> = {};
for (const x of ALL) WIDGETS[x.id] = x;
export function getWidget(id: string): Widget | undefined { return WIDGETS[id]; }
export function listWidgets(): Widget[] { return Object.values(WIDGETS); }
