import { writeFileSync, mkdirSync, readFileSync, existsSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
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

/**
 * Serialize the editor-managed fields, merged over any existing file contents so
 * hand-edited fields the editor doesn't manage (e.g. custom `colors`) survive.
 */
export function serializeConfig(cfg: Config, existing?: Record<string, unknown>): string {
  const out: Record<string, unknown> = { ...(existing ?? {}) };
  out.version = CURRENT_CONFIG_VERSION;
  out.preset = cfg.preset;
  out.theme = cfg.theme;
  out.charset = cfg.charset;
  out.minimalist = cfg.minimalist;
  out.globalBold = cfg.globalBold;
  out.padding = cfg.padding;
  out.autoWrap = cfg.autoWrap;
  out.separator = cfg.separator;
  out.colorDepth = cfg.colorDepth;
  out.lines = cfg.lines;
  if (cfg.refreshInterval !== undefined) out.refreshInterval = cfg.refreshInterval;
  if (cfg.modelContextLimits) out.modelContextLimits = cfg.modelContextLimits;
  return JSON.stringify(out, null, 2) + "\n";
}

export function configTargetPath(scope: "user" | "project"): string {
  return scope === "user"
    ? join(homedir(), ".claude", "cc-status-dash.json")
    : join(process.cwd(), ".cc-status-dash.json");
}

/**
 * Write a config to disk: creates the parent dir, preserves unmanaged fields from
 * any existing file, and never throws (returns an error string instead).
 */
export function writeConfig(path: string, cfg: Config): { ok: true } | { ok: false; error: string } {
  try {
    let existing: Record<string, unknown> | undefined;
    try {
      if (existsSync(path)) existing = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    } catch {
      /* ignore a corrupt existing file — we'll overwrite it */
    }
    mkdirSync(dirname(path), { recursive: true });
    // Atomic write so a concurrent render never reads a half-written config.
    const tmp = `${path}.${process.pid}.tmp`;
    writeFileSync(tmp, serializeConfig(cfg, existing), "utf8");
    renameSync(tmp, path);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
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
  const res = writeConfig(path, cfg);
  if (!res.ok) {
    p.cancel(`Failed to save ${path}: ${res.error}`);
    return null;
  }
  p.outro(`Saved ${path} — it reloads on the next render (no restart needed).`);
  return path;
}
