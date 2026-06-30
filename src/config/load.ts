import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Config } from "../types.js";
import { DEFAULT_CONFIG, PRESET_LINES } from "./defaults.js";
import { resolvePalette, type ThemeColors } from "../themes/index.js";
import { validatePartialConfig } from "./schema.js";

// Config resolution order (highest priority last applied wins on merge):
//   defaults < XDG < ~/.claude/cc-status-dash.json < ./.cc-status-dash.json < env < CLI
// This mirrors claude-powerline's layered precedence.

interface Candidate {
  path: string;
  trusted: boolean;
}

// Mirror os.homedir()'s platform source-of-truth (USERPROFILE on Windows, HOME on
// POSIX) but read it at call time. os.homedir() snapshots the env at process startup
// on POSIX, so an explicitly-set HOME would otherwise be ignored — which both breaks
// hermetic tests on Linux and silently disregards a user's overridden home.
function userHome(): string {
  const fromEnv = process.platform === "win32" ? process.env.USERPROFILE : process.env.HOME;
  return fromEnv || homedir();
}

function candidatePaths(cliPath?: string): Candidate[] {
  const paths: Candidate[] = [];
  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg) paths.push({ path: join(xdg, "cc-status-dash", "config.json"), trusted: true });
  const ccDir = process.env.CLAUDE_CONFIG_DIR;
  if (ccDir) paths.push({ path: join(ccDir, "cc-status-dash.json"), trusted: true });
  paths.push({ path: join(userHome(), ".claude", "cc-status-dash.json"), trusted: true });
  // Project-local config is read from the repo you open — UNTRUSTED.
  paths.push({ path: join(process.cwd(), ".cc-status-dash.json"), trusted: false });
  if (cliPath) paths.push({ path: cliPath, trusted: true }); // explicitly passed by the user
  return paths;
}

// Widgets that execute shell commands or surface env vars must never come from an
// untrusted (repo-local) config — that would be RCE / secret-exfiltration just from
// opening a malicious repository.
const UNSAFE_FROM_UNTRUSTED = new Set(["custom-command", "git-pr", "env", "external-usage"]);

function stripUnsafeWidgets(partial: Partial<Config>): Partial<Config> {
  if (!partial.lines) return partial;
  return {
    ...partial,
    lines: partial.lines.map((l) => ({
      ...l,
      widgets: l.widgets.filter((wc) => !UNSAFE_FROM_UNTRUSTED.has(wc.id)),
    })),
  };
}

/** Warn to stderr only — stdout is reserved for the rendered statusline. */
function warn(msg: string): void {
  try {
    process.stderr.write(`cc-status-dash: ${msg}\n`);
  } catch {
    /* ignore */
  }
}

// Config files that existed but failed to parse/validate during the last loadConfig().
// Surfaced as a hot-path badge by index.ts so a corrupt file isn't silently ignored.
let invalidConfigFiles: string[] = [];
/** Paths of config files skipped (bad JSON / failed validation) in the last load. */
export function getInvalidConfigFiles(): string[] {
  return invalidConfigFiles;
}

function readJson(path: string): Partial<Config> | null {
  let raw: unknown;
  try {
    if (!existsSync(path)) return null;
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    warn(`ignoring config ${path}: invalid JSON`);
    invalidConfigFiles.push(path);
    return null;
  }
  // Validate shape/types; on failure warn (to stderr) and fall back to skipping
  // this file rather than letting a malformed value reach the render path.
  const result = validatePartialConfig(raw);
  if (!result.ok) {
    warn(`ignoring invalid config ${path}: ${result.issues.join("; ")}`);
    invalidConfigFiles.push(path);
    return null;
  }
  return result.value;
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
  // If a preset is named and no explicit lines were provided, expand it — but
  // only if it's a real preset id (an unknown id must not blank `lines`).
  if (partial.preset && partial.preset !== "custom" && !partial.lines) {
    const pl = PRESET_LINES[partial.preset];
    if (pl) merged.lines = pl;
    else merged.preset = base.preset; // unknown preset → keep base lines/preset
  }
  return merged;
}

export interface CliFlags {
  config?: string;
  theme?: string;
  preset?: Config["preset"];
  profile?: string;
}

export interface ConfigFileReport {
  path: string;
  ok: boolean;
  version: number;
  issues: string[];
}

/**
 * Validate every config file that exists in the resolution chain (or just the
 * explicit `--config` path). Used by the `--validate` inspection flag; reads
 * files but never mutates anything.
 */
export function validateConfigFiles(cliPath?: string): ConfigFileReport[] {
  const reports: ConfigFileReport[] = [];
  for (const { path } of candidatePaths(cliPath)) {
    if (!existsSync(path)) continue;
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(path, "utf8"));
    } catch (e) {
      reports.push({ path, ok: false, version: 0, issues: [`invalid JSON: ${(e as Error).message}`] });
      continue;
    }
    const result = validatePartialConfig(raw);
    reports.push({ path, ok: result.ok, version: result.version, issues: result.issues });
  }
  return reports;
}

export function loadConfig(flags: CliFlags = {}): Config {
  invalidConfigFiles = []; // reset per load; populated by readJson on bad/invalid files
  let cfg: Config = { ...DEFAULT_CONFIG };
  // Accumulate only the user's explicit color overrides, so we can apply them
  // on top of whichever theme ends up selected (theme < custom colors).
  const userColors: ThemeColors = {};
  for (const { path, trusted } of candidatePaths(flags.config)) {
    let partial = readJson(path);
    if (partial) {
      if (!trusted) partial = stripUnsafeWidgets(partial); // drop command/env widgets from repo-local config
      if (partial.colors) Object.assign(userColors, partial.colors);
      cfg = merge(cfg, partial);
    }
  }
  cfg = applyEnv(cfg);
  // Config profiles: activate a named snapshot (CLI > env > config.activeProfile),
  // merged over the base so a profile can flip lines/theme/preset in one switch.
  const profileName = flags.profile ?? process.env.CC_STATUS_DASH_PROFILE ?? cfg.activeProfile;
  if (profileName && cfg.profiles && cfg.profiles[profileName]) {
    const prof = cfg.profiles[profileName];
    if (prof.colors) Object.assign(userColors, prof.colors);
    cfg = merge(cfg, prof);
  }
  if (flags.theme) cfg.theme = flags.theme;
  if (flags.preset) cfg = merge(cfg, { preset: flags.preset });
  // Final palette = selected theme overlaid with the user's custom colors.
  cfg.colors = resolvePalette(cfg.theme, userColors);
  return cfg;
}
