import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Config, RenderContext, StatuslineInput } from "../types.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import { resolvePalette } from "../themes/index.js";
import { render, displayWidth } from "../render/renderer.js";
import { createPainter } from "../render/colors.js";
import { getWidget } from "../widgets/index.js";
import { collectTranscript } from "../data/transcript.js";
import { collectStats } from "../data/stats.js";
import { stripControl } from "../data/sanitize.js";
import { loadConfig } from "../config/load.js";

// Regression tests for the 12-domain expert review fixes.

function cfg(over: Partial<Config> = {}): Config {
  return { ...DEFAULT_CONFIG, colors: resolvePalette(over.theme ?? DEFAULT_CONFIG.theme), ...over };
}
function tmp(): string {
  return mkdtempSync(join(tmpdir(), "ccsd-h-"));
}
function writeJsonl(path: string, lines: unknown[]) {
  writeFileSync(path, lines.map((l) => JSON.stringify(l)).join("\n"), "utf8");
}
const ESC = String.fromCharCode(27); // 0x1b
const BEL = String.fromCharCode(7); // 0x07
const C1 = String.fromCharCode(0x9b); // C1 CSI
const ARROW = "\uE0B0"; // powerline separator glyph

// ---- resets_at epoch seconds vs ms (schema-fidelity HIGH) ----
test("reset-timer works with resets_at in epoch SECONDS", () => {
  const secs = Math.floor(Date.now() / 1000) + 3600; // +1h, in seconds
  const ctx: RenderContext = { input: { rate_limits: { five_hour: { used_percentage: 10, resets_at: secs } } }, data: {}, config: cfg() };
  const w = getWidget("reset-timer")!;
  const out = w.render(w.collect(ctx), {}, ctx).map((s) => s.text).join("");
  assert.match(out, /\d+\s*[mh]/, `expected a countdown, got ${out}`);
});
test("reset-timer still works with resets_at in epoch MS", () => {
  const ctx: RenderContext = { input: { rate_limits: { five_hour: { used_percentage: 10, resets_at: Date.now() + 3_600_000 } } }, data: {}, config: cfg() };
  const w = getWidget("reset-timer")!;
  assert.ok(w.render(w.collect(ctx), {}, ctx).length > 0);
});

// ---- control-char sanitization (security MAJOR) ----
test("stripControl removes C0/C1 + ESC/BEL", () => {
  assert.equal(stripControl("a" + ESC + "[2Jb" + BEL + "c" + C1 + "d"), "a[2Jbcd");
});
test("transcript sanitizes tool targets so no ESC reaches output", () => {
  const dir = tmp();
  try {
    const p = join(dir, "t.jsonl");
    writeJsonl(p, [{ type: "assistant", message: { content: [{ type: "tool_use", id: "1", name: "Edit", input: { file_path: "auth" + ESC + "[2J.ts" } }] } }]);
    const target = collectTranscript(p).recentTools[0]?.target ?? "";
    assert.ok(!target.includes(ESC), `target must be sanitized, got ${JSON.stringify(target)}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---- project-config trust scoping (security BLOCKER) ----
test("untrusted project config cannot introduce command/env widgets; trusted --config can", () => {
  const dir = tmp();
  const saved = { HOME: process.env.HOME, UP: process.env.USERPROFILE, XDG: process.env.XDG_CONFIG_HOME, CC: process.env.CLAUDE_CONFIG_DIR, cwd: process.cwd() };
  try {
    process.env.HOME = join(dir, "home");
    process.env.USERPROFILE = join(dir, "home");
    delete process.env.XDG_CONFIG_HOME;
    delete process.env.CLAUDE_CONFIG_DIR;
    process.chdir(dir);
    const dangerous = { lines: [{ style: "inline", widgets: [{ id: "custom-command", command: "echo x" }, { id: "env", variable: "X" }, { id: "git-pr" }, { id: "model" }] }] };
    writeFileSync(join(dir, ".cc-status-dash.json"), JSON.stringify(dangerous), "utf8");
    const ids = loadConfig().lines.flatMap((l) => l.widgets.map((w) => w.id));
    assert.ok(!ids.includes("custom-command"), "custom-command stripped from project config");
    assert.ok(!ids.includes("env"), "env stripped");
    assert.ok(!ids.includes("git-pr"), "git-pr stripped");
    assert.ok(ids.includes("model"), "safe widgets survive");

    const cliPath = join(dir, "trusted.json");
    writeFileSync(cliPath, JSON.stringify({ lines: [{ style: "inline", widgets: [{ id: "custom-command", command: "echo x" }] }] }), "utf8");
    const trustedIds = loadConfig({ config: cliPath }).lines.flatMap((l) => l.widgets.map((w) => w.id));
    assert.ok(trustedIds.includes("custom-command"), "trusted --config keeps command widgets");
  } finally {
    process.chdir(saved.cwd);
    for (const [k, v] of [["HOME", saved.HOME], ["USERPROFILE", saved.UP], ["XDG_CONFIG_HOME", saved.XDG], ["CLAUDE_CONFIG_DIR", saved.CC]] as const) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- resilience / type-safety: malformed transcript doesn't crash ----
test("malformed TodoWrite (todos not an array) doesn't throw", () => {
  const dir = tmp();
  try {
    const p = join(dir, "t.jsonl");
    writeJsonl(p, [{ type: "assistant", message: { content: [{ type: "tool_use", id: "1", name: "TodoWrite", input: { todos: "nope" } }] } }]);
    const t = collectTranscript(p); // must not throw
    assert.equal(t.todos.total, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---- sidechain filtering (schema-fidelity) ----
test("isSidechain entries are not counted in tool tallies", () => {
  const dir = tmp();
  try {
    const p = join(dir, "t.jsonl");
    writeJsonl(p, [
      { type: "assistant", message: { content: [{ type: "tool_use", id: "1", name: "Bash" }] } },
      { isSidechain: true, type: "assistant", message: { content: [{ type: "tool_use", id: "2", name: "Bash" }] } },
    ]);
    const bash = collectTranscript(p).toolCounts.find((x) => x.name === "Bash");
    assert.equal(bash?.count, 1, "subagent Bash must not be counted");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---- session_name from top-level stdin (schema-fidelity) ----
test("session-name widget reads top-level stdin session_name", () => {
  const ctx: RenderContext = { input: { session_name: "my-sess" }, data: {}, config: cfg() };
  const w = getWidget("session-name")!;
  assert.ok(w.render(w.collect(ctx), {}, ctx).map((s) => s.text).join("").includes("my-sess"));
});

// ---- FORCE_COLOR=0 disables (terminal-rendering) ----
test("FORCE_COLOR=0 disables color", () => {
  const prev = process.env.FORCE_COLOR;
  try {
    process.env.FORCE_COLOR = "0";
    assert.equal(createPainter(cfg({ colorDepth: "truecolor" })).paint("x", { color: "#ffffff", bold: true }), "x");
  } finally { if (prev === undefined) delete process.env.FORCE_COLOR; else process.env.FORCE_COLOR = prev; }
});

// ---- powerline glyph restored (terminal-rendering HIGH) ----
test("powerline renders the U+E0B0 arrow glyph", () => {
  const out = render({ input: { model: { display_name: "Opus" } }, data: {}, config: cfg({ lines: [{ style: "powerline", widgets: [{ id: "model" }, { id: "session-clock" }] }] }) });
  assert.ok(out.includes(ARROW), "powerline arrow glyph must be present");
});

// ---- stats: prototype-pollution-safe + doesn't throw on odd session id ----
test("collectStats tolerates a __proto__ session id", () => {
  const dir = tmp();
  const prev = process.env.XDG_STATE_HOME;
  try {
    process.env.XDG_STATE_HOME = dir;
    const info = collectStats({ session_id: "__proto__", cost: { total_cost_usd: 1 } } as StatuslineInput);
    assert.equal(typeof info.messageCount, "number");
    assert.equal(({} as Record<string, unknown>).polluted, undefined);
  } finally { if (prev === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = prev; rmSync(dir, { recursive: true, force: true }); }
});

// ---- display width (terminal-rendering): CJK/emoji are 2 cells, combining 0 ----
test("displayWidth counts wide and zero-width chars correctly", () => {
  assert.equal(displayWidth("abc"), 3);
  assert.equal(displayWidth("中"), 2, "CJK ideograph is 2 cells");
  assert.equal(displayWidth("中a"), 3);
  assert.equal(displayWidth(String.fromCodePoint(0x1f600)), 2, "emoji is 2 cells");
  assert.equal(displayWidth("e" + String.fromCharCode(0x0301)), 1, "combining accent adds 0");
});

// ---- percentages render as whole numbers (no float artifacts) ----
test("usage % renders a clean integer, not 7.000000000000001%", () => {
  const ctx: RenderContext = { input: { rate_limits: { five_hour: { used_percentage: 7.000000000000001, resets_at: Math.floor(Date.now() / 1000) + 3600 } } }, data: {}, config: cfg() };
  const w = getWidget("usage.block")!;
  const out = w.render(w.collect(ctx), { showPace: true }, ctx).map((s) => s.text).join("");
  assert.match(out, /\b7%/, `expected "7%", got ${out}`);
  assert.ok(!/7\.0+/.test(out), `must not leak a float, got ${out}`);
});
test("context % and bar round to whole numbers", () => {
  const ctx: RenderContext = { input: { context_window: { used_percentage: 46.000000000000007, context_window_size: 200000 } }, data: {}, config: cfg() };
  for (const id of ["context-percentage", "context.bar"]) {
    const w = getWidget(id)!;
    const out = w.render(w.collect(ctx), {}, ctx).map((s) => s.text).join("");
    assert.ok(!/\.\d/.test(out), `${id} must not show a fractional %, got ${out}`);
  }
});

// ---- powerline separator is configurable ----
test("powerlineSeparator swaps the glyph (round = U+E0B4)", () => {
  const lines = [{ style: "powerline" as const, widgets: [{ id: "model" }, { id: "session-clock" }] }];
  const base = render({ input: { model: { display_name: "Opus" } }, data: {}, config: cfg({ lines }) });
  assert.ok(base.includes(""), "default powerline uses the arrow glyph");
  const round = render({ input: { model: { display_name: "Opus" } }, data: {}, config: cfg({ lines, powerlineSeparator: "round" }) });
  assert.ok(round.includes(""), "round separator emits U+E0B4");
  assert.ok(!round.includes(""), "round separator replaces the arrow");
});

// ---- OSC8 git.branch only links when owner/repo are clean ----
test("git.branch link is omitted for an invalid owner/repo", () => {
  const w = getWidget("git.branch")!;
  const ctx: RenderContext = { input: {}, data: { git: { isRepo: true, branch: "main", originOwner: "ev il/x", originRepo: "r", } }, config: cfg() };
  const out = w.render(w.collect(ctx), { link: true }, ctx).map((s) => s.text).join("");
  assert.ok(!out.includes("]8;;"), "must not emit a hyperlink for a malformed owner");
});
