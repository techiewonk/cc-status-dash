import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { render } from "ink-testing-library";
import { App } from "../tui/app.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import { resolvePalette } from "../themes/index.js";

// Headless Ink component test — proves the actual TUI mounts and responds to
// simulated keystrokes without a real terminal.

const cfg = { ...DEFAULT_CONFIG, colors: resolvePalette(DEFAULT_CONFIG.theme) };
const tick = () => new Promise((r) => setTimeout(r, 30));

test("TUI mounts: shows header, preview, theme and help", () => {
  const { lastFrame, unmount } = render(createElement(App, { initial: cfg, savePath: "/tmp/ccsd-test.json" }));
  const f = lastFrame() ?? "";
  assert.ok(f.includes("cc-status-dash editor"), `header missing:\n${f}`);
  assert.ok(f.includes("theme:"), "theme line missing");
  assert.ok(f.includes("save"), "help line missing");
  unmount();
});

test("typing 'a' then a query opens the picker and filters", async () => {
  const { lastFrame, stdin, unmount } = render(createElement(App, { initial: cfg, savePath: "/tmp/ccsd-test.json" }));
  stdin.write("a");
  await tick();
  assert.ok((lastFrame() ?? "").includes("add widget:"), "picker did not open");
  stdin.write("git");
  await tick();
  assert.ok(/git\./.test(lastFrame() ?? ""), `expected git widgets:\n${lastFrame()}`);
  unmount();
});

test("'i' opens the install overlay and 'h' toggles the skills hooks", async () => {
  const { lastFrame, stdin, unmount } = render(createElement(App, { initial: cfg, savePath: "/tmp/ccsd-test.json" }));
  stdin.write("i");
  await tick();
  let f = lastFrame() ?? "";
  assert.ok(f.includes("install into Claude Code settings.json"), `overlay missing:\n${f}`);
  assert.ok(/skills hooks:\s*off/.test(f), "hooks should default off");
  stdin.write("h");
  await tick();
  f = lastFrame() ?? "";
  assert.ok(/skills hooks:\s*on/.test(f), `toggle to on failed:\n${f}`);
  unmount();
});
