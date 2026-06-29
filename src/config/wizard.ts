import { writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Config, LineStyle } from "../types.js";
import { DEFAULT_CONFIG, presetsByLineCount } from "./defaults.js";
import { applyPreset, setGlobal, setLineStyle, setTheme } from "./mutations.js";
import { CURRENT_CONFIG_VERSION } from "./schema.js";
import { listThemes } from "../themes/index.js";

// Preset wizard (Claude HUD `/configure` flavor) built on @clack/prompts. The
// interactive layer is intentionally thin — all decisions funnel through the pure
// `buildWizardConfig`, which is unit-tested. @clack is imported lazily so the
// render hot path never loads it.

export interface WizardChoices {
  preset: string;
  theme: string;
  /** Override every line's style; undefined keeps the preset's own styles. */
  style?: LineStyle;
  minimalist?: boolean;
  charset?: Config["charset"];
}

/** Pure: turn wizard answers into the Config to persist. */
export function buildWizardConfig(choices: WizardChoices): Config {
  let cfg = applyPreset(DEFAULT_CONFIG, choices.preset);
  cfg = setTheme(cfg, choices.theme);
  if (choices.style) {
    for (let i = 0; i < cfg.lines.length; i++) cfg = setLineStyle(cfg, i, choices.style);
    cfg.preset = choices.preset; // setLineStyle marks "custom"; keep the chosen preset id
  }
  if (choices.minimalist !== undefined) cfg = setGlobal(cfg, "minimalist", choices.minimalist);
  if (choices.charset) cfg = setGlobal(cfg, "charset", choices.charset);
  return cfg;
}

/** Serialize only the meaningful fields so the saved file stays small + readable. */
export function serializeConfig(cfg: Config): string {
  const out = {
    version: CURRENT_CONFIG_VERSION,
    preset: cfg.preset,
    theme: cfg.theme,
    charset: cfg.charset,
    minimalist: cfg.minimalist,
    lines: cfg.lines,
  };
  return JSON.stringify(out, null, 2) + "\n";
}

export function configTargetPath(scope: "user" | "project"): string {
  return scope === "user"
    ? join(homedir(), ".claude", "cc-status-dash.json")
    : join(process.cwd(), ".cc-status-dash.json");
}

/** Interactive wizard. Returns the written path, or null if cancelled. */
export async function runWizard(): Promise<string | null> {
  const p = await import("@clack/prompts");
  p.intro("cc-status-dash setup");

  const byCount = presetsByLineCount();
  const counts = Object.keys(byCount).map(Number).sort((a, b) => a - b);

  const density = await p.select({
    message: "How many status lines?",
    options: counts.map((n) => ({ value: n, label: `${n} line${n === 1 ? "" : "s"}`, hint: `${byCount[n].length} presets` })),
  });
  if (p.isCancel(density)) { p.cancel("Cancelled."); return null; }

  const preset = await p.select({
    message: "Pick a layout preset",
    options: byCount[density as number].map((d) => ({ value: d.id, label: d.name, hint: d.description })),
  });
  if (p.isCancel(preset)) { p.cancel("Cancelled."); return null; }

  const theme = await p.select({
    message: "Theme",
    options: listThemes().map((t) => ({ value: t, label: t })),
  });
  if (p.isCancel(theme)) { p.cancel("Cancelled."); return null; }

  const style = await p.select({
    message: "Render style",
    options: [
      { value: "", label: "Preset default" },
      { value: "inline", label: "Inline" },
      { value: "powerline", label: "Powerline" },
      { value: "capsule", label: "Capsule" },
    ],
  });
  if (p.isCancel(style)) { p.cancel("Cancelled."); return null; }

  const minimalist = await p.confirm({ message: "Minimalist (drop labels)?", initialValue: false });
  if (p.isCancel(minimalist)) { p.cancel("Cancelled."); return null; }

  const scope = await p.select({
    message: "Where should the config be saved?",
    options: [
      { value: "user", label: "User", hint: "~/.claude/cc-status-dash.json" },
      { value: "project", label: "Project", hint: "./.cc-status-dash.json" },
    ],
  });
  if (p.isCancel(scope)) { p.cancel("Cancelled."); return null; }

  const cfg = buildWizardConfig({
    preset: preset as string,
    theme: theme as string,
    style: ((style as string) || undefined) as LineStyle | undefined,
    minimalist: minimalist as boolean,
  });
  const path = configTargetPath(scope as "user" | "project");
  writeFileSync(path, serializeConfig(cfg), "utf8");
  p.outro(`Saved ${path} — it reloads on the next render (no restart needed).`);
  return path;
}
