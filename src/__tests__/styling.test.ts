import { test } from "node:test";
import assert from "node:assert/strict";
import type { Config, GitInfo, RenderContext, StatuslineInput } from "../types.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import { resolvePalette } from "../themes/index.js";
import { renderBar } from "../render/bars.js";
import { render } from "../render/renderer.js";
import { createPainter } from "../render/colors.js";
import { getWidget } from "../widgets/index.js";

// Covers Batch A: per-widget style overrides, new bar styles, model formats,
// token rounding. Runs on node:test & bun test.

const INPUT: StatuslineInput = {
  model: { id: "claude-opus-4-8", display_name: "Claude Opus 4.8" },
  context_window: { context_window_size: 200000, used_percentage: 54 },
};

function cfg(over: Partial<Config>): Config {
  return { ...DEFAULT_CONFIG, colors: resolvePalette(over.theme ?? DEFAULT_CONFIG.theme), ...over };
}
function rendered(over: Partial<Config>): string {
  return render({ input: INPUT, data: {}, config: cfg(over) });
}

// ---- per-widget style overrides ----

test("per-widget color recolors the value (truecolor)", () => {
  const out = rendered({
    colorDepth: "truecolor",
    lines: [{ style: "inline", widgets: [{ id: "model", color: "#a1b2c3" }] }],
  });
  assert.ok(out.includes("38;2;161;178;195"), `expected fg escape, got ${JSON.stringify(out)}`);
});

test("per-widget bgColor paints a background (truecolor)", () => {
  const out = rendered({
    colorDepth: "truecolor",
    lines: [{ style: "inline", widgets: [{ id: "model", bgColor: "#102030" }] }],
  });
  assert.ok(out.includes("48;2;16;32;48"), `expected bg escape, got ${JSON.stringify(out)}`);
});

test("per-widget bold:false opts out of globalBold and the widget's own bold", () => {
  const out = rendered({
    globalBold: true,
    colorDepth: "truecolor",
    lines: [{ style: "inline", widgets: [{ id: "model", bold: false }] }],
  });
  assert.ok(!out.includes("[1m"), `expected no bold code, got ${JSON.stringify(out)}`);
});

test("per-widget dim dims the value", () => {
  const out = rendered({
    colorDepth: "truecolor",
    lines: [{ style: "inline", widgets: [{ id: "model", dim: true }] }],
  });
  assert.ok(out.includes("[2m"), `expected dim code, got ${JSON.stringify(out)}`);
});

test("per-widget color leaves the dim label intact", () => {
  // context.bar emits a dim "Context" label + a colored value; recoloring the
  // value must not drop the label's dim styling.
  const out = rendered({
    colorDepth: "truecolor",
    lines: [{ style: "inline", widgets: [{ id: "context.bar", color: "#a1b2c3" }] }],
  });
  assert.ok(out.includes("[2m"), "label should still be dim");
  assert.ok(out.includes("38;2;161;178;195"), "value should be recolored");
});

// ---- bar styles (claude-powerline parity: 10 total) ----

test("new bar styles produce correct fill ratios", () => {
  for (const style of ["ball", "squares", "geometric", "filled", "capped", "blocks-line"]) {
    const b = renderBar(50, 10, style, "unicode");
    assert.equal([...b.filled].length, 5, `${style} filled`);
    assert.equal([...b.empty].length, 5, `${style} empty`);
  }
  assert.equal([...renderBar(100, 10, "filled", "unicode").empty].length, 0);
  assert.ok(renderBar(50, 10, "geometric", "text").filled.includes(">"));
  assert.ok(renderBar(50, 10, "squares", "unicode").filled.includes("■"));
});

// ---- model formats (claudia parity) ----

function modelOut(format: unknown): string {
  const ctx: RenderContext = { input: INPUT, data: {}, config: cfg({}) };
  const w = getWidget("model")!;
  return w.render(w.collect(ctx), { format }, ctx).map((s) => s.text).join("");
}

test("model formats: abbr / name / id / version", () => {
  assert.ok(modelOut(undefined).includes("Opus 4.8"));
  assert.ok(modelOut("name").includes("Claude Opus 4.8"));
  assert.ok(modelOut("id").includes("claude-opus-4-8"));
  assert.equal(modelOut("version").replace(/^[^\d]*/, ""), "4.8");
});

// ---- token rounding (ccstatusline parity: 999950+ -> 1.0M) ----

test("token formatting rounds 999950 up to 1.0M", () => {
  const input: StatuslineInput = {
    context_window: { current_usage: { input_tokens: 999950 } },
  };
  const ctx: RenderContext = { input, data: {}, config: cfg({}) };
  const w = getWidget("tokens-input")!;
  const out = w.render(w.collect(ctx), {}, ctx).map((s) => s.text).join("");
  assert.ok(out.includes("1.0M"), `expected 1.0M, got ${out}`);
});

// ---- Batch B: git thresholds, worktree base branch, transparent bg ----

function gitCtx(git: GitInfo, over: Partial<Config> = {}): RenderContext {
  return { input: INPUT, data: { git }, config: cfg(over) };
}

test("git-ahead-behind colors unpushed commits past the threshold", () => {
  const w = getWidget("git-ahead-behind")!;
  const ctx = gitCtx({ isRepo: true, ahead: 5, behind: 1 });
  const crit = w.render(w.collect(ctx), { pushCritThreshold: 3 }, ctx);
  assert.equal(crit.find((s) => s.text.includes("5"))?.color, "critical");
  const warn = w.render(w.collect(ctx), { pushWarnThreshold: 3 }, ctx);
  assert.equal(warn.find((s) => s.text.includes("5"))?.color, "warning");
  const plain = w.render(w.collect(ctx), {}, ctx);
  assert.equal(plain.find((s) => s.text.includes("5"))?.color, "gitBranch");
});

// ---- 1M context detection ----

test("1M context is auto-detected from the model name without any config", () => {
  const input: StatuslineInput = {
    model: { id: "claude-opus-4-8[1m]", display_name: "Claude Opus 4.8 (1M context)" },
    context_window: { current_usage: { input_tokens: 300000 } },
  };
  const ctx: RenderContext = { input, data: {}, config: cfg({}) };
  const pct = getWidget("context-percentage")!;
  const out = pct.render(pct.collect(ctx), {}, ctx).map((s) => s.text).join("");
  assert.ok(out.includes("30%"), `expected 30% on a 1M window, got ${out}`);
});

test("context-1m badge shows only for 1M models; model show1M appends it", () => {
  const oneM: RenderContext = { input: { model: { id: "claude-opus-4-8[1m]", display_name: "Opus (1M context)" } }, data: {}, config: cfg({}) };
  const plain: RenderContext = { input: { model: { id: "claude-opus-4-8", display_name: "Opus 4.8" } }, data: {}, config: cfg({}) };
  const badge = getWidget("context-1m")!;
  assert.ok(badge.render(badge.collect(oneM), {}, oneM).length > 0, "badge should show on 1M");
  assert.deepEqual(badge.render(badge.collect(plain), {}, plain), [], "badge empty on non-1M");
  const m = getWidget("model")!;
  assert.ok(m.render(m.collect(oneM), { show1M: true }, oneM).map((s) => s.text).join("").includes("1M"));
  assert.ok(!m.render(m.collect(plain), { show1M: true }, plain).map((s) => s.text).join("").includes("1M"));
});

test("worktree-original-branch renders the base branch", () => {
  const w = getWidget("worktree-original-branch")!;
  const ctx = gitCtx({ isRepo: true, worktree: { mode: true, branch: "feat", originalBranch: "main" } });
  const out = w.render(w.collect(ctx), {}, ctx).map((s) => s.text).join("");
  assert.ok(out.includes("main"), `expected base branch, got ${out}`);
});

test("bgColor none/transparent emits no background escape", () => {
  const painter = createPainter(cfg({ colorDepth: "truecolor" }));
  assert.ok(!painter.paint("x", { bgColor: "none" }).includes("48;"));
  assert.ok(!painter.paint("x", { bgColor: "transparent" }).includes("48;"));
});

// ---- Batch C: burn-rate auto-reset, reset timestamp, prompt-cache countdown ----

test("burn-rate auto-reset uses the current 5h block elapsed", () => {
  const input: StatuslineInput = {
    cost: { total_cost_usd: 6, total_duration_ms: 36_000_000 },
    // 1h left in a 5h window => 4h elapsed => $6 / 4h = $1.50/hr
    rate_limits: { five_hour: { used_percentage: 80, resets_at: Date.now() + 3_600_000 } },
  };
  const ctx: RenderContext = { input, data: {}, config: cfg({}) };
  const w = getWidget("burn-rate")!;
  const out = w.render(w.collect(ctx), { mode: "auto-reset" }, ctx).map((s) => s.text).join("");
  assert.ok(out.includes("$1.5"), `expected ~$1.50/hr, got ${out}`);
});

test("reset-timer timestamp option shows an exact clock time", () => {
  const input: StatuslineInput = {
    rate_limits: { five_hour: { used_percentage: 10, resets_at: Date.now() + 3_600_000 } },
  };
  const ctx: RenderContext = { input, data: {}, config: cfg({}) };
  const w = getWidget("reset-timer")!;
  const out = w.render(w.collect(ctx), { timestamp: true, hour12: false, timezone: "UTC" }, ctx)
    .map((s) => s.text).join("");
  assert.ok(/\d{1,2}:\d{2}/.test(out), `expected a clock time, got ${out}`);
});

// ---- Batch D: color-depth downsampling + COLORTERM auto-detect ----

test("colorDepth downsamples hex to 256 and to 16", () => {
  const hex = "#7dcfff";
  const tc = createPainter(cfg({ colorDepth: "truecolor" })).paint("x", { color: hex });
  assert.ok(tc.includes("38;2;"), `truecolor should be 24-bit: ${JSON.stringify(tc)}`);
  const c256 = createPainter(cfg({ colorDepth: "ansi256" })).paint("x", { color: hex });
  assert.ok(c256.includes("38;5;") && !c256.includes("38;2;"), `256 mode: ${JSON.stringify(c256)}`);
  const c16 = createPainter(cfg({ colorDepth: "ansi" })).paint("x", { color: hex });
  assert.ok(!c16.includes("38;5;") && !c16.includes("38;2;"), `16 mode emits a base code: ${JSON.stringify(c16)}`);
});

test("auto depth respects COLORTERM", () => {
  const prev = process.env.COLORTERM;
  const prevTerm = process.env.TERM;
  try {
    process.env.COLORTERM = "truecolor";
    assert.ok(createPainter(cfg({ colorDepth: "auto" })).paint("x", { color: "#7dcfff" }).includes("38;2;"));
    delete process.env.COLORTERM;
    process.env.TERM = "xterm-256color";
    const out = createPainter(cfg({ colorDepth: "auto" })).paint("x", { color: "#7dcfff" });
    assert.ok(out.includes("38;5;") && !out.includes("38;2;"), `256-color TERM: ${JSON.stringify(out)}`);
  } finally {
    if (prev === undefined) delete process.env.COLORTERM; else process.env.COLORTERM = prev;
    if (prevTerm === undefined) delete process.env.TERM; else process.env.TERM = prevTerm;
  }
});

test("cache-timer ttlSeconds counts down remaining cache life", () => {
  const ctx: RenderContext = {
    input: INPUT,
    data: { transcript: { recentTools: [], agents: [], todos: { total: 0, completed: 0 }, skills: [], mcpServers: [], msSinceLastUser: 60_000 } },
    config: cfg({}),
  };
  const w = getWidget("cache-timer")!;
  // 300s TTL, 60s elapsed => ~4m remaining
  const out = w.render(w.collect(ctx), { ttlSeconds: 300 }, ctx).map((s) => s.text).join("");
  assert.ok(out.includes("4m"), `expected 4m remaining, got ${out}`);
  // expired
  const ctx2: RenderContext = { ...ctx, data: { transcript: { ...ctx.data.transcript!, msSinceLastUser: 400_000 } } };
  const out2 = w.render(w.collect(ctx2), { ttlSeconds: 300 }, ctx2).map((s) => s.text).join("");
  assert.ok(out2.includes("expired"), `expected expired, got ${out2}`);
});
