import * as v from "valibot";
import type { Config } from "../types.js";

// Runtime validation for user config files (`cc-status-dash.json`). Config files
// are *partial* overrides merged over DEFAULT_CONFIG, so every field here is
// optional — we only assert the *shape/type* of what the user did provide, then
// let `config/load.ts` merge it. Validation never throws into the render path:
// callers use `validatePartialConfig`, which returns issues instead of throwing.
//
// Mirrors ccstatusline's `Settings.ts` + `CURRENT_VERSION` idea (versioned config
// with migrations), but with valibot (≈10× smaller/faster than zod for a small
// CLI schema) per docs/DEPENDENCIES.md.

/** Bump when the config shape changes; add a step in `migrateConfig`. */
export const CURRENT_CONFIG_VERSION = 1;

const LineStyleSchema = v.picklist(["inline", "powerline", "capsule"]);
const CharsetSchema = v.picklist(["unicode", "text"]);
const ColorDepthSchema = v.picklist(["auto", "ansi", "ansi256", "truecolor", "none"]);
const ShowWhenSchema = v.picklist(["always", "activity"]);

// Widgets accept arbitrary, widget-specific options (e.g. `segments`, `mode`,
// `barStyle`, `threshold`). `looseObject` keeps unknown keys instead of stripping
// them, so per-widget options survive validation untouched.
const WidgetConfigSchema = v.looseObject({
  id: v.string("widget id must be a string"),
});

const LineConfigSchema = v.object({
  style: v.optional(LineStyleSchema),
  showWhen: v.optional(ShowWhenSchema),
  widgets: v.array(WidgetConfigSchema),
});

const ModelContextLimitsSchema = v.object({
  sonnet: v.optional(v.number()),
  opus: v.optional(v.number()),
  haiku: v.optional(v.number()),
  default: v.optional(v.number()),
});

/** Schema for a partial config file (all fields optional). */
export const PartialConfigSchema = v.looseObject({
  version: v.optional(v.number()),
  preset: v.optional(v.string()),
  charset: v.optional(CharsetSchema),
  theme: v.optional(v.string()),
  colorDepth: v.optional(ColorDepthSchema),
  refreshInterval: v.optional(v.pipe(v.number(), v.minValue(0))),
  separator: v.optional(v.string()),
  minimalist: v.optional(v.boolean()),
  globalBold: v.optional(v.boolean()),
  padding: v.optional(v.pipe(v.number(), v.minValue(0))),
  autoWrap: v.optional(v.boolean()),
  lines: v.optional(v.array(LineConfigSchema)),
  modelContextLimits: v.optional(ModelContextLimitsSchema),
  powerlineSeparator: v.optional(v.picklist(["arrow", "round", "triangle", "flame", "pixel"])),
  powerlineCaps: v.optional(v.picklist(["none", "round", "flame"])),
  overrideForeground: v.optional(v.string()),
  overrideBackground: v.optional(v.string()),
  colors: v.optional(v.record(v.string(), v.string())),
});

export type ValidationResult =
  | { ok: true; value: Partial<Config>; version: number; issues: [] }
  | { ok: false; value: null; version: number; issues: string[] };

/** Render a valibot issue path (e.g. `lines.0.widgets.2.id`). */
function pathString(issue: v.BaseIssue<unknown>): string {
  if (!issue.path) return "(root)";
  return issue.path.map((p) => String((p as { key?: unknown }).key ?? "")).join(".") || "(root)";
}

/**
 * Upgrade a raw parsed config object to the current version. Pure: returns a new
 * object, never mutates input. Unknown/missing version is treated as legacy (0).
 */
export function migrateConfig(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const cfg: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
  let version = typeof cfg.version === "number" ? cfg.version : 0;

  // v0 -> v1: introduced the `version` field. No structural changes yet; future
  // shape changes get their own `if (version < N)` step here.
  if (version < 1) version = 1;

  cfg.version = version;
  return cfg;
}

/**
 * Validate (and migrate) a raw parsed config file. Returns the typed partial on
 * success, or a list of human-readable issues on failure — never throws.
 */
export function validatePartialConfig(raw: unknown): ValidationResult {
  const migrated = migrateConfig(raw);
  const result = v.safeParse(PartialConfigSchema, migrated);
  const version =
    migrated && typeof migrated === "object" && typeof (migrated as { version?: unknown }).version === "number"
      ? (migrated as { version: number }).version
      : CURRENT_CONFIG_VERSION;
  if (result.success) {
    return { ok: true, value: result.output as Partial<Config>, version, issues: [] };
  }
  return {
    ok: false,
    value: null,
    version,
    issues: result.issues.map((i) => `${pathString(i)}: ${i.message}`),
  };
}
