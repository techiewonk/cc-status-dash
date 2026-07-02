#!/usr/bin/env node
import { loadConfig, validateConfigFiles, getInvalidConfigFiles, type CliFlags } from "./config/load.js";
import { collectProviderData } from "./data/providers.js";
import { writeUsageSidecar } from "./data/sidecar.js";
import { render } from "./render/renderer.js";
import { listThemes } from "./themes/index.js";
import { listWidgets } from "./widgets/index.js";
import { PRESET_CATALOG } from "./config/defaults.js";
import type { StatuslineInput } from "./types.js";

// Entry point. Claude Code pipes a JSON status payload on stdin and expects the
// rendered status line(s) on stdout. We also expose a few inspection flags so
// the project is usable/debuggable before the Ink TUI lands.

function parseFlags(argv: string[]): CliFlags & { listThemes?: boolean; listWidgets?: boolean; listPresets?: boolean; validate?: boolean; configure?: boolean; tui?: boolean; hook?: boolean; install?: boolean; installHooks?: boolean; dryRun?: boolean } {
  const flags: ReturnType<typeof parseFlags> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--hook") flags.hook = true;
    else if (a === "--install") flags.install = true;
    else if (a === "--install-hooks" || a === "--with-hooks") flags.installHooks = true;
    else if (a === "--dry-run") flags.dryRun = true;
    else if (a === "--config") flags.config = argv[++i];
    else if (a.startsWith("--config=")) flags.config = a.slice(9);
    else if (a === "--theme") flags.theme = argv[++i];
    else if (a.startsWith("--theme=")) flags.theme = a.slice(8);
    else if (a === "--preset") flags.preset = argv[++i] as CliFlags["preset"];
    else if (a.startsWith("--preset=")) flags.preset = a.slice(9) as CliFlags["preset"];
    else if (a === "--profile") flags.profile = argv[++i];
    else if (a.startsWith("--profile=")) flags.profile = a.slice(10);
    else if (a === "--list-themes") flags.listThemes = true;
    else if (a === "--list-widgets") flags.listWidgets = true;
    else if (a === "--list-presets") flags.listPresets = true;
    else if (a === "--validate") flags.validate = true;
    else if (a === "--configure" || a === "--wizard") flags.configure = true;
    else if (a === "--tui" || a === "--edit") flags.tui = true;
  }
  return flags;
}

/** `--validate`: report on each config file in the resolution chain. Exits 1 if any is invalid. */
function runValidate(cliPath?: string): void {
  const reports = validateConfigFiles(cliPath);
  if (reports.length === 0) {
    process.stdout.write("No config files found (using built-in defaults).\n");
    return;
  }
  let bad = false;
  for (const r of reports) {
    if (r.ok) {
      process.stdout.write(`OK   ${r.path} (v${r.version})\n`);
    } else {
      bad = true;
      process.stdout.write(`FAIL ${r.path}\n`);
      for (const issue of r.issues) process.stdout.write(`       - ${issue}\n`);
    }
  }
  if (bad) process.exitCode = 1;
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  // Bound the read: a runaway/huge payload must never make the statusline hang or
  // balloon memory. 256 KB is far above any real Claude Code status payload.
  const MAX_BYTES = 256 * 1024;
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of process.stdin) {
    const b = chunk as Buffer;
    chunks.push(b);
    total += b.length;
    if (total >= MAX_BYTES) break;
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  // Kill switch (Claude HUD CLAUDE_HUD_DISABLE parity): emit nothing and exit.
  if (process.env.CC_STATUS_DASH_DISABLE) return;
  const flags = parseFlags(process.argv.slice(2));

  // `--hook`: consume a Claude Code hook payload on stdin and record the skill
  // invocation (PreToolUse:Skill / UserPromptSubmit /slash). Prints nothing; this
  // process is a side-effect-only cache writer, not a render.
  if (flags.hook) {
    const { handleSkillHook } = await import("./data/skills-cache.js");
    handleSkillHook(await readStdin());
    return;
  }

  // `--install` [--install-hooks] [--dry-run]: write the statusLine block (and,
  // with --install-hooks, the skills-cache hooks) into Claude Code's settings.json.
  if (flags.install || flags.installHooks) {
    const { installStatusline, buildSettings, detectCommand, settingsPath, describeExistingStatusline } = await import("./config/install.js");
    const opts = { command: detectCommand(), refreshInterval: 10, padding: 0, installHooks: Boolean(flags.installHooks) };
    if (flags.dryRun) {
      const { readFileSync, existsSync } = await import("node:fs");
      const p = settingsPath();
      let existing: Record<string, unknown> = {};
      try { if (existsSync(p)) existing = JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>; } catch { /* show merge over {} */ }
      // Surface any existing statusLine first — a /setup-driving agent (or a human)
      // should see this before deciding to run the real (non-dry-run) install.
      const existingLine = describeExistingStatusline();
      if (existingLine.kind === "own") process.stdout.write(`# existing statusLine: cc-status-dash (reinstall/update — safe to replace)\n`);
      else if (existingLine.kind === "known") process.stdout.write(`# existing statusLine: ${existingLine.knownAs} — ask before replacing\n# command: ${existingLine.command}\n`);
      else if (existingLine.kind === "custom") process.stdout.write(`# existing statusLine: custom/unknown script — ask before replacing\n# command: ${existingLine.command}\n`);
      else process.stdout.write(`# existing statusLine: none (clean install)\n`);
      process.stdout.write(`# would write ${p}\n${JSON.stringify(buildSettings(existing, opts), null, 2)}\n`);
      return;
    }
    const res = installStatusline(opts);
    if (res.ok) {
      process.stdout.write(
        `Installed statusLine${opts.installHooks ? " + skills hooks" : ""} → ${res.path}` +
        `${res.backedUp ? " (backup: settings.json.bak)" : ""}\nRestart Claude Code to apply.\n`,
      );
    } else {
      process.stderr.write(`cc-status-dash: install failed: ${res.error}\n`);
      process.exitCode = 1;
    }
    return;
  }

  if (flags.listThemes) {
    process.stdout.write(listThemes().join("\n") + "\n");
    return;
  }
  if (flags.listWidgets) {
    process.stdout.write(
      listWidgets().map((w) => `${w.id.padEnd(18)} ${w.category.padEnd(9)} ${w.label}`).join("\n") + "\n",
    );
    return;
  }
  if (flags.listPresets) {
    process.stdout.write(
      PRESET_CATALOG.map((p) => `${p.id.padEnd(18)} ${String(p.lineCount)}L  ${p.description}`).join("\n") + "\n",
    );
    return;
  }
  if (flags.validate) {
    runValidate(flags.config);
    return;
  }
  if (flags.configure) {
    if (!process.stdin.isTTY) {
      process.stderr.write("cc-status-dash: --configure needs an interactive terminal.\n");
      process.exitCode = 1;
      return;
    }
    const { runWizard } = await import("./config/wizard.js"); // lazy: keep @clack off the render path
    await runWizard();
    return;
  }
  if (flags.tui) {
    if (!process.stdin.isTTY) {
      process.stderr.write("cc-status-dash: --tui needs an interactive terminal.\n");
      process.exitCode = 1;
      return;
    }
    const initial = loadConfig(flags);
    const [{ launchTui }, { configTargetPath }] = await Promise.all([
      import("./tui/launch.js"), // lazy: keep ink/react off the render path
      import("./config/wizard.js"),
    ]);
    await launchTui(initial, flags.config ?? configTargetPath("user"));
    return;
  }

  const config = loadConfig(flags);

  let input: StatuslineInput = {};
  const raw = await readStdin();
  if (raw.trim()) {
    try {
      input = JSON.parse(raw) as StatuslineInput;
    } catch {
      // Worst case: print the model name (claude-pace philosophy — never crash).
      process.stdout.write("Claude\n");
      return;
    }
  }

  writeUsageSidecar(input, Date.now()); // opt-in (CC_STATUS_DASH_USAGE_SIDECAR); no-op otherwise
  const data = collectProviderData(input, config);
  let out = render({ input, config, data });
  // Hot-path badge: a config file that existed but failed to parse/validate was
  // silently skipped (defaults used) — surface it so the user isn't left confused.
  if (getInvalidConfigFiles().length > 0) {
    out = `${config.charset === "text" ? "[!cfg] " : "⚠ "}${out}`;
  }
  process.stdout.write(out + "\n");
}

main().catch(() => {
  // Never break Claude Code's UI if something unexpected happens.
  process.stdout.write("Claude\n");
});
