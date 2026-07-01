import { test } from "node:test";
import assert from "node:assert/strict";
import { stripVTControlCharacters as strip } from "node:util";
import type { Config, RenderContext, StatuslineInput } from "../types.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import { resolvePalette } from "../themes/index.js";
import { render } from "../render/renderer.js";

// Global `icons` toggle: hides decorative widget glyphs (leading icons) while
// keeping structural glyphs (separators, arrows, on/off, bars, spinners).

const INPUT: StatuslineInput = {
  model: { display_name: "Opus" },
  version: "2.1.97",
  context_window: { context_window_size: 200000, used_percentage: 40 },
};

function run(over: Partial<Config>): string {
  const config = { ...DEFAULT_CONFIG, colors: resolvePalette(DEFAULT_CONFIG.theme), padding: 0, ...over } as Config;
  return strip(render({ input: INPUT, data: {}, config } as RenderContext));
}

const LINE = { style: "inline" as const, widgets: [{ id: "model" }, { id: "session-health" }] };

test("icons default (on): decorative glyphs are present", () => {
  const out = run({ icons: true, lines: [LINE] });
  assert.ok(out.includes("✱"), `model icon present: ${out}`);
});

test("icons:false hides decorative glyphs but keeps the value", () => {
  const out = run({ icons: false, lines: [LINE] });
  assert.ok(!out.includes("✱"), `model icon hidden: ${out}`);
  assert.ok(!out.includes("◉"), `health icon hidden: ${out}`);
  assert.ok(out.includes("Opus"), `model value kept: ${out}`);
});

test("icons:false leaves no stray leading space on the value", () => {
  const out = run({ icons: false, lines: [{ style: "inline", widgets: [{ id: "model" }] }] });
  assert.equal(out, "Opus", `expected bare value, got ${JSON.stringify(out)}`);
});

test("icons:false keeps structural glyphs (separators)", () => {
  const out = run({ icons: false, lines: [LINE] });
  assert.ok(out.includes("│"), `separator kept: ${out}`);
});

test("lv-based widget hides its icon cleanly (skills → value only)", () => {
  const ctx = {
    input: INPUT,
    data: { transcript: { recentTools: [], toolCounts: [], agents: [], todos: { total: 0, completed: 0 }, skills: ["verify", "simplify"], mcpServers: [] } },
    config: { ...DEFAULT_CONFIG, colors: resolvePalette(DEFAULT_CONFIG.theme), padding: 0, icons: false, lines: [{ style: "inline" as const, widgets: [{ id: "skills", mode: "list" }] }] },
  } as unknown as RenderContext;
  const out = strip(render(ctx));
  assert.ok(!out.includes("✦"), `skills icon hidden: ${out}`);
  assert.ok(out.includes("verify") && out.includes("simplify"), `skills value kept: ${out}`);
});
