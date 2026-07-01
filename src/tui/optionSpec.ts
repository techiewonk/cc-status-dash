import type { Config } from "../types.js";

// Pure, data-only specs that drive the TUI's option / global / color editors.
// Keeping them here (not in the Ink view) means the editor reducer is fully
// unit-testable. Mirrors ccstatusline's ItemsEditor / GlobalOverridesMenu /
// ColorMenu, adapted to our widget-option model.

export type FieldKind = "toggle" | "enum" | "number" | "text" | "color";

export interface FieldSpec {
  key: string;
  label: string;
  kind: FieldKind;
  choices?: readonly string[]; // for kind === "enum"
}

/** Curated palette the color picker cycles through with ←→. "" is unset; a custom
 * hex can still be typed. Values are valid for both our renderer (NAMED / hex) and
 * Ink's `<Text color>` swatch preview. */
export const COLOR_CHOICES = [
  "", "black", "red", "green", "yellow", "blue", "magenta", "cyan", "white", "gray",
  "#ff5555", "#50fa7b", "#f1fa8c", "#8be9fd", "#bd93f9", "#ffb86c",
] as const;

/** Ink-acceptable color for an in-frame swatch, or null when unset/unpreviewable.
 * Named base colors and hex pass through; numeric 256 / unknowns get no swatch. */
export function swatchColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (v === "" || v === "none" || v === "transparent") return null;
  if (v.startsWith("#")) return /^#[0-9a-fA-F]{6}$/.test(v) ? v : null;
  if (/^\d+$/.test(v)) return null; // ansi-256 index — Ink swatch can't render reliably
  // Only preview names Ink can safely resolve (our curated palette). Unknown names
  // still render/edit fine on the widget; they just don't get a swatch.
  return COLOR_CHOICES.includes(v as (typeof COLOR_CHOICES)[number]) ? v : null;
}

/** All progress-bar styles (keep in sync with render/bars.ts STYLES). */
export const BAR_STYLES = [
  "blocks", "bar", "line", "dots", "ball", "squares", "geometric", "filled", "capped", "blocks-line",
] as const;

/** Per-widget editable options. Widgets absent here have no options to edit. */
export const WIDGET_OPTION_SPECS: Record<string, FieldSpec[]> = {
  model: [
    { key: "show1M", label: "1M badge", kind: "toggle" },
    { key: "format", label: "Format", kind: "enum", choices: ["abbr", "name", "id", "version"] },
    { key: "override", label: "Manual override (custom proxy)", kind: "text" },
  ],
  cwd: [
    { key: "segments", label: "Path segments", kind: "number" },
    { key: "style", label: "Style", kind: "enum", choices: ["fish", "basename", "full"] },
    { key: "home", label: "Abbreviate home (~)", kind: "toggle" },
    { key: "link", label: "OSC-8 file:// link", kind: "toggle" },
  ],
  "current-working-dir": [
    { key: "segments", label: "Path segments", kind: "number" },
    { key: "style", label: "Style", kind: "enum", choices: ["fish", "basename", "full"] },
    { key: "home", label: "Abbreviate home (~)", kind: "toggle" },
    { key: "link", label: "OSC-8 file:// link", kind: "toggle" },
  ],
  "context.bar": [
    { key: "mode", label: "Mode", kind: "enum", choices: ["remaining", "used"] },
    { key: "barStyle", label: "Bar style", kind: "enum", choices: BAR_STYLES },
    { key: "barWidth", label: "Bar width (0=adaptive)", kind: "number" },
  ],
  "context-percentage-usable": [{ key: "autocompactBuffer", label: "Autocompact buffer", kind: "number" }],
  "context-percentage": [
    { key: "mode", label: "Mode", kind: "enum", choices: ["remaining", "used"] },
    { key: "value", label: "Value", kind: "enum", choices: ["percent", "tokens", "both"] },
    { key: "barStyle", label: "Bar style", kind: "enum", choices: ["none", ...BAR_STYLES] },
  ],
  "thinking-effort": [
    { key: "symbols", label: "Glyph (not word)", kind: "toggle" },
    { key: "default", label: "Fallback level", kind: "enum", choices: ["none", "low", "medium", "high", "max"] },
    { key: "showUnknown", label: "Show ? when unset", kind: "toggle" },
  ],
  cost: [{ key: "hideOnProvider", label: "Hide on Bedrock/Vertex", kind: "toggle" }],
  "session-cost": [{ key: "hideOnProvider", label: "Hide on Bedrock/Vertex", kind: "toggle" }],
  "usage.block": [
    { key: "mode", label: "Mode", kind: "enum", choices: ["used", "remaining"] },
    { key: "showPace", label: "Show pace", kind: "toggle" },
    { key: "usageCompact", label: "Compact (+ reset)", kind: "toggle" },
    { key: "barStyle", label: "Bar style", kind: "enum", choices: ["none", ...BAR_STYLES] },
    { key: "threshold", label: "Min % to show", kind: "number" },
  ],
  "usage.weekly": [
    { key: "mode", label: "Mode", kind: "enum", choices: ["used", "remaining"] },
    { key: "usageCompact", label: "Compact (+ reset)", kind: "toggle" },
    { key: "barStyle", label: "Bar style", kind: "enum", choices: ["none", ...BAR_STYLES] },
    { key: "threshold", label: "Min % to show", kind: "number" },
  ],
  "activity.mcp": [{ key: "max", label: "Max servers shown", kind: "number" }],
  "activity.tools": [{ key: "nameMax", label: "Max tool-name chars (0=off)", kind: "number" }],
  "activity.agents": [{ key: "descMax", label: "Max description chars (0=hide)", kind: "number" }],
  "activity.separator": [
    { key: "length", label: "Rule length", kind: "number" },
    { key: "glyph", label: "Rule glyph", kind: "text" },
  ],
  advisor: [{ key: "override", label: "Override label", kind: "text" }],
  "voice-status": [{ key: "format", label: "Format", kind: "enum", choices: ["icon", "text", "both"] }],
  "session-start-date": [{ key: "mode", label: "Mode", kind: "enum", choices: ["age", "date"] }],
  "added-dirs": [{ key: "max", label: "Max dirs shown", kind: "number" }],
  "session-usage": [
    { key: "mode", label: "Mode", kind: "enum", choices: ["used", "remaining"] },
    { key: "showPace", label: "Show pace", kind: "toggle" },
    { key: "barStyle", label: "Bar style", kind: "enum", choices: ["none", ...BAR_STYLES] },
  ],
  "weekly-usage": [
    { key: "mode", label: "Mode", kind: "enum", choices: ["used", "remaining"] },
    { key: "barStyle", label: "Bar style", kind: "enum", choices: ["none", ...BAR_STYLES] },
    { key: "threshold", label: "Min % to show", kind: "number" },
  ],
  "git.branch": [
    { key: "showDirty", label: "Show dirty marker", kind: "toggle" },
    { key: "showAheadBehind", label: "Ahead/behind", kind: "toggle" },
    { key: "showDiff", label: "Show +/- diff", kind: "toggle" },
    { key: "link", label: "OSC-8 hyperlink", kind: "toggle" },
    { key: "hideNoRemote", label: "Hide if no remote", kind: "toggle" },
  ],
  "git-ahead-behind": [
    { key: "pushWarnThreshold", label: "Warn at N ahead", kind: "number" },
    { key: "pushCritThreshold", label: "Critical at N ahead", kind: "number" },
  ],
  "git.files": [{ key: "max", label: "Max files shown", kind: "number" }],
  "burn-rate": [{ key: "mode", label: "Mode", kind: "enum", choices: ["wall", "active"] }],
  "skills": [{ key: "mode", label: "Mode", kind: "enum", choices: ["count", "last", "list"] }],
  "cache-timer": [{ key: "ttlSeconds", label: "Cache TTL (s)", kind: "number" }],
  "session-clock": [
    { key: "hour12", label: "12-hour clock", kind: "toggle" },
    { key: "timezone", label: "Timezone (IANA)", kind: "text" },
  ],
  "activity.tool-counts": [
    { key: "max", label: "Max tools shown", kind: "number" },
    { key: "nameMax", label: "Max tool-name chars (0=off)", kind: "number" },
  ],
  "token-breakdown": [{ key: "threshold", label: "Min context %", kind: "number" }],
  "cache-roi": [{ key: "savedPerMTok", label: "$ saved / 1M tok", kind: "number" }],
  "provider": [
    { key: "showApi", label: "Show API label", kind: "toggle" },
    { key: "override", label: "Manual override (custom proxy)", kind: "text" },
  ],
  budget: [
    { key: "amount", label: "Budget $", kind: "number" },
    { key: "warningThreshold", label: "Warn at %", kind: "number" },
    { key: "scope", label: "Scope", kind: "enum", choices: ["session", "today", "month", "block"] },
  ],
  env: [{ key: "variable", label: "Env var name", kind: "text" }],
  "custom-text": [
    { key: "text", label: "Text", kind: "text" },
    { key: "prefix", label: "Prefix", kind: "text" },
  ],
  "custom-symbol": [{ key: "symbol", label: "Symbol", kind: "text" }],
  "custom-command": [
    { key: "command", label: "Shell command", kind: "text" },
    { key: "timeout", label: "Timeout (ms)", kind: "number" },
    { key: "preserveColors", label: "Preserve command's own ANSI colors", kind: "toggle" },
  ],
  "flex-separator": [{ key: "fill", label: "Fill glyph (inline lines)", kind: "text" }],
  link: [
    { key: "url", label: "URL", kind: "text" },
    { key: "label", label: "Label", kind: "text" },
  ],
  "compaction-counter": [
    { key: "hideWhenZero", label: "Hide when zero", kind: "toggle" },
    { key: "showTriggers", label: "Show auto/manual split", kind: "toggle" },
    { key: "showReclaimed", label: "Show tokens reclaimed", kind: "toggle" },
  ],
  "reset-timer": [
    { key: "timeFormat", label: "Time format", kind: "enum", choices: ["relative", "absolute", "both", "elapsed", "elapsedAndAbsolute"] },
    { key: "timestamp", label: "Show clock time", kind: "toggle" },
    { key: "hoursOnly", label: "Hours only", kind: "toggle" },
    { key: "hour12", label: "12-hour clock", kind: "toggle" },
    { key: "timezone", label: "Timezone (IANA)", kind: "text" },
  ],
  "weekly-reset-timer": [
    { key: "timeFormat", label: "Time format", kind: "enum", choices: ["relative", "absolute", "both", "elapsed", "elapsedAndAbsolute"] },
    { key: "timestamp", label: "Show clock time", kind: "toggle" },
    { key: "hoursOnly", label: "Hours only", kind: "toggle" },
    { key: "hour12", label: "12-hour clock", kind: "toggle" },
    { key: "timezone", label: "Timezone (IANA)", kind: "text" },
  ],
  "git-pr": [
    { key: "showStatus", label: "Show status", kind: "toggle" },
    { key: "showTitle", label: "Show title", kind: "toggle" },
  ],
  "external-usage": [
    { key: "path", label: "JSON file path", kind: "text" },
    { key: "label", label: "Label", kind: "text" },
    { key: "mode", label: "Mode", kind: "enum", choices: ["used", "remaining"] },
    { key: "barStyle", label: "Bar style", kind: "enum", choices: ["none", ...BAR_STYLES] },
    { key: "maxAgeMs", label: "Max age (ms)", kind: "number" },
  ],
};

/** Universal per-widget styling options — apply to EVERY widget instance (ccstatusline's
 * WidgetItemSchema parity: color/background/bold/dim/rawValue/merge). Appended to each
 * widget's option list so any widget can be individually styled. */
export const UNIVERSAL_OPTION_SPECS: FieldSpec[] = [
  { key: "color", label: "Color override", kind: "color" },
  { key: "bgColor", label: "Background", kind: "color" },
  { key: "bold", label: "Bold", kind: "toggle" },
  { key: "dim", label: "Dim", kind: "toggle" },
  { key: "rawValue", label: "Raw (drop label)", kind: "toggle" },
  { key: "merge", label: "Merge w/ next (no sep)", kind: "toggle" },
  { key: "maxWidth", label: "Max width (truncate)", kind: "number" },
];

/** Full editable field list for a widget = its specific options + the universal ones. */
export function widgetFields(id: string): FieldSpec[] {
  return [...(WIDGET_OPTION_SPECS[id] ?? []), ...UNIVERSAL_OPTION_SPECS];
}

/** Global config settings (ccstatusline's GlobalOverridesMenu). Theme/preset live on the layout screen. */
export const GLOBAL_FIELD_SPECS: FieldSpec[] = [
  { key: "charset", label: "Charset", kind: "enum", choices: ["unicode", "text"] },
  { key: "colorDepth", label: "Color depth", kind: "enum", choices: ["auto", "ansi", "ansi256", "truecolor", "none"] },
  { key: "minimalist", label: "Minimalist (no labels)", kind: "toggle" },
  { key: "icons", label: "Show widget icons", kind: "toggle" },
  { key: "globalBold", label: "Global bold", kind: "toggle" },
  { key: "autoWrap", label: "Auto-wrap to width", kind: "toggle" },
  { key: "flexMode", label: "Flex width mode", kind: "enum", choices: ["full", "full-minus-40", "full-until-compact"] },
  { key: "compactThreshold", label: "Compact threshold %", kind: "number" },
  { key: "gitCacheTtlSeconds", label: "Git cache TTL (s)", kind: "number" },
  { key: "padding", label: "Padding", kind: "number" },
  { key: "separator", label: "Separator", kind: "text" },
  { key: "powerlineSeparator", label: "Powerline separator", kind: "enum", choices: ["arrow", "round", "triangle", "flame", "pixel"] },
  { key: "powerlineCaps", label: "Powerline caps", kind: "enum", choices: ["none", "round", "flame"] },
  { key: "inheritSeparatorColors", label: "Inherit separator colors", kind: "toggle" },
  { key: "overrideForeground", label: "Override FG (all)", kind: "text" },
  { key: "overrideBackground", label: "Override BG (all)", kind: "text" },
  { key: "refreshInterval", label: "Refresh interval (s)", kind: "number" },
];

/** Semantic color keys (ColorMenu). Each overrides the theme palette. */
export const COLOR_KEYS = [
  "model", "cwd", "git", "gitBranch", "context", "usage", "warning", "critical", "label", "paceGood", "paceBad",
] as const;

/** Format a config/option value for display in an editor row. */
export function displayValue(value: unknown, spec: FieldSpec): string {
  if (spec.kind === "toggle") return value ? "on" : "off";
  if (value == null || value === "")
    return spec.kind === "text" || spec.kind === "color" ? "(unset)" : "(default)";
  return String(value);
}

/** Read the current value of a global field from the config. */
export function globalValue(config: Config, key: string): unknown {
  return (config as unknown as Record<string, unknown>)[key];
}
