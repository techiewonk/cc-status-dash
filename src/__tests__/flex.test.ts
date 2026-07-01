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

function runAtWidth(width: number, over: Partial<Config>, input: StatuslineInput = INPUT): string {
  const prev = process.env.CC_STATUS_DASH_WIDTH;
  process.env.CC_STATUS_DASH_WIDTH = String(width);
  try {
    const config = { ...DEFAULT_CONFIG, colors: resolvePalette(DEFAULT_CONFIG.theme), padding: 0, ...over };
    return strip(render({ input, data: {}, config } as RenderContext));
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

// ---- flexMode: effective-width policy (ccstatusline parity) ----

test("flexMode unset keeps the raw terminal width (no margin trimmed)", () => {
  const out = runAtWidth(30, {
    lines: [{ style: "inline", widgets: [
      { id: "custom-text", text: "L" }, { id: "flex-separator" }, { id: "custom-text", text: "R" },
    ] }],
  });
  assert.equal(displayWidth(out), 30);
});

test('flexMode "full" trims a small (6-column) margin', () => {
  const out = runAtWidth(30, {
    flexMode: "full",
    lines: [{ style: "inline", widgets: [
      { id: "custom-text", text: "L" }, { id: "flex-separator" }, { id: "custom-text", text: "R" },
    ] }],
  });
  assert.equal(displayWidth(out), 24, `30 - 6 margin: "${out}"`);
});

test('flexMode "full-minus-40" trims a large margin (clamped, never negative)', () => {
  const wide = runAtWidth(100, {
    flexMode: "full-minus-40",
    lines: [{ style: "inline", widgets: [
      { id: "custom-text", text: "L" }, { id: "flex-separator" }, { id: "custom-text", text: "R" },
    ] }],
  });
  assert.equal(displayWidth(wide), 60, `100 - 40 margin: "${wide}"`);

  const narrow = runAtWidth(20, {
    flexMode: "full-minus-40",
    lines: [{ style: "inline", widgets: [
      { id: "custom-text", text: "L" }, { id: "flex-separator" }, { id: "custom-text", text: "R" },
    ] }],
  });
  assert.ok(displayWidth(narrow) >= 2, `never collapses below content: "${narrow}"`); // clamped, not negative
});

test('flexMode "full-until-compact" uses the small margin below threshold, large margin at/above it', () => {
  const line = { style: "inline" as const, widgets: [
    { id: "custom-text", text: "L" }, { id: "flex-separator" }, { id: "custom-text", text: "R" },
  ] };
  const belowThreshold: StatuslineInput = { ...INPUT, context_window: { context_window_size: 200000, used_percentage: 40 } };
  const atThreshold: StatuslineInput = { ...INPUT, context_window: { context_window_size: 200000, used_percentage: 60 } };

  const below = runAtWidth(30, { flexMode: "full-until-compact", lines: [line] }, belowThreshold);
  assert.equal(displayWidth(below), 24, `below threshold uses the small margin: "${below}"`);

  const at = runAtWidth(30, { flexMode: "full-until-compact", lines: [line] }, atThreshold);
  // 30-40 clamps to 1 column of budget, less than the 2 literal chars (L+R) — the
  // flex fill collapses to empty and content floors at its own width (graceful
  // degradation, same as the out-of-room case tested above).
  assert.equal(displayWidth(at), 2, `at/above threshold uses the large margin (clamped, content floor): "${at}"`);
});

test('flexMode "full-until-compact" honors a custom compactThreshold', () => {
  const line = { style: "inline" as const, widgets: [
    { id: "custom-text", text: "L" }, { id: "flex-separator" }, { id: "custom-text", text: "R" },
  ] };
  const input: StatuslineInput = { ...INPUT, context_window: { context_window_size: 200000, used_percentage: 50 } };
  // default threshold (60) → below it → small margin
  const withDefault = runAtWidth(30, { flexMode: "full-until-compact", lines: [line] }, input);
  assert.equal(displayWidth(withDefault), 24);
  // custom threshold of 40 → 50% is now at/above it → large margin (content floor, see above)
  const withCustom = runAtWidth(30, { flexMode: "full-until-compact", compactThreshold: 40, lines: [line] }, input);
  assert.equal(displayWidth(withCustom), 2);
});
