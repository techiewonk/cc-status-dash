import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWizardConfig, serializeConfig, configTargetPath } from "../config/wizard.js";
import { validatePartialConfig } from "../config/schema.js";
import { PRESET_LINES } from "../config/defaults.js";

// Pure wizard logic (the interactive @clack shell is verified manually in a TTY).

test("buildWizardConfig applies preset, theme, style, minimalist", () => {
  const cfg = buildWizardConfig({ preset: "full", theme: "nord", style: "powerline", minimalist: true });
  assert.equal(cfg.preset, "full");
  assert.equal(cfg.theme, "nord");
  assert.equal(cfg.lines.length, PRESET_LINES["full"].length);
  assert.ok(cfg.lines.every((l) => l.style === "powerline"), "all lines should take the chosen style");
  assert.equal(cfg.minimalist, true);
});

test("buildWizardConfig keeps preset line styles when no style chosen", () => {
  const cfg = buildWizardConfig({ preset: "compact", theme: "tokyo-night" });
  assert.equal(cfg.preset, "compact");
  // compact = powerline identity + inline metrics — styles preserved, not forced.
  assert.deepEqual(cfg.lines.map((l) => l.style), PRESET_LINES["compact"].map((l) => l.style));
});

test("serializeConfig emits valid JSON that passes schema validation (round-trip)", () => {
  const cfg = buildWizardConfig({ preset: "essential", theme: "gruvbox", style: "inline" });
  const json = serializeConfig(cfg);
  const parsed = JSON.parse(json);
  assert.equal(parsed.version, 1);
  assert.equal(parsed.preset, "essential");
  const result = validatePartialConfig(parsed);
  assert.equal(result.ok, true, `wizard output must validate: ${JSON.stringify(result)}`);
});

test("configTargetPath resolves user vs project locations", () => {
  assert.ok(configTargetPath("project").endsWith(".cc-status-dash.json"));
  assert.ok(configTargetPath("user").includes(".claude"));
});
