import { test } from "node:test";
import assert from "node:assert/strict";
import { stripVTControlCharacters as strip } from "node:util";
import type { Config, RenderContext, StatuslineInput } from "../types.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import { resolvePalette } from "../themes/index.js";
import { render, displayWidth } from "../render/renderer.js";

// Panel style: frames a line's content in a box (one config line → three rows).

const INPUT: StatuslineInput = { model: { display_name: "Opus" }, version: "2.1.97" };

function run(over: Partial<Config>): string {
  const config = { ...DEFAULT_CONFIG, colors: resolvePalette(DEFAULT_CONFIG.theme), padding: 0, ...over } as Config;
  return strip(render({ input: INPUT, data: {}, config } as RenderContext));
}

test("panel style frames the content in a rounded box", () => {
  const out = run({ lines: [{ style: "panel", widgets: [{ id: "model" }, { id: "version" }] }] });
  const rows = out.split("\n");
  assert.equal(rows.length, 3, `expected 3 rows, got ${rows.length}:\n${out}`);
  assert.ok(rows[0].startsWith("╭") && rows[0].endsWith("╮"), `top border: ${rows[0]}`);
  assert.ok(rows[1].startsWith("│") && rows[1].endsWith("│"), `content walls: ${rows[1]}`);
  assert.ok(rows[2].startsWith("╰") && rows[2].endsWith("╯"), `bottom border: ${rows[2]}`);
  assert.ok(rows[1].includes("Opus") && rows[1].includes("v2.1.97"), "content inside the box");
});

test("panel box rows are all the same display width", () => {
  const out = run({ lines: [{ style: "panel", widgets: [{ id: "model" }, { id: "version" }] }] });
  const rows = out.split("\n");
  const w = displayWidth(rows[0]);
  for (const r of rows) assert.equal(displayWidth(r), w, `row width mismatch: "${r}"`);
});

test("panel respects charset:text with ASCII box glyphs", () => {
  const out = run({ charset: "text", lines: [{ style: "panel", widgets: [{ id: "model" }] }] });
  const rows = out.split("\n");
  assert.ok(rows[0].startsWith("+") && rows[0].endsWith("+"), `ASCII top: ${rows[0]}`);
  assert.ok(rows[1].startsWith("|") && rows[1].endsWith("|"), `ASCII walls: ${rows[1]}`);
  assert.ok(!/[╭╮╰╯│─]/.test(out), "no unicode box glyphs under charset:text");
});

test("an empty panel line is culled (no stray box)", () => {
  // A widget that renders nothing (env with no variable) → line has no content → culled.
  const out = run({ lines: [{ style: "panel", widgets: [{ id: "env" }] }] });
  assert.equal(out, "", `empty panel should cull, got: ${JSON.stringify(out)}`);
});
