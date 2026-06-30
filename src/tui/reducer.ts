import type { Config, LineStyle } from "../types.js";
import {
  addLine,
  addWidget,
  applyPreset,
  cloneWidget,
  moveWidget,
  removeLine,
  removeWidget,
  setColor,
  setGlobal,
  setLineStyle,
  setTheme,
  setWidgetOption,
} from "../config/mutations.js";
import {
  COLOR_KEYS,
  GLOBAL_FIELD_SPECS,
  globalValue,
  widgetFields,
  type FieldSpec,
} from "./optionSpec.js";

// Pure editor state machine for the Ink TUI. Keeping all edits here (driven by
// the tested mutations engine) means the Ink view is a thin render layer and the
// behavior is fully unit-testable without a terminal.
//
// The editor is multi-screen (ccstatusline parity): the "layout" screen manages
// lines/widgets; "options" edits the selected widget's options; "global" edits
// global settings; "colors" overrides the theme palette.

export type Screen = "layout" | "options" | "global" | "colors";

export interface Cursor {
  line: number;
  widget: number;
}
export interface EditorState {
  config: Config;
  cursor: Cursor;
  screen: Screen;
  field: number; // selected row on the options/global/colors screens
}

export type Action =
  | { type: "up" }
  | { type: "down" }
  | { type: "left" }
  | { type: "right" }
  | { type: "addWidget"; id: string }
  | { type: "deleteWidget" }
  | { type: "cloneWidget" }
  | { type: "moveLeft" }
  | { type: "moveRight" }
  | { type: "addLine" }
  | { type: "removeLine" }
  | { type: "cycleStyle" }
  | { type: "cycleTheme"; themes: string[] }
  | { type: "setPreset"; id: string }
  // ---- multi-screen editing ----
  | { type: "openScreen"; screen: Screen }
  | { type: "back" }
  | { type: "fieldUp" }
  | { type: "fieldDown" }
  | { type: "fieldAdjust"; dir: 1 | -1 }
  | { type: "fieldType"; input: string }
  | { type: "fieldBackspace" }
  | { type: "fieldReset" };

const STYLES: LineStyle[] = ["inline", "powerline", "capsule"];

function clampCursor(config: Config, c: Cursor): Cursor {
  const line = Math.max(0, Math.min(c.line, config.lines.length - 1));
  const count = config.lines[line]?.widgets.length ?? 0;
  const widget = Math.max(0, Math.min(c.widget, Math.max(0, count - 1)));
  return { line, widget };
}

export function initialState(config: Config): EditorState {
  return { config, cursor: { line: 0, widget: 0 }, screen: "layout", field: 0 };
}

/** Field specs for the active editing screen (empty on the layout screen). */
export function fieldsFor(state: EditorState): FieldSpec[] {
  switch (state.screen) {
    case "options": {
      const wc = state.config.lines[state.cursor.line]?.widgets[state.cursor.widget];
      return wc ? widgetFields(wc.id) : [];
    }
    case "global":
      return GLOBAL_FIELD_SPECS;
    case "colors":
      return COLOR_KEYS.map((key) => ({ key, label: key, kind: "text" as const }));
    default:
      return [];
  }
}

/** Current value of a field on the active screen. */
export function fieldValue(state: EditorState, spec: FieldSpec): unknown {
  switch (state.screen) {
    case "options":
      return state.config.lines[state.cursor.line]?.widgets[state.cursor.widget]?.[spec.key];
    case "global":
      return globalValue(state.config, spec.key);
    case "colors":
      return state.config.colors[spec.key];
    default:
      return undefined;
  }
}

/** Write a value for the active field through the right mutation. */
function writeField(state: EditorState, spec: FieldSpec, value: unknown): Config {
  switch (state.screen) {
    case "options":
      return setWidgetOption(state.config, state.cursor.line, state.cursor.widget, spec.key, value);
    case "global":
      return setGlobal(state.config, spec.key as keyof Config, value as Config[keyof Config]);
    case "colors":
      return setColor(state.config, spec.key, value == null ? "" : String(value));
    default:
      return state.config;
  }
}

function adjust(state: EditorState, dir: 1 | -1): EditorState {
  const fields = fieldsFor(state);
  const spec = fields[state.field];
  if (!spec) return state;
  const cur = fieldValue(state, spec);
  let next: unknown;
  if (spec.kind === "toggle") {
    next = !cur;
  } else if (spec.kind === "enum" && spec.choices) {
    const i = spec.choices.indexOf(String(cur));
    const len = spec.choices.length;
    next = spec.choices[(((i < 0 ? 0 : i) + dir) % len + len) % len];
  } else if (spec.kind === "number") {
    next = Math.max(0, (typeof cur === "number" ? cur : Number(cur) || 0) + dir);
  } else {
    return state; // text fields don't adjust with arrows
  }
  return { ...state, config: writeField(state, spec, next) };
}

function typeInto(state: EditorState, input: string): EditorState {
  const fields = fieldsFor(state);
  const spec = fields[state.field];
  if (!spec) return state;
  const cur = fieldValue(state, spec);
  if (spec.kind === "number") {
    if (!/^\d$/.test(input)) return state;
    const next = Number(`${typeof cur === "number" ? cur : ""}${input}`);
    return { ...state, config: writeField(state, spec, next) };
  }
  if (spec.kind === "text") {
    return { ...state, config: writeField(state, spec, `${cur == null ? "" : String(cur)}${input}`) };
  }
  return state;
}

function backspace(state: EditorState): EditorState {
  const fields = fieldsFor(state);
  const spec = fields[state.field];
  if (!spec || (spec.kind !== "text" && spec.kind !== "number")) return state;
  const cur = fieldValue(state, spec);
  const s = cur == null ? "" : String(cur);
  const trimmed = s.slice(0, -1);
  const value = spec.kind === "number" ? (trimmed === "" ? 0 : Number(trimmed)) : trimmed;
  return { ...state, config: writeField(state, spec, value) };
}

export function reduce(state: EditorState, action: Action): EditorState {
  const { config, cursor } = state;
  const line = config.lines[cursor.line];

  // ---- field-editing screens ----
  if (state.screen !== "layout") {
    const fields = fieldsFor(state);
    switch (action.type) {
      case "back":
        return { ...state, screen: "layout", field: 0 };
      case "fieldUp":
        return { ...state, field: Math.max(0, state.field - 1) };
      case "fieldDown":
        return { ...state, field: Math.min(Math.max(0, fields.length - 1), state.field + 1) };
      case "fieldAdjust":
        return adjust(state, action.dir);
      case "fieldType":
        return typeInto(state, action.input);
      case "fieldBackspace":
        return backspace(state);
      case "fieldReset": {
        const spec = fields[state.field];
        return spec ? { ...state, config: writeField(state, spec, undefined) } : state;
      }
      // allow jumping straight between editor screens
      case "openScreen":
        return { ...state, screen: action.screen, field: 0 };
      default:
        return state;
    }
  }

  // ---- layout screen ----
  switch (action.type) {
    case "openScreen":
      return { ...state, screen: action.screen, field: 0 };
    case "up":
      return { ...state, cursor: clampCursor(config, { ...cursor, line: cursor.line - 1 }) };
    case "down":
      return { ...state, cursor: clampCursor(config, { ...cursor, line: cursor.line + 1 }) };
    case "left":
      return { ...state, cursor: clampCursor(config, { ...cursor, widget: cursor.widget - 1 }) };
    case "right":
      return { ...state, cursor: clampCursor(config, { ...cursor, widget: cursor.widget + 1 }) };
    case "addWidget": {
      const next = addWidget(config, cursor.line, action.id, cursor.widget + 1);
      return { ...state, config: next, cursor: clampCursor(next, { ...cursor, widget: cursor.widget + 1 }) };
    }
    case "deleteWidget": {
      const next = removeWidget(config, cursor.line, cursor.widget);
      return { ...state, config: next, cursor: clampCursor(next, cursor) };
    }
    case "cloneWidget": {
      const next = cloneWidget(config, cursor.line, cursor.widget);
      return { ...state, config: next, cursor: clampCursor(next, { ...cursor, widget: cursor.widget + 1 }) };
    }
    case "moveLeft": {
      const next = moveWidget(config, cursor.line, cursor.widget, cursor.widget - 1);
      return { ...state, config: next, cursor: clampCursor(next, { ...cursor, widget: cursor.widget - 1 }) };
    }
    case "moveRight": {
      const next = moveWidget(config, cursor.line, cursor.widget, cursor.widget + 1);
      return { ...state, config: next, cursor: clampCursor(next, { ...cursor, widget: cursor.widget + 1 }) };
    }
    case "addLine": {
      const next = addLine(config, "inline");
      return { ...state, config: next, cursor: clampCursor(next, { line: next.lines.length - 1, widget: 0 }) };
    }
    case "removeLine": {
      const next = removeLine(config, cursor.line);
      return { ...state, config: next, cursor: clampCursor(next, cursor) };
    }
    case "cycleStyle": {
      if (!line) return state;
      const cur = line.style ?? "inline";
      const nextStyle = STYLES[(STYLES.indexOf(cur) + 1) % STYLES.length];
      return { ...state, config: setLineStyle(config, cursor.line, nextStyle) };
    }
    case "cycleTheme": {
      if (action.themes.length === 0) return state;
      const i = action.themes.indexOf(config.theme);
      const nextTheme = action.themes[(i + 1) % action.themes.length];
      return { ...state, config: setTheme(config, nextTheme) };
    }
    case "setPreset": {
      const next = applyPreset(config, action.id);
      return { ...state, config: next, cursor: clampCursor(next, { line: 0, widget: 0 }) };
    }
    default:
      return state;
  }
}
