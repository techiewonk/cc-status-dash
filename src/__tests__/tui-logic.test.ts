import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import { initialState, reduce, fieldsFor, fieldValue } from "../tui/reducer.js";
import { swatchColor } from "../tui/optionSpec.js";
import { fuzzyFilter, fuzzyScore } from "../tui/picker.js";

// Pure TUI core: editor reducer + fuzzy picker (the Ink view is covered separately
// via ink-testing-library in tui.test.tsx).

function base() {
  return initialState({ ...DEFAULT_CONFIG, lines: [{ style: "inline", widgets: [{ id: "model" }, { id: "context.bar" }] }] });
}

test("navigation wraps around bounds", () => {
  let s = base(); // 1 line, widgets [model, context.bar], cursor (0,0)
  s = reduce(s, { type: "right" });
  assert.deepEqual(s.cursor, { line: 0, widget: 1 });
  s = reduce(s, { type: "right" }); // wraps past last -> first widget
  assert.deepEqual(s.cursor, { line: 0, widget: 0 });
  s = reduce(s, { type: "left" }); // wraps before first -> last widget
  assert.deepEqual(s.cursor, { line: 0, widget: 1 });
  s = reduce(s, { type: "up" }); // single line -> stays on line 0
  assert.equal(s.cursor.line, 0);
});

test("line navigation wraps top↔bottom and clamps the widget", () => {
  let s = initialState({
    ...DEFAULT_CONFIG,
    lines: [
      { style: "inline", widgets: [{ id: "model" }, { id: "cost" }, { id: "git.branch" }] },
      { style: "inline", widgets: [{ id: "version" }] },
    ],
  });
  s = reduce(s, { type: "right" });
  s = reduce(s, { type: "right" }); // (0,2)
  assert.deepEqual(s.cursor, { line: 0, widget: 2 });
  s = reduce(s, { type: "up" }); // wrap to last line, widget clamps to 0
  assert.deepEqual(s.cursor, { line: 1, widget: 0 });
  s = reduce(s, { type: "down" }); // wrap back to first line
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
  s = { ...s, config: { ...s.config, theme: "a" } };
  s = reduce(s, { type: "cycleTheme", themes });
  assert.equal(s.config.theme, "b");
});

test("setPreset replaces lines and resets cursor", () => {
  let s = base();
  s = reduce(s, { type: "setPreset", id: "minimal" });
  assert.equal(s.config.preset, "minimal");
  assert.deepEqual(s.cursor, { line: 0, widget: 0 });
});

// ---- multi-screen editing (option / global / color editors) ----

function withWidget(id: string) {
  return initialState({ ...DEFAULT_CONFIG, lines: [{ style: "inline", widgets: [{ id }] }] });
}

test("options screen toggles, cycles enums, and edits numbers via the engine", () => {
  let s = withWidget("git.branch");
  s = reduce(s, { type: "openScreen", screen: "options" });
  assert.equal(s.screen, "options");
  // fields = git.branch-specific options THEN the universal styling options (every widget)
  const fields = fieldsFor(s);
  assert.deepEqual(fields.slice(0, 4).map((f) => f.key), ["showDirty", "showAheadBehind", "showDiff", "link"]);
  for (const k of ["color", "bgColor", "bold", "dim", "rawValue", "merge"]) {
    assert.ok(fields.some((f) => f.key === k), `universal option ${k} present for every widget`);
  }
  s = reduce(s, { type: "fieldAdjust", dir: 1 }); // toggle showDirty on
  assert.equal(s.config.lines[0].widgets[0].showDirty, true);
  assert.equal(s.config.preset, "custom");

  // enum cycling on context.bar barStyle
  let c = withWidget("context.bar");
  c = reduce(c, { type: "openScreen", screen: "options" });
  c = reduce(c, { type: "fieldDown" }); // -> barStyle
  const spec = fieldsFor(c)[c.field];
  assert.equal(spec.key, "barStyle");
  c = reduce(c, { type: "fieldAdjust", dir: 1 });
  assert.equal(fieldValue(c, spec), "bar"); // blocks -> bar

  // number editing on cwd segments via typing
  let w = withWidget("cwd");
  w = reduce(w, { type: "openScreen", screen: "options" }); // field 0 = segments (number)
  w = reduce(w, { type: "fieldType", input: "3" });
  assert.equal(w.config.lines[0].widgets[0].segments, 3);
  w = reduce(w, { type: "fieldAdjust", dir: -1 });
  assert.equal(w.config.lines[0].widgets[0].segments, 2);
});

test("global screen edits config-level settings", () => {
  let s = initialState({ ...DEFAULT_CONFIG });
  s = reduce(s, { type: "openScreen", screen: "global" });
  // field 0 = charset (enum unicode|text)
  s = reduce(s, { type: "fieldAdjust", dir: 1 });
  assert.equal(s.config.charset, "text");
  // navigate to minimalist (toggle) and flip
  const idx = fieldsFor(s).findIndex((f) => f.key === "minimalist");
  for (let i = 0; i < idx; i++) s = reduce(s, { type: "fieldDown" });
  s = reduce(s, { type: "fieldAdjust", dir: 1 });
  assert.equal(s.config.minimalist, true);
});

test("colors screen overrides a palette key and reset clears it", () => {
  let s = initialState({ ...DEFAULT_CONFIG });
  s = reduce(s, { type: "openScreen", screen: "colors" });
  // clear the existing default (text fields append), then type a hex into key "model"
  for (let i = 0; i < 10; i++) s = reduce(s, { type: "fieldBackspace" });
  for (const ch of "#ff0000") s = reduce(s, { type: "fieldType", input: ch });
  assert.equal(s.config.colors.model, "#ff0000");
  s = reduce(s, { type: "fieldReset" }); // reset deletes the override entirely
  assert.equal(s.config.colors.model, undefined);
  s = reduce(s, { type: "back" });
  assert.equal(s.screen, "layout");
});

test("color picker cycles the palette and still accepts a typed hex", () => {
  // colors screen: every key is now a "color" field (←→ cycles the curated palette).
  let s = initialState({ ...DEFAULT_CONFIG, colors: {} });
  s = reduce(s, { type: "openScreen", screen: "colors" });
  const spec = fieldsFor(s)[s.field];
  assert.equal(spec.kind, "color");
  s = reduce(s, { type: "fieldAdjust", dir: 1 }); // "" -> "black"
  assert.equal(fieldValue(s, spec), "black");
  s = reduce(s, { type: "fieldAdjust", dir: -1 }); // wraps back to "" -> unsets the key
  assert.equal(fieldValue(s, spec), undefined);
  s = reduce(s, { type: "fieldAdjust", dir: -1 }); // wraps to last palette entry
  assert.equal(fieldValue(s, spec), "#ffb86c");
  // typing a custom hex still works on a color field
  for (let i = 0; i < 12; i++) s = reduce(s, { type: "fieldBackspace" });
  for (const ch of "#123456") s = reduce(s, { type: "fieldType", input: ch });
  assert.equal(fieldValue(s, spec), "#123456");
});

test("universal color option is a picker; swatch resolves for named/hex only", () => {
  let s = withWidget("model");
  s = reduce(s, { type: "openScreen", screen: "options" });
  const colorSpec = fieldsFor(s).find((f) => f.key === "color");
  assert.equal(colorSpec?.kind, "color");
  assert.equal(swatchColor("red"), "red");
  assert.equal(swatchColor("#8be9fd"), "#8be9fd");
  assert.equal(swatchColor(""), null);
  assert.equal(swatchColor("none"), null);
  assert.equal(swatchColor("240"), null); // ansi-256 index → no swatch
});

test("field navigation wraps around the row list", () => {
  let s = withWidget("git.branch");
  s = reduce(s, { type: "openScreen", screen: "options" });
  const n = fieldsFor(s).length;
  s = reduce(s, { type: "fieldUp" }); // from 0 wraps to last
  assert.equal(s.field, n - 1);
  s = reduce(s, { type: "fieldDown" }); // wraps back to 0
  assert.equal(s.field, 0);
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
