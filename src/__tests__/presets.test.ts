import { test } from "node:test";
import assert from "node:assert/strict";
import { PRESET_CATALOG, PRESET_LINES, MAX_LAYERS } from "../config/defaults.js";
import { getWidget } from "../widgets/index.js";

// Preset catalog integrity: ids unique, lineCount honest, every referenced widget
// is actually registered, and the new flavors are present.

test("every preset is well-formed and references registered widgets", () => {
  for (const p of PRESET_CATALOG) {
    assert.equal(p.lines.length, p.lineCount, `${p.id}: lineCount mismatch`);
    assert.ok(p.lineCount >= 1 && p.lineCount <= MAX_LAYERS, `${p.id}: lineCount out of range`);
    assert.ok(PRESET_LINES[p.id], `${p.id}: missing from PRESET_LINES`);
    for (const line of p.lines) {
      for (const wc of line.widgets) {
        assert.ok(getWidget(wc.id), `${p.id}: widget "${wc.id}" not registered`);
      }
    }
  }
});

test("preset ids are unique and include the new flavors", () => {
  const ids = PRESET_CATALOG.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate preset id");
  for (const must of ["vibe", "pace", "powerline", "hud", "tokens", "capsule", "pace-focus", "tokens-plus"]) {
    assert.ok(ids.includes(must), `missing preset "${must}"`);
  }
  assert.ok(PRESET_CATALOG.length >= 25, `expected >=25 presets, got ${PRESET_CATALOG.length}`);
});
