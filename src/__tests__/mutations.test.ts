import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONFIG, MAX_LAYERS } from "../config/defaults.js";
import * as m from "../config/mutations.js";

// The config-mutation engine is what the TUI / `/configure` drive. These tests
// lock its behavior. Runnable with `node --test` or `bun test`.

test("applyPreset switches lines and marks preset", () => {
  const c = m.applyPreset(DEFAULT_CONFIG, "minimal");
  assert.equal(c.preset, "minimal");
  assert.equal(c.lines.length, 1);
});

test("addWidget / cloneWidget / moveWidget / removeWidget", () => {
  let c = m.applyPreset(DEFAULT_CONFIG, "minimal");
  c = m.addWidget(c, 0, "git.branch");
  assert.deepEqual(c.lines[0].widgets.map((w) => w.id), ["model", "context.bar", "git.branch"]);
  c = m.cloneWidget(c, 0, 0);
  assert.deepEqual(c.lines[0].widgets.map((w) => w.id), ["model", "model", "context.bar", "git.branch"]);
  c = m.moveWidget(c, 0, 0, 2);
  assert.deepEqual(c.lines[0].widgets.map((w) => w.id), ["model", "context.bar", "model", "git.branch"]);
  c = m.removeWidget(c, 0, 0);
  assert.deepEqual(c.lines[0].widgets.map((w) => w.id), ["context.bar", "model", "git.branch"]);
  assert.equal(c.preset, "custom");
});

test("setWidgetOption sets a per-widget option", () => {
  let c = m.applyPreset(DEFAULT_CONFIG, "minimal");
  c = m.setWidgetOption(c, 0, 1, "barStyle", "dots");
  assert.equal(c.lines[0].widgets[1].barStyle, "dots");
});

test("addLine respects MAX_LAYERS", () => {
  let c = m.applyPreset(DEFAULT_CONFIG, "minimal");
  for (let i = 0; i < 10; i++) c = m.addLine(c, "inline");
  assert.equal(c.lines.length, MAX_LAYERS);
});

test("setTheme / setGlobal are immutable-ish and update fields", () => {
  const base = m.applyPreset(DEFAULT_CONFIG, "minimal");
  const themed = m.setTheme(base, "nord");
  assert.equal(themed.theme, "nord");
  assert.notEqual(themed, base);
  const padded = m.setGlobal(base, "padding", 2);
  assert.equal(padded.padding, 2);
});

test("out-of-range edits are no-ops", () => {
  const c = m.applyPreset(DEFAULT_CONFIG, "minimal");
  assert.equal(m.removeWidget(c, 9, 0), c);
  assert.equal(m.moveWidget(c, 0, 5, 0), c);
});
