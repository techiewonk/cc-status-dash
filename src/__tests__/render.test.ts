import { test } from "node:test";
import assert from "node:assert/strict";
import { stripVTControlCharacters as strip } from "node:util";
import type { Config, RenderContext, StatuslineInput } from "../types.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import { resolvePalette, listThemes, THEMES } from "../themes/index.js";
import { renderBar, thresholdColor } from "../render/bars.js";
import { createPainter } from "../render/colors.js";
import { render } from "../render/renderer.js";

const INPUT: StatuslineInput = {
  model: { display_name: "Claude Opus 4.8" },
  workspace: { current_dir: "/home/dev/app" },
  context_window: { context_window_size: 200000, used_percentage: 54 },
  version: "2.1.97",
};

function cfg(over: Partial<Config>): Config {
  return { ...DEFAULT_CONFIG, colors: resolvePalette(over.theme ?? DEFAULT_CONFIG.theme), ...over };
}
function run(over: Partial<Config>): string {
  const ctx: RenderContext = { input: INPUT, data: {}, config: cfg(over) };
  return strip(render(ctx));
}

test("inline style joins widgets with separator", () => {
  const out = run({ lines: [{ style: "inline", widgets: [{ id: "model" }, { id: "version" }] }] });
  assert.ok(out.includes("Opus 4.8") && out.includes("v2.1.97"));
  assert.ok(out.includes("│"));
});

test("powerline + capsule render non-empty", () => {
  const pl = render({ input: INPUT, data: {}, config: cfg({ lines: [{ style: "powerline", widgets: [{ id: "model" }, { id: "version" }] }] }) });
  const cap = render({ input: INPUT, data: {}, config: cfg({ lines: [{ style: "capsule", widgets: [{ id: "model" }] }] }) });
  assert.ok(pl.length > 0 && cap.length > 0);
});

test("widget merge removes the separator", () => {
  const out = run({ lines: [{ style: "inline", widgets: [{ id: "model" }, { id: "version", merge: true }] }] });
  assert.ok(!out.includes("│"), `merged line should have no separator: ${out}`);
  assert.ok(out.includes("Opus 4.8") && out.includes("v2.1.97"));
});

test("autoWrap splits a long line", () => {
  process.env.COLUMNS = "18";
  const out = run({ autoWrap: true, lines: [{ style: "inline", widgets: [{ id: "model" }, { id: "version" }, { id: "context-percentage" }] }] });
  assert.ok(out.includes("\n"), `expected wrap newline, got: ${JSON.stringify(out)}`);
  delete process.env.COLUMNS;
});

test("minimalist drops labels", () => {
  const out = run({ minimalist: true, lines: [{ style: "inline", widgets: [{ id: "context.bar" }] }] });
  assert.ok(!out.includes("Context"), `minimalist should drop the label: ${out}`);
});

test("padding adds spaces around segments", () => {
  const out = run({ padding: 2, lines: [{ style: "inline", widgets: [{ id: "model" }] }] });
  assert.ok(out.startsWith("  "), `expected leading padding: ${JSON.stringify(out)}`);
});

test("themes: all built-ins present and overridable", () => {
  const themes = listThemes();
  assert.ok(themes.length >= 5);
  for (const t of ["hud-clean", "tokyo-night", "gruvbox", "nord", "mono"]) assert.ok(themes.includes(t));
  assert.equal(THEMES["nord"].colors.model, "#88c0d0");
  const palette = resolvePalette("nord", { model: "#123456" });
  assert.equal(palette.model, "#123456"); // custom overrides theme
});

test("colors: NO_COLOR / depth=none emits no ANSI", () => {
  const painter = createPainter(cfg({ colorDepth: "none" }));
  assert.equal(painter.paint("hi", { color: "model", bold: true }), "hi");
});

test("colors: truecolor hex + 256 + named emit ANSI", () => {
  const painter = createPainter(cfg({ colorDepth: "truecolor", theme: "tokyo-night" }));
  const out = painter.paint("x", { color: "#7dcfff" });
  assert.ok(out.includes("38;2;") && out !== "x");
});

test("bars: fill ratio and threshold colors", () => {
  const b = renderBar(50, 10, "blocks", "unicode");
  assert.equal([...b.filled].length, 5);
  assert.equal([...b.empty].length, 5);
  const t = renderBar(50, 10, "bar", "text");
  assert.ok(t.filled.includes("="));
  assert.equal(thresholdColor(90), "critical");
  assert.equal(thresholdColor(70), "warning");
  assert.equal(thresholdColor(10), "context");
});
