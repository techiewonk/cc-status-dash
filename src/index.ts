#!/usr/bin/env node
import { loadConfig, validateConfigFiles, type CliFlags } from "./config/load.js";
import { collectProviderData } from "./data/providers.js";
import { render } from "./render/renderer.js";
import { listThemes } from "./themes/index.js";
import { listWidgets } from "./widgets/index.js";
import { PRESET_CATALOG } from "./config/defaults.js";
import type { StatuslineInput } from "./types.js";

// Entry point. Claude Code pipes a JSON status payload on stdin and expects the
// rendered status line(s) on stdout. We also expose a few inspection flags so
// the project is usable/debuggable before the Ink TUI lands.

function parseFlags(argv: string[]): CliFlags & { listThemes?: boolean; listWidgets?: boolean; listPresets?: boolean; validate?: boolean; configure?: boolean; tui?: boolean } {
  const flags: ReturnType<typeof parseFlags> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--config") flags.config = argv[++i];
    else if (a.startsWith("--config=")) flags.config = a.slice(9);
    else if (a === "--theme") flags.theme = argv[++i];
    else if (a.startsWith("--theme=")) flags.theme = a.slice(8);
    else if (a === "--preset") flags.preset = argv[++i] as CliFlags["preset"];
    else if (a.startsWith("--preset=")) flags.preset = a.slice(9) as CliFlags["preset"];
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
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));

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

  const data = collectProviderData(input, config);
  const out = render({ input, config, data });
  process.stdout.write(out + "\n");
}

main().catch(() => {
  // Never break Claude Code's UI if something unexpected happens.
  process.stdout.write("Claude\n");
});
