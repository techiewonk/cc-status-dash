import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validatePartialConfig,
  migrateConfig,
  CURRENT_CONFIG_VERSION,
} from "../config/schema.js";

// Locks the valibot config-validation layer. Runnable with `node --test` or `bun test`.

test("accepts a valid partial config", () => {
  const r = validatePartialConfig({
    theme: "tokyo-night",
    charset: "text",
    padding: 2,
    lines: [{ style: "powerline", widgets: [{ id: "model" }, { id: "context.bar" }] }],
    colors: { model: "cyan" },
  });
  assert.equal(r.ok, true);
  assert.equal(r.value?.theme, "tokyo-night");
  assert.equal(r.value?.lines?.[0].widgets.length, 2);
});

test("accepts an empty config", () => {
  const r = validatePartialConfig({});
  assert.equal(r.ok, true);
});

test("preserves unknown widget options (looseObject passthrough)", () => {
  const r = validatePartialConfig({
    lines: [{ widgets: [{ id: "cwd", segments: 2, custom: "x" }] }],
  });
  assert.equal(r.ok, true);
  const w = r.value?.lines?.[0].widgets[0] as Record<string, unknown>;
  assert.equal(w.segments, 2);
  assert.equal(w.custom, "x");
});

test("rejects wrong field types", () => {
  const r = validatePartialConfig({ padding: "lots" });
  assert.equal(r.ok, false);
  assert.ok(r.issues.length >= 1);
  assert.ok(r.issues.some((i) => i.includes("padding")));
});

test("rejects an invalid enum value", () => {
  const r = validatePartialConfig({ charset: "emoji" });
  assert.equal(r.ok, false);
});

test("rejects a widget missing its id", () => {
  const r = validatePartialConfig({ lines: [{ widgets: [{ mode: "remaining" }] }] });
  assert.equal(r.ok, false);
});

test("rejects non-string color values", () => {
  const r = validatePartialConfig({ colors: { model: 123 } });
  assert.equal(r.ok, false);
});

test("migrateConfig stamps the current version on legacy configs", () => {
  const out = migrateConfig({ theme: "x" }) as { version?: number };
  assert.equal(out.version, 1);
});

test("migrateConfig leaves non-objects untouched", () => {
  assert.equal(migrateConfig(null), null);
  assert.equal(migrateConfig(42), 42);
});

test("validatePartialConfig reports the resolved version", () => {
  const r = validatePartialConfig({ theme: "x" });
  assert.equal(r.ok, true);
  assert.equal(r.version, CURRENT_CONFIG_VERSION);
});
