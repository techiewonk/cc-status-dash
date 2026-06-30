import type { Config, LineStyle, WidgetConfig } from "../types.js";
import { PRESET_LINES, MAX_LAYERS } from "./defaults.js";

// Pure config-mutation engine. These functions are what the Ink TUI (and the
// /configure flow) drive — kept side-effect-free so they are trivially testable
// and the UI layer stays thin. Every function returns a new Config.

function clone(config: Config): Config {
  return { ...config, colors: { ...config.colors }, lines: config.lines.map((l) => ({ ...l, widgets: l.widgets.map((w) => ({ ...w })) })) };
}

export function addLine(config: Config, style: LineStyle = "inline"): Config {
  if (config.lines.length >= MAX_LAYERS) return config;
  const c = clone(config);
  c.lines.push({ style, widgets: [] });
  c.preset = "custom";
  return c;
}
export function removeLine(config: Config, lineIdx: number): Config {
  if (lineIdx < 0 || lineIdx >= config.lines.length) return config;
  const c = clone(config);
  c.lines.splice(lineIdx, 1);
  c.preset = "custom";
  return c;
}
export function setLineStyle(config: Config, lineIdx: number, style: LineStyle): Config {
  if (!config.lines[lineIdx]) return config;
  const c = clone(config);
  c.lines[lineIdx].style = style;
  c.preset = "custom";
  return c;
}
export function addWidget(config: Config, lineIdx: number, widgetId: string, at?: number): Config {
  if (!config.lines[lineIdx]) return config;
  const c = clone(config);
  const ws = c.lines[lineIdx].widgets;
  const item: WidgetConfig = { id: widgetId };
  ws.splice(at ?? ws.length, 0, item);
  c.preset = "custom";
  return c;
}
export function removeWidget(config: Config, lineIdx: number, widgetIdx: number): Config {
  if (!config.lines[lineIdx]?.widgets[widgetIdx]) return config;
  const c = clone(config);
  c.lines[lineIdx].widgets.splice(widgetIdx, 1);
  c.preset = "custom";
  return c;
}
export function cloneWidget(config: Config, lineIdx: number, widgetIdx: number): Config {
  const src = config.lines[lineIdx]?.widgets[widgetIdx];
  if (!src) return config;
  const c = clone(config);
  c.lines[lineIdx].widgets.splice(widgetIdx + 1, 0, { ...src });
  c.preset = "custom";
  return c;
}
export function moveWidget(config: Config, lineIdx: number, from: number, to: number): Config {
  const ws = config.lines[lineIdx]?.widgets;
  if (!ws || from < 0 || from >= ws.length || to < 0 || to >= ws.length) return config;
  const c = clone(config);
  const [item] = c.lines[lineIdx].widgets.splice(from, 1);
  c.lines[lineIdx].widgets.splice(to, 0, item);
  c.preset = "custom";
  return c;
}
export function setWidgetOption(config: Config, lineIdx: number, widgetIdx: number, key: string, value: unknown): Config {
  if (!config.lines[lineIdx]?.widgets[widgetIdx]) return config;
  const c = clone(config);
  c.lines[lineIdx].widgets[widgetIdx][key] = value;
  c.preset = "custom";
  return c;
}
export function applyPreset(config: Config, presetId: string): Config {
  const lines = PRESET_LINES[presetId];
  if (!lines) return config;
  const c = clone(config);
  c.preset = presetId;
  c.lines = lines.map((l) => ({ ...l, widgets: l.widgets.map((w) => ({ ...w })) }));
  return c;
}
export function setTheme(config: Config, theme: string): Config {
  return { ...clone(config), theme };
}
export function setGlobal<K extends keyof Config>(config: Config, key: K, value: Config[K]): Config {
  return { ...clone(config), [key]: value };
}
/** Override a single semantic color key (empty string clears it back to the theme). */
export function setColor(config: Config, key: string, value: string): Config {
  const c = clone(config);
  if (value === "") delete c.colors[key];
  else c.colors[key] = value;
  return c;
}
