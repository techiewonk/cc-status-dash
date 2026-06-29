import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../config/load.js";

// Exhaustive config-resolution coverage: every location layer in the chain
// (defaults < XDG < CLAUDE_CONFIG_DIR < ~/.claude < ./project < --config < env < CLI flag).
// We fully isolate HOME / cwd / XDG / CLAUDE_CONFIG_DIR into temp dirs so the ladder
// is deterministic regardless of the developer's real config files. All edits are
// synchronous and restored in `finally`.

function writeCfg(path: string, obj: unknown) {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(obj), "utf8");
}

test("config resolution honors the full location precedence ladder", () => {
  const root = mkdtempSync(join(tmpdir(), "ccsd-loc-"));
  const home = join(root, "home");
  const proj = join(root, "proj");
  const xdg = join(root, "xdg");
  const ccdir = join(root, "ccdir");
  const cliPath = join(root, "cli.json");
  mkdirSync(proj, { recursive: true });

  const saved = {
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
    CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR,
    CC_STATUS_DASH_THEME: process.env.CC_STATUS_DASH_THEME,
    NO_COLOR: process.env.NO_COLOR,
    cwd: process.cwd(),
  };
  try {
    process.env.HOME = home;
    process.env.USERPROFILE = home; // os.homedir() on Windows reads USERPROFILE
    delete process.env.CC_STATUS_DASH_THEME;
    delete process.env.NO_COLOR;
    process.chdir(proj);

    const xdgFile = join(xdg, "cc-status-dash", "config.json");
    const ccdirFile = join(ccdir, "cc-status-dash.json");
    const homeFile = join(home, ".claude", "cc-status-dash.json");
    const projFile = join(proj, ".cc-status-dash.json");

    // --- file-layer ladder, proven via the free-form `separator` field ---
    process.env.XDG_CONFIG_HOME = xdg;
    writeCfg(xdgFile, { separator: "xdg" });
    assert.equal(loadConfig().separator, "xdg", "XDG over defaults");

    process.env.CLAUDE_CONFIG_DIR = ccdir;
    writeCfg(ccdirFile, { separator: "ccdir" });
    assert.equal(loadConfig().separator, "ccdir", "CLAUDE_CONFIG_DIR over XDG");

    writeCfg(homeFile, { separator: "home" });
    assert.equal(loadConfig().separator, "home", "~/.claude over CLAUDE_CONFIG_DIR");

    writeCfg(projFile, { separator: "proj" });
    assert.equal(loadConfig().separator, "proj", "project over ~/.claude");

    writeCfg(cliPath, { separator: "cli" });
    assert.equal(loadConfig({ config: cliPath }).separator, "cli", "--config over project");

    // --- env + CLI flag override the whole file chain (via theme) ---
    writeCfg(cliPath, { separator: "cli", theme: "nord" });
    assert.equal(loadConfig({ config: cliPath }).theme, "nord", "theme from --config file");

    process.env.CC_STATUS_DASH_THEME = "mono";
    assert.equal(loadConfig({ config: cliPath }).theme, "mono", "env theme over files");

    assert.equal(loadConfig({ config: cliPath, theme: "gruvbox" }).theme, "gruvbox", "CLI flag over env");

    // --- NO_COLOR forces colorDepth none ---
    delete process.env.CC_STATUS_DASH_THEME;
    process.env.NO_COLOR = "1";
    assert.equal(loadConfig().colorDepth, "none", "NO_COLOR -> depth none");
    delete process.env.NO_COLOR;

    // --- preset flag expands lines ---
    assert.equal(loadConfig({ preset: "full" }).lines.length, 3, "preset full -> 3 lines");
    assert.equal(loadConfig({ preset: "minimal" }).lines.length, 1, "preset minimal -> 1 line");

    // --- custom colors merge over the theme ---
    writeCfg(cliPath, { theme: "nord", colors: { model: "#123456" } });
    assert.equal(loadConfig({ config: cliPath }).colors.model, "#123456", "custom color overrides theme");
  } finally {
    process.chdir(saved.cwd);
    for (const [k, v] of Object.entries(saved)) {
      if (k === "cwd") continue;
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    rmSync(root, { recursive: true, force: true });
  }
});

test("invalid config files are skipped, not fatal", () => {
  const root = mkdtempSync(join(tmpdir(), "ccsd-bad-"));
  const cliPath = join(root, "bad.json");
  try {
    writeFileSync(cliPath, '{"padding":"lots","charset":"emoji"}', "utf8");
    const cfg = loadConfig({ config: cliPath });
    // Falls back to defaults rather than applying the invalid values.
    assert.equal(typeof cfg.padding, "number");
    assert.notEqual(cfg.charset, "emoji");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
