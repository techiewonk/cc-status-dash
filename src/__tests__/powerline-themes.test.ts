import { test } from "node:test";
import assert from "node:assert/strict";
import type { Config, RenderContext, StatuslineInput } from "../types.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import { resolvePalette } from "../themes/index.js";
import { render } from "../render/renderer.js";
import { POWERLINE_THEMES, listPowerlineThemes, getPowerlineTheme } from "../render/powerlineThemes.js";

// Powerline color-cycling themes (ccstatusline `utils/colors.ts` parity): fg+bg
// cycle together through a depth-aware named palette by widget position, distinct
// from the role-based `theme` field and the default 3-role bgCycle.

const INPUT: StatuslineInput = {};

function run(over: Partial<Config>): string {
  const config = { ...DEFAULT_CONFIG, colors: resolvePalette(DEFAULT_CONFIG.theme), padding: 0, ...over } as Config;
  return render({ input: INPUT, data: {}, config } as RenderContext);
}

test("all 10 palettes are present, each with 5 fg/bg slots at every depth", () => {
  const names = listPowerlineThemes();
  assert.equal(names.length, 10, names.join(", "));
  for (const name of names) {
    for (const depth of ["ansi", "ansi256", "truecolor"] as const) {
      const p = getPowerlineTheme(name, depth);
      assert.ok(p, `${name}@${depth} missing`);
      assert.equal(p!.fg.length, 5, `${name}@${depth} fg`);
      assert.equal(p!.bg.length, 5, `${name}@${depth} bg`);
    }
  }
});

test("ccstatusline token formats are converted to our color-string format", () => {
  const truecolor = getPowerlineTheme("nord", "truecolor")!;
  assert.ok(truecolor.bg[0].startsWith("#"), `hex: -> #: ${truecolor.bg[0]}`);
  const ansi256 = getPowerlineTheme("nord", "ansi256")!;
  assert.ok(/^\d+$/.test(ansi256.bg[0]), `ansi256: -> bare number: ${ansi256.bg[0]}`);
  const ansi = getPowerlineTheme("nord", "ansi")!;
  assert.ok(!ansi.bg[0].startsWith("bg"), `"bg" prefix stripped: ${ansi.bg[0]}`);
});

test("brightWhite/brightBlack (missing from our 16-color NAMED map) resolve to a real color, not a raw ANSI-16 name", () => {
  for (const [name, theme] of Object.entries(POWERLINE_THEMES)) {
    for (const c of [...theme.ansi.fg, ...theme.ansi.bg]) {
      assert.notEqual(c, "brightWhite", `${name}: unmapped brightWhite`);
      assert.notEqual(c, "brightBlack", `${name}: unmapped brightBlack`);
    }
  }
});

test("an unset powerlineTheme renders unchanged (default bgCycle, no config = no change)", () => {
  const withoutTheme = run({ lines: [{ style: "powerline", widgets: [{ id: "custom-text", text: "A" }, { id: "custom-text", text: "B" }] }] });
  const withCustom = run({ powerlineTheme: "custom", lines: [{ style: "powerline", widgets: [{ id: "custom-text", text: "A" }, { id: "custom-text", text: "B" }] }] });
  assert.equal(withCustom, withoutTheme, "\"custom\" (unrecognized name) falls back identically to unset");
});

test("a named powerlineTheme changes the rendered background codes", () => {
  const withoutTheme = run({ colorDepth: "truecolor", lines: [{ style: "powerline", widgets: [{ id: "custom-text", text: "A" }, { id: "custom-text", text: "B" }] }] });
  const withTheme = run({ colorDepth: "truecolor", powerlineTheme: "dracula", lines: [{ style: "powerline", widgets: [{ id: "custom-text", text: "A" }, { id: "custom-text", text: "B" }] }] });
  assert.notEqual(withTheme, withoutTheme, "themed output should differ from the default role-based bgCycle");
  const dracula = getPowerlineTheme("dracula", "truecolor")!;
  const hexToRgb = (hex: string) => { const h = hex.replace("#", ""); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };
  const [r, g, b] = hexToRgb(dracula.bg[0]);
  assert.ok(withTheme.includes(`\x1b[48;2;${r};${g};${b}m`), `expected the theme's first bg color in the output: ${JSON.stringify(withTheme)}`);
});
