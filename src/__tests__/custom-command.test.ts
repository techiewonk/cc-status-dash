import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execPath } from "node:process";
import type { RenderContext, StatuslineInput } from "../types.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import { resolvePalette } from "../themes/index.js";
import { getWidget } from "../widgets/index.js";

// ccstatusline CustomCommand parity: `timeout` (ms) override and `preserveColors`
// (skip stripping the command's own ANSI so it drives coloring directly).
// Scripts are written to a temp .js file and invoked as `node <path>` (quoting a
// literal ESC byte through a shell's own -e/-c argument parsing is fragile and
// shell-dependent — a file sidesteps that entirely, cross-platform).

const INPUT: StatuslineInput = {};

function renderCustomCommand(opts: Record<string, unknown>): string {
  const config = { ...DEFAULT_CONFIG, colors: resolvePalette(DEFAULT_CONFIG.theme) };
  const ctx: RenderContext = { input: INPUT, data: {}, config };
  const w = getWidget("custom-command")!;
  return w.render(w.collect(ctx), opts, ctx).map((s) => s.text).join("");
}

function withScript(source: string, fn: (command: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), "ccsd-cmd-"));
  const file = join(dir, "script.js");
  writeFileSync(file, source, "utf8");
  try { fn(`"${execPath}" "${file}"`); } finally { rmSync(dir, { recursive: true, force: true }); }
}

// Recursively re-invoking the current runtime (bun/node) cold-starts slower than
// the widget's 300ms default timeout — pass a generous explicit timeout (the very
// option under test) rather than fight the default.
const SPAWN_TIMEOUT = 5000;

test("custom-command strips the command's own ANSI codes by default", () => {
  withScript("process.stdout.write('\\x1b[31mred\\x1b[0m')", (command) => {
    const out = renderCustomCommand({ command, timeout: SPAWN_TIMEOUT });
    assert.equal(out, "red", `ANSI should be stripped by default, got ${JSON.stringify(out)}`);
  });
});

test("preserveColors:true keeps the command's own ANSI codes", () => {
  withScript("process.stdout.write('\\x1b[31mred\\x1b[0m')", (command) => {
    const out = renderCustomCommand({ command, preserveColors: true, timeout: SPAWN_TIMEOUT });
    assert.equal(out, "\x1b[31mred\x1b[0m", `ANSI should be preserved, got ${JSON.stringify(out)}`);
  });
});

test("timeout option is honored (a slow-to-spawn recursive runtime call still succeeds with a generous timeout)", () => {
  withScript("process.stdout.write('ok')", (command) => {
    const out = renderCustomCommand({ command, timeout: SPAWN_TIMEOUT });
    assert.equal(out, "ok");
  });
});

test("a command that exceeds its timeout renders nothing (never throws into the render path)", () => {
  withScript("setTimeout(() => {}, 2000)", (command) => {
    const out = renderCustomCommand({ command, timeout: 50 });
    assert.equal(out, "");
  });
});
