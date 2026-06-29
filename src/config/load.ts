import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Config } from "../types.js";
import { DEFAULT_CONFIG, PRESET_LINES } from "./defaults.js";
import { resolvePalette, type ThemeColors } from "../themes/index.js";

// Config resolution order (highest priority last applied wins on merge):
//   defaults < XDG < ~/.claude/cc-status-dash.json < ./.cc-status-dash.json < env < CLI
// This mirrors claude-powerline's layered precedence.

function candidatePaths(cliPath?: string): string[] {
  const paths: string[] = [];
  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg) paths.push(join(xdg, "cc-status-dash", "config.json"));
  const ccDir = process.env.CLAUDE_CONFIG_DIR;
  if (ccDir) paths.push(join(ccDir, "cc-status-dash.json"));
  paths.push(join(homedir(), ".claude", "cc-status-dash.json"));
  paths.push(join(process.cwd(), ".cc-status-dash.json"));
  if (cliPath) paths.push(cliPath);
  return paths;
}

function readJson(path: string): Partial<Config> | null {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf8")) as Partial<Config>;
  } catch {
    // Invalid JSON silently falls back (Claude HUD behavior).
    return null;
  }
}

function applyEnv(cfg: Config): Config {
  const out = { ...cfg };
  if (process.env.CC_STATUS_DASH_THEME) out.theme = process.env.CC_STATUS_DASH_THEME;
  if (process.env.NO_COLOR) out.colorDepth = "none";
  return out;
}

/** Merge a partial config over a base, resolving preset → lines. */
function merge(base: Config, partial: Partial<Config>): Config {
  const merged: Config = {
    ...base,
    ...partial,
    colors: { ...base.colors, ...(partial.colors ?? {}) },
  };
  // If a preset is named and no explicit lines were provided, expand it.
  if (partial.preset && partial.preset !== "custom" && !partial.lines) {
    merged.lines = PRESET_LINES[partial.preset];
  }
  return merged;
}

export interface CliFlags {
  config?: string;
  theme?: string;
  preset?: Config["preset"];
}

export function loadConfig(flags: CliFlags = {}): Config {
  let cfg: Config = { ...DEFAULT_CONFIG };
  // Accumulate only the user's explicit color overrides, so we can apply them
  // on top of whichever theme ends up selected (theme < custom colors).
  const userColors: ThemeColors = {};
  for (const path of candidatePaths(flags.config)) {
    const partial = readJson(path);
    if (partial) {
      if (partial.colors) Object.assign(userColors, partial.colors);
      cfg = merge(cfg, partial);
    }
  }
  cfg = applyEnv(cfg);
  if (flags.theme) cfg.theme = flags.theme;
  if (flags.preset) cfg = merge(cfg, { preset: flags.preset });
  // Final palette = selected theme overlaid with the user's custom colors.
  cfg.colors = resolvePalette(cfg.theme, userColors);
  return cfg;
}
