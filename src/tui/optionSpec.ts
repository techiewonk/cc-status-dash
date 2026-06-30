import type { Config } from "../types.js";

// Pure, data-only specs that drive the TUI's option / global / color editors.
// Keeping them here (not in the Ink view) means the editor reducer is fully
// unit-testable. Mirrors ccstatusline's ItemsEditor / GlobalOverridesMenu /
// ColorMenu, adapted to our widget-option model.

export type FieldKind = "toggle" | "enum" | "number" | "text";

export interface FieldSpec {
  key: string;
  label: string;
  kind: FieldKind;
  choices?: readonly string[]; // for kind === "enum"
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
  ],
  cwd: [
    { key: "segments", label: "Path segments", kind: "number" },
    { key: "style", label: "Style", kind: "enum", choices: ["fish", "basename", "full"] },
    { key: "home", label: "Abbreviate home (~)", kind: "toggle" },
  ],
  "current-working-dir": [
    { key: "segments", label: "Path segments", kind: "number" },
    { key: "style", label: "Style", kind: "enum", choices: ["fish", "basename", "full"] },
    { key: "home", label: "Abbreviate home (~)", kind: "toggle" },
  ],
  "context.bar": [
    { key: "mode", label: "Mode", kind: "enum", choices: ["remaining", "used"] },
    { key: "barStyle", label: "Bar style", kind: "enum", choices: BAR_STYLES },
  ],
  "context-percentage-usable": [{ key: "autocompactBuffer", label: "Autocompact buffer", kind: "number" }],
  "context-percentage": [
    { key: "mode", label: "Mode", kind: "enum", choices: ["remaining", "used"] },
    { key: "barStyle", label: "Bar style", kind: "enum", choices: ["none", ...BAR_STYLES] },
  ],
  "usage.block": [
    { key: "mode", label: "Mode", kind: "enum", choices: ["used", "remaining"] },
    { key: "showPace", label: "Show pace", kind: "toggle" },
    { key: "barStyle", label: "Bar style", kind: "enum", choices: ["none", ...BAR_STYLES] },
    { key: "threshold", label: "Min % to show", kind: "number" },
  ],
  "usage.weekly": [
    { key: "mode", label: "Mode", kind: "enum", choices: ["used", "remaining"] },
    { key: "barStyle", label: "Bar style", kind: "enum", choices: ["none", ...BAR_STYLES] },
    { key: "threshold", label: "Min % to show", kind: "number" },
  ],
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
  ],
  budget: [
    { key: "amount", label: "Budget $", kind: "number" },
    { key: "warningThreshold", label: "Warn at %", kind: "number" },
    { key: "scope", label: "Scope", kind: "enum", choices: ["session", "today", "month"] },
  ],
  env: [{ key: "variable", label: "Env var name", kind: "text" }],
  "custom-text": [
    { key: "text", label: "Text", kind: "text" },
    { key: "prefix", label: "Prefix", kind: "text" },
  ],
  "custom-symbol": [{ key: "symbol", label: "Symbol", kind: "text" }],
  "custom-command": [{ key: "command", label: "Shell command", kind: "text" }],
  link: [
    { key: "url", label: "URL", kind: "text" },
    { key: "label", label: "Label", kind: "text" },
  ],
  "compaction-counter": [{ key: "hideWhenZero", label: "Hide when zero", kind: "toggle" }],
  "reset-timer": [{ key: "timestamp", label: "Show clock time", kind: "toggle" }, { key: "hoursOnly", label: "Hours only", kind: "toggle" }],
  "weekly-reset-timer": [{ key: "timestamp", label: "Show clock time", kind: "toggle" }, { key: "hoursOnly", label: "Hours only", kind: "toggle" }],
  "git-pr": [
    { key: "showStatus", label: "Show status", kind: "toggle" },
    { key: "showTitle", label: "Show title", kind: "toggle" },
  ],
};

/** Universal per-widget styling options — apply to EVERY widget instance (ccstatusline's
 * WidgetItemSchema parity: color/background/bold/dim/rawValue/merge). Appended to each
 * widget's option list so any widget can be individually styled. */
export const UNIVERSAL_OPTION_SPECS: FieldSpec[] = [
  { key: "color", label: "Color override", kind: "text" },
  { key: "bgColor", label: "Background", kind: "text" },
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
  { key: "globalBold", label: "Global bold", kind: "toggle" },
  { key: "autoWrap", label: "Auto-wrap to width", kind: "toggle" },
  { key: "padding", label: "Padding", kind: "number" },
  { key: "separator", label: "Separator", kind: "text" },
  { key: "powerlineSeparator", label: "Powerline separator", kind: "enum", choices: ["arrow", "round", "triangle", "flame", "pixel"] },
  { key: "refreshInterval", label: "Refresh interval (s)", kind: "number" },
];

/** Semantic color keys (ColorMenu). Each overrides the theme palette. */
export const COLOR_KEYS = [
  "model", "cwd", "git", "gitBranch", "context", "usage", "warning", "critical", "label", "paceGood", "paceBad",
] as const;

/** Format a config/option value for display in an editor row. */
export function displayValue(value: unknown, spec: FieldSpec): string {
  if (spec.kind === "toggle") return value ? "on" : "off";
  if (value == null || value === "") return spec.kind === "text" ? "(unset)" : "(default)";
  return String(value);
}

/** Read the current value of a global field from the config. */
export function globalValue(config: Config, key: string): unknown {
  return (config as unknown as Record<string, unknown>)[key];
}
