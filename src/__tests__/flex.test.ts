import { test } from "node:test";
import assert from "node:assert/strict";
import { stripVTControlCharacters as strip } from "node:util";
import type { Config, RenderContext, StatuslineInput } from "../types.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import { resolvePalette } from "../themes/index.js";
import { render, displayWidth } from "../render/renderer.js";

// Flex separator: an inline spacer that fills the terminal width so trailing widgets
// are pushed to the right edge (ccstatusline flexSeparator parity).

const INPUT: StatuslineInput = { model: { display_name: "Opus" } };

function runAtWidth(width: number, over: Partial<Config>): string {
  const prev = process.env.CC_STATUS_DASH_WIDTH;
  process.env.CC_STATUS_DASH_WIDTH = String(width);
  try {
    const config = { ...DEFAULT_CONFIG, colors: resolvePalette(DEFAULT_CONFIG.theme), padding: 0, ...over };
    return strip(render({ input: INPUT, data: {}, config } as RenderContext));
  } finally {
    if (prev === undefined) delete process.env.CC_STATUS_DASH_WIDTH; else process.env.CC_STATUS_DASH_WIDTH = prev;
  }
}

test("flex spacer fills to the terminal width and right-aligns the tail", () => {
  const out = runAtWidth(30, {
    lines: [{ style: "inline", widgets: [
      { id: "custom-text", text: "L" },
      { id: "flex-separator" },
      { id: "custom-text", text: "R" },
    ] }],
  });
  assert.equal(displayWidth(out), 30, `line should span the full width: "${out}" (${displayWidth(out)})`);
  assert.ok(out.startsWith("L"), `left widget at the start: "${out}"`);
  assert.ok(out.endsWith("R"), `right widget at the end: "${out}"`);
  assert.equal(out, "L" + " ".repeat(28) + "R");
});

test("no separator glyph is drawn adjacent to a flex spacer", () => {
  const out = runAtWidth(20, {
    lines: [{ style: "inline", widgets: [
      { id: "custom-text", text: "A" },
      { id: "flex-separator" },
      { id: "custom-text", text: "B" },
    ] }],
  });
  assert.ok(!out.includes("│"), `flex spacer replaces separators: "${out}"`);
});

test("custom fill glyph is repeated across the gap", () => {
  const out = runAtWidth(10, {
    lines: [{ style: "inline", widgets: [
      { id: "custom-text", text: "A" },
      { id: "flex-separator", fill: "." },
      { id: "custom-text", text: "B" },
    ] }],
  });
  assert.equal(out, "A" + ".".repeat(8) + "B");
});

test("two flex spacers split the remaining width (centering the middle)", () => {
  const out = runAtWidth(21, {
    lines: [{ style: "inline", widgets: [
      { id: "custom-text", text: "L" },
      { id: "flex-separator" },
      { id: "custom-text", text: "M" },
      { id: "flex-separator" },
      { id: "custom-text", text: "R" },
    ] }],
  });
  assert.equal(displayWidth(out), 21);
  // 21 - 3 chars = 18 split as 9/9 → L .........M......... R with M centered
  assert.equal(out, "L" + " ".repeat(9) + "M" + " ".repeat(9) + "R");
});

test("content wider than the terminal degrades gracefully (spacer collapses to empty)", () => {
  const out = runAtWidth(3, {
    lines: [{ style: "inline", widgets: [
      { id: "custom-text", text: "LEFT" },
      { id: "flex-separator" },
      { id: "custom-text", text: "RIGHT" },
    ] }],
  });
  assert.equal(out, "LEFTRIGHT"); // no room to fill; nothing crashes, content preserved
});
