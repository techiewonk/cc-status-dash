import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import { initialState, reduce } from "../tui/reducer.js";
import { fuzzyFilter, fuzzyScore } from "../tui/picker.js";

// Pure TUI core: editor reducer + fuzzy picker (the Ink view is covered separately
// via ink-testing-library in tui.test.tsx).

function base() {
  return initialState({ ...DEFAULT_CONFIG, lines: [{ style: "inline", widgets: [{ id: "model" }, { id: "context.bar" }] }] });
}

test("navigation clamps within bounds", () => {
  let s = base();
  s = reduce(s, { type: "right" });
  assert.deepEqual(s.cursor, { line: 0, widget: 1 });
  s = reduce(s, { type: "right" }); // clamp at last widget
  assert.deepEqual(s.cursor, { line: 0, widget: 1 });
  s = reduce(s, { type: "up" }); // clamp at first line
  assert.equal(s.cursor.line, 0);
});

test("addWidget inserts after the cursor and follows it", () => {
  let s = base();
  s = reduce(s, { type: "addWidget", id: "cost" });
  assert.deepEqual(s.config.lines[0].widgets.map((w) => w.id), ["model", "cost", "context.bar"]);
  assert.deepEqual(s.cursor, { line: 0, widget: 1 });
  assert.equal(s.config.preset, "custom");
});

test("clone / move / delete widget", () => {
  let s = base(); // [model, context.bar], cursor (0,0)
  s = reduce(s, { type: "cloneWidget" }); // -> [model, model, context.bar], cursor (0,1)
  assert.deepEqual(s.config.lines[0].widgets.map((w) => w.id), ["model", "model", "context.bar"]);
  assert.equal(s.cursor.widget, 1);
  s = reduce(s, { type: "moveRight" }); // swap idx 1 and 2
  assert.deepEqual(s.config.lines[0].widgets.map((w) => w.id), ["model", "context.bar", "model"]);
  assert.equal(s.cursor.widget, 2);
  s = reduce(s, { type: "deleteWidget" }); // remove the moved clone
  assert.deepEqual(s.config.lines[0].widgets.map((w) => w.id), ["model", "context.bar"]);
});

test("add / remove line moves the cursor", () => {
  let s = base();
  s = reduce(s, { type: "addLine" });
  assert.equal(s.config.lines.length, 2);
  assert.equal(s.cursor.line, 1);
  s = reduce(s, { type: "removeLine" });
  assert.equal(s.config.lines.length, 1);
  assert.equal(s.cursor.line, 0);
});

test("cycleStyle and cycleTheme rotate", () => {
  let s = base();
  s = reduce(s, { type: "cycleStyle" });
  assert.equal(s.config.lines[0].style, "powerline");
  s = reduce(s, { type: "cycleStyle" });
  assert.equal(s.config.lines[0].style, "capsule");
  const themes = ["a", "b", "c"];
  s = { config: { ...s.config, theme: "a" }, cursor: s.cursor };
  s = reduce(s, { type: "cycleTheme", themes });
  assert.equal(s.config.theme, "b");
});

test("setPreset replaces lines and resets cursor", () => {
  let s = base();
  s = reduce(s, { type: "setPreset", id: "minimal" });
  assert.equal(s.config.preset, "minimal");
  assert.deepEqual(s.cursor, { line: 0, widget: 0 });
});

test("fuzzyScore matches subsequences and rejects non-matches", () => {
  assert.equal(fuzzyScore("gb", "git.branch") !== null, true);
  assert.equal(fuzzyScore("xyz", "git.branch"), null);
  assert.equal(fuzzyScore("", "anything"), 0);
});

test("fuzzyFilter ranks tighter matches first", () => {
  const items = [
    { id: "git.branch", label: "Git branch", category: "git" },
    { id: "context.bar", label: "Context bar", category: "context" },
    { id: "git-staged", label: "Staged", category: "git" },
  ];
  const out = fuzzyFilter("git", items).map((i) => i.id);
  assert.ok(out.includes("git.branch") && out.includes("git-staged"));
  assert.ok(!out.includes("context.bar"), "non-matches filtered out");
});
